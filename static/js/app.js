document.addEventListener('DOMContentLoaded', () => {
    // Initialize the notes panel when the DOM is ready
    initializeNotesPanel();
});

let globalFetchNotes = () => { console.warn('fetchNotes not initialized yet'); }; // Placeholder

function initializeNotesPanel() {
    // Get references to DOM elements
    const notesList = document.getElementById('notes-list');
    const noteEditorView = document.getElementById('note-editor-view');
    const notesListView = document.getElementById('notes-list-view');
    const viewNoteModal = document.getElementById('view-note-modal');
    const viewNoteTitle = document.getElementById('view-note-title');
    const viewNoteBody = document.getElementById('view-note-body-textarea');
    const addNoteBtn = document.querySelector('.add-note-btn');
    const saveNoteBtn = document.getElementById('save-note-btn');
    const cancelEditBtn = document.getElementById('cancel-edit-btn');
    const closeModalBtn = document.getElementById('close-view-modal-btn');
    const noteTitleInput = document.getElementById('note-editor-title');
    const noteBodyTextarea = document.getElementById('note-editor-body');
    const noteIdInput = document.getElementById('note-id-input');

    // Get project_id from the URL or a data attribute
    const pathParts = window.location.pathname.split('/');
    const projectId = pathParts[pathParts.length - 1]; // Assumes project ID is the last part of the path

    // --- State Management ---
    let currentNotes = []; // Store fetched notes

    // --- API Interaction Functions ---

    async function fetchNotes() {
        try {
            const response = await fetch(`/project/${projectId}/notes`); // Updated path
            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }
            const data = await response.json();
            currentNotes = data.notes || []; // Assuming backend returns {"notes": [...]
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
        const placeholder = document.getElementById('notes-list-placeholder'); // Get placeholder li

        if (!notes || notes.length === 0) {
             if(placeholder) placeholder.style.display = 'block'; // Show placeholder
            // notesList.innerHTML = '<li class="no-notes">No notes yet.</li>';
            return;
        }

        if(placeholder) placeholder.style.display = 'none'; // Hide placeholder

        notes.forEach(note => {
            const listItem = document.createElement('li');
            listItem.classList.add('note-list-item');
            listItem.dataset.noteId = note.id; // Store note ID

            // Note Icon (Use Font Awesome)
            const icon = document.createElement('i'); // Changed span to i
            icon.classList.add('fas', 'fa-sticky-note', 'note-icon'); // Added Font Awesome classes
            // icon.textContent = '📝'; // Removed text content
            listItem.appendChild(icon);

            // Note Title
            const titleSpan = document.createElement('span');
            titleSpan.textContent = note.title || 'Untitled Note'; // Handle untitled notes
            listItem.appendChild(titleSpan);

            // Delete Button
            const deleteBtn = document.createElement('button');
            deleteBtn.classList.add('note-delete-btn');
            deleteBtn.textContent = '🗑️'; // Use an icon or text
            deleteBtn.title = "Delete Note";
            deleteBtn.onclick = (event) => {
                event.stopPropagation(); // Prevent triggering the view action
                deleteNote(note.id);
            };
            listItem.appendChild(deleteBtn);

            // Click listener for viewing the note
            listItem.onclick = () => {
                viewNote(note.id);
            };

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
            noteTitleInput.value = note.title;
            noteBodyTextarea.value = note.content;
            noteIdInput.value = note.id; // Set hidden input value
        } else {
            // Adding new note
            clearEditor();
        }
         noteTitleInput.focus(); // Focus on title input
    }

     function clearEditor() {
        noteTitleInput.value = '';
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

    if (addNoteBtn) {
        addNoteBtn.onclick = () => showNoteEditor(); // Show editor for new note
    }

    if (saveNoteBtn) {
        saveNoteBtn.onclick = () => {
            const title = noteTitleInput.value.trim();
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

    // Add listener for the save button inside the view modal
    const saveViewNoteBtn = document.getElementById('save-view-note-btn');
    if (saveViewNoteBtn) {
        saveViewNoteBtn.onclick = () => {
            const noteId = viewNoteTitle.dataset.noteId;
            const title = viewNoteTitle.textContent.trim(); // Title might be directly edited
            const content = viewNoteBody.value.trim();

            if (!noteId) {
                console.error("Cannot save changes, note ID not found.");
                return;
            }
             if (!title && !content) { 
                alert("Note cannot be empty.");
                return;
            }
            
            updateNote(noteId, title, content);
        };
    }

    // Expose fetchNotes globally
    globalFetchNotes = fetchNotes;

    // --- Initial Load ---
    fetchNotes();
} 