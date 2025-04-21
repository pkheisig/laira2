import { api } from './api.js';
import { showTemporaryStatus } from './utils.js';

console.log('[DEBUG] sourceManager.js loaded');

let currentProject = null; // Will be set by the main project view

// Cache DOM elements
let sourceList = null;
let sourceListPlaceholder = null;
let addSourceModal = null;
let modalFileUploadInput = null;
let dropZone = null;
let progressContainer = null;
let progressBar = null;

function checkSourceListState() {
    if (!sourceList || !sourceListPlaceholder) return;
    const hasSources = sourceList.querySelectorAll('li[data-filename]').length > 0;
    sourceListPlaceholder.style.display = hasSources ? 'none' : 'block';
    // Potentially call enable/disable chat input from here or another central place
    // if (hasSources) enableChatInput(); else disableChatInput();
}

async function handleDeleteSource(event) {
    const listItem = event.currentTarget.closest('li');
    const filename = listItem?.dataset.filename;
    if (!currentProject || !filename || !confirm(`Are you sure you want to delete source "${filename}"?`)) return;

    console.log(`[SOURCE] Deleting source: ${filename} for project ${currentProject.id}`);
    try {
        const result = await api.deleteFile(currentProject.id, filename);
        if (result.success) {
            // Update local project data if necessary (passed in or managed centrally)
            // Find and remove from currentProject.sources if managed here
            listItem.remove();
            checkSourceListState();
            showTemporaryStatus(`File ${filename} deleted successfully.`);
        } else {
            showTemporaryStatus(`Failed to delete ${filename}: ${result.error}`, true);
        }
    } catch (error) {
        console.error("Error deleting source:", error);
        showTemporaryStatus(`Error deleting file: ${error.message}`, true);
    }
}

function addSourceToListUI(filename, status = null) {
    if (!sourceList) return;
    // Avoid duplicates in UI
    if (sourceList.querySelector(`li[data-filename="${CSS.escape(filename)}"]`)) return;

    const listItem = document.createElement('li');
    listItem.dataset.filename = filename;
    listItem.innerHTML = `
       <div class="item-icon-container">
            <span class="source-icon"><i class="fas fa-file-alt"></i></span> 
            <button class="source-delete-icon" title="Delete Source"><i class="fas fa-trash-alt"></i></button>
       </div>
       <span class="source-name"></span>
       <span class="source-status"></span>
    `;
    
    const nameSpan = listItem.querySelector('.source-name');
    if (nameSpan) nameSpan.textContent = filename;
    
    const statusSpan = listItem.querySelector('.source-status');
    const iconEl = listItem.querySelector('.source-icon i');
    const deleteIcon = listItem.querySelector('.source-delete-icon');

    // Set icon based on file type
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.pdf')) iconEl.className = 'fas fa-file-pdf';
    else if (lowerFilename.endsWith('.doc') || lowerFilename.endsWith('.docx')) iconEl.className = 'fas fa-file-word';
    else if (lowerFilename.endsWith('.txt') || lowerFilename.endsWith('.csv') || lowerFilename.endsWith('.md') || lowerFilename.endsWith('.json') || lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) iconEl.className = 'fas fa-file-alt';
    else iconEl.className = 'fas fa-file'; // Default icon

    // Set status
    if (statusSpan) {
        if (status === 'uploading') statusSpan.textContent = 'Uploading...';
        else if (status === 'error') { statusSpan.textContent = 'Failed'; listItem.style.opacity = '0.5'; listItem.title = "Upload failed"; }
        else statusSpan.remove(); // Remove status span if success or null
    }
    
    if (deleteIcon) deleteIcon.addEventListener('click', handleDeleteSource);
    
    // Double-click on a source to open in new window if viewable type
    listItem.addEventListener('dblclick', () => {
        const ext = filename.split('.').pop().toLowerCase();
        const viewableExtensions = ['pdf', 'html', 'htm', 'md', 'txt'];
        if (viewableExtensions.includes(ext)) {
            window.open(`/project/${currentProject.id}/sources/${filename}`, '_blank');
        }
    });
    
    sourceList.appendChild(listItem);
    checkSourceListState(); // Update placeholder visibility
}

function updateSourceListItemStatusUI(filename, success) {
     const item = sourceList?.querySelector(`li[data-filename="${CSS.escape(filename)}"]`);
     if (!item) return;
     const statusEl = item.querySelector('.source-status');
     if (success) {
         if (statusEl) statusEl.remove();
         item.style.opacity = '1'; item.title = '';
     } else {
         // Re-add status span if it was removed
         let currentStatusEl = statusEl;
         if (!currentStatusEl) {
             currentStatusEl = document.createElement('span');
             currentStatusEl.className = 'source-status';
             // Add it back in the correct position if possible, otherwise append
             const nameSpan = item.querySelector('.source-name');
             if(nameSpan) nameSpan.insertAdjacentElement('afterend', currentStatusEl);
             else item.appendChild(currentStatusEl); 
         }
         currentStatusEl.textContent = "Failed";
         item.style.opacity = '0.5'; item.title = "Upload failed";
     }
}

