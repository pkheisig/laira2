import customtkinter as ctk
from tkinter import filedialog, END
import os
import threading
import logging
import time # For simulation
import sys # For sys.exit in main
import json # Added for settings persistence

# --- Core Processing Imports ---
try:
    import chromadb
    from chromadb.config import Settings as ChromaSettings # For potential future settings
    from google.cloud import aiplatform 
    import vertexai # Often implicitly used via aiplatform.init
    from vertexai.language_models import TextEmbeddingModel, TextEmbeddingInput
    from langchain_community.document_loaders import DirectoryLoader, TextLoader, PyPDFLoader # Added PyPDFLoader
    from langchain.text_splitter import RecursiveCharacterTextSplitter
    from vertexai.generative_models import GenerativeModel, Part, GenerationConfig # Added GenerativeModel
    from .settings_dialog import SettingsDialog  # Import the settings dialog
except ImportError as e:
     logging.error(f"Critical libraries missing: {e}. Please install requirements.txt.")
     # In a real app, might show a GUI popup before exiting
     sys.exit(f"Error: Missing required libraries ({e}). Run 'pip install -r requirements.txt'")


# Constants
DEFAULT_COLLECTION_NAME = "literature_embeddings"
# Vertex AI embedding limits (check documentation for the specific model)
# text-embedding-005 supports larger batches than older models
VERTEX_EMBEDDING_BATCH_SIZE = 20
# Langchain chunking settings
CHUNK_SIZE = 1000
CHUNK_OVERLAP = 100
# Search constants
NUM_SEARCH_RESULTS = 5 # Number of chunks to retrieve from ChromaDB
DEFAULT_ANSWER = "Could not find relevant information in the provided documents."
# Settings file path
SETTINGS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__)))), "app_settings.json")

# Default settings
DEFAULT_SETTINGS = {
    # General
    'input_dir': '',
    'query_model': 'gemini-2.0-flash',
    # Generation
    'temperature': 0.2,
    'max_output_tokens': 8192,
    'top_p': 0.95,
    'top_k': 40,
    # Database
    'default_db_name': 'literature_embeddings.db',
    'collection_name': 'literature_embeddings',
    'chunk_size': 1000,
    'chunk_overlap': 100,
    'embedding_batch_size': 20,
    'search_results_count': 5
}

