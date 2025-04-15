"""
Chat Routes Module for LAIRA.

Handles chat interactions, retrieving context from vector store, and generating responses.
"""

import os
import logging
from flask import Blueprint, request, jsonify, current_app
import json
import time

# Import ChatEngine (ensure it's accessible)
from src.core.chat_engine import ChatEngine

# Import necessary components
from src.core.text_processing.vector_store import VectorStore
from src.core.text_processing.text_embedder import TextEmbedder
from src.core.llm.gemini_client import GeminiClient

chat_bp = Blueprint('chat_bp', __name__)
logger = logging.getLogger(__name__)

# --- Constants --- 
CONTEXT_TOKEN_LIMIT = 3000  # Adjust based on model and desired context length
MAX_QUERY_RESULTS = 5

# Helper to get chat history path
def get_chat_history_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    return os.path.join(project_folder, 'chat_history', 'history.json')

# Helper to get or create chat session
def get_or_create_chat_session(project_id):
    if not hasattr(current_app, 'chat_sessions'):
        current_app.chat_sessions = {}
        
    if project_id not in current_app.chat_sessions:
        project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
        database_folder = os.path.join(project_folder, 'database')
        chat_history_folder = os.path.join(project_folder, 'chat_history')
        os.makedirs(chat_history_folder, exist_ok=True)
        os.makedirs(database_folder, exist_ok=True)
        
        chat_config = {
            "project_id": project_id,
            "n_results": 8,
            "temperature": 0.2,
            "persist_directory": database_folder,
            "chat_history_path": chat_history_folder,
        }
        current_app.chat_sessions[project_id] = ChatEngine(chat_config)
        print(f"Created new chat session for project: {project_id}")
        
        # Ensure history file exists
        chat_history_file = get_chat_history_path(project_id)
        if not os.path.exists(chat_history_file):
            with open(chat_history_file, 'w') as f: json.dump([], f)
                
    return current_app.chat_sessions[project_id]

def format_context(results: list) -> str:
    """Formats retrieved documents into a single string for the prompt."""
    context_str = """
Relevant Information:
"""
    token_count = 0
    included_count = 0
    
    for result in results:
        text = result.get('text', '')
        # Simple token estimation (split by space)
        result_tokens = len(text.split())
        
        if token_count + result_tokens <= CONTEXT_TOKEN_LIMIT:
            context_str += f"\n---\nSource: {result.get('metadata', {}).get('filename', 'Unknown')}\nContent:\n{text}\n---\n"
            token_count += result_tokens
            included_count += 1
        else:
            logger.warning(f"Context token limit ({CONTEXT_TOKEN_LIMIT}) reached. Included {included_count} results.")
            break # Stop adding context if limit exceeded
            
    return context_str

def build_prompt(query: str, context: str) -> str:
    """Constructs the final prompt for the Gemini model."""
    # Basic RAG prompt structure
    prompt = f"""You are an AI assistant knowledgeable about the provided documents.
Answer the following question based *only* on the relevant information provided below.
If the information is not present in the context, say you don't have enough information.

{context}

Question: {query}

Answer:"""
    return prompt

@chat_bp.route('/chat/<project_id>', methods=['POST'])
def handle_chat(project_id):
    """Handles incoming chat messages for a specific project."""
    data = request.json
    if not data or 'query' not in data:
        return jsonify({"error": "Missing query in request body"}), 400

    user_query = data['query']
    logger.info(f"Received chat query for project {project_id}: '{user_query[:100]}...'") # Log truncated query

    try:
        # 1. Get API Key from Config
        api_key = current_app.config.get('GOOGLE_API_KEY')
        if not api_key:
            logger.error("Google API Key not configured in Flask app.")
            return jsonify({"error": "Server configuration error: Missing API Key."}), 500
            
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
        embedder_config = {"api_key": api_key} 
        embedder = TextEmbedder(embedding_config=embedder_config)
        logger.debug("Initialized TextEmbedder.")
        
        # --- GeminiClient --- 
        gemini_client = GeminiClient(api_key=api_key)
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
             return jsonify({"error": "Failed to process query embedding."}), 500
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

        # 7. Call GeminiClient
        gemini_response = gemini_client.generate_response(final_prompt)
        
        # Check for errors from GeminiClient (e.g., safety blocks)
        if gemini_response.startswith("Error:"):
             logger.warning(f"Gemini response indicates an error: {gemini_response}")
             # Return the error message directly to the user
             return jsonify({"response": gemini_response}), 200 

        # 8. Return response
        logger.info(f"Successfully generated Gemini response. Length: {len(gemini_response)}")
        return jsonify({"response": gemini_response}), 200

    except Exception as e:
        logger.error(f"Error handling chat request for project {project_id}: {repr(e)}", exc_info=True)
        return jsonify({"error": "Internal server error processing chat request."}), 500

@chat_bp.route('/ask/<project_id>', methods=['POST'])
# @limiter.limit("60 per minute") # Rate limiting commented out
def ask_question_route(project_id):
    """Handles user questions for a specific project using Gemini."""
    data = request.get_json()
    question = data.get('question')
    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        chat_engine = get_or_create_chat_session(project_id)
        response = chat_engine.ask(question)
        
        # Save chat history
        chat_history_file = get_chat_history_path(project_id)
        try:
            if os.path.exists(chat_history_file):
                with open(chat_history_file, 'r') as f: history = json.load(f)
            else: history = []
            
            timestamp = time.time()
            history.append({"role": "user", "content": question, "timestamp": timestamp})
            history.append({
                "role": "assistant", 
                "content": response.get("answer", ""), 
                "sources": response.get("sources", []),
                "timestamp": timestamp + 0.001
            })
            
            with open(chat_history_file, 'w') as f: json.dump(history, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save chat history: {e}")
        
        return jsonify(response), 200
    
    except Exception as e:
        print(f"Error processing question: {e}")
        # Log the full exception for debugging
        # import traceback
        # traceback.print_exc()
        return jsonify({
            "answer": "Error processing question. Please check logs.",
            "success": False,
            "error": str(e)
        }), 500

@chat_bp.route('/reset-chat/<project_id>', methods=['POST'])
# @limiter.limit("5 per hour") # Rate limiting commented out
def reset_chat_route(project_id):
    """Resets the conversation history for a specific project."""
    try:
        if hasattr(current_app, 'chat_sessions') and project_id in current_app.chat_sessions:
            current_app.chat_sessions[project_id].reset_conversation()
            # Optionally delete the session: del current_app.chat_sessions[project_id]
        
        chat_history_file = get_chat_history_path(project_id)
        os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
        with open(chat_history_file, 'w') as f: json.dump([], f)
            
        return jsonify({"success": True, "message": "Chat reset successfully."}), 200
    except Exception as e:
        print(f"Error resetting chat: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@chat_bp.route('/project/<project_id>/chat-history', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def get_chat_history_route(project_id):
    """Get the chat history for a specific project."""
    chat_history_file = get_chat_history_path(project_id)
    try:
        if os.path.exists(chat_history_file):
            with open(chat_history_file, 'r') as f: history = json.load(f)
            return jsonify({"history": history}), 200
        else:
            os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
            with open(chat_history_file, 'w') as f: json.dump([], f)
            return jsonify({"history": []}), 200
    except Exception as e:
        print(f"Error reading chat history: {e}")
        return jsonify({"error": str(e)}), 500 