from flask import Blueprint, current_app, request, session, jsonify
import json
import urllib.request
import urllib.error

auth_bp = Blueprint('auth_bp', __name__)


@auth_bp.route('/auth/google/login')
def google_login():
    """Expose Google OAuth client_id to the frontend (GIS popup flow).

    Returns { client_id } when configured, otherwise a 400 with error.
    """
    client_id = current_app.config.get('GOOGLE_CLIENT_ID')
    if not client_id:
        return jsonify({"error": "Google OAuth not configured"}), 400
    return jsonify({"client_id": client_id})


@auth_bp.route('/auth/google/verify', methods=['POST'])
def google_verify():
    """Verify Google ID token from Google Identity Services.

    Expects JSON body: { "credential": "<id_token>" }
    On success, stores a minimal user dict in the Flask session.
    """
    client_id = current_app.config.get('GOOGLE_CLIENT_ID')
    if not client_id:
        return jsonify({"error": "Server missing GOOGLE_CLIENT_ID"}), 500

    data = request.get_json(silent=True) or {}
    id_token = data.get('credential') or data.get('id_token')
    if not id_token:
        return jsonify({"error": "Missing credential"}), 400

    try:
        url = f"https://oauth2.googleapis.com/tokeninfo?id_token={id_token}"
        with urllib.request.urlopen(url, timeout=10) as resp:
            payload = json.loads(resp.read().decode('utf-8'))
    except urllib.error.HTTPError as e:
        return jsonify({"error": f"Token verification failed ({e.code})"}), 400
    except Exception:
        return jsonify({"error": "Token verification failed"}), 400

    aud = payload.get('aud')
    iss = payload.get('iss')
    if aud != client_id:
        return jsonify({"error": "Invalid audience"}), 400
    if iss not in ('accounts.google.com', 'https://accounts.google.com'):
        return jsonify({"error": "Invalid issuer"}), 400

    user = {
        'sub': payload.get('sub'),
        'email': payload.get('email'),
        'email_verified': str(payload.get('email_verified')).lower() == 'true',
        'name': payload.get('name'),
        'picture': payload.get('picture')
    }
    session['user'] = user
    return jsonify({"success": True, "user": user})


@auth_bp.route('/auth/logout', methods=['POST'])
def logout():
    session.clear()
    return jsonify({"success": True})


@auth_bp.route('/auth/me', methods=['GET'])
def me():
    return jsonify(session.get('user') or {})


