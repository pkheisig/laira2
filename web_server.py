from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
import os
import threading
import time
import uuid
import json
from pathlib import Path
from werkzeug.utils import secure_filename

# Import text processing components
from src.core.processing.processor import DocumentProcessor
from src.core.text_processing.text_chunker import TextChunker
from src.core.text_processing.text_embedder import TextEmbedder
from src.core.text_processing.vector_store import VectorStore

# Import the ChatEngine class
from src.core.chat_engine import ChatEngine

# Configuration
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'doc', 'csv', 'md', 'html', 'json'}

# Create Flask app
app = Flask(__name__, template_folder='templates', static_folder='static')
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB limit

# Ensure the upload folder exists
if not os.path.exists(UPLOAD_FOLDER):
    os.makedirs(UPLOAD_FOLDER)

# Helper functions
def allowed_file(filename):
    """Check if a file has an allowed extension."""
    # Use rsplit to handle filenames with multiple dots
    parts = filename.rsplit('.', 1)
    
    # If no extension, return False
    if len(parts) == 1:
        return False
    
    # Check if the extension is in allowed extensions
    extension = parts[1].lower()
    return extension in ALLOWED_EXTENSIONS

# Dictionary to store embedding tasks and their status
embedding_tasks = {}

# Dictionary to store chat sessions by project_id
chat_sessions = {}

@app.route('/')
def home():
    """Render the home page."""
    return render_template('index.html')

@app.route('/project/<project_id>')
def project_view(project_id):
    """Render the project page for a specific project."""
    print(f"Accessing project: {project_id}")
    
    # Ensure project directory exists
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder):
        os.makedirs(project_upload_folder)
        print(f"Created project directory: {project_upload_folder}")
        
        # Create organized subfolders
        os.makedirs(os.path.join(project_upload_folder, 'sources'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'chat_history'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'notes'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'database'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'settings'), exist_ok=True)
        print(f"Created project subfolders for {project_id}")
    
    return render_template('index.html', project_id=project_id)

@app.route('/upload/<project_id>', methods=['POST']) # Modified to accept project_id
def upload_file(project_id):
    """Handles file uploads for a specific project. Supports both single file ('file') and multiple files ('files')."""
    # Ensure a project-specific upload folder exists or handle storage appropriately
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    if not os.path.exists(project_upload_folder):
        os.makedirs(project_upload_folder)
        # Create organized subfolders
        os.makedirs(os.path.join(project_upload_folder, 'sources'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'chat_history'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'notes'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'database'), exist_ok=True)
        os.makedirs(os.path.join(project_upload_folder, 'settings'), exist_ok=True)
        print(f"Created project folder: {project_upload_folder} with subfolders")

    # Use the sources subfolder for storing files
    sources_folder = os.path.join(project_upload_folder, 'sources')
    if not os.path.exists(sources_folder):
        os.makedirs(sources_folder)

    uploaded_files = []
    errors = []
    
    # Check if this is a multi-file upload
    if 'files' in request.files:
        files_list = request.files.getlist('files')
        print(f"Processing {len(files_list)} files for project {project_id}")
        
        for file in files_list:
            if file.filename == '':
                continue
            
            if file and allowed_file(file.filename):
                try:
                    # Secure the filename
                    filename = secure_filename(file.filename)
                    filepath = os.path.join(sources_folder, filename)
                    
                    # Check if file already exists
                    if os.path.exists(filepath):
                        errors.append(f"File '{filename}' already exists in this project.")
                        continue
                    
                    # Save the file
                    file.save(filepath)
                    print(f"File saved to: {filepath}")
                    
                    # Add to successful uploads
                    uploaded_files.append({
                        "filename": filename,
                        "filepath": filepath,
                        "size": os.path.getsize(filepath)
                    })
                except Exception as e:
                    print(f"Error saving file {file.filename}: {e}")
                    errors.append(f"Failed to save file '{file.filename}': {str(e)}")
            else:
                errors.append(f"File type not allowed for '{file.filename}'")
        
        # Return response for multiple files
        if uploaded_files:
            return jsonify({
                "success": True,
                "message": f"{len(uploaded_files)} file(s) uploaded successfully.",
                "files": uploaded_files,
                "errors": errors
            }), 200
        else:
            return jsonify({
                "success": False,
                "error": "No files were uploaded successfully.",
                "errors": errors
            }), 400
    
    # Handle single file upload (legacy support)
    elif 'file' in request.files:
        file = request.files['file']
        if file.filename == '':
            return jsonify({"error": "No selected file"}), 400
            
        if file and allowed_file(file.filename):
            # Secure the filename to prevent directory traversal attacks
            filename = secure_filename(file.filename)
            
            # Check if file already exists in the sources folder
            filepath = os.path.join(sources_folder, filename)
            if os.path.exists(filepath):
                return jsonify({"error": f"File '{filename}' already exists in this project."}), 409
            
            try:
                # Save the file to the sources subfolder
                file.save(filepath)
                print(f"File saved to: {filepath}")
                
                # Return success response
                return jsonify({
                    "success": True,
                    "message": f"File '{filename}' uploaded to project '{project_id}' successfully.",
                    "filename": filename,
                    "filepath": filepath
                }), 200
            except Exception as e:
                print(f"Error saving file: {e}")
                return jsonify({"error": f"Failed to save file: {str(e)}"}), 500
        else:
            return jsonify({"error": "File type not allowed"}), 400
    else:
        return jsonify({"error": "No file part in the request"}), 400

