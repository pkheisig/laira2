"""
Additional chat route handlers for LAIRA (ask, reset chat, chat history).
"""

from flask import request, jsonify, current_app
import os, json, time
from src.routes.chat_helpers import get_or_create_chat_session, get_chat_history_path
from src.routes.chat_routes import chat_bp

@chat_bp.route('/ask/<project_id>', methods=['POST'])
# @limiter.limit("60 per minute")
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
                with open(chat_history_file, 'r') as f:
                    history = json.load(f)
            else:
                history = []

            timestamp = time.time()
            history.append({"role": "user", "content": question, "timestamp": timestamp})
            history.append({
                "role": "assistant",
                "content": response.get("answer", ""),
                "sources": response.get("sources", []),
                "timestamp": timestamp + 0.001
            })

            with open(chat_history_file, 'w') as f:
                json.dump(history, f, indent=2)
        except Exception as e:
            print(f"Warning: Failed to save chat history: {e}")

        return jsonify(response), 200

    except Exception as e:
        print(f"Error processing question: {e}")
        return jsonify({
            "answer": "Error processing question. Please check logs.",
            "success": False,
            "error": str(e)
        }), 500

@chat_bp.route('/reset-chat/<project_id>', methods=['POST'])
# @limiter.limit("5 per hour")
def reset_chat_route(project_id):
    """Resets the conversation history for a specific project."""
    try:
        if hasattr(current_app, 'chat_sessions') and project_id in current_app.chat_sessions:
            current_app.chat_sessions[project_id].reset_conversation()

        chat_history_file = get_chat_history_path(project_id)
        os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
        with open(chat_history_file, 'w') as f:
            json.dump([], f)

        return jsonify({"success": True, "message": "Chat reset successfully."}), 200
    except Exception as e:
        print(f"Error resetting chat: {e}")
        return jsonify({"success": False, "error": str(e)}), 500

@chat_bp.route('/project/<project_id>/chat-history', methods=['GET'])
# @limiter.limit("120 per minute")
def get_chat_history_route(project_id):
    """Get the chat history for a specific project."""
    chat_history_file = get_chat_history_path(project_id)
    try:
        if os.path.exists(chat_history_file):
            with open(chat_history_file, 'r') as f:
                history = json.load(f)
            return jsonify({"history": history}), 200
        else:
            os.makedirs(os.path.dirname(chat_history_file), exist_ok=True)
            with open(chat_history_file, 'w') as f:
                json.dump([], f)
            return jsonify({"history": []}), 200
    except Exception as e:
        print(f"Error reading chat history: {e}")
        return jsonify({"error": str(e)}), 500 