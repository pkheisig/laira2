console.log('[DEBUG] projectView.js top-level loaded');
import { api } from './api.js';
import { showTemporaryStatus, adjustTextareaHeight } from './utils.js'; 
import { setupChat } from './chatManager.js';
import { setupSources } from './sourceManager.js';
import { setupEmbedding } from './embedManager.js';
import { initializeNotesPanel } from './app.js';

const storageKey = 'lairaProjects'; 
let currentProject = null; 
let allProjects = []; 
let currentAbortController = null; 
let isPinning = false; 
let projectViewListenersSetup = false; // Add a flag

function showModal(modalElement) {
    modalElement?.classList.add('active');
}
function hideModal(modalElement) {
    modalElement?.classList.remove('active');
}

function saveCurrentProject() {
    if (!currentProject) return;
    currentProject.modifiedDate = new Date().toISOString();
    const projectIndex = allProjects.findIndex(p => p.id === currentProject.id);
    if (projectIndex !== -1) {
        allProjects[projectIndex] = currentProject;
        localStorage.setItem(storageKey, JSON.stringify(allProjects));
        console.log("Project saved to localStorage:", currentProject.id);
    } else {
        console.error("Could not find project in list to save:", currentProject.id);
    }
}

function updateProjectUI() {
    console.log("[UI] Updating Project UI for:", currentProject?.title);
    const projectTitleDisplay = document.getElementById('project-title-display');
    if (projectTitleDisplay && currentProject) {
        projectTitleDisplay.textContent = currentProject.title;
        document.title = `Laira - ${currentProject.title}`;
    }
    loadSettings();
    if (typeof globalFetchNotes === 'function') {
        globalFetchNotes();
    }
}

async function loadProjectData(projectId) {
    console.log("[DATA] Loading initial project data for:", projectId);
    try {
        const [settings, history, filesResponse] = await Promise.all([
            api.getSettings(projectId).catch(e => { console.warn('Failed to get settings', e); return {}; }),
            api.getChatHistory(projectId).catch(e => { console.warn('Failed to get chat history', e); return []; }),
            api.loadProjectFiles(projectId).catch(e => { console.warn('Failed to load files', e); return { files: [] }; })
        ]);
        
        currentProject.settings = settings || { chat_settings: {}, ui_settings: {} };
        currentProject.chatHistory = history || [];
        let files = filesResponse?.files || [];
        currentProject.sources = files.map(file => ({
            filename: file.name || file.filename,
            size: file.size, type: file.type, status: 'success' 
        }));

        console.log("[DATA] Project data loaded:", { settings: !!settings, history: history.length, sources: files.length });
        return true;

    } catch (error) {
        console.error("Error loading project data:", error);
        showTemporaryStatus("Failed to load some project data.", true);
        return false;
    }
}

export async function setupProjectView(projectId) {
    if (projectViewListenersSetup) { 
        console.warn("[SETUP] setupProjectView called again, skipping re-initialization.");
        return; 
    }
    projectViewListenersSetup = true; 
    console.log(`[SETUP] Initializing project view for: ${projectId}`); 
    
    allProjects = JSON.parse(localStorage.getItem(storageKey) || '[]');
    const decodedProjectId = decodeURIComponent(projectId);
    currentProject = allProjects.find(p => p.id === decodedProjectId);
    
    if (!currentProject) {
        currentProject = {
            id: decodedProjectId, title: decodedProjectId.replace(/_/g, ' '),
            modifiedDate: new Date().toISOString(), sources: [], notes: [],
            chatHistory: [], settings: { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 8192 }, ui_settings: { theme: "light" } }
        };
        allProjects.push(currentProject);
        localStorage.setItem(storageKey, JSON.stringify(allProjects));
    } else {
        currentProject.notes = currentProject.notes || [];
        currentProject.sources = currentProject.sources || [];
        currentProject.chatHistory = currentProject.chatHistory || [];
        currentProject.settings = currentProject.settings || { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 8192 }, ui_settings: { theme: "light" } };
        currentProject.title = currentProject.title || decodedProjectId.replace(/_/g, ' ');
    }
    
    await loadProjectData(projectId);

    updateProjectUI();
    
    setupSources(currentProject);
    setupChat(projectId);
    setupEmbedding(projectId);
    initializeNotesPanel(projectId);
    
    setupTitleRenaming();
    setupResizing();
    
    const settingsModal = document.getElementById('settings-modal');
    const settingsForm = document.getElementById('settings-form');
    if(settingsForm) settingsForm.onsubmit = (e) => { 
        e.preventDefault(); 
        saveSettings(e);
        hideModal(settingsModal);
    };

    console.log("[SETUP] Project view fully initialized.");
}

function loadSettings() {
    const settings = currentProject.settings || { chat_settings: {}, ui_settings: {} };
    const chatSettings = settings.chat_settings || {};
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValueSpan = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');
    if (temperatureSlider) temperatureSlider.value = chatSettings.temperature ?? 0.2;
    if (temperatureValueSpan) temperatureValueSpan.textContent = parseFloat(temperatureSlider?.value || 0.2).toFixed(2);
    if (topPSlider) topPSlider.value = chatSettings.top_p ?? 0.95;
    if (topPValueSpan) topPValueSpan.textContent = parseFloat(topPSlider?.value || 0.95).toFixed(2);
}

