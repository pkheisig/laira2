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
    const projectListHeader = projectListArea?.querySelector('.project-list-header'); // NEW: List header
    const homePlaceholder = document.getElementById('home-placeholder');
    const projectCardTemplate = document.getElementById('project-card-template');
    const projectListItemTemplate = document.getElementById('project-list-item-template'); // NEW: List item template
    const storageKey = 'lairaProjects'; // Key for localStorage
    let currentView = 'grid'; // Track current view ('grid' or 'list')
    let currentSort = 'recent'; // Track current sort ('recent' or 'alpha')

    if (createNewBtn) {
        createNewBtn.addEventListener('click', () => {
            console.log("Home page 'Create new' clicked");
            let projects = JSON.parse(localStorage.getItem(storageKey) || '[]');
            let counter = projects.length + 1;
            let uniqueId = `New_Project_${counter}`;
            while (projects.some(p => p.id === uniqueId)) {
                counter++;
                uniqueId = `New_Project_${counter}`;
            }
            const defaultTitle = `New Project ${counter}`;
            const now = new Date();
            const newProjectData = {
                id: uniqueId,
                title: defaultTitle,
                // Store full ISO string for reliable sorting, format later for display
                modifiedDate: now.toISOString(), 
                sources: [] // NEW: Initialize sources array
            };
            projects.push(newProjectData);
            localStorage.setItem(storageKey, JSON.stringify(projects));
            // Don't add card immediately, fetchAndRenderProjects will handle it
            // navigate to the new project page
            window.location.href = `/project/${uniqueId}`;
        });
    } else { console.warn("Home Create New button not found"); }

    // MODIFIED: deleteProject - re-renders list after deletion
    function deleteProject(projectId) {
        const projectToDelete = JSON.parse(localStorage.getItem(storageKey) || '[]').find(p => p.id === projectId);
        if (!projectToDelete) {
             console.warn(`Project with ID ${projectId} not found for deletion prompt.`);
             return; // Exit if project data not found
        }

        if (!confirm(`Are you sure you want to delete project "${projectToDelete.title}"? This action cannot be undone.`)) {
            return;
        }
        console.log(`Attempting to delete project ${projectId}`);
        try {
            let projects = JSON.parse(localStorage.getItem(storageKey) || '[]');
            const initialLength = projects.length;
            const updatedProjects = projects.filter(p => p.id !== projectId);
            const removed = initialLength > updatedProjects.length;

            if (removed) {
                localStorage.setItem(storageKey, JSON.stringify(updatedProjects));
                console.log(`Deleted project ${projectId}. Saved updated projects list.`);
                // Re-render the list with the current view and sort
                fetchAndRenderProjects(); 
            } else {
                console.warn(`Project with ID ${projectId} not found in localStorage array for deletion.`);
            }
        } catch (error) {
            console.error("Error during project deletion:", error);
            alert("An error occurred while trying to delete the project.");
        }
    }

    // NEW: Function to render a single project list item
    function renderProjectListItem(projectData) {
        if (!projectListArea || !projectListItemTemplate) {
            console.error("Project list area or list item template not found.");
            return;
        }

        const itemClone = projectListItemTemplate.content.cloneNode(true);
        const itemElement = itemClone.querySelector('.project-list-item');
        const titleElement = itemClone.querySelector('.item-title');
        const sourcesElement = itemClone.querySelector('.item-sources');
        const dateElement = itemClone.querySelector('.item-mod-date');
        const optionsBtn = itemClone.querySelector('.list-options-btn');
        const optionsMenu = itemClone.querySelector('.list-options-menu');
        const renameBtn = itemClone.querySelector('.rename-list-item-btn');
        const deleteBtn = itemClone.querySelector('.delete-list-item-btn');
        const titleColumn = itemClone.querySelector('.list-item-col.title-col'); // For inline buttons

        if (!itemElement || !titleElement || !sourcesElement || !dateElement || !optionsBtn || !optionsMenu || !renameBtn || !deleteBtn || !titleColumn) {
            console.error("Missing list item elements");
            return;
        }

        itemElement.dataset.projectId = projectData.id; // Store ID
        titleElement.textContent = projectData.title;
        // Format date for display (e.g., "Apr 8, 2025")
        const modDate = new Date(projectData.modifiedDate);
        dateElement.textContent = modDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' }); 
        // Display source count
        const sourceCount = projectData.sources?.length || 0;
        sourcesElement.textContent = `${sourceCount} Source${sourceCount !== 1 ? 's' : ''}`;


        // Inline rename buttons (create once, reuse)
        const saveListItemRenameBtn = document.createElement('button');
        saveListItemRenameBtn.innerHTML = '<i class="fas fa-check"></i>';
        saveListItemRenameBtn.className = 'list-inline-btn save-list-item-rename-btn';
        saveListItemRenameBtn.title = 'Save Name';
        saveListItemRenameBtn.style.display = 'none';

        const cancelListItemRenameBtn = document.createElement('button');
        cancelListItemRenameBtn.innerHTML = '<i class="fas fa-times"></i>';
        cancelListItemRenameBtn.className = 'list-inline-btn cancel-list-item-rename-btn';
        cancelListItemRenameBtn.title = 'Cancel Rename';
        cancelListItemRenameBtn.style.display = 'none';

        // Handle click to navigate to project (ignore clicks on button/menu/editing title)
        itemElement.addEventListener('click', (e) => {
            if (e.target.closest('.list-options-btn') || e.target.closest('.list-options-menu') || e.target.closest('.list-inline-btn') || itemElement.classList.contains('editing')) {
                return; // Don't navigate if clicking controls
            }
            window.location.href = `/project/${projectData.id}`;
        });

        // Handle Options Button Click
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); // Prevent item click navigation
            // Close other open menus first
            document.querySelectorAll('.list-options-menu.active, .card-options-menu.active').forEach(menu => {
                if (menu !== optionsMenu) menu.classList.remove('active');
            });
            // Toggle current menu
            optionsMenu.classList.toggle('active');
        });

        // Handle Rename Button Click
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`List Rename action for project ${projectData.id}`);
            optionsMenu.classList.remove('active'); // Close menu

            // Start editing
            itemElement.classList.add('editing');
            titleElement.contentEditable = 'true';
            titleElement.dataset.originalTitle = titleElement.textContent; // Store original
            titleElement.focus();
            document.execCommand('selectAll', false, null); // Select text

            // Show inline save/cancel buttons
            titleColumn.appendChild(saveListItemRenameBtn);
            titleColumn.appendChild(cancelListItemRenameBtn);
            saveListItemRenameBtn.style.display = 'inline-flex';
            cancelListItemRenameBtn.style.display = 'inline-flex';
            optionsBtn.style.display = 'none'; // Hide options button while editing
        });

         // Handle Save Rename Click
        saveListItemRenameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newTitle = titleElement.textContent.trim();
            const originalTitle = titleElement.dataset.originalTitle;
            const projectIdToRename = itemElement.dataset.projectId;

            titleElement.contentEditable = 'false';
            itemElement.classList.remove('editing');
            saveListItemRenameBtn.style.display = 'none';
            cancelListItemRenameBtn.style.display = 'none';
            optionsBtn.style.display = ''; // Restore options button

            if (newTitle && newTitle !== originalTitle) {
                titleElement.textContent = newTitle; // Optimistic UI
                try {
                    let projects = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    const projectIndex = projects.findIndex(p => p.id === projectIdToRename);

                    if (projectIndex !== -1) {
                        projects[projectIndex].title = newTitle;
                         // Update modified date on rename
                        projects[projectIndex].modifiedDate = new Date().toISOString();
                        localStorage.setItem(storageKey, JSON.stringify(projects));
                        console.log(`Renamed project ${projectIdToRename} to "${newTitle}". Saved.`);
                         // Re-fetch and render to update date and potentially sort order
                        fetchAndRenderProjects();
                    } else {
                        console.error(`Could not find project ${projectIdToRename} to rename.`);
                        titleElement.textContent = originalTitle; // Revert UI
                    }
                } catch (error) {
                     console.error("Error saving rename:", error);
                     titleElement.textContent = originalTitle; // Revert UI on error
                     alert("Error saving rename.");
                }
            } else {
                 titleElement.textContent = originalTitle; // Revert if empty or unchanged
            }
             // Clean up buttons from DOM
            saveListItemRenameBtn.remove();
            cancelListItemRenameBtn.remove();
        });

        // Handle Cancel Rename Click
        cancelListItemRenameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            titleElement.textContent = titleElement.dataset.originalTitle; // Revert
            titleElement.contentEditable = 'false';
            itemElement.classList.remove('editing');
            saveListItemRenameBtn.style.display = 'none';
            cancelListItemRenameBtn.style.display = 'none';
            optionsBtn.style.display = ''; // Restore options button
             // Clean up buttons from DOM
            saveListItemRenameBtn.remove();
            cancelListItemRenameBtn.remove();
        });


        // Handle Delete Button Click
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectIdToDelete = itemElement.dataset.projectId;
            console.log(`List Delete button clicked for project: ${projectIdToDelete}`);
            if (projectIdToDelete) {
                 deleteProject(projectIdToDelete); 
            } else {
                console.error("Missing projectId for list deletion.");
            }
            optionsMenu.classList.remove('active'); // Close menu
        });

        projectListArea.appendChild(itemClone);
    }


    // MODIFIED: Function to render a single project card
    function renderProjectCard(projectData) {
        if (!projectListArea || !projectCardTemplate) {
            console.error("Project list area or card template not found.");
            return;
        }
        
        const cardClone = projectCardTemplate.content.cloneNode(true);
        const cardElement = cardClone.querySelector('.project-card');
        const titleElement = cardClone.querySelector('.card-title');
        const dateElement = cardClone.querySelector('.card-mod-date');
        const optionsBtn = cardClone.querySelector('.card-options-btn');
        const optionsMenu = cardClone.querySelector('.card-options-menu');
        const renameBtn = cardClone.querySelector('.rename-card-btn');
        const deleteBtn = cardClone.querySelector('.delete-card-btn');

        if (!cardElement || !titleElement || !dateElement || !optionsBtn || !optionsMenu || !renameBtn || !deleteBtn) {
            console.error("Missing card elements");
            return;
        }

        cardElement.dataset.projectId = projectData.id; 
        titleElement.textContent = projectData.title;
        const modDate = new Date(projectData.modifiedDate);
        dateElement.textContent = modDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        // Handle click to navigate (ignore clicks on controls or when editing)
        cardElement.addEventListener('click', (e) => {
            if (e.target.closest('.card-options-btn') || e.target.closest('.card-options-menu') || cardElement.classList.contains('editing')) {
                return; 
            }
            window.location.href = `/project/${projectData.id}`;
        });

        // Handle Options Button Click
        optionsBtn.addEventListener('click', (e) => {
            e.stopPropagation(); 
            document.querySelectorAll('.card-options-menu.active, .list-options-menu.active').forEach(menu => {
                 if (menu !== optionsMenu) menu.classList.remove('active');
            });
            optionsMenu.classList.toggle('active');
        });

        // --- Renaming Logic --- 

        // Function to finalize renaming (save or cancel)
        function finalizeRename(saveChanges) {
            const newTitle = titleElement.textContent.trim();
            const originalTitle = titleElement.dataset.originalTitle;
            const projectIdToRename = cardElement.dataset.projectId;

            // Always finish editing state
            titleElement.contentEditable = 'false';
            cardElement.classList.remove('editing');
            optionsBtn.style.display = ''; // Restore options button visibility
            delete titleElement.dataset.originalTitle;
             // Remove temporary listeners
            titleElement.removeEventListener('keydown', handleKeyDown);
            titleElement.removeEventListener('blur', handleBlur);

            if (saveChanges && newTitle && newTitle !== originalTitle) {
                // Save the changes
                titleElement.textContent = newTitle; // Optimistic UI
                try {
                    let projects = JSON.parse(localStorage.getItem(storageKey) || '[]');
                    const projectIndex = projects.findIndex(p => p.id === projectIdToRename);
                    if (projectIndex !== -1) {
                        projects[projectIndex].title = newTitle;
                        projects[projectIndex].modifiedDate = new Date().toISOString();
                        localStorage.setItem(storageKey, JSON.stringify(projects));
                        console.log(`Renamed project ${projectIdToRename} to "${newTitle}". Saved.`);
                        fetchAndRenderProjects(); // Re-render to update date/sort order
                    } else {
                        console.error(`Could not find project ${projectIdToRename} to rename.`);
                        titleElement.textContent = originalTitle; // Revert UI
                    }
                } catch (error) {
                    console.error("Error saving rename:", error);
                    titleElement.textContent = originalTitle; // Revert UI on error
                    alert("Error saving rename.");
                }
            } else {
                // Cancel or no changes made, revert to original
                titleElement.textContent = originalTitle || projectData.title; // Revert UI
            }
        }
        
        // Enter key handler
        function handleKeyDown(e) {
            if (e.key === 'Enter') {
                e.preventDefault(); // Prevent newline
                finalizeRename(true); // Save changes
            } else if (e.key === 'Escape') {
                 finalizeRename(false); // Cancel changes (revert)
            }
        }

        // Blur handler (clicking outside)
        function handleBlur() {
            // Use setTimeout to allow potential click on options button to register first
            // otherwise blur might fire before button click
            setTimeout(() => {
                 // Check if still editing (might have been finalized by Enter)
                 if (cardElement.classList.contains('editing')) {
                     const newTitle = titleElement.textContent.trim();
                     const originalTitle = titleElement.dataset.originalTitle;
                     // Save if title is different and not empty, otherwise cancel
                     finalizeRename(newTitle && newTitle !== originalTitle);
                 }
            }, 100); // Small delay
        }

        // Handle Rename Button Click in options menu
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`Card Rename action for project ${projectData.id}`);
            optionsMenu.classList.remove('active'); 
            
            // Start editing
            cardElement.classList.add('editing'); 
            titleElement.contentEditable = 'true';
            titleElement.dataset.originalTitle = titleElement.textContent; 
            titleElement.focus();
            document.execCommand('selectAll', false, null); 
            optionsBtn.style.display = 'none'; // Hide options btn while editing

            // Add temporary listeners for Enter and Blur
            titleElement.addEventListener('keydown', handleKeyDown);
            titleElement.addEventListener('blur', handleBlur);
        });
        
        // Handle Delete Button Click
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const projectIdToDelete = cardElement.dataset.projectId;
            console.log(`Card Delete button clicked for project: ${projectIdToDelete}`);
            if (projectIdToDelete) {
                 deleteProject(projectIdToDelete); 
            } else {
                console.error("Missing projectId for card deletion.");
            }
            optionsMenu.classList.remove('active'); // Close menu
        });

        projectListArea.appendChild(cardClone);

        // Hide placeholder if it exists and cards are now present
        if (homePlaceholder && projectListArea.children.length > 2) { // >2 because of header and template(s)
            homePlaceholder.style.display = 'none';
        }
    }

    // MODIFIED: Function to fetch, sort, and render projects
    function fetchAndRenderProjects() {
        console.log(`Fetching projects (Sort: ${currentSort}, View: ${currentView})`);
        
        let projects = JSON.parse(localStorage.getItem(storageKey) || '[]');

        // --- Sorting ---
        projects.sort((a, b) => {
            if (currentSort === 'recent') {
                // Sort by date descending (most recent first)
                const dateA = new Date(a.modifiedDate);
                const dateB = new Date(b.modifiedDate);
                if (dateB !== dateA) {
                    return dateB - dateA;
                }
            }
            // Secondary sort: Alphabetical by title (for both 'recent' and 'alpha')
            return a.title.localeCompare(b.title);
        });

        // --- Rendering ---
        // Clear existing items (keep header if list view)
        // Select only project cards and list items to remove
        projectListArea.querySelectorAll('.project-card, .project-list-item').forEach(el => el.remove());

        // Ensure placeholder is shown initially if needed
        if (projects.length === 0 && homePlaceholder) {
             homePlaceholder.style.display = 'block';
             if (projectListHeader && currentView === 'list') projectListHeader.style.display = 'none'; // Hide header if empty
        } else if (homePlaceholder) {
             homePlaceholder.style.display = 'none';
             if (projectListHeader && currentView === 'list') projectListHeader.style.display = 'flex'; // Show header if list view and not empty
        }


        if (projects.length > 0) {
             const renderFunction = currentView === 'list' ? renderProjectListItem : renderProjectCard;
             projects.forEach(renderFunction);
        }

        // Add listener to close menus when clicking outside
        document.addEventListener('click', closeAllOptionMenus, true); // Use capture phase
    }

    // NEW: Function to close all open option menus
    function closeAllOptionMenus(event) {
        // Check if the click was outside *any* options button or menu
         if (!event.target.closest('.card-options-btn') && !event.target.closest('.card-options-menu') && !event.target.closest('.list-options-btn') && !event.target.closest('.list-options-menu')) {
             document.querySelectorAll('.card-options-menu.active, .list-options-menu.active').forEach(menu => {
                 menu.classList.remove('active');
             });
              // Remove this specific listener after it runs once (or keep it if needed globally)
             // document.removeEventListener('click', closeAllOptionMenus, true); 
         }
    }


    // MODIFIED: Function to set the active view
    function setActiveView(viewType) {
         if (currentView === viewType) return; // No change needed
         currentView = viewType;
         console.log("Set view:", viewType);

         if (!projectListArea || !projectListHeader || !gridViewBtn || !listViewBtn) {
            console.error("Missing elements for view switching");
            return;
         }

         if(viewType === 'grid') {
            gridViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            projectListArea.classList.remove('project-list');
            projectListArea.classList.add('project-grid');
            projectListHeader.style.display = 'none'; // Hide list header
         } else { // list view
            gridViewBtn.classList.remove('active');
            listViewBtn.classList.add('active');
            projectListArea.classList.remove('project-grid');
            projectListArea.classList.add('project-list');
             // Show header only if there are projects
            const hasProjects = projectListArea.querySelectorAll('.project-list-item, .project-card').length > 0; // Check if items will be rendered
            projectListHeader.style.display = hasProjects ? 'flex' : 'none'; 
         }
         // Re-render the content in the new view format
         fetchAndRenderProjects(); 
    }

    // Add View Button Listeners
    if (gridViewBtn) gridViewBtn.addEventListener('click', () => setActiveView('grid'));
    if (listViewBtn) listViewBtn.addEventListener('click', () => setActiveView('list'));

    // Add Sort Dropdown Listener
    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            const newSort = e.target.value;
            if (currentSort !== newSort) {
                currentSort = newSort;
                console.log(`Sort criteria changed to: ${currentSort}`);
                fetchAndRenderProjects(); // Re-fetch and render with new sort
            }
        });
    }
    
    // Initial setup
    const savedView = localStorage.getItem('projectViewType') || 'grid'; // Optional: remember view preference
    const savedSort = localStorage.getItem('projectSortType') || 'recent'; // Optional: remember sort
    currentView = savedView;
    currentSort = savedSort;
    if(sortDropdown) sortDropdown.value = currentSort;

    // Set initial class based on saved/default view BEFORE first render
    if (currentView === 'list') {
         if (projectListArea) projectListArea.classList.add('project-list');
         if (listViewBtn) listViewBtn.classList.add('active');
         if (gridViewBtn) gridViewBtn.classList.remove('active');
    } else {
         if (projectListArea) projectListArea.classList.add('project-grid');
         if (gridViewBtn) gridViewBtn.classList.add('active');
         if (listViewBtn) listViewBtn.classList.remove('active');
    }
    if (projectListHeader) projectListHeader.style.display = 'none'; // Ensure header hidden initially

    fetchAndRenderProjects(); // Fetch and render project list initially using currentSort and currentView

    // Add global listener to close menus when clicking outside
    // Moved inside fetchAndRenderProjects to ensure it's added after items exist

}

