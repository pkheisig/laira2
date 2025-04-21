"""
Helper functions and classes for embedding routes in LAIRA.
"""

import os
import threading
import time
import uuid
import traceback
from flask import current_app
from src.core.processing.processor import DocumentProcessor
from src.routes.settings_routes import get_settings_path
import json

# Constants
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'doc', 'csv', 'md', 'html', 'json'}


class EmbeddingTask:
    """Class to track the status of an embedding task."""
    def __init__(self, project_id, file_paths):
        self.task_id = str(uuid.uuid4())
        self.project_id = project_id
        self.file_paths = file_paths
        self.status = "pending"
        self.progress = 0
        self.start_time = time.time()
        self.end_time = None
        self.results = {}
        self.error = None

    def to_dict(self):
        """Convert task to a dictionary for JSON serialization."""
        return {
            "task_id": self.task_id,
            "project_id": self.project_id,
            "status": self.status,
            "progress": self.progress,
            "start_time": self.start_time,
            "end_time": self.end_time,
            "file_count": len(self.file_paths),
            "error": self.error
        }


def get_tasks_file_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    os.makedirs(project_folder, exist_ok=True)
    return os.path.join(project_folder, 'embed_tasks.json')


def save_tasks_to_file(project_id):
    tasks = current_app.embedding_tasks if hasattr(current_app, 'embedding_tasks') else {}
    tasks_file = get_tasks_file_path(project_id)
    try:
        with open(tasks_file, 'w', encoding='utf-8') as f:
            json.dump({tid: data for tid, data in tasks.items()}, f, default=str, indent=2)
    except Exception as e:
        print(f"Error saving embedding tasks for project {project_id}: {e}")


def run_embedding_process(app, task):
    """Background function to run the embedding process within app context."""
    print(f"[TASK {task.task_id}] Starting run_embedding_process.")
    with app.app_context():
        try:
            task.status = "processing"
            print(f"[TASK {task.task_id}] Status set to processing.")

            project_upload_folder = os.path.join(
                app.config['UPLOAD_FOLDER'], task.project_id
            )
            vector_store_config = {
                "persist_directory": os.path.join(project_upload_folder, "database"),
                "project_id": task.project_id,
            }
            # Load processing settings for chunking
            try:
                settings_file = get_settings_path(task.project_id)
                with open(settings_file, 'r') as sf:
                    settings_data = json.load(sf)
                proc_settings = settings_data.get('processing_settings', {})
            except Exception:
                proc_settings = {}
            # Initialize DocumentProcessor with vector store and processing settings
            processor_config = {
                'vector_store_config': vector_store_config,
                'chunking_config': proc_settings,
                'chunk_strategy': proc_settings.get('chunk_strategy')
            }
            processor = DocumentProcessor(processor_config=processor_config)
            print(f"[TASK {task.task_id}] DocumentProcessor initialized with processing settings: {proc_settings}")

            current_task_id = task.task_id
            def progress_callback(progress_data):
                # Compute smooth overall progress across all files using chunk completion
                chunk_progress = progress_data.get("progress_percentage", 0.0) / 100.0
                files_done = processed_files  # number of files completed so far
                overall = ((files_done + chunk_progress) / total_files) * 100.0
                if hasattr(current_app, 'embedding_tasks') and current_task_id in current_app.embedding_tasks:
                    current_app.embedding_tasks[current_task_id]['progress'] = overall
                    current_app.embedding_tasks[current_task_id]['details'] = f"Processed {current_step}/{total_steps} files"
                    save_tasks_to_file(task.project_id)
                else:
                    print(f"[TASK {current_task_id}] Warning: Task ID not found during callback.")
                print(f"[TASK {current_task_id}] Overall progress: {overall:.2f}% ({current_step}/{total_steps})")

            processor.set_progress_callback(progress_callback)
            print(f"[TASK {task.task_id}] Progress callback set.")

            # Initialize embedding task state as a dict for serialization
            if not hasattr(current_app, 'embedding_tasks'):
                current_app.embedding_tasks = {}
            current_app.embedding_tasks[task.task_id] = {
                "status": "in_progress",
                "progress": 0.0,
                "start_time": task.start_time,
                "task_id": task.task_id,
                "details": f"Processing {len(task.file_paths)} files...",
                "results": []
            }
            save_tasks_to_file(task.project_id)

            # Process all files concurrently for improved performance
            aggregated = processor.process_documents(
                task.file_paths,
                collection_name=f"project_{task.project_id}",
                document_metadata={"project_id": task.project_id},
                concurrent=True
            )
            end_time = time.time()
            duration = end_time - task.start_time
            total_files = aggregated.get("total_documents", 0)
            success_count = aggregated.get("successful_documents", 0)
            failed_count = aggregated.get("failed_documents", 0)
            # Determine final status
            if failed_count == 0:
                final_status = "completed"
            elif success_count > 0:
                final_status = "completed_with_errors"
            else:
                final_status = "failed"
            # Build summary details
            if failed_count == 0:
                final_details = f"Processed {total_files} files in {duration:.2f}s. {success_count} succeeded."
            elif success_count == 0:
                final_details = f"Processed {total_files} files, all failed. Duration: {duration:.2f}s."
            else:
                final_details = f"Processed {total_files} files in {duration:.2f}s. {success_count} succeeded, {failed_count} failed."
            # Update task data
            current_app.embedding_tasks[task.task_id].update({
                "status": final_status,
                "progress": 100.0,
                "end_time": end_time,
                "duration": duration,
                "details": final_details,
                "results": aggregated.get("document_results", [])
            })
            save_tasks_to_file(task.project_id)
            print(f"[TASK {task.task_id}] Final status: {final_status}")
            # Update task object
            task.results = aggregated.get("document_results", [])
            task.end_time = end_time
            task.progress = 100

        except Exception as e:
            task.status = "failed"
            task.error = f"Exception in run_embedding_process: {e}\n{traceback.format_exc()}"
            task.end_time = time.time()
            task.progress = 0
            print(f"[TASK {task.task_id}] Embedding task failed: {e}")
            traceback.print_exc() 