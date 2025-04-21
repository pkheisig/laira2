"""
Helper functions for chat routes in LAIRA.
"""

import os
import json
import logging
from flask import current_app
from src.core.chat_engine import ChatEngine

# Constants
CONTEXT_TOKEN_LIMIT = 3000  # Adjust based on model and desired context length
MAX_QUERY_RESULTS = 5


def get_chat_history_path(project_id):
    project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
    return os.path.join(project_folder, 'history.json')


def get_or_create_chat_session(project_id):
    if not hasattr(current_app, 'chat_sessions'):
        current_app.chat_sessions = {}
    if project_id not in current_app.chat_sessions:
        project_folder = os.path.join(current_app.config['UPLOAD_FOLDER'], project_id)
        database_folder = os.path.join(project_folder, 'database')
        os.makedirs(database_folder, exist_ok=True)
        chat_history_file = get_chat_history_path(project_id)
        os.makedirs(project_folder, exist_ok=True)
        if not os.path.exists(chat_history_file):
            with open(chat_history_file, 'w') as f:
                json.dump([], f)
        chat_config = {
            "project_id": project_id,
            "n_results": MAX_QUERY_RESULTS,
            "temperature": 0.2,
            "persist_directory": database_folder,
            "chat_history_path": chat_history_file,
        }
        current_app.chat_sessions[project_id] = ChatEngine(chat_config)
        print(f"Created new chat session for project: {project_id}")
    return current_app.chat_sessions[project_id]


def format_context(results: list) -> str:
    """Formats retrieved documents into a single string for the prompt."""
    context_str = "Relevant Information:\n"
    token_count = 0
    included_count = 0
    for result in results:
        text = result.get('text', '')
        result_tokens = len(text.split())
        if token_count + result_tokens <= CONTEXT_TOKEN_LIMIT:
            context_str += (
                f"\n---\nSource: {result.get('metadata', {}).get('filename', 'Unknown')}"  
                f"\nContent:\n{text}\n---\n"
            )
            token_count += result_tokens
            included_count += 1
        else:
            logging.getLogger(__name__).warning(
                f"Context token limit ({CONTEXT_TOKEN_LIMIT}) reached. Included {included_count} results."
            )
            break
    return context_str


def build_prompt(query: str, context: str) -> str:
    """Constructs the final prompt for the Gemini model."""
    prompt = (
        "You are an AI assistant knowledgeable about the provided documents.\n"
        "Answer the following question based *only* on the relevant information provided below.\n"
        "If the information is not present in the context, say you don't have enough information.\n\n"
        f"{context}\n"
        f"Question: {query}\n\n"
        "Answer:"
    )
    return prompt 