function setupProjectViewListeners(projectId) {
    console.log("Setting up NEW project view listeners for:", projectId);
    const storageKey = 'lairaProjects'; // Key for localStorage
    let allProjects = JSON.parse(localStorage.getItem(storageKey) || '[]');
    let currentProject = allProjects.find(p => p.id === projectId);
    if (!currentProject) {
        alert('Error: Project not found!');
        window.location.href = '/'; 
        return;
    }
    console.log("Loaded current project data:", currentProject);
    currentProject.notes = currentProject.notes || [];
    currentProject.sources = currentProject.sources || [];
    currentProject.chatHistory = currentProject.chatHistory || [];
    currentProject.settings = currentProject.settings || { temperature: 0.2, max_output_tokens: 8192, top_p: 0.95, top_k: 40 };
    currentProject.title = currentProject.title || projectId;

    // --- References to DOM Elements (Keep existing references) --- 
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
    const clearChatBtn = document.getElementById('clear-chat-btn'); // Get the Clear Chat button
    const stopButton = document.getElementById('stop-button'); // Get the Stop button
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

    // --- Local State (Initialize from loaded project data) --- 
    let notesData = {}; // Still use object for quick lookup by id in UI functions
    let nextNoteId = 1; // Need to determine the next ID based on loaded notes
    currentProject.notes.forEach(note => {
        notesData[note.id] = note; // Populate local lookup
        // Determine the highest existing numeric ID part
        const idNum = parseInt(note.id.split('-')[1]);
        if (!isNaN(idNum) && idNum >= nextNoteId) {
            nextNoteId = idNum + 1;
        }
    });
    console.log("Initialized notesData:", notesData, "Next ID:", nextNoteId);
    
    let currentlyViewingNoteId = null;
    let isPinning = false; // Flag to prevent double pinning

    // --- Helper Function to Save Project --- 
    function saveCurrentProject() {
        // Update modified date
        currentProject.modifiedDate = new Date().toLocaleDateString();

        // Find index of current project in the main list
        const projectIndex = allProjects.findIndex(p => p.id === projectId);
        if (projectIndex !== -1) {
            // Update the project in the main list
            allProjects[projectIndex] = currentProject;
            // Save the entire updated list back to localStorage
            localStorage.setItem(storageKey, JSON.stringify(allProjects));
            console.log("Project saved to localStorage:", currentProject);
        } else {
            console.error("Could not find project in list to save.");
        }
    }

    // --- Populate UI from Loaded Data --- 

    // Populate Project Title
    if (projectTitleDisplay) {
        projectTitleDisplay.textContent = currentProject.title;
        document.title = `Laira - ${currentProject.title}`; // Update page title
    }

    // Populate Notes List
    if (notesList) {
        // MODIFIED: Clear only actual note items, preserving the placeholder li
        notesList.querySelectorAll('li:not(#notes-list-placeholder)').forEach(item => item.remove());
        // notesList.innerHTML = ''; // Old way - cleared placeholder too
        Object.values(notesData).forEach(note => renderNoteListItem(note));
    }
    checkNotesList(); // Update placeholder visibility based on loaded notes

    // Populate Sources List
    if (sourceList) {
        sourceList.innerHTML = ''; // Clear any defaults
        currentProject.sources.forEach(source => {
            // Assuming addSourceToList handles adding the UI element
            // We might need a different function like renderSourceItem
            addSourceToList(source.filename, source.status); // Pass status to UI function
            // TODO: updateSourceListItemStatus based on source.status if it exists
        });
    }
    checkSourceList(); // Update placeholder & chat state

    // Populate Chat History (Example - needs refinement)
    if (chatArea) {
        chatArea.innerHTML = ''; // Clear default placeholder if history exists
        if (currentProject.chatHistory.length > 0) {
             // Pass the existing msg.id when rendering history
             currentProject.chatHistory.forEach(msg => addMessageToChat(msg.text, msg.sender, msg.id)); 
        } else {
             // If no history, ensure the placeholder is visible (handled by enable/disable chat) 
        }
    }

    // Populate Settings Modal (Example - needs refinement)
    if (settingsForm) {
        // TODO: Load settings from currentProject.settings and set form values
        console.log("TODO: Load settings into modal:", currentProject.settings);
        // Example:
        // if (temperatureSlider) temperatureSlider.value = currentProject.settings.temperature || 0.2;
        // Update slider displays as well
    }

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

    // MODIFIED: Save uploaded file info to project data
    function uploadFile(file) {
         console.log(`Uploading: ${file.name}`);
         // Add to UI list immediately (optimistic)
         const sourceData = { filename: file.name, status: 'uploading' }; // Basic data
         addSourceToList(sourceData.filename, sourceData.status); // Pass status to UI function

         // Add to project data and save immediately
         currentProject.sources.push(sourceData);
         saveCurrentProject(); 

         // Simulate upload process & update status 
         // TODO: Replace setTimeout with actual fetch API call to backend
         setTimeout(() => {
             // Find the source in the project data to update its status
             const uploadedSource = currentProject.sources.find(s => s.filename === file.name);
             if (uploadedSource) {
                 uploadedSource.status = 'success'; // Or 'error'
                 saveCurrentProject(); // Save the status update
                 updateSourceListItemStatus(file.name, true); // Update UI based on final status
             } else {
                 console.error("Could not find source in project data after simulated upload:", file.name);
                 updateSourceListItemStatus(file.name, false); // Reflect error in UI
             }
             checkSourceList(); // Update UI based on sources count/status
         }, 1500); // Simulate 1.5 second upload
    }
    
    // MODIFIED: Accept status for UI display
    function addSourceToList(filename, status = null) {
        if (!sourceList) return;
        if (sourceList.querySelector(`li[data-filename="${CSS.escape(filename)}"]`)) return;
        const listItem = document.createElement('li');
        listItem.dataset.filename = filename;
        // Add icon container
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

        // Update status text if provided
        const statusSpan = listItem.querySelector('.source-status');
        if (statusSpan) {
            if (status === 'uploading') {
                statusSpan.textContent = 'Uploading...';
            } else if (status === 'success') {
                 statusSpan.remove(); // Remove status if successful
            } else if (status === 'error') {
                 statusSpan.textContent = 'Failed';
                 listItem.style.opacity = '0.5';
                 listItem.title = "Upload failed";
            } else {
                statusSpan.remove(); // Remove status if null/undefined/other
            }
        }

         // Update icon based on extension
         const iconEl = listItem.querySelector('.source-icon i');
         if (filename.toLowerCase().endsWith('.pdf')) iconEl.className = 'fas fa-file-pdf';
         
         // Add delete listener
         const deleteIcon = listItem.querySelector('.source-delete-icon');
         if (deleteIcon) {
             deleteIcon.addEventListener('click', handleDeleteSource);
         }
         
         sourceList.appendChild(listItem);
         checkSourceList(); // Update placeholder and chat input state
    }

    // MODIFIED: Update UI based on status (called after upload attempt)
    function updateSourceListItemStatus(filename, success) {
         const item = sourceList?.querySelector(`li[data-filename="${CSS.escape(filename)}"]`);
         if (!item) return;
         const statusEl = item.querySelector('.source-status');
         
         if (success) {
             if (statusEl) statusEl.remove(); // Remove status indicator on success
             item.style.opacity = '1';
             item.title = ''; // Clear any error title
         } else {
             if (statusEl) { 
                 statusEl.textContent = "Failed"; 
             } else { 
                 // If status element was already removed, maybe add it back?
                 // Or just ensure the visual state indicates failure:
                 console.warn("Status element missing on failed upload for:", filename);
             }
             item.style.opacity = '0.5';
             item.title = "Upload failed"; 
         }
    }

    // MODIFIED: Delete source from project data
    function handleDeleteSource(event) {
         const listItem = event.currentTarget.closest('li');
         const filename = listItem?.dataset.filename;
         if (!filename || !confirm(`Are you sure you want to delete source "${filename}"?`)) return;
         console.log(`Deleting source ${filename}`);

         // Remove from project data
         const sourceIndex = currentProject.sources.findIndex(s => s.filename === filename);
         if (sourceIndex !== -1) {
             currentProject.sources.splice(sourceIndex, 1);
             saveCurrentProject(); // Persist the change
             console.log(`Removed source ${filename} from project data.`);
         } else {
             console.warn(`Source ${filename} not found in project data.`);
         }

         // Remove from UI
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

    // --- Chat Message Handling --- 
    let currentAbortController = null; // To handle stopping the fetch request

    function addMessageToChat(text, sender, messageId = null, sources = null) {
        if (!chatArea) return;

        const placeholder = chatArea.querySelector('#chat-placeholder');
        if (placeholder) placeholder.remove();

        const messageElement = document.createElement('div');
        // Use provided messageId or generate a unique one
        const uniqueMsgId = messageId || `msg-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
        messageElement.dataset.messageId = uniqueMsgId;
        messageElement.classList.add('message', sender === 'user' ? 'user-message' : 'bot-message');

        // --- Normal Message View ---
        const messageDisplay = document.createElement('div');
        messageDisplay.classList.add('message-display'); // Container for content + actions

        const messageContent = document.createElement('div');
        messageContent.classList.add('message-content');
        // let formattedText = text.replace(/\\*\\*(.*?)\\*\\*/g, '<strong>$1</strong>')
        //                         .replace(/\\*(.*?)\\*/g, '<em>$1</em>');
        // messageContent.innerHTML = formattedText; 
        messageContent.innerHTML = processMessageText(text); // USE NEW FUNCTION
        messageDisplay.appendChild(messageContent);

        const messageActions = document.createElement('div');
        messageActions.classList.add('message-actions');
        
        // Simplified: Add all potential buttons, control visibility later if needed
        actionsHTML = `
            <button class="action-btn edit-msg-btn" title="Edit Message"><i class="fas fa-pencil-alt"></i></button>
            <button class="action-btn pin-message-btn" title="Pin to Notes" data-message-text="${encodeURIComponent(text)}"><i class="fas fa-thumbtack"></i></button>
            <button class="action-btn delete-msg-btn" title="Delete Message"><i class="fas fa-trash-alt"></i></button>
        `;

        messageActions.innerHTML = actionsHTML;

        // Hide edit/pin based on sender AFTER adding HTML
        if (sender !== 'user') {
            const editBtn = messageActions.querySelector('.edit-msg-btn');
            if (editBtn) editBtn.style.display = 'none';
        }
        if (sender !== 'bot') {
             const pinBtn = messageActions.querySelector('.pin-message-btn');
             if (pinBtn) pinBtn.style.display = 'none';
        }

        messageDisplay.appendChild(messageActions); // Add actions to display container

        // --- Edit View (Initially Hidden) ---
        const editView = document.createElement('div');
        editView.classList.add('message-edit-view');
        editView.style.display = 'none'; // Hide initially
        editView.innerHTML = `
            <textarea class="edit-textarea" rows="1"></textarea>
            <div class="edit-controls">
                <button class="edit-cancel-btn">Cancel</button>
                <button class="edit-resubmit-btn">Resubmit</button>
            </div>
        `;

        // --- Append Views to Main Element ---
        messageElement.appendChild(messageDisplay);
        if (sender === 'user') { // Only add edit view structure for user messages
             messageElement.appendChild(editView);
        }

        chatArea.appendChild(messageElement);
        chatArea.scrollTop = chatArea.scrollHeight;

        // Add dynamic height adjustment to edit textarea
        const editTextArea = editView.querySelector('.edit-textarea');
        if (editTextArea) {
            editTextArea.addEventListener('input', () => adjustTextareaHeight(editTextArea));
        }

        return messageElement; // Return the main message element
    }

    // Modify adjustTextareaHeight to accept an element
    function adjustTextareaHeight(element = null) {
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

    // NEW: Process message text for basic formatting
    function processMessageText(text) {
        if (typeof text !== 'string') return ''; // Handle non-string input
        
        // 1. Escape HTML to prevent injection
        const div = document.createElement('div');
        div.textContent = text; 
        let processedText = div.innerHTML;

        // 2. Convert newlines to <br> tags AFTER escaping
        processedText = processedText.replace(/\n/g, '<br>');

        // 3. Apply safe formatting replacements
        processedText = processedText
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') // **bold**
            .replace(/\*(.*?)\*/g, '<em>$1</em>');     // *italic*
            // Add more rules here (e.g., code blocks, links) later if needed

        return processedText;
    }

    // Modified sendMessage to accept optional text (for resubmit)
    function sendMessage(textToSend = null) {
        // Use provided text or get from input
        const rawText = textToSend !== null ? textToSend : userInput.value;
        // Remove leading/trailing blank lines then trim surrounding whitespace
        const question = rawText.replace(/^\s*\n+|\n+\s*$/g, '').trim(); 

        if (!question) {
            // If called from normal input (textToSend is null) and it's empty after cleaning, clear the visual input
            if (textToSend === null && userInput) {
                 userInput.value = ''; 
                 adjustTextareaHeight(userInput);
            }
            return; // Don't send empty messages
        }

        // If called via normal input (not resubmit), clear the main input visually
        if (textToSend === null && userInput) {
             userInput.value = '';
             adjustTextareaHeight(userInput); 
        }

        // *** Generate the unique ID for the user message HERE ***
        const userMessageId = `msg-${Date.now()}-user-${Math.random().toString(36).substring(2, 9)}`; // Make it unique

        // Add message to UI, passing the generated ID
        const messageElement = addMessageToChat(question, 'user', userMessageId); 
        console.log(`[sendMessage] Added user message to UI with ID: ${userMessageId}`);

        // Add user message to history using the SAME ID
        const userMessageData = { id: userMessageId, text: question, sender: 'user' }; 
        currentProject.chatHistory.push(userMessageData);
        console.log(`[sendMessage] Pushed user message to history with ID: ${userMessageId}`);
        saveCurrentProject(); // Save after user message

        // Add placeholder for bot response
        const placeholderId = `msg-placeholder-${Date.now()}`;
        // Add a specific class for the thinking state
        const placeholderElement = addMessageToChat("Laira is thinking...", 'bot', placeholderId);
        if (placeholderElement) placeholderElement.classList.add('message-thinking'); 

        // Disable Clear Chat, Hide Send, Show Stop, Disable Input
        if (clearChatBtn) clearChatBtn.disabled = true;
        if (sendButton) sendButton.style.display = 'none';
        if (stopButton) stopButton.style.display = 'inline-flex';
        if (userInput) userInput.disabled = true; 

        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // Simulate backend call (or actual fetch)
        console.log(`Sending to backend (project ${projectId}): ${question}`);
        setTimeout(() => {
             if (signal.aborted) {
                 console.log("Request aborted before response received.");
                 return; 
             }
            const botResponseText = `Laira's simulated answer to: "${question}"`;
            const finalPlaceholderElement = chatArea.querySelector(`[data-message-id="${placeholderId}"]`);
            if (finalPlaceholderElement) {
                const textSpan = finalPlaceholderElement.querySelector('.message-content'); 
                const pinButton = finalPlaceholderElement.querySelector('.pin-message-btn'); // Find the pin button
                if (textSpan) {
                    textSpan.innerHTML = processMessageText(botResponseText);
                }
                // *** Update the pin button's data attribute ***
                if (pinButton) {
                    pinButton.dataset.messageText = encodeURIComponent(botResponseText);
                    console.log(`[sendMessage] Updated pin button data for ${placeholderId}`);
                }
                 // Remove the thinking class to potentially show actions via CSS
                 finalPlaceholderElement.classList.remove('message-thinking');
            } else {
                 // If placeholder somehow disappeared, add as a new message (actions will show by default)
                 addMessageToChat(botResponseText, 'bot');
            }
            currentProject.chatHistory.push({ text: botResponseText, sender: 'bot' });
            saveCurrentProject(); 

            // Re-enable UI
            if (clearChatBtn) clearChatBtn.disabled = false;
            if (sendButton) sendButton.style.display = ''; 
            if (stopButton) stopButton.style.display = 'none';
            if (userInput) userInput.disabled = false; 
            currentAbortController = null; 
        }, 2500); 
    }

    // --- Event Listeners ---

    // Stop Button Listener
    if (stopButton) {
        stopButton.addEventListener('click', () => {
            if (currentAbortController) {
                console.log("Stop button clicked, aborting request...");
                currentAbortController.abort(); // Signal the abort
                currentAbortController = null; // Reset immediately

                // Manually clean up UI states as the fetch .finally() might not run reliably on abort
                if (clearChatBtn) clearChatBtn.disabled = false;
                if (sendButton) sendButton.style.display = '';
                if (stopButton) stopButton.style.display = 'none';
                if (userInput) userInput.disabled = false;

                // Remove the "Laira is thinking..." placeholder
                const placeholder = chatArea.querySelector('.message-thinking[data-message-id^="msg-placeholder-"]');
                placeholder?.remove(); 
            }
        });
    } else { console.warn("Stop button not found!"); }


    // --- Send Message Listeners ---
    // Ensure these call sendMessage() without arguments
    if (sendButton && userInput) {
        sendButton.addEventListener('click', () => { sendMessage(); }); // No args
        userInput.addEventListener('keypress', (e) => { 
            if (e.key === 'Enter' && !e.shiftKey) { 
                e.preventDefault(); 
                sendMessage(); // No args
            } 
        });
        userInput.addEventListener('input', () => adjustTextareaHeight(userInput)); 
    } else {
        console.warn("Send button or user input element not found!");
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
                currentProject.title = newTitle;
                saveCurrentProject(); 
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
        noteEditorTitle.textContent = 'New Note';
        noteEditorBody.value = '';
        notesListView.style.display = 'none';
        noteEditorView.style.display = 'flex'; 
        noteEditorTitle.focus();
    }

    function showNotesList() {
        if (!notesListView || !noteEditorView) return;
        noteEditorView.style.display = 'none';
        notesListView.style.display = 'block';
        checkNotesList(); 
    }

    // MODIFIED: saveNote (from editor view)
    function saveNote() {
        if (!noteEditorTitle || !noteEditorBody) return;
        const title = noteEditorTitle.textContent.trim();
        const body = noteEditorBody.value.trim();
        if (!title && !body) { 
            console.log("Note empty, discarding.");
            showNotesList(); return; 
        }
        const finalTitle = title || "Untitled Note"; 
        const newNoteId = `note-${nextNoteId++}`;
        const newNoteData = { id: newNoteId, title: finalTitle, body: body };
        
        // Update local cache
        notesData[newNoteId] = newNoteData;
        
        // Update project data
        currentProject.notes.push(newNoteData);
        saveCurrentProject(); // Save project
        
        // Add to UI list
        renderNoteListItem(newNoteData); 
        
        showNotesList(); // Switch back
    }

    // deleteNote (from editor view - placeholder)
    function deleteNote() { 
        if (!confirm("Are you sure you want to discard this new note?")) return;
        console.log("Discarding new note (editor view).");
        showNotesList(); // Just switch back without saving
    }

    // Creates the UI element from note data, DOES NOT save.
    function renderNoteListItem(noteData) {
         if (!notesList) {
            console.error("[renderNoteListItem] Error: notesList element is null or undefined.");
            return;
         }
         if (!noteData || !noteData.id) {
            console.warn("[renderNoteListItem] Warning: Invalid noteData or missing note ID.", noteData);
             return;
         }
         // Check if item already exists (optional, but good practice)
         if (notesList.querySelector(`li[data-note-id="${noteData.id}"]`)) {
             console.warn(`[renderNoteListItem] Note item ${noteData.id} already exists in the DOM.`);
             return; 
         }

         console.log(`[renderNoteListItem] Creating list item for note ID: ${noteData.id}`); // DEBUG LOG
         const listItem = document.createElement('li');
         listItem.classList.add('note-list-item');
         listItem.dataset.noteId = noteData.id;
         // Add icon container
         listItem.innerHTML = `
            <div class="item-icon-container">
                 <span class="note-icon"><i class="fas fa-sticky-note"></i></span>
                 <button class="note-delete-btn" title="Delete Note"><i class="fas fa-trash-alt"></i></button>
            </div>
            <span class="note-item-title"></span>
         `;
         const titleSpan = listItem.querySelector('.note-item-title');
         if (titleSpan) titleSpan.textContent = noteData.title || "Untitled Note";
         
         console.log("[renderNoteListItem] About to append item to notesList:", notesList); // DEBUG LOG
         notesList.appendChild(listItem);
         console.log("[renderNoteListItem] Item appended. Current notesList children count:", notesList.children.length); // DEBUG LOG
    }

    // MODIFIED: deleteNoteFromList (from list item delete button)
    function deleteNoteFromList(noteId) {
        const listItem = notesList?.querySelector(`li[data-note-id="${noteId}"]`);
        if (listItem) {
            listItem.remove(); // Remove from UI

            // Remove from local cache
            const deletedFromCache = delete notesData[noteId]; 
            if (!deletedFromCache) { console.warn(`Note ${noteId} not found in notesData cache.`); }

            // Remove from project data and save
            const noteIndex = currentProject.notes.findIndex(n => n.id === noteId);
            if (noteIndex !== -1) {
                currentProject.notes.splice(noteIndex, 1);
                saveCurrentProject(); // Persist the change
                console.log(`Deleted note ${noteId} from project data`);
            } else {
                 console.warn(`Note ${noteId} not found in currentProject.notes to delete.`);
            }
            checkNotesList(); // Update placeholder
        } else {
            console.warn(`Could not find list item for note ID: ${noteId}`);
        }
    }

    // showNoteViewModal (ensure reads from notesData) - NO CHANGE FROM PREVIOUS EDIT
    function showNoteViewModal(noteId) {
        const note = notesData[noteId]; 
        if (!note || !viewNoteModal || !viewNoteTitle || !viewNoteBodyTextarea) { console.error("Missing note data/modal elements for:", noteId); return; }
        currentlyViewingNoteId = noteId;
        viewNoteTitle.textContent = note.title;
        viewNoteBodyTextarea.value = note.body;
        showModal(viewNoteModal);
    }

    // MODIFIED: saveNoteChanges (from view modal)
    function saveNoteChanges() {
         if (!currentlyViewingNoteId || !viewNoteTitle || !viewNoteBodyTextarea) { return; }
         const noteId = currentlyViewingNoteId;
         const newTitle = viewNoteTitle.textContent.trim() || "Untitled Note";
         const newBody = viewNoteBodyTextarea.value.trim();
         
         // Update local cache FIRST
         if (notesData[noteId]) {
             notesData[noteId].title = newTitle;
             notesData[noteId].body = newBody;
             console.log(`Updated note ${noteId} in local cache:`, notesData[noteId]);

            // Find and update data store in currentProject.notes array
            const noteToUpdate = currentProject.notes.find(n => n.id === noteId);
            if (noteToUpdate) {
                noteToUpdate.title = newTitle;
                noteToUpdate.body = newBody;
                saveCurrentProject(); // Persist the change
                console.log(`Updated note ${noteId} in project data.`);

                // Update list item display in UI
                const listItem = notesList?.querySelector(`li[data-note-id="${noteId}"]`);
                const titleSpan = listItem?.querySelector('.note-item-title');
                if (titleSpan) { titleSpan.textContent = newTitle; }
                
            } else { 
                console.error("Consistency error: Note found in cache but not in project data:", noteId); 
                // Attempt recovery: Add the note from cache back to project data
                currentProject.notes.push(notesData[noteId]);
                saveCurrentProject();
                console.log(`Recovered note ${noteId} by adding from cache to project data.`);
            }
         } else { 
              console.error("Note ID not found in local cache notesData during save:", noteId); 
              // Cannot recover if not in cache
         }
         hideModal(viewNoteModal);
         currentlyViewingNoteId = null;
    }

    function checkNotesList() { 
        const hasNotes = currentProject && currentProject.notes && currentProject.notes.length > 0;
        const placeholderElement = document.getElementById('notes-list-placeholder'); // Get the placeholder li
        
        if (placeholderElement) {
            placeholderElement.style.display = hasNotes ? 'none' : 'block'; // Show/hide the placeholder li
        } else {
            console.error("[checkNotesList] Placeholder element (#notes-list-placeholder) NOT FOUND");
        }

        // Ensure the main notesList UL is always visible (handled by default CSS or initial style)
        // No need to manage notesList display here anymore
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
    } else { console.warn("Save Note button (editor) not found."); }
    if (deleteNoteBtn) {
        deleteNoteBtn.addEventListener('click', deleteNote);
    } else { console.warn("Delete Note button (editor) not found."); }

    // NEW: Add listener for the Save Changes button in the VIEW modal
    if (saveViewNoteBtn) {
        saveViewNoteBtn.addEventListener('click', saveNoteChanges);
    } else {
        console.warn("Save Changes button (view modal) not found.");
    }

    // Event delegation for clicks within the notes list
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

    // NEW: Event delegation for chat message actions (edit, delete, pin)
    if (chatArea) {
        chatArea.addEventListener('click', (e) => {
            const messageElement = e.target.closest('.message');
            if (!messageElement) return;

            const messageId = messageElement.dataset.messageId;

            // Handle Delete Button
            if (e.target.closest('.delete-msg-btn')) {
                e.stopPropagation();
                if (confirm('Are you sure you want to delete this message?')) {
                     console.log(`Deleting message: ${messageId}`);
                     // Find and remove from history
                     const msgIndex = currentProject.chatHistory.findIndex(msg => msg.id === messageId);
                     if (msgIndex !== -1) {
                         currentProject.chatHistory.splice(msgIndex, 1);
                         saveCurrentProject();
                     } else {
                         // If not found by ID, maybe it was the placeholder?
                         // Or just log a warning if using unique IDs
                         console.warn("Message not found in history for deletion:", messageId);
                     }
                     messageElement.remove();
                     // Check if chat is now empty to show placeholder
                     checkChatAreaPlaceholder(); 
                }
            }
            // Handle Pin Button
            else if (e.target.closest('.pin-message-btn')) {
                e.stopPropagation();
                if (isPinning) return; // Prevent double execution
                isPinning = true; // Set flag

                const pinButton = e.target.closest('.pin-message-btn');
                const encodedText = pinButton.dataset.messageText;
                if (!encodedText) {
                    console.error("Could not find message text on pin button.");
                    isPinning = false; // Reset flag on error
                    return;
                }
                const messageText = decodeURIComponent(encodedText);

                // Generate Title (First sentence or ~50 chars)
                const sentences = messageText.split(/[.!?]/);
                let noteTitle = sentences[0]?.trim();
                if (!noteTitle || noteTitle.length > 60) {
                     noteTitle = messageText.substring(0, 50).trim() + (messageText.length > 50 ? '...' : '');
                }
                if (!noteTitle) noteTitle = "Pinned Note";

                const noteBody = messageText;
                const noteId = `note-${nextNoteId++}`;
                const newNoteData = { id: noteId, title: noteTitle, body: noteBody };

                // --- DEBUG LOGGING --- 
                console.log("Pinning Debug:", {
                    encodedText: encodedText,
                    decodedMessageText: messageText,
                    generatedTitle: noteTitle,
                    noteBody: noteBody,
                    newNoteData: newNoteData
                });
                // --- END DEBUG LOGGING ---

                console.log("Pinning message as new note:", newNoteData);

                 notesData[noteId] = newNoteData;
                 currentProject.notes.push(newNoteData);
                 saveCurrentProject();
                 renderNoteListItem(newNoteData);
                 checkNotesList();
                 showTemporaryStatus("Note created from pinned message.", false, 2500);
                 
                 // Reset flag after a short delay
                 setTimeout(() => { isPinning = false; }, 300); 
            }
            // Handle Edit Button
            else if (e.target.closest('.edit-msg-btn')) {
                e.stopPropagation();
                const messageDisplay = messageElement.querySelector('.message-display');
                const editView = messageElement.querySelector('.message-edit-view');
                const contentElement = messageDisplay.querySelector('.message-content');
                const editTextArea = editView.querySelector('.edit-textarea');

                if (messageDisplay && editView && contentElement && editTextArea) {
                    // Get original text (might need to reverse formatting or get from history)
                    // For now, let's get it from the current content, assuming simple text
                    // A better way: find the message in currentProject.chatHistory by ID
                    const originalMessage = currentProject.chatHistory.find(msg => msg.id === messageId);
                    const originalText = originalMessage ? originalMessage.text : contentElement.textContent; // Fallback
                    
                    editTextArea.value = originalText;
                    messageDisplay.style.display = 'none';
                    editView.style.display = 'block';
                    adjustTextareaHeight(editTextArea);
                    editTextArea.focus();
                }
            }
            // Handle Edit Cancel Button
            else if (e.target.closest('.edit-cancel-btn')) {
                e.stopPropagation();
                const messageDisplay = messageElement.querySelector('.message-display');
                const editView = messageElement.querySelector('.message-edit-view');
                if (messageDisplay && editView) {
                    editView.style.display = 'none';
                    messageDisplay.style.display = ''; // Revert to default display
                }
            }
            // Handle Edit Resubmit Button (Treat as New Message)
            else if (e.target.closest('.edit-resubmit-btn')) {
                e.stopPropagation();
                const editTextArea = messageElement.querySelector('.edit-textarea');
                const newText = editTextArea.value.trim();
                
                // Find elements needed to close the edit view
                const messageDisplay = messageElement.querySelector('.message-display');
                const editView = messageElement.querySelector('.message-edit-view');

                if (newText && messageDisplay && editView) {
                    console.log(`%c[Resubmit as New] Original ID: ${messageId}, New Text: "${newText}"`, 'color: #BA55D3; font-weight: bold;'); // Medium Orchid color
                    
                    // 1. Revert the original message's UI back to display view
                    editView.style.display = 'none';
                    messageDisplay.style.display = ''; 
                    console.log('[Resubmit as New] Reverted original message UI for ID:', messageId);

                    // --- No history or UI element removal --- 

                    // 2. Call sendMessage with the new text
                    // This will add the message as NEW to UI/history and trigger the backend call
                    console.log('%c[Resubmit as New] Calling sendMessage with new text...%c', 'color: #BA55D3; font-weight: bold;', 'color: default;');
                    sendMessage(newText);
                         
                } else {
                     // Handle cases where elements might be missing or text is empty
                     if (!newText) {
                        console.error("[Resubmit as New Error] New text is empty.", { messageId });
                     } else {
                         console.error("[Resubmit as New Error] Could not find messageDisplay or editView for original message.", { messageId });
                         // Attempt to revert UI anyway if possible
                         if (editView) editView.style.display = 'none';
                         if (messageDisplay) messageDisplay.style.display = '';
                     }
                }
            }
        });
    }

    // Placeholder for checking if chat area is empty and needs placeholder
    function checkChatAreaPlaceholder() {
        if (chatArea && chatPlaceholder) {
            const hasMessages = chatArea.querySelector('.message') !== null;
            chatPlaceholder.style.display = hasMessages ? 'none' : 'flex';
            chatArea.style.justifyContent = hasMessages ? 'flex-start' : 'center';
        }
    }

    // NEW Function to regenerate response based on edited history
    function regenerateResponseFrom() { // REMOVED startIndex parameter
        console.log(`%c[Regenerate Start]%c Regenerating response using current history.`, 'color: green; font-weight: bold;', 'color: default;');
        
        // Get the relevant history slice (the entire current history)
        const historyForRequest = [...currentProject.chatHistory];
        console.log('[Regenerate] Copied history for request:', JSON.parse(JSON.stringify(historyForRequest)));
        
        if (historyForRequest.length === 0) {
            console.error("[Regenerate Error] Cannot regenerate response from empty history.");
            return;
        }

        // Add placeholder for bot response
        const placeholderId = `msg-placeholder-${Date.now()}`;
        addMessageToChat("Laira is thinking...", 'bot', placeholderId);

        // Disable Clear Chat, Hide Send, Show Stop, Disable Input
        if (clearChatBtn) clearChatBtn.disabled = true;
        if (sendButton) sendButton.style.display = 'none';
        if (stopButton) stopButton.style.display = 'inline-flex';
        if (userInput) userInput.disabled = true;

        currentAbortController = new AbortController();
        const signal = currentAbortController.signal;

        // Simulate backend call with the history slice
        console.log(`[Regenerate] Sending current history to backend. Last question: "${historyForRequest[historyForRequest.length - 1].text}"`); 
        setTimeout(() => {
            console.log('[Regenerate] Inside setTimeout callback.');
            if (signal.aborted) {
                 console.log("[Regenerate] Regeneration request aborted.");
                 return; 
             }

            const botResponseText = `Laira's REGENERATED answer to: "${historyForRequest[historyForRequest.length - 1].text}"`;
            console.log(`[Regenerate] Simulated response received: "${botResponseText}"`);
            
            // Update placeholder
            const placeholderElement = chatArea.querySelector(`[data-message-id="${placeholderId}"]`);
            if (placeholderElement) {
                 const textSpan = placeholderElement.querySelector('.message-content') || placeholderElement; // Target content div
                 const pinButton = placeholderElement.querySelector('.pin-message-btn'); // Find the pin button
                 if (textSpan) {
                     textSpan.innerHTML = processMessageText(botResponseText); // Use the function
                 }
                 // *** Update the pin button's data attribute ***
                 if (pinButton) {
                     pinButton.dataset.messageText = encodeURIComponent(botResponseText);
                     console.log(`[regenerateResponseFrom] Updated pin button data for ${placeholderId}`);
                 }
            } else {
                 addMessageToChat(botResponseText, 'bot');
            }

            // Add bot response to the main history
            const botResponseData = { text: botResponseText, sender: 'bot' }; // No ID needed here?
            currentProject.chatHistory.push(botResponseData);
            console.log('[Regenerate] History AFTER adding bot response:', JSON.parse(JSON.stringify(currentProject.chatHistory)));

            // Save the final history
            console.log('[Regenerate] Saving project AFTER adding bot response...');
            saveCurrentProject();

            // Re-enable UI
            console.log('[Regenerate] Re-enabling UI.');
            if (clearChatBtn) clearChatBtn.disabled = false;
            if (sendButton) sendButton.style.display = '';
            if (stopButton) stopButton.style.display = 'none';
            if (userInput) userInput.disabled = false;
            currentAbortController = null;

        }, 2000); // Simulate delay

        // TODO: Replace setTimeout with actual fetch call using historyForRequest
        /*
        fetch(`/ask/${projectId}`, { 
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' }, 
            body: JSON.stringify({ question: editedQuestion, history: historyForRequest }), // Send history slice
            signal: signal
        })
        .then(...) // Handle response, update placeholder
        .catch(...) // Handle errors
        .finally(() => { // Re-enable UI 
            if (clearChatBtn) clearChatBtn.disabled = false;
            if (sendButton) sendButton.style.display = '';
            if (stopButton) stopButton.style.display = 'none';
            if (userInput) userInput.disabled = false;
            currentAbortController = null;
        });
        */
    }

    // Initial check for notes placeholder
    checkNotesList();
    showNotesList(); // Ensure editor is hidden and list is shown initially

    // Initial check
    checkSourceList(); 
    adjustTextareaHeight();

    // NEW: Clear Chat Button Listener
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', () => {
            console.log("Clear Chat button clicked.");
            if (confirm("Are you sure you want to clear the current chat? This action cannot be undone.")) {
                // Clear the chat area visually
                if (chatArea) {
                    chatArea.innerHTML = ''; // Remove all messages
                }
                // Clear the chat history in the currentProject object
                if (currentProject && currentProject.chatHistory) {
                    currentProject.chatHistory = [];
                    console.log("Cleared chat history in project data.");
                    // Save the project state (important!)
                    saveCurrentProject();
                } else {
                     console.warn("Could not find currentProject or chatHistory to clear.");
                }
                // Show the placeholder again
                if (chatPlaceholder) {
                     chatPlaceholder.style.display = 'flex';
                     chatArea.style.justifyContent = 'center';
                }
                // Optionally clear the input textarea
                if (userInput) {
                    userInput.value = '';
                    adjustTextareaHeight(); // Reset height if needed
                }
                console.log("Chat UI cleared.");
                // Disable send button if input is empty (it should be now)
                checkInputAndToggleButton(); // Update send button state
            }
        });
    } else { console.warn("Clear Chat button not found!"); }

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

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-options-btn') && !e.target.closest('.card-options-menu')) {
        document.querySelectorAll('.card-options-menu.active').forEach(menu => menu.classList.remove('active'));
    }
}); 