@app.route('/ask/<project_id>', methods=['POST'])
def ask_question(project_id):
    """Handles user questions for a specific project using Gemini."""
    data = request.get_json()
    question = data.get('question')
    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        # Get project folder path
        project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
        chat_history_folder = os.path.join(project_folder, 'chat_history')
        database_folder = os.path.join(project_folder, 'database')
        
        # Ensure all project directories exist
        os.makedirs(chat_history_folder, exist_ok=True)
        os.makedirs(database_folder, exist_ok=True)
        
        # Get or create a chat session for this project
        if project_id not in chat_sessions:
            # Create a new chat session with project-specific configuration
            chat_config = {
                "project_id": project_id,
                "n_results": 8,  # Get more context for better answers
                "temperature": 0.2,  # Lower temperature for more factual responses
                "persist_directory": database_folder,  # Store vector embeddings in database subfolder
                "chat_history_path": chat_history_folder,  # Store chat history in chat_history subfolder
            }
            chat_sessions[project_id] = ChatEngine(chat_config)
            print(f"Created new chat session for project: {project_id}")
            
            # Save initial empty chat history file
            chat_history_file = os.path.join(chat_history_folder, 'history.json')
            if not os.path.exists(chat_history_file):
                with open(chat_history_file, 'w') as f:
                    json.dump([], f)
        
        # Get the chat engine for this project
        chat_engine = chat_sessions[project_id]
        
        # Ask the question
        response = chat_engine.ask(question)
        
        # Save chat history
        chat_history_file = os.path.join(chat_history_folder, 'history.json')
        try:
            # Load existing history
            if os.path.exists(chat_history_file):
                with open(chat_history_file, 'r') as f:
                    history = json.load(f)
            else:
                history = []
            
            # Add new message
            timestamp = time.time()
            history.append({
                "role": "user",
                "content": question,
                "timestamp": timestamp
            })
            history.append({
                "role": "assistant",
                "content": response.get("answer", ""),
                "sources": response.get("sources", []),
                "timestamp": timestamp + 0.001  # Slightly later timestamp
            })
            
            # Save updated history
            with open(chat_history_file, 'w') as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save chat history: {e}")
        
        # Return the answer, sources, and other metadata
        return jsonify(response), 200
    
    except Exception as e:
        print(f"Error processing question: {e}")
        return jsonify({
            "answer": "I encountered an error while processing your question. Please try again later.",
            "success": False,
            "error": str(e)
        }), 500

