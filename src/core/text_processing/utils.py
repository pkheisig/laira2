"""
Utility functions for text processing module.

This module provides helper functions for the text processing module,
including file type detection and other utilities.
"""

import os
import mimetypes
from typing import Optional, Tuple


def detect_file_type(file_path: str) -> Tuple[str, Optional[str]]:
    """
    Detect the file type based on extension and/or content.
    
    Args:
        file_path: Path to the file
        
    Returns:
        A tuple containing (file_type, mime_type)
        where file_type is one of: 'pdf', 'docx', 'txt', 'unknown'
        and mime_type is the detected MIME type or None if not detected
    """
    if not os.path.exists(file_path):
        raise FileNotFoundError(f"File not found: {file_path}")
    
    # Get file extension
    _, ext = os.path.splitext(file_path.lower())
    
    # Initialize mimetypes
    if not mimetypes.inited:
        mimetypes.init()
    
    # Get MIME type
    mime_type, _ = mimetypes.guess_type(file_path)
    
    # Determine file type based on extension
    if ext == '.pdf':
        return 'pdf', mime_type
    elif ext == '.docx':
        return 'docx', mime_type
    elif ext == '.txt':
        return 'txt', mime_type
    else:
        # Try to determine type based on content if extension is not recognized
        try:
            with open(file_path, 'rb') as f:
                header = f.read(8)  # Read first 8 bytes
                
                # Check for PDF signature
                if header.startswith(b'%PDF'):
                    return 'pdf', 'application/pdf'
                
                # Check for DOCX (ZIP) signature
                if header.startswith(b'PK\x03\x04'):
                    return 'docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
                
                # Try to read as text
                try:
                    with open(file_path, 'r', encoding='utf-8') as text_file:
                        text_file.read(100)  # Try to read some text
                    return 'txt', 'text/plain'
                except UnicodeDecodeError:
                    # Not a text file
                    pass
        except Exception as e:
            print(f"Error examining file content: {e}")
        
        return 'unknown', mime_type


def get_safe_filename(original_filename: str) -> str:
    """
    Convert a filename to a safe version that is filesystem-friendly.
    
    Args:
        original_filename: The original filename
        
    Returns:
        A safe version of the filename
    """
    # Replace spaces with underscores and remove other unsafe characters
    safe_name = "".join([c if c.isalnum() or c in "._- " else "_" for c in original_filename])
    safe_name = safe_name.replace(' ', '_')
    return safe_name