"""
Document Processor Module for LAIRA.

This module provides the DocumentProcessor class for orchestrating the entire workflow
from document upload to embedding storage, with comprehensive error handling and logging.
"""

import os
import time
import logging
import uuid
import json
from typing import List, Dict, Any, Optional, Union, Tuple, Callable
from enum import Enum
from dataclasses import dataclass
from concurrent.futures import ThreadPoolExecutor, as_completed
import threading
import backoff
from pathlib import Path
from langchain.schema import Document

# Import local modules
from ..text_processing.text_extractor import TextExtractor
from ..text_processing.text_chunker import TextChunker, TextChunk
from ..text_processing.text_embedder import TextEmbedder
from ..text_processing.vector_store import VectorStore
from ..text_processing.utils import detect_file_type, get_safe_filename
from .progress import ProcessingStage, ProcessingProgress

# Set up logging
logger = logging.getLogger(__name__)


class DocumentProcessor:
    """
    A class for orchestrating the entire document processing workflow.
    
    This class coordinates the process of extracting text from documents,
    chunking the text, generating embeddings, and storing them in a vector database.
    It provides comprehensive error handling, progress tracking, and logging.
    """
    
    # Default configuration values
    DEFAULT_CHUNK_STRATEGY = "paragraph"
    DEFAULT_MAX_RETRIES = 3
    DEFAULT_RETRY_DELAY = 2
    DEFAULT_CONCURRENT_TASKS = 10
    
    def __init__(self, 
                 processor_config: Optional[Dict[str, Any]] = None,
                 extractor: Optional[TextExtractor] = None,
                 chunker: Optional[TextChunker] = None,
                 embedder: Optional[TextEmbedder] = None,
                 vector_store: Optional[VectorStore] = None):
        """
        Initialize the DocumentProcessor with optional configuration and components.
        
        Args:
            processor_config: Optional configuration dictionary for processor settings
            extractor: Optional TextExtractor instance
            chunker: Optional TextChunker instance
            embedder: Optional TextEmbedder instance
            vector_store: Optional VectorStore instance
        """
        self.config = processor_config or {}
        self.last_error = None
        
        # Initialize components (use provided instances or create new ones)
        self.extractor = extractor or TextExtractor(self.config.get("extraction_config"))
        self.chunker = chunker or TextChunker(self.config.get("chunking_config"))
        self.embedder = embedder or TextEmbedder(self.config.get("embedding_config"))
        self.vector_store = vector_store or VectorStore(self.config.get("vector_store_config"))
        
        # Get configuration values
        self.chunk_strategy = self.config.get("chunk_strategy", self.DEFAULT_CHUNK_STRATEGY)
        self.max_retries = self.config.get("max_retries", self.DEFAULT_MAX_RETRIES)
        self.retry_delay = self.config.get("retry_delay", self.DEFAULT_RETRY_DELAY)
        self.concurrent_tasks = self.config.get("concurrent_tasks", self.DEFAULT_CONCURRENT_TASKS)
        
        # Initialize progress tracking
        self.progress = ProcessingProgress(
            stage=ProcessingStage.INITIALIZED,
            total_steps=0,
            current_step=0,
            success_count=0,
            error_count=0,
            start_time=time.time(),
            last_update_time=time.time(),
            errors=[]
        )
        
        # Thread safety for progress updates
        self.progress_lock = threading.Lock()
        
        # Progress callback
        self.progress_callback = None
    
    def set_progress_callback(self, callback: Callable[[Dict[str, Any]], None]) -> None:
        """
        Set a callback function to be called when progress is updated.
        
        Args:
            callback: A function that takes a progress dictionary as its argument
        """
        self.progress_callback = callback
    
    def _update_progress(self, 
                         stage: Optional[ProcessingStage] = None,
                         increment_step: bool = False,
                         increment_success: bool = False,
                         increment_error: bool = False,
                         error_info: Optional[Dict[str, Any]] = None) -> None:
        """
        Update the processing progress.
        
        Args:
            stage: Optional new processing stage
            increment_step: Whether to increment the current step
            increment_success: Whether to increment the success count
            increment_error: Whether to increment the error count
            error_info: Optional error information to add to the errors list
        """
        with self.progress_lock:
            # Update stage if provided
            if stage is not None:
                self.progress.stage = stage
            
            # Update counters
            if increment_step:
                self.progress.current_step += 1
            if increment_success:
                self.progress.success_count += 1
            if increment_error:
                self.progress.error_count += 1
            
            # Add error info if provided
            if error_info is not None:
                self.progress.errors.append(error_info)
            
            # Update timestamp
            self.progress.last_update_time = time.time()
            
            # Call progress callback if set
            if self.progress_callback:
                self.progress_callback(self.progress.to_dict())
    
    def process_document(self, 
                         document_path: str,
                         collection_name: Optional[str] = None,
                         document_metadata: Optional[Dict[str, Any]] = None) -> Dict[str, Any]:
        """
        Process a document through the entire pipeline.
        
        Args:
            document_path: Path to the document file
            collection_name: Optional name of the collection to store embeddings in
            document_metadata: Optional metadata about the document (will be updated)
            
        Returns:
            A dictionary with processing results and statistics
        """
        start_time = time.time()
        document_id = str(uuid.uuid4()) # Generate ID upfront for logging
        logger.info(f"[DOC:{document_id}] Starting processing for {document_path}")
        
        # Define total steps for progress calculation
        total_pipeline_steps = 4 # Extract, Chunk, Embed, Store
        
        # Initialize result dictionary *before* try block to ensure it exists
        result = {
            "document_path": document_path,
            "document_id": document_id,
            "processing_time": 0,
            "success": False,
            "error": None,
            "stats": {
                "content_length": 0,
                "page_count": 0,
                "chunk_count": 0,
                "embedding_count": 0,
                "stored_count": 0
            }
        }
        
        try:
            # Reset/Initialize progress for this document
            with self.progress_lock: 
                self.progress.stage = ProcessingStage.INITIALIZED
                self.progress.total_steps = total_pipeline_steps 
                self.progress.current_step = 0
                self.progress.success_count = 0
                self.progress.error_count = 0
                self.progress.errors = []
                # Don't reset start_time here, use the one for the whole processor instance?
                # Or should each doc have its own timer?
                # For now, let's use the main instance timer for elapsed time.
                self.progress.last_update_time = time.time()
                if self.progress_callback:
                    self.progress_callback(self.progress.to_dict()) # Send initial state
            
            # Initialize document metadata if not provided, add generated ID
            doc_metadata = document_metadata.copy() if document_metadata else {}
            doc_metadata["document_id"] = result["document_id"]
            doc_metadata["filename"] = os.path.basename(document_path)
            doc_metadata["file_path"] = document_path
            
            # --- Stage 1: Extract Content --- 
            self._update_progress(stage=ProcessingStage.EXTRACTING)
            logger.info(f"[DOC:{document_id}] Stage 1: Extracting content...")
            extracted_content = self.document_to_text(document_path, doc_metadata)
            if extracted_content is None:
                error_msg = self.last_error or "Failed to extract content"
                logger.error(f"[DOC:{document_id}] Stage 1 FAILED: {error_msg}")
                result["error"] = error_msg
                self._update_progress(stage=ProcessingStage.FAILED, increment_error=True, error_info={"stage": "extracting", "error": error_msg})
                result["processing_time"] = time.time() - start_time
                return result
            logger.info(f"[DOC:{document_id}] Stage 1 SUCCESS.")
            self._update_progress(increment_step=True) # Mark step complete
            
            # Update stats based on content type
            if isinstance(extracted_content, list):
                result["stats"]["page_count"] = len(extracted_content)
                # Approximate content length for lists (sum of page contents)
                result["stats"]["content_length"] = sum(len(doc.page_content) for doc in extracted_content)
            elif isinstance(extracted_content, str):
                 result["stats"]["content_length"] = len(extracted_content)
                 result["stats"]["page_count"] = 1 # Treat non-PDFs as single page for stats
            
            # --- Stage 2: Chunk Content --- 
            self._update_progress(stage=ProcessingStage.CHUNKING)
            logger.info(f"[DOC:{document_id}] Stage 2: Chunking content...")
            # If extractor returned LangChain Documents (text+figure chunks), convert to TextChunk
            from langchain.schema import Document as LDocument
            if isinstance(extracted_content, list) and all(isinstance(d, LDocument) for d in extracted_content):
                from src.core.text_processing.text_chunker import TextChunk
                chunks = [TextChunk(text=doc.page_content, metadata=doc.metadata) for doc in extracted_content]
            else:
                # Otherwise chunk string content into TextChunk objects
                chunks = self.text_to_chunks(extracted_content, doc_metadata)
            if chunks is None: 
                error_msg = self.last_error or "Failed to chunk content"
                logger.error(f"[DOC:{document_id}] Stage 2 FAILED: {error_msg}")
                result["error"] = error_msg
                self._update_progress(stage=ProcessingStage.FAILED, increment_error=True, error_info={"stage": "chunking", "error": error_msg})
                result["processing_time"] = time.time() - start_time
                return result
            logger.info(f"[DOC:{document_id}] Stage 2 SUCCESS. Generated {len(chunks)} chunks.")
            self._update_progress(increment_step=True) # Mark step complete
            
            result["stats"]["chunk_count"] = len(chunks)
            if len(chunks) == 0:
                 logger.warning(f"No chunks generated for {document_path}, skipping embedding and storage.")
                 result["success"] = True # Consider success if no content to process
                 result["processing_time"] = time.time() - start_time
                 self._update_progress(stage=ProcessingStage.COMPLETED)
                 return result

            # --- Stage 3: Generate Embeddings --- 
            self._update_progress(stage=ProcessingStage.EMBEDDING)
            logger.info(f"[DOC:{document_id}] Stage 3: Generating embeddings for {len(chunks)} chunks...")
            chunks_with_embeddings = self.chunks_to_embeddings(chunks)
            if chunks_with_embeddings is None: 
                error_msg = self.last_error or "Failed to generate embeddings"
                logger.error(f"[DOC:{document_id}] Stage 3 FAILED: {error_msg}")
                result["error"] = error_msg
                self._update_progress(stage=ProcessingStage.FAILED, increment_error=True, error_info={"stage": "embedding", "error": error_msg})
                result["processing_time"] = time.time() - start_time
                return result
            logger.info(f"[DOC:{document_id}] Stage 3 SUCCESS. Generated embeddings for {len(chunks_with_embeddings)} chunks.")
            self._update_progress(increment_step=True) # Mark step complete
            
            result["stats"]["embedding_count"] = len(chunks_with_embeddings)
            if len(chunks_with_embeddings) == 0:
                 logger.warning(f"No embeddings generated for {document_path}, skipping storage.")
                 result["success"] = True
                 result["processing_time"] = time.time() - start_time
                 self._update_progress(stage=ProcessingStage.COMPLETED)
                 return result

            # --- Stage 4: Store Embeddings --- 
            self._update_progress(stage=ProcessingStage.STORING)
            logger.info(f"[DOC:{document_id}] Stage 4: Storing {len(chunks_with_embeddings)} embeddings...")
            # Call DocumentProcessor's store_embeddings, which returns a dict on success, None on failure
            storage_result_dict = self.store_embeddings(chunks_with_embeddings, collection_name) 
            
            # Check if the dictionary was returned (indicates underlying vector_store call succeeded)
            if storage_result_dict is None:
                # Failure occurred within self.store_embeddings (which already logged the specific error)
                error_msg = self.last_error or "Failed to store embeddings (storage_result was None)" 
                logger.error(f"[DOC:{document_id}] Stage 4 FAILED: {error_msg}")
                result["error"] = error_msg
                # Ensure progress reflects failure *without* double-counting errors
                self._update_progress(stage=ProcessingStage.FAILED) # Error already counted in store_embeddings
                result["processing_time"] = time.time() - start_time
                return result
                
            # --- Storage Succeeded --- 
            stored_count = storage_result_dict.get('stored_count', 0)
            logger.info(f"[DOC:{document_id}] Stage 4 SUCCESS. Stored {stored_count} embeddings.")
            # Don't increment step/success here, store_embeddings already did
            # Just ensure the stage is correct
            self._update_progress(stage=ProcessingStage.COMPLETED) 
            
            # --- Processing Complete --- 
            result["stats"]["stored_count"] = stored_count
            result["success"] = True
            result["processing_time"] = time.time() - start_time
            logger.info(f"[DOC:{document_id}] Processing completed successfully in {result['processing_time']:.2f}s.")

        except Exception as e:
            error_msg = f"Unexpected error during document processing: {e}"
            logger.error(f"[DOC:{document_id}] UNEXPECTED ERROR: {error_msg}", exc_info=True)
            result["error"] = error_msg
            # Try to capture which stage it might have failed in based on progress.stage
            failed_stage = self.progress.stage.value if self.progress.stage != ProcessingStage.INITIALIZED else "unknown"
            self._update_progress(stage=ProcessingStage.FAILED, increment_error=True, error_info={"stage": failed_stage, "error": error_msg})
            result["processing_time"] = time.time() - start_time
        
        return result
    
    def process_documents(self, 
                          document_paths: List[str],
                          collection_name: Optional[str] = None,
                          document_metadata: Optional[Dict[str, Any]] = None,
                          concurrent: bool = True) -> Dict[str, Any]:
        """
        Process multiple documents through the entire pipeline.
        Handles overall progress and aggregates results.
        
        Args:
            document_paths: List of paths to document files
            collection_name: Optional name of the collection to store embeddings in
            document_metadata: Optional base metadata to apply to all documents
            concurrent: Whether to process documents concurrently using threads
            
        Returns:
            A dictionary with aggregated processing results and statistics
        """
        overall_start_time = time.time()
        try:
            total_docs = len(document_paths)
            if total_docs == 0:
                logger.warning("No document paths provided to process_documents.")
                return {"document_count": 0, "success": True, "message": "No documents to process."}

            # Reset overall progress tracking
            with self.progress_lock:
                self.progress = ProcessingProgress(
                    stage=ProcessingStage.INITIALIZED,
                    total_steps=total_docs, # One step per document
                    current_step=0,
                    success_count=0,
                    error_count=0,
                    start_time=overall_start_time,
                    last_update_time=overall_start_time,
                    errors=[] # Errors from individual docs will be added here
                )
                # Call initial progress callback
                if self.progress_callback:
                    self.progress_callback(self.progress.to_dict())

            # Initialize aggregated result dictionary
            aggregated_result = {
                "total_documents": total_docs,
                "processed_documents": 0,
                "successful_documents": 0,
                "failed_documents": 0,
                "total_processing_time": 0,
                "average_processing_time": 0,
                "document_results": [] # Store individual results
            }

            # Initialize base document metadata if not provided
            base_metadata = document_metadata or {}

            # --- Process Documents --- 
            if concurrent and total_docs > 1:
                logger.info(f"Processing {total_docs} documents concurrently (max workers: {self.concurrent_tasks})...")
                with ThreadPoolExecutor(max_workers=self.concurrent_tasks) as executor:
                    future_to_path = {}
                    for path in document_paths:
                        # Create document-specific metadata for this run
                        doc_metadata_run = base_metadata.copy()
                        # Note: process_document generates its own unique ID for the run
                        # filename/path will be added within process_document

                        future = executor.submit(
                            self.process_document, # Call the single doc processor
                            path,
                            collection_name,
                            doc_metadata_run
                        )
                        future_to_path[future] = path

                    # Process results as they complete
                    for future in as_completed(future_to_path):
                        path = future_to_path[future]
                        try:
                            doc_result = future.result() # Get result from the thread
                            aggregated_result["document_results"].append(doc_result)
                            aggregated_result["processed_documents"] += 1

                            if doc_result.get("success", False):
                                aggregated_result["successful_documents"] += 1
                                # Update overall progress
                                self._update_progress(increment_step=True, increment_success=True)
                            else:
                                aggregated_result["failed_documents"] += 1
                                # Update overall progress and add error from doc_result
                                self._update_progress(
                                    increment_step=True,
                                    increment_error=True,
                                    error_info={
                                        "document_path": path,
                                        "error": doc_result.get("error", "Unknown error during document processing")
                                    }
                                )
                                logger.error(f"Failed to process document {path}: {doc_result.get('error')}")

                        except Exception as e:
                            # Handle errors during future.result() itself
                            logger.error(f"Error retrieving result for document {path}: {e}", exc_info=True)
                            aggregated_result["failed_documents"] += 1
                            aggregated_result["processed_documents"] += 1
                            aggregated_result["document_results"].append({
                                "document_path": path,
                                "success": False,
                                "error": f"Concurrency error: {str(e)}"
                            })
                            self._update_progress(
                                increment_step=True,
                                increment_error=True,
                                error_info={
                                    "document_path": path,
                                    "error": f"Concurrency error: {str(e)}"
                                }
                            )
            else:
                # --- Process documents sequentially --- 
                logger.info(f"Processing {total_docs} documents sequentially...")
                for path in document_paths:
                    doc_metadata_run = base_metadata.copy()
                    doc_result = self.process_document(path, collection_name, doc_metadata_run)
                    aggregated_result["document_results"].append(doc_result)
                    aggregated_result["processed_documents"] += 1

                    if doc_result.get("success", False):
                        aggregated_result["successful_documents"] += 1
                        self._update_progress(increment_step=True, increment_success=True)
                    else:
                        aggregated_result["failed_documents"] += 1
                        self._update_progress(
                            increment_step=True,
                            increment_error=True,
                            error_info={
                                "document_path": path,
                                "error": doc_result.get("error", "Unknown error during document processing")
                            }
                        )
                        logger.error(f"Failed to process document {path}: {doc_result.get('error')}")

            # --- Finalize Aggregated Results --- 
            total_time = time.time() - overall_start_time
            aggregated_result["total_processing_time"] = total_time
            if aggregated_result["processed_documents"] > 0:
                 aggregated_result["average_processing_time"] = total_time / aggregated_result["processed_documents"]

            # Update final progress stage
            final_stage = ProcessingStage.COMPLETED if aggregated_result["failed_documents"] == 0 else ProcessingStage.FAILED
            self._update_progress(stage=final_stage)

            logger.info(f"Finished processing {total_docs} documents. Success: {aggregated_result['successful_documents']}, Failed: {aggregated_result['failed_documents']}. Total time: {total_time:.2f}s")
            return aggregated_result

        except Exception as e:
            error_time = time.time() - overall_start_time
            self.last_error = str(e)
            logger.error(f"Critical error during batch document processing: {e}", exc_info=True)
            self._update_progress(stage=ProcessingStage.FAILED, error_info={"error": f"Batch processing failed: {str(e)}"})
            return {
                "total_documents": len(document_paths),
                "processed_documents": self.progress.current_step,
                "successful_documents": self.progress.success_count,
                "failed_documents": self.progress.error_count + (len(document_paths) - self.progress.current_step), # Assume unprocessed failed
                "total_processing_time": error_time,
                "error": f"Batch processing failed: {str(e)}",
                "document_results": aggregated_result.get("document_results", []) # Include partial results if available
            }
    
    def document_to_text(self, 
                         document_path: str,
                         document_metadata: Optional[Dict[str, Any]] = None) -> Union[str, List[Document], None]:
        """
        Extract text or page documents from a file.

        Args:
            document_path: Path to the document file
            document_metadata: Optional metadata about the document (will be updated)

        Returns:
            - For PDFs: A list of langchain.schema.Document objects (one per page with metadata).
            - For other text types: Extracted text as a single string.
            - None if extraction failed.
        """
        try:
            # Update progress (consider this as step 1)
            self._update_progress(
                stage=ProcessingStage.EXTRACTING,
                increment_step=True # Assume extraction is one step regardless of type
            )

            logger.info(f"Extracting content from document: {document_path}")

            # Extract content using TextExtractor
            # The return type depends on the file type (List[Document] for PDF, str for others)
            extracted_content = self.extractor.extract_text(document_path)

            if extracted_content is None:
                error_msg = f"Failed to extract content from {document_path}: {self.extractor.last_error}"
                self.last_error = error_msg
                logger.error(error_msg)
                self._update_progress(
                    increment_error=True,
                    error_info={
                        "stage": ProcessingStage.EXTRACTING.value,
                        "document_path": document_path,
                        "error": self.extractor.last_error or "Extraction failed"
                    }
                )
                return None

            # Update metadata (Note: For PDFs, metadata is already within each Document object)
            # We can still get some top-level file metadata
            if document_metadata is None:
                document_metadata = {}
            try:
                base_metadata = self.extractor.get_document_metadata(document_path)
                document_metadata.update(base_metadata)
            except Exception as meta_err:
                 logger.warning(f"Could not retrieve base metadata for {document_path}: {meta_err}")

            if isinstance(extracted_content, str):
                logger.info(f"Successfully extracted {len(extracted_content)} characters from {document_path}")
            elif isinstance(extracted_content, list):
                logger.info(f"Successfully extracted {len(extracted_content)} page documents from {document_path}")

            self._update_progress(increment_success=True)
            return extracted_content

        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error in document_to_text for {document_path}: {e}", exc_info=True)
            self._update_progress(
                increment_error=True,
                error_info={
                    "stage": ProcessingStage.EXTRACTING.value,
                    "document_path": document_path,
                    "error": str(e)
                }
            )
            return None
    
    def text_to_chunks(self, 
                       extracted_content: Union[str, List[Document]], # Accept string or list of Docs
                       document_metadata: Optional[Dict[str, Any]] = None,
                       chunk_strategy: Optional[str] = None) -> Optional[List[TextChunk]]:
        """
        Break text or document pages into appropriate chunks.

        Args:
            extracted_content: The text string or list of Document objects (pages) to chunk.
            document_metadata: Optional metadata about the source document (used if content is str).
            chunk_strategy: Optional chunking strategy to override the default.

        Returns:
            A list of TextChunk objects, or None if chunking failed.
        """
        try:
            # Update progress
            self._update_progress(
                stage=ProcessingStage.CHUNKING,
                increment_step=True
            )

            # Use specified strategy or default
            strategy = chunk_strategy or self.chunk_strategy

            all_chunks = []

            if isinstance(extracted_content, str):
                # --- Handle single text string (e.g., from TXT, DOCX) --- 
                logger.info(f"Chunking single text string of length {len(extracted_content)} characters")
                if document_metadata is None:
                     document_metadata = {}
                # Generate a base ID if needed
                doc_id = document_metadata.get("document_id", str(uuid.uuid4()))

                chunks = self.chunker.chunk_text(extracted_content, strategy, document_metadata)
                if not chunks:
                    error_msg = f"Failed to chunk text: {self.chunker.last_error}"
                    self.last_error = error_msg
                    logger.error(error_msg)
                    self._update_progress(increment_error=True, error_info={"stage": ProcessingStage.CHUNKING.value, "error": error_msg})
                    return None

                # Add unique chunk IDs
                for i, chunk in enumerate(chunks):
                    chunk_id = f"{doc_id}_chunk_{i}"
                    chunk.update_metadata({"chunk_id": chunk_id})
                all_chunks.extend(chunks)

            elif isinstance(extracted_content, list):
                # --- Handle list of Document objects (e.g., from PDF pages) --- 
                logger.info(f"Chunking {len(extracted_content)} document pages...")
                total_pages_processed = 0
                for page_doc in extracted_content:
                    if not isinstance(page_doc, Document) or not hasattr(page_doc, 'page_content') or not hasattr(page_doc, 'metadata'):
                         logger.warning(f"Skipping invalid item in extracted content list: {type(page_doc)}")
                         continue

                    page_text = page_doc.page_content
                    page_metadata = page_doc.metadata.copy() # Use metadata from the page Document
                    page_num = page_metadata.get('page', 'unknown')
                    doc_id = page_metadata.get("document_id", document_metadata.get("document_id", str(uuid.uuid4()))) # Inherit doc_id if possible
                    page_metadata["document_id"] = doc_id # Ensure doc_id is in page meta

                    logger.debug(f"Chunking page {page_num} (length: {len(page_text)} chars)")

                    page_chunks = self.chunker.chunk_text(page_text, strategy, page_metadata)

                    if not page_chunks:
                        error_msg = f"Failed to chunk page {page_num}: {self.chunker.last_error}"
                        logger.warning(error_msg) # Log as warning, maybe page was empty
                        # Don't count as a major error unless needed
                        continue # Move to next page

                    # Add unique chunk IDs based on page and chunk index
                    for i, chunk in enumerate(page_chunks):
                        chunk_id = f"{doc_id}_page_{page_num}_chunk_{i}"
                        # Merge page metadata with chunk-specific ID
                        final_metadata = page_metadata.copy()
                        final_metadata.update(chunk.metadata) # Preserve chunker metadata if any
                        final_metadata["chunk_id"] = chunk_id
                        chunk.metadata = final_metadata # Assign updated metadata back

                    all_chunks.extend(page_chunks)
                    total_pages_processed += 1
                logger.info(f"Processed {total_pages_processed} pages into chunks.")

            else:
                 raise TypeError(f"Unexpected type for extracted_content: {type(extracted_content)}")

            if not all_chunks:
                 logger.warning("No chunks were generated from the input content.")
                 # Decide if this is an error or just an empty document
                 # self._update_progress(increment_error=True, error_info={...})
                 # return None

            logger.info(f"Successfully created a total of {len(all_chunks)} chunks")
            self._update_progress(increment_success=True)
            return all_chunks

        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error chunking content: {e}", exc_info=True)
            self._update_progress(
                increment_error=True,
                error_info={
                    "stage": ProcessingStage.CHUNKING.value,
                    "error": str(e)
                }
            )
            return None
    
    @backoff.on_exception(
        backoff.expo,
        Exception,
        max_tries=DEFAULT_MAX_RETRIES,
        base=DEFAULT_RETRY_DELAY
    )
    def _generate_embedding_with_retry(self, chunk: TextChunk) -> Optional[List[float]]:
        """
        Generate embedding for a chunk with retry logic.
        
        Args:
            chunk: The TextChunk to generate embedding for
            
        Returns:
            Embedding vector as a list of floats, or None if generation failed
        """
        return self.embedder.generate_embedding(chunk)
    
    def chunks_to_embeddings(self, 
                             chunks: List[TextChunk],
                             batch_size: Optional[int] = None) -> Optional[List[Dict[str, Any]]]:
        try:
            # Update stage and step for embedding
            self._update_progress(
                stage=ProcessingStage.EMBEDDING,
                increment_step=True
            )

            # Use batch embedding for improved performance
            batch_size = batch_size or self.concurrent_tasks
            texts = [chunk.get_text() for chunk in chunks]
            logger.info(f"Generating embeddings in batches (batch_size={batch_size}) for {len(chunks)} chunks")
            embeddings = self.embedder.generate_embeddings_batch(texts, batch_size)

            results = []
            success_count = 0
            error_count = 0
            for chunk, embedding in zip(chunks, embeddings):
                if embedding is not None:
                    results.append({
                        "text": chunk.get_text(),
                        "embedding": embedding,
                        "metadata": self._sanitize_metadata(chunk.get_metadata())
                    })
                    success_count += 1
                else:
                    logger.warning(f"No embedding returned for chunk {chunk.metadata.get('chunk_id')}")
                    error_count += 1

            logger.info(f"Successfully generated {success_count} embeddings, {error_count} errors")
            # Final progress update after embedding
            self._update_progress(increment_success=True)
            return results
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error generating embeddings: {e}")
            self._update_progress(
                increment_error=True,
                error_info={
                    "stage": ProcessingStage.EMBEDDING.value,
                    "error": str(e)
                }
            )
            return None
    
    def store_embeddings(self, 
                         embeddings_data: List[Dict[str, Any]],
                         collection_name: Optional[str] = None) -> Optional[Dict[str, Any]]:
        """
        Save chunks and embeddings to the vector store.
        
        Args:
            embeddings_data: List of dictionaries with text, embedding, and metadata
            collection_name: Optional name of the collection to store in
            
        Returns:
            A dictionary with storage results, or None if storage failed
        """
        try:
            # Update progress
            self._update_progress(
                stage=ProcessingStage.STORING,
                increment_step=True
            )
            
            logger.info(f"Storing {len(embeddings_data)} embeddings")
            
            # Use default collection if not specified
            collection = collection_name or self.vector_store.collection_name
            
            # Store embeddings in vector store
            storage_success = self.vector_store.store_embeddings(embeddings_data, collection)
            
            if not storage_success:
                error_msg = f"Failed to store embeddings: {self.vector_store.last_error}"
                self.last_error = error_msg
                logger.error(error_msg)
                
                self._update_progress(
                    increment_error=True,
                    error_info={
                        "stage": ProcessingStage.STORING.value,
                        "error": self.vector_store.last_error or "Failed to store embeddings"
                    }
                )
                return None
            
            logger.info(f"Successfully stored {len(embeddings_data)} embeddings in collection '{collection}'")
            
            # Update progress
            self._update_progress(increment_success=True)
            
            return {
                "collection_name": collection,
                "stored_count": len(embeddings_data)
            }
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error storing embeddings: {e}")
            
            self._update_progress(
                increment_error=True,
                error_info={
                    "stage": ProcessingStage.STORING.value,
                    "error": str(e)
                }
            )
            
            return None
    
    def _sanitize_metadata(self, metadata: Dict[str, Any]) -> Dict[str, Any]:
        """
        Sanitize metadata to ensure all values are of valid types for ChromaDB.
        
        ChromaDB requires metadata values to be str, int, float, or bool.
        This method converts any other types to strings or removes them.
        
        Args:
            metadata: The metadata dictionary to sanitize
            
        Returns:
            A sanitized copy of the metadata dictionary
        """
        if metadata is None:
            return {}
            
        sanitized = {}
        for key, value in metadata.items():
            if value is None:
                # Skip None values
                continue
            elif isinstance(value, (str, int, float, bool)):
                # Keep valid primitive types
                sanitized[key] = value
            elif isinstance(value, (list, tuple)):
                # Convert lists/tuples to strings
                sanitized[key] = str(value)
            elif isinstance(value, dict):
                # Convert nested dictionaries to strings
                sanitized[key] = str(value)
            else:
                # Convert any other type to string
                sanitized[key] = str(value)
                
        return sanitized
    
    def get_progress(self) -> Dict[str, Any]:
        """
        Get the current processing progress.
        
        Returns:
            A dictionary with progress information
        """
        with self.progress_lock:
            return self.progress.to_dict()
    
    def save_progress_to_file(self, output_file: str) -> bool:
        """
        Save the current progress to a JSON file.
        
        Args:
            output_file: Path to the output file
            
        Returns:
            True if successful, False otherwise
        """
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(os.path.abspath(output_file)), exist_ok=True)
            
            # Get progress data
            progress_data = self.get_progress()
            
            # Save to file
            with open(output_file, 'w', encoding='utf-8') as f:
                json.dump(progress_data, f, ensure_ascii=False, indent=2)
                
            logger.info(f"Saved progress to {output_file}")
            return True
            
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error saving progress: {e}")
            return False