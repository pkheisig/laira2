import { showTemporaryStatus } from './utils.js'; // Assuming utils.js exists
import { api } from './api.js'; // Assuming api.js exists

console.log('[DEBUG] chatManager.js loaded');

let projectId = null; // Module-level variable to store project ID

// DOM Elements (cache elements used by this module)
let chatHistoryContainer = null;
let chatInput = null;
let chatSendBtn = null;

// Function to add a message to the chat history UI
function addChatMessage(role, message) {
    if (!chatHistoryContainer) {
        console.warn("[CHAT] chatHistoryContainer not found");
        return;
    }

    const messageDiv = document.createElement('div');
    // Use specific classes for notes panel chat if needed, or generic
    messageDiv.classList.add('chat-message', role); 
    
    const strong = document.createElement('strong');
    strong.textContent = role === 'user' ? 'You: ' : 'Assistant: ';
    
    messageDiv.appendChild(strong);
    messageDiv.appendChild(document.createTextNode(message)); 
    
    chatHistoryContainer.appendChild(messageDiv);
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
}

// Function to handle sending a chat message
async function sendChatMessage() {
    if (!chatInput || !chatSendBtn) {
        console.warn("[CHAT] Chat input/button elements not found");
        return;
    }
    const query = chatInput.value.trim();
    if (!query || !projectId) {
        console.warn("[CHAT] Query is empty or projectId not set");
        return;
    } 

    addChatMessage('user', query);
    chatInput.value = ''; 
    chatSendBtn.disabled = true; 
    addChatMessage('assistant', 'Thinking...'); 

    try {
        // Use the existing api module if it has the chat call, otherwise define fetch here
        // Assuming api.js is updated or we fetch directly
        const response = await fetch(`/chat/${projectId}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ query: query }),
        });

        // Remove the 'Thinking...' message
        const thinkingMessage = chatHistoryContainer?.querySelector('.assistant:last-child');
        if (thinkingMessage && thinkingMessage.textContent.includes('Thinking...')) {
            chatHistoryContainer.removeChild(thinkingMessage);
        }

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` })); // Handle non-JSON error response
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        addChatMessage('assistant', data.response || "Received empty response content.");

    } catch (error) {
        console.error('Error sending chat message:', error);
        const thinkingMessage = chatHistoryContainer?.querySelector('.assistant:last-child');
        if (thinkingMessage && thinkingMessage.textContent.includes('Thinking...')) {
             chatHistoryContainer?.removeChild(thinkingMessage);
        }
        addChatMessage('assistant', `Error: ${error.message}`);
    } finally {
        if(chatSendBtn) chatSendBtn.disabled = false; 
    }
}

// Function to load chat history
async function loadChatHistory() {
    if (!projectId) {
        console.warn("[CHAT] Cannot load history: projectId not set");
        return;
    }
    if (!chatHistoryContainer) {
         console.warn("[CHAT] Cannot load history: chatHistoryContainer not found");
        return;
    }
    
    console.log("[CHAT] Loading chat history for project:", projectId);
    chatHistoryContainer.innerHTML = ''; 
    addChatMessage('assistant', 'Loading history...');

    try {
        // Use api.js or fetch directly
        const response = await fetch(`/project/${projectId}/chat-history`); 
        const loadingMessage = chatHistoryContainer.querySelector('.assistant:last-child');
        if (loadingMessage && loadingMessage.textContent.includes('Loading history...')) {
            chatHistoryContainer.removeChild(loadingMessage);
        }
        
        if (!response.ok) {
            const errorData = await response.json().catch(() => ({ error: `HTTP error! status: ${response.status}` }));
            throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        if (data.history && Array.isArray(data.history) && data.history.length > 0) {
            data.history.forEach(msg => {
                // Ensure message format is handled correctly
                addChatMessage(msg.role || (msg.sender === 'user' ? 'user' : 'assistant') , msg.content || msg.text || ""); 
            });
            console.log(`[CHAT] Loaded ${data.history.length} messages.`);
        } else {
             addChatMessage('assistant', 'No previous chat history found. Ask me anything about the documents!');
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        const loadingMessage = chatHistoryContainer?.querySelector('.assistant:last-child');
        if (loadingMessage && loadingMessage.textContent.includes('Loading history...')) {
            chatHistoryContainer?.removeChild(loadingMessage);
        }
        addChatMessage('assistant', `Error loading history: ${error.message}`);
    }
}

// Exported setup function for this module
export function setupChat(currentProjectId) {
    console.log(`[CHAT] Initializing chat manager for project: ${currentProjectId}`);
    projectId = currentProjectId; // Set project ID for the module

    // Cache DOM elements
    chatHistoryContainer = document.getElementById('chat-history');
    chatInput = document.getElementById('chat-input'); // Assumes ID 'chat-input' for notes panel chat
    chatSendBtn = document.getElementById('chat-send-btn'); // Assumes ID 'chat-send-btn'

    if (!chatHistoryContainer || !chatInput || !chatSendBtn) {
        console.error("[CHAT] Failed to find necessary chat elements in the DOM.", 
            { chatHistoryContainer, chatInput, chatSendBtn });
        return; // Stop setup if elements are missing
    }

    // Add Chat Listeners
    chatSendBtn.addEventListener('click', sendChatMessage);
    chatInput.addEventListener('keypress', (event) => {
        if (event.key === 'Enter' && !event.shiftKey) {
            event.preventDefault();
            sendChatMessage();
        }
    });
    
    // Load initial chat history
    loadChatHistory(); 
    
    console.log("[CHAT] Chat listeners attached and history loading initiated.");
} 