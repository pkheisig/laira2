export const api = {
    async loadProjectFiles(projectId) {
        console.log(`Loading files for project: ${projectId}`);
        try {
            const response = await fetch(`/project/${projectId}/files`);
            
            if (!response.ok) {
                console.error(`Error fetching project files: ${response.status}`);
                return { files: [] }; // Return a consistent format
            }
            
            const data = await response.json();
            console.log("Raw server response for files:", data);
            
            // Check if the response has a files property (which it should)
            if (data && data.files) {
                console.log(`Retrieved ${data.files.length} files from server in response.files`);
                return data; // Return the full data structure with files property
            } else {
                console.warn("Server response doesn't contain expected 'files' property:", data);
                return { files: [] }; // Return a consistent format
            }
        } catch (error) {
            console.error('Error loading project files:', error);
            return { files: [] }; // Return a consistent format
        }
    },
    
    async getNotes(projectId) {
        try {
            const response = await fetch(`/project/${projectId}/notes`);
            if (!response.ok) {
                console.error(`Failed to load notes: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.notes || [];
        } catch (error) {
            console.error("Error loading notes:", error);
            return [];
        }
    },
    
    async getSettings(projectId) {
        try {
            const response = await fetch(`/project/${projectId}/settings`);
            if (!response.ok) {
                console.error(`Failed to load settings: ${response.status}`);
                return { 
                    chat_settings: { 
                        temperature: 0.2, 
                        top_p: 0.95, 
                        top_k: 40, 
                        max_output_tokens: 8192 
                    },
                    ui_settings: { theme: "light" }
                };
            }
            return await response.json();
        } catch (error) {
            console.error("Error loading settings:", error);
            return { 
                chat_settings: { 
                    temperature: 0.2, 
                    top_p: 0.95, 
                    top_k: 40, 
                    max_output_tokens: 8192 
                },
                ui_settings: { theme: "light" }
            };
        }
    },
    
    async getChatHistory(projectId) {
        try {
            const response = await fetch(`/project/${projectId}/chat-history`);
            if (!response.ok) {
                console.error(`Failed to load chat history: ${response.status}`);
                return [];
            }
            const data = await response.json();
            return data.history || [];
        } catch (error) {
            console.error("Error loading chat history:", error);
            return [];
        }
    },
    
    async uploadFile(projectId, file) {
        try {
            const formData = new FormData();
            formData.append('file', file);
            
            const response = await fetch(`/upload/${projectId}`, {
                method: 'POST',
                body: formData
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error uploading file:", error);
            return { success: false, error: error.message };
        }
    },
    
    async uploadFiles(projectId, formData, progressCallback = null) {
        try {
            const xhr = new XMLHttpRequest();
            
            // Setup the request
            xhr.open('POST', `/upload/${projectId}`, true);
            
            // Setup progress tracking if callback provided
            if (progressCallback) {
                xhr.upload.onprogress = progressCallback;
            }
            
            // Use a Promise to handle XHR completion
            const uploadPromise = new Promise((resolve, reject) => {
                xhr.onload = () => {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            const response = JSON.parse(xhr.responseText);
                            resolve(response);
                        } catch (e) {
                            reject(new Error(`Failed to parse response: ${e.message}`));
                        }
                    } else {
                        reject(new Error(`Upload failed with status: ${xhr.status}`));
                    }
                };
                xhr.onerror = () => reject(new Error('Network error during upload'));
            });
            
            // Send the request
            xhr.send(formData);
            
            // Return the Promise result
            return await uploadPromise;
        } catch (error) {
            console.error("Error uploading files:", error);
            return { success: false, error: error.message, files: [] };
        }
    },
    
    async deleteFile(projectId, filename) {
        try {
            const response = await fetch(`/delete_source/${projectId}/${filename}`, {
                method: 'DELETE'
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error deleting file:", error);
            return { success: false, error: error.message };
        }
    },
    
    async sendMessage(projectId, message) {
        try {
            const response = await fetch(`/ask/${projectId}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ question: message })
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error sending message:", error);
            return { success: false, error: error.message };
        }
    },
    
    async resetChat(projectId) {
        try {
            const response = await fetch(`/reset-chat/${projectId}`, {
                method: 'POST'
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error resetting chat:", error);
            return { success: false, error: error.message };
        }
    },
    
    async saveNote(projectId, noteData) {
        try {
            const response = await fetch(`/project/${projectId}/notes`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(noteData)
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error saving note:", error);
            return { success: false, error: error.message };
        }
    },
    
    async deleteNote(projectId, noteId) {
        try {
            const response = await fetch(`/project/${projectId}/notes/${noteId}`, {
                method: 'DELETE'
            });
            
            return await response.json();
        } catch (error) {
            console.error("Error deleting note:", error);
            return { success: false, error: error.message };
        }
    }
}; 