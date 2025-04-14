"""
Text Chunker Module for LAIRA.

This module provides the TextChunker class for breaking down documents into
manageable segments for embedding and retrieval.
"""

import re
import logging
from typing import List, Dict, Any, Optional, Union, Tuple
import math

# Import tokenizer for token estimation
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import Whitespace

# Set up logging
logger = logging.getLogger(__name__)


class TextChunk:
    """
    A class representing a chunk of text with associated metadata.
    
    This class stores both the text content of a chunk and its metadata,
    such as the source document, position in the document, etc.
    """
    
    def __init__(self, 
                 text: str, 
                 metadata: Optional[Dict[str, Any]] = None):
        """
        Initialize a TextChunk with text content and metadata.
        
        Args:
            text: The text content of the chunk
            metadata: Optional metadata dictionary with information about the chunk
        """
        self.text = text
        self.metadata = metadata or {}
    
    def __str__(self) -> str:
        """Return a string representation of the chunk."""
        return f"TextChunk(length={len(self.text)}, metadata={self.metadata})"
    
    def __repr__(self) -> str:
        """Return a detailed string representation of the chunk."""
        return self.__str__()
    
    def get_text(self) -> str:
        """Get the text content of the chunk."""
        return self.text
    
    def get_metadata(self) -> Dict[str, Any]:
        """Get the metadata of the chunk."""
        return self.metadata
    
    def update_metadata(self, new_metadata: Dict[str, Any]) -> None:
        """
        Update the chunk's metadata with new values.
        
        Args:
            new_metadata: Dictionary with metadata to update or add
        """
        self.metadata.update(new_metadata)


