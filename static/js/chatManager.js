import { showTemporaryStatus } from './utils.js'; // Assuming utils.js exists
import { api } from './api.js'; // Assuming api.js exists

console.log('[DEBUG] chatManager.js loaded');

let projectId = null; // Module-level variable to store project ID

// DOM Elements (cache elements used by this module)
let chatHistoryContainer = null;
let chatInput = null;
let chatSendBtn = null;
let chatPlaceholder = null; // Placeholder element for no history

// Function to add a message to the chat history UI
function addChatMessage(role, message, timestamp) {
    if (!chatHistoryContainer) {
        console.warn("[CHAT] chatHistoryContainer not found");
        return;
    }

    const messageDiv = document.createElement('div');
    // Apply base classes and specific message type classes for styling
    messageDiv.classList.add('chat-message', 'message');
    if (role === 'user') {
        messageDiv.classList.add('user-message');
    } else {
        messageDiv.classList.add('bot-message');
    }
    
    const strong = document.createElement('strong');
    strong.textContent = role === 'user' ? 'You: ' : 'Assistant: ';
    
    messageDiv.appendChild(strong);
    if (role === 'user') {
        messageDiv.appendChild(document.createTextNode(message));
    } else {
        // simple markdown: **bold** and paragraphs
        let html = message.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        html = html.split(/\n\n+/).map(p => `<p>${p}</p>`).join('');
        const contentDiv = document.createElement('div');
        contentDiv.innerHTML = html;
        messageDiv.appendChild(contentDiv);
    }
    
    // Add timestamp after message (use provided or current time)
    const tsSpan = document.createElement('span');
    tsSpan.classList.add('chat-timestamp');
    let dt;
    if (timestamp) {
        dt = new Date(timestamp * 1000);
    } else {
        dt = new Date();
    }
    const now = new Date();
    let tsText;
    const diff = now - dt;
    // Format time without seconds; include date if older than 24h
    const timeOpts = {hour: '2-digit', minute: '2-digit'};
    if (diff > 24*60*60*1000) {
        tsText = dt.toLocaleDateString() + ' ' + dt.toLocaleTimeString([], timeOpts);
    } else {
        tsText = dt.toLocaleTimeString([], timeOpts);
    }
    tsSpan.textContent = tsText;
    messageDiv.appendChild(tsSpan);
    
    // If assistant message (and not the pin confirmation), add pin button
    if (role !== 'user' && message !== 'Message pinned as note.') {
        const pinBtn = document.createElement('button');
        pinBtn.classList.add('pin-btn');
        pinBtn.title = 'Pin message as note';
        pinBtn.textContent = '📌';
        pinBtn.onclick = async () => {
            if (!confirm('Save this message as a note?')) return;
            try {
                const resp = await fetch(`/project/${projectId}/notes`, {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ title: 'Pinned message', content: message })
                });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                window.globalFetchNotes(); // Refresh notes panel
                addChatMessage('assistant', 'Message pinned as note.');
            } catch (err) {
                console.error('Error pinning message:', err);
            }
        };
        messageDiv.appendChild(pinBtn);
    }
    
    chatHistoryContainer.appendChild(messageDiv);
    chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    return messageDiv; // Return the created message element for removal later
}

// Overwrite sendChatMessage for reliability: show user message toast, then reload history
async function sendChatMessage() {
    if (chatPlaceholder) chatPlaceholder.style.display = 'none';
    if (!chatInput || !chatSendBtn) {
        console.warn("[CHAT] Chat input/button elements not found");
        return;
    }
    const query = chatInput.value.trim();
    if (!query || !projectId) {
        console.warn("[CHAT] Query is empty or projectId not set");
        return;
    }

    // Display user message in chat window
    addChatMessage('user', query);
    chatInput.value = '';
    chatSendBtn.disabled = true;

    try {
        const respData = await api.sendMessage(projectId, query);
        if (respData.error) throw new Error(respData.error);
        // Extract assistant answer
        const assistantMsg = respData.answer || respData.response || '';
        addChatMessage('assistant', assistantMsg);

        // Chat response already added
    } catch (error) {
        console.error('[CHAT] sendChatMessage failed', error);
        showTemporaryStatus(`Error: ${error.message}`, true);
    } finally {
        chatSendBtn.disabled = false;
    }
}

