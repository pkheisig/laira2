from flask import Blueprint, request, jsonify, current_app
import os
import json

# Assuming ChatEngine is accessible if needed for updates
# from src.core.chat_engine import ChatEngine

settings_bp = Blueprint('settings_bp', __name__)

def get_settings_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    os.makedirs(project_folder, exist_ok=True)
    return os.path.join(project_folder, 'settings.json')

DEFAULT_SETTINGS = {
    "chat_settings": {
        "temperature": 0.2,
        "top_p": 0.95,
        "top_k": 40,
        "max_output_tokens": 200
    },
    "ui_settings": {
        "theme": "light"
    },
    "processing_settings": {
        "chunk_strategy": "paragraph",
        "max_paragraph_length": 1000,
        "chunk_overlap": 200,
        "heading_patterns": []
    }
}

@settings_bp.route('/project/<project_id>/settings', methods=['POST'])
# @limiter.limit("30 per hour") # Rate limiting commented out
def save_project_settings_route(project_id):
    """Saves project-specific settings to a JSON file."""
    data = request.get_json()
    settings_file = get_settings_path(project_id)
    
    try:
        # Basic validation (optional): Ensure data has expected structure
        if 'chat_settings' not in data or 'ui_settings' not in data:
             print(f"Warning: Saving settings for {project_id} with potentially incomplete structure.")
             # Consider merging with defaults or rejecting if strict structure is needed

        with open(settings_file, 'w') as f:
            json.dump(data, f, indent=2)
        
        # Update chat engine settings if applicable and session exists
        if hasattr(current_app, 'chat_sessions') and project_id in current_app.chat_sessions:
            if data.get('chat_settings'):
                try:
                    chat_engine = current_app.chat_sessions[project_id]
                    chat_settings = data['chat_settings']
                    # Update only if types are correct
                    if 'temperature' in chat_settings: chat_engine.config['temperature'] = float(chat_settings['temperature'])
                    if 'top_p' in chat_settings: chat_engine.config['top_p'] = float(chat_settings['top_p'])
                    if 'top_k' in chat_settings: chat_engine.config['top_k'] = int(chat_settings['top_k'])
                    if 'max_output_tokens' in chat_settings: chat_engine.config['max_output_tokens'] = int(chat_settings['max_output_tokens'])
                    # Note: ChatEngine might need a method to re-initialize or apply settings directly
                    print(f"Updated chat engine settings for {project_id}")
                except (ValueError, TypeError) as e:
                    print(f"Warning: Invalid type in chat settings for {project_id}: {e}")
                except Exception as e:
                    print(f"Warning: Could not update chat engine settings for {project_id}: {e}")

        return jsonify({"success": True, "message": "Settings saved"}), 200
    except Exception as e:
        print(f"Error saving project settings for {project_id}: {e}")
        return jsonify({"error": str(e)}), 500

@settings_bp.route('/project/<project_id>/settings', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def get_project_settings_route(project_id):
    """Retrieves project-specific settings, providing defaults if none exist."""
    settings_file = get_settings_path(project_id)
    
    try:
        if os.path.exists(settings_file):
            with open(settings_file, 'r') as f:
                settings = json.load(f)
            # Optional: Validate settings structure against defaults
            return jsonify(settings), 200
        else:
            # Save and return default settings
            with open(settings_file, 'w') as f:
                json.dump(DEFAULT_SETTINGS, f, indent=2)
            return jsonify(DEFAULT_SETTINGS), 200
    except json.JSONDecodeError:
        print(f"Error: Settings file for {project_id} is corrupt. Returning defaults.")
        # Optionally attempt to repair or just return defaults
        try:
             with open(settings_file, 'w') as f:
                 json.dump(DEFAULT_SETTINGS, f, indent=2)
        except Exception as write_err:
             print(f"Error writing default settings after corruption: {write_err}")
        return jsonify(DEFAULT_SETTINGS), 200 # Return defaults even if rewrite fails
    except Exception as e:
        print(f"Error getting project settings for {project_id}: {e}")
        return jsonify({"error": str(e)}), 500 