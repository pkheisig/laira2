"""
Chat Routes Module for LAIRA.

Handles chat interactions, retrieving context from vector store, and generating responses.
"""

import os
import logging
from flask import request, jsonify, current_app
import json
import time
import openai

# Import ChatEngine (ensure it's accessible)
from src.core.chat_engine import ChatEngine

# Import necessary components
from src.core.text_processing.vector_store import VectorStore
from src.core.text_processing.text_embedder import TextEmbedder
from src.core.llm.gemini_client import GeminiClient
from src.routes.chat_helpers import (
    get_chat_history_path,
    get_or_create_chat_session,
    format_context,
    build_prompt,
    CONTEXT_TOKEN_LIMIT,
    MAX_QUERY_RESULTS
)
from src.routes.settings_routes import get_settings_path

from src.routes.chat_blueprint import chat_bp
# Logger for chat routes
logger = logging.getLogger(__name__)

@chat_bp.route('/chat/<project_id>', methods=['POST'])
def handle_chat(project_id):
    """Handles incoming chat messages for a specific project."""
    data = request.json
    # Load project-specific chat settings
    try:
        settings_file = get_settings_path(project_id)
        with open(settings_file, 'r') as sf:
            settings_data = json.load(sf)
        chat_settings = settings_data.get('chat_settings', {})
    except Exception:
        chat_settings = {}
    # Get optional displayText for summary so original aiPrompt stays hidden in history
    display_text = data.get('displayText')
    if not data or 'query' not in data:
        # Return a client-safe response instead of HTTP error
        return jsonify({"response": "Error: Missing query in request body."}), 200

    user_query = data['query']
    logger.info(f"Received chat query for project {project_id}: '{user_query[:100]}...'" )

    # Enforce summary max tokens for summary requests
    if display_text:
        chat_settings['max_output_tokens'] = 200

    try:
        # Fallback to OpenAI if Google key not set
        api_key_google = current_app.config.get('GOOGLE_API_KEY')
        api_key_openai = os.environ.get('OPENAI_API_KEY')
        if not api_key_google and api_key_openai:
            openai.api_key = api_key_openai
            resp = openai.ChatCompletion.create(
                model="gpt-3.5-turbo",
                messages=[{"role": "system", "content": "You are an AI assistant."}, {"role":"user","content": user_query}],
                temperature=chat_settings.get('temperature', 0.2),
                top_p=chat_settings.get('top_p', 0.95),
                max_tokens=chat_settings.get('max_output_tokens', 500)
            )
            answer = resp.choices[0].message.content
            # Save chat messages to history.json for OpenAI fallback
            HISTORY_FILE = get_chat_history_path(project_id)
            try:
                if os.path.exists(HISTORY_FILE):
                    with open(HISTORY_FILE, 'r') as f:
                        history = json.load(f)
                else:
                    history = []
                timestamp = time.time()
                # Use display_text if provided to hide actual prompt
                user_content = display_text if display_text else user_query
                history.append({"role": "user", "content": user_content, "timestamp": timestamp})
                history.append({"role": "assistant", "content": answer, "timestamp": timestamp + 0.001})
                with open(HISTORY_FILE, 'w') as f:
                    json.dump(history, f, indent=2)
            except Exception as history_err:
                logger.warning(f"Warning: Failed to save chat history (fallback): {history_err}")
            return jsonify({"response": answer}), 200

        if not api_key_google:
            logger.error("Google API Key not configured in Flask app.")
            # Respond with client-safe message within 200 status to avoid HTTP 500
            return jsonify({"response": "Server configuration error: Missing API Key."}), 200
            
        # 2. Initialize Components
        # --- VectorStore --- 
        project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
        vector_store_path = os.path.join(project_upload_folder, "database")
        vector_store_config = {
            "persist_directory": vector_store_path,
            "project_id": project_id, 
            # Use default collection name convention or pass explicitly if needed
            "collection_name": f"project_{project_id}" 
        }
        vector_store = VectorStore(vector_store_config=vector_store_config)
        logger.debug(f"Initialized VectorStore for project {project_id} at {vector_store_path}")

        # --- TextEmbedder --- 
        # Use default config for consistency with processing
        # Ensure GOOGLE_API_KEY is available for the embedder as well
        embedder_config = {"api_key": api_key_google} 
        embedder = TextEmbedder(embedding_config=embedder_config)
        logger.debug("Initialized TextEmbedder.")
        
        # --- GeminiClient --- 
        gemini_client = GeminiClient(api_key=api_key_google)
        logger.debug("Initialized GeminiClient.")
        
        # 3. Generate query embedding
        logger.debug(f"Generating embedding for query: '{user_query[:50]}...'")
        # TextEmbedder.generate_embedding expects a TextChunk, let's adapt
        # Option 1: Modify TextEmbedder to have a simple text embedding method
        # Option 2: Create a dummy TextChunk (simpler for now)
        from src.core.text_processing.text_chunker import TextChunk # Temp import
        query_chunk = TextChunk(text=user_query, metadata={})
        query_embedding = embedder.generate_embedding(query_chunk) 
        
        if not query_embedding:
             logger.error(f"Failed to generate embedding for query: {embedder.last_error}")
             # Return error message to client without HTTP 500
             return jsonify({"response": "Error: Failed to process query embedding."}), 200
        logger.debug(f"Generated query embedding. Dimension: {len(query_embedding)}")

        # 4. Query VectorStore
        logger.debug(f"Querying vector store for project {project_id}...")
        search_results = vector_store.query_embeddings(
            query_embedding=query_embedding, 
            n_results=MAX_QUERY_RESULTS, 
            collection_name=vector_store.collection_name # Use the initialized collection
        )
        logger.info(f"Retrieved {len(search_results)} results from vector store.")
        
        # 5. Format Context
        context_str = format_context(search_results)
        logger.debug(f"Formatted context string (length: {len(context_str)}). Preview: {context_str[:200]}...")
        
        # 6. Build Prompt
        final_prompt = build_prompt(user_query, context_str)
        logger.debug(f"Constructed final prompt (length: {len(final_prompt)}). Preview: {final_prompt[:200]}...")

        # 7. Call GeminiClient using generate_response to ensure settings are applied
        try:
            gemini_response = gemini_client.generate_response(
                final_prompt,
                temperature=chat_settings.get('temperature'),
                top_p=chat_settings.get('top_p'),
                max_output_tokens=chat_settings.get('max_output_tokens')
            )
        except Exception as e:
            logger.warning(f"Gemini generate_response failed ({e}). Falling back to default.")
            # Fallback without settings
            gemini_response = gemini_client.generate_response(final_prompt)

        # Save chat messages to history.json
        HISTORY_FILE = get_chat_history_path(project_id)
        try:
            if os.path.exists(HISTORY_FILE):
                with open(HISTORY_FILE, 'r') as f:
                    history = json.load(f)
            else:
                history = []
            timestamp = time.time()
            # Use display_text if provided
            user_content = display_text if display_text else user_query
            history.append({"role": "user", "content": user_content, "timestamp": timestamp})
            history.append({"role": "assistant", "content": gemini_response, "timestamp": timestamp + 0.001})
            with open(HISTORY_FILE, 'w') as f:
                json.dump(history, f, indent=2)
        except Exception as history_err:
            logger.warning(f"Warning: Failed to save chat history: {history_err}")
        
        logger.info(f"Successfully generated Gemini response. Length: {len(gemini_response)}")
        return jsonify({"response": gemini_response}), 200

    except Exception as e:
        logger.error(f"Error handling chat request for project {project_id}: {repr(e)}", exc_info=True)
        # Return error message in standard response structure to avoid HTTP 500
        return jsonify({"response": "Error: Internal server error processing chat request."}), 200 

# Register additional chat routes (ask, reset, history) after chat_bp is defined
# import src.routes.chat_extra_routes 