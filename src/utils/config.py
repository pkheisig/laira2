import os
from dotenv import load_dotenv
import sys
import logging

# Configure basic logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Default model names (can be overridden by .env)
DEFAULT_EMBEDDING_MODEL = "text-embedding-005"
# Using Gemini 2.0 Flash model which is faster but still high quality
DEFAULT_GENERATIVE_MODEL = "gemini-2.0-flash"

def load_config() -> dict:
    """Loads configuration from .env file and validates required variables."""

    # Construct the path to the .env file relative to this script's directory
    # This assumes config.py is in src/utils and .env is in the root project directory
    project_root = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    dotenv_path = os.path.join(project_root, '.env')

    if not os.path.exists(dotenv_path):
        logging.error(f".env file not found at expected path: {dotenv_path}")
        logging.error("Please ensure the .env file exists in the project root directory.")
        sys.exit("Error: Configuration file .env not found.") # Exit if .env is crucial

    load_dotenv(dotenv_path=dotenv_path, override=True) # Load variables from .env
    logging.info(f"Loaded configuration from: {dotenv_path}")

    config = {}
    required_vars = {
        "GOOGLE_API_KEY": "Path to Google API Key",
        "GOOGLE_APPLICATION_CREDENTIALS": "Path to Google Service Account JSON key file",
        "VERTEX_AI_PROJECT": "Google Cloud Project ID for Vertex AI",
        "VERTEX_AI_LOCATION": "Google Cloud Region for Vertex AI (e.g., us-central1)"
    }
    missing_vars = []
    credential_file_valid = True # Assume valid initially

    for var, description in required_vars.items():
        value = os.getenv(var)
        if not value:
            missing_vars.append(f"- {var}: ({description})")
        else:
            config[var] = value
            # Special check for credentials file existence
            if var == "GOOGLE_APPLICATION_CREDENTIALS":
                if not os.path.isfile(value):
                    logging.warning(f"Service account file specified in .env not found at: {value}")
                    credential_file_valid = False
                    # Keep the invalid path in config for now, let Vertex AI SDK potentially handle it
                    # If strict validation is needed, uncomment the next line
                    # missing_vars.append(f"- {var}: File not found at specified path '{value}'")
                else:
                    logging.info(f"Service Account Key File found: {value}")

    # Handle optional variables
    config["GOOGLE_API_KEY"] = os.getenv("GOOGLE_API_KEY") # Optional
    config["VERTEX_EMBEDDING_MODEL"] = os.getenv("VERTEX_EMBEDDING_MODEL", DEFAULT_EMBEDDING_MODEL)
    config["VERTEX_GENERATIVE_MODEL"] = os.getenv("VERTEX_GENERATIVE_MODEL", DEFAULT_GENERATIVE_MODEL)

    if missing_vars:
        error_message = "Error: Missing required environment variables in .env file:\n" + "\n".join(missing_vars)
        logging.error(error_message)
        sys.exit(error_message) # Exit if required vars are missing

    # Set GOOGLE_APPLICATION_CREDENTIALS environment variable specifically for google-cloud libraries
    # only if it was found and the file path is valid.
    if "GOOGLE_APPLICATION_CREDENTIALS" in config and config["GOOGLE_APPLICATION_CREDENTIALS"] and credential_file_valid:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = config["GOOGLE_APPLICATION_CREDENTIALS"]
        logging.info(f"Set GOOGLE_APPLICATION_CREDENTIALS environment variable for gcloud libraries.")
    elif "GOOGLE_APPLICATION_CREDENTIALS" in config:
        logging.warning(f"GOOGLE_APPLICATION_CREDENTIALS path '{config['GOOGLE_APPLICATION_CREDENTIALS']}' is invalid or file not found. Cannot set environment variable for gcloud libraries.")

    logging.info("Configuration loaded successfully.")
    logging.info(f"Using Project ID: {config.get('VERTEX_AI_PROJECT')}")
    logging.info(f"Using Region: {config.get('VERTEX_AI_LOCATION')}")
    logging.info(f"Using Embedding Model: {config.get('VERTEX_EMBEDDING_MODEL')}")
    logging.info(f"Using Generative Model: {config.get('VERTEX_GENERATIVE_MODEL')}")

    return config

if __name__ == '__main__':
    # Example usage when running this script directly for testing
    print("Testing configuration loading...")
    try:
        loaded_config = load_config()
        print("\nLoaded Configuration:")
        for key, value in loaded_config.items():
            # Mask sensitive keys like API key if printing
            if "KEY" in key and value:
                print(f"  {key}: {'*' * 8}")
            else:
                print(f"  {key}: {value}")
    except SystemExit as e:
        print(f"\nConfiguration loading failed: {e}")
    except Exception as e:
        print(f"\nAn unexpected error occurred during config loading test: {e}") 