import { api } from './api.js';
// Placeholder imports for functions that will be moved to utils.js
import { showTemporaryStatus, adjustTextareaHeight } from './utils.js'; 

const storageKey = 'lairaProjects'; // Key for localStorage
let currentProject = null; // Store current project data globally within this module
let allProjects = []; // Store all projects globally
let currentAbortController = null; // For stopping fetch requests
let isPinning = false; // Flag for pinning messages

// --- Modal Visibility Functions ---
function showModal(modalElement) {
    modalElement?.classList.add('active');
}
function hideModal(modalElement) {
    modalElement?.classList.remove('active');
}

// --- Helper Function to Save Project ---
function saveCurrentProject() {
    if (!currentProject) return;
    // Update modified date - Use ISO string for consistency
    currentProject.modifiedDate = new Date().toISOString();

    // Find index of current project in the main list
    const projectIndex = allProjects.findIndex(p => p.id === currentProject.id);
    if (projectIndex !== -1) {
        // Update the project in the main list
        allProjects[projectIndex] = currentProject;
        // Save the entire updated list back to localStorage
        localStorage.setItem(storageKey, JSON.stringify(allProjects));
        console.log("Project saved to localStorage:", currentProject.id);
    } else {
        console.error("Could not find project in list to save:", currentProject.id);
        // Optionally add it back if it was missing?
        // allProjects.push(currentProject);
        // localStorage.setItem(storageKey, JSON.stringify(allProjects));
    }
}

// --- Source List Management ---
async function loadSourceList(projectId) {
    console.log(`Loading source list for project: ${projectId}`);
    try {
        const response = await api.loadProjectFiles(projectId);
        console.log("Server response for files:", response);

        let files = response;
        if (!Array.isArray(response) && response && typeof response === 'object' && Array.isArray(response.files)) {
            files = response.files;
        }

        if (!files || !Array.isArray(files)) {
            console.error("Invalid response format for files. Expected array, got:", files);
            showTemporaryStatus("Failed to load source files (invalid format).", true);
            return false;
        }

        console.log(`Retrieved ${files.length} files from server for project: ${projectId}`);
        
        // Update project data
        currentProject.sources = files.map(file => ({
            filename: file.name || file.filename, // Handle potential variations
            size: file.size,
            type: file.type,
            status: 'success' // Assume success if listed by server
        }));
        console.log("Updated currentProject.sources:", currentProject.sources);

        // Update UI
        const sourceList = document.getElementById('source-list');
        const sourceListPlaceholder = document.getElementById('source-list-placeholder');
        if (sourceList) {
            sourceList.innerHTML = ''; // Clear existing UI items
            currentProject.sources.forEach(source => addSourceToList(source.filename, 'success'));
            if (sourceListPlaceholder) {
                sourceListPlaceholder.style.display = currentProject.sources.length > 0 ? 'none' : 'block';
            }
        } else {
            console.error("Source list element not found in DOM");
        }
        checkSourceList(); // Update overall UI state
        return true;
    } catch (error) {
        console.error("Error loading source list:", error);
        showTemporaryStatus("Failed to refresh file list. Please try again.", true);
        return false;
    }
}

function addSourceToList(filename, status = null) {
    console.log(`Adding source to list: ${filename} with status: ${status}`);
    const sourceList = document.getElementById('source-list');
    if (!sourceList) {
        console.error("Source list element not found");
        return;
    }
    if (sourceList.querySelector(`li[data-filename="${CSS.escape(filename)}"]`)) {
        console.log(`Source ${filename} already in list, skipping`);
        return;
    }
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
    if (statusSpan) {
        if (status === 'uploading') statusSpan.textContent = 'Uploading...';
        else if (status === 'success') statusSpan.remove();
        else if (status === 'error') {
            statusSpan.textContent = 'Failed';
            listItem.style.opacity = '0.5';
            listItem.title = "Upload failed";
        }
        else statusSpan.remove();
    }
    const iconEl = listItem.querySelector('.source-icon i');
    const lowerFilename = filename.toLowerCase();
    if (lowerFilename.endsWith('.pdf')) iconEl.className = 'fas fa-file-pdf';
    else if (lowerFilename.endsWith('.doc') || lowerFilename.endsWith('.docx')) iconEl.className = 'fas fa-file-word';
    else if (lowerFilename.endsWith('.txt') || lowerFilename.endsWith('.csv') || lowerFilename.endsWith('.md') || lowerFilename.endsWith('.json') || lowerFilename.endsWith('.html') || lowerFilename.endsWith('.htm')) iconEl.className = 'fas fa-file-alt'; // Group text/data/markup
    else iconEl.className = 'fas fa-file'; // Default
    
    const deleteIcon = listItem.querySelector('.source-delete-icon');
    if (deleteIcon) deleteIcon.addEventListener('click', handleDeleteSource);
    sourceList.appendChild(listItem);
    const sourceListPlaceholder = document.getElementById('source-list-placeholder');
    if (sourceListPlaceholder) sourceListPlaceholder.style.display = 'none';
    checkSourceList();
    console.log(`Added source ${filename} to list`);
}

