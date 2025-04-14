"""
Vector Store Module for LAIRA.

This module provides the VectorStore class for storing and retrieving vector embeddings
using ChromaDB as the backend database.
"""

import os
import logging
import json
import uuid
import time
import threading
import backoff
from typing import List, Dict, Any, Optional, Union, Tuple, Callable
from pathlib import Path

# Import ChromaDB
import chromadb
from chromadb.config import Settings
from chromadb.api.models.Collection import Collection
from chromadb.errors import ChromaError

# Import local modules
from .text_chunker import TextChunk

# Set up logging
logger = logging.getLogger(__name__)


class VectorStore:
    """
    A class for storing and retrieving vector embeddings using ChromaDB.
    
    This class handles connection to ChromaDB, collection management, and
    operations for storing, retrieving, and querying embeddings.
    """
    
    # Default configuration values
    DEFAULT_PERSIST_DIRECTORY = "./uploads"  # Base directory for project data
    DEFAULT_COLLECTION_NAME = "laira_embeddings"
    DEFAULT_BATCH_SIZE = 100  # Number of embeddings to process in a batch
    DEFAULT_MAX_RETRIES = 3  # Maximum number of retries for DB operations
    DEFAULT_RETRY_DELAY = 2  # Base delay between retries in seconds
    
    def __init__(self, vector_store_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the VectorStore with optional configuration.
        
        Args:
            vector_store_config: Optional configuration dictionary for vector store settings
                - persist_directory: Base directory for persistence
                - project_id: Project ID for project-specific storage
                - collection_name: Name of the collection
                - batch_size: Number of embeddings to process in a batch
        """
        self.config = vector_store_config or {}
        self.last_error = None
        self.client = None
        self.collection = None
        
        # Get configuration values
        self.base_persist_directory = self.config.get("persist_directory", self.DEFAULT_PERSIST_DIRECTORY)
        self.project_id = self.config.get("project_id")
        self.collection_name = self.config.get("collection_name", self.DEFAULT_COLLECTION_NAME)
        self.batch_size = self.config.get("batch_size", self.DEFAULT_BATCH_SIZE)
        
        # Determine the actual persistence directory based on project_id
        if self.project_id:
            self.persist_directory = os.path.join(self.base_persist_directory, self.project_id, "chroma_db")
            logger.info(f"Using project-specific ChromaDB directory: {self.persist_directory}")
        else:
            self.persist_directory = os.path.join(self.base_persist_directory, "chroma_db")
            logger.info(f"Using default ChromaDB directory: {self.persist_directory}")
        
        # Thread safety for client operations
        self.client_lock = threading.Lock()
        
        # Initialize the ChromaDB client
        self._initialize_client()
    
    def _initialize_client(self) -> None:
        """
        Initialize the ChromaDB client with the configured settings.
        
        This method sets up the connection to ChromaDB and creates the default collection
        if it doesn't exist.
        """
        try:
            # Create persist directory if it doesn't exist
            os.makedirs(self.persist_directory, exist_ok=True)
            
            # Initialize ChromaDB client with persistence
            self.client = chromadb.PersistentClient(
                path=self.persist_directory,
                settings=Settings(
                    anonymized_telemetry=False,
                    allow_reset=True
                )
            )
            
            logger.info(f"ChromaDB client initialized with persistence directory: {self.persist_directory}")
            
            # Get or create the default collection
            self._get_or_create_collection(self.collection_name)
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error initializing ChromaDB client: {e}")
    
    def _get_or_create_collection(self, collection_name: str) -> None:
        """
        Get an existing collection or create a new one if it doesn't exist.
        
        Args:
            collection_name: Name of the collection to get or create
        """
        try:
            with self.client_lock:
                # Check if collection exists
                collections = self.client.list_collections()
                collection_exists = any(c.name == collection_name for c in collections)
                
                if collection_exists:
                    self.collection = self.client.get_collection(name=collection_name)
                    logger.info(f"Using existing collection: {collection_name}")
                else:
                    self.collection = self.client.create_collection(
                        name=collection_name,
                        metadata={"description": "LAIRA embeddings collection"}
                    )
                    logger.info(f"Created new collection: {collection_name}")
        
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error getting or creating collection {collection_name}: {e}")
    
    def create_collection(self, 
                          collection_name: str, 
                          metadata: Optional[Dict[str, Any]] = None) -> bool:
        """
        Create a new collection with the specified name and metadata.
        
        Args:
            collection_name: Name of the collection to create
            metadata: Optional metadata for the collection
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.client_lock:
                # Check if collection already exists
                collections = self.client.list_collections()
                if any(c.name == collection_name for c in collections):
                    logger.warning(f"Collection {collection_name} already exists")
                    self.collection = self.client.get_collection(name=collection_name)
                    return True
                
                # Create the collection
                collection_metadata = metadata or {"description": f"LAIRA collection: {collection_name}"}
                self.collection = self.client.create_collection(
                    name=collection_name,
                    metadata=collection_metadata
                )
                
                logger.info(f"Created collection: {collection_name}")
                return True
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error creating collection {collection_name}: {e}")
            return False
    
    def list_collections(self) -> List[Dict[str, Any]]:
        """
        List all available collections in the database.
        
        Returns:
            A list of collection information dictionaries
        """
        try:
            with self.client_lock:
                collections = self.client.list_collections()
                
            # Convert to a list of dictionaries with name and metadata
            result = []
            for collection in collections:
                result.append({
                    "name": collection.name,
                    "metadata": collection.metadata
                })
                
            return result
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error listing collections: {e}")
            return []
    
    def delete_collection(self, collection_name: str) -> bool:
        """
        Delete a collection from the database.
        
        Args:
            collection_name: Name of the collection to delete
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.client_lock:
                self.client.delete_collection(name=collection_name)
                
                # If we deleted the current collection, reset it
                if self.collection and self.collection.name == collection_name:
                    self.collection = None
                
                logger.info(f"Deleted collection: {collection_name}")
                return True
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error deleting collection {collection_name}: {e}")
            return False
    
    def use_collection(self, collection_name: str) -> bool:
        """
        Switch to using a different collection.
        
        Args:
            collection_name: Name of the collection to use
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.client_lock:
                # Check if collection exists
                collections = self.client.list_collections()
                if not any(c.name == collection_name for c in collections):
                    error_msg = f"Collection {collection_name} does not exist"
                    self.last_error = error_msg
                    logger.error(error_msg)
                    return False
                
                # Switch to the collection
                self.collection = self.client.get_collection(name=collection_name)
                self.collection_name = collection_name
                
                logger.info(f"Switched to collection: {collection_name}")
                return True
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error switching to collection {collection_name}: {e}")
            return False
    
    @backoff.on_exception(
        backoff.expo,
        Exception,
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def _add_embeddings_with_retry(self, 
                                  ids: List[str],
                                  embeddings: List[List[float]],
                                  metadatas: List[Dict[str, Any]],
                                  documents: List[str]) -> bool:
        """
        Add embeddings to the collection with retry logic.
        
        Args:
            ids: List of unique IDs for the embeddings
            embeddings: List of embedding vectors
            metadatas: List of metadata dictionaries
            documents: List of document texts
            
        Returns:
            True if successful, False otherwise
        """
        try:
            with self.client_lock:
                if not self.collection:
                    raise ValueError("No collection selected")
                
                self.collection.add(
                    ids=ids,
                    embeddings=embeddings,
                    metadatas=metadatas,
                    documents=documents
                )
                
            return True
            
        except Exception as e:
            logger.warning(f"Error in _add_embeddings_with_retry: {e}, retrying...")
            raise
    
    def store_embeddings(self, 
                         embeddings_data: List[Dict[str, Any]], 
                         collection_name: Optional[str] = None) -> bool:
        """
        Store embeddings in the specified collection.
        
        Args:
            embeddings_data: List of dictionaries with text, embedding, and metadata
            collection_name: Optional name of the collection to store in
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    # Try to create the collection if it doesn't exist
                    if not self.create_collection(collection_name):
                        return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Process in batches
            total_count = len(embeddings_data)
            success_count = 0
            
            for i in range(0, total_count, self.batch_size):
                batch = embeddings_data[i:i+self.batch_size]
                
                # Prepare data for ChromaDB
                ids = []
                embeddings = []
                metadatas = []
                documents = []
                
                for item in batch:
                    # Generate a unique ID if not provided
                    item_id = item.get("id", str(uuid.uuid4()))
                    
                    # Extract required fields
                    embedding = item.get("embedding")
                    text = item.get("text", "")
                    metadata = item.get("metadata", {})
                    
                    # Skip items without embeddings
                    if not embedding:
                        logger.warning(f"Skipping item with ID {item_id}: No embedding found")
                        continue
                    
                    # Add to batch lists
                    ids.append(item_id)
                    embeddings.append(embedding)
                    metadatas.append(metadata)
                    documents.append(text)
                
                # Skip empty batches
                if not ids:
                    continue
                
                # Store the batch with retry logic
                if self._add_embeddings_with_retry(ids, embeddings, metadatas, documents):
                    success_count += len(ids)
                
                # Log progress for large batches
                if total_count > self.batch_size:
                    logger.info(f"Stored {min(i+self.batch_size, total_count)}/{total_count} embeddings")
            
            logger.info(f"Successfully stored {success_count}/{total_count} embeddings")
            return success_count > 0
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error storing embeddings: {e}")
            return False
    
    def store_text_chunks(self, 
                          chunks: List[TextChunk],
                          embeddings: List[List[float]],
                          collection_name: Optional[str] = None) -> bool:
        """
        Store text chunks and their embeddings in the specified collection.
        
        Args:
            chunks: List of TextChunk objects
            embeddings: List of embedding vectors corresponding to the chunks
            collection_name: Optional name of the collection to store in
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Validate input
            if len(chunks) != len(embeddings):
                error_msg = f"Number of chunks ({len(chunks)}) does not match number of embeddings ({len(embeddings)})"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Convert chunks and embeddings to the format expected by store_embeddings
            embeddings_data = []
            
            for i, (chunk, embedding) in enumerate(zip(chunks, embeddings)):
                if embedding is None:
                    logger.warning(f"Skipping chunk {i}: No embedding")
                    continue
                    
                # Create embedding data item
                item = {
                    "id": chunk.metadata.get("chunk_id", str(uuid.uuid4())),
                    "text": chunk.get_text(),
                    "embedding": embedding,
                    "metadata": chunk.get_metadata()
                }
                
                embeddings_data.append(item)
            
            # Store the embeddings
            return self.store_embeddings(embeddings_data, collection_name)
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error storing text chunks: {e}")
            return False
    
    @backoff.on_exception(
        backoff.expo,
        Exception,
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def query_embeddings(self, 
                         query_embedding: List[float],
                         n_results: int = 10,
                         collection_name: Optional[str] = None,
                         filter_criteria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Query the vector store for similar embeddings.
        
        Args:
            query_embedding: The embedding vector to query with
            n_results: Maximum number of results to return
            collection_name: Optional name of the collection to query
            filter_criteria: Optional filter to apply to the query
            
        Returns:
            A list of dictionaries with matching documents and metadata
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return []
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return []
            
            with self.client_lock:
                # Execute the query
                results = self.collection.query(
                    query_embeddings=[query_embedding],
                    n_results=n_results,
                    where=filter_criteria
                )
            
            # Process and return the results
            processed_results = []
            
            if results and 'ids' in results and len(results['ids']) > 0:
                ids = results['ids'][0]
                documents = results['documents'][0]
                metadatas = results['metadatas'][0]
                distances = results['distances'][0]
                
                for i in range(len(ids)):
                    processed_results.append({
                        "id": ids[i],
                        "text": documents[i],
                        "metadata": metadatas[i],
                        "distance": distances[i]
                    })
            
            return processed_results
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error querying embeddings: {e}")
            return []
    
    def query_by_text(self, 
                      query_text: str,
                      embedding_function: Callable[[str], List[float]],
                      n_results: int = 10,
                      collection_name: Optional[str] = None,
                      filter_criteria: Optional[Dict[str, Any]] = None) -> List[Dict[str, Any]]:
        """
        Query the vector store using a text query.
        
        Args:
            query_text: The text to query with
            embedding_function: Function to convert text to embedding
            n_results: Maximum number of results to return
            collection_name: Optional name of the collection to query
            filter_criteria: Optional filter to apply to the query
            
        Returns:
            A list of dictionaries with matching documents and metadata
        """
        try:
            # Generate embedding for the query text
            query_embedding = embedding_function(query_text)
            
            if not query_embedding:
                error_msg = "Failed to generate embedding for query text"
                self.last_error = error_msg
                logger.error(error_msg)
                return []
            
            # Query using the embedding
            return self.query_embeddings(
                query_embedding=query_embedding,
                n_results=n_results,
                collection_name=collection_name,
                filter_criteria=filter_criteria
            )
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error in query_by_text: {e}")
            return []
    
    def get_embedding_by_id(self, 
                           embedding_id: str,
                           collection_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Retrieve a specific embedding by its ID.
        
        Args:
            embedding_id: The ID of the embedding to retrieve
            collection_name: Optional name of the collection to query
            
        Returns:
            A dictionary with the embedding data, or None if not found
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return None
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return None
            
            with self.client_lock:
                # Get the embedding by ID
                result = self.collection.get(
                    ids=[embedding_id],
                    include=["embeddings", "documents", "metadatas"]
                )
            
            # Process and return the result
            if result and 'ids' in result and len(result['ids']) > 0:
                return {
                    "id": result['ids'][0],
                    "text": result['documents'][0],
                    "embedding": result['embeddings'][0],
                    "metadata": result['metadatas'][0]
                }
            else:
                return None
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error getting embedding by ID {embedding_id}: {e}")
            return None
    
    def delete_embedding(self, 
                        embedding_id: str,
                        collection_name: Optional[str] = None) -> bool:
        """
        Delete a specific embedding by its ID.
        
        Args:
            embedding_id: The ID of the embedding to delete
            collection_name: Optional name of the collection to delete from
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            with self.client_lock:
                # Delete the embedding
                self.collection.delete(ids=[embedding_id])
            
            logger.info(f"Deleted embedding with ID: {embedding_id}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error deleting embedding with ID {embedding_id}: {e}")
            return False
    
    def delete_embeddings_by_filter(self, 
                                   filter_criteria: Dict[str, Any],
                                   collection_name: Optional[str] = None) -> bool:
        """
        Delete embeddings that match the specified filter criteria.
        
        Args:
            filter_criteria: Filter to apply for deletion
            collection_name: Optional name of the collection to delete from
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            with self.client_lock:
                # Delete embeddings matching the filter
                self.collection.delete(where=filter_criteria)
            
            logger.info(f"Deleted embeddings matching filter: {filter_criteria}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error deleting embeddings with filter {filter_criteria}: {e}")
            return False
    
    def count_embeddings(self, 
                        collection_name: Optional[str] = None,
                        filter_criteria: Optional[Dict[str, Any]] = None) -> int:
        """
        Count the number of embeddings in a collection.
        
        Args:
            collection_name: Optional name of the collection to count
            filter_criteria: Optional filter to apply
            
        Returns:
            The number of embeddings, or 0 if an error occurred
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return 0
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return 0
            
            with self.client_lock:
                # Count embeddings
                if filter_criteria:
                    result = self.collection.get(where=filter_criteria)
                else:
                    result = self.collection.get()
            
            # Return the count
            if result and 'ids' in result:
                return len(result['ids'])
            else:
                return 0
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error counting embeddings: {e}")
            return 0
    
    def update_embedding(self, 
                        embedding_id: str,
                        new_embedding: Optional[List[float]] = None,
                        new_metadata: Optional[Dict[str, Any]] = None,
                        new_text: Optional[str] = None,
                        collection_name: Optional[str] = None) -> bool:
        """
        Update an existing embedding with new data.
        
        Args:
            embedding_id: The ID of the embedding to update
            new_embedding: Optional new embedding vector
            new_metadata: Optional new metadata
            new_text: Optional new document text
            collection_name: Optional name of the collection
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Get the current embedding data
            current_data = self.get_embedding_by_id(embedding_id)
            if not current_data:
                error_msg = f"Embedding with ID {embedding_id} not found"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Prepare update data
            update_kwargs = {"ids": [embedding_id]}
            
            if new_embedding is not None:
                update_kwargs["embeddings"] = [new_embedding]
            
            if new_metadata is not None:
                update_kwargs["metadatas"] = [new_metadata]
            
            if new_text is not None:
                update_kwargs["documents"] = [new_text]
            
            # Skip if no updates
            if len(update_kwargs) <= 1:
                logger.warning("No updates specified for embedding update")
                return True
            
            with self.client_lock:
                # Update the embedding
                self.collection.update(**update_kwargs)
            
            logger.info(f"Updated embedding with ID: {embedding_id}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error updating embedding with ID {embedding_id}: {e}")
            return False
    
    def optimize_index(self, collection_name: Optional[str] = None) -> bool:
        """
        Optimize the index for a collection to improve query performance.
        
        Args:
            collection_name: Optional name of the collection to optimize
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # ChromaDB automatically maintains its indexes, but we can force a persist
            with self.client_lock:
                # Persist the collection
                self.client.persist()
            
            logger.info(f"Optimized index for collection: {self.collection_name}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error optimizing index: {e}")
            return False
    
    def export_collection(self, 
                         output_file: str,
                         collection_name: Optional[str] = None) -> bool:
        """
        Export a collection to a JSON file.
        
        Args:
            output_file: Path to the output file
            collection_name: Optional name of the collection to export
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Switch collection if specified
            if collection_name and collection_name != self.collection_name:
                if not self.use_collection(collection_name):
                    return False
            
            # Ensure we have a collection
            if not self.collection:
                error_msg = "No collection selected"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            with self.client_lock:
                # Get all data from the collection
                result = self.collection.get(
                    include=["embeddings", "documents", "metadatas"]
                )
            
            # Process the data
            if not result or 'ids' not in result or not result['ids']:
                logger.warning(f"No data found in collection {self.collection_name}")
                return False
            
            export_data = {
                "collection_name": self.collection_name,
                "timestamp": time.time(),
                "count": len(result['ids']),
                "items": []
            }
            
            for i in range(len(result['ids'])):
                # Convert numpy array to list for JSON serialization
                embedding = result['embeddings'][i]
                if hasattr(embedding, 'tolist'):
                    embedding = embedding.tolist()
                
                item = {
                    "id": result['ids'][i],
                    "text": result['documents'][i],
                    "embedding": embedding,
                    "metadata": result['metadatas'][i]
                }
                export_data["items"].append(item)
            
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
            
            # Save to file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(export_data, f, ensure_ascii=False, indent=2)
            
            logger.info(f"Exported {len(export_data['items'])} embeddings to {output_file}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error exporting collection: {e}")
            return False
    
    def import_collection(self, 
                         input_file: str,
                         collection_name: Optional[str] = None) -> bool:
        """
        Import a collection from a JSON file.
        
        Args:
            input_file: Path to the input file
            collection_name: Optional name for the imported collection
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Check if file exists
            if not os.path.exists(input_file):
                error_msg = f"Import file not found: {input_file}"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Load from file
            with open(input_file, 'r', encoding='utf-8') as f:
                import_data = json.load(f)
            
            # Validate import data
            if not isinstance(import_data, dict) or "items" not in import_data:
                error_msg = f"Invalid import file format: {input_file}"
                self.last_error = error_msg
                logger.error(error_msg)
                return False
            
            # Determine collection name
            target_collection = collection_name or import_data.get("collection_name", f"imported_{int(time.time())}")
            
            # Create or use the collection
            if not self.use_collection(target_collection):
                if not self.create_collection(target_collection):
                    return False
            
            # Import the data
            items = import_data["items"]
            
            # Convert to format expected by store_embeddings
            embeddings_data = []
            for item in items:
                if "embedding" not in item:
                    logger.warning(f"Skipping item with ID {item.get('id', 'unknown')}: No embedding found")
                    continue
                
                # Convert numpy array to list for JSON serialization if needed
                embedding = item.get("embedding")
                if hasattr(embedding, 'tolist'):
                    embedding = embedding.tolist()
                
                embeddings_data.append({
                    "id": item.get("id", str(uuid.uuid4())),
                    "text": item.get("text", ""),
                    "embedding": embedding,
                    "metadata": item.get("metadata", {})
                })
            
            # Store the embeddings
            success = self.store_embeddings(embeddings_data)
            
            if success:
                logger.info(f"Imported {len(embeddings_data)} embeddings to collection {target_collection}")
            
            return success
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error importing collection: {e}")
            return False
