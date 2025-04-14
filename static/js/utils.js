// --- Helper Functions ---
export function showTemporaryStatus(message, isError = false, duration = 3000) {
     const statusElement = document.getElementById('status-message');
     if (!statusElement) {
         console.warn("Status message element not found");
         return;
     }
     statusElement.textContent = message;
     statusElement.className = isError ? 'status-error' : 'status-success'; // Use classes for styling
     statusElement.style.opacity = '1';
     setTimeout(() => { 
         statusElement.style.opacity = '0'; 
         // Optional: Clear text after fading
         // setTimeout(() => { if (statusElement.style.opacity === '0') statusElement.textContent = ''; }, 500); 
     }, duration);
 }

// Add function to adjust textarea height dynamically
export function adjustTextareaHeight(element = null) {
     const userInput = document.getElementById('user-input'); // Need access to main input
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

// --- Global Listeners ---
function closeAllOptionMenus(event) {
    // Check if the click was outside *any* options button or menu
     if (!event.target.closest('.card-options-btn') && !event.target.closest('.card-options-menu') && 
         !event.target.closest('.list-options-btn') && !event.target.closest('.list-options-menu')) {
         document.querySelectorAll('.card-options-menu.active, .list-options-menu.active').forEach(menu => {
             menu.classList.remove('active');
         });
     }
}

export function initializeGlobalListeners() {
    // Close option menus when clicking outside
    document.addEventListener('click', closeAllOptionMenus, true); // Use capture phase
    console.log("Global listeners initialized.");
} 