document.addEventListener('DOMContentLoaded', () => {
    // Initialize the notes panel when the DOM is ready
    // initializeNotesPanel(); // Remove direct call on DOM load
});

window.globalFetchNotes = () => { console.warn('fetchNotes not initialized yet'); }; // Placeholder

// Modify to accept projectId
export function initializeNotesPanel(projectId) { 
    if (!projectId) {
        console.error("[Notes] Initialization skipped: projectId is missing.");
        return;
    }
    console.log(`[Notes] Initializing notes panel for project: ${projectId}`);

    // Get references to DOM elements
    const notesList = document.getElementById('notes-list');
    const noteEditorView = document.getElementById('note-editor-view');
    // Ensure inline editor view is hidden
    if (noteEditorView) noteEditorView.style.display = 'none';
    const viewNoteModal = document.getElementById('view-note-modal');
    const viewNoteTitle = document.getElementById('view-note-title');
    const viewNoteBody = document.getElementById('view-note-body-textarea');
    const addNoteBtn = document.querySelector('.add-note-btn');
    const saveNoteBtn = document.getElementById('save-note-btn'); // Unused
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const closeModalBtn = document.getElementById('close-view-modal-btn');
    const noteTitleInput = document.getElementById('note-editor-title');
    const noteBodyTextarea = document.getElementById('note-editor-body');
    const noteIdInput = document.getElementById('note-id-input');

    // --- State Management ---
    let currentNotes = []; // Store fetched notes

    // --- API Interaction Functions ---

    async function fetchNotes() {
        try {
            const url = `/project/${projectId}/notes`; // Log the URL
            console.log(`[DEBUG] Fetching notes from: ${url}`); // Log the URL
            const response = await fetch(url); // Updated path

            // Log response details before trying to parse JSON
            console.log(`[DEBUG] Response status for ${url}: ${response.status}`);
            console.log(`[DEBUG] Response content-type for ${url}: ${response.headers.get('content-type')}`);
            const responseText = await response.text(); // Get raw text
            console.log(`[DEBUG] Raw response text for ${url}:`, responseText);

            if (!response.ok) {
                // Use the already fetched text for error message if needed
                 console.error(`[ERROR] fetchNotes failed with status ${response.status}. Response text: ${responseText}`);
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            // Attempt to parse the raw text as JSON
            const data = JSON.parse(responseText); // Parse the raw text
            currentNotes = data.notes || []; // Assuming backend returns {\"notes\": [...]}
            displayNotes(currentNotes);
        } catch (error) {
            console.error("Error fetching notes:", error);
        }
    }

    async function fetchNoteById(noteId) {
        try {
            const response = await fetch(`/project/${projectId}/notes/${noteId}`); // Updated path
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            return await response.json(); // Backend returns the full note object
        } catch (error) {
            console.error(`Error fetching note ${noteId}:`, error);
            return null;
        }
    }

    async function createNote(title, content) { // Changed body to content
        try {
            const response = await fetch(`/project/${projectId}/notes`, { // Updated path
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content }), // Changed body to content
            });
            if (!response.ok) {
                const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
            await fetchNotes(); // Refresh the list
            showListView();
        } catch (error) {
            console.error("Error creating note:", error);
        }
    }

    async function updateNote(noteId, title, content) { // Changed body to content
        try {
            const response = await fetch(`/project/${projectId}/notes/${noteId}`, { // Updated path
                method: 'PUT', // Changed to PUT
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ title, content }), // Changed body to content
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
            await fetchNotes(); // Refresh the list

            // Close view modal if it was open for this note
            if (viewNoteModal.classList.contains('active') && viewNoteTitle.dataset.noteId === noteId) {
                 closeViewModal();
            }
        } catch (error) {
            console.error(`Error updating note ${noteId}:`, error);
        }
    }

    async function deleteNote(noteId) {
        if (!confirm("Are you sure you want to delete this note?")) {
            return;
        }
        try {
            const response = await fetch(`/project/${projectId}/notes/${noteId}`, { // Updated path
                method: 'DELETE',
            });
            if (!response.ok) {
                 const errorData = await response.json();
                throw new Error(`HTTP error! status: ${response.status} - ${errorData.error || 'Unknown error'}`);
            }
            await fetchNotes(); // Refresh the list
            // If the deleted note was being viewed, close the modal
            if (viewNoteModal.style.display === 'block' && viewNoteTitle.dataset.noteId === noteId) {
                 closeViewModal();
            }
        } catch (error) {
            console.error(`Error deleting note ${noteId}:`, error);
        }
    }

    // --- UI Manipulation Functions ---

    function displayNotes(notes) {
        notesList.innerHTML = ''; // Clear existing list
        // If no notes, display placeholder message
        if (!notes || notes.length === 0) {
            notesList.innerHTML = `
                <li class="placeholder-box" style="margin:1vh 1vw; text-align:center; list-style:none;">
                    <i class="fas fa-sticky-note" style="font-size:4vw; margin-bottom:1vh; display:block; color:var(--secondary-text-light);"></i>
                    <p style="margin:0;">Saved notes will appear here.</p>
                </li>
            `;
            return;
        }

        notes.forEach(note => {
            const listItem = document.createElement('li');
            listItem.classList.add('note-list-item');
            listItem.dataset.noteId = note.id;
            // Build inner HTML with icon container, title, and timestamp
            const dt = new Date((note.modified_at || note.created_at) * 1000);
            const now = new Date();
            const diff = now - dt;
            const timeOpts = { hour: '2-digit', minute: '2-digit' };
            const tsText = diff > 24*60*60*1000
                ? dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], timeOpts)
                : dt.toLocaleTimeString([], timeOpts);
            listItem.innerHTML = `
                <div class="item-icon-container">
                    <span class="note-icon"><i class="fas fa-sticky-note"></i></span>
                    <button class="note-delete-btn" title="Delete Note"><i class="fas fa-trash-alt"></i></button>
                </div>
                <span class="note-item-title">${note.title || 'Untitled Note'}</span>
                <span class="note-timestamp" style="margin-left:8px;font-size:0.85em;color:var(--secondary-text-light);">${tsText}</span>
            `;
            // Attach delete handler
            const deleteBtn = listItem.querySelector('.note-delete-btn');
            deleteBtn.onclick = event => { event.stopPropagation(); deleteNote(note.id); };
            // Attach view handler
            listItem.onclick = () => viewNote(note.id);
            notesList.appendChild(listItem);
        });
    }

    function showListView() {
        notesListView.style.display = 'block';
        noteEditorView.style.display = 'none';
        clearEditor(); // Clear editor fields when switching back
    }

    function showNoteEditor(note = null) {
        notesListView.style.display = 'none';
        noteEditorView.style.display = 'flex'; // Use flex for column layout

        if (note) {
            // Editing existing note
            noteTitleInput.textContent = note.title;
            noteBodyTextarea.value = note.content;
            noteIdInput.value = note.id; // Set hidden input value
        } else {
            // Adding new note
            clearEditor();
        }
         noteTitleInput.focus(); // Focus on title input
    }

     function clearEditor() {
        noteTitleInput.textContent = '';
        noteBodyTextarea.value = '';
        noteIdInput.value = ''; // Clear hidden input
    }


    async function viewNote(noteId) {
        const note = await fetchNoteById(noteId);
        if (note) {
            // Ensure elements exist before setting properties
             if (viewNoteTitle) {
                 viewNoteTitle.textContent = note.title || 'Untitled Note';
                 viewNoteTitle.dataset.noteId = note.id; // Store ID for potential actions (like save)
             }
             if (viewNoteBody) {
                 viewNoteBody.value = note.content || ''; // Use value for textarea and content field
                 viewNoteBody.readOnly = false; // Allow editing in modal
             }
             if (viewNoteModal) viewNoteModal.classList.add('active');
        } else {
            console.error("Could not load note details.");
        }
    }

    function closeViewModal() {
        if (viewNoteModal) {
            viewNoteModal.classList.remove('active');
        }
        viewNoteTitle.textContent = '';
        viewNoteBody.value = '';
        viewNoteTitle.dataset.noteId = '';
        if (viewNoteBody) viewNoteBody.readOnly = true; // Reset to read-only if needed
    }

    // --- Event Listeners ---

    // Show modal for new note creation
    if (addNoteBtn) {
        addNoteBtn.onclick = () => {
            if (viewNoteModal) {
                viewNoteTitle.textContent = 'New Note';
                viewNoteTitle.dataset.noteId = '';
                viewNoteBody.value = '';
                viewNoteModal.classList.add('active');
            }
        };
    }

    if (saveNoteBtn) {
        saveNoteBtn.onclick = () => {
            const title = noteTitleInput.textContent.trim();
            const content = noteBodyTextarea.value.trim();
            const noteId = noteIdInput.value;

            if (!title && !content) {
                alert("Note cannot be empty.");
                return;
            }

            if (noteId) {
                updateNote(noteId, title, content);
            } else {
                createNote(title, content);
            }
        };
    }

    if (cancelEditBtn) {
        cancelEditBtn.onclick = () => showListView(); // Go back to list view
    }

     if (closeModalBtn) {
        closeModalBtn.onclick = () => closeViewModal();
    }

    // Specific listener for the CLOSE button within the view modal
    const viewModalCloseButton = viewNoteModal?.querySelector('.modal-close-btn');
    if (viewModalCloseButton) {
        viewModalCloseButton.onclick = () => {
             closeViewModal();
        }
    }

    // Close modal if clicking outside of it (keep this)
    window.onclick = (event) => {
        if (viewNoteModal?.classList.contains('active') && event.target === viewNoteModal) { 
            closeViewModal();
        }
    };

    // Save button inside view modal: handle create vs update
    const saveViewNoteBtn = document.getElementById('save-view-note-btn');
    if (saveViewNoteBtn) {
        saveViewNoteBtn.onclick = async () => {
            const noteId = viewNoteTitle.dataset.noteId;
            const title = viewNoteTitle.textContent.trim();
            const content = viewNoteBody.value.trim();
            if (!title && !content) {
                alert('Note cannot be empty.'); return;
            }
            try {
                if (noteId) {
                    await updateNote(noteId, title, content);
                } else {
                    await createNote(title, content);
                }
                viewNoteModal.classList.remove('active');
                globalFetchNotes();
            } catch (error) {
                console.error('Error saving note:', error);
            }
        };
    }

    // Expose fetchNotes globally
    window.globalFetchNotes = fetchNotes;

    // --- Initial Load ---
    fetchNotes();
} 