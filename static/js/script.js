import { api } from './api.js';
// import { initializeTheme } from './theme.js'; // Assuming theme logic is elsewhere or not yet refactored
import { setupHomeViewListeners } from './homeView.js'; // Assuming home view logic is elsewhere or not yet refactored

// Keep only the necessary imports for the current refactor
import { setupProjectView } from './projectView.js'; 
// We might need to re-introduce theme imports later if themeManager.js is created
import { initializeTheme } from './themeManager.js'; 

// Placeholder for JavaScript functionality

document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM fully loaded - Initializing UI Logic');

    // --- Theme Handling (Assume it works globally for now or is handled in CSS/HTML) ---
    initializeTheme(); // Call the initialization function
    // applyTheme(); // Apply theme if needed - now handled by initializeTheme

    // --- Determine current view and project ID --- 
    let projectId = null;
    const pathParts = window.location.pathname.split('/');
    const isProjectView = pathParts.length >= 3 && pathParts[1] === 'project';
    
    if (isProjectView) {
        projectId = decodeURIComponent(pathParts[2]); // Decode the ID
        console.log('Project View Detected - ID:', projectId);
        // Setup Project View using the refactored function
        console.log('[DEBUG] script.js: About to call setupProjectView');
        setupProjectView(projectId); // Call the correct setup function
        console.log('[DEBUG] script.js: Returned from setupProjectView');
    } else {
        console.log('Home View Detected');
        // Setup Home View Listeners if/when refactored
        setupHomeViewListeners(); // Or setupHomeViewListeners();
    }

    // Theme toggle listener (keep if the button exists on all pages)
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    if (themeToggleBtn) {
        // Listener is now attached within initializeTheme in themeManager.js
        // themeToggleBtn.addEventListener('click', toggleTheme); // Add back when themeManager is ready
        // console.log("Theme toggle button found, listener setup skipped until themeManager exists.");
    } else {
        console.warn("[Script.js] Theme toggle button not found during initial setup.");
    }
});

// --- Remove old helper functions if they are now part of modules ---
// function showTemporaryStatus(...) { ... } // Should be in utils.js
// function adjustTextareaHeight(...) { ... } // Should be in utils.js or specific modules

// Close menus when clicking outside (Keep as global helper?)
document.addEventListener('click', (e) => {
    if (!e.target.closest('.card-options-btn') && !e.target.closest('.card-options-menu') && 
        !e.target.closest('.list-options-btn') && !e.target.closest('.list-options-menu')) {
        document.querySelectorAll('.card-options-menu.active, .list-options-menu.active').forEach(menu => menu.classList.remove('active'));
    }
});