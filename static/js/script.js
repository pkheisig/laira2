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


    // MODIFIED: Function to render a single project card (mostly unchanged, added deleteProject call)
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
        const cardBody = cardClone.querySelector('.card-body'); 
        const saveCardRenameBtn = document.createElement('button');
        saveCardRenameBtn.innerHTML = '<i class="fas fa-check"></i>';
        saveCardRenameBtn.className = 'card-inline-btn save-card-rename-btn';
        saveCardRenameBtn.title = 'Save Name';
        saveCardRenameBtn.style.display = 'none';
        const cancelCardRenameBtn = document.createElement('button');
        cancelCardRenameBtn.innerHTML = '<i class="fas fa-times"></i>';
        cancelCardRenameBtn.className = 'card-inline-btn cancel-card-rename-btn';
        cancelCardRenameBtn.title = 'Cancel Rename';
        cancelCardRenameBtn.style.display = 'none';

        if (!cardElement || !titleElement || !dateElement || !optionsBtn || !optionsMenu || !renameBtn || !deleteBtn || !cardBody) {
            console.error("Missing card elements");
            return;
        }

        cardElement.dataset.projectId = projectData.id; 
        titleElement.textContent = projectData.title;
        // Format date for display
        const modDate = new Date(projectData.modifiedDate);
        dateElement.textContent = modDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });

        // Handle click to navigate
        cardElement.addEventListener('click', (e) => {
            if (e.target.closest('.card-options-btn') || e.target.closest('.card-options-menu') || e.target.closest('.card-inline-btn') || cardElement.classList.contains('editing')) {
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

        // Handle Rename Button Click 
        renameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            console.log(`Card Rename action for project ${projectData.id}`);
            optionsMenu.classList.remove('active'); 
            
            cardElement.classList.add('editing'); 
            titleElement.contentEditable = 'true';
            titleElement.dataset.originalTitle = titleElement.textContent; 
            titleElement.focus();
            document.execCommand('selectAll', false, null); 

            cardBody.appendChild(saveCardRenameBtn);
            cardBody.appendChild(cancelCardRenameBtn);
            saveCardRenameBtn.style.display = 'inline-flex';
            cancelCardRenameBtn.style.display = 'inline-flex';
            optionsBtn.style.display = 'none'; // Hide options btn
        });

        // Handle Save Rename Click
        saveCardRenameBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            const newTitle = titleElement.textContent.trim();
            const originalTitle = titleElement.dataset.originalTitle;
            const projectIdToRename = cardElement.dataset.projectId;

            titleElement.contentEditable = 'false';
            cardElement.classList.remove('editing');
            saveCardRenameBtn.style.display = 'none';
            cancelCardRenameBtn.style.display = 'none';
            optionsBtn.style.display = ''; // Restore options btn

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
            saveCardRenameBtn.remove();
            cancelCardRenameBtn.remove();
        });

         // Handle Cancel Rename Click
         cancelCardRenameBtn.addEventListener('click', (e) => {
             e.stopPropagation();
             titleElement.textContent = titleElement.dataset.originalTitle; // Revert
             titleElement.contentEditable = 'false';
             cardElement.classList.remove('editing');
             saveCardRenameBtn.style.display = 'none';
             cancelCardRenameBtn.style.display = 'none';
             optionsBtn.style.display = ''; // Restore options button
             // Clean up buttons from DOM
             saveCardRenameBtn.remove();
             cancelCardRenameBtn.remove();
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
             currentProject.chatHistory.forEach(msg => addMessageToChat(msg.text, msg.sender));
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

// Close menus when clicking outside
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-options-btn') && !e.target.closest('.card-options-menu')) {
        document.querySelectorAll('.card-options-menu.active').forEach(menu => menu.classList.remove('active'));
    }
}); 