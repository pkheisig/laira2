from flask import Blueprint, jsonify, current_app
import os
import threading
import time
import uuid
import traceback

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

# Modify run_embedding_process to accept the app object
def run_embedding_process(app, task):
    """Background function to run the embedding process within app context."""
    print(f"[TASK {task.task_id}] Starting run_embedding_process.") # Log start
    # Use app context to ensure access to current_app.config, etc.
    with app.app_context():
        try:
            task.status = "processing"
            print(f"[TASK {task.task_id}] Status set to processing.")
            
            project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], task.project_id)
            vector_store_config = {
                "persist_directory": os.path.join(project_upload_folder, "database"),
                "project_id": task.project_id,
            }
            processor = DocumentProcessor(processor_config={"vector_store_config": vector_store_config})
            print(f"[TASK {task.task_id}] DocumentProcessor initialized.")
            
            # Define the task_id here to be accessible in the callback's scope
            current_task_id = task.task_id
            
            def progress_callback(progress_data):
                # Log callback invocation
                print(f"[TASK {current_task_id}] Progress callback received: {progress_data}") 
                
                # Ensure progress is updated in the shared dictionary
                new_progress = progress_data.get("progress_percentage", 0.0) # Default to 0.0
                
                # Update task status stored on the app object (which is a dict)
                if hasattr(current_app, 'embedding_tasks') and current_task_id in current_app.embedding_tasks:
                     current_app.embedding_tasks[current_task_id]['progress'] = new_progress
                     # Also update stage and any other relevant fields from progress_data
                     current_app.embedding_tasks[current_task_id]['stage'] = progress_data.get("stage", "unknown")
                     current_app.embedding_tasks[current_task_id]['details'] = f"Stage: {progress_data.get('stage', '?')}, Progress: {new_progress:.1f}%"
                     print(f"[TASK {current_task_id}] Updated task progress in shared dict to: {new_progress:.2f}% Stage: {progress_data.get('stage')}")
                else:
                     print(f"[TASK {current_task_id}] Warning: Task ID not found in current_app.embedding_tasks during callback.")

            processor.set_progress_callback(progress_callback)
            print(f"[TASK {task.task_id}] Progress callback set.")
            
            results = []
            total_files = len(task.file_paths)
            processed_files = 0
            successful_files = 0 # Added counter for successful files

            # Initialize task status
            if not hasattr(current_app, 'embedding_tasks'):
                current_app.embedding_tasks = {}
            current_app.embedding_tasks[task.task_id] = {
                "status": "in_progress",
                "progress": 0.0,
                "start_time": task.start_time,
                "details": f"Processing {total_files} files...",
                "results": []
            }

            print(f"[TASK {task.task_id}] Starting loop over {total_files} files.")
            for i, file_path in enumerate(task.file_paths, 1):
                collection_name = f"project_{task.project_id}"
                print(f"[TASK {task.task_id}] Processing file {i}/{total_files}: {os.path.basename(file_path)}") # Log filename
                result = processor.process_document(
                    document_path=file_path,
                    collection_name=collection_name,
                    document_metadata={"project_id": task.project_id, "file_path": file_path}
                )
                print(f"[TASK {task.task_id}] Finished processing file {i}. Success: {result.get('success')}") # Log result
                results.append(result)
                processed_files += 1
                if result.get("success"): # Check if this specific file was successful
                    successful_files += 1
                # Progress is updated via callback within process_document

            end_time = time.time()
            duration = end_time - task.start_time
            print(f"[TASK {task.task_id}] Finished processing all {total_files} files in {duration:.2f} seconds.")
            print(f"[TASK {task.task_id}] Results summary: {successful_files} successful, {total_files - successful_files} failed.")

            # Determine final status based on results
            final_status = "completed"
            final_details = f"Processed {total_files} files in {duration:.2f}s. {successful_files} succeeded."
            if successful_files == 0 and total_files > 0:
                final_status = "failed"
                final_details = f"Processed {total_files} files, but all failed. Duration: {duration:.2f}s."
            elif successful_files < total_files:
                final_status = "completed_with_errors" # Or keep 'completed' but reflect errors in details?
                final_details = f"Processed {total_files} files in {duration:.2f}s. {successful_files} succeeded, {total_files - successful_files} failed."

            # Update final task status
            current_app.embedding_tasks[task.task_id].update({
                "status": final_status,
                "progress": 100.0, # Mark as 100% done processing the list
                "end_time": end_time,
                "duration": duration,
                "details": final_details,
                "results": results
            })
            print(f"[TASK {task.task_id}] Final status set to '{final_status}'. Details: {final_details}")

            task.results = {
                "processed_files": processed_files,
                "successful_files": successful_files,
                "failed_files": total_files - successful_files,
                "details": results # Contains success/error info per file
            }
            
            task.end_time = end_time
            task.progress = 100 # Mark progress as 100 since the loop finished
            
        except Exception as e:
            task.status = "failed"
            task.error = f"Unhandled exception in run_embedding_process: {e}\\n{traceback.format_exc()}" # Capture full exception
            task.end_time = time.time()
            task.progress = 0 # Reset progress on failure
            print(f"[TASK {task.task_id}] Embedding task failed due to unhandled exception: {e}. Status set to failed.")
            traceback.print_exc()

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
    app.embedding_tasks[task.task_id] = task
    
    # Pass the app object to the target function
    thread = threading.Thread(target=run_embedding_process, args=(app, task), daemon=True)
    thread.start()
    
    return jsonify({"success": True, "message": "Embedding started.", "task_id": task.task_id}), 202

@embed_bp.route('/embed/status/<task_id>', methods=['GET'])
def check_embedding_status_route(task_id):
    """Checks the status of an ongoing embedding task."""
    if not hasattr(current_app, 'embedding_tasks') or task_id not in current_app.embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    # Task data is now stored as a dict, return it directly
    task_data = current_app.embedding_tasks[task_id]
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