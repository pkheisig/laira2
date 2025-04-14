from flask import Blueprint, jsonify, current_app
import os
import threading
import time
import uuid

# Assuming DocumentProcessor is accessible
from src.core.processing.processor import DocumentProcessor

embed_bp = Blueprint('embed_bp', __name__)

# Re-define ALLOWED_EXTENSIONS here or import from a shared config module
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

def run_embedding_process(task):
    """Background function to run the embedding process."""
    try:
        task.status = "processing"
        # Ensure embedding_tasks is accessible (e.g., via app context or passed in)
        # For simplicity, assuming it's globally accessible within the app context
        # It's better to attach it to `current_app` if managing state there.
        
        project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], task.project_id)
        vector_store_config = {
            "persist_directory": os.path.join(project_upload_folder, "database"),
            "project_id": task.project_id,
        }
        processor = DocumentProcessor(processor_config={"vector_store_config": vector_store_config})
        
        def progress_callback(progress_data):
            task.progress = progress_data.get("progress_percentage", 0)
            # Consider logging progress instead of printing if it gets noisy
            # print(f"Embedding progress: {task.progress:.2f}%")
        
        processor.set_progress_callback(progress_callback)
        
        results = []
        for i, file_path in enumerate(task.file_paths):
            collection_name = f"project_{task.project_id}"
            result = processor.process_document(
                document_path=file_path,
                collection_name=collection_name,
                document_metadata={"project_id": task.project_id, "file_path": file_path} # Add file_path
            )
            results.append(result)
            task.progress = ((i + 1) / len(task.file_paths)) * 100
        
        task.results = {
            "processed_files": len(results),
            "successful_files": sum(1 for r in results if r.get("success", False)),
            "failed_files": sum(1 for r in results if not r.get("success", False)),
            "details": results # Could be large, consider summarizing
        }
        task.status = "completed"
        task.end_time = time.time()
        print(f"Embedding task {task.task_id} completed.")
        
    except Exception as e:
        task.status = "failed"
        task.error = str(e)
        task.end_time = time.time()
        print(f"Embedding task {task.task_id} failed: {e}")
        # Log the full traceback for detailed debugging
        # import traceback
        # traceback.print_exc()

@embed_bp.route('/embed/<project_id>', methods=['POST'])
# @limiter.limit("5 per hour") # Rate limiting commented out
def trigger_embedding_route(project_id):
    """Triggers the embedding process for all compatible source files in a project."""
    print(f"Triggering embedding for project: {project_id}")
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    
    if not os.path.exists(sources_folder):
         os.makedirs(sources_folder, exist_ok=True)
         return jsonify({"error": "Sources folder created, no files to embed yet."}), 404

    file_paths = []
    try:
        for filename in os.listdir(sources_folder):
            file_path = os.path.join(sources_folder, filename)
            if os.path.isfile(file_path):
                file_type = os.path.splitext(filename)[1].lower().lstrip('.')
                if file_type in ALLOWED_EXTENSIONS:
                    file_paths.append(file_path)
    except Exception as e:
        print(f"Error listing files in sources folder for {project_id}: {e}")
        return jsonify({"error": "Failed to access source files"}), 500
        
    if not file_paths:
        return jsonify({"error": "No compatible files found in sources folder."}), 404
    
    print(f"Found {len(file_paths)} files to embed for project {project_id}.")
    
    # Ensure embedding_tasks dictionary exists on app context
    if not hasattr(current_app, 'embedding_tasks'):
        current_app.embedding_tasks = {}

    task = EmbeddingTask(project_id, file_paths)
    current_app.embedding_tasks[task.task_id] = task
    
    thread = threading.Thread(target=run_embedding_process, args=(task,), daemon=True)
    thread.start()
    
    return jsonify({"success": True, "message": "Embedding started.", "task_id": task.task_id}), 202

@embed_bp.route('/embed/status/<task_id>', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def check_embedding_status_route(task_id):
    """Checks the status of an ongoing embedding task."""
    if not hasattr(current_app, 'embedding_tasks') or task_id not in current_app.embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    task = current_app.embedding_tasks[task_id]
    return jsonify(task.to_dict()), 200

@embed_bp.route('/embed/results/<task_id>', methods=['GET'])
# @limiter.limit("60 per minute") # Rate limiting commented out
def get_embedding_results_route(task_id):
    """Retrieves the results of a completed embedding task."""
    if not hasattr(current_app, 'embedding_tasks') or task_id not in current_app.embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    task = current_app.embedding_tasks[task_id]
    
    if task.status == "completed":
        return jsonify({"task_id": task.task_id, "status": task.status, "results": task.results}), 200
    elif task.status == "failed":
        return jsonify({"task_id": task.task_id, "status": task.status, "error": task.error}), 200 # Return 200 even for failed tasks
    else:
        return jsonify({"error": "Task not finished.", "status": task.status}), 400 # Task still pending/processing 