@app.route('/reset-chat/<project_id>', methods=['POST'])
def reset_chat(project_id):
    """Resets the conversation history for a specific project."""
    try:
        # Reset in-memory chat session if exists
        if project_id in chat_sessions:
            chat_sessions[project_id].reset_conversation()
        
        # Reset chat history file
        project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
        chat_history_folder = os.path.join(project_folder, 'chat_history')
        chat_history_file = os.path.join(chat_history_folder, 'history.json')
        
        # Ensure directory exists
        os.makedirs(chat_history_folder, exist_ok=True)
        
        # Write empty history array to file
        with open(chat_history_file, 'w') as f:
            json.dump([], f)
            
        return jsonify({
            "success": True,
            "message": "Conversation history reset successfully."
        }), 200
    
    except Exception as e:
        print(f"Error resetting chat: {e}")
        return jsonify({
            "success": False,
            "error": str(e)
        }), 500

# Add a route to get a list of all files in a project
@app.route('/project/<project_id>/files', methods=['GET'])
def list_project_files(project_id):
    """List all files in a project's sources directory."""
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    
    if not os.path.exists(sources_folder):
        os.makedirs(sources_folder, exist_ok=True)
        return jsonify({"files": [], "message": "Sources directory initialized"}), 200
    
    files = []
    for filename in os.listdir(sources_folder):
        file_path = os.path.join(sources_folder, filename)
        if os.path.isfile(file_path):
            file_size = os.path.getsize(file_path)
            files.append({
                "name": filename,
                "size": file_size,
                "path": file_path,
                "type": os.path.splitext(filename)[1].lower().lstrip('.') or "unknown"
            })
    
    return jsonify({"files": files, "count": len(files)}), 200

# Add a route for deleting sources
@app.route('/delete_source/<project_id>/<filename>', methods=['DELETE'])
def delete_source_file(project_id, filename):
    """Handles deleting a source file."""
    # Basic security: Ensure filename is not trying to escape the folder
    if '..' in filename or filename.startswith('/'):
        return jsonify({"error": "Invalid filename"}), 400

    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    filepath = os.path.join(sources_folder, filename)

    try:
        if os.path.exists(filepath) and os.path.isfile(filepath):
            os.remove(filepath)
            
            # Remove the corresponding embeddings from the vector store
            try:
                # Create a vector store instance with project-specific configuration
                vector_store_config = {
                    "persist_directory": os.path.join(project_upload_folder, 'database'),
                    "project_id": project_id,
                }
                vector_store = VectorStore(vector_store_config)
                
                # Create a collection name based on project ID
                collection_name = f"project_{project_id}"
                
                # Check if the collection exists
                if collection_name in [c["name"] for c in vector_store.list_collections()]:
                    # Delete embeddings with metadata matching this file
                    vector_store.delete_embeddings_by_filter(
                        collection_name=collection_name,
                        filter_criteria={"file_path": filepath}
                    )
                    print(f"Deleted embeddings for file: {filepath}")
            except Exception as e:
                print(f"Warning: Failed to delete embeddings for {filepath}: {e}")
                
            print(f"Deleted file: {filepath}")
            return jsonify({"success": f"File '{filename}' deleted."}), 200
        else:
            return jsonify({"error": "File not found"}), 404
    except Exception as e:
        print(f"Error deleting file {filepath}: {e}")
        return jsonify({"error": f"Failed to delete file: {str(e)}"}), 500

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
    """
    Background function to run the embedding process.
    
    Args:
        task: EmbeddingTask object containing task information
    """
    try:
        # Update task status
        task.status = "processing"
        
        # Get project folder path
        project_upload_folder = os.path.join(UPLOAD_FOLDER, task.project_id)
        
        # Create a document processor with project-specific vector store configuration
        vector_store_config = {
            "persist_directory": os.path.join(project_upload_folder, "database"),  # Store in database subfolder
            "project_id": task.project_id,  # Project-specific collection
        }
        
        # Configure the processor with the vector store settings
        processor = DocumentProcessor(processor_config={
            "vector_store_config": vector_store_config
        })
        
        # Set up a callback to track progress
        def progress_callback(progress_data):
            task.progress = progress_data.get("progress_percentage", 0)
            print(f"Embedding progress: {task.progress:.2f}%")
        
        processor.set_progress_callback(progress_callback)
        
        # Process each file
        results = []
        for i, file_path in enumerate(task.file_paths):
            # Create a collection name based on project ID
            collection_name = f"project_{task.project_id}"
            
            # Process the document
            result = processor.process_document(
                document_path=file_path,
                collection_name=collection_name,
                document_metadata={"project_id": task.project_id}
            )
            
            results.append(result)
            
            # Update progress (simple file-based progress)
            task.progress = ((i + 1) / len(task.file_paths)) * 100
        
        # Update task with results
        task.results = {
            "processed_files": len(results),
            "successful_files": sum(1 for r in results if r.get("success", False)),
            "failed_files": sum(1 for r in results if not r.get("success", False)),
            "details": results
        }
        
        task.status = "completed"
        task.end_time = time.time()
        print(f"Embedding task {task.task_id} completed successfully")
        
    except Exception as e:
        # Handle any exceptions
        task.status = "failed"
        task.error = str(e)
        task.end_time = time.time()
        print(f"Embedding task {task.task_id} failed: {e}")

