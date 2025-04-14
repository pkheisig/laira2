from flask import Blueprint, request, jsonify, current_app
import os
import uuid
import json
import time

# Create a Blueprint for note routes
notes_bp = Blueprint('notes_bp', __name__)

# Helper function to get the notes folder path
def get_notes_folder(project_id):
    return os.path.join(current_app.config['UPLOAD_FOLDER'], project_id, 'notes')

@notes_bp.route('/project/<project_id>/notes', methods=['POST'])
# @limiter.limit("60 per minute") # Rate limiting commented out for now
def save_note_route(project_id):
    """Saves a new note for a project."""
    data = request.get_json()
    if not data or 'title' not in data or 'content' not in data:
        return jsonify({"error": "Missing title or content"}), 400

    title = data['title']
    content = data['content']
    note_id = str(uuid.uuid4())  # Generate a unique ID for the new note
    timestamp = time.time()

    notes_folder = get_notes_folder(project_id)
    os.makedirs(notes_folder, exist_ok=True)  # Ensure the folder exists

    filepath = os.path.join(notes_folder, f"{note_id}.json")

    note_data = {
        "id": note_id,
        "title": title,
        "content": content,
        "created_at": timestamp,
        "modified_at": timestamp
    }

    try:
        with open(filepath, 'w', encoding='utf-8') as f:
            json.dump(note_data, f, indent=4)
        print(f"Note saved successfully: {filepath}")
        return jsonify({"success": True, "message": "Note saved successfully.", "note": note_data}), 201
    except Exception as e:
        print(f"Error saving note: {e}")
        return jsonify({"error": f"Failed to save note: {str(e)}"}), 500

@notes_bp.route('/project/<project_id>/notes/<note_id>', methods=['PUT'])
# @limiter.limit("60 per minute") # Rate limiting commented out
def update_note_route(project_id, note_id):
    """Updates an existing note."""
    data = request.get_json()
    if not data:
        return jsonify({"error": "No data provided"}), 400

    notes_folder = get_notes_folder(project_id)
    filepath = os.path.join(notes_folder, f"{note_id}.json")

    if not os.path.exists(filepath):
        return jsonify({"error": "Note not found"}), 404

    try:
        with open(filepath, 'r', encoding='utf-8') as f:
            note_data = json.load(f)

        updated = False
        if 'title' in data:
            note_data['title'] = data['title']
            updated = True
        if 'content' in data:
            note_data['content'] = data['content']
            updated = True
        
        if updated:
            note_data['modified_at'] = time.time()
            with open(filepath, 'w', encoding='utf-8') as f:
                json.dump(note_data, f, indent=4)
            print(f"Note updated successfully: {filepath}")
            return jsonify({"success": True, "message": "Note updated successfully.", "note": note_data}), 200
        else:
            return jsonify({"success": False, "message": "No changes provided to update.", "note": note_data}), 200

    except Exception as e:
        print(f"Error updating note {note_id}: {e}")
        return jsonify({"error": f"Failed to update note: {str(e)}"}), 500

@notes_bp.route('/project/<project_id>/notes', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def list_notes_route(project_id):
    """Lists all notes for a given project, sorted by modification date."""
    notes_folder = get_notes_folder(project_id)
    
    try:
        if os.path.exists(notes_folder):
            notes = []
            for filename in os.listdir(notes_folder):
                if filename.endswith('.json'):
                    filepath = os.path.join(notes_folder, filename)
                    try:
                        with open(filepath, 'r', encoding='utf-8') as f:
                             note = json.load(f)
                             # Ensure essential keys exist before appending
                             if all(k in note for k in ('id', 'title', 'content', 'created_at', 'modified_at')):
                                notes.append(note)
                             else:
                                print(f"Warning: Skipping malformed note file {filename}")
                    except json.JSONDecodeError:
                         print(f"Warning: Skipping invalid JSON file {filename}")
                    except Exception as file_err:
                         print(f"Warning: Error reading note file {filename}: {file_err}")
                         
            notes.sort(key=lambda x: x['modified_at'], reverse=True)
            return jsonify({"notes": notes}), 200
        else:
            os.makedirs(notes_folder, exist_ok=True)
            return jsonify({"notes": []}), 200
    except Exception as e:
        print(f"Error listing notes: {e}")
        return jsonify({"error": str(e)}), 500

@notes_bp.route('/project/<project_id>/notes/<note_id>', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def get_note_route(project_id, note_id):
    """Retrieves a specific note by its ID."""
    notes_folder = get_notes_folder(project_id)
    filepath = os.path.join(notes_folder, f"{note_id}.json")
    
    try:
        if not os.path.exists(filepath):
            return jsonify({"error": "Note not found"}), 404
        
        with open(filepath, 'r', encoding='utf-8') as f:
            note_data = json.load(f)
        
        # Validate essential keys exist
        if not all(k in note_data for k in ('id', 'title', 'content', 'created_at', 'modified_at')):
            print(f"Warning: Note data for {note_id} is malformed.")
            # Fallback or return error
            # For now, return what we have, but log warning

        return jsonify({
            "id": note_data.get('id', note_id), # Use provided ID if missing
            "title": note_data.get('title', 'Untitled'),
            "content": note_data.get('content', ''),
            "created_at": note_data.get('created_at'),
            "modified_at": note_data.get('modified_at')
        }), 200
    except json.JSONDecodeError:
        print(f"Error decoding JSON for note {note_id}")
        return jsonify({"error": "Invalid note file format"}), 500
    except Exception as e:
        print(f"Error getting note: {e}")
        return jsonify({"error": str(e)}), 500

@notes_bp.route('/project/<project_id>/notes/<note_id>', methods=['DELETE'])
# @limiter.limit("60 per minute") # Rate limiting commented out
def delete_note_route(project_id, note_id):
    """Deletes a specific note by its ID."""
    notes_folder = get_notes_folder(project_id)
    filepath = os.path.join(notes_folder, f"{note_id}.json")
    
    try:
        if os.path.exists(filepath):
            os.remove(filepath)
            return jsonify({"success": True, "message": "Note deleted"}), 200
        else:
            return jsonify({"error": "Note not found"}), 404
    except Exception as e:
        print(f"Error deleting note: {e}")
        return jsonify({"error": str(e)}), 500 