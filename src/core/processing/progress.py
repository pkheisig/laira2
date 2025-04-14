"""
Progress Tracking Module for LAIRA processing.

Contains the ProcessingStage enum and ProcessingProgress dataclass.
"""

import time
from typing import List, Dict, Any
from enum import Enum
from dataclasses import dataclass


class ProcessingStage(Enum):
    """Enum representing the stages of document processing."""
    INITIALIZED = "initialized"
    EXTRACTING = "extracting_text"
    CHUNKING = "chunking_text"
    EMBEDDING = "generating_embeddings"
    STORING = "storing_embeddings"
    COMPLETED = "completed"
    FAILED = "failed"


@dataclass
class ProcessingProgress:
    """Class for tracking processing progress."""
    stage: ProcessingStage
    total_steps: int
    current_step: int
    success_count: int
    error_count: int
    start_time: float
    last_update_time: float
    errors: List[Dict[str, Any]]

    @property
    def progress_percentage(self) -> float:
        """Calculate the overall progress percentage."""
        if self.total_steps == 0:
            return 0.0
        return min(100.0, (self.current_step / self.total_steps) * 100.0)

    @property
    def elapsed_time(self) -> float:
        """Calculate the elapsed time in seconds."""
        return time.time() - self.start_time

    def to_dict(self) -> Dict[str, Any]:
        """Convert progress to a dictionary for serialization."""
        return {
            "stage": self.stage.value,
            "total_steps": self.total_steps,
            "current_step": self.current_step,
            "success_count": self.success_count,
            "error_count": self.error_count,
            "progress_percentage": self.progress_percentage,
            "elapsed_time": self.elapsed_time,
            "errors": self.errors
        } 