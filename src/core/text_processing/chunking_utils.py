import logging
import math
from typing import List, Dict, Any, Optional

# Import tokenizer for token estimation
from tokenizers import Tokenizer
from tokenizers.models import BPE
from tokenizers.pre_tokenizers import Whitespace

# Set up logging
logger = logging.getLogger(__name__)

# Default config values needed for merge_small_chunks
DEFAULT_CHUNK_SIZE = 1000  # characters

# Initialize tokenizer for token estimation
try:
    # Use a simple BPE tokenizer as a fallback
    tokenizer = Tokenizer(BPE())
    tokenizer.pre_tokenizer = Whitespace()
except Exception as e:
    logger.warning(f"Failed to initialize tokenizer: {e}. Token estimation will be approximate.")
    tokenizer = None


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


def estimate_tokens(text: str) -> int:
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
        if tokenizer:
            encoding = tokenizer.encode(text)
            return len(encoding.ids)
        else:
            # Simple approximation: ~4 characters per token for English text
            # This is a rough estimate and will vary by model and language
            return math.ceil(len(text) / 4)
    except Exception as e:
        logger.warning(f"Error estimating tokens: {e}. Using fallback method.")
        # Fallback to even simpler approximation
        return math.ceil(len(text.split()) * 1.3)  # ~1.3 tokens per word


def get_optimal_chunk_size(
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
        estimated_tokens_val = estimate_tokens(text_sample)
        if estimated_tokens_val > 0:
            char_per_token = len(text_sample) / estimated_tokens_val

    # Calculate and return the recommended chunk size
    # Using 90% of the max to leave some margin for error
    return int(max_tokens_per_chunk * char_per_token * 0.9)


def merge_small_chunks(
                       chunks: List[TextChunk],
                       min_chunk_size: int,
                       max_chunk_size: Optional[int] = None,
                       config: Optional[Dict[str, Any]] = None) -> List[TextChunk]:
    """
    Merge small chunks to ensure minimum chunk size.

    Args:
        chunks: List of TextChunk objects
        min_chunk_size: Minimum size (in characters) for a chunk
        max_chunk_size: Optional maximum size for merged chunks
        config: Optional configuration dictionary (for default chunk size)

    Returns:
        List of TextChunk objects with small chunks merged
    """
    if not chunks:
        return []

    # Use default max size if not specified
    config = config or {}
    max_size = max_chunk_size or config.get("chunk_size", DEFAULT_CHUNK_SIZE)

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
            current_chunk.metadata["estimated_tokens"] = estimate_tokens(current_chunk.text)
            current_chunk.metadata["merged"] = True

            # If we have a list of merged indices, update it
            if "merged_indices" not in current_chunk.metadata:
                current_chunk.metadata["merged_indices"] = [current_chunk.metadata["chunk_index"]]

            current_chunk.metadata["merged_indices"].append(chunk.metadata["chunk_index"])

    # Add the last chunk if it exists
    if current_chunk:
        result.append(current_chunk)

    return result