class App(ctk.CTk):
    def __init__(self, config, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.config = config
        self.title("Literature AI Research Assistant")
        self.geometry("850x750") # Adjusted size

        # --- Appearance ---
        # Modes: "System" (default), "Dark", "Light"
        # Themes: "blue" (default), "green", "dark-blue"
        # Uncomment desired theme/mode if needed
        # ctk.set_appearance_mode("Dark") 
        # ctk.set_default_color_theme("dark-blue") 

        # --- State Variables ---
        self.current_db_file = None  # Currently loaded DB file
        self.current_process_thread = None
        self.stop_requested = threading.Event()
        
        # --- Settings ---
        self.settings = DEFAULT_SETTINGS.copy()
        self._load_settings()

        # --- GUI Elements ---
        self._create_widgets()
        self.log_status("Application initialized. Select documents directory and proceed.")

    def _load_settings(self):
        """Load previous settings if they exist"""
        try:
            if os.path.exists(SETTINGS_FILE):
                with open(SETTINGS_FILE, 'r') as f:
                    saved_settings = json.load(f)
                    
                    # Update settings with saved values
                    for key, value in saved_settings.items():
                        self.settings[key] = value
                        
                    logging.info(f"Loaded settings from {SETTINGS_FILE}")
        except Exception as e:
            logging.error(f"Error loading settings: {e}")
            # Continue with default settings if there's an error

    def _save_settings(self):
        """Save current settings"""
        try:
            # Create directory if it doesn't exist
            os.makedirs(os.path.dirname(SETTINGS_FILE), exist_ok=True)
            
            with open(SETTINGS_FILE, 'w') as f:
                json.dump(self.settings, f, indent=2)
                
            logging.info(f"Saved settings to {SETTINGS_FILE}")
        except Exception as e:
            logging.error(f"Error saving settings: {e}")

    def _create_widgets(self):
        """Creates and arranges all the GUI widgets."""
        self.grid_columnconfigure(0, weight=1)
        self.grid_rowconfigure(3, weight=1) # Make results area expand
        self.grid_rowconfigure(5, weight=1) # Make status area expand a bit

        # --- Menu Bar with Settings ---
        menu_frame = ctk.CTkFrame(self)
        menu_frame.grid(row=0, column=0, padx=10, pady=(10, 5), sticky="ew")
        menu_frame.grid_columnconfigure(1, weight=1)  # Push buttons to the right
        
        # Input Documents - Show current directory
        dir_label = ctk.CTkLabel(menu_frame, text=f"Input: {self.settings.get('input_dir', 'Not selected')}")
        dir_label.grid(row=0, column=0, padx=10, pady=5, sticky="w")
        self.dir_label = dir_label  # Store reference to update later
        
        # Settings button (right-aligned)
        settings_btn = ctk.CTkButton(menu_frame, text="Settings", command=self._open_settings)
        settings_btn.grid(row=0, column=1, padx=10, pady=5, sticky="e")

        # --- Action Buttons Frame ---
        action_frame = ctk.CTkFrame(self)
        action_frame.grid(row=1, column=0, padx=10, pady=5, sticky="ew")
        action_frame.grid_columnconfigure((0, 1, 2, 3), weight=1) 

        self.embed_button = ctk.CTkButton(action_frame, text="Embed Documents", command=self._start_embedding_dialog)
        self.embed_button.grid(row=0, column=0, padx=10, pady=10, sticky="ew")

        self.load_db_button = ctk.CTkButton(action_frame, text="Load Database", command=self._load_database)
        self.load_db_button.grid(row=0, column=1, padx=10, pady=10, sticky="ew")

        self.stop_button = ctk.CTkButton(action_frame, text="Stop Process", command=self._request_stop, state="disabled")
        self.stop_button.grid(row=0, column=2, padx=10, pady=10, sticky="ew")
        
        self.clear_button = ctk.CTkButton(action_frame, text="Clear Query/Results", command=self._clear_fields)
        self.clear_button.grid(row=0, column=3, padx=10, pady=10, sticky="ew")

        # --- Query Frame ---
        query_frame = ctk.CTkFrame(self)
        query_frame.grid(row=2, column=0, padx=10, pady=5, sticky="ew")
        query_frame.grid_columnconfigure(0, weight=1) # Make entry expand

        ctk.CTkLabel(query_frame, text="Enter your query:").grid(row=0, column=0, columnspan=2, padx=(10, 5), pady=(10,0), sticky="w")
        self.query_entry = ctk.CTkEntry(query_frame, placeholder_text="Ask a question about your documents...", height=40)
        self.query_entry.grid(row=1, column=0, padx=(10, 5), pady=(5,10), sticky="ew")
        self.search_button = ctk.CTkButton(query_frame, text="Search", width=80, command=self._start_search_thread) 
        self.search_button.grid(row=1, column=1, padx=(0, 10), pady=(5,10))
        # Bind Enter key in query entry to search button action
        self.query_entry.bind("<Return>", lambda event: self._start_search_thread())

        # --- Results Display ---
        ctk.CTkLabel(self, text="Results:").grid(row=3, column=0, padx=10, pady=(5,0), sticky="nw")
        self.results_text = ctk.CTkTextbox(self, wrap="word", state="disabled", border_width=1) 
        self.results_text.grid(row=4, column=0, padx=10, pady=(0,5), sticky="nsew")

        # --- Status Display ---
        ctk.CTkLabel(self, text="Status:").grid(row=5, column=0, padx=10, pady=(5,0), sticky="nw")
        self.status_text = ctk.CTkTextbox(self, height=120, wrap="word", state="disabled", border_width=1)
        self.status_text.grid(row=6, column=0, padx=10, pady=(0,10), sticky="nsew")
        
        # Update UI based on DB state
        self._update_db_status()

    def _open_settings(self):
        """Open the settings dialog"""
        dialog = SettingsDialog(self, self.settings)
        dialog.wait_for_close()
        
        # Settings are now updated, save them
        self._save_settings()
        
        # Update UI that depends on settings
        self.dir_label.configure(text=f"Input: {self.settings.get('input_dir', 'Not selected')}")
        
        self.log_status("Settings updated.")

    def _update_db_status(self):
        """Update UI elements based on current DB status"""
        if self.current_db_file and os.path.exists(self.current_db_file):
            self.search_button.configure(state="normal")
            db_name = os.path.basename(self.current_db_file)
            self.log_status(f"Using database: {db_name}")
        else:
            self.search_button.configure(state="disabled")
            
    def _load_database(self):
        """Open file dialog to select a ChromaDB database file"""
        db_file = filedialog.askopenfilename(
            title="Select Database File",
            filetypes=[("Database Files (*.db, *.sqlite3)", "*.db *.sqlite3"), ("All Files", "*")],
            initialdir=os.path.dirname(self.current_db_file) if self.current_db_file else os.getcwd()
        )
        
        if db_file:
            # Check if it's a valid ChromaDB file
            db_dir = os.path.dirname(db_file)
            if not os.path.exists(os.path.join(db_dir, "chroma.sqlite3")):
                self.log_status(f"Warning: Selected file may not be a valid ChromaDB database.", "WARN")
            
            self.current_db_file = db_file
            self._update_db_status()
            self.log_status(f"Loaded database from: {db_file}")
    
    def _start_embedding_dialog(self):
        """Open dialog to confirm embedding and select output location"""
        input_dir = self.settings.get('input_dir', '')
        if not input_dir or not os.path.isdir(input_dir):
            self.log_status("Error: Please set input directory in Settings first.", "ERROR")
            return
            
        # Ask for save location
        save_file = filedialog.asksaveasfilename(
            title="Save Embedded Database As",
            defaultextension=".db",
            filetypes=[("Database Files", "*.db"), ("All Files", "*.*")],
            initialfile=self.settings.get('default_db_name', 'literature_embeddings.db')
        )
        
        if save_file:
            # Create parent directory if it doesn't exist
            save_dir = os.path.dirname(save_file)
            os.makedirs(save_dir, exist_ok=True)
            
            # Start embedding process
            self._start_thread(self._run_embedding, (input_dir, save_file), "Embedding Process")

    # --- UI Interaction Methods ---

    def log_status(self, message, level="INFO"):
        """Appends a message to the status text box, thread-safe."""
        # Use after() to ensure GUI updates happen in the main thread
        def _update():
            try:
                current_content = self.status_text.get("1.0", END).strip()
                if current_content:
                    new_message = f"\n[{level}] {message}"
                else:
                    new_message = f"[{level}] {message}"

                self.status_text.configure(state="normal")
                self.status_text.insert(END, new_message)
                self.status_text.configure(state="disabled")
                self.status_text.see(END) # Scroll to the end
            except Exception as e:
                 # Fallback logging if GUI update fails (e.g., during shutdown)
                 print(f"GUI Status Log Error: {e}")
                 logging.error(f"GUI Status Log Error: {e}", exc_info=True)

        self.after(0, _update)

    def _set_ui_state(self, processing: bool):
        """Enables/disables widgets based on whether a process is running."""
        state = "disabled" if processing else "normal"
        # Buttons that start processes
        self.embed_button.configure(state=state)
        self.search_button.configure(state=state) # TODO: Also depends on DB existence

        # Directory selection
        self.load_db_button.configure(state=state)
        self.clear_button.configure(state=state)
        
        # Query entry and clear button
        self.query_entry.configure(state=state)

        # Stop button is enabled ONLY when processing
        self.stop_button.configure(state="normal" if processing else "disabled")
        
        # Force UI update
        self.update_idletasks() 

    # --- Threading and Process Execution ---

    def _start_thread(self, target_func, args_tuple, process_name="Process"):
        """Generic method to start a background thread."""
        if self.current_process_thread and self.current_process_thread.is_alive():
            self.log_status("Another process is already running.", "WARN")
            return

        self.log_status(f"Starting {process_name}...")
        self._set_ui_state(processing=True)
        self.stop_requested.clear() 

        self.current_process_thread = threading.Thread(target=target_func, args=args_tuple, daemon=True)
        self.current_process_thread.start()
        # Optionally monitor the thread if needed (e.g., for progress bar)
        # self.monitor_thread(self.current_process_thread)

    def _request_stop(self):
        """Sets the stop flag for the currently running process."""
        if self.current_process_thread and self.current_process_thread.is_alive():
            self.log_status("Stop requested. Waiting for current operation to terminate...", "WARN")
            self.stop_requested.set()
            self.stop_button.configure(state="disabled") # Prevent multiple clicks
        else:
             self.log_status("No process running to stop.", "INFO")

    def _process_finished(self):
        """Resets UI state after a process completes or is stopped."""
        self.current_process_thread = None
        self.stop_requested.clear()
        self.after(0, self._set_ui_state, False) # Schedule UI update in main thread

    # --- Embedding ---

    def _run_embedding(self, input_path, output_path):
        """Target function for the embedding thread. Loads, chunks, embeds, and stores documents."""
        try:
            self.log_status(f"Starting embedding process...")
            self.log_status(f"Input directory: {input_path}")
            self.log_status(f"Database file: {output_path}")

            # --- 1. Initialize Vertex AI ---
            # Ensure GOOGLE_APPLICATION_CREDENTIALS is set (done in config.py)
            try:
                self.log_status(f"Initializing Vertex AI (Project: {self.config['VERTEX_AI_PROJECT']}, Location: {self.config['VERTEX_AI_LOCATION']})...")
                aiplatform.init(
                    project=self.config['VERTEX_AI_PROJECT'],
                    location=self.config['VERTEX_AI_LOCATION'],
                    # credentials=... # Usually inherited from env var set in config.py
                )
                self.log_status("Vertex AI initialized successfully.")
            except Exception as ai_init_err:
                self.log_status(f"Fatal Error: Failed to initialize Vertex AI: {ai_init_err}", "ERROR")
                logging.error("Vertex AI Initialization failed", exc_info=True)
                return # Stop the process if Vertex AI can't init

            # --- 2. Initialize Embedding Model ---
            try:
                model_name = self.config['VERTEX_EMBEDDING_MODEL']
                self.log_status(f"Loading embedding model: {model_name}...")
                embedding_model = TextEmbeddingModel.from_pretrained(model_name)
                self.log_status("Embedding model loaded.")
            except Exception as model_load_err:
                self.log_status(f"Fatal Error: Failed to load embedding model '{model_name}': {model_load_err}", "ERROR")
                logging.error("Embedding Model loading failed", exc_info=True)
                return # Stop if model can't be loaded

            # --- 3. Initialize ChromaDB Client ---
            try:
                # Extract directory from output_path
                output_dir = os.path.dirname(output_path)
                self.log_status(f"Initializing ChromaDB client at: {output_dir}...")
                
                # Create output directory if it doesn't exist
                os.makedirs(output_dir, exist_ok=True)
                
                # Initialize persistent client
                chroma_client = chromadb.PersistentClient(path=output_dir)
                self.log_status("ChromaDB client initialized.")

                collection_name = self.settings['collection_name']
                self.log_status(f"Creating ChromaDB collection: '{collection_name}'...")
                
                # Create a new collection (or get existing if name already exists)
                collection = chroma_client.get_or_create_collection(
                    name=collection_name,
                    metadata={"embedding_model": model_name}
                )
                
                self.log_status(f"Using ChromaDB collection: '{collection.name}'. Current item count: {collection.count()}")

            except Exception as db_init_err:
                self.log_status(f"Fatal Error: Failed to initialize ChromaDB or collection: {db_init_err}", "ERROR")
                logging.error("ChromaDB Initialization failed", exc_info=True)
                return # Stop if DB can't be accessed

            # --- 4. Load Documents ---
            # Using Langchain DirectoryLoader for simplicity. Supports glob patterns.
            documents = []
            try:
                # Load .txt files
                self.log_status(f"Loading .txt documents from {input_path}...")
                txt_loader = DirectoryLoader(
                    input_path, 
                    glob="**/*.txt", 
                    loader_cls=TextLoader, 
                    show_progress=True,
                    use_multithreading=True,
                    silent_errors=True
                )
                txt_docs = txt_loader.load()
                if txt_docs:
                     documents.extend(txt_docs)
                     self.log_status(f"Loaded {len(txt_docs)} .txt documents.")
                else:
                     self.log_status("No .txt documents found.")

                # Load .pdf files
                if 'PyPDFLoader' in globals():
                    self.log_status(f"Loading .pdf documents from {input_path}...")
                    try:
                        pdf_loader = DirectoryLoader(
                             input_path, 
                             glob="**/*.pdf", 
                             loader_cls=PyPDFLoader, 
                             show_progress=True,
                             use_multithreading=True,
                             silent_errors=True
                        )
                        pdf_docs = pdf_loader.load()
                        if pdf_docs:
                            documents.extend(pdf_docs)
                            self.log_status(f"Loaded {len(pdf_docs)} .pdf documents.")
                        else:
                            self.log_status("No .pdf documents found.")
                    except ImportError:
                         self.log_status("PyPDFLoader not available. Install 'pypdf2' to load PDFs.", "WARN")
                    except Exception as pdf_load_err:
                        self.log_status(f"Error loading PDF documents: {pdf_load_err}", "WARN")
                        logging.warning("PDF Loading error", exc_info=True)
                else:
                    self.log_status("PDF support not available (check imports/requirements).", "WARN")

                if not documents:
                    self.log_status("No documents found to process in the input directory.", "WARN")
                    return # Nothing to do
                
                self.log_status(f"Total documents loaded: {len(documents)}")

            except Exception as load_err:
                self.log_status(f"Error loading documents: {load_err}", "ERROR")
                logging.error("Document loading failed", exc_info=True)
                return # Stop if loading fails

            # --- 5. Chunk Documents ---
            try:
                chunk_size = self.settings['chunk_size']
                chunk_overlap = self.settings['chunk_overlap']
                self.log_status(f"Chunking documents (Chunk size: {chunk_size}, Overlap: {chunk_overlap})...")
                
                text_splitter = RecursiveCharacterTextSplitter(
                    chunk_size=chunk_size,
                    chunk_overlap=chunk_overlap,
                    length_function=len,
                    add_start_index=True,
                )
                chunks = text_splitter.split_documents(documents)
                total_chunks = len(chunks)
                if total_chunks == 0:
                     self.log_status("No text chunks generated from documents.", "WARN")
                     return
                self.log_status(f"Split documents into {total_chunks} chunks.")
            except Exception as split_err:
                self.log_status(f"Error chunking documents: {split_err}", "ERROR")
                logging.error("Document chunking failed", exc_info=True)
                return # Stop if chunking fails

            # --- 6. Iterate, Embed, and Add to ChromaDB ---
            self.log_status(f"Starting embedding and indexing for {total_chunks} chunks...")
            
            processed_chunks = 0
            errors_encountered = 0
            
            # Prepare data for batching
            chunk_texts = [chunk.page_content for chunk in chunks]
            # Create richer metadata including source and start index
            chunk_metadatas = []
            for chunk in chunks:
                 meta = chunk.metadata.copy() # Start with existing metadata (like source)
                 chunk_metadatas.append(meta)

            # Create unique IDs based on source and start_index if available
            chunk_ids = []
            for i, chunk in enumerate(chunks):
                source = os.path.basename(chunk.metadata.get('source', f'unknown_doc_{i}'))
                start_index = chunk.metadata.get('start_index', i) # Use index as fallback
                # Sanitize source for Chroma ID
                source_safe = "".join(c if c.isalnum() or c in ('_', '-') else '_' for c in source)
                chunk_ids.append(f"id_{source_safe}_{start_index}")

            # --- Batch Processing ---
            batch_size = self.settings['embedding_batch_size']
            for i in range(0, total_chunks, batch_size):
                if self.stop_requested.is_set():
                    self.log_status("Embedding process stopped by user.", "WARN")
                    return 

                batch_start = i
                batch_end = min(i + batch_size, total_chunks)
                current_batch_size = batch_end - batch_start
                
                batch_texts_content = chunk_texts[batch_start:batch_end]
                batch_texts_inputs = [TextEmbeddingInput(text=text, task_type="RETRIEVAL_DOCUMENT") for text in batch_texts_content]
                batch_ids_content = chunk_ids[batch_start:batch_end]
                batch_metadatas_content = chunk_metadatas[batch_start:batch_end]

                batch_num = (i // batch_size) + 1
                total_batches = (total_chunks + batch_size - 1) // batch_size

                self.log_status(f"Processing Batch {batch_num}/{total_batches} ({current_batch_size} chunks)... ")

                try:
                    # Embed the batch
                    embeddings_response = embedding_model.get_embeddings(batch_texts_inputs)
                    embeddings_list = [e.values for e in embeddings_response]

                    if len(embeddings_list) != current_batch_size:
                         raise ValueError(f"Mismatch between requested ({current_batch_size}) and received ({len(embeddings_list)}) embeddings.")

                    # Add batch to ChromaDB
                    collection.add(
                        ids=batch_ids_content,
                        embeddings=embeddings_list,
                        metadatas=batch_metadatas_content,
                        documents=batch_texts_content
                    )
                    processed_chunks += current_batch_size
                    self.log_status(f"  Batch {batch_num}/{total_batches} processed. Total chunks indexed: {processed_chunks}/{total_chunks}")

                except Exception as batch_err:
                    errors_encountered += 1
                    self.log_status(f"Error processing batch {batch_num}: {batch_err}", "ERROR")
                    logging.error(f"Error in embedding/indexing batch {batch_num}", exc_info=True)
                    self.log_status(f"Skipping batch {batch_num} due to error.", "WARN")

            # --- Final Status ---
            if self.stop_requested.is_set():
                pass
            elif errors_encountered > 0:
                 self.log_status(f"Embedding process finished with {errors_encountered} errors.", "WARN")
                 self.log_status(f"Successfully indexed {processed_chunks} out of {total_chunks} chunks.", "WARN")
            else:
                 self.log_status("Embedding process completed successfully.")
                 self.log_status(f"Total chunks indexed: {collection.count()}")
                 
                 # Set as current DB file if successful
                 self.current_db_file = output_path
                 self._update_db_status()

        except Exception as e:
            # Catch-all for unexpected errors in the main flow
            self.log_status(f"An unexpected error occurred during embedding: {e}", "ERROR")
            logging.error("Embedding process failed unexpectedly", exc_info=True)
        finally:
            # Ensure UI state is reset regardless of success or failure
            self._process_finished()

    # --- Searching ---
    
    def _start_search_thread(self):
        """Validates inputs and starts the search process in a thread."""
        query = self.query_entry.get()
        db_path = self.current_db_file

        if not query:
            self.log_status("Error: Please enter a query.", "ERROR")
            return
            
        # Check if DB file is loaded
        if not db_path or not os.path.exists(db_path):
             self.log_status(f"Error: Please load a database file first.", "ERROR")
             return
             
        self._update_results("Searching...") # Show immediate feedback
        self._start_thread(self._run_search, (query, db_path), "Search Process")
        

    def _run_search(self, query, db_path):
        """Target function for the search thread. Embeds query, searches DB, generates answer."""
        try:
            self.log_status(f"Starting search process...")
            self.log_status(f"Query: '{query[:80]}...'") # Log truncated query
            self.log_status(f"Database: {os.path.basename(db_path)}")

            # --- 1. Initialize Vertex AI (if not done globally) ---
            try:
                aiplatform.init(
                    project=self.config['VERTEX_AI_PROJECT'],
                    location=self.config['VERTEX_AI_LOCATION']
                )
            except Exception as ai_init_err:
                self.log_status(f"Error initializing Vertex AI: {ai_init_err}", "ERROR")
                self._update_results(f"Error connecting to Vertex AI: {ai_init_err}")
                return 

            # --- 2. Initialize Models ---
            try:
                embed_model_name = self.config['VERTEX_EMBEDDING_MODEL']
                gen_model_name = self.settings['query_model']
                self.log_status(f"Using models - Embedding: {embed_model_name}, Generation: {gen_model_name}")
                
                embedding_model = TextEmbeddingModel.from_pretrained(embed_model_name)
                generative_model = GenerativeModel(gen_model_name)
            except Exception as model_load_err:
                self.log_status(f"Error loading AI models: {model_load_err}", "ERROR")
                self._update_results(f"Error loading AI models: {model_load_err}")
                return 

            # --- 3. Initialize ChromaDB Client & Get Collection ---
            try:
                # Get directory containing the DB file
                db_dir = os.path.dirname(db_path)
                chroma_client = chromadb.PersistentClient(path=db_dir)
                collection_name = self.settings['collection_name']
                
                collection = chroma_client.get_collection(name=collection_name)
                self.log_status(f"Connected to collection '{collection.name}'. Document count: {collection.count()}")
                
                if collection.count() == 0:
                     self.log_status(f"Warning: The database collection is empty.", "WARN")
                     self._update_results("The document database is empty. Please embed documents first.")
                     return

            except Exception as db_err:
                 self.log_status(f"Error accessing ChromaDB: {db_err}", "ERROR")
                 self._update_results(f"Failed to access database. Details: {db_err}")
                 return
                 
            # --- 4. Embed User Query ---
            if self.stop_requested.is_set(): return
            self.log_status("Embedding user query...")
            try:
                 # Specify task_type="RETRIEVAL_QUERY" for query embeddings
                 query_input = TextEmbeddingInput(text=query, task_type="RETRIEVAL_QUERY")
                 query_embedding_response = embedding_model.get_embeddings([query_input])
                 query_embedding = query_embedding_response[0].values
                 self.log_status("Query embedded successfully.")
            except Exception as emb_err:
                 self.log_status(f"Failed to embed query: {emb_err}", "ERROR")
                 self._update_results(f"Failed to process query embedding: {emb_err}")
                 return
                 
            # --- 5. Query ChromaDB ---
            if self.stop_requested.is_set(): return
            results_count = self.settings['search_results_count']
            self.log_status(f"Querying database for {results_count} relevant document chunks...")
            try:
                results = collection.query(
                    query_embeddings=[query_embedding],
                    n_results=results_count,
                    include=['documents', 'metadatas', 'distances']
                )
            except Exception as query_err:
                self.log_status(f"Error querying ChromaDB: {query_err}", "ERROR")
                self._update_results(f"Failed to query the database: {query_err}")
                return

            # Check for empty or malformed results
            if not results or not results.get('ids') or not results['ids'][0]:
                 self.log_status("No relevant document chunks found in the database.", "INFO")
                 self._update_results("Could not find relevant information in the provided documents.")
                 return
                 
            retrieved_docs = results['documents'][0]
            retrieved_metadatas = results['metadatas'][0]
            self.log_status(f"Found {len(retrieved_docs)} potentially relevant document chunks.")

            # --- 6. Format Context & Prepare Prompt ---
            context = "\n\n---\n\n".join(retrieved_docs)
            unique_sources = sorted(list(set(os.path.basename(meta.get('source', 'Unknown Source')) for meta in retrieved_metadatas)))
            source_info = "\n\nSources considered:\n - " + "\n - ".join(unique_sources) if unique_sources else ""

            prompt = f"Based *only* on the following context extracted from documents, please provide a detailed and comprehensive answer to the question. If the context does not contain the answer, state that the information is not available in the provided documents.\n\nContext:\n-------\n{context}\n-------\n\nQuestion: {query}\n\nAnswer:"
            
            # --- 7. Call Generative Model (Gemini) ---
            if self.stop_requested.is_set(): return
            self.log_status(f"Generating answer using {gen_model_name}...")
            try:
                # Configure generation parameters from settings
                generation_config = GenerationConfig(
                    temperature=self.settings['temperature'],
                    max_output_tokens=self.settings['max_output_tokens'],
                    top_p=self.settings['top_p'],
                    top_k=self.settings['top_k'],
                )
                
                self.log_status(f"Using temperature: {self.settings['temperature']}, max tokens: {self.settings['max_output_tokens']}")
                
                # Send the prompt to the model
                response = generative_model.generate_content(
                    contents=prompt,
                    generation_config=generation_config,
                )
                
                # Extract the text response
                answer = response.text
                self.log_status("Answer generated successfully.")
                
            except Exception as gen_err:
                self.log_status(f"Error calling generative model: {gen_err}", "ERROR")
                self._update_results(f"Failed to generate answer from the AI model: {gen_err}")
                return
                
            # --- 8. Format and Display Final Answer ---
            if self.stop_requested.is_set(): 
                 self.log_status("Search process stopped by user before displaying results.", "WARN")
                 self._update_results("Search cancelled.")
                 return

            final_answer = answer + source_info
            self._update_results(final_answer)
            self.log_status("Search completed successfully.")


        except Exception as e:
            # Catch-all for unexpected errors in the main search flow
            self.log_status(f"An unexpected error occurred during search: {e}", "ERROR")
            self._update_results(f"An unexpected error occurred during the search:\n{e}")
            logging.error("Search process failed unexpectedly", exc_info=True)
        finally:
             # Ensure UI state is reset
            self._process_finished()

    def _update_results(self, text):
         """Updates the results text box, thread-safe."""
         def _update():
             try:
                 self.results_text.configure(state="normal")
                 self.results_text.delete("1.0", END)
                 self.results_text.insert(END, text)
                 self.results_text.configure(state="disabled")
             except Exception as e:
                 print(f"GUI Result Update Error: {e}")
                 logging.error(f"GUI Result Update Error: {e}", exc_info=True)
         self.after(0, _update)


    def _clear_fields(self):
        """Clears the query entry and results text box."""
        self.query_entry.delete(0, END)
        self._update_results("") # Use the safe update method
        self.log_status("Query and results cleared.")

    # --- Window Closing ---
    def on_closing(self, event=0):
        """Handles the window close event."""
        self.log_status("Close requested. Attempting to stop ongoing processes...", "INFO")
        # Save settings before closing
        self._save_settings()
        
        if self.current_process_thread and self.current_process_thread.is_alive():
            self.stop_requested.set()
            self.log_status("Waiting briefly for process to stop...", "INFO")
            # Don't wait indefinitely, give it a moment then close.
            # Use after to check and destroy, preventing GUI freeze during wait.
            self.after(100, self._check_thread_and_destroy) 
        else:
            self.destroy() # No thread running, destroy immediately

    def _check_thread_and_destroy(self):
         if self.current_process_thread and self.current_process_thread.is_alive():
              # Optionally wait a bit longer or just force close
              self.log_status("Process still running, closing window anyway.", "WARN")
         self.destroy()

# Example of running just the GUI for testing (requires config object)
if __name__ == '__main__':
     # This block allows testing the GUI layout independently 
     # It requires manual creation of a dummy config
     print("Running GUI standalone test (requires dummy config)...")
     
     # --- Dummy Config for Testing ---
     dummy_config = {
         'VERTEX_AI_PROJECT': 'test-project',
         'VERTEX_AI_LOCATION': 'test-location',
         'GOOGLE_APPLICATION_CREDENTIALS': 'test_credentials.json', # Does not need to exist for layout test
         'GOOGLE_API_KEY': None,
         'VERTEX_EMBEDDING_MODEL': 'test-embedding-model',
         'VERTEX_GENERATIVE_MODEL': 'test-generative-model'
     }
     logging.basicConfig(level=logging.INFO) # Setup basic logging for the test

     app = App(config=dummy_config)
     app.protocol("WM_DELETE_WINDOW", app.on_closing) # Handle window close
     app.mainloop() 