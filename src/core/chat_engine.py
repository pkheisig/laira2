"""
Chat Engine Module for LAIRA.

This module provides the ChatEngine class for managing conversations with the
Gemini model, using context from the vector store to answer questions.
"""

import os
import logging
import json
import time
from typing import List, Dict, Any, Optional, Union, Tuple

# Import Google AI libraries
import google.generativeai as genai
from google.generativeai.types import HarmCategory, HarmBlockThreshold

# Import local modules
from .text_processing.vector_store import VectorStore
from .text_processing.text_embedder import TextEmbedder

# Set up logging
logger = logging.getLogger(__name__)


class ChatEngine:
    """
    A class for managing conversations with the Gemini AI model.
    
    This class handles:
    - Initializing the Gemini model
    - Retrieving relevant context from the vector store
    - Generating responses based on user questions and document context
    - Managing conversation history
    """
    
    # Default configuration values
    DEFAULT_MODEL = "gemini-pro"  # Gemini Pro model
    DEFAULT_TEMPERATURE = 0.7  # Temperature for generation (0.0-1.0)
    DEFAULT_TOP_P = 0.95  # Top P for sampling
    DEFAULT_TOP_K = 40  # Top K for sampling
    DEFAULT_MAX_OUTPUT_TOKENS = 1024  # Maximum number of tokens to generate
    DEFAULT_N_RESULTS = 5  # Number of results to retrieve from vector store
    
    # System prompt template
    SYSTEM_PROMPT_TEMPLATE = """
    You are LAIRA (Literature AI Research Assistant), a helpful AI assistant that answers questions based on the user's documents.
    
    Your primary goal is to provide accurate, helpful responses based solely on the context provided from the user's documents.
    
    Follow these guidelines for your responses:
    1. Only use information from the provided document context to answer questions
    2. If the context doesn't contain the answer, say "I don't have enough information to answer that question based on your documents."
    3. Always include citations to the source documents when providing information
    4. Provide concise, clear answers focused on the user's question
    5. Format citations as [Source: {filename}]
    6. Use bullet points or numbered lists for clarity when appropriate
    7. If the question is ambiguous, ask for clarification
    
    Remember: You should rely only on the context provided from the user's documents, not your general knowledge.
    """
    
    def __init__(self, chat_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the ChatEngine with optional configuration.
        
        Args:
            chat_config: Optional configuration dictionary for chat settings
        """
        self.config = chat_config or {}
        self.last_error = None
        
        # Get configuration values
        self.model_name = self.config.get("model", self.DEFAULT_MODEL)
        self.temperature = self.config.get("temperature", self.DEFAULT_TEMPERATURE)
        self.top_p = self.config.get("top_p", self.DEFAULT_TOP_P)
        self.top_k = self.config.get("top_k", self.DEFAULT_TOP_K)
        self.max_output_tokens = self.config.get("max_output_tokens", self.DEFAULT_MAX_OUTPUT_TOKENS)
        self.n_results = self.config.get("n_results", self.DEFAULT_N_RESULTS)
        
        # Get project-specific settings
        self.project_id = self.config.get("project_id")
        
        # Initialize components
        self.embedder = TextEmbedder()
        
        # Create a vector store with project-specific configuration
        vector_store_config = {
            "persist_directory": "./uploads",
            "project_id": self.project_id,
        }
        self.vector_store = VectorStore(vector_store_config)
        
        # Initialize the model
        self._initialize_model()
        
        # Initialize conversation history
        self.conversation_history = []
    
    def _initialize_model(self) -> None:
        """
        Initialize the Gemini model with the configured settings.
        """
        try:
            # Get API key from environment
            api_key = os.environ.get("GOOGLE_API_KEY")
            
            if not api_key:
                error_msg = "GOOGLE_API_KEY environment variable not set"
                self.last_error = error_msg
                logger.error(error_msg)
                return
            
            # Configure the Google AI client
            genai.configure(api_key=api_key)
            
            # Set up the generation config
            self.generation_config = {
                "temperature": self.temperature,
                "top_p": self.top_p,
                "top_k": self.top_k,
                "max_output_tokens": self.max_output_tokens,
            }
            
            # Set up the safety settings (moderate)
            self.safety_settings = [
                {
                    "category": HarmCategory.HARM_CATEGORY_HARASSMENT,
                    "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_HATE_SPEECH,
                    "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT,
                    "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
                {
                    "category": HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT,
                    "threshold": HarmBlockThreshold.BLOCK_MEDIUM_AND_ABOVE
                },
            ]
            
            # Create the model
            self.model = genai.GenerativeModel(
                model_name=self.model_name,
                generation_config=self.generation_config,
                safety_settings=self.safety_settings
            )
            
            # Create a chat session
            self.chat = self.model.start_chat(history=[])
            
            logger.info(f"Initialized Gemini model: {self.model_name}")
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error initializing Gemini model: {e}")
    
    def _get_relevant_context(self, query: str) -> Tuple[List[Dict[str, Any]], str]:
        """
        Retrieve relevant context from the vector store for a given query.
        
        Args:
            query: The user's question
            
        Returns:
            A tuple containing (results list, formatted context string)
        """
        try:
            # Create a collection name based on project ID
            collection_name = f"project_{self.project_id}"
            
            # Make sure the collection exists
            collections = self.vector_store.list_collections()
            if not any(c["name"] == collection_name for c in collections):
                logger.warning(f"Collection {collection_name} does not exist")
                return [], ""
            
            # Use the correct collection
            self.vector_store.use_collection(collection_name)
            
            # Define the embedding function for the query
            def embed_query(query_text):
                embedding = self.embedder.generate_embedding(query_text)
                if embedding is None:
                    raise ValueError(f"Failed to generate embedding for query: {self.embedder.last_error}")
                return embedding
            
            # Query the vector store
            results = self.vector_store.query_by_text(
                query_text=query,
                embedding_function=embed_query,
                n_results=self.n_results,
                collection_name=collection_name
            )
            
            if not results:
                logger.warning("No relevant context found in vector store")
                return [], ""
            
            # Format the context for the model
            context_parts = []
            for i, result in enumerate(results):
                text = result.get("text", "").strip()
                metadata = result.get("metadata", {})
                filename = metadata.get("filename", "Unknown document")
                
                if text:
                    context_parts.append(f"[Document {i+1}] From {filename}:\n{text}\n")
            
            # Join all context parts
            formatted_context = "\n".join(context_parts)
            
            return results, formatted_context
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error retrieving context: {e}")
            return [], ""
    
    def _format_prompt_with_context(self, question: str, context: str) -> str:
        """
        Format the prompt with context for the Gemini model.
        
        Args:
            question: The user's question
            context: The retrieved context from documents
            
        Returns:
            The formatted prompt string
        """
        prompt = f"""
I need you to answer the following question based ONLY on the context provided from the user's documents:

QUESTION: {question}

CONTEXT FROM DOCUMENTS:
{context}

Remember:
1. Only use information from the context above
2. If the context doesn't contain the answer, admit you don't know
3. Cite your sources using [Source: filename]
4. Be concise and clear in your response
        """
        return prompt
    
    def ask(self, question: str) -> Dict[str, Any]:
        """
        Ask a question and get a response based on document context.
        
        Args:
            question: The user's question
            
        Returns:
            A dictionary with the response and metadata
        """
        try:
            start_time = time.time()
            
            # Get relevant context from vector store
            results, context = self._get_relevant_context(question)
            
            if not context:
                return {
                    "answer": "I don't have any relevant information from your documents to answer this question. Please make sure your documents have been properly uploaded and processed.",
                    "sources": [],
                    "success": False,
                    "error": "No relevant context found"
                }
            
            # Format the prompt with context
            prompt = self._format_prompt_with_context(question, context)
            
            # Send to Gemini
            response = self.chat.send_message(prompt)
            answer = response.text
            
            # Process response to extract and format sources
            sources = []
            for result in results:
                metadata = result.get("metadata", {})
                filename = metadata.get("filename", "Unknown document")
                if filename not in [s.get("name") for s in sources]:
                    sources.append({
                        "name": filename,
                        "path": metadata.get("file_path", "")
                    })
            
            # Add to conversation history
            self.conversation_history.append({
                "role": "user",
                "content": question
            })
            self.conversation_history.append({
                "role": "assistant",
                "content": answer
            })
            
            elapsed_time = time.time() - start_time
            
            return {
                "answer": answer,
                "sources": sources,
                "success": True,
                "processing_time": elapsed_time,
                "context_snippets": len(results)
            }
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error asking question: {e}")
            return {
                "answer": "I encountered an error while trying to process your question. Please try again later.",
                "sources": [],
                "success": False,
                "error": str(e)
            }
    
    def reset_conversation(self) -> None:
        """
        Reset the conversation history.
        """
        self.conversation_history = []
        # Recreate the chat session
        self.chat = self.model.start_chat(history=[])
        logger.info("Conversation history reset") 