from flask import Blueprint, render_template, jsonify, current_app
import os

project_bp = Blueprint('project_bp', __name__)

@project_bp.route('/')
def home():
    """Render the home page."""
    return render_template('index.html')

@project_bp.route('/project/<project_id>')
def project_view(project_id):
    """Render the project page for a specific project."""
    print(f"Accessing project: {project_id}")
    
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder):
        os.makedirs(project_upload_folder)
        print(f"Created project directory: {project_upload_folder}")
        
        os.makedirs(os.path.join(project_upload_folder, 'sources'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'chat_history'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'notes'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'database'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'settings'), exist_ok=True)
        print(f"Created project subfolders for {project_id}")
    
    return render_template('index.html', project_id=project_id)

@project_bp.route('/project/<project_id>/files', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def list_project_files(project_id):
    """List all files in a project's sources directory."""
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    
    if not os.path.exists(sources_folder):
        os.makedirs(sources_folder, exist_ok=True)
        return jsonify({"files": [], "message": "Sources directory initialized"}), 200
    
    files = []
    try:
        for filename in os.listdir(sources_folder):
            file_path = os.path.join(sources_folder, filename)
            if os.path.isfile(file_path):
                file_size = os.path.getsize(file_path)
                files.append({
                    "name": filename,
                    "size": file_size,
                    # "path": file_path, # Avoid exposing full server path
                    "type": os.path.splitext(filename)[1].lower().lstrip('.') or "unknown"
                })
    except Exception as e:
        print(f"Error listing project files for {project_id}: {e}")
        return jsonify({"error": "Failed to list files"}), 500
        
    return jsonify({"files": files, "count": len(files)}), 200 