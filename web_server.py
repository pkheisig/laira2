from flask import Flask, render_template, request, jsonify, redirect, url_for, send_from_directory
import os
import threading
import time
import uuid
import json
from pathlib import Path
# from werkzeug.utils import secure_filename # Moved to upload_routes
# from flask_limiter import Limiter # Commented out
# from flask_limiter.util import get_remote_address # Commented out

# Import text processing components (Keep if needed globally, e.g., by app factory)
# from src.core.processing.processor import DocumentProcessor
# from src.core.text_processing.text_chunker import TextChunker
# from src.core.text_processing.text_embedder import TextEmbedder
# from src.core.text_processing.vector_store import VectorStore

# Import the ChatEngine class (Keep if needed globally)
# from src.core.chat_engine import ChatEngine

# Import Blueprints
from src.routes.notes_routes import notes_bp
from src.routes.project_routes import project_bp
from src.routes.upload_routes import upload_bp
from src.routes.chat_routes import chat_bp
from src.routes.embed_routes import embed_bp
from src.routes.settings_routes import settings_bp
import src.routes.chat_extra_routes  # Load extra chat routes before blueprint registration

# Configuration (Keep necessary app config)
UPLOAD_FOLDER = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'uploads')
# ALLOWED_EXTENSIONS = {'txt', 'pdf', 'docx', 'doc', 'csv', 'md', 'html', 'json'} # Moved to upload_routes

# Create Flask app
def create_app():
    # Load environment variables
    from dotenv import load_dotenv
    load_dotenv()
    app = Flask(__name__, template_folder='templates', static_folder='static')
    # Load API key for chat and embeddings (Google or OpenAI)
    app.config['GOOGLE_API_KEY'] = os.environ.get('GOOGLE_API_KEY') or os.environ.get('OPENAI_API_KEY')
    if not app.config['GOOGLE_API_KEY']:
        app.logger.warning("API key not set (GOOGLE_API_KEY or OPENAI_API_KEY). Chat and embedding features will fail.")
    
    app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
    app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB limit
    
    # Initialize shared state (can be done here or before app.run)
    app.embedding_tasks = {}
    app.chat_sessions = {}

    # Register Blueprints
    app.register_blueprint(notes_bp)
    app.register_blueprint(project_bp)
    app.register_blueprint(upload_bp)
    app.register_blueprint(chat_bp)
    app.register_blueprint(embed_bp)
    app.register_blueprint(settings_bp)

    # Load persisted embedding tasks for all projects
    upload_root = app.config['UPLOAD_FOLDER']
    if os.path.isdir(upload_root):
        for project_id in os.listdir(upload_root):
            project_folder = os.path.join(upload_root, project_id)
            tasks_file = os.path.join(project_folder, 'embed_tasks.json')
            if os.path.exists(tasks_file):
                try:
                    with open(tasks_file, 'r', encoding='utf-8') as f:
                        tasks_dict = json.load(f)
                    app.embedding_tasks.update(tasks_dict)
                except Exception as e:
                    app.logger.error(f"Failed to load embed tasks for project {project_id}: {e}")

    # Ensure the upload folder exists
    if not os.path.exists(app.config['UPLOAD_FOLDER']):
        os.makedirs(app.config['UPLOAD_FOLDER'])
        
    return app

# Helper functions (Remove route-specific helpers)
# def allowed_file(filename): ... # Moved

# Dictionary to store embedding tasks and their status (Remove, managed in blueprint via current_app)
# embedding_tasks = {}

# Dictionary to store chat sessions by project_id (Remove, managed in blueprint via current_app)
# chat_sessions = {}

# @app.route('/')
# def home(): ... # Moved

# @app.route('/project/<project_id>')
# def project_view(project_id): ... # Moved

# @app.route('/upload/<project_id>', methods=['POST'])
# # @limiter.limit("10 per minute") # Example: Limit uploads
# def upload_file(project_id): ... # Moved

# @app.route('/ask/<project_id>', methods=['POST'])
# # @limiter.limit("60 per minute") # Example: Limit chat messages
# def ask_question(project_id): ... # Moved

# @app.route('/reset-chat/<project_id>', methods=['POST'])
# # @limiter.limit("5 per hour") # Example: Limit chat resets
# def reset_chat(project_id): ... # Moved

# @app.route('/project/<project_id>/files', methods=['GET'])
# # @limiter.limit("120 per minute") # Example: Limit file listing
# def list_project_files(project_id): ... # Moved

# @app.route('/delete_source/<project_id>/<filename>', methods=['DELETE'])
# # @limiter.limit("30 per minute") # Example: Limit file deletions
# def delete_source_file(project_id, filename): ... # Moved

# EmbeddingTask class and run_embedding_process function (Moved)
# class EmbeddingTask: ...
# def run_embedding_process(task): ...

# @app.route('/embed/<project_id>', methods=['POST'])
# # @limiter.limit("5 per hour") # Example: Limit embedding triggers
# def trigger_embedding(project_id): ... # Moved

# @app.route('/embed/status/<task_id>', methods=['GET'])
# # @limiter.limit("120 per minute") # Example: Limit status checks
# def check_embedding_status(task_id): ... # Moved

# @app.route('/embed/results/<task_id>', methods=['GET'])
# # @limiter.limit("60 per minute") # Example: Limit result fetching
# def get_embedding_results(task_id): ... # Moved

# @app.route('/project/<project_id>/chat-history', methods=['GET'])
# # @limiter.limit("120 per minute") # Example: Limit history fetching
# def get_chat_history(project_id): ... # Moved

# Note routes are already removed 

# Settings routes (Moved)
# @app.route('/project/<project_id>/settings', methods=['POST'])
# # @limiter.limit("30 per hour") # Limit settings save
# def save_project_settings(project_id): ... # Moved

# @app.route('/project/<project_id>/settings', methods=['GET'])
# # @limiter.limit("120 per minute") # Limit settings fetch
# def get_project_settings(project_id): ... # Moved

if __name__ == '__main__':
    app = create_app()

ports_to_try = [5000, 5001, 8000]
found_port = None

for port in ports_to_try:
    try:
        print(f"Attempting to run on port {port} (reloader disabled for port check)...")
        # Attempt to run with debug mode but reloader off to see if it binds
        app.run(debug=True, port=port, use_reloader=False)
        print(f"Successfully running on port {port}.")
        found_port = port
        break # Break the loop if successful
    except OSError as e:
        if e.errno == 98:  # Address already in use
            print(f"Port {port} is already in use. Trying the next port.")
            time.sleep(1) # Add a small delay before trying the next port
            if port == ports_to_try[-1]: # Check if it's the last port in the list
                 print("All specified ports are in use. Could not start the application.")
        else:
            print(f"An unexpected OS error occurred: {e}")
            break # Break the loop for other errors

# If a port was found and you need the reloader, you might need
# more sophisticated logic here to restart the app with reloader=True
# on the found_port, or handle this scenario differently.
# For now, this code demonstrates finding an available port.
if found_port:
    print(f"Application started on port {found_port} with reloader disabled for the initial run.")