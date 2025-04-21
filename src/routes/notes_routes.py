from flask import Blueprint, request, jsonify, current_app
import os
import uuid
import json
import time

# Create a Blueprint for note routes
notes_bp = Blueprint('notes_bp', __name__)

# Helper function to get the notes file path
def get_notes_file_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    os.makedirs(project_folder, exist_ok=True)
    return os.path.join(project_folder, 'notes.json')

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

    notes_file = get_notes_file_path(project_id)
    # Load existing notes
    if os.path.exists(notes_file):
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
    else:
        notes = []

    note_data = {
        "id": note_id,
        "title": title,
        "content": content,
        "created_at": timestamp,
        "modified_at": timestamp
    }

    try:
        notes.append(note_data)
        with open(notes_file, 'w', encoding='utf-8') as f:
            json.dump(notes, f, indent=2)
        print(f"Note saved successfully: {notes_file}")
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

    notes_file = get_notes_file_path(project_id)
    if not os.path.exists(notes_file):
        return jsonify({"error": "Note not found"}), 404
    try:
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
        # Find note
        note = next((n for n in notes if n['id'] == note_id), None)
        if not note:
            return jsonify({"error": "Note not found"}), 404

        updated = False
        if 'title' in data:
            note['title'] = data['title']
            updated = True
        if 'content' in data:
            note['content'] = data['content']
            updated = True
        
        if updated:
            note['modified_at'] = time.time()
            with open(notes_file, 'w', encoding='utf-8') as f:
                json.dump(notes, f, indent=2)
            print(f"Note updated successfully: {notes_file}")
            return jsonify({"success": True, "message": "Note updated successfully.", "note": note}), 200
        else:
            return jsonify({"success": False, "message": "No changes provided to update.", "note": note}), 200

    except Exception as e:
        print(f"Error updating note {note_id}: {e}")
        return jsonify({"error": f"Failed to update note: {str(e)}"}), 500

@notes_bp.route('/project/<project_id>/notes', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def list_notes_route(project_id):
    """Lists all notes for a given project, sorted by modification date."""
    notes_file = get_notes_file_path(project_id)
    
    try:
        if os.path.exists(notes_file):
            with open(notes_file, 'r', encoding='utf-8') as f:
                notes = json.load(f)
        else:
            notes = []
        # Sort by modified date descending
        notes.sort(key=lambda x: x.get('modified_at', x.get('created_at', 0)), reverse=True)
        return jsonify({"notes": notes}), 200
    except Exception as e:
        print(f"Error listing notes: {e}")
        return jsonify({"error": str(e)}), 500

@notes_bp.route('/project/<project_id>/notes/<note_id>', methods=['GET'])
# @limiter.limit("120 per minute") # Rate limiting commented out
def get_note_route(project_id, note_id):
    """Retrieves a specific note by its ID."""
    notes_file = get_notes_file_path(project_id)
    
    try:
        if not os.path.exists(notes_file):
            return jsonify({"error": "Note not found"}), 404
        
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
            note_data = next((n for n in notes if n['id'] == note_id), None)
        if not note_data:
            return jsonify({"error": "Note not found"}), 404

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
    notes_file = get_notes_file_path(project_id)
    
    try:
        if not os.path.exists(notes_file):
            return jsonify({"error": "Note not found"}), 404
        with open(notes_file, 'r', encoding='utf-8') as f:
            notes = json.load(f)
        # Filter out deleted note
        new_notes = [n for n in notes if n['id'] != note_id]
        with open(notes_file, 'w', encoding='utf-8') as f:
            json.dump(new_notes, f, indent=2)
        return jsonify({"success": True, "message": "Note deleted"}), 200
    except Exception as e:
        print(f"Error deleting note: {e}")
        return jsonify({"error": str(e)}), 500 