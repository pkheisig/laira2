from flask import Blueprint, render_template, jsonify, current_app, request, send_from_directory
import os

project_bp = Blueprint('project_bp', __name__)

@project_bp.route('/')
def home():
    """Render the home page."""
    return render_template('index.html')

@project_bp.route('/projects', methods=['GET'])
def list_projects():
    """Return a summary list of projects found under UPLOAD_FOLDER.

    Shape matches what the frontend expects: { projects: [ { project_id, name?, description?,
    file_count, total_size, created_at } ] }
    """
    upload_root = current_app.config.get('UPLOAD_FOLDER')
    os.makedirs(upload_root, exist_ok=True)

    projects = []
    try:
        for entry in os.listdir(upload_root):
            project_path = os.path.join(upload_root, entry)
            if not os.path.isdir(project_path):
                continue

            sources_path = os.path.join(project_path, 'sources')
            file_count = 0
            total_size = 0
            if os.path.isdir(sources_path):
                for root, _dirs, files in os.walk(sources_path):
                    for fname in files:
                        fpath = os.path.join(root, fname)
                        try:
                            total_size += os.path.getsize(fpath)
                            file_count += 1
                        except OSError:
                            pass

            try:
                created_at = os.path.getctime(project_path)
            except Exception:
                created_at = None

            projects.append({
                'project_id': entry,
                'file_count': file_count,
                'total_size': total_size,
                'created_at': created_at,
            })
    except Exception as e:
        return jsonify({'error': f'Failed to list projects: {e}'}), 500

    # Sort by most recently modified/created first for convenience
    projects.sort(key=lambda p: p.get('created_at') or 0, reverse=True)
    return jsonify({'projects': projects}), 200

@project_bp.route('/project/<project_id>')
def project_view(project_id):
    """Render the project page for a specific project."""
    print(f"Accessing project: {project_id}")
    
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder):
        os.makedirs(project_upload_folder, exist_ok=True)
        print(f"Created project directory: {project_upload_folder}")
        os.makedirs(os.path.join(project_upload_folder, 'sources'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'database'), exist_ok=True)
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

@project_bp.route('/project/<project_id>/sources/<filename>', methods=['GET'])
def serve_source_file(project_id, filename):
    """Serve a source file for viewing in browser (PDF, etc.)"""
    project_upload_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    return send_from_directory(sources_folder, filename)

@project_bp.route('/project/<project_id>/rename', methods=['POST'])
def rename_project_route(project_id):
    """Renames a project folder inside UPLOAD_FOLDER."""
    data = request.get_json() or {}
    new_id = data.get('new_project_id')
    if not new_id:
        return jsonify({'error': 'new_project_id missing'}), 400
    old_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    new_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], new_id)
    if not os.path.exists(old_folder):
        return jsonify({'error': 'project not found'}), 404
    if os.path.exists(new_folder):
        return jsonify({'error': 'project with new name already exists'}), 409
    try:
        os.rename(old_folder, new_folder)
        return jsonify({'success': True, 'message': f'Renamed project from {project_id} to {new_id}'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500 