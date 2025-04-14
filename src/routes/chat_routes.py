from flask import Blueprint, request, jsonify, current_app
import os
import json
import time

# Import ChatEngine (ensure it's accessible)
from src.core.chat_engine import ChatEngine

chat_bp = Blueprint('chat_bp', __name__)

# Helper to get chat history path
def get_chat_history_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    return os.path.join(project_folder, 'chat_history', 'history.json')

# Helper to get or create chat session
def get_or_create_chat_session(project_id):
    if not hasattr(current_app, 'chat_sessions'):
        current_app.chat_sessions = {}
        
    if project_id not in current_app.chat_sessions:
        project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
        database_folder = os.path.join(project_folder, 'database')
        chat_history_folder = os.path.join(project_folder, 'chat_history')
        os.makedirs(chat_history_folder, exist_ok=True)
        os.makedirs(database_folder, exist_ok=True)
        
        chat_config = {
            "project_id": project_id,
            "n_results": 8,
            "temperature": 0.2,
            "persist_directory": database_folder,
            "chat_history_path": chat_history_folder,
        }
        current_app.chat_sessions[project_id] = ChatEngine(chat_config)
        print(f"Created new chat session for project: {project_id}")
        
        # Ensure history file exists
        chat_history_file = get_chat_history_path(project_id)
        if not os.path.exists(chat_history_file):
            with open(chat_history_file, 'w') as f: json.dump([], f)
                
    return current_app.chat_sessions[project_id]

@chat_bp.route('/ask/<project_id>', methods=['POST'])
# @limiter.limit("60 per minute") # Rate limiting commented out
def ask_question_route(project_id):
    """Handles user questions for a specific project using Gemini."""
    data = request.get_json()
    question = data.get('question')
    if not question:
        return jsonify({"error": "No question provided"}), 400

    try:
        chat_engine = get_or_create_chat_session(project_id)
        response = chat_engine.ask(question)
        
        # Save chat history
        chat_history_file = get_chat_history_path(project_id)
        try:
            if os.path.exists(chat_history_file):
                with open(chat_history_file, 'r') as f: history = json.load(f)
            else: history = []
            
            timestamp = time.time()
            history.append({"role": "user", "content": question, "timestamp": timestamp})
            history.append({
                "role": "assistant", 
                "content": response.get("answer", ""), 
                "sources": response.get("sources", []),
                "timestamp": timestamp + 0.001
            })
            
            with open(chat_history_file, 'w') as f: json.dump(history, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save chat history: {e}")
        
        return jsonify(response), 200
    
    except Exception as e:
        print(f"Error processing question: {e}")
        # Log the full exception for debugging
        # import traceback
        # traceback.print_exc()
        return jsonify({
            "answer": "Error processing question. Please check logs.",
            "success": False,
            "error": str(e)
        }), 500

@chat_bp.route('/reset-chat/<project_id>', methods=['POST'])
# @limiter.limit("5 per hour") # Rate limiting commented out
def reset_chat_route(project_id):
    """Resets the conversation history for a specific project."""
    try:
        if hasattr(current_app, 'chat_sessions') and project_id in current_app.chat_sessions:
            current_app.chat_sessions[project_id].reset_conversation()
            # Optionally delete the session: del current_app.chat_sessions[project_id]
        
        chat_history_file = get_chat_history_path(project_id)
        os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
        with open(chat_history_file, 'w') as f: json.dump([], f)
            
        return jsonify({"success": True, "message": "Chat reset successfully."}), 200
    except Exception as e:
        print(f"Error resetting chat: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@chat_bp.route('/project/<project_id>/chat-history', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def get_chat_history_route(project_id):
    """Get the chat history for a specific project."""
    chat_history_file = get_chat_history_path(project_id)
    try:
        if os.path.exists(chat_history_file):
            with open(chat_history_file, 'r') as f: history = json.load(f)
            return jsonify({"history": history}), 200
        else:
            os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
            with open(chat_history_file, 'w') as f: json.dump([], f)
            return jsonify({"history": []}), 200
    except Exception as e:
        print(f"Error reading chat history: {e}")
        return jsonify({"error": str(e)}), 500 