async function uploadFilesToServer(formData) {
    if (!currentProject) return;
    if (progressContainer) progressContainer.style.display = 'block';
    if (progressBar) progressBar.value = 0;
    
    try {
        showTemporaryStatus('Uploading files...');
        const response = await api.uploadFiles(currentProject.id, formData, (progressEvent) => {
            if (progressEvent.lengthComputable && progressBar) {
                const percentComplete = (progressEvent.loaded / progressEvent.total) * 100;
                progressBar.value = percentComplete;
            }
        });
        
        if (response.success) {
            let uploadedFiles = response.files || [];
            // Handle single file upload response format if necessary
            if (response.filename && !uploadedFiles.some(f => f.filename === response.filename)) {
                uploadedFiles.push({ filename: response.filename, size: response.size, type: response.type });
            }
            
            // Update UI for each uploaded file: remove 'Uploading...' status
            uploadedFiles.forEach(file => {
                updateSourceListItemStatusUI(file.filename, true);
            });
            
            showTemporaryStatus(`${uploadedFiles.length} file(s) uploaded successfully.`);
            checkSourceListState(); // Update placeholder/chat state
        } else {
            console.error("Upload failed:", response.error);
            showTemporaryStatus(`Upload failed: ${response.error}`, true);
            // Consider removing the 'uploading' items from UI if tracking them
        }
    } catch (error) {
        console.error('Error during file upload:', error);
        showTemporaryStatus(`Upload error: ${error.message}`, true);
    } finally {
        if (progressContainer) progressContainer.style.display = 'none';
    }
}

function setupDragAndDrop() {
    if (dropZone && modalFileUploadInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => { 
            dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }); 
            document.body.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }); 
        });
        ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
        ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
        
        dropZone.addEventListener('drop', (e) => {
             if(addSourceModal) addSourceModal.classList.remove('active'); // Hide modal
             const formData = new FormData();
             if (e.dataTransfer.files) {
                 for (let i = 0; i < e.dataTransfer.files.length; i++) {
                     formData.append('files', e.dataTransfer.files[i]);
                     // Add to UI immediately with 'uploading' status
                     addSourceToListUI(e.dataTransfer.files[i].name, 'uploading'); 
                 }
                 uploadFilesToServer(formData);
             }
         });
         
        modalFileUploadInput.addEventListener('change', (event) => {
             if(addSourceModal) addSourceModal.classList.remove('active'); // Hide modal
             const formData = new FormData();
             if (event.target.files) {
                 for (let i = 0; i < event.target.files.length; i++) {
                     formData.append('files', event.target.files[i]);
                      // Add to UI immediately with 'uploading' status
                     addSourceToListUI(event.target.files[i].name, 'uploading');
                 }
                 uploadFilesToServer(formData);
                 modalFileUploadInput.value = ''; // Reset input
             }
        });
    }
}

export function setupSources(project) {
    console.log(`[SOURCE] Initializing source manager for project: ${project.id}`);
    currentProject = project;

    // Cache elements specific to this module
    sourceList = document.getElementById('source-list');
    sourceListPlaceholder = document.getElementById('source-list-placeholder');
    addSourceModal = document.getElementById('add-source-modal');
    modalFileUploadInput = document.getElementById('modal-file-upload');
    dropZone = document.getElementById('drop-zone');
    progressContainer = document.getElementById('progress-container');
    progressBar = document.getElementById('upload-progress');
    
    if (!sourceList || !sourceListPlaceholder || !addSourceModal || !modalFileUploadInput || !dropZone || !progressContainer || !progressBar) {
        console.error("[SOURCE] Failed to find necessary source panel elements in the DOM.");
        return;
    }

    // Populate initial source list from project data
    sourceList.innerHTML = ''; // Clear any previous list
    if (currentProject.sources && Array.isArray(currentProject.sources)) {
        currentProject.sources.forEach(source => addSourceToListUI(source.filename, source.status || 'success'));
    }
    checkSourceListState();

    // Setup listeners managed by this module
    setupDragAndDrop();
    
    // Add listener for the main add source button (if managed here)
    const addSourceBtn = document.querySelector('.sources-panel .add-source-btn');
    if(addSourceBtn) addSourceBtn.addEventListener('click', () => addSourceModal.classList.add('active'));
    
    // Add listener for the shortcut upload button (if managed here)
    const uploadShortcutBtn = document.querySelector('.upload-shortcut-btn');
    if(uploadShortcutBtn) uploadShortcutBtn.addEventListener('click', () => addSourceModal.classList.add('active'));
    
    console.log("[SOURCE] Source manager setup complete.");
} 