# Add a route for triggering embedding
@app.route('/embed/<project_id>', methods=['POST'])
def trigger_embedding(project_id):
    """Triggers the embedding process for a given project."""
    print(f"Triggering embedding for project: {project_id}")
    project_upload_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    sources_folder = os.path.join(project_upload_folder, 'sources')
    
    # Add detailed debug information
    print(f"DEBUG: Checking sources folder path: {sources_folder}")
    print(f"DEBUG: Path exists: {os.path.exists(sources_folder)}")
    
    if os.path.exists(sources_folder):
        print(f"DEBUG: Directory contents: {os.listdir(sources_folder)}")
    else:
        os.makedirs(sources_folder, exist_ok=True)
    
    if not os.path.exists(sources_folder) or not os.listdir(sources_folder):
        return jsonify({"error": f"No source files found for this project to embed. Path: {sources_folder}"}), 404

    # Get list of files in the sources folder
    file_paths = []
    for filename in os.listdir(sources_folder):
        file_path = os.path.join(sources_folder, filename)
        if os.path.isfile(file_path):
            file_type = os.path.splitext(filename)[1].lower().lstrip('.')
            file_size = os.path.getsize(file_path)
            print(f"DEBUG: Found file: {file_path} (Type: {file_type}, Size: {file_size} bytes)")
            
            # Skip non-embedable files (like system files)
            if file_type in ALLOWED_EXTENSIONS or not file_type:
                file_paths.append(file_path)
            else:
                print(f"DEBUG: Skipping file with unsupported type: {file_type}")
    
    if not file_paths:
        return jsonify({"error": "No compatible files found in sources folder."}), 404
    
    print(f"DEBUG: Using these files for embedding: {file_paths}")
    
    # Create a new embedding task
    task = EmbeddingTask(project_id, file_paths)
    embedding_tasks[task.task_id] = task
    
    # Start a background thread to run the embedding process
    thread = threading.Thread(
        target=run_embedding_process,
        args=(task,),
        daemon=True
    )
    thread.start()
    
    return jsonify({
        "success": True,
        "message": "Embedding process started in background.",
        "task_id": task.task_id
    }), 202  # 202 Accepted

# Add a route for checking embedding status
@app.route('/embed/status/<task_id>', methods=['GET'])
def check_embedding_status(task_id):
    """Check the status of an embedding task."""
    if task_id not in embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    
    task = embedding_tasks[task_id]
    return jsonify(task.to_dict()), 200

# Add a route for getting embedding results
@app.route('/embed/results/<task_id>', methods=['GET'])
def get_embedding_results(task_id):
    """Get the results of a completed embedding task."""
    if task_id not in embedding_tasks:
        return jsonify({"error": "Task not found"}), 404
    
    task = embedding_tasks[task_id]
    
    if task.status != "completed":
        return jsonify({"error": "Task not completed yet", "status": task.status}), 400
    
    return jsonify({
        "task_id": task.task_id,
        "project_id": task.project_id,
        "status": task.status,
        "results": task.results
    }), 200

