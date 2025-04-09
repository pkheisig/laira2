// Placeholder for JavaScript functionality

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded - Rebuilding UI');

    // --- Theme Handling --- 
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const body = document.body;

    // Function to apply theme based on saved preference or system setting
    function applyTheme(theme) {
        if (theme === 'dark') {
            body.classList.add('dark-theme');
            if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>'; // Show moon icon
        } else {
            body.classList.remove('dark-theme');
            if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>'; // Show sun icon
        }
    }

    // Function to toggle theme and save preference
    function toggleTheme() {
        const currentTheme = body.classList.contains('dark-theme') ? 'light' : 'dark';
        localStorage.setItem('theme', currentTheme); // Save preference
        applyTheme(currentTheme);
    }

    // Load saved theme or default to light
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
    applyTheme(savedTheme);

    // Add listener to theme toggle button (if it exists)
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', toggleTheme);
    }

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

function setupHomeViewListeners() {
    console.log("Setting up NEW home page listeners");
    const createNewBtn = document.querySelector('.home-container .create-new-btn');
    const gridViewBtn = document.getElementById('view-grid-btn');
    const listViewBtn = document.getElementById('view-list-btn');
    const sortDropdown = document.getElementById('sort-dropdown');
    const projectListArea = document.getElementById('project-list-area');

    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => {
            console.log("Home page 'Create new' clicked");
            // Generate default name - User requested removing timestamp
            const defaultName = "New_Project"; 
            // const uniqueId = `${defaultName}_${Date.now()}`; // Original timestamped version
            const uniqueId = defaultName; // Using fixed name as requested
            // Note: This might lead to collisions if multiple "New_Project" exist.
            // Requires backend/user to handle renaming promptly.
            window.location.href = `/project/${uniqueId}`;
        });
    } else { console.warn("Home Create New button not found"); }

    function setActiveView(viewType) {
         // ... basic view toggling logic (add later) ...
         console.log("Set view:", viewType);
         if(viewType === 'grid') {
            gridViewBtn?.classList.add('active');
            listViewBtn?.classList.remove('active');
            projectListArea?.classList.remove('project-list');
            projectListArea?.classList.add('project-grid');
         } else {
            gridViewBtn?.classList.remove('active');
            listViewBtn?.classList.add('active');
            projectListArea?.classList.remove('project-grid');
            projectListArea?.classList.add('project-list');
         }
    }

    if (gridViewBtn) gridViewBtn.addEventListener('click', () => setActiveView('grid'));
    if (listViewBtn) listViewBtn.addEventListener('click', () => setActiveView('list'));

    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            console.log(`Sort criteria changed to: ${e.target.value}`);
            // TODO: Fetch/render sorted list
        });
    }
    
    // TODO: Fetch and render project list initially
    // fetchAndRenderProjects(); 
    setActiveView('grid'); // Default view
}

