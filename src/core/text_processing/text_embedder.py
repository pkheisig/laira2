"""
Text Embedder Module for LAIRA.

This module provides the TextEmbedder class for generating vector embeddings
from text chunks using Google AI's Gemini embedding models.
"""

import os
import time
import logging
import hashlib
import json
from typing import List, Dict, Any, Optional, Union, Tuple
from functools import lru_cache
import threading
import backoff

# Import Google AI libraries
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, GoogleAPIError

# Import local modules
from .text_chunker import TextChunk

# Set up logging
logger = logging.getLogger(__name__)


class TextEmbedder:
    """
    A class for generating vector embeddings from text chunks using Google AI.
    
    This class handles authentication with Google AI, embedding generation,
    rate limiting, caching, and error handling for the embedding process.
    """
    
    # Default configuration values
    DEFAULT_MODEL = "models/text-embedding-004"  # Gemini's text embedding model
    DEFAULT_BATCH_SIZE = 5  # Number of chunks to process in a batch
    DEFAULT_MAX_RETRIES = 3  # Maximum number of retries for API calls
    DEFAULT_RETRY_DELAY = 2  # Base delay between retries in seconds
    DEFAULT_CACHE_SIZE = 1000  # Number of embeddings to cache
    
    # Rate limiting parameters
    DEFAULT_REQUESTS_PER_MINUTE = 100  # Default API rate limit
    
    def __init__(self, embedding_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the TextEmbedder with optional configuration.
        
        Args:
            embedding_config: Optional configuration dictionary for embedding settings
        """
        self.config = embedding_config or {}
        self.last_error = None
        self.api_key = None
        self.model = self.config.get("model", self.DEFAULT_MODEL)
        self.batch_size = self.config.get("batch_size", self.DEFAULT_BATCH_SIZE)
        self.cache_size = self.config.get("cache_size", self.DEFAULT_CACHE_SIZE)
        
        # Rate limiting setup
        self.requests_per_minute = self.config.get("requests_per_minute", self.DEFAULT_REQUESTS_PER_MINUTE)
        self.request_interval = 60.0 / self.requests_per_minute
        self.last_request_time = 0
        self.rate_limit_lock = threading.Lock()
        
        # Initialize the API client
        self._initialize_api()
        
    def _initialize_api(self) -> None:
        """
        Initialize the Google AI API client with authentication.
        """
        try:
            # Get the API key from environment
            self.api_key = os.environ.get("GOOGLE_API_KEY")
            
            if not self.api_key:
                logger.warning("GOOGLE_API_KEY environment variable not set. Authentication will fail.")
                return
            
            # Configure the Google AI client
            genai.configure(api_key=self.api_key)
            
            logger.info(f"Google AI API initialized with model: {self.model}")
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error initializing API: {e}")
    
    def _rate_limit(self) -> None:
        """
        Implement rate limiting for API calls.
        
        This method ensures that API calls don't exceed the rate limit by
        adding appropriate delays between requests.
        """
        with self.rate_limit_lock:
            current_time = time.time()
            time_since_last_request = current_time - self.last_request_time
            
            if time_since_last_request < self.request_interval:
                sleep_time = self.request_interval - time_since_last_request
                time.sleep(sleep_time)
            
            self.last_request_time = time.time()
    
    @backoff.on_exception(
        backoff.expo,
        (ResourceExhausted, ServiceUnavailable),
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def _get_embedding(self, text: str) -> List[float]:
        """
        Get embedding for a single text string with retry logic.
        
        Args:
            text: The text to generate an embedding for
            
        Returns:
            A list of floats representing the embedding vector
            
        Raises:
            GoogleAPIError: If the API call fails after retries
        """
        try:
            # Apply rate limiting
            self._rate_limit()
            
            # Call the Google AI API to generate embedding
            logger.debug(f"Using Google Generative AI with model: {self.model}")
            
            try:
                result = genai.embed_content(
                    model=self.model,
                    content=text,
                    task_type="retrieval_document",
                )
                
                # Extract and return the embedding values
                embedding = result["embedding"]
                logger.debug(f"Successfully extracted embedding vector of length: {len(embedding)}")
                return embedding
            except Exception as e:
                logger.error(f"Google Generative AI error: {e}")
                logger.error(f"Attempted to use model: {self.model}")
                raise GoogleAPIError(f"Failed to generate embedding with Google AI: {e}")
            
        except (ResourceExhausted, ServiceUnavailable) as e:
            # These exceptions will trigger the backoff retry
            logger.warning(f"API rate limit or service issue, retrying: {e}")
            raise
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error generating embedding: {e}")
            raise GoogleAPIError(f"Failed to generate embedding: {e}")
    
    @lru_cache(maxsize=DEFAULT_CACHE_SIZE)
    def _get_embedding_cached(self, text_hash: str, text: str) -> List[float]:
        """
        Cached version of _get_embedding to avoid redundant API calls.
        
        Args:
            text_hash: Hash of the text for caching
            text: The actual text to generate an embedding for
            
        Returns:
            A list of floats representing the embedding vector
        """
        return self._get_embedding(text)
    
    def _compute_text_hash(self, text: str) -> str:
        """
        Compute a hash for the text to use as a cache key.
        
        Args:
            text: The text to hash
            
        Returns:
            A string hash of the text
        """
        return hashlib.md5(text.encode('utf-8')).hexdigest()
    
    def generate_embedding(self, text: Union[str, TextChunk]) -> Optional[List[float]]:
        """
        Generate an embedding for a single text or TextChunk.
        
        Args:
            text: The text or TextChunk to generate an embedding for
            
        Returns:
            A list of floats representing the embedding vector, or None if generation failed
        """
        try:
            # Reset last error
            self.last_error = None
            
            # Extract text from TextChunk if needed
            if isinstance(text, TextChunk):
                text_content = text.get_text()
            else:
                text_content = text
            
            # Validate input
            if not text_content or not isinstance(text_content, str):
                error_msg = "Invalid input: text must be a non-empty string or TextChunk"
                self.last_error = error_msg
                logger.error(error_msg)
                return None
            
            # Compute hash for caching
            text_hash = self._compute_text_hash(text_content)
            
            # Get embedding with caching
            embedding = self._get_embedding_cached(text_hash, text_content)
            
            return embedding
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error in generate_embedding: {e}")
            return None
    
    def generate_embeddings_batch(self, 
                                  texts: List[Union[str, TextChunk]], 
                                  batch_size: Optional[int] = None) -> List[Optional[List[float]]]:
        """
        Generate embeddings for a batch of texts or TextChunks.
        
        Args:
            texts: List of texts or TextChunks to generate embeddings for
            batch_size: Optional batch size to override the default
            
        Returns:
            A list of embedding vectors (each a list of floats), with None for failed embeddings
        """
        # Use configured batch size if not specified
        batch_size = batch_size or self.batch_size
        
        # Initialize results list
        embeddings = []
        
        # Process in batches
        for i in range(0, len(texts), batch_size):
            batch = texts[i:i+batch_size]
            
            # Process each item in the batch
            batch_embeddings = []
            for item in batch:
                embedding = self.generate_embedding(item)
                batch_embeddings.append(embedding)
            
            embeddings.extend(batch_embeddings)
            
            # Log progress for large batches
            if len(texts) > batch_size:
                logger.info(f"Processed {min(i+batch_size, len(texts))}/{len(texts)} embeddings")
        
        return embeddings
    
    def embed_chunks(self, 
                     chunks: List[TextChunk], 
                     include_metadata: bool = True) -> List[Dict[str, Any]]:
        """
        Generate embeddings for a list of TextChunks and return with metadata.
        
        Args:
            chunks: List of TextChunk objects to generate embeddings for
            include_metadata: Whether to include chunk metadata in the results
            
        Returns:
            A list of dictionaries containing embeddings and optional metadata
        """
        # Generate embeddings for all chunks
        embeddings = self.generate_embeddings_batch(chunks)
        
        # Combine embeddings with chunks and metadata
        results = []
        for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
            if embedding is None:
                logger.warning(f"Failed to generate embedding for chunk {i}")
                continue
                
            result = {
                "text": chunk.get_text(),
                "embedding": embedding,
            }
            
            # Include metadata if requested
            if include_metadata:
                result["metadata"] = chunk.get_metadata()
            
            results.append(result)
        
        return results
    
    def save_embeddings(self, 
                        embeddings_data: List[Dict[str, Any]], 
                        output_file: str) -> bool:
        """
        Save embeddings data to a JSON file.
        
        Args:
            embeddings_data: List of dictionaries with embeddings and metadata
            output_file: Path to the output file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
            
            # Save to file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(embeddings_data, f, ensure_ascii=False, indent=2)
                
            logger.info(f"Saved {len(embeddings_data)} embeddings to {output_file}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error saving embeddings: {e}")
            return False
    
    def load_embeddings(self, input_file: str) -> Optional[List[Dict[str, Any]]]:
        """
        Load embeddings data from a JSON file.
        
        Args:
            input_file: Path to the input file
            
        Returns:
            List of dictionaries with embeddings and metadata, or None if loading failed
        """
        try:
            # Check if file exists
            if not os.path.exists(input_file):
                error_msg = f"Embeddings file not found: {input_file}"
                self.last_error = error_msg
                logger.error(error_msg)
                return None
            
            # Load from file
            with open(input_file, 'r', encoding='utf-8') as f:
                embeddings_data = json.load(f)
                
            logger.info(f"Loaded {len(embeddings_data)} embeddings from {input_file}")
            return embeddings_data
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error loading embeddings: {e}")
            return None