function updateSourceListItemStatus(filename, success) {
     const sourceList = document.getElementById('source-list');
     const item = sourceList?.querySelector(`li[data-filename="${CSS.escape(filename)}"]`);
     if (!item) return;
     const statusEl = item.querySelector('.source-status');
     if (success) {
         if (statusEl) statusEl.remove();
         item.style.opacity = '1';
         item.title = '';
     } else {
         if (statusEl) statusEl.textContent = "Failed";
         else console.warn("Status element missing on failed upload for:", filename);
         item.style.opacity = '0.5';
         item.title = "Upload failed";
     }
}

async function handleDeleteSource(event) {
    const listItem = event.currentTarget.closest('li');
    const filename = listItem?.dataset.filename;
    if (!filename || !confirm(`Are you sure you want to delete source "${filename}"?`)) return;
    console.log(`Deleting source ${filename}`);
    try {
        const result = await api.deleteFile(currentProject.id, filename);
        if (result.success) {
            const sourceIndex = currentProject.sources.findIndex(s => s.filename === filename);
            if (sourceIndex !== -1) {
                currentProject.sources.splice(sourceIndex, 1);
                saveCurrentProject();
            }
            listItem.remove();
            const sourceList = document.getElementById('source-list');
            const sourceListPlaceholder = document.getElementById('source-list-placeholder');
            if (sourceList && sourceListPlaceholder && sourceList.querySelectorAll('li[data-filename]').length === 0) {
                sourceListPlaceholder.style.display = 'block';
            }
            checkSourceList();
            showTemporaryStatus(`File ${filename} deleted successfully.`);
        } else {
            showTemporaryStatus(`Failed to delete ${filename}: ${result.error}`, true);
        }
    } catch (error) {
        console.error("Error deleting source:", error);
        showTemporaryStatus(`Error deleting file: ${error.message}`, true);
    }
}

function checkSourceList() {
    const sourceList = document.getElementById('source-list');
    const sourceListPlaceholder = document.getElementById('source-list-placeholder');
    const hasSources = sourceList && sourceList.querySelectorAll('li[data-filename]').length > 0;
    if (sourceListPlaceholder) {
        sourceListPlaceholder.style.display = hasSources ? 'none' : 'block';
    }
    if (hasSources) enableChatInput();
    else disableChatInput();
}

// --- File Upload Logic ---
async function handleFileUpload(file) {
    console.log(`Uploading via handleFileUpload: ${file.name}`);
    const filename = file.name;
    addSourceToList(filename, 'uploading'); // Optimistic UI
    // Add placeholder to project data immediately if needed? 
    // Or wait for success?
    try {
        const result = await api.uploadFile(currentProject.id, file);
        updateSourceListItemStatus(filename, result.success);
        if (result.success) {
            // Add to project data *after* successful upload
            if (!currentProject.sources.some(s => s.filename === filename)) {
                 currentProject.sources.push({
                    filename: filename,
                    size: file.size,
                    type: file.type,
                    status: 'success' 
                 });
                saveCurrentProject(); 
            }
            showTemporaryStatus(`File ${filename} uploaded successfully!`);
        } else {
            showTemporaryStatus(`Failed to upload ${filename}: ${result.error}`, true);
            // Maybe remove the placeholder UI item?
            const item = document.getElementById('source-list')?.querySelector(`li[data-filename="${CSS.escape(filename)}"]`);
            item?.remove(); 
        }
        checkSourceList();
    } catch (error) {
        console.error("Error in upload process:", error);
        updateSourceListItemStatus(filename, false);
        showTemporaryStatus(`Upload failed: ${error.message}`, true);
        const item = document.getElementById('source-list')?.querySelector(`li[data-filename="${CSS.escape(filename)}"]`);
        item?.remove();
        checkSourceList();
    }
}

// New function to handle multiple files upload using FormData
async function uploadFiles(formData) {
    const progressBar = document.getElementById('upload-progress');
    const progressContainer = document.getElementById('progress-container');
    progressContainer.style.display = 'block';
    progressBar.value = 0;

    try {
        showTemporaryStatus('Uploading files...');
        const response = await api.uploadFiles(currentProject.id, formData, (progressEvent) => {
            if (progressEvent.lengthComputable) {
                const percentComplete = (progressEvent.loaded / progressEvent.total) * 100;
                progressBar.value = percentComplete;
            }
        });

        if (response.success) {
            let uploadedFiles = response.files || [];
            if (response.filename && !uploadedFiles.some(f => f.filename === response.filename)) { 
                 uploadedFiles.push({ filename: response.filename, size: response.size }); // Handle single file response case
            }

            // Refresh the entire list from the server for consistency
            await loadSourceList(currentProject.id); 
            showTemporaryStatus(`${uploadedFiles.length} file(s) uploaded successfully.`);
        } else {
            console.error("Upload failed:", response.error);
            showTemporaryStatus(`Upload failed: ${response.error}`, true);
        }
    } catch (error) {
        console.error('Error during file upload:', error);
        showTemporaryStatus(`Upload error: ${error.message}`, true);
    } finally {
        progressContainer.style.display = 'none';
    }
}


// --- Chat Input & Messaging Logic ---
function disableChatInput() {
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    if (userInput) { userInput.placeholder = "Upload a source first"; userInput.disabled = true; }
    if (sendButton) sendButton.disabled = true;
    if (chatPlaceholder) chatPlaceholder.style.display = 'flex';
}

