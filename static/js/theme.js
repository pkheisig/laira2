// Function to apply theme based on saved preference or system setting
export function applyTheme(theme, body, themeToggleBtn) {
    if (theme === 'dark') {
        body.classList.add('dark-theme');
        if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fas fa-moon"></i>'; // Show moon icon
    } else {
        body.classList.remove('dark-theme');
        if (themeToggleBtn) themeToggleBtn.innerHTML = '<i class="fas fa-sun"></i>'; // Show sun icon
    }
}

// Function to toggle theme and save preference
export function toggleTheme(body, themeToggleBtn) {
    const currentTheme = body.classList.contains('dark-theme') ? 'light' : 'dark';
    localStorage.setItem('theme', currentTheme); // Save preference
    applyTheme(currentTheme, body, themeToggleBtn);
}

// Function to initialize theme on load
export function initializeTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle-btn');
    const body = document.body;
    
    const savedTheme = localStorage.getItem('theme') || 'light'; // Default to light
    applyTheme(savedTheme, body, themeToggleBtn);

    // Add listener to theme toggle button (if it exists)
    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => toggleTheme(body, themeToggleBtn));
    }
} 