# Add a route to get chat history
@app.route('/project/<project_id>/chat-history', methods=['GET'])
def get_chat_history(project_id):
    """Get the chat history for a specific project."""
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    chat_history_folder = os.path.join(project_folder, 'chat_history')
    chat_history_file = os.path.join(chat_history_folder, 'history.json')
    
    try:
        if os.path.exists(chat_history_file):
            with open(chat_history_file, 'r') as f:
                history = json.load(f)
            return jsonify({"history": history}), 200
        else:
            # Create an empty chat history file
            os.makedirs(chat_history_folder, exist_ok=True)
            with open(chat_history_file, 'w') as f:
                json.dump([], f)
            return jsonify({"history": []}), 200
    except Exception as e:
        print(f"Error reading chat history: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to create/save a note
@app.route('/project/<project_id>/notes', methods=['POST'])
def save_note(project_id):
    """Create or update a note."""
    data = request.get_json()
    note_id = data.get('id')
    title = data.get('title', 'Untitled Note')
    content = data.get('content', '')
    
    if not title:
        return jsonify({"error": "Note title is required"}), 400
    
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    notes_folder = os.path.join(project_folder, 'notes')
    os.makedirs(notes_folder, exist_ok=True)
    
    try:
        # Load existing notes index
        notes_index_file = os.path.join(notes_folder, 'notes.json')
        if os.path.exists(notes_index_file):
            with open(notes_index_file, 'r') as f:
                notes = json.load(f)
        else:
            notes = []
        
        timestamp = time.time()
        
        if note_id:
            # Update existing note
            note_file = os.path.join(notes_folder, f"{note_id}.md")
            note_found = False
            
            # Update in index
            for note in notes:
                if note.get('id') == note_id:
                    note['title'] = title
                    note['updated_at'] = timestamp
                    note_found = True
                    break
            
            if not note_found:
                return jsonify({"error": "Note not found"}), 404
        else:
            # Create new note
            note_id = f"note_{int(timestamp)}_{uuid.uuid4().hex[:8]}"
            note_file = os.path.join(notes_folder, f"{note_id}.md")
            
            # Add to index
            notes.append({
                'id': note_id,
                'title': title,
                'created_at': timestamp,
                'updated_at': timestamp
            })
        
        # Save note content
        with open(note_file, 'w') as f:
            f.write(content)
        
        # Save updated index
        with open(notes_index_file, 'w') as f:
            json.dump(notes, f, indent=2)
        
        return jsonify({
            "success": True,
            "note_id": note_id,
            "message": "Note saved successfully"
        }), 200
    
    except Exception as e:
        print(f"Error saving note: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to get all notes
@app.route('/project/<project_id>/notes', methods=['GET'])
def list_notes(project_id):
    """List all notes for a project."""
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    notes_folder = os.path.join(project_folder, 'notes')
    notes_index_file = os.path.join(notes_folder, 'notes.json')
    
    try:
        if os.path.exists(notes_index_file):
            with open(notes_index_file, 'r') as f:
                notes = json.load(f)
            return jsonify({"notes": notes}), 200
        else:
            # Create empty notes index
            os.makedirs(notes_folder, exist_ok=True)
            with open(notes_index_file, 'w') as f:
                json.dump([], f)
            return jsonify({"notes": []}), 200
    except Exception as e:
        print(f"Error listing notes: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to get a specific note
@app.route('/project/<project_id>/notes/<note_id>', methods=['GET'])
def get_note(project_id, note_id):
    """Get a specific note by ID."""
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    notes_folder = os.path.join(project_folder, 'notes')
    note_file = os.path.join(notes_folder, f"{note_id}.md")
    notes_index_file = os.path.join(notes_folder, 'notes.json')
    
    try:
        # Check if note exists
        if not os.path.exists(note_file):
            return jsonify({"error": "Note not found"}), 404
        
        # Get note content
        with open(note_file, 'r') as f:
            content = f.read()
        
        # Get note metadata from index
        title = "Untitled Note"
        created_at = None
        updated_at = None
        
        if os.path.exists(notes_index_file):
            with open(notes_index_file, 'r') as f:
                notes = json.load(f)
                for note in notes:
                    if note.get('id') == note_id:
                        title = note.get('title', title)
                        created_at = note.get('created_at')
                        updated_at = note.get('updated_at')
                        break
        
        return jsonify({
            "id": note_id,
            "title": title,
            "content": content,
            "created_at": created_at,
            "updated_at": updated_at
        }), 200
    except Exception as e:
        print(f"Error getting note: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to delete a note
@app.route('/project/<project_id>/notes/<note_id>', methods=['DELETE'])
def delete_note(project_id, note_id):
    """Delete a note."""
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    notes_folder = os.path.join(project_folder, 'notes')
    note_file = os.path.join(notes_folder, f"{note_id}.md")
    notes_index_file = os.path.join(notes_folder, 'notes.json')
    
    try:
        # Remove from index
        if os.path.exists(notes_index_file):
            with open(notes_index_file, 'r') as f:
                notes = json.load(f)
            
            # Filter out the note to delete
            notes = [note for note in notes if note.get('id') != note_id]
            
            with open(notes_index_file, 'w') as f:
                json.dump(notes, f, indent=2)
        
        # Delete note file
        if os.path.exists(note_file):
            os.remove(note_file)
            return jsonify({"success": True, "message": "Note deleted"}), 200
        else:
            return jsonify({"error": "Note not found"}), 404
    except Exception as e:
        print(f"Error deleting note: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to save project settings
@app.route('/project/<project_id>/settings', methods=['POST'])
def save_project_settings(project_id):
    """Save project settings."""
    data = request.get_json()
    
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    settings_folder = os.path.join(project_folder, 'settings')
    os.makedirs(settings_folder, exist_ok=True)
    
    settings_file = os.path.join(settings_folder, 'settings.json')
    
    try:
        # Save settings
        with open(settings_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        # Update chat engine if it exists
        if project_id in chat_sessions and data.get('chat_settings'):
            chat_config = chat_sessions[project_id].config
            chat_settings = data.get('chat_settings', {})
            
            # Update relevant settings
            if 'temperature' in chat_settings:
                chat_config['temperature'] = float(chat_settings['temperature'])
            if 'top_p' in chat_settings:
                chat_config['top_p'] = float(chat_settings['top_p'])
            if 'top_k' in chat_settings:
                chat_config['top_k'] = int(chat_settings['top_k'])
            if 'max_output_tokens' in chat_settings:
                chat_config['max_output_tokens'] = int(chat_settings['max_output_tokens'])
            
            # Re-initialize with new settings
            chat_sessions[project_id] = ChatEngine(chat_config)
        
        return jsonify({"success": True, "message": "Settings saved"}), 200
    except Exception as e:
        print(f"Error saving project settings: {e}")
        return jsonify({"error": str(e)}), 500

# Add a route to get project settings
@app.route('/project/<project_id>/settings', methods=['GET'])
def get_project_settings(project_id):
    """Get project settings."""
    project_folder = os.path.join(app.config['UPLOAD_FOLDER'], project_id)
    settings_folder = os.path.join(project_folder, 'settings')
    settings_file = os.path.join(settings_folder, 'settings.json')
    
    try:
        if os.path.exists(settings_file):
            with open(settings_file, 'r') as f:
                settings = json.load(f)
            return jsonify(settings), 200
        else:
            # Create default settings
            os.makedirs(settings_folder, exist_ok=True)
            default_settings = {
                "chat_settings": {
                    "temperature": 0.2,
                    "top_p": 0.95,
                    "top_k": 40,
                    "max_output_tokens": 8192
                },
                "ui_settings": {
                    "theme": "light"
                }
            }
            with open(settings_file, 'w') as f:
                json.dump(default_settings, f, indent=2)
            return jsonify(default_settings), 200
    except Exception as e:
        print(f"Error getting project settings: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True, port=8000)