function enableChatInput() {
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    if (userInput) { userInput.placeholder = "Ask about your sources..."; userInput.disabled = false; }
    if (sendButton) sendButton.disabled = false;
    if (chatPlaceholder) chatPlaceholder.style.display = 'none';
}

function processMessageText(text) {
    if (typeof text !== 'string') return '';
    const div = document.createElement('div');
    div.textContent = text;
    let processedText = div.innerHTML;
    processedText = processedText.replace(/\n/g, '<br>');
    processedText = processedText
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.*?)\*/g, '<em>$1</em>');
    return processedText;
}

function addMessageToChat(text, sender, messageId = null, sources = null) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea) return;
    const placeholder = chatArea.querySelector('#chat-placeholder');
    if (placeholder) placeholder.remove();

    const messageElement = document.createElement('div');
    const uniqueMsgId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    messageElement.dataset.messageId = uniqueMsgId;
    messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

    const messageDisplay = document.createElement('div');
    messageDisplay.classList.add('message-display');
    const messageContent = document.createElement('div');
    messageContent.classList.add('message-content');
    messageContent.innerHTML = processMessageText(text);
    messageDisplay.appendChild(messageContent);
    const messageActions = document.createElement('div');
    messageActions.classList.add('message-actions');
    messageActions.innerHTML = `
        <button class="action-btn edit-msg-btn" title="Edit Message"><i class="fas fa-pencil-alt"></i></button>
        <button class="action-btn pin-message-btn" title="Pin to Notes" data-message-text="${encodeURIComponent(text)}"><i class="fas fa-thumbtack"></i></button>
        <button class="action-btn delete-msg-btn" title="Delete Message"><i class="fas fa-trash-alt"></i></button>
    `;
    if (sender !== 'user') messageActions.querySelector('.edit-msg-btn').style.display = 'none';
    if (sender !== 'bot') messageActions.querySelector('.pin-message-btn').style.display = 'none';
    messageDisplay.appendChild(messageActions);

    const editView = document.createElement('div');
    editView.classList.add('message-edit-view');
    editView.style.display = 'none';
    editView.innerHTML = `
        <textarea class="edit-textarea" rows="1"></textarea>
        <div class="edit-controls">
            <button class="edit-cancel-btn">Cancel</button>
            <button class="edit-resubmit-btn">Resubmit</button>
        </div>
    `;

    messageElement.appendChild(messageDisplay);
    if (sender === 'user') messageElement.appendChild(editView);
    chatArea.appendChild(messageElement);
    chatArea.scrollTop = chatArea.scrollHeight;
    const editTextArea = editView.querySelector('.edit-textarea');
    if (editTextArea) editTextArea.addEventListener('input', () => adjustTextareaHeight(editTextArea));
    return messageElement;
}

function sendMessage(textToSend = null) {
    const userInput = document.getElementById('user-input');
    const chatArea = document.getElementById('chat-area');
    const sendButton = document.getElementById('send-button');
    const stopButton = document.getElementById('stop-button');

    const messageText = textToSend || userInput.value.trim();
    if (!messageText) return;

    const userMessageId = `msg-${Date.now()}-user`;
    addMessageToChat(messageText, 'user', userMessageId);
    // Add user message to history immediately
    currentProject.chatHistory = currentProject.chatHistory || [];
    currentProject.chatHistory.push({ id: userMessageId, text: messageText, sender: 'user', role: 'user', content: messageText });
    saveCurrentProject();

    if (!textToSend) { // Only clear input if it wasn't a resubmit
        userInput.value = '';
        adjustTextareaHeight(userInput);
    }

    const typingIndicatorId = `typing-${Date.now()}`;
    const typingHtml = `<div class="typing-indicator" id="${typingIndicatorId}"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>`;
    chatArea.insertAdjacentHTML('beforeend', typingHtml);
    chatArea.scrollTop = chatArea.scrollHeight;

    if (sendButton) sendButton.style.display = 'none';
    if (stopButton) stopButton.style.display = 'inline-flex';

    currentAbortController = new AbortController();
    api.sendMessage(currentProject.id, messageText)
        .then(response => {
            const typingIndicator = document.getElementById(typingIndicatorId);
            if (typingIndicator) typingIndicator.remove();
            if (response.success !== false) {
                const botMessageId = response.id || `msg-${Date.now()}-bot`; // Use server ID if available
                addMessageToChat(response.answer, 'bot', botMessageId, response.sources);
                // Add bot response to history
                currentProject.chatHistory.push({ id: botMessageId, text: response.answer, sender: 'bot', role: 'assistant', content: response.answer });
                saveCurrentProject();
            } else {
                addMessageToChat(`Error: ${response.error || 'Failed to get response'}`, 'bot');
            }
        })
        .catch(error => {
            if (error.name === 'AbortError') {
                console.log('Fetch aborted');
                const typingIndicator = document.getElementById(typingIndicatorId);
                if (typingIndicator) typingIndicator.remove(); 
                // Maybe add a message indicating it was stopped?
                 addMessageToChat("Request stopped by user.", 'bot');
            } else {
                console.error("Error sending message:", error);
                const typingIndicator = document.getElementById(typingIndicatorId);
                if (typingIndicator) typingIndicator.remove();
                addMessageToChat(`Error: ${error.message || 'Failed to get response'}`, 'bot');
            }
        })
        .finally(() => {
            if (sendButton) sendButton.style.display = 'inline-flex';
            if (stopButton) stopButton.style.display = 'none';
            currentAbortController = null;
        });
}

