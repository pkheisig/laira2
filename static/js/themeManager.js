console.log('[DEBUG] themeManager.js loaded');

const themeToggleButton = document.getElementById('theme-toggle-btn');
const themeIcon = themeToggleButton?.querySelector('i'); // Get the icon within the button

export function applyTheme(theme) {
    console.log(`[THEME] Applying theme: ${theme}`);
    document.body.classList.remove('light-theme', 'dark-theme');
    document.body.classList.add(theme + '-theme');
    localStorage.setItem('lairaTheme', theme);
    updateIcon(theme); // Update icon when theme is applied
}

export function toggleTheme() {
    const currentTheme = document.body.classList.contains('dark-theme') ? 'dark' : 'light';
    const newTheme = currentTheme === 'light' ? 'dark' : 'light';
    console.log(`[THEME] Toggling theme from ${currentTheme} to ${newTheme}`);
    applyTheme(newTheme);
}

function updateIcon(theme) {
    if (themeIcon) {
        if (theme === 'dark') {
            themeIcon.classList.remove('fa-sun');
            themeIcon.classList.add('fa-moon');
        } else {
            themeIcon.classList.remove('fa-moon');
            themeIcon.classList.add('fa-sun');
        }
        console.log(`[THEME] Icon updated for ${theme} theme`);
    } else {
        console.warn("[THEME] Theme toggle icon not found for update.");
    }
}

export function initializeTheme() {
    const savedTheme = localStorage.getItem('lairaTheme') || 'light'; // Default to light
    console.log(`[THEME] Initializing theme. Found saved theme: ${savedTheme}`);
    applyTheme(savedTheme);

    // Ensure the event listener is attached here after initialization
    if (themeToggleButton) {
         // Remove potentially old listener before adding new one
         themeToggleButton.removeEventListener('click', toggleTheme); 
        themeToggleButton.addEventListener('click', toggleTheme);
        console.log("[THEME] Theme toggle listener attached.");
    } else {
        console.warn("[THEME] Theme toggle button not found during initialization.");
    }
} 