from flask import Flask, request, jsonify, render_template, session
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address
import os
import logging
from dotenv import load_dotenv

# Import blueprints
from src.routes.project_routes import project_bp
from src.routes.embed_routes import embed_bp
from src.routes.chat_routes import chat_bp # Import the new chat blueprint

# Load environment variables
load_dotenv()

def create_app():
    app = Flask(__name__)
    app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'your_default_secret_key')
    app.config['UPLOAD_FOLDER'] = './uploads'
    
    # Load Google API Key into config
    app.config['GOOGLE_API_KEY'] = os.environ.get('GOOGLE_API_KEY')
    if not app.config['GOOGLE_API_KEY']:
        logging.warning("GOOGLE_API_KEY environment variable not set. Embedding and Chat features requiring it will fail.")

    # Initialize rate limiter
    limiter = Limiter(
        get_remote_address,
    )

    app.register_blueprint(project_bp)
    app.register_blueprint(embed_bp)
    app.register_blueprint(chat_bp) # Register the chat blueprint

    # Simple route for the home page
    @app.route('/')
    def home():
        return render_template('index.html')

    logging.info("Flask app created and configured.")
    return app

# ... existing code ... 