function checkChatAreaPlaceholder() {
    const chatArea = document.getElementById('chat-area');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    if (chatArea && chatPlaceholder) {
        const hasMessages = chatArea.querySelector('.message') !== null;
        chatPlaceholder.style.display = hasMessages ? 'none' : 'flex';
        chatArea.style.justifyContent = hasMessages ? 'flex-start' : 'center';
    }
}

// Simplified regenerate function (just resends the last user message)
function regenerateResponseFrom() { 
    console.log("Regenerating last response...");
    const lastUserMessage = currentProject.chatHistory?.filter(m => m.sender === 'user').pop();
    if (!lastUserMessage || !lastUserMessage.text) {
        console.error("No previous user message found to regenerate from.");
        showTemporaryStatus("Nothing to regenerate.", true);
        return;
    }
    // Remove the last bot message from history before resending
    if (currentProject.chatHistory[currentProject.chatHistory.length - 1]?.sender === 'bot') {
         const removedBotMsg = currentProject.chatHistory.pop();
         const botMsgElement = document.querySelector(`.message[data-message-id="${removedBotMsg.id}"]`);
         botMsgElement?.remove();
         console.log("Removed last bot message before regenerating.");
    }
    console.log(`Resending last user message: "${lastUserMessage.text}"`);
    sendMessage(lastUserMessage.text); // Resend the text of the last user message
}

function resetChat() {
    const chatArea = document.getElementById('chat-area');
    if (!confirm("Are you sure you want to clear the entire chat history? This cannot be undone.")) return;
    if (chatArea) {
        const chatPlaceholder = document.getElementById('chat-placeholder');
        chatArea.innerHTML = '';
        if (chatPlaceholder) {
            chatArea.appendChild(chatPlaceholder);
            const sourceList = document.getElementById('source-list');
            chatPlaceholder.style.display = (sourceList && sourceList.querySelectorAll('li[data-filename]').length > 0) ? 'none' : 'flex';
        }
    }
    currentProject.chatHistory = []; // Clear local history
    saveCurrentProject();
    api.resetChat(currentProject.id)
        .then(result => {
            if (result.success) showTemporaryStatus("Chat history cleared successfully.");
            else {
                console.warn("Failed to reset chat on server:", result.error);
                showTemporaryStatus("Chat cleared locally, server sync failed.", true);
            }
        })
        .catch(error => {
            console.error("Error clearing chat history:", error);
            showTemporaryStatus("Error clearing chat history on server.", true);
        });
    const userInput = document.getElementById('user-input');
    if(userInput) userInput.value = '';
    adjustTextareaHeight(userInput);
}

// --- Settings Modal Logic (Basic Structure) ---
function loadSettings() {
    const settings = currentProject.settings || { chat_settings: {}, ui_settings: {} };
    const chatSettings = settings.chat_settings || {};
    // const uiSettings = settings.ui_settings || {};

    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValueSpan = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');
    // TODO: Add Top K and Max Tokens elements

    if (temperatureSlider) temperatureSlider.value = chatSettings.temperature ?? 0.2;
    if (temperatureValueSpan) temperatureValueSpan.textContent = parseFloat(temperatureSlider?.value || 0.2).toFixed(2);
    if (topPSlider) topPSlider.value = chatSettings.top_p ?? 0.95;
    if (topPValueSpan) topPValueSpan.textContent = parseFloat(topPSlider?.value || 0.95).toFixed(2);
    // TODO: Load Top K and Max Tokens
}

function saveSettings(event) {
    event.preventDefault();
    const settingsModal = document.getElementById('settings-modal');
    const temperatureSlider = document.getElementById('temperature-slider');
    const topPSlider = document.getElementById('top-p-slider');
    // TODO: Get Top K and Max Tokens values

    const newSettings = {
        chat_settings: {
            temperature: parseFloat(temperatureSlider?.value || 0.2),
            top_p: parseFloat(topPSlider?.value || 0.95),
            // top_k: parseInt(topKInput?.value || 40),
            // max_output_tokens: parseInt(maxTokensInput?.value || 8192)
        },
        // ui_settings: { ... } // If UI settings are added
    };

    console.log("Saving settings:", newSettings); 
    currentProject.settings = newSettings;
    saveCurrentProject();
    // TODO: Add API call to save settings on the backend
    // api.saveSettings(currentProject.id, newSettings).then(...)
    showTemporaryStatus("Settings saved locally.");
    hideModal(settingsModal);
}