function setupProjectViewListeners(projectId) {
    console.log("Setting up NEW project view listeners for:", projectId);

    // Modal Triggers
    const addSourceBtn = document.querySelector('.sources-panel .add-source-btn');
    const settingsBtn = document.getElementById('settings-btn');
    const uploadShortcutBtn = document.querySelector('.upload-shortcut-btn');

    // Modals
    const addSourceModal = document.getElementById('add-source-modal');
    const settingsModal = document.getElementById('settings-modal');
    
    // Add Source Modal Controls
    const modalFileUploadInput = document.getElementById('modal-file-upload');
    const dropZone = document.getElementById('drop-zone');
    const sourceList = document.getElementById('source-list');

    // Settings Modal Controls
    const settingsForm = document.getElementById('settings-form');
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValueSpan = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');

    // Other Project Elements
    const chatArea = document.getElementById('chat-area');
    const userInput = document.getElementById('user-input');
    const sendButton = document.getElementById('send-button');
    const embedBtn = document.getElementById('embed-btn');
    const generateSummaryBtn = document.getElementById('generate-summary-btn');
    const projectTitleContainer = document.querySelector('.project-title-container');
    const projectTitleDisplay = document.getElementById('project-title-display');
    const chatPlaceholder = document.getElementById('chat-placeholder');
    const sourceListPlaceholder = document.getElementById('source-list-placeholder');
    const renameBtn = document.getElementById('rename-project-btn');
    const saveRenameBtn = document.getElementById('save-rename-project-btn');
    const cancelRenameBtn = document.getElementById('cancel-rename-project-btn');
    let originalTitle = '';

    // Notes Panel Elements
    const addNoteBtn = document.querySelector('.notes-panel .add-note-btn');
    const notesList = document.getElementById('notes-list');
    const notesPanelContent = document.querySelector('.notes-panel .panel-content');
    const notesListPlaceholder = document.getElementById('notes-list-placeholder'); // Added

    // NEW: Notes Editor Elements
    const notesListView = document.getElementById('notes-list-view');
    const noteEditorView = document.getElementById('note-editor-view');
    const noteEditorTitle = document.getElementById('note-editor-title');
    const noteEditorBody = document.getElementById('note-editor-body');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const deleteNoteBtn = document.getElementById('delete-note-btn');

    // NEW: Note View Modal Elements
    const viewNoteModal = document.getElementById('view-note-modal');
    const viewNoteTitle = document.getElementById('view-note-title');
    const viewNoteBody = document.getElementById('view-note-body');
    const viewNoteBodyTextarea = document.getElementById('view-note-body-textarea');
    const saveViewNoteBtn = document.getElementById('save-view-note-btn');

    // Simple in-memory store for notes (temporary)
    let notesData = {}; // Stores { id: { title: '', body: '' } }
    let nextNoteId = 1; // Simple ID generator
    let currentlyViewingNoteId = null;

    // --- Modal Visibility Functions ---
    function showModal(modalElement) {
        modalElement?.classList.add('active');
    }
    function hideModal(modalElement) {
        modalElement?.classList.remove('active');
    }

    // Setup Modal Triggers
    if (addSourceBtn) addSourceBtn.addEventListener('click', () => showModal(addSourceModal));
    if (uploadShortcutBtn) uploadShortcutBtn.addEventListener('click', () => showModal(addSourceModal));
    if (settingsBtn) settingsBtn.addEventListener('click', () => showModal(settingsModal));

    // Setup Modal Close Buttons (using delegation on body)
    document.body.addEventListener('click', (event) => {
        // Close via close button
        if (event.target.matches('.modal-close-btn')) {
            const modal = event.target.closest('.modal-overlay');
            if (modal) hideModal(modal);
        }
        // Close via overlay click
        if (event.target.matches('.modal-overlay')) {
             hideModal(event.target);
        }
        // Close via settings cancel button
         if (event.target.matches('.settings-cancel-btn')) {
            const modal = event.target.closest('.modal-overlay');
            if (modal) hideModal(modal);
        }
    });

    // --- File Upload Logic ---
    if (dropZone && modalFileUploadInput) {
        // ... Add refined drag & drop setup (preventDefaults, highlight) ...
        ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
             dropZone.addEventListener(eventName, preventDefaults, false);
             document.body.addEventListener(eventName, preventDefaults, false); // Prevent browser default behavior
         });
        function preventDefaults(e) { e.preventDefault(); e.stopPropagation(); }
        ['dragenter', 'dragover'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.add('dragover')));
        ['dragleave', 'drop'].forEach(eventName => dropZone.addEventListener(eventName, () => dropZone.classList.remove('dragover')));
        dropZone.addEventListener('drop', handleDrop);
        modalFileUploadInput.addEventListener('change', (event) => handleFiles(event.target.files));
        
        function handleDrop(e) { handleFiles(e.dataTransfer.files); }

        function handleFiles(files) {
             if (!files || files.length === 0) return;
             hideModal(addSourceModal); 
             [...files].forEach(uploadFile);
             modalFileUploadInput.value = ''; // Reset file input
        }
    }

    function uploadFile(file) {
        // ... Keep existing uploadFile logic (validation, formData, fetch, UI update) ...
         console.log(`Uploading: ${file.name}`);
         // Placeholder: Just add to list for now
         addSourceToList(file.name);
          // Simulate success after short delay
         setTimeout(() => {
             updateSourceListItemStatus(file.name, true);
             checkSourceList(); // Update UI based on sources
         }, 500);
    }
    
    // --- Source List Management ---
    function addSourceToList(filename) {
        if (!sourceList) return;
        const listItem = document.createElement('li');
        listItem.dataset.filename = filename;
        listItem.innerHTML = `
            <span class="source-icon"><i class="fas fa-file-alt"></i></span> 
            <span class="source-delete-icon" title="Delete source"><i class="fas fa-trash-alt"></i></span>
            <span class="source-name">${filename}</span>
            <span class="source-status">Uploading...</span>
        `;
         // Update icon based on extension
         const iconEl = listItem.querySelector('.source-icon i');
         if (filename.toLowerCase().endsWith('.pdf')) iconEl.className = 'fas fa-file-pdf';
         
         listItem.querySelector('.source-delete-icon').addEventListener('click', handleDeleteSource);
         sourceList.appendChild(listItem);
         checkSourceList();
    }

    function updateSourceListItemStatus(filename, success) {
         const item = sourceList?.querySelector(`li[data-filename="${filename}"]`);
         if (!item) return;
         const statusEl = item.querySelector('.source-status');
         if (statusEl) statusEl.remove(); // Remove status indicator on completion
         item.style.opacity = success ? '1' : '0.5';
         if (!success) item.title = "Upload failed"; 
    }

    function handleDeleteSource(event) {
         const listItem = event.currentTarget.closest('li');
         const filename = listItem?.dataset.filename;
         if (!filename || !confirm(`Delete ${filename}?`)) return;
         console.log(`Deleting ${filename}`);
         // TODO: Add fetch call to backend
         listItem.remove();
         checkSourceList();
    }
    
    function checkSourceList() {
        const hasSources = sourceList && sourceList.children.length > 0;
        if (sourceListPlaceholder) sourceListPlaceholder.style.display = hasSources ? 'none' : 'block';
        // Enable/disable chat based on sources
        if (hasSources) enableChatInput(); else disableChatInput();
    }

    // --- Chat Input & Messaging Logic ---
    function disableChatInput() {
        if (userInput) { userInput.placeholder = "Upload a source first"; userInput.disabled = true; }
        if (sendButton) sendButton.disabled = true;
        if (chatPlaceholder) chatPlaceholder.style.display = 'flex'; 
    }
    function enableChatInput() {
        if (userInput) { userInput.placeholder = "Ask about your sources..."; userInput.disabled = false; }
        if (sendButton) sendButton.disabled = false;
         if (chatPlaceholder) chatPlaceholder.style.display = 'none';
    }

    function addMessageToChat(text, sender) {
        // ... Keep existing addMessageToChat logic (placeholder removal, class assignment, markdown, scroll) ...
        if (!chatArea) return;
        const placeholder = chatArea.querySelector('.placeholder-box'); 
        if (placeholder) placeholder.style.display = 'none'; // Hide placeholder

        const messageDiv = document.createElement('div');
        messageDiv.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');
        // Basic formatting (expand later)
        messageDiv.textContent = text; 
        chatArea.appendChild(messageDiv);
        chatArea.scrollTop = chatArea.scrollHeight;
    }

    function sendMessage() {
        // ... Keep existing sendMessage logic (get value, add user msg, clear input, show thinking, fetch, handle response/error) ...
         if (!userInput || !chatArea || !projectId || userInput.disabled) return;
         const question = userInput.value.trim();
         if (!question) return;
         addMessageToChat(question, 'user');
         userInput.value = '';
         adjustTextareaHeight();
         // Placeholder for thinking/fetch...
         setTimeout(() => addMessageToChat(`Thinking about "${question}"... (Response placeholder)`, 'bot'), 500);
    }

    if (sendButton && userInput) {
        sendButton.addEventListener('click', sendMessage);
        userInput.addEventListener('keypress', (e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } });
        userInput.addEventListener('input', adjustTextareaHeight);
    }

    function adjustTextareaHeight() {
        // ... Keep existing adjustTextareaHeight logic ...
         if (!userInput) return;
         userInput.style.height = 'auto'; // Reset height
         let scrollHeight = userInput.scrollHeight;
         const maxHeight = 150; // Example max height
         if (scrollHeight > maxHeight) {
              userInput.style.height = `${maxHeight}px`;
              userInput.style.overflowY = 'auto';
         } else {
              userInput.style.height = `${scrollHeight}px`;
              userInput.style.overflowY = 'hidden';
         }
    }

    // --- Settings Modal Logic ---
     if (settingsForm) {
        // ... Add logic to load/save settings, update slider displays ...
        // Example: Update slider value displays
        if (temperatureSlider && temperatureValueSpan) {
             temperatureSlider.oninput = (e) => { temperatureValueSpan.textContent = parseFloat(e.target.value).toFixed(2); };
             temperatureValueSpan.textContent = parseFloat(temperatureSlider.value).toFixed(2);
        }
        if (topPSlider && topPValueSpan) {
             topPSlider.oninput = (e) => { topPValueSpan.textContent = parseFloat(e.target.value).toFixed(2); };
             topPValueSpan.textContent = parseFloat(topPSlider.value).toFixed(2);
        }
        settingsForm.onsubmit = (e) => {
            e.preventDefault();
            console.log("Settings saved (placeholder)");
            // TODO: Get form data and send to backend
            hideModal(settingsModal);
        };
    }

    // --- Other Project View Buttons ---
    if (embedBtn) embedBtn.addEventListener('click', () => console.log("Embed clicked (placeholder)"));
    if (generateSummaryBtn) generateSummaryBtn.addEventListener('click', () => console.log("Generate Summary clicked (placeholder)"));

    // --- Project Title Renaming --- 
    if (projectTitleDisplay && renameBtn && saveRenameBtn && cancelRenameBtn && projectTitleContainer) {
        renameBtn.addEventListener('click', () => {
            originalTitle = projectTitleDisplay.textContent;
            projectTitleDisplay.contentEditable = 'true';
            projectTitleDisplay.focus();
            projectTitleContainer.classList.add('editing');
            // Select text? Maybe not needed if focus is sufficient
            // document.execCommand('selectAll', false, null);
        });

        saveRenameBtn.addEventListener('click', () => {
            const newTitle = projectTitleDisplay.textContent.trim();
            projectTitleDisplay.contentEditable = 'false';
            projectTitleContainer.classList.remove('editing');
            if (newTitle && newTitle !== originalTitle) {
                projectTitleDisplay.textContent = newTitle; // Optimistic update
                document.title = `Laira - ${newTitle}`;
                console.log(`TODO: Send new title to backend: ${newTitle}`);
                // TODO: Add fetch call to backend to save newTitle
                // Handle potential backend errors and revert UI if needed
            } else {
                projectTitleDisplay.textContent = originalTitle; // Revert if empty or unchanged
            }
        });

        cancelRenameBtn.addEventListener('click', () => {
            projectTitleDisplay.textContent = originalTitle;
            projectTitleDisplay.contentEditable = 'false';
            projectTitleContainer.classList.remove('editing');
        });

        // Optional: Save/Cancel on Enter/Escape while editing
        projectTitleDisplay.addEventListener('keydown', (e) => {
            if (projectTitleDisplay.contentEditable === 'true') {
                if (e.key === 'Enter') {
                    e.preventDefault(); // Prevent newline
                    saveRenameBtn.click();
                } else if (e.key === 'Escape') {
                    cancelRenameBtn.click();
                }
            }
        });

        // Optional: Prevent losing focus easily / Save on blur?
        // projectTitleDisplay.addEventListener('blur', () => {
        //     if (projectTitleContainer.classList.contains('editing')) {
        //         // Might be too aggressive - consider if clicking save/cancel counts as blur
        //         // setTimeout(() => saveRenameBtn.click(), 100); // Delay to allow button clicks
        //     }
        // });

    } else {
        console.warn("Project title renaming elements not found.");
    }

    // --- Resizable Panels (Only Chat <-> Notes now) --- 
    const resizers = document.querySelectorAll('.project-container .resizer');
    // Min widths remain the same
    const notesPanelDefaultWidthPx = 260; // Default width from CSS
    const notesPanelMaxWidthPx = notesPanelDefaultWidthPx * 2; 
    const centralPanelMinWidthPx = 300; 

    resizers.forEach(resizer => {
        let isResizing = false;
        let startX = 0;
        let chatPanelStartWidth = 0; // Left is always chat now
        let notesPanelStartWidth = 0; // Right is always notes now
        let containerWidth = 0;
        let chatPanel = null;
        let notesPanel = null;

        resizer.addEventListener('mousedown', (e) => {
            isResizing = true;
            startX = e.clientX;
            resizer.classList.add('resizing');
            document.body.classList.add('resizing'); 

            // Only one resizer, so panels are fixed
            chatPanel = document.querySelector('.chat-panel');
            notesPanel = document.querySelector('.notes-panel');
            containerWidth = resizer.parentElement.offsetWidth; 

            if (!chatPanel || !notesPanel) {
                console.error("Could not find chat or notes panel");
                isResizing = false; 
                return;
            }
            
            chatPanelStartWidth = chatPanel.offsetWidth;
            notesPanelStartWidth = notesPanel.offsetWidth;
            
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });

        function handleMouseMove(e) {
            if (!isResizing || !chatPanel || !notesPanel) return;

            const currentX = e.clientX;
            const deltaX = currentX - startX;

            // Initial calculation based on drag delta
            let newChatWidthPx = chatPanelStartWidth + deltaX;
            let newNotesWidthPx = notesPanelStartWidth - deltaX;
            
            // --- Boundary Clamping --- 
            
            // 1. Enforce Notes Panel Max Width
            if (newNotesWidthPx > notesPanelMaxWidthPx) {
                 newNotesWidthPx = notesPanelMaxWidthPx;
                 newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelMaxWidthPx;
            }
            
            // 2. Enforce Notes Panel Min Width (using its default as min)
             if (newNotesWidthPx < notesPanelDefaultWidthPx) {
                 newNotesWidthPx = notesPanelDefaultWidthPx;
                 newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelDefaultWidthPx;
             }
             
            // 3. Enforce Chat Panel Min Width
             if (newChatWidthPx < centralPanelMinWidthPx) {
                 newChatWidthPx = centralPanelMinWidthPx;
                 newNotesWidthPx = chatPanelStartWidth + notesPanelStartWidth - centralPanelMinWidthPx;
                 // Re-check notes max after chat min enforcement
                 if (newNotesWidthPx > notesPanelMaxWidthPx) newNotesWidthPx = notesPanelMaxWidthPx;
                 // Re-check notes min after chat min enforcement
                 if (newNotesWidthPx < notesPanelDefaultWidthPx) newNotesWidthPx = notesPanelDefaultWidthPx;
             }

            // --- Convert to Percentages --- 
            newChatWidthPx = Math.max(0, newChatWidthPx);
            newNotesWidthPx = Math.max(0, newNotesWidthPx);

            const totalWidth = newChatWidthPx + newNotesWidthPx;
            let chatPercent = (newChatWidthPx / totalWidth) * 100;
            let notesPercent = (newNotesWidthPx / totalWidth) * 100;
            
            if (chatPercent + notesPercent > 100) {
                if (chatPercent > notesPercent) { chatPercent = 100 - notesPercent; }
                 else { notesPercent = 100 - chatPercent; }
            }

            // Apply percentages
            chatPanel.style.flexBasis = `${chatPercent}%`;
            notesPanel.style.flexBasis = `${notesPercent}%`;
            
            // Keep grow/shrink factors
            chatPanel.style.flexGrow = '0'; 
            notesPanel.style.flexGrow = '0';
            chatPanel.style.flexShrink = '1'; // Allow chat panel to shrink if needed
            notesPanel.style.flexShrink = '0'; 
        }

        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false;
            resizer.classList.remove('resizing');
            document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    });

    // --- Notes Panel Logic (NEW Editor View Logic) ---

    function showNoteEditor() {
        if (!notesListView || !noteEditorView || !noteEditorTitle || !noteEditorBody) return;
        // Reset editor for a new note
        noteEditorTitle.textContent = 'New Note';
        noteEditorBody.value = '';
        // Hide list, show editor
        notesListView.style.display = 'none';
        noteEditorView.style.display = 'flex'; // Use flex as per CSS
        noteEditorTitle.focus(); // Focus on title first
    }

    function showNotesList() {
        if (!notesListView || !noteEditorView) return;
        // Hide editor, show list
        noteEditorView.style.display = 'none';
        notesListView.style.display = 'block';
        checkNotesList(); // Make sure placeholder visibility is correct
    }

    function saveNote() {
        if (!noteEditorTitle || !noteEditorBody) return;
        const title = noteEditorTitle.textContent.trim();
        const body = noteEditorBody.value.trim();

        if (!title && !body) {
            // If both are empty, treat as cancel/delete
            console.log("Note empty, discarding.");
            showNotesList(); // Just go back to list view
            return; 
        }

        // Use title or placeholder if title is empty
        const finalTitle = title || "Untitled Note"; 

        // TODO: Replace placeholder with actual save logic (backend call)
        console.log(`Saving Note (Placeholder):
Title: ${finalTitle}
Body: ${body}`);
        addNoteToList(finalTitle, body); // Add to UI list (pass body too)
        
        showNotesList(); // Switch back to list view after save
    }

    function deleteNote() {
        if (!confirm("Are you sure you want to delete this note? This cannot be undone.")) {
            return;
        }
        // TODO: Add logic to delete note from backend if it was already saved
        console.log("Deleting Note (Placeholder)");
        showNotesList(); // Switch back to list view after delete/cancel
    }

    // MODIFIED: Creates the new list item structure
    function addNoteToList(title, body) {
        if (!notesList) return;

        const noteId = `note-${nextNoteId++}`; // Generate a unique ID
        notesData[noteId] = { title, body }; // Store data

        const listItem = document.createElement('li');
        listItem.classList.add('note-list-item');
        listItem.dataset.noteId = noteId;

        listItem.innerHTML = `
            <span class="note-icon"><i class="fas fa-sticky-note"></i></span>
            <span class="note-item-title"></span>
            <button class="note-delete-btn" title="Delete Note"><i class="fas fa-trash-alt"></i></button>
        `;

        // Set title safely to prevent XSS
        const titleSpan = listItem.querySelector('.note-item-title');
        if (titleSpan) titleSpan.textContent = title;
        
        notesList.appendChild(listItem);
        checkNotesList(); // Update placeholder visibility
    }

    // NEW: Function to delete a note from the list and data store
    function deleteNoteFromList(noteId) {
        const listItem = notesList?.querySelector(`li[data-note-id="${noteId}"]`);
        if (listItem) {
            listItem.remove();
            delete notesData[noteId]; // Remove from data store
            console.log(`Deleted note ${noteId} (frontend)`);
            // TODO: Add backend call to delete permanently
            checkNotesList();
        } else {
            console.warn(`Could not find list item for note ID: ${noteId}`);
        }
    }

    // NEW: Function to show the note view modal (MODIFIED)
    function showNoteViewModal(noteId) {
        const note = notesData[noteId];
        if (!note || !viewNoteModal || !viewNoteTitle || !viewNoteBodyTextarea) {
            console.error("Could not find note data or modal elements for ID:", noteId);
            return;
        }

        currentlyViewingNoteId = noteId;

        viewNoteTitle.textContent = note.title;
        viewNoteBodyTextarea.value = note.body;

        showModal(viewNoteModal);
    }

    // NEW: Function to save changes from the note view modal
    function saveNoteChanges() {
        if (!currentlyViewingNoteId || !viewNoteTitle || !viewNoteBodyTextarea) {
            console.error("No note ID or modal elements found to save changes.");
            return;
        }

        const noteId = currentlyViewingNoteId;
        const newTitle = viewNoteTitle.textContent.trim();
        const newBody = viewNoteBodyTextarea.value.trim();

        // Update data store
        if (notesData[noteId]) {
            notesData[noteId].title = newTitle;
            notesData[noteId].body = newBody;
            console.log(`Updated note ${noteId} (frontend):`, notesData[noteId]);

            // Update list item display
            const listItem = notesList?.querySelector(`li[data-note-id="${noteId}"]`);
            const titleSpan = listItem?.querySelector('.note-item-title');
            if (titleSpan) {
                titleSpan.textContent = newTitle || "Untitled Note";
            }

            // TODO: Add backend call to save changes

        } else {
            console.error("Could not find note data to update for ID:", noteId);
        }

        hideModal(viewNoteModal);
        currentlyViewingNoteId = null;
    }

    function checkNotesList() {
        const hasNotes = notesList && notesList.children.length > 0;
        if (notesListPlaceholder) {
            notesListPlaceholder.style.display = hasNotes ? 'none' : 'block';
        }
         if (notesList) {
            notesList.style.display = hasNotes ? 'block' : 'none';
         }
    }

    // Event listener for the Add Note button (Changed)
    if (addNoteBtn) {
        addNoteBtn.addEventListener('click', showNoteEditor);
    } else {
        console.warn("Add Note button not found.");
    }

    // Event listeners for the Note Editor buttons
    if (saveNoteBtn) {
        saveNoteBtn.addEventListener('click', saveNote);
    } else {
        console.warn("Save Note button not found.");
    }
    
    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener('click', deleteNote);
    } else {
        console.warn("Delete Note button not found.");
    }

    // NEW: Event delegation for clicks within the notes list
    if (notesList) {
        notesList.addEventListener('click', (event) => {
            const target = event.target;
            const deleteButton = target.closest('.note-delete-btn');
            const listItem = target.closest('.note-list-item');

            if (deleteButton && listItem) {
                const noteId = listItem.dataset.noteId;
                if (noteId && confirm(`Are you sure you want to delete this note?`)) {
                    deleteNoteFromList(noteId);
                }
            } else if (listItem) {
                // Clicked on the item itself (not the delete button)
                const noteId = listItem.dataset.noteId;
                if (noteId) {
                    showNoteViewModal(noteId);
                }
            }
        });
    }

    // Initial check for notes placeholder
    checkNotesList();
    showNotesList(); // Ensure editor is hidden and list is shown initially

    // Initial check
    checkSourceList(); 
    adjustTextareaHeight();

}

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