function saveSettings(event) {
    event.preventDefault();
    const settingsModal = document.getElementById('settings-modal');
    const temperatureSlider = document.getElementById('temperature-slider');
    const topPSlider = document.getElementById('top-p-slider');
    const newSettings = {
        chat_settings: {
            temperature: parseFloat(temperatureSlider?.value || 0.2),
            top_p: parseFloat(topPSlider?.value || 0.95),
        },
    };
    currentProject.settings = newSettings;
    saveCurrentProject();
    showTemporaryStatus("Settings saved locally.");
    hideModal(settingsModal);
}

function setupTitleRenaming() {
    const projectTitleContainer = document.querySelector('.project-title-container');
    const projectTitleDisplay = document.getElementById('project-title-display');
    const renameBtn = document.getElementById('rename-project-btn');
    const saveRenameBtn = document.getElementById('save-rename-project-btn');
    const cancelRenameBtn = document.getElementById('cancel-rename-project-btn');
    let originalTitle = '';
    if (!projectTitleDisplay || !renameBtn || !saveRenameBtn || !cancelRenameBtn || !projectTitleContainer) return;
    renameBtn.addEventListener('click', () => {
        originalTitle = projectTitleDisplay.textContent;
        projectTitleDisplay.contentEditable = 'true';
        projectTitleDisplay.focus();
        projectTitleContainer.classList.add('editing');
    });
    saveRenameBtn.addEventListener('click', () => {
        const newTitle = projectTitleDisplay.textContent.trim();
        projectTitleDisplay.contentEditable = 'false';
        projectTitleContainer.classList.remove('editing');
        if (newTitle && newTitle !== originalTitle) {
            projectTitleDisplay.textContent = newTitle;
            document.title = `Laira - ${newTitle}`;
            currentProject.title = newTitle;
            saveCurrentProject();
            showTemporaryStatus("Project title updated locally.");
        } else {
            projectTitleDisplay.textContent = originalTitle;
        }
    });
    cancelRenameBtn.addEventListener('click', () => {
        projectTitleDisplay.textContent = originalTitle;
        projectTitleDisplay.contentEditable = 'false';
        projectTitleContainer.classList.remove('editing');
    });
    projectTitleDisplay.addEventListener('keydown', (e) => {
        if (projectTitleDisplay.contentEditable === 'true') {
            if (e.key === 'Enter') { e.preventDefault(); saveRenameBtn.click(); }
             else if (e.key === 'Escape') cancelRenameBtn.click();
        }
    });
}

function setupResizing() {
    const resizers = document.querySelectorAll('.project-container .resizer');
    const notesPanelDefaultWidthPx = 260;
    const notesPanelMaxWidthPx = notesPanelDefaultWidthPx * 2;
    const centralPanelMinWidthPx = 300;
    resizers.forEach(resizer => {
        let isResizing = false, startX = 0, chatPanelStartWidth = 0, notesPanelStartWidth = 0;
        let chatPanel = null, notesPanel = null;
        resizer.addEventListener('mousedown', (e) => {
            isResizing = true; startX = e.clientX;
            resizer.classList.add('resizing'); document.body.classList.add('resizing');
            chatPanel = document.querySelector('.chat-panel'); notesPanel = document.querySelector('.notes-panel');
            if (!chatPanel || !notesPanel) { isResizing = false; return; }
            chatPanelStartWidth = chatPanel.offsetWidth; notesPanelStartWidth = notesPanel.offsetWidth;
            document.addEventListener('mousemove', handleMouseMove);
            document.addEventListener('mouseup', handleMouseUp);
        });
        function handleMouseMove(e) {
            if (!isResizing || !chatPanel || !notesPanel) return;
            const deltaX = e.clientX - startX;
            let newChatWidthPx = chatPanelStartWidth + deltaX;
            let newNotesWidthPx = notesPanelStartWidth - deltaX;
            if (newNotesWidthPx > notesPanelMaxWidthPx) { newNotesWidthPx = notesPanelMaxWidthPx; newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelMaxWidthPx; }
            if (newNotesWidthPx < notesPanelDefaultWidthPx) { newNotesWidthPx = notesPanelDefaultWidthPx; newChatWidthPx = chatPanelStartWidth + notesPanelStartWidth - notesPanelDefaultWidthPx; }
            if (newChatWidthPx < centralPanelMinWidthPx) { newChatWidthPx = centralPanelMinWidthPx; newNotesWidthPx = chatPanelStartWidth + notesPanelStartWidth - centralPanelMinWidthPx; if (newNotesWidthPx > notesPanelMaxWidthPx) newNotesWidthPx = notesPanelMaxWidthPx; if (newNotesWidthPx < notesPanelDefaultWidthPx) newNotesWidthPx = notesPanelDefaultWidthPx; }
            newChatWidthPx = Math.max(0, newChatWidthPx); newNotesWidthPx = Math.max(0, newNotesWidthPx);
            const totalWidth = newChatWidthPx + newNotesWidthPx;
            const chatPercent = totalWidth > 0 ? (newChatWidthPx / totalWidth) * 100 : 50;
            const notesPercent = totalWidth > 0 ? (newNotesWidthPx / totalWidth) * 100 : 50;
            chatPanel.style.flexBasis = `${chatPercent}%`; notesPanel.style.flexBasis = `${notesPercent}%`;
            chatPanel.style.flexGrow = '0'; notesPanel.style.flexGrow = '0';
            chatPanel.style.flexShrink = '1'; notesPanel.style.flexShrink = '0';
        }
        function handleMouseUp() {
            if (!isResizing) return;
            isResizing = false; resizer.classList.remove('resizing'); document.body.classList.remove('resizing');
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
        }
    });
} 