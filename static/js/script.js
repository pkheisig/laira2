import { api } from './api.js';
import { initializeTheme } from './theme.js';
import { setupHomeViewListeners } from './homeView.js';
import { setupProjectViewListeners } from './projectView.js';

// Placeholder for JavaScript functionality

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded - Rebuilding UI');

    // --- Theme Handling --- 
    initializeTheme();

    // --- Determine current view and project ID (if applicable) --- 
    let projectId = null;
    const pathParts = window.location.pathname.split('/');
    const isProjectView = pathParts.length >= 3 && pathParts[1] === 'project';
    const isHomeView = !isProjectView;

    if (isProjectView) {
        projectId = pathParts[2];
        console.log('Project View - ID:', projectId);
        // Setup Project View Listeners
        setupProjectViewListeners(projectId);
    } else {
        console.log('Home View');
        // Setup Home View Listeners
        setupHomeViewListeners();
    }

});

// --- NEW: Modular Setup Functions ---

// // Function setupHomeViewListeners moved to homeView.js

// // Function setupProjectViewListeners moved to projectView.js
// function setupProjectViewListeners(projectId) {
//    ...
// }

// --- Helper Functions ---
function showTemporaryStatus(message, isError = false, duration = 3000) {
     const statusElement = document.getElementById('status-message');
     if (!statusElement) {
         console.warn("Status message element not found");
         return;
     }
     statusElement.textContent = message;
     statusElement.className = isError ? 'status-error' : 'status-success'; // Use classes for styling
     statusElement.style.opacity = '1';
     setTimeout(() => { statusElement.style.opacity = '0'; }, duration);
 } 

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-options-btn') && !e.target.closest('.card-options-menu') && 
        !e.target.closest('.list-options-btn') && !e.target.closest('.list-options-menu')) {
        document.querySelectorAll('.card-options-menu.active, .list-options-menu.active').forEach(menu => menu.classList.remove('active'));
    }
}); 

// Add function to handle file uploads
async function handleFileUpload(file) {
    console.log(`Uploading: ${file.name}`);
    
    // Add to UI list immediately (optimistic)
    const sourceData = { filename: file.name, status: 'uploading' }; 
    addSourceToList(sourceData.filename, sourceData.status);

    // Add to project data
    currentProject.sources.push(sourceData);
    
    try {
        // Upload to server using API
        const result = await api.uploadFile(currentProject.id, file);
        
        // Find the source in the project data to update its status
        const uploadedSource = currentProject.sources.find(s => s.filename === file.name);
        if (uploadedSource) {
            uploadedSource.status = result.success ? 'success' : 'error';
            updateSourceListItemStatus(file.name, result.success);
        } else {
            console.error("Could not find source in project data after upload:", file.name);
            updateSourceListItemStatus(file.name, false);
        }
        
        // Update UI based on sources count/status
        checkSourceList();
        
        // Show status notification
        if (result.success) {
            showTemporaryStatus(`File ${file.name} uploaded successfully!`);
        } else {
            showTemporaryStatus(`Failed to upload ${file.name}: ${result.error}`, true);
        }
    } catch (error) {
        console.error("Error in upload process:", error);
        updateSourceListItemStatus(file.name, false);
        showTemporaryStatus(`Upload failed: ${error.message}`, true);
    }
}

// Load project data
async function loadProjectData(projectId) {
    console.log(`Starting to load project data for ${projectId}`);
    
    try {
        // Load source files first - this will be handled by loadSourceList function
        await loadSourceList(projectId);
        
        // Load notes from the server
        const notes = await api.getNotes(projectId);
        console.log("Loaded notes from server:", notes);
        currentProject.notes = notes;
        
        // Load settings from the server
        const settings = await api.getSettings(projectId);
        console.log("Loaded settings from server:", settings);
        currentProject.settings = settings;
        
        // Load chat history from the server
        const history = await api.getChatHistory(projectId);
        console.log("Loaded chat history from server:", history);
        
        // Update UI with the loaded data
        updateProjectUI();
        
        // Populate chat with history
        populateChatHistory(history);
        
        console.log("Project data loaded successfully:", currentProject);
        return true;
    } catch (error) {
        console.error("Error loading project data:", error);
        showTemporaryStatus("Failed to load project data. Using local data instead.", true);
        // Even if there's an error, try to update UI with whatever data we have
        updateProjectUI();
        return false;
    }
}

// Function to load source list for a project
async function loadSourceList(projectId) {
    console.log(`Loading source list for project: ${projectId}`);
    try {
        // Fetch the updated list of files from the server
        console.log("Calling api.loadProjectFiles...");
        const response = await api.loadProjectFiles(projectId);
        console.log("Server response:", response);
        
        // Extract the files array from the response (could be direct array or nested in files property)
        let files = response;
        
        // Handle the case where the response might contain a 'files' property
        if (!Array.isArray(response) && response && typeof response === 'object' && Array.isArray(response.files)) {
            console.log("Extracting files from response.files property");
            files = response.files;
        }
        
        if (!files || !Array.isArray(files)) {
            console.error("Invalid response format for files. Expected array, got:", files);
            showTemporaryStatus("Failed to load source files (invalid format).", true);
            return false;
        }
        
        console.log(`Retrieved ${files.length} files from server for project: ${projectId}`);
        
        // Update the project data with the refreshed sources
        currentProject.sources = files.map(file => ({
            filename: file.name,
            size: file.size,
            type: file.type,
            status: 'success'
        }));
        console.log("Updated currentProject.sources:", currentProject.sources);
        
        // Update the source list in the UI
        const sourceList = document.getElementById('source-list');
        const sourceListPlaceholder = document.getElementById('source-list-placeholder');
        
        if (sourceList) {
            console.log("Clearing and rebuilding source list UI");
            // Clear existing items first
            sourceList.innerHTML = '';
            
            // Add each file to the UI
            if (currentProject.sources.length > 0) {
                currentProject.sources.forEach(source => {
                    console.log("Adding to UI:", source.filename);
                    addSourceToList(source.filename, 'success');
                });
                
                // Hide placeholder if we have files
                if (sourceListPlaceholder) {
                    console.log("Hiding source list placeholder");
                    sourceListPlaceholder.style.display = 'none';
                }
            } else if (sourceListPlaceholder) {
                // Show placeholder if no files
                console.log("Showing source list placeholder (no files)");
                sourceListPlaceholder.style.display = 'block';
            }
        } else {
            console.error("Source list element not found in DOM");
        }
        
        // Check source list to update UI state
        checkSourceList();
        
        return true;
    } catch (error) {
        console.error("Error loading source list:", error);
        showTemporaryStatus("Failed to refresh file list. Please try again.", true);
        return false;
    }
}

