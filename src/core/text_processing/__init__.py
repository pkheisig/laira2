"""
Text Processing Module for LAIRA.

This module provides functionality for extracting text from various document formats,
chunking text into manageable segments, generating embeddings, storing in vector databases,
and preparing it for analysis.
"""

# Expose key classes and functions from the text processing modules

from .text_extractor import TextExtractor
from .text_chunker import TextChunker, TextChunk
from .text_embedder import TextEmbedder
from .vector_store import VectorStore
from .utils import detect_file_type, get_safe_filename

# We no longer export DocumentProcessor, ProcessingStage, ProcessingProgress from here
# They should be imported from src.core.processing if needed elsewhere

__all__ = [
    "TextExtractor",
    "TextChunker",
    "TextChunk",
    "TextEmbedder",
    "VectorStore",
    "detect_file_type",
    "get_safe_filename",
]