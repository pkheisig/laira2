const storageKey = 'lairaProjects'; // Key for localStorage

// MODIFIED: deleteProject - re-renders list after deletion
function deleteProject(projectId, fetchAndRenderProjects) {
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
function renderProjectListItem(projectData, projectListArea, projectListItemTemplate, fetchAndRenderProjects) {
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
             deleteProject(projectIdToDelete, fetchAndRenderProjects); 
        } else {
            console.error("Missing projectId for list deletion.");
        }
        optionsMenu.classList.remove('active'); // Close menu
    });

    projectListArea.appendChild(itemClone);
}


// MODIFIED: Function to render a single project card
function renderProjectCard(projectData, projectListArea, projectCardTemplate, fetchAndRenderProjects) {
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
             deleteProject(projectIdToDelete, fetchAndRenderProjects); 
        } else {
            console.error("Missing projectId for card deletion.");
        }
        optionsMenu.classList.remove('active'); // Close menu
    });

    projectListArea.appendChild(cardClone);

    // Hide placeholder if it exists and cards are now present
    const homePlaceholder = document.getElementById('home-placeholder');
    if (homePlaceholder && projectListArea.children.length > 2) { // >2 because of header and template(s)
        homePlaceholder.style.display = 'none';
    }
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

// MODIFIED: Function to fetch, sort, and render projects
function fetchAndRenderProjects(currentSort, currentView, projectListArea, projectCardTemplate, projectListItemTemplate) {
    console.log(`Fetching projects (Sort: ${currentSort}, View: ${currentView})`);
    const homePlaceholder = document.getElementById('home-placeholder');
    const projectListHeader = document.getElementById('project-list-area')?.querySelector('.project-list-header');
    
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
         // Pass the necessary fetchAndRenderProjects function reference for recursion/re-rendering
         const boundFetchAndRender = () => fetchAndRenderProjects(currentSort, currentView, projectListArea, projectCardTemplate, projectListItemTemplate);
         projects.forEach(proj => renderFunction(proj, projectListArea, currentView === 'list' ? projectListItemTemplate : projectCardTemplate, boundFetchAndRender));
    }

    // Add listener to close menus when clicking outside
    document.addEventListener('click', closeAllOptionMenus, true); // Use capture phase
}

// MODIFIED: Function to set the active view
function setActiveView(viewType, currentViewRef, projectListArea, gridViewBtn, listViewBtn, projectCardTemplate, projectListItemTemplate, currentSort) {
     if (currentViewRef.current === viewType) return; // No change needed
     currentViewRef.current = viewType;
     console.log("Set view:", viewType);
     const projectListHeader = projectListArea?.querySelector('.project-list-header'); // Get header inside function

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
     fetchAndRenderProjects(currentSort, currentViewRef.current, projectListArea, projectCardTemplate, projectListItemTemplate); 
}

export function setupHomeViewListeners() {
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
    
    let currentView = 'grid'; // Track current view ('grid' or 'list')
    let currentSort = 'recent'; // Track current sort ('recent' or 'alpha')
    // Use a reference object for currentView to allow setActiveView to modify it
    let currentViewRef = { current: 'grid' };

    // Create a bound version of fetchAndRenderProjects to pass around
    const boundFetchAndRender = () => fetchAndRenderProjects(currentSort, currentViewRef.current, projectListArea, projectCardTemplate, projectListItemTemplate);

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
    
    // Initial setup - moved down
    const savedView = localStorage.getItem('projectViewType') || 'grid'; // Optional: remember view preference
    const savedSort = localStorage.getItem('projectSortType') || 'recent'; // Optional: remember sort
    currentViewRef.current = savedView;
    currentSort = savedSort;
    if(sortDropdown) sortDropdown.value = currentSort;
    
    // Add View Button Listeners
    if (gridViewBtn) gridViewBtn.addEventListener('click', () => setActiveView('grid', currentViewRef, projectListArea, gridViewBtn, listViewBtn, projectCardTemplate, projectListItemTemplate, currentSort));
    if (listViewBtn) listViewBtn.addEventListener('click', () => setActiveView('list', currentViewRef, projectListArea, gridViewBtn, listViewBtn, projectCardTemplate, projectListItemTemplate, currentSort));

    // Add Sort Dropdown Listener
    if (sortDropdown) {
        sortDropdown.addEventListener('change', (e) => {
            const newSort = e.target.value;
            if (currentSort !== newSort) {
                currentSort = newSort;
                console.log(`Sort criteria changed to: ${currentSort}`);
                boundFetchAndRender(); // Re-fetch and render with new sort
            }
        });
    }
    
    // Set initial class based on saved/default view BEFORE first render
    if (currentViewRef.current === 'list') {
         if (projectListArea) projectListArea.classList.add('project-list');
         if (listViewBtn) listViewBtn.classList.add('active');
         if (gridViewBtn) gridViewBtn.classList.remove('active');
    } else {
         if (projectListArea) projectListArea.classList.add('project-grid');
         if (gridViewBtn) gridViewBtn.classList.add('active');
         if (listViewBtn) listViewBtn.classList.remove('active');
    }
    if (projectListHeader) projectListHeader.style.display = 'none'; // Ensure header hidden initially

    boundFetchAndRender(); // Fetch and render project list initially using currentSort and currentView
} 