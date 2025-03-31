#!/usr/bin/env python3

import sys
import os
import logging # Import logging

# Add the src directory to the Python path
current_dir = os.path.dirname(os.path.abspath(__file__))
sys.path.append(os.path.join(current_dir, 'src'))

# Import necessary modules
from gui.main_window import App # Import the App class
from utils.config import load_config # Import the config loader

def main():
    logging.info("Literature AI Research Assistant - Starting...")
    # Load configuration
    try:
        config = load_config()
    except SystemExit as e:
        logging.error(f"Failed to load configuration: {e}")
        # Optionally add a small delay or user prompt before exiting
        # input("Press Enter to exit...") 
        sys.exit(1) # Exit if config loading fails
    except Exception as e:
        logging.exception("An unexpected error occurred during startup.") # Log full traceback
        # input("Press Enter to exit...") 
        sys.exit(1)
    
    # Initialize and run the GUI
    logging.info("Initializing GUI...")
    app = App(config)
    app.protocol("WM_DELETE_WINDOW", app.on_closing) # Handle window close properly 
    app.mainloop()
    # logging.info("Placeholder: GUI would start here.") # Remove placeholder
    # Example: Print loaded project ID to verify config access
    # logging.info(f"Successfully loaded config for project: {config.get('VERTEX_AI_PROJECT')}") # Remove test print

if __name__ == "__main__":
    main() 