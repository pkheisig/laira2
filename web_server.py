from flask import Flask, render_template, request, jsonify
import os

# Initialize Flask app
app = Flask(__name__)

# Configuration (you might want to move this to a config file later)
UPLOAD_FOLDER = 'uploads'
ALLOWED_EXTENSIONS = {'pdf', 'txt', 'md'} # Add more as needed
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER

# Ensure the upload folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

def allowed_file(filename):
    """Checks if the file extension is allowed."""
    return '.' in filename and \
           filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

@app.route('/')
def home():
    """Renders the project dashboard."""
    # Placeholder for actual project data (fetch from database/storage later)
    projects = [
        {'id': 'proj1', 'title': 'Sample Project Alpha', 'date': 'Aug 1, 2024', 'sources': 5},
        {'id': 'proj2', 'title': 'Research Notes - Beta', 'date': 'Jul 28, 2024', 'sources': 12},
        {'id': 'proj3', 'title': 'Meeting Summaries', 'date': 'Jul 25, 2024', 'sources': 3},
    ]
    return render_template('home.html', projects=projects)

@app.route('/project/<project_id>')
def project_view(project_id):
    """Renders the main chat/source view for a specific project."""
    print(f"Accessing project: {project_id}")
    # No longer passing dummy sources
    return render_template('index.html', project_id=project_id)

@app.route('/upload/<project_id>', methods=['POST']) # Modified to accept project_id
def upload_file(project_id):
    """Handles file uploads for a specific project."""
    # Ensure a project-specific upload folder exists or handle storage appropriately
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder):
        os.makedirs(project_upload_folder)

    if 'file' not in request.files:
        return jsonify({"error": "No file part"}), 400
    file = request.files['file']
    if file.filename == '':
        return jsonify({"error": "No selected file"}), 400
    if file and allowed_file(file.filename):
        # In a real app, you'd want to secure the filename
        filename = file.filename # Consider securing filename (e.g., werkzeug.utils.secure_filename)
        filepath = os.path.join(project_upload_folder, filename)
        file.save(filepath)
        # Here you would trigger the processing of the uploaded file for the specific project
        # e.g., add_source_to_project(project_id, filepath)
        return jsonify({"success": f"File '{filename}' uploaded to project '{project_id}' successfully."}), 200
    else:
        return jsonify({"error": "File type not allowed"}), 400

@app.route('/ask/<project_id>', methods=['POST']) # Modified to accept project_id
def ask_question(project_id):
    """Handles user questions for a specific project."""
    data = request.get_json()
    question = data.get('question')
    if not question:
        return jsonify({"error": "No question provided"}), 400

    # Placeholder for the actual query logic using project_id
    # response = query_project_engine(project_id, question)
    response = f"Project '{project_id}' placeholder answer to: '{question}'"

    return jsonify({"answer": response})

# Add a route for deleting sources
@app.route('/delete_source/<project_id>/<filename>', methods=['DELETE'])
def delete_source_file(project_id, filename):
    """Handles deleting a source file."""
    # Basic security: Ensure filename is not trying to escape the folder
    if '..' in filename or filename.startswith('/'):
        return jsonify({"error": "Invalid filename"}), 400

    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    filepath = os.path.join(project_upload_folder, filename)

    try:
        if os.path.exists(filepath) and os.path.isfile(filepath):
            os.remove(filepath)
            # TODO: Here you should also remove the corresponding embeddings/index data
            # associated with this file from your vector store (ChromaDB etc.)
            print(f"Deleted file: {filepath}")
            return jsonify({"success": f"File '{filename}' deleted."}), 200
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        print(f"Error deleting file {filepath}: {e}")
        return jsonify({"error": "Failed to delete file"}), 500

# Add a route for triggering embedding
@app.route('/embed/<project_id>', methods=['POST'])
def trigger_embedding(project_id):
    """Triggers the embedding process for a given project."""
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder) or not os.listdir(project_upload_folder):
        return jsonify({"error": "No source files found for this project to embed."}), 404

    # TODO: Implement asynchronous embedding process trigger
    # This should ideally start a background task (e.g., using Celery, RQ, or threading)
    # that runs the embedding logic adapted from the old GUI's _run_embedding function.
    # It needs access to settings (chunk size, model) and the project's files.
    
    print(f"Placeholder: Embedding requested for project {project_id}")
    print(f"Files are in: {project_upload_folder}")
    # Simulate starting a background task
    # In a real app: task = run_embedding_task.delay(project_id, project_upload_folder)
    
    return jsonify({"success": True, "message": "Embedding process started in background."}), 202 # 202 Accepted

if __name__ == '__main__':
    # Ensure theme preference is applied on startup if needed (usually done in JS)
    app.run(debug=True, port=5001) 