// --- Embedding Logic ---
function pollEmbeddingStatus(taskId) {
    console.log(`Polling status for task: ${taskId}`);
    const embedBtn = document.getElementById('embed-btn');
    const statusInterval = setInterval(() => {
        fetch(`/embed/status/${taskId}`)
            .then(response => {
                if (!response.ok) throw new Error(`Server returned ${response.status}`);
                return response.json();
            })
            .then(data => {
                console.log("Embedding status:", data);
                if (embedBtn) {
                    embedBtn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${Math.round(data.progress)}%`;
                }
                if (data.status === "completed") {
                    clearInterval(statusInterval);
                    showTemporaryStatus("Embedding completed successfully!", false);
                    if (embedBtn) {
                        embedBtn.disabled = false;
                        embedBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
                    }
                    // Optionally fetch results
                    // fetch(`/embed/results/${taskId}`).then(...)
                } else if (data.status === "failed") {
                    clearInterval(statusInterval);
                    showTemporaryStatus(`Embedding failed: ${data.error || "Unknown error"}`, true);
                    if (embedBtn) {
                        embedBtn.disabled = false;
                        embedBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
                    }
                }
            })
            .catch(error => {
                console.error("Error polling embedding status:", error);
                clearInterval(statusInterval);
                if (embedBtn) {
                    embedBtn.disabled = false;
                    embedBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
                }
                showTemporaryStatus("Error checking embedding status.", true);
            });
    }, 2000);
}

// --- Project Title Renaming ---
function setupTitleRenaming() {
    const projectTitleContainer = document.querySelector('.project-title-container');
    const projectTitleDisplay = document.getElementById('project-title-display');
    const renameBtn = document.getElementById('rename-project-btn');
    const saveRenameBtn = document.getElementById('save-rename-project-btn');
    const cancelRenameBtn = document.getElementById('cancel-rename-project-btn');
    let originalTitle = '';

    if (!projectTitleDisplay || !renameBtn || !saveRenameBtn || !cancelRenameBtn || !projectTitleContainer) {
        console.warn("Project title renaming elements not found.");
        return;
    }

    renameBtn.addEventListener('click', () => {
        originalTitle = projectTitleDisplay.textContent;
        projectTitleDisplay.contentEditable = 'true';
        projectTitleDisplay.focus();
        projectTitleContainer.classList.add('editing');
    });

    saveRenameBtn.addEventListener('click', () => {
        const newTitle = projectTitleDisplay.textContent.trim();
        projectTitleDisplay.contentEditable = 'false';
        projectTitleContainer.classList.remove('editing');
        if (newTitle && newTitle !== originalTitle) {
            projectTitleDisplay.textContent = newTitle;
            document.title = `Laira - ${newTitle}`;
            currentProject.title = newTitle;
            saveCurrentProject();
            // TODO: Add backend call to update title
            showTemporaryStatus("Project title updated locally.");
        } else {
            projectTitleDisplay.textContent = originalTitle;
        }
    });

    cancelRenameBtn.addEventListener('click', () => {
        projectTitleDisplay.textContent = originalTitle;
        projectTitleDisplay.contentEditable = 'false';
        projectTitleContainer.classList.remove('editing');
    });

    projectTitleDisplay.addEventListener('keydown', (e) => {
        if (projectTitleDisplay.contentEditable === 'true') {
            if (e.key === 'Enter') { e.preventDefault(); saveRenameBtn.click(); }
             else if (e.key === 'Escape') cancelRenameBtn.click();
        }
    });
}

// --- Panel Resizing ---
function setupResizing() {
    const resizers = document.querySelectorAll('.project-container .resizer');
    const notesPanelDefaultWidthPx = 260;
    const notesPanelMaxWidthPx = notesPanelDefaultWidthPx * 2;
    const centralPanelMinWidthPx = 300;

    resizers.forEach(resizer => {
        let isResizing = false, startX = 0, chatPanelStartWidth = 0, notesPanelStartWidth = 0;
        let chatPanel = null, notesPanel = null;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true; startX = e.clientX;
            resizer.classList.add('resizing'); document.body.classList.add('resizing');
            chatPanel = document.querySelector('.chat-panel'); notesPanel = document.querySelector('.notes-panel');
            if (!chatPanel || !notesPanel) { isResizing = false; return; }
            chatPanelStartWidth = chatPanel.offsetWidth; notesPanelStartWidth = notesPanel.offsetWidth;
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        function handleMouseMove(e) {
            if (!isResizing || !chatPanel || !notesPanel) return;
            const deltaX = e.clientX - startX;
            let newChatWidthPx = chatPanelStartWidth + deltaX;
            let newNotesWidthPx = notesPanelStartWidth - deltaX;
            if (newNotesWidthPx > notesPanelMaxWidthPx) { newNotesWidthPx = notesPanelMaxWidthPx; newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelMaxWidthPx; }
            if (newNotesWidthPx < notesPanelDefaultWidthPx) { newNotesWidthPx = notesPanelDefaultWidthPx; newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelDefaultWidthPx; }
            if (newChatWidthPx < centralPanelMinWidthPx) { newChatWidthPx = centralPanelMinWidthPx; newNotesWidthPx = chatPanelStartWidth + notesPanelStartWidth - centralPanelMinWidthPx; if (newNotesWidthPx > notesPanelMaxWidthPx) newNotesWidthPx = notesPanelMaxWidthPx; if (newNotesWidthPx < notesPanelDefaultWidthPx) newNotesWidthPx = notesPanelDefaultWidthPx; }
            newChatWidthPx = Math.max(0, newChatWidthPx); newNotesWidthPx = Math.max(0, newNotesWidthPx);
            const totalWidth = newChatWidthPx + newNotesWidthPx; // Use actual pixel sum
            const chatPercent = totalWidth > 0 ? (newChatWidthPx / totalWidth) * 100 : 50; // Avoid div by zero
            const notesPercent = totalWidth > 0 ? (newNotesWidthPx / totalWidth) * 100 : 50;
            chatPanel.style.flexBasis = `${chatPercent}%`; notesPanel.style.flexBasis = `${notesPercent}%`;
            chatPanel.style.flexGrow = '0'; notesPanel.style.flexGrow = '0';
            chatPanel.style.flexShrink = '1'; notesPanel.style.flexShrink = '0';
        }

        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false; resizer.classList.remove('resizing'); document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    });
}

// --- Populate UI from Data ---
function populateChatHistory(history) {
    const chatArea = document.getElementById('chat-area');
    if (!chatArea || !history) return;
    chatArea.innerHTML = ''; // Clear existing
    history.forEach(msg => {
        const sender = msg.role === 'user' ? 'user' : 'bot';
        const text = msg.content || msg.text || ''; // Handle different possible keys
        const id = msg.id || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
        addMessageToChat(text, sender, id);
    });
    checkChatAreaPlaceholder();
}

function updateProjectUI() {
    console.log("Updating UI with current project data:", currentProject);
    const projectTitleDisplay = document.getElementById('project-title-display');
    if (projectTitleDisplay) {
        projectTitleDisplay.textContent = currentProject.title;
        document.title = `Laira - ${currentProject.title}`;
    }
    loadSourceList(currentProject.id); // Reload source list
    loadSettings(); // Load settings into modal
    checkSourceList(); // Update chat enabled state
    if (typeof globalFetchNotes === 'function') {
        globalFetchNotes();
    } else {
        console.warn("Notes panel cannot be refreshed automatically (globalFetchNotes missing).");
    }
}

// --- Load Initial Project Data ---
async function loadProjectData(projectId) {
    console.log(`Starting to load project data for ${projectId}`);
    try {
        // Fetch all data concurrently
        const [settings, history, filesResponse] = await Promise.all([
            api.getSettings(projectId),
            api.getChatHistory(projectId),
            api.loadProjectFiles(projectId)
        ]);

        console.log("Loaded settings:", settings);
        console.log("Loaded chat history:", history);
        console.log("Loaded files response:", filesResponse);

        currentProject.settings = settings || { chat_settings: {}, ui_settings: {} };
        currentProject.chatHistory = history || [];

        // Process files
        let files = filesResponse;
        if (!Array.isArray(filesResponse) && filesResponse && typeof filesResponse === 'object' && Array.isArray(filesResponse.files)) {
            files = filesResponse.files;
        }
        if (!files || !Array.isArray(files)) files = [];
        currentProject.sources = files.map(file => ({
            filename: file.name || file.filename,
            size: file.size, type: file.type, status: 'success'
        }));

        // Update UI after all data is loaded
        updateProjectUI(); // This will call loadSourceList, loadSettings etc.
        populateChatHistory(currentProject.chatHistory);

        console.log("Project data loaded and UI updated (excluding notes managed by app.js):", currentProject);
        return true;
    } catch (error) {
        console.error("Error loading project data:", error);
        showTemporaryStatus("Failed to load project data. Some features might be using local data.", true);
        // Try to update UI with whatever local data exists
        updateProjectUI();
        return false;
    }
}

// --- Main Setup Function for Project View ---
export function setupProjectViewListeners(projectId) {
    console.log("Setting up NEW project view listeners for:", projectId);
    allProjects = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const decodedProjectId = decodeURIComponent(projectId);
    currentProject = allProjects.find(p => p.id === decodedProjectId);

    if (!currentProject) {
        console.log("Project not found, creating locally:", decodedProjectId);
        currentProject = {
            id: decodedProjectId, title: decodedProjectId.replace(/_/g, ' '),
            modifiedDate: new Date().toISOString(), sources: [], notes: [],
            chatHistory: [], settings: { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 8192 }, ui_settings: { theme: "light" } }
        };
        allProjects.push(currentProject);
        localStorage.setItem(storageKey, JSON.stringify(allProjects));
    } else {
        // Ensure default structures exist if loading existing project
        currentProject.notes = currentProject.notes || [];
        currentProject.sources = currentProject.sources || [];
        currentProject.chatHistory = currentProject.chatHistory || [];
        currentProject.settings = currentProject.settings || { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 8192 }, ui_settings: { theme: "light" } };
        currentProject.title = currentProject.title || decodedProjectId.replace(/_/g, ' ');
    }
    console.log("Loaded current project data:", currentProject);

    // --- Get DOM Elements ---
    const addSourceBtn = document.querySelector('.sources-panel .add-source-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const uploadShortcutBtn = document.querySelector('.upload-shortcut-btn');
    const addSourceModal = document.getElementById('add-source-modal');
    const settingsModal = document.getElementById('settings-modal');
    const modalFileUploadInput = document.getElementById('modal-file-upload');
    const dropZone = document.getElementById('drop-zone');
    const settingsForm = document.getElementById('settings-form');
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValueSpan = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const embedBtn = document.getElementById('embed-btn');
    const clearChatBtn = document.getElementById('clear-chat-btn');
    const stopButton = document.getElementById('stop-button');
    const addNoteBtn = document.querySelector('.notes-panel .add-note-btn');
    const notesList = document.getElementById('notes-list');
    const noteEditorView = document.getElementById('note-editor-view');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const deleteNoteBtnEditor = noteEditorView?.querySelector('#delete-note-btn');
    const cancelNoteBtn = document.getElementById('cancel-note-btn');
    const viewNoteModal = document.getElementById('view-note-modal');
    const saveViewNoteBtn = document.getElementById('save-view-note-btn');
    const chatArea = document.getElementById('chat-area');

    // --- Load Initial Data & Setup UI ---
    loadProjectData(projectId).then(() => {
        console.log("Initial project data load complete.");
    }).catch(err => {
        console.error("Initial data load failed:", err);
        updateProjectUI(); // Attempt to render UI with local data anyway
    });
    setupTitleRenaming();
    setupResizing();

    // --- Setup Event Listeners ---

    // Modal Triggers & Closers
    if (addSourceBtn) addSourceBtn.addEventListener('click', () => showModal(addSourceModal));
    if (uploadShortcutBtn) uploadShortcutBtn.addEventListener('click', () => showModal(addSourceModal));
    if (settingsBtn) {
         settingsBtn.addEventListener('click', () => {
            loadSettings(); // Load current settings when opening
            showModal(settingsModal);
         });
    }
    document.body.addEventListener('click', (event) => {
        if (event.target.matches('.modal-close-btn')) hideModal(event.target.closest('.modal-overlay'));
        if (event.target.matches('.modal-overlay')) hideModal(event.target);
        if (event.target.matches('.settings-cancel-btn')) hideModal(event.target.closest('.modal-overlay'));
        if (event.target.matches('#cancel-note-btn')) showNotesList(); // Handle cancel button for note editor
        if (event.target.matches('.view-note-cancel-btn')) {
            hideModal(viewNoteModal);
        }
    });

    // File Upload (Drag & Drop, Input)
    if (dropZone && modalFileUploadInput) {
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(ev => { dropZone.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }); document.body.addEventListener(ev, e => { e.preventDefault(); e.stopPropagation(); }); });
        ['dragenter', 'dragover'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.add('dragover')));
        ['dragleave', 'drop'].forEach(ev => dropZone.addEventListener(ev, () => dropZone.classList.remove('dragover')));
        dropZone.addEventListener('drop', (e) => {
             hideModal(addSourceModal);
             const formData = new FormData();
             if (e.dataTransfer.files) {
                 for (let i = 0; i < e.dataTransfer.files.length; i++) {
                     formData.append('files', e.dataTransfer.files[i]);
                 }
                 uploadFiles(formData);
             }
         });
        modalFileUploadInput.addEventListener('change', (event) => {
             hideModal(addSourceModal);
             const formData = new FormData();
             if (event.target.files) {
                 for (let i = 0; i < event.target.files.length; i++) {
                     formData.append('files', event.target.files[i]);
                 }
                 uploadFiles(formData);
                 modalFileUploadInput.value = ''; // Reset input
             }
        });
    }

    // Settings Form
    if (settingsForm) {
        if (temperatureSlider && temperatureValueSpan) temperatureSlider.oninput = (e) => { temperatureValueSpan.textContent = parseFloat(e.target.value).toFixed(2); };
        if (topPSlider && topPValueSpan) topPSlider.oninput = (e) => { topPValueSpan.textContent = parseFloat(e.target.value).toFixed(2); };
        settingsForm.onsubmit = saveSettings;
    }

    // Chat Interactions
    if (sendButton && userInput) {
        sendButton.addEventListener('click', () => sendMessage());
        userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        userInput.addEventListener('input', () => adjustTextareaHeight(userInput));
    }
    if (clearChatBtn) clearChatBtn.addEventListener('click', resetChat);
    if (stopButton) {
         stopButton.addEventListener('click', () => {
             if (currentAbortController) {
                console.log("Stop button clicked, aborting request...");
                currentAbortController.abort();
             }
         });
    }
    if (chatArea) {
        chatArea.addEventListener('click', async (event) => {
            const messageElement = event.target.closest('.message');
            if (!messageElement) return;
            const messageId = messageElement.dataset.messageId;
            // Delete Message
            if (event.target.closest('.delete-msg-btn')) {
                event.stopPropagation();
                if (confirm('Are you sure?')) {
                    const msgIndex = currentProject.chatHistory.findIndex(msg => msg.id === messageId);
                    if (msgIndex !== -1) {
                        currentProject.chatHistory.splice(msgIndex, 1);
                        saveCurrentProject();
                    }
                    messageElement.remove();
                    checkChatAreaPlaceholder();
                }
            }
            // Pin Message Logic (MODIFIED)
            if (event.target.closest('.pin-message-btn')) {
                event.stopPropagation(); if (isPinning) return; isPinning = true;
                const pinButton = event.target.closest('.pin-message-btn');
                const messageElement = event.target.closest('.chat-message'); // Get parent message
                const sender = messageElement?.classList.contains('user-message') ? 'User' : 'Assistant'; // Determine sender
                const encodedText = pinButton.dataset.messageText;
                if (!encodedText || !sender) { isPinning = false; return; } // Need sender too
                const messageText = decodeURIComponent(encodedText);
                
                // Generate Title (Improved)
                let noteTitle = messageText.split(/[\n.!?]/)[0]?.trim(); // First sentence/line
                if (!noteTitle || noteTitle.length > 60) noteTitle = messageText.substring(0, 50).trim() + (messageText.length > 50 ? '...' : '');
                if (!noteTitle) noteTitle = "Pinned from Chat";
                noteTitle = `Pinned: ${sender} - ${noteTitle}`;

                const noteBody = messageText;

                console.log(`Pinning message. Title: ${noteTitle}`);
                showTemporaryStatus("Pinning message to notes...");
                
                try {
                    // Call API to save the note
                    const result = await api.saveNote(currentProject.id, { title: noteTitle, content: noteBody }); // Corrected: Use saveNote
                    
                    if (result && result.success) {
                        showTemporaryStatus("Message pinned successfully!");
                        // Refresh notes list using the global function from app.js
                        if (typeof globalFetchNotes === 'function') {
                            globalFetchNotes();
                        } else {
                            console.warn("globalFetchNotes function not found. Cannot refresh notes list.");
                        }
                    } else {
                        console.error("Failed to save pinned note via API:", result);
                        showTemporaryStatus(`Failed to pin message: ${result?.error || 'Unknown API error'}`, true);
                    }
                } catch (err) {
                     console.error("Error pinning message:", err);
                     showTemporaryStatus(`Error pinning message: ${err.message}`, true);
                }
                finally {
                    setTimeout(() => { isPinning = false; }, 300); // Prevent rapid clicks
                }
            }
            // Edit Message
            else if (event.target.closest('.edit-msg-btn')) {
                event.stopPropagation();
                const display = messageElement.querySelector('.message-display');
                const editView = messageElement.querySelector('.message-edit-view');
                if (display && editView) { editView.style.display = 'none'; display.style.display = ''; }
            }
            // Resubmit Edit (as new message)
            else if (e.target.closest('.edit-resubmit-btn')) {
                e.stopPropagation();
                const textarea = messageElement.querySelector('.edit-textarea');
                const newText = textarea?.value.trim();
                const display = messageElement.querySelector('.message-display');
                const editView = messageElement.querySelector('.message-edit-view');
                if (newText && display && editView) {
                    // Revert original message UI
                    editView.style.display = 'none'; display.style.display = '';
                    // Send as a completely new message
                    sendMessage(newText);
                }
            }
        });
    }

    // Notes Interactions
    if (addNoteBtn) addNoteBtn.addEventListener('click', () => showNoteEditor());
    if (saveNoteBtn) saveNoteBtn.addEventListener('click', saveNote);
    if (deleteNoteBtnEditor) deleteNoteBtnEditor.addEventListener('click', deleteNote); // Editor delete
    if (cancelNoteBtn) cancelNoteBtn.addEventListener('click', showNotesList);
    if (saveViewNoteBtn) saveViewNoteBtn.addEventListener('click', saveNoteChanges); // View modal save
    if (notesList) {
        notesList.addEventListener('click', (event) => {
            const deleteButton = event.target.closest('.note-delete-btn');
            const listItem = event.target.closest('.note-list-item');
            if (deleteButton && listItem) { // Delete from list item
                const noteId = listItem.dataset.noteId;
                if (noteId && confirm('Delete this note?')) {
                    api.deleteNote(currentProject.id, noteId).then(result => {
                         if(result.success) deleteNoteFromList(noteId);
                         else showTemporaryStatus(`Failed: ${result.error}`, true);
                    }).catch(err => showTemporaryStatus(`Error: ${err.message}`, true));
                }
            } else if (listItem) { // View/Edit note
                const noteId = listItem.dataset.noteId;
                // For now, just view. Could add direct edit later.
                 if (noteId) showNoteViewModal(noteId); 
                 // Or potentially: showNoteEditor(noteId);
            }
        });
    }

    // Embed Button
    if (embedBtn) {
        embedBtn.addEventListener('click', () => {
            if (!currentProject.sources || currentProject.sources.length === 0) {
                showTemporaryStatus("No sources to embed.", true); return;
            }
            embedBtn.disabled = true; embedBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Embedding...';
            fetch(`/embed/${projectId}`, { method: 'POST' })
                .then(response => { if (!response.ok) throw new Error(`Server error ${response.status}`); return response.json(); })
                .then(data => {
                    showTemporaryStatus("Embedding started...");
                    if (data.task_id) pollEmbeddingStatus(data.task_id);
                     else { // Handle case where task ID might not be returned immediately
                        embedBtn.disabled = false; embedBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
                        showTemporaryStatus("Embedding initiated, status polling unavailable.", true);
                     }
                })
                .catch(error => {
                    console.error("Error starting embedding:", error);
                    showTemporaryStatus(`Error: ${error.message}`, true);
                    embedBtn.disabled = false; embedBtn.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
                });
        });
    }
    
    // Initial UI Checks
    checkSourceList();
    checkNotesList();
    adjustTextareaHeight(userInput);
} 