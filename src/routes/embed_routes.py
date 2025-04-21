from flask import Blueprint, jsonify, current_app
import os
import threading
import time
import uuid
import traceback

# Assuming DocumentProcessor is accessible
from src.routes.embed_helpers import ALLOWED_EXTENSIONS, EmbeddingTask, run_embedding_process

embed_bp = Blueprint('embed_bp', __name__)

# Route handlers will import and use the helpers from embed_helpers

@embed_bp.route('/embed/<project_id>', methods=['POST'])
def trigger_embedding_route(project_id):
    """Triggers the embedding process for all compatible source files in a project."""
    print(f"Triggering embedding for project: {project_id}")
    # Get the actual Flask app object to pass to the thread
    app = current_app._get_current_object()
    
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
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
    
    if not hasattr(app, 'embedding_tasks'):
        app.embedding_tasks = {}

    task = EmbeddingTask(project_id, file_paths)
    # Store initial task state as serializable dict
    app.embedding_tasks[task.task_id] = task.to_dict()
    
    # Pass the app object to the target function
    thread = threading.Thread(target=run_embedding_process, args=(app, task), daemon=True)
    thread.start()
    
    return jsonify({"success": True, "message": "Embedding started.", "task_id": task.task_id}), 202

@embed_bp.route('/embed/status/<task_id>', methods=['GET'])
def check_embedding_status_route(task_id):
    """Checks the status of an ongoing embedding task."""
    if not hasattr(current_app, 'embedding_tasks') or task_id not in current_app.embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    # Retrieve task data (dict or EmbeddingTask) and serialize
    raw = current_app.embedding_tasks[task_id]
    # If an EmbeddingTask instance, convert to dict
    if hasattr(raw, 'to_dict') and callable(raw.to_dict):
        task_data = raw.to_dict()
    else:
        task_data = raw
    return jsonify(task_data), 200

@embed_bp.route('/embed/results/<task_id>', methods=['GET'])
def get_embedding_results_route(task_id):
    """Retrieves the results of a completed embedding task."""
    if not hasattr(current_app, 'embedding_tasks') or task_id not in current_app.embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    # Task data is stored as a dict
    task_data = current_app.embedding_tasks[task_id]
    task_status = task_data.get("status")

    if task_status in ["completed", "completed_with_errors", "failed"]:
        # Return relevant parts of the dictionary
        response = {
            "task_id": task_id,
            "status": task_status,
            "details": task_data.get("details"),
            "results": task_data.get("results", []), # Detailed per-file results
            "error": task_data.get("error") # Overall task error, if any
        }
        # Clean up response, remove None error field if status is not 'failed'
        if task_status != "failed" and "error" in response:
             del response["error"]
        return jsonify(response), 200
    else:
        return jsonify({"error": "Task not finished.", "status": task_status}), 400