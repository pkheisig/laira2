import customtkinter as ctk
from tkinter import filedialog
import os
import json
import logging

class SettingsDialog(ctk.CTkToplevel):
    def __init__(self, parent, settings, *args, **kwargs):
        super().__init__(parent, *args, **kwargs)
        self.parent = parent
        self.settings = settings
        
        # Configure window
        self.title("Settings")
        self.geometry("600x650")
        self.resizable(True, True)
        
        # Make the dialog modal
        self.transient(parent)
        self.grab_set()
        
        # Layout
        self.grid_columnconfigure(0, weight=1)
        
        # Create tabs
        self.tabview = ctk.CTkTabview(self)
        self.tabview.grid(row=0, column=0, padx=20, pady=20, sticky="nsew")
        self.tabview.add("General")
        self.tabview.add("Generation")
        self.tabview.add("Database")
        
        # Current values (for cancel button)
        self.original_settings = settings.copy()
        
        # Create all settings widgets
        self._create_general_settings(self.tabview.tab("General"))
        self._create_generation_settings(self.tabview.tab("Generation"))
        self._create_database_settings(self.tabview.tab("Database"))
        
        # Buttons
        btn_frame = ctk.CTkFrame(self)
        btn_frame.grid(row=1, column=0, padx=20, pady=10, sticky="ew")
        btn_frame.grid_columnconfigure((0, 1), weight=1)
        
        self.save_btn = ctk.CTkButton(btn_frame, text="Save", command=self._save_settings)
        self.save_btn.grid(row=0, column=0, padx=10, pady=10, sticky="e")
        
        self.cancel_btn = ctk.CTkButton(btn_frame, text="Cancel", command=self._cancel)
        self.cancel_btn.grid(row=0, column=1, padx=10, pady=10, sticky="w")
        
        # Center the dialog on parent
        self.update_idletasks()
        self.center_window()
        
    def _create_general_settings(self, parent_frame):
        # Input directory
        parent_frame.grid_columnconfigure(1, weight=1)
        
        row = 0
        ctk.CTkLabel(parent_frame, text="Input Documents Directory:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        input_frame = ctk.CTkFrame(parent_frame)
        input_frame.grid(row=row, column=1, padx=10, pady=10, sticky="ew")
        input_frame.grid_columnconfigure(0, weight=1)
        
        self.input_dir_var = ctk.StringVar(value=self.settings.get('input_dir', ''))
        self.input_dir_entry = ctk.CTkEntry(input_frame, textvariable=self.input_dir_var)
        self.input_dir_entry.grid(row=0, column=0, padx=(0, 5), sticky="ew")
        
        self.input_browse_btn = ctk.CTkButton(input_frame, text="Browse", width=80, command=self._browse_input_dir)
        self.input_browse_btn.grid(row=0, column=1)
        
        # Query model selection
        row += 1
        ctk.CTkLabel(parent_frame, text="Query Model:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.model_var = ctk.StringVar(value=self.settings.get('query_model', 'gemini-2.0-flash'))
        model_combo = ctk.CTkComboBox(
            parent_frame,
            values=[
                'gemini-2.0-flash'
            ],
            variable=self.model_var
        )
        model_combo.grid(row=row, column=1, padx=10, pady=10, sticky="ew")
        
        # Additional general settings can be added here
        
    def _create_generation_settings(self, parent_frame):
        parent_frame.grid_columnconfigure(1, weight=1)
        
        # Temperature
        row = 0
        ctk.CTkLabel(parent_frame, text="Temperature:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.temperature_var = ctk.DoubleVar(value=self.settings.get('temperature', 0.2))
        temperature_slider = ctk.CTkSlider(parent_frame, from_=0.0, to=1.0, variable=self.temperature_var)
        temperature_slider.grid(row=row, column=1, padx=10, pady=10, sticky="ew")
        
        # Temperature value display
        self.temperature_value = ctk.CTkLabel(parent_frame, text=f"{self.temperature_var.get():.2f}")
        self.temperature_value.grid(row=row, column=2, padx=10, pady=10)
        
        # Update temperature label when slider changes
        temperature_slider.configure(command=lambda value: self.temperature_value.configure(text=f"{value:.2f}"))
        
        # Max output tokens
        row += 1
        ctk.CTkLabel(parent_frame, text="Max Output Tokens:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.max_tokens_var = ctk.IntVar(value=self.settings.get('max_output_tokens', 8192))
        token_options = ["2048", "4096", "8192", "16384", "32768"]
        max_tokens_dropdown = ctk.CTkComboBox(parent_frame, values=token_options, variable=self.max_tokens_var, width=200)
        max_tokens_dropdown.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Top P
        row += 1
        ctk.CTkLabel(parent_frame, text="Top P:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.top_p_var = ctk.DoubleVar(value=self.settings.get('top_p', 0.95))
        top_p_slider = ctk.CTkSlider(parent_frame, from_=0.0, to=1.0, variable=self.top_p_var)
        top_p_slider.grid(row=row, column=1, padx=10, pady=10, sticky="ew")
        
        # Top P value display
        self.top_p_value = ctk.CTkLabel(parent_frame, text=f"{self.top_p_var.get():.2f}")
        self.top_p_value.grid(row=row, column=2, padx=10, pady=10)
        
        # Update top_p label when slider changes
        top_p_slider.configure(command=lambda value: self.top_p_value.configure(text=f"{value:.2f}"))
        
        # Top K
        row += 1
        ctk.CTkLabel(parent_frame, text="Top K:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.top_k_var = ctk.IntVar(value=self.settings.get('top_k', 40))
        top_k_entry = ctk.CTkEntry(parent_frame, textvariable=self.top_k_var, width=100)
        top_k_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
    def _create_database_settings(self, parent_frame):
        parent_frame.grid_columnconfigure(1, weight=1)
        
        # Default Database Name
        row = 0
        ctk.CTkLabel(parent_frame, text="Default Database Name:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.db_name_var = ctk.StringVar(value=self.settings.get('default_db_name', 'literature_embeddings'))
        db_name_entry = ctk.CTkEntry(parent_frame, textvariable=self.db_name_var, width=200)
        db_name_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Collection Name
        row += 1
        ctk.CTkLabel(parent_frame, text="Collection Name:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.collection_name_var = ctk.StringVar(value=self.settings.get('collection_name', 'literature_embeddings'))
        collection_name_entry = ctk.CTkEntry(parent_frame, textvariable=self.collection_name_var, width=200)
        collection_name_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Chunk Size
        row += 1
        ctk.CTkLabel(parent_frame, text="Chunk Size:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.chunk_size_var = ctk.IntVar(value=self.settings.get('chunk_size', 1000))
        chunk_size_entry = ctk.CTkEntry(parent_frame, textvariable=self.chunk_size_var, width=100)
        chunk_size_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Chunk Overlap
        row += 1
        ctk.CTkLabel(parent_frame, text="Chunk Overlap:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.chunk_overlap_var = ctk.IntVar(value=self.settings.get('chunk_overlap', 100))
        chunk_overlap_entry = ctk.CTkEntry(parent_frame, textvariable=self.chunk_overlap_var, width=100)
        chunk_overlap_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Embedding Batch Size
        row += 1
        ctk.CTkLabel(parent_frame, text="Embedding Batch Size:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.batch_size_var = ctk.IntVar(value=self.settings.get('embedding_batch_size', 20))
        batch_size_entry = ctk.CTkEntry(parent_frame, textvariable=self.batch_size_var, width=100)
        batch_size_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
        
        # Search Results Count
        row += 1
        ctk.CTkLabel(parent_frame, text="Search Results Count:").grid(row=row, column=0, padx=10, pady=10, sticky="w")
        
        self.search_results_var = ctk.IntVar(value=self.settings.get('search_results_count', 5))
        search_results_entry = ctk.CTkEntry(parent_frame, textvariable=self.search_results_var, width=100)
        search_results_entry.grid(row=row, column=1, padx=10, pady=10, sticky="w")
    
    def _browse_input_dir(self):
        """Open directory browser for input directory"""
        directory = filedialog.askdirectory(title="Select Input Documents Directory")
        if directory:
            self.input_dir_var.set(directory)
    
    def _save_settings(self):
        """Save all settings to the dictionary"""
        # General settings
        self.settings['input_dir'] = self.input_dir_var.get()
        self.settings['query_model'] = self.model_var.get()
        
        # Generation settings
        self.settings['temperature'] = self.temperature_var.get()
        self.settings['max_output_tokens'] = int(self.max_tokens_var.get())
        self.settings['top_p'] = self.top_p_var.get()
        self.settings['top_k'] = self.top_k_var.get()
        
        # Database settings
        self.settings['default_db_name'] = self.db_name_var.get()
        self.settings['collection_name'] = self.collection_name_var.get()
        self.settings['chunk_size'] = self.chunk_size_var.get()
        self.settings['chunk_overlap'] = self.chunk_overlap_var.get()
        self.settings['embedding_batch_size'] = self.batch_size_var.get()
        self.settings['search_results_count'] = self.search_results_var.get()
        
        # Close the dialog
        self.destroy()
    
    def _cancel(self):
        """Restore original settings and close dialog"""
        # Restore original settings
        self.settings.clear()
        self.settings.update(self.original_settings)
        self.destroy()
    
    def center_window(self):
        """Center this window on its parent"""
        parent_x = self.parent.winfo_x()
        parent_y = self.parent.winfo_y()
        parent_width = self.parent.winfo_width()
        parent_height = self.parent.winfo_height()
        
        width = self.winfo_width()
        height = self.winfo_height()
        
        x = parent_x + (parent_width - width) // 2
        y = parent_y + (parent_height - height) // 2
        
        self.geometry(f"+{x}+{y}")
    
    def wait_for_close(self):
        """Wait for dialog to be closed"""
        self.wait_window()
        return self.settings 