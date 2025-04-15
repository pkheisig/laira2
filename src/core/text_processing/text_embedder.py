"""
Text Embedder Module for LAIRA.

This module provides the TextEmbedder class for generating vector embeddings
from text chunks using Google Cloud Vertex AI embedding models.
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
import traceback # Import traceback

# Import Vertex AI SDK
from google.cloud import aiplatform
import vertexai # Import the vertexai namespace
# We will load the model class dynamically inside _initialize_api to catch import errors
from google.api_core.exceptions import ResourceExhausted, ServiceUnavailable, GoogleAPIError, NotFound

# Import local modules
from .text_chunker import TextChunk

# Set up logging
logger = logging.getLogger(__name__)


class TextEmbedder:
    """
    A class for generating vector embeddings from text chunks using Vertex AI.
    
    Handles authentication, embedding generation, rate limiting, caching, and error handling.
    """
    
    DEFAULT_MODEL = "text-embedding-005"  # Vertex AI model ID
    DEFAULT_LOCATION = "us-central1" # Default location for Vertex AI
    DEFAULT_BATCH_SIZE = 5 # Vertex AI embeddings often have batch limits
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_RETRY_DELAY = 2
    DEFAULT_CACHE_SIZE = 1000
    DEFAULT_REQUESTS_PER_MINUTE = 100
    
    def __init__(self, embedding_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the TextEmbedder with optional configuration.
        """
        self.config = embedding_config or {}
        self.last_error = None
        self.project_id = os.environ.get("GOOGLE_CLOUD_PROJECT")
        self.location = self.config.get("location", os.environ.get("GOOGLE_CLOUD_LOCATION", self.DEFAULT_LOCATION))
        self.model_name = self.config.get("model", self.DEFAULT_MODEL)
        self.batch_size = self.config.get("batch_size", self.DEFAULT_BATCH_SIZE)
        self.cache_size = self.config.get("cache_size", self.DEFAULT_CACHE_SIZE)
        
        self.requests_per_minute = self.config.get("requests_per_minute", self.DEFAULT_REQUESTS_PER_MINUTE)
        self.request_interval = 60.0 / self.requests_per_minute
        self.last_request_time = 0
        self.rate_limit_lock = threading.Lock()
        
        # Initialize Vertex AI client and model
        self.vertex_model = None # Initialize as None
        self._initialize_api()
        
    def _initialize_api(self) -> None:
        """
        Initialize the Vertex AI API client and load the model with detailed error checking.
        """
        try:
            # Step 1: Initialize Vertex AI SDK
            logger.info(f"Attempting Vertex AI initialization for project '{self.project_id}' in location '{self.location}'")
            if not self.project_id:
                logger.warning("GOOGLE_CLOUD_PROJECT environment variable not set. Vertex AI initialization may fail.")
                # Proceed, maybe ADC works without explicit project?

            aiplatform.init(project=self.project_id, location=self.location)
            logger.info("Vertex AI aiplatform.init() successful.")

        except Exception as e_init:
            self.last_error = f"Vertex AI aiplatform.init() failed: {e_init}"
            logger.error(self.last_error)
            logger.error(traceback.format_exc()) # Log full traceback for init error
            self.vertex_model = None
            return # Stop initialization if aiplatform.init fails

        try:
            # Step 2: Dynamically import and load the specific model class
            logger.info(f"Attempting to import TextEmbeddingModel from vertexai.language_models")
            # Dynamically import here to catch ModuleNotFoundError more precisely
            from vertexai.language_models import TextEmbeddingModel 
            logger.info(f"Import successful. Attempting to load model: {self.model_name}")
            self.vertex_model = TextEmbeddingModel.from_pretrained(self.model_name)
            logger.info(f"Successfully loaded Vertex AI embedding model: {self.model_name}")

        except ModuleNotFoundError as e_import:
            self.last_error = f"Failed to import TextEmbeddingModel: {e_import}. Check google-cloud-aiplatform installation and dependencies."
            logger.error(self.last_error)
            logger.error(traceback.format_exc()) # Log full traceback for import error
            self.vertex_model = None
        except Exception as e_load:
            self.last_error = f"Error loading Vertex AI model '{self.model_name}': {e_load}"
            logger.error(self.last_error)
            logger.error(traceback.format_exc()) # Log full traceback for loading error
            self.vertex_model = None

    def _rate_limit(self) -> None:
        """Implement rate limiting for API calls."""
        with self.rate_limit_lock:
            current_time = time.time()
            time_since_last_request = current_time - self.last_request_time
            if time_since_last_request < self.request_interval:
                sleep_time = self.request_interval - time_since_last_request
                time.sleep(sleep_time)
            self.last_request_time = time.time()

    @backoff.on_exception(
        backoff.expo,
        (ResourceExhausted, ServiceUnavailable, GoogleAPIError),
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def _get_embedding(self, text: str) -> List[float]:
        """
        Get embedding for a single text string using the loaded Vertex AI model.
        """
        if not self.vertex_model:
            self.last_error = "Vertex AI model is not initialized (initialization failed)."
            logger.error(self.last_error)
            raise ValueError(self.last_error) # Raise error if model isn't loaded
            
        try:
            self._rate_limit()
            logger.debug(f"Getting embedding via Vertex AI model: {self.model_name}")
            response = self.vertex_model.get_embeddings([text])
            if not response or not response[0].values:
                 raise GoogleAPIError("Vertex AI returned empty response or embedding values.")
            embedding = response[0].values
            logger.debug(f"Successfully got Vertex AI embedding vector of length: {len(embedding)}")
            return embedding
        except NotFound as e:
             logger.error(f"Vertex AI model '{self.model_name}' not found: {e}")
             raise GoogleAPIError(f"Vertex AI model '{self.model_name}' not found.") from e
        except (ResourceExhausted, ServiceUnavailable) as e:
            logger.warning(f"Vertex AI rate limit or service issue, retrying: {e}")
            raise
        except GoogleAPIError as e:
            self.last_error = str(e)
            logger.error(f"Vertex AI API error generating embedding: {e}")
            raise
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Unexpected error generating embedding with Vertex AI: {e}")
            raise GoogleAPIError(f"Unexpected error during Vertex AI embedding: {e}") from e

    @lru_cache(maxsize=DEFAULT_CACHE_SIZE)
    def _get_embedding_cached(self, text_hash: str, text: str) -> List[float]:
        """Cached version of _get_embedding."""
        # Will raise ValueError if _get_embedding fails because model is None
        return self._get_embedding(text)

    def _compute_text_hash(self, text: str) -> str:
        """Compute hash for text caching."""
        return hashlib.md5(text.encode('utf-8')).hexdigest()

    def generate_embedding(self, text: Union[str, TextChunk]) -> Optional[List[float]]:
        """Generate an embedding for a single text or TextChunk."""
        if not self.vertex_model:
             self.last_error = "Vertex AI model not initialized (initialization failed)."
             logger.error(self.last_error)
             return None # Return None if model isn't ready

        try:
            self.last_error = None
            text_content = text.get_text() if isinstance(text, TextChunk) else text
            if not text_content or not isinstance(text_content, str):
                self.last_error = "Invalid input: text must be a non-empty string or TextChunk"
                logger.error(self.last_error)
                return None
            text_hash = self._compute_text_hash(text_content)
            # This will now raise ValueError if the model is not loaded, caught below
            embedding = self._get_embedding_cached(text_hash, text_content)
            return embedding
        except Exception as e:
            self.last_error = f"Error during embedding generation: {e}"
            logger.error(self.last_error)
            return None # Return None on error

    def generate_embeddings_batch(self, 
                                  texts: List[Union[str, TextChunk]], 
                                  batch_size: Optional[int] = None) -> List[Optional[List[float]]]:
        """Generate embeddings for a batch using Vertex AI."""
        if not self.vertex_model:
             logger.error("Cannot generate batch embeddings: Vertex AI model not initialized.")
             return [None] * len(texts)
             
        batch_size = batch_size or self.batch_size
        results = [None] * len(texts)
        texts_to_process = []
        original_indices = []
        for i, item in enumerate(texts):
            text_content = item.get_text() if isinstance(item, TextChunk) else item
            if text_content and isinstance(text_content, str):
                texts_to_process.append(text_content)
                original_indices.append(i)
            else:
                logger.warning(f"Invalid item at index {i} in batch, skipping.")

        for i in range(0, len(texts_to_process), batch_size):
            batch_texts = texts_to_process[i:i+batch_size]
            batch_indices = original_indices[i:i+batch_size]
            try:
                self._rate_limit()
                logger.debug(f"Processing batch of {len(batch_texts)} texts with Vertex AI.")
                response = self.vertex_model.get_embeddings(batch_texts)
                if len(response) != len(batch_texts):
                     logger.error(f"Vertex AI returned {len(response)} embeddings for {len(batch_texts)} inputs.")
                     for idx in batch_indices: results[idx] = None
                     continue
                for j, embedding_obj in enumerate(response):
                     original_idx = batch_indices[j]
                     if embedding_obj.values:
                         results[original_idx] = embedding_obj.values
                     else:
                         logger.warning(f"Vertex AI returned empty embedding for index {original_idx}.")
                         results[original_idx] = None
            except Exception as e:
                logger.error(f"Error processing batch with Vertex AI: {e}")
                for idx in batch_indices: results[idx] = None
                self.last_error = str(e)
        return results
        
    def embed_chunks(self, 
                     chunks: List[TextChunk], 
                     include_metadata: bool = True) -> List[Dict[str, Any]]:
        """Generate embeddings for a list of TextChunk objects."""
        if not self.vertex_model:
             logger.error("Cannot embed chunks: Vertex AI model not initialized.")
             return []
        chunk_texts = [chunk.get_text() for chunk in chunks]
        embeddings = self.generate_embeddings_batch(chunk_texts)
        results_list = []
        for i, chunk in enumerate(chunks):
            if embeddings[i] is not None:
                result_item = {"id": chunk.chunk_id, "embedding": embeddings[i]}
                if include_metadata: result_item["metadata"] = chunk.metadata
                results_list.append(result_item)
            else: logger.warning(f"Failed to generate embedding for chunk {chunk.chunk_id}, skipping.")
        return results_list

    # save/load embeddings methods remain unchanged
    def save_embeddings(self, embeddings_data: List[Dict[str, Any]], output_file: str) -> bool:
        """Save embedding data to a JSON file."""
        try:
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(embeddings_data, f, indent=2)
            logger.info(f"Successfully saved {len(embeddings_data)} embeddings to {output_file}")
            return True
        except IOError as e:
            self.last_error = f"Failed to write embeddings file: {e}"
            logger.error(self.last_error)
            return False
        except Exception as e:
            self.last_error = f"Unexpected error saving embeddings: {e}"
            logger.error(self.last_error)
            return False

    def load_embeddings(self, input_file: str) -> Optional[List[Dict[str, Any]]]:
        """Load embedding data from a JSON file."""
        try:
            if not os.path.exists(input_file):
                self.last_error = f"Embeddings file not found: {input_file}"
                logger.error(self.last_error)
                return None
            with open(input_file, 'r', encoding='utf-8') as f:
                embeddings_data = json.load(f)
            logger.info(f"Successfully loaded {len(embeddings_data)} embeddings from {input_file}")
            return embeddings_data
        except json.JSONDecodeError as e:
            self.last_error = f"Failed to decode JSON from embeddings file: {e}"
            logger.error(self.last_error)
            return None
        except IOError as e:
            self.last_error = f"Failed to read embeddings file: {e}"
            logger.error(self.last_error)
            return None
        except Exception as e:
            self.last_error = f"Unexpected error loading embeddings: {e}"
            logger.error(self.last_error)
            return None