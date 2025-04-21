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
            chatHistory: [], settings: { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 500 }, ui_settings: { theme: "light" } }
        };
        allProjects.push(currentProject);
        localStorage.setItem(storageKey, JSON.stringify(allProjects));
    } else {
        currentProject.notes = currentProject.notes || [];
        currentProject.sources = currentProject.sources || [];
        currentProject.chatHistory = currentProject.chatHistory || [];
        currentProject.settings = currentProject.settings || { chat_settings: { temperature: 0.2, top_p: 0.95, top_k: 40, max_output_tokens: 500 }, ui_settings: { theme: "light" } };
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
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn && settingsModal) {
        settingsBtn.addEventListener('click', () => showModal(settingsModal));
    }
    const settingsCancelBtn = settingsModal?.querySelector('.settings-cancel-btn');
    if (settingsCancelBtn) {
        settingsCancelBtn.addEventListener('click', () => hideModal(settingsModal));
    }
    // Close settings modal when clicking the header close icon
    const settingsCloseIcon = settingsModal?.querySelector('.modal-close-btn');
    if (settingsCloseIcon) {
        settingsCloseIcon.addEventListener('click', () => hideModal(settingsModal));
    }
    if(settingsForm) settingsForm.onsubmit = async (e) => { 
        e.preventDefault(); 
        await saveSettings(e);
        hideModal(settingsModal);
    };

    // Slider display updates in settings modal
    const tempSlider = document.getElementById('temperature-slider');
    const tempValue = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValue = document.getElementById('top-p-value');
    if (tempSlider && tempValue) {
        tempSlider.addEventListener('input', () => {
            tempValue.textContent = parseFloat(tempSlider.value).toFixed(2);
        });
    }
    if (topPSlider && topPValue) {
        topPSlider.addEventListener('input', () => {
            topPValue.textContent = parseFloat(topPSlider.value).toFixed(2);
        });
    }

    console.log("[SETUP] Project view fully initialized.");
}

function loadSettings() {
    const settings = currentProject.settings || { chat_settings: {}, ui_settings: {} };
    const chatSettings = settings.chat_settings || {};
    const procSettings = settings.processing_settings || {};
    const temperatureSlider = document.getElementById('temperature-slider');
    const temperatureValueSpan = document.getElementById('temperature-value');
    const topPSlider = document.getElementById('top-p-slider');
    const topPValueSpan = document.getElementById('top-p-value');
    if (temperatureSlider) temperatureSlider.value = chatSettings.temperature ?? 0.2;
    if (temperatureValueSpan) temperatureValueSpan.textContent = parseFloat(temperatureSlider?.value || 0.2).toFixed(2);
    if (topPSlider) topPSlider.value = chatSettings.top_p ?? 0.95;
    if (topPValueSpan) topPValueSpan.textContent = parseFloat(topPSlider?.value || 0.95).toFixed(2);
    const maxTokensSelect = document.getElementById('max-tokens-select');
    if (maxTokensSelect) maxTokensSelect.value = chatSettings.max_output_tokens ?? 500;
    const topKInput = document.getElementById('top-k-input');
    if (topKInput) topKInput.value = chatSettings.top_k ?? 40;
    // Processing settings
    const chunkStrategySelect = document.getElementById('chunk-strategy-select');
    if (chunkStrategySelect) chunkStrategySelect.value = procSettings.chunk_strategy || 'paragraph';
    const maxParaInput = document.getElementById('max-paragraph-length-input');
    if (maxParaInput) maxParaInput.value = procSettings.max_paragraph_length || 1000;
    const overlapInput = document.getElementById('chunk-overlap-input');
    if (overlapInput) overlapInput.value = procSettings.chunk_overlap || 200;
    const headingTextarea = document.getElementById('heading-patterns-textarea');
    if (headingTextarea && Array.isArray(procSettings.heading_patterns)) {
        headingTextarea.value = procSettings.heading_patterns.join('\n');
    }
}

async function saveSettings(event) {
    event.preventDefault();
    const settingsModal = document.getElementById('settings-modal');
    const temperatureSlider = document.getElementById('temperature-slider');
    const topPSlider = document.getElementById('top-p-slider');
    const maxTokensSelect = document.getElementById('max-tokens-select');
    const topKInput = document.getElementById('top-k-input');
    const newSettings = {
        chat_settings: {
            temperature: parseFloat(temperatureSlider?.value || 0.2),
            top_p: parseFloat(topPSlider?.value || 0.95),
            max_output_tokens: parseInt(maxTokensSelect?.value || '500', 10),
            top_k: parseInt(topKInput?.value || '40', 10)
        },
        processing_settings: {
            chunk_strategy: document.getElementById('chunk-strategy-select')?.value,
            max_paragraph_length: parseInt(document.getElementById('max-paragraph-length-input')?.value || '1000', 10),
            chunk_overlap: parseInt(document.getElementById('chunk-overlap-input')?.value || '200', 10),
            heading_patterns: document.getElementById('heading-patterns-textarea')?.value.split('\n').filter(Boolean)
        }
    };
    currentProject.settings = newSettings;
    // Persist settings to server
    try {
        const result = await api.saveSettings(currentProject.id, currentProject.settings);
        if (result.success) {
            showTemporaryStatus("Settings saved.");
        } else {
            showTemporaryStatus(`Error saving settings: ${result.error}`, true);
        }
    } catch (err) {
        console.error("saveSettings API error:", err);
        showTemporaryStatus("Error saving settings.", true);
    }
    // Update localStorage
    saveCurrentProject();
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
            // Generate new project ID from title
            const newProjectId = encodeURIComponent(newTitle.replace(/\s+/g, '_'));
            // Call backend to rename folder
            api.renameProject(currentProject.id, newProjectId)
            .then(res => {
                if (res.success) {
                    // Update front-end state and redirect to new project URL
                    showTemporaryStatus(res.message);
                    // Update local project list
                    currentProject.id = newProjectId;
                    currentProject.title = newTitle;
                    saveCurrentProject();
                    // Redirect to new project view
                    window.location.href = `/project/${newProjectId}`;
                } else {
                    showTemporaryStatus(`Rename failed: ${res.error}`, true);
                    projectTitleDisplay.textContent = originalTitle;
                }
            })
            .catch(err => {
                console.error('Error renaming project:', err);
                showTemporaryStatus('Rename failed.', true);
                projectTitleDisplay.textContent = originalTitle;
            });
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