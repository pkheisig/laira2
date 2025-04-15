import { api } from './api.js'; // Assuming api.js handles fetch calls or define fetch here
import { showTemporaryStatus } from './utils.js';

console.log('[DEBUG] embedManager.js loaded');

let projectId = null;
let currentProjectSources = []; // Keep track of sources locally if needed
let embedBtnElement = null;
let pollingInterval = null; // To keep track of the interval

// Function to update the embed button UI during polling
function updateEmbedButtonUI(status, progress = null) {
    if (!embedBtnElement) return;
    if (status === 'polling') {
        embedBtnElement.disabled = true;
        embedBtnElement.innerHTML = `<i class="fas fa-spinner fa-spin"></i> ${progress !== null ? Math.round(progress) + '%' : 'Embedding...'}`;
    } else if (status === 'idle') {
        embedBtnElement.disabled = false;
        embedBtnElement.innerHTML = '<i class="fas fa-project-diagram"></i> Embed';
    } else if (status === 'disabled') {
         embedBtnElement.disabled = true;
         embedBtnElement.innerHTML = '<i class="fas fa-project-diagram"></i> Embed'; // Keep text, just disable
    }
}

// Function to poll embedding status
function pollEmbeddingStatus(taskId) {
    if (!projectId) {
        console.error("[EMBED] Cannot poll status: projectId not set.");
        return;
    }
    console.log(`[EMBED] Starting polling for task: ${taskId} on project ${projectId}`);
    updateEmbedButtonUI('polling', 0); // Initial polling state

    // Clear existing interval if any
    if (pollingInterval) {
        clearInterval(pollingInterval);
    }

    pollingInterval = setInterval(() => {
        console.log(`[EMBED] Polling status for task: ${taskId}`);
        // Use api module or fetch directly
        fetch(`/embed/status/${taskId}`)
            .then(response => {
                if (!response.ok) {
                    // Handle non-2xx responses differently, maybe stop polling
                    if (response.status === 404) {
                         console.warn(`[EMBED] Task ${taskId} not found. Stopping polling.`);
                         throw new Error('Task not found (404).');
                    } 
                    throw new Error(`Server error ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                console.log(`[EMBED] Status response:`, data);
                updateEmbedButtonUI('polling', data.progress);
                // Store status locally if needed for other modules
                localStorage.setItem(`embeddingStatus_${projectId}`, JSON.stringify(data));

                if (data.status === "completed" || data.status === "completed_with_errors") {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    const message = data.status === "completed" ? "Embedding completed successfully!" : "Embedding completed with some errors.";
                    showTemporaryStatus(message, data.status !== "completed");
                    updateEmbedButtonUI('idle');
                    localStorage.removeItem(`embeddingTask_${projectId}`);
                    localStorage.removeItem(`embeddingStatus_${projectId}`);
                    console.log(`[EMBED] Polling finished for task ${taskId}. Status: ${data.status}`);
                } else if (data.status === "failed") {
                    clearInterval(pollingInterval);
                    pollingInterval = null;
                    showTemporaryStatus(`Embedding failed: ${data.error || data.details || "Unknown error"}`, true);
                    updateEmbedButtonUI('idle');
                    localStorage.removeItem(`embeddingTask_${projectId}`);
                    localStorage.removeItem(`embeddingStatus_${projectId}`);
                     console.error(`[EMBED] Polling finished for task ${taskId}. Status: FAILED`, data.error || data.details);
                }
                // Continue polling if status is 'in_progress', 'processing', 'pending' etc.
            })
            .catch(error => {
                console.error(`[EMBED] Error polling embedding status:`, error);
                clearInterval(pollingInterval);
                 pollingInterval = null;
                updateEmbedButtonUI('idle');
                showTemporaryStatus("Error checking embedding status.", true);
                // Clear local storage on error
                localStorage.removeItem(`embeddingTask_${projectId}`);
                localStorage.removeItem(`embeddingStatus_${projectId}`);
            });
    }, 3000); // Poll every 3 seconds
}

// Function to handle the embed button click
async function handleEmbedClick() {
    if (!projectId) {
        console.error('[EMBED] Project ID not found in handler.');
        showTemporaryStatus("Cannot embed: Project context lost.", true);
        return;
    }
    
    // Refresh or get source list status before embedding
    // This might need coordination if sourceManager owns the data
    // For now, assume we can check the source list count somehow
    const sourceListElement = document.getElementById('source-list');
    const sourcesExist = sourceListElement && sourceListElement.children.length > 0;

    if (!sourcesExist) {
        showTemporaryStatus("Add sources before embedding.", true);
        console.warn(`[EMBED] No sources to embed for project:`, projectId);
        return;
    }

    updateEmbedButtonUI('polling', 0); // Show immediate feedback
    
    console.log(`[EMBED] Sending POST to /embed/${projectId}`);
    try {
        const response = await fetch(`/embed/${projectId}`, { method: 'POST' });
        console.log(`[EMBED] /embed/${projectId} fetch response status:`, response.status);

        if (!response.ok) {
            let errorMsg = `Server error ${response.status}`;
            try {
                const errData = await response.json();
                errorMsg = errData.error || errorMsg;
            } catch (jsonError) { /* Ignore if response wasn't JSON */ }
            throw new Error(errorMsg);
        }
        
        const data = await response.json();
        console.log(`[EMBED] /embed/${projectId} response data:`, data);
        
        if (data.success && data.task_id) {
            showTemporaryStatus("Embedding process started...");
            localStorage.setItem(`embeddingTask_${projectId}`, data.task_id);
            localStorage.setItem(`embeddingStatus_${projectId}`, 'pending'); 
            pollEmbeddingStatus(data.task_id);
        } else {
            // Handle cases where success is false or task_id is missing
            throw new Error(data.error || "Failed to start embedding task (no task ID returned).");
        }
    } catch (error) {
        console.error(`[EMBED] Error starting embedding:`, error);
        showTemporaryStatus(`Error: ${error.message}`, true);
        updateEmbedButtonUI('idle');
        // Clear local storage on failure to start
        localStorage.removeItem(`embeddingTask_${projectId}`);
        localStorage.removeItem(`embeddingStatus_${projectId}`);
    }
}

// Check for ongoing task on load
function checkOngoingEmbeddingTaskOnLoad() {
    if (!projectId) return;
    const taskId = localStorage.getItem(`embeddingTask_${projectId}`);
    if (taskId) {
        console.log(`[EMBED] Found ongoing embedding task ${taskId} on load. Resuming polling.`);
        pollEmbeddingStatus(taskId);
    } else {
         // Ensure button is in correct initial state if no task
         updateEmbedButtonUI('idle');
    }
}

// Setup function for this module
export function setupEmbedding(currentProjectId) {
    console.log(`[EMBED] Initializing embed manager for project: ${currentProjectId}`);
    projectId = currentProjectId;
    embedBtnElement = document.getElementById('embed-btn');

    if (!embedBtnElement) {
        console.error("[EMBED] Embed button element not found in the DOM.");
        return;
    }

    // Remove previous listeners if any (defensive)
    // embedBtnElement.removeEventListener('click', handleEmbedClick); 
    // Note: Direct removal needs the exact function ref. Using delegation is safer for re-runs.
    // For now, we rely on the setupProjectViewListeners flag to prevent multiple setups.

    // Add the main click listener
    embedBtnElement.addEventListener('click', handleEmbedClick);

    // Check for ongoing task
    checkOngoingEmbeddingTaskOnLoad();
    
    console.log("[EMBED] Embed manager setup complete.");
} 