class TextChunker:
    """
    A class for chunking text into manageable segments.
    
    This class provides methods to break down large documents into smaller chunks
    using various strategies, such as fixed size, paragraph-based, or overlapping chunks.
    It also handles metadata and token estimation.
    """
    
    # Default configuration values
    DEFAULT_CHUNK_SIZE = 1000  # characters
    DEFAULT_CHUNK_OVERLAP = 200  # characters
    DEFAULT_SEPARATOR = "\n\n"  # paragraph separator
    
    def __init__(self, chunking_config: Optional[Dict[str, Any]] = None):
        """
        Initialize the TextChunker with optional configuration.
        
        Args:
            chunking_config: Optional configuration dictionary for chunking settings
        """
        self.config = chunking_config or {}
        self.last_error = None
        
        # Initialize tokenizer for token estimation
        try:
            # Use a simple BPE tokenizer as a fallback
            self.tokenizer = Tokenizer(BPE())
            self.tokenizer.pre_tokenizer = Whitespace()
        except Exception as e:
            logger.warning(f"Failed to initialize tokenizer: {e}. Token estimation will be approximate.")
            self.tokenizer = None
    
    def chunk_text(self, 
                   text: str, 
                   strategy: str = "size", 
                   document_metadata: Optional[Dict[str, Any]] = None,
                   **kwargs) -> List[TextChunk]:
        """
        Chunk text using the specified strategy.
        
        Args:
            text: The text to chunk
            strategy: The chunking strategy to use ('size', 'paragraph', or 'overlap')
            document_metadata: Optional metadata about the source document
            **kwargs: Additional arguments for the specific chunking strategy
            
        Returns:
            A list of TextChunk objects
            
        Raises:
            ValueError: If an invalid chunking strategy is specified
        """
        try:
            # Reset last error
            self.last_error = None
            
            # Validate input
            if not text:
                return []
            
            # Initialize document metadata
            doc_metadata = document_metadata or {}
            
            # Choose chunking strategy
            if strategy == "size":
                return self.chunk_by_size(text, doc_metadata, **kwargs)
            elif strategy == "paragraph":
                return self.chunk_by_paragraph(text, doc_metadata, **kwargs)
            elif strategy == "overlap":
                return self.chunk_with_overlap(text, doc_metadata, **kwargs)
            else:
                error_msg = f"Unsupported chunking strategy: {strategy}"
                self.last_error = error_msg
                logger.error(error_msg)
                raise ValueError(error_msg)
                
        except Exception as e:
            self.last_error = str(e)
            logger.error(f"Error chunking text: {e}")
            raise
    
    def chunk_by_size(self, 
                      text: str, 
                      document_metadata: Dict[str, Any],
                      chunk_size: Optional[int] = None) -> List[TextChunk]:
        """
        Split text into chunks of specified character length.
        
        Args:
            text: The text to chunk
            document_metadata: Metadata about the source document
            chunk_size: The maximum size of each chunk in characters
            
        Returns:
            A list of TextChunk objects
        """
        # Get chunk size from config or use default
        size = chunk_size or self.config.get("chunk_size", self.DEFAULT_CHUNK_SIZE)
        
        # Split text into chunks
        chunks = []
        current_pos = 0
        text_length = len(text)
        
        chunk_index = 0
        while current_pos < text_length:
            # Calculate end position for this chunk
            end_pos = min(current_pos + size, text_length)
            
            # Adjust end position to avoid cutting words
            if end_pos < text_length:
                # Look for a good breaking point (whitespace)
                while end_pos > current_pos and not text[end_pos].isspace():
                    end_pos -= 1
                
                # If we couldn't find a good breaking point, just use the calculated end
                if end_pos == current_pos:
                    end_pos = min(current_pos + size, text_length)
            
            # Extract chunk text
            chunk_text = text[current_pos:end_pos].strip()
            
            # Create metadata for this chunk
            chunk_metadata = document_metadata.copy()
            chunk_metadata.update({
                "chunk_index": chunk_index,
                "chunk_start_char": current_pos,
                "chunk_end_char": end_pos,
                "chunk_strategy": "size",
                "chunk_size_chars": len(chunk_text),
                "estimated_tokens": self.estimate_tokens(chunk_text)
            })
            
            # Create and add chunk
            chunk = TextChunk(chunk_text, chunk_metadata)
            chunks.append(chunk)
            
            # Move to next position
            current_pos = end_pos
            chunk_index += 1
        
        return chunks
    
    def chunk_by_paragraph(self, 
                           text: str, 
                           document_metadata: Dict[str, Any],
                           separator: Optional[str] = None,
                           max_paragraph_length: Optional[int] = None) -> List[TextChunk]:
        """
        Split text into chunks based on paragraph breaks.
        
        Args:
            text: The text to chunk
            document_metadata: Metadata about the source document
            separator: The separator to use for paragraphs
            max_paragraph_length: Maximum length for a paragraph before forcing a split
            
        Returns:
            A list of TextChunk objects
        """
        # Get separator and max length from config or use defaults
        sep = separator or self.config.get("paragraph_separator", self.DEFAULT_SEPARATOR)
        max_length = max_paragraph_length or self.config.get("max_paragraph_length", self.DEFAULT_CHUNK_SIZE)
        
        # Split text into paragraphs
        paragraphs = re.split(f"({re.escape(sep)})", text)
        
        # Combine separator with the paragraph that follows it
        combined_paragraphs = []
        i = 0
        while i < len(paragraphs):
            if i + 1 < len(paragraphs) and paragraphs[i] == sep:
                combined_paragraphs.append(paragraphs[i] + paragraphs[i+1])
                i += 2
            else:
                combined_paragraphs.append(paragraphs[i])
                i += 1
        
        # Create chunks from paragraphs
        chunks = []
        current_chunk = ""
        current_start = 0
        chunk_index = 0
        
        for paragraph in combined_paragraphs:
            # Skip empty paragraphs
            if not paragraph.strip():
                continue
                
            # If adding this paragraph would exceed max length, create a new chunk
            if len(current_chunk) + len(paragraph) > max_length and current_chunk:
                # Create metadata for this chunk
                chunk_metadata = document_metadata.copy()
                chunk_metadata.update({
                    "chunk_index": chunk_index,
                    "chunk_start_char": current_start,
                    "chunk_end_char": current_start + len(current_chunk),
                    "chunk_strategy": "paragraph",
                    "chunk_size_chars": len(current_chunk),
                    "estimated_tokens": self.estimate_tokens(current_chunk)
                })
                
                # Create and add chunk
                chunk = TextChunk(current_chunk.strip(), chunk_metadata)
                chunks.append(chunk)
                
                # Reset current chunk
                current_start += len(current_chunk)
                current_chunk = ""
                chunk_index += 1
            
            # Add paragraph to current chunk
            current_chunk += paragraph
        
        # Add the last chunk if there's anything left
        if current_chunk:
            chunk_metadata = document_metadata.copy()
            chunk_metadata.update({
                "chunk_index": chunk_index,
                "chunk_start_char": current_start,
                "chunk_end_char": current_start + len(current_chunk),
                "chunk_strategy": "paragraph",
                "chunk_size_chars": len(current_chunk),
                "estimated_tokens": self.estimate_tokens(current_chunk)
            })
            
            chunk = TextChunk(current_chunk.strip(), chunk_metadata)
            chunks.append(chunk)
        
        return chunks
    
    def chunk_with_overlap(self, 
                           text: str, 
                           document_metadata: Dict[str, Any],
                           chunk_size: Optional[int] = None,
                           overlap_size: Optional[int] = None,
                           overlap_percentage: Optional[float] = None) -> List[TextChunk]:
        """
        Split text into chunks with specified overlap between chunks.
        
        Args:
            text: The text to chunk
            document_metadata: Metadata about the source document
            chunk_size: The maximum size of each chunk in characters
            overlap_size: The size of overlap between chunks in characters
            overlap_percentage: The percentage of chunk size to use as overlap
            
        Returns:
            A list of TextChunk objects
        """
        # Get chunk size from config or use default
        size = chunk_size or self.config.get("chunk_size", self.DEFAULT_CHUNK_SIZE)
        
        # Determine overlap size
        if overlap_size is not None:
            overlap = overlap_size
        elif overlap_percentage is not None:
            overlap = int(size * overlap_percentage)
        else:
            overlap = self.config.get("chunk_overlap", self.DEFAULT_CHUNK_OVERLAP)
        
        # Ensure overlap is not larger than chunk size
        overlap = min(overlap, size - 1)
        
        # Split text into chunks with overlap
        chunks = []
        current_pos = 0
        text_length = len(text)
        
        chunk_index = 0
        while current_pos < text_length:
            # Calculate end position for this chunk
            end_pos = min(current_pos + size, text_length)
            
            # Adjust end position to avoid cutting words
            if end_pos < text_length:
                # Look for a good breaking point (whitespace)
                while end_pos > current_pos and not text[end_pos].isspace():
                    end_pos -= 1
                
                # If we couldn't find a good breaking point, just use the calculated end
                if end_pos == current_pos:
                    end_pos = min(current_pos + size, text_length)
            
            # Extract chunk text
            chunk_text = text[current_pos:end_pos].strip()
            
            # Create metadata for this chunk
            chunk_metadata = document_metadata.copy()
            chunk_metadata.update({
                "chunk_index": chunk_index,
                "chunk_start_char": current_pos,
                "chunk_end_char": end_pos,
                "chunk_strategy": "overlap",
                "chunk_size_chars": len(chunk_text),
                "overlap_size_chars": overlap,
                "estimated_tokens": self.estimate_tokens(chunk_text)
            })
            
            # Create and add chunk
            chunk = TextChunk(chunk_text, chunk_metadata)
            chunks.append(chunk)
            
            # Move to next position with overlap
            current_pos = end_pos - overlap if end_pos < text_length else text_length
            
            # Ensure we make progress
            if current_pos <= chunks[-1].metadata["chunk_start_char"]:
                current_pos = chunks[-1].metadata["chunk_end_char"]
                
            chunk_index += 1
        
        return chunks
    
    def estimate_tokens(self, text: str) -> int:
        """
        Estimate the number of tokens in a text string.
        
        This method provides an estimate of how many tokens an LLM would use
        for the given text. It uses a tokenizer if available, or falls back
        to a simple approximation.
        
        Args:
            text: The text to estimate tokens for
            
        Returns:
            Estimated number of tokens
        """
        if not text:
            return 0
            
        try:
            # Use tokenizer if available
            if self.tokenizer:
                encoding = self.tokenizer.encode(text)
                return len(encoding.ids)
            else:
                # Simple approximation: ~4 characters per token for English text
                # This is a rough estimate and will vary by model and language
                return math.ceil(len(text) / 4)
        except Exception as e:
            logger.warning(f"Error estimating tokens: {e}. Using fallback method.")
            # Fallback to even simpler approximation
            return math.ceil(len(text.split()) * 1.3)  # ~1.3 tokens per word
    
    def get_optimal_chunk_size(self, 
                               max_tokens_per_chunk: int, 
                               text_sample: Optional[str] = None) -> int:
        """
        Calculate the optimal chunk size in characters based on token limit.
        
        Args:
            max_tokens_per_chunk: Maximum number of tokens allowed per chunk
            text_sample: Optional sample text to calibrate the estimation
            
        Returns:
            Recommended chunk size in characters
        """
        # Default character-to-token ratio (varies by language and content)
        char_per_token = 4.0
        
        # If we have a text sample, use it to calibrate the ratio
        if text_sample and len(text_sample) > 100:
            estimated_tokens = self.estimate_tokens(text_sample)
            if estimated_tokens > 0:
                char_per_token = len(text_sample) / estimated_tokens
        
        # Calculate and return the recommended chunk size
        # Using 90% of the max to leave some margin for error
        return int(max_tokens_per_chunk * char_per_token * 0.9)
    
    def merge_small_chunks(self, 
                           chunks: List[TextChunk], 
                           min_chunk_size: int,
                           max_chunk_size: Optional[int] = None) -> List[TextChunk]:
        """
        Merge small chunks to ensure minimum chunk size.
        
        Args:
            chunks: List of TextChunk objects
            min_chunk_size: Minimum size (in characters) for a chunk
            max_chunk_size: Optional maximum size for merged chunks
            
        Returns:
            List of TextChunk objects with small chunks merged
        """
        if not chunks:
            return []
            
        # Use default max size if not specified
        max_size = max_chunk_size or self.config.get("chunk_size", self.DEFAULT_CHUNK_SIZE)
        
        result = []
        current_chunk = None
        
        for chunk in chunks:
            # If this is the first chunk or current merged chunk would be too large
            if (current_chunk is None or 
                len(current_chunk.text) + len(chunk.text) > max_size):
                
                # Add the current chunk to results if it exists and meets min size
                if current_chunk and len(current_chunk.text) >= min_chunk_size:
                    result.append(current_chunk)
                
                # Start a new current chunk
                current_chunk = TextChunk(
                    chunk.text,
                    chunk.metadata.copy()
                )
            else:
                # Merge with current chunk
                current_chunk.text += f"\n\n{chunk.text}"
                
                # Update metadata
                current_chunk.metadata["chunk_end_char"] = chunk.metadata["chunk_end_char"]
                current_chunk.metadata["chunk_size_chars"] = len(current_chunk.text)
                current_chunk.metadata["estimated_tokens"] = self.estimate_tokens(current_chunk.text)
                current_chunk.metadata["merged"] = True
                
                # If we have a list of merged indices, update it
                if "merged_indices" not in current_chunk.metadata:
                    current_chunk.metadata["merged_indices"] = [current_chunk.metadata["chunk_index"]]
                
                current_chunk.metadata["merged_indices"].append(chunk.metadata["chunk_index"])
        
        # Add the last chunk if it exists
        if current_chunk:
            result.append(current_chunk)
        
        return result