// Function to load chat history
async function loadChatHistory() {
    if (!projectId || !chatHistoryContainer) return;
    console.log("[CHAT] Loading chat history for project:", projectId);
    chatHistoryContainer.innerHTML = '';
    if (chatPlaceholder) chatPlaceholder.style.display = 'none';

    try {
        const response = await fetch(`/project/${projectId}/chat-history`);
        // No history file yet
        if (response.status === 404) {
            if (chatPlaceholder) {
                chatPlaceholder.innerHTML = `
                    <i class="fas fa-comments" style="font-size:3rem; margin-bottom:1vh; color:var(--secondary-text-light);"></i>
                    <h3 style="font-size:1.2rem; font-weight:500; margin-bottom:1vh; color:var(--text-color-light);">No previous chat history found. Ask me anything about the documents!</h3>
                `;
                // Remove upload button if present
                const btn = chatPlaceholder.querySelector('.upload-shortcut-btn');
                if (btn) btn.remove();
                chatPlaceholder.style.display = 'flex';
            }
            return;
        }
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = await response.json();
        const history = Array.isArray(data.history) ? data.history : [];
        if (history.length > 0) {
            history.forEach(msg => {
                const role = msg.role || 'assistant';
                const text = msg.content || msg.text || '';
                const ts = msg.timestamp;
                addChatMessage(role, text, ts);
            });
        } else {
            // Show placeholder when history is empty
            if (chatPlaceholder) {
                chatPlaceholder.innerHTML = `
                    <i class="fas fa-comments" style="font-size:3rem; margin-bottom:1vh; color:var(--secondary-text-light);"></i>
                    <h3 style="font-size:1.2rem; font-weight:500; margin-bottom:1vh; color:var(--text-color-light);">No previous chat history found. Ask me anything about the documents!</h3>
                `;
                const btn = chatPlaceholder.querySelector('.upload-shortcut-btn');
                if (btn) btn.remove();
                chatPlaceholder.style.display = 'flex';
            }
        }
    } catch (error) {
        console.error('Error loading chat history:', error);
        if (chatPlaceholder) {
            chatPlaceholder.innerHTML = `
                <i class="fas fa-comments" style="font-size:3rem; margin-bottom:1vh; color:var(--secondary-text-light);"></i>
                <h3 style="font-size:1.2rem; font-weight:500; margin-bottom:1vh; color:var(--text-color-light);">Error: ${error.message}</h3>
            `;
            const btn = chatPlaceholder.querySelector('.upload-shortcut-btn');
            if (btn) btn.remove();
            chatPlaceholder.style.display = 'flex';
        }
    }
    // Scroll to the bottom after rendering history
    if (chatHistoryContainer) {
        chatHistoryContainer.scrollTop = chatHistoryContainer.scrollHeight;
    }
}

// Exported setup function for this module
export function setupChat(currentProjectId) {
    console.log(`[CHAT] Initializing chat manager for project: ${currentProjectId}`);
    projectId = currentProjectId; // Set project ID for the module

    // Cache DOM elements
    chatHistoryContainer = document.getElementById('chat-area');
    chatInput = document.getElementById('user-input'); // Updated to match textarea ID in HTML
    chatSendBtn = document.getElementById('send-button'); // Updated to match send button ID in HTML
    chatPlaceholder = document.getElementById('chat-placeholder');
    if (chatPlaceholder) {
        chatPlaceholder.style.display = 'none';
    }

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
    
    // Add Clear Chat handler
    const clearChatBtn = document.getElementById('clear-chat-btn');
    if (clearChatBtn) {
        clearChatBtn.addEventListener('click', async () => {
            if (!confirm('Are you sure you want to clear the chat?')) return;
            try {
                const resp = await fetch(`/reset-chat/${projectId}`, { method: 'POST' });
                if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
                chatHistoryContainer.innerHTML = '';
                // Also clear client-side history cache if any
                addChatMessage('assistant', 'Chat cleared.');
            } catch (error) {
                console.error('Error clearing chat:', error);
            }
        });
    }
    
    // Customize summary button: show short display text but send detailed AI prompt
    const summaryBtn = document.getElementById('generate-summary-btn');
    if (summaryBtn) {
        summaryBtn.addEventListener('click', async () => {
            const displayText = 'Generate a summary of the literature.';
            const aiPrompt = `Summarize the literature by treating all files as one body of information. 
            Emphasize scientific conclusion over single figures and tables.`;
            if (chatPlaceholder) chatPlaceholder.style.display = 'none';
            // Show only the summary label in UI
            addChatMessage('user', displayText);
            chatSendBtn.disabled = true;
            try {
                const response = await fetch(`/chat/${projectId}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ query: aiPrompt, displayText })
                });
                const respData = await response.json();
                if (respData.error) throw new Error(respData.error);
                const assistantMsg = respData.answer || respData.response || '';
                addChatMessage('assistant', assistantMsg);
            } catch (error) {
                console.error('[CHAT] generateSummary failed', error);
                showTemporaryStatus(`Error: ${error.message}`, true);
            } finally {
                chatSendBtn.disabled = false;
            }
        });
    }
    
    // Load initial chat history
    loadChatHistory(); 
    
    console.log("[CHAT] Chat listeners attached and history loading initiated.");
} 