// Function to handle file uploads
async function uploadFile(providedFormData = null) {
    let formData;
    
    if (providedFormData) {
        // Use the provided FormData
        console.log("Using provided FormData for upload");
        formData = providedFormData;
    } else {
        // Create a new FormData from the file input (legacy behavior)
        const fileInput = document.getElementById('modal-file-upload');
        const files = fileInput.files;
        
        if (files.length === 0) {
            alert('Please select at least one file to upload.');
            return;
        }
        
        console.log(`Starting upload for ${files.length} file(s)...`);
        
        formData = new FormData();
        
        // Add each file to FormData
        for (let i = 0; i < files.length; i++) {
            console.log(`Adding file to form: ${files[i].name} (${files[i].size} bytes)`);
            formData.append('files', files[i]);
        }
    }
    
    const progressBar = document.getElementById('upload-progress');
    const progressContainer = document.getElementById('progress-container');
    
    // Show progress bar
    progressContainer.style.display = 'block';
    progressBar.value = 0;
    
    try {
        showTemporaryStatus('Uploading files...');
        
        // Make the upload request using the API service
        console.log(`Calling api.uploadFiles for project: ${currentProject.id}`);
        const response = await api.uploadFiles(currentProject.id, formData, (progressEvent) => {
            // Update progress bar if we have data on progress
            if (progressEvent.lengthComputable) {
                const percentComplete = (progressEvent.loaded / progressEvent.total) * 100;
                progressBar.value = percentComplete;
                console.log(`Upload progress: ${percentComplete.toFixed(1)}%`);
            }
        });
        
        console.log("Upload response:", response);
        
        // Handle the response
        if (response.success) {
            // Get the files from the response - handle different possible formats
            let uploadedFiles = [];
            
            if (response.files && Array.isArray(response.files)) {
                uploadedFiles = response.files;
            } else if (response.filename) {
                // Handle single file upload response format
                uploadedFiles = [{
                    filename: response.filename,
                    filepath: response.filepath || null,
                    size: response.size || null
                }];
            }
            
            // Update the project's source list in memory
            if (uploadedFiles.length > 0) {
                console.log(`Adding ${uploadedFiles.length} uploaded files to project data:`, uploadedFiles);
                
                for (const file of uploadedFiles) {
                    // Extract the filename consistently from the response 
                    // (could be in file.filename or file.name depending on the server response)
                    const filename = file.filename || file.name || '';
                    
                    if (!filename) {
                        console.warn("File entry has no filename:", file);
                        continue;
                    }
                    
                    // Add to project sources if it doesn't exist already
                    const exists = currentProject.sources.some(s => 
                        s.filename === filename || s.name === filename
                    );
                    
                    if (!exists) {
                        currentProject.sources.push({
                            filename: filename,
                            size: file.size || null,
                            type: file.type || null,
                            uploadTime: new Date().toISOString()
                        });
                        console.log(`Added ${filename} to project sources`);
                    } else {
                        console.log(`${filename} already exists in project sources`);
                    }
                }
                
                // Save updates to project
                saveCurrentProject();
                
                // Reset the file input
                fileInput.value = '';
                
                // Refresh the source list display
                console.log("Calling loadSourceList to refresh UI...");
                loadSourceList(currentProject.id);
                
                showTemporaryStatus(`${uploadedFiles.length} file(s) uploaded successfully.`);
            } else {
                console.warn("Upload response success=true but no files in response:", response);
                
                // Still try to refresh the list regardless since the upload may have succeeded
                // but the response format was unexpected
                loadSourceList(currentProject.id);
                
                showTemporaryStatus("Files uploaded, refreshing file list.", true);
            }
        } else {
            console.error("Upload failed:", response.error);
            showTemporaryStatus(`Upload failed: ${response.error}`, true);
        }
    } catch (error) {
        console.error('Error during file upload:', error);
        showTemporaryStatus(`Upload error: ${error.message}`, true);
    } finally {
        // Hide progress bar after upload (success or fail)
        progressContainer.style.display = 'none';
    }
}

// Add function to adjust textarea height dynamically
function adjustTextareaHeight(element = null) {
     const userInput = document.getElementById('user-input'); // Need access to main input
     const targetElement = element || userInput; // Default to main input if no element passed
     if (!targetElement) return;

     targetElement.style.height = 'auto'; // Reset height
     let scrollHeight = targetElement.scrollHeight;
     const maxHeight = 150; // Example max height - make consistent?
     if (scrollHeight > maxHeight) {
          targetElement.style.height = `${maxHeight}px`;
          targetElement.style.overflowY = 'auto';
     } else {
          targetElement.style.height = `${scrollHeight}px`;
          targetElement.style.overflowY = 'hidden';
    }
}