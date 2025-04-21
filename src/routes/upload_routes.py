from flask import Blueprint, request, jsonify, current_app
import os
from werkzeug.utils import secure_filename

# Assume VectorStore is accessible or imported if needed for deletion
# from src.core.text_processing.vector_store import VectorStore 

upload_bp = Blueprint('upload_bp', __name__)

ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'doc', 'csv', 'md', 'html', 'json'}

def allowed_file(filename):
    """Check if a file has an allowed extension."""
    parts = filename.rsplit('.', 1)
    if len(parts) == 1:
        return False
    extension = parts[1].lower()
    return extension in ALLOWED_EXTENSIONS

def get_sources_folder(project_id):
    return os.path.join(current_app.config['UPLOAD_FOLDER'], project_id, 'sources')

@upload_bp.route('/upload/<project_id>', methods=['POST'])
# @limiter.limit("10 per minute") # Rate limiting commented out
def upload_file_route(project_id):
    """Handles file uploads for a specific project."""
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    # Ensure project structure exists (idempotent)
    os.makedirs(os.path.join(project_upload_folder, 'sources'), exist_ok=True)
    # Ensure database folder exists for embeddings and vector store
    os.makedirs(os.path.join(project_upload_folder, 'database'), exist_ok=True)
    
    sources_folder = get_sources_folder(project_id)
    
    uploaded_files = []
    errors = []

    if 'files' in request.files:
        files_list = request.files.getlist('files')
        print(f"Processing {len(files_list)} files for project {project_id}")
        
        for file in files_list:
            if file.filename == '': continue
            
            if file and allowed_file(file.filename):
                try:
                    filename = secure_filename(file.filename)
                    filepath = os.path.join(sources_folder, filename)
                    
                    if os.path.exists(filepath):
                        errors.append(f"File '{filename}' already exists.")
                        continue
                        
                    file.save(filepath)
                    print(f"File saved: {filepath}")
                    uploaded_files.append({
                        "filename": filename,
                        "size": os.path.getsize(filepath)
                    })
                except Exception as e:
                    print(f"Error saving file {file.filename}: {e}")
                    errors.append(f"Failed to save '{file.filename}'.")
            elif file.filename:
                 errors.append(f"File type not allowed for '{file.filename}'.")

        if uploaded_files or errors:
            return jsonify({
                "success": bool(uploaded_files),
                "message": f"{len(uploaded_files)} file(s) uploaded.",
                "files": uploaded_files,
                "errors": errors
            }), 200 if uploaded_files else 400
        else:
             return jsonify({"error": "No valid files provided.", "success": False}), 400

    # Handle single file (consider deprecating if multi-upload is standard)
    elif 'file' in request.files:
         file = request.files['file']
         if file.filename == '': return jsonify({"error": "No selected file"}), 400
         if file and allowed_file(file.filename):
             filename = secure_filename(file.filename)
             filepath = os.path.join(sources_folder, filename)
             if os.path.exists(filepath): return jsonify({"error": f"File '{filename}' already exists."}), 409
             try:
                 file.save(filepath)
                 print(f"File saved: {filepath}")
                 return jsonify({"success": True, "message": f"File '{filename}' uploaded.", "filename": filename}), 200
             except Exception as e: return jsonify({"error": f"Failed to save file: {str(e)}"}), 500
         else: return jsonify({"error": "File type not allowed"}), 400
    else: return jsonify({"error": "No file part"}), 400

@upload_bp.route('/delete_source/<project_id>/<filename>', methods=['DELETE'])
# @limiter.limit("30 per minute") # Rate limiting commented out
def delete_source_file_route(project_id, filename):
    """Handles deleting a source file and its embeddings."""
    if '..' in filename or filename.startswith('/'):
        return jsonify({"error": "Invalid filename"}), 400

    sources_folder = get_sources_folder(project_id)
    filepath = os.path.join(sources_folder, filename)

    try:
        if os.path.exists(filepath) and os.path.isfile(filepath):
            os.remove(filepath)
            print(f"Deleted file: {filepath}")
            
            # Attempt to remove corresponding embeddings (best effort)
            try:
                project_db_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id, 'database')
                # Lazy import VectorStore here or pass it via app context if needed
                from src.core.text_processing.vector_store import VectorStore
                vector_store_config = {"persist_directory": project_db_folder, "project_id": project_id}
                vector_store = VectorStore(vector_store_config)
                collection_name = f"project_{project_id}"
                if collection_name in [c["name"] for c in vector_store.list_collections()]:
                    vector_store.delete_embeddings_by_filter(collection_name, {"file_path": filepath})
                    print(f"Deleted embeddings for: {filename}")
            except ImportError:
                 print("Warning: VectorStore not found, skipping embedding deletion.")
            except Exception as e:
                print(f"Warning: Failed to delete embeddings for {filename}: {e}")
                
            return jsonify({"success": f"File '{filename}' deleted."}), 200
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        print(f"Error deleting file {filepath}: {e}")
        return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500 