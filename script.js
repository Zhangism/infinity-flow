// script.js - Standard Script Version

// --- Global State ---
window.appData = {
    currentWeekFile: null,
    weekId: null,
    weekData: null,
    longTermData: null,
    recurringData: null,
    currentDateStr: window.getLocalTodayStr(),
    timerInterval: null,
    currentTimerTaskId: null,
    undoState: null,
    undoTimeout: null
};

// --- Expose Globals for Legacy Scripts ---
// window.getWeekFileName and window.formatTime are already on window from utils.js
window.readJson = window.StorageModule.readJson; 
window.writeJson = window.StorageModule.writeJson;

// Shared Drag & Drop Globals
window.dragSrcType = null;
window.dragPayload = null;

// Proxy dirHandle
Object.defineProperty(window, 'dirHandle', {
    get: () => window.StorageModule.dirHandle,
    set: (val) => { /* read-only external set */ }
});

// --- Initialization ---

// --- Theme Switcher ---
window.setupThemeSwitcher = function() {
    const themeSwitcher = document.getElementById('theme-switcher');
    const themeToggle = document.getElementById('theme-toggle');
    const themeMenu = document.getElementById('theme-menu');
    const themeLabel = document.getElementById('theme-label');
    const themeOptions = document.querySelectorAll('.theme-option');
    
    if (!themeSwitcher || !themeToggle) return;
    
    // Load saved theme
    const savedTheme = localStorage.getItem('app-theme') || 'minimal';
    applyTheme(savedTheme);
    
    // Toggle menu
    themeToggle.addEventListener('click', (e) => {
        e.stopPropagation();
        themeSwitcher.classList.toggle('open');
        themeToggle.setAttribute('aria-expanded', themeSwitcher.classList.contains('open'));
    });
    
    // Theme option click
    themeOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.stopPropagation();
            const theme = option.dataset.theme;
            applyTheme(theme);
            localStorage.setItem('app-theme', theme);
            themeSwitcher.classList.remove('open');
            themeToggle.setAttribute('aria-expanded', 'false');
        });
    });
    
    // Close on outside click
    document.addEventListener('click', (e) => {
        if (!themeSwitcher.contains(e.target)) {
            themeSwitcher.classList.remove('open');
            themeToggle.setAttribute('aria-expanded', 'false');
        }
    });
    
    function applyTheme(theme) {
        // Remove all theme classes
        document.body.classList.remove('theme-dark', 'theme-paper');
        
        // Apply new theme
        if (theme === 'dark') {
            document.body.classList.add('theme-dark');
        } else if (theme === 'paper') {
            document.body.classList.add('theme-paper');
        }
        // 'minimal' is the default, no class needed
        
        // Update label
        const labels = { minimal: '极简', dark: '暗色', paper: '纸感' };
        if (themeLabel) themeLabel.textContent = labels[theme] || '极简';
        
        // Update active state
        themeOptions.forEach(opt => {
            opt.classList.toggle('active', opt.dataset.theme === theme);
        });
    }
};

window.onload = async () => {
    // External Scripts Init
    if (window.setupThemeSwitcher) window.setupThemeSwitcher();
    if (window.setupTimerStyle) window.setupTimerStyle();
    
    setupResizer();
    loadSettings();
    
    // Global dragend cleanup
    document.addEventListener('dragend', () => {
        document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));
        document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
        document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    });
    
    // 预创建拖拽预览元素
    ensureDragPreviewElement();

    // Calendar Initialization (Moved up to ensure execution)
    if (window.CalendarModule) {
        console.log('Instantiating CalendarModule...');
        window.calendarModule = new window.CalendarModule();
        window.calendarModule.init();
    } else {
        console.error('CalendarModule class not found on window!');
    }
    
    // Auto Load
    const auto = await window.StorageModule.tryAutoLoadWorkspace();
    if (auto && auto.status === 'ready') {
        await loadAllData();
    } else {
        window.showWorkspaceIntro(auto);
    }
};

function setInlineError(inputEl, errorEl, message) {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    errorEl.style.display = message ? 'block' : 'none';
    if (inputEl) inputEl.classList.toggle('is-invalid', !!message);
}

function ensureDailySummaryAutosize() {
    const el = document.getElementById('daily-summary');
    if (!el) return;

    const maxHeight = 220;
    const resize = () => {
        const prevScrollY = window.scrollY;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, maxHeight) + 'px';
        el.style.overflowY = el.scrollHeight > maxHeight ? 'auto' : 'hidden';
        if (window.scrollY !== prevScrollY) window.scrollTo(window.scrollX, prevScrollY);
    };

    el.addEventListener('input', resize, { passive: true });
    resize();
}

window.showWorkspaceIntro = function(autoResult) {
    const intro = document.getElementById('intro-screen');
    if (!intro) return;

    const messageEl = document.getElementById('intro-message') || intro.querySelector('p');
    const buttonEl = document.getElementById('workspace-open-btn') || intro.querySelector('button');

    if (autoResult && autoResult.status === 'needs-permission') {
        const name = autoResult.handleName ? `（${autoResult.handleName}）` : '';
        if (messageEl) {
            messageEl.innerHTML = `检测到上次的工作区${name}。<br>点击下方按钮授权访问即可，无需重新选择文件夹。`;
        }
        if (buttonEl) buttonEl.textContent = '✅ 授权并打开工作区';
    } else {
        if (messageEl) {
            messageEl.innerHTML = '数据存储在您的本地文件系统中。<br>请选择一个文件夹作为工作区。';
        }
        if (buttonEl) buttonEl.textContent = '📂 打开本地工作区';
    }

    intro.style.display = 'flex';
};

async function loadAllData() {
    try {
        window.appData.weekId = window.getWeekId(window.appData.currentDateStr);
        window.appData.currentWeekFile = window.getWeekFileName(window.appData.currentDateStr);

        // Load Data
        window.appData.recurringData = await window.StorageModule.readJson('recurring_tasks.json') || { recurring: [] };
        if (!Array.isArray(window.appData.recurringData.recurring)) window.appData.recurringData.recurring = [];

        window.appData.longTermData = await window.StorageModule.readJson('long_term_goals.json') || { goals: [] };

        let wData = await window.StorageModule.readJson(window.appData.currentWeekFile);
        if (!wData) {
            wData = { weekId: window.appData.weekId, weeklyTasks: [], dailyData: {} };
        }
        if (!wData.weekId) wData.weekId = window.appData.weekId;
        
        // Ensure Day Data with schedule array
        if (!wData.dailyData[window.appData.currentDateStr]) {
            wData.dailyData[window.appData.currentDateStr] = { tasks: [], recommendations: [], summary: "", schedule: [] };
        }
        // Ensure schedule array exists for existing data
        if (!wData.dailyData[window.appData.currentDateStr].schedule) {
            wData.dailyData[window.appData.currentDateStr].schedule = [];
        }
        
        window.appData.weekData = wData;

        // Inbox & Snippets
        if (typeof window.loadInbox === 'function') await window.loadInbox();
        if (typeof window.loadSnippets === 'function') await window.loadSnippets();

        // Initialize Schedule Module
        if (typeof window.ScheduleModule?.init === 'function') {
            await window.ScheduleModule.init();
        }

        // Timer Loop
        if (window.appData.timerInterval) clearInterval(window.appData.timerInterval);
        window.appData.timerInterval = setInterval(() => {
            if (typeof window.updateTimerUI === 'function') window.updateTimerUI();
        }, 1000);

        window.UIModule.updateDateHeader(window.appData.currentDateStr, window.appData.weekId);

        window.UIModule.renderAll(window.appData);
        
        // Render schedule blocks after data load
        if (typeof window.ScheduleModule?.renderScheduleBlocks === 'function') {
            window.ScheduleModule.renderScheduleBlocks();
        }
        
        ensureDailySummaryAutosize();

    } catch (e) {
        console.error("Data load failed", e);
        window.showAlert("加载数据失败：" + (e?.message || '未知错误'), '错误');
    }
}

async function saveData() {
    window.UIModule.updateSaveIndicator('saving');
    try {
        const files = [
            { name: window.appData.currentWeekFile, data: window.appData.weekData },
            { name: 'long_term_goals.json', data: window.appData.longTermData },
            { name: 'recurring_tasks.json', data: window.appData.recurringData }
        ];
        await window.StorageModule.saveDataToDisk(files);
        
        // Invalidate Calendar Cache for the current view
        if (window.calendarModule) {
            window.calendarModule.invalidateCache(window.appData.currentDateStr);
        }

        window.UIModule.updateSaveIndicator('saved');
    } catch (e) {
        console.error(e);
        window.UIModule.updateSaveIndicator('error');

        const msg = String(e?.message || '未知错误');
        const isPermissionLike = /permission|denied|notallowed|security/i.test(msg) || /NotAllowedError|SecurityError/i.test(String(e?.name || ''));
        const hint = isPermissionLike
            ? '可能是工作区权限已失效。你可以在“设置”里点击「📂 切换工作区」重新授权。'
            : '你可以在“设置”里点击「📂 切换工作区」重新选择工作区后重试。';

        if (typeof window.showConfirm === 'function') {
            window.showConfirm(`保存失败：${msg}\n\n${hint}\n\n现在打开设置？`, () => {
                if (typeof window.openSettings === 'function') window.openSettings();
            }, '保存失败');
        } else if (typeof window.showAlert === 'function') {
            window.showAlert(`保存失败：${msg}\n\n${hint}`, '保存失败');
        }
    }
}
const debouncedSave = window.debounce(saveData, 1000);
window.saveData = saveData; 
window.debouncedSave = debouncedSave;

// --- Expose Renderers ---
window.renderDaily = () => window.UIModule.renderDaily(window.appData.weekData.dailyData[window.appData.currentDateStr], window.appData.currentDateStr);
window.renderWeekly = () => window.UIModule.renderWeekly(window.appData.weekData.weeklyTasks, window.appData.currentDateStr);
window.renderRecommendations = () => window.UIModule.renderRecommendations(window.appData.weekData.dailyData[window.appData.currentDateStr].recommendations);
window.renderRecurring = () => window.UIModule.renderRecurring(window.appData.recurringData.recurring);
window.renderLongTerm = () => window.UIModule.renderLongTerm(window.appData.longTermData.goals);

// --- Undo System ---
window.pushUndo = function(type, payload, message) {
    // Clear existing timeout
    if (window.appData.undoTimeout) clearTimeout(window.appData.undoTimeout);
    
    window.appData.undoState = { type, payload };
    if (window.UIModule?.showToast) {
        window.UIModule.showToast(message, {
            type: 'info',
            duration: 5000,
            actionText: '撤销',
            onAction: () => {
                if (typeof window.performUndo === 'function') window.performUndo();
            }
        });
    } else {
        // Fallback or remove if sure UIModule.showToast exists
        console.warn('UIModule.showToast not found');
    }

    // Auto-clear after 5 seconds
    window.appData.undoTimeout = setTimeout(() => {
        window.appData.undoState = null;
        if (window.UIModule?.hideToast) window.UIModule.hideToast();
    }, 5000);
};

window.performUndo = function() {
    const state = window.appData.undoState;
    if (!state) return;

    if (state.type === 'DELETE_TASK') {
        const { task, date } = state.payload;
        // Restore task
        if (window.appData.weekData.dailyData[date]) {
            window.appData.weekData.dailyData[date].tasks.push(task);
            window.renderDaily();
            saveData();
        }
    } else if (state.type === 'MOVE_TASK') {
        const { taskId, fromDate, fromQuadrant, toQuadrant } = state.payload;
        if (window.appData.weekData.dailyData[fromDate]) {
            const tasks = window.appData.weekData.dailyData[fromDate].tasks;
            const task = tasks.find(t => t.id === taskId);
            if (task) {
                task.quadrant = fromQuadrant;
                window.renderDaily();
                saveData();
            }
        }
    }

    // Clear state
    window.appData.undoState = null;
    if (window.UIModule?.hideToast) window.UIModule.hideToast();
    if (window.appData.undoTimeout) clearTimeout(window.appData.undoTimeout);
};

// --- Modal Helpers ---
window.showConfirm = function(message, onConfirm, title="确认") {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    const yesBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');
    
    // Reset buttons
    yesBtn.style.display = 'inline-block';
    cancelBtn.style.display = 'inline-block';
    yesBtn.innerText = "确认";

    yesBtn.onclick = () => {
        onConfirm();
        window.closeConfirmModal();
    };
    document.getElementById('confirm-modal-overlay').style.display = 'flex';
};

window.showAlert = function(message, title="Alert") {
    document.getElementById('confirm-title').innerText = title;
    document.getElementById('confirm-message').innerText = message;
    const yesBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');

    // Hide cancel, change confirm to OK
    cancelBtn.style.display = 'none';
    yesBtn.innerText = "知道了";
    yesBtn.style.display = 'inline-block';

    yesBtn.onclick = () => {
        window.closeConfirmModal();
    };
    document.getElementById('confirm-modal-overlay').style.display = 'flex';
};

window.closeConfirmModal = function() {
    document.getElementById('confirm-modal-overlay').style.display = 'none';
};

// --- Controller Logic ---

window.selectWorkspace = async function() {
    const handle = await window.StorageModule.selectWorkspace();
    if (handle) {
        document.getElementById('intro-screen').style.display = 'none';
        await loadAllData();
    }
};

// Prefer this entry point from the intro screen:
// - If a workspace was remembered but needs permission, request it via user gesture.
// - Otherwise, let the user pick a folder.
window.openWorkspace = async function() {
    const handle = await window.StorageModule.requestSavedWorkspacePermission();
    if (handle) {
        document.getElementById('intro-screen').style.display = 'none';
        await loadAllData();
        return;
    }
    await window.selectWorkspace();
};

window.refreshApp = () => location.reload();

window.changeDate = function(offset) {
    const d = new Date(window.appData.currentDateStr);
    d.setDate(d.getDate() + offset);
    window.appData.currentDateStr = d.toISOString().split('T')[0];
    loadAllData();
};

window.goToDate = function(val) {
    if(!val) return;
    window.appData.currentDateStr = val;
    loadAllData();
    window.closeSearchResults();
};

window.closeSearchResults = function() {
    document.getElementById('search-results-overlay').style.display = 'none';
};

window.goToToday = function() {
    window.appData.currentDateStr = window.getLocalTodayStr();
    loadAllData();
};

// Weekly Tasks
window.addWeeklyTaskUI = function() {
    const input = document.getElementById('new-weekly-input');
    const val = input.value.trim();
    if (!val) return;
    window.appData.weekData.weeklyTasks.push({ id: window.uuid(), content: val, deadline: '', completed: false });
    input.value = '';
    window.renderWeekly();
    saveData();
};

window.toggleWeeklyCheck = function(id) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if(t) t.completed = !t.completed;
    saveData();
    window.renderWeekly();
};

window.updateWeeklyText = function(id, txt) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if(t && t.content !== txt) { t.content = txt; saveData(); }
};

window.updateWeeklyDate = function(id, date) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if(t) { t.deadline = date; saveData(); window.renderWeekly(); }
};

window.deleteWeeklyTask = function(id) {
    window.animateAndDelete(`weekly-task-${id}`, () => {
        const idx = window.appData.weekData.weeklyTasks.findIndex(t => t.id === id);
        if (idx > -1) {
            window.appData.weekData.weeklyTasks.splice(idx, 1);
            saveData();
            window.renderWeekly();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除周任务', { type: 'info' });
        }
    });
};

// Daily Tasks
window.addDailyTaskUI = function(quadrant) {
    const input = document.getElementById(`input-q${quadrant}`);
    const val = input.value.trim();
    if(!val) return;
    
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    tasks.push({
        id: window.uuid(),
        content: val,
        quadrant: quadrant,
        progress: 0,
        timer: { totalWork: 0, lastStart: null, isRunning: false },
        subtasks: []
    });
    input.value = '';
    window.renderDaily();
    saveData();
};

window.deleteDailyTask = function(id) {
    window.animateAndDelete(`task-${id}`, () => {
        const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        const idx = tasks.findIndex(t => t.id === id);
        if (idx > -1) {
            const [task] = tasks.splice(idx, 1);
            window.pushUndo('DELETE_TASK', { task: task, date: window.appData.currentDateStr }, "任务已删除，撤销？");
            saveData();
            window.renderDaily();
        }
    });
};

window.updateDailyText = function(id, txt) {
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if(task && task.content !== txt) {
        task.content = txt;
        saveData();
    }
};

window.updateDailyProgressUI = function(id, el) {
    const val = el.value;
    el.style.backgroundSize = `${val}% 100%`;
    const pctSpan = document.getElementById(`pct-${id}`);
    if(pctSpan) pctSpan.innerText = val + '%';
    
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if(task) {
        const oldProgress = task.progress;
        task.progress = parseInt(val);
        if (task.progress >= 100 && oldProgress < 100) {
            // Trigger Confetti
            const rect = el.getBoundingClientRect();
            window.triggerConfetti(rect.left + rect.width/2, rect.top);
            
            // Render update
            window.renderDaily();
        } else if (task.progress < 100 && oldProgress >= 100) {
            window.renderDaily();
        }
    }
};

window.resetTask = function(id) {
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if(task) {
        task.progress = 0;
        window.renderDaily();
        saveData();
    }
};

// Subtasks
window.addSubtaskUI = function(taskId) {
    const input = document.getElementById(`subtask-input-${taskId}`);
    const val = input.value.trim();
    if (!val) return;

    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        task.subtasks.push({ id: window.uuid(), content: val, completed: false });
        input.value = '';
        updateDailyProgressFromSubtasks(task);
        window.renderDaily();
        saveData();
    }
};

window.toggleSubtaskCompletion = function(taskId, subtaskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.completed = !subtask.completed;
            updateDailyProgressFromSubtasks(task);
            window.renderDaily();
            saveData();
        }
    }
};

window.deleteSubtask = function(taskId, subtaskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
        updateDailyProgressFromSubtasks(task);
        window.renderDaily();
        saveData();
    }
};

window.updateSubtaskContent = function(taskId, subtaskId, content) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.content = content;
            saveData();
        }
    }
};

function updateDailyProgressFromSubtasks(task) {
    if (task && task.subtasks.length > 0) {
        const completedCount = task.subtasks.filter(st => st.completed).length;
        task.progress = Math.round((completedCount / task.subtasks.length) * 100);
    }
}

// Recurring & Long Term & Recommendations
window.addRecurringTaskUI = function() {
    const input = document.getElementById('new-recurring-input');
    const val = input.value.trim();
    if (!val) return;
    window.appData.recurringData.recurring.push({ id: window.uuid(), title: val });
    input.value = '';
    window.renderRecurring();
    saveData();
};

window.deleteRecurringTask = function(id) {
    window.animateAndDelete(`recurring-${id}`, () => {
        window.appData.recurringData.recurring = window.appData.recurringData.recurring.filter(t => t.id !== id);
        saveData();
        window.renderRecurring();
        if (window.UIModule?.showToast) window.UIModule.showToast('已删除日常模板', { type: 'info' });
    });
};

window.updateRecurringTitle = function(id, txt) {
    const tpl = window.appData.recurringData.recurring.find(t => t.id === id);
    if (tpl) { tpl.title = txt; saveData(); }
};

window.addLongTermGoalUI = function() {
    const input = document.getElementById('new-goal-input');
    if(!input.value) return;
    window.appData.longTermData.goals.push({ title: input.value, subGoals: [] });
    input.value = '';
    window.renderLongTerm();
    saveData();
};

window.deleteLongTermGoal = function(i) {
    // Note: Long Term Goals are rendered by index, not stable ID. 
    // We'd need to modify renderLongTerm to give them IDs if we want smooth delete.
    // For now, let's keep it simple or use a querySelector by index?
    // Let's assume the renderLongTerm assigns IDs? It doesn't yet.
    // We will skip animation for Long Term Goals for this step or update renderLongTerm next.
    // For consistency, let's just do the deletion.
    window.appData.longTermData.goals.splice(i, 1);
    saveData();
    window.renderLongTerm();
    if (window.UIModule?.showToast) window.UIModule.showToast('已删除长期目标', { type: 'info' });
};

window.addSubGoalUI = function(idx) {
     const input = document.createElement('input');
    input.placeholder = "输入子目标名称然后回车";
    input.style.cssText = "width:100%; padding:5px; margin-top:5px; border:1px solid #ccc; font-size:12px;";
    input.onkeydown = (e) => {
        if(e.key === 'Enter' && input.value) {
            window.appData.longTermData.goals[idx].subGoals.push({ title: input.value, progress: 0 });
            window.renderLongTerm();
            saveData();
        }
    };
    document.getElementById('long-term-list').children[idx].appendChild(input);
    input.focus();
};

window.deleteSubGoal = function(gIdx, sIdx) {
    window.appData.longTermData.goals[gIdx].subGoals.splice(sIdx, 1);
    saveData();
    window.renderLongTerm();
    if (window.UIModule?.showToast) window.UIModule.showToast('已删除子目标', { type: 'info' });
};

window.updateSubGoal = function(gIdx, sIdx, el) {
    const val = el.value;
    el.style.backgroundSize = `${val}% 100%`;
    el.previousElementSibling.innerText = `${val}%`;
    window.appData.longTermData.goals[gIdx].subGoals[sIdx].progress = parseInt(val);
    debouncedSave();
};

window.deleteRecommendation = function(id) {
    window.animateAndDelete(`rec-${id}`, () => {
        const recs = window.appData.weekData.dailyData[window.appData.currentDateStr].recommendations;
        const idx = recs.findIndex(t => t.id === id);
        if (idx > -1) {
            recs.splice(idx, 1);
            saveData();
            window.renderRecommendations();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除推荐任务', { type: 'info' });
        }
    });
};

// Summary
window.handleSummaryInput = function() {
    const val = document.getElementById('daily-summary').value;
    window.appData.weekData.dailyData[window.appData.currentDateStr].summary = val;
    debouncedSave();
};

window.toggleSummaryEdit = function(showEdit) {
    const view = document.getElementById('daily-summary-view');
    const edit = document.getElementById('daily-summary');
    if (showEdit) {
        view.style.display = 'none';
        edit.style.display = 'block';
        edit.focus();
    } else {
        if (typeof marked !== 'undefined') {
            view.innerHTML = marked.parse(edit.value);
        } else {
            view.innerText = edit.value;
        }
        edit.style.display = 'none';
        view.style.display = 'block';
    }
};

// Summary Dock Toggle
window.toggleSummaryDock = function() {
    const dock = document.getElementById('bottom-summary-dock');
    const toggleBtn = document.getElementById('dock-toggle-btn');
    if (dock) {
        dock.classList.toggle('collapsed');
        if (toggleBtn) {
            toggleBtn.textContent = dock.classList.contains('collapsed') ? '▲' : '▼';
        }
    }
};

// Settings
window.openSettings = function() { document.getElementById('settings-overlay').style.display = 'flex'; };
window.closeSettings = function() { document.getElementById('settings-overlay').style.display = 'none'; };

function loadSettings() {
    const aiBaseUrl = localStorage.getItem('aiBaseUrl') || 'http://10.204.65.181:3000/api';
    const aiKey = localStorage.getItem('aiKey') || '';
    const aiModel = localStorage.getItem('aiModel') || 'deepseek-r1:latest';
    const aiCustomPrompt = localStorage.getItem('aiCustomPrompt') || '';
    document.getElementById('ai-base-url').value = aiBaseUrl;
    document.getElementById('ai-key').value = aiKey;
    document.getElementById('ai-model').value = aiModel;
    document.getElementById('ai-custom-prompt').value = aiCustomPrompt;
}
window.loadSettings = loadSettings;

window.saveSettings = function() {
    const aiBaseUrl = document.getElementById('ai-base-url').value;
    const aiKey = document.getElementById('ai-key').value;
    const aiModel = document.getElementById('ai-model').value;
    const aiCustomPrompt = document.getElementById('ai-custom-prompt').value;
    localStorage.setItem('aiBaseUrl', aiBaseUrl);
    localStorage.setItem('aiKey', aiKey);
    localStorage.setItem('aiModel', aiModel);
    localStorage.setItem('aiCustomPrompt', aiCustomPrompt);
    window.closeSettings();
};

// Analytics
window.openAnalytics = function() {
    document.getElementById('analytics-overlay').style.display = 'flex';
    window.switchAnalyticsTab('daily');
};

window.closeAnalytics = function() {
    document.getElementById('analytics-overlay').style.display = 'none';
};

window.switchAnalyticsTab = function(tab) {
    document.querySelectorAll('#analytics-modal .tab-btn').forEach(el => el.classList.remove('active'));
    document.querySelector(`#analytics-modal .tab-btn[onclick="switchAnalyticsTab('${tab}')"]`).classList.add('active');

    switch (tab) {
        case 'daily':
            window.UIModule.renderDailyAnalytics(window.appData.weekData.dailyData[window.appData.currentDateStr]);
            break;
        case 'weekly':
            window.UIModule.renderWeeklyAnalytics(window.appData.weekData);
            break;
        case 'monthly':
            window.UIModule.renderMonthlyAnalytics(window.StorageModule.dirHandle, window.appData.currentDateStr);
            break;
    }
};

// Focus Mode
window.enterFocusMode = function(qid) {
    const isAlreadyFocused = document.body.classList.contains('focus-mode') && document.getElementById(qid).classList.contains('focused');
    if (isAlreadyFocused) {
        window.exitFocusMode();
    } else {
        document.body.classList.add('focus-mode');
        document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
        document.getElementById(qid).classList.add('focused');
    }
};

window.exitFocusMode = function() {
    document.body.classList.remove('focus-mode');
    document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
};

// Search
window.toggleExportDialog = function() {
    const overlay = document.getElementById('dialog-overlay');
    if (overlay.style.display === 'flex') {
        overlay.style.display = 'none';
    } else {
        overlay.style.display = 'flex';
        // Basic Export Content
        document.getElementById('dialog-content').innerHTML = `
            <h3>导出数据</h3>
            <p>点击下载当前周数据。</p>
            <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-small" onclick="document.getElementById('dialog-overlay').style.display='none'">关闭</button>
                <button class="btn-small" onclick="executeExport()">下载 JSON</button>
            </div>
        `;
    }
};

window.executeExport = function() {
    const exportData = { 
        weekData: window.appData.weekData, 
        longTerm: window.appData.longTermData, 
        recurring: window.appData.recurringData 
    };
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `Backup_${window.appData.weekId || 'data'}.json`;
    a.click();
    window.toggleExportDialog();
};

window.searchAllFiles = async function(keyword) {
    const inputEl = document.getElementById('search-input');
    const errorEl = document.getElementById('search-error');
    const raw = (keyword ?? inputEl?.value ?? '').toString();
    const normalized = raw.trim();
    setInlineError(inputEl, errorEl, '');

    if (!window.dirHandle) {
        setInlineError(inputEl, errorEl, '请先打开项目工作区后再搜索。');
        return;
    }
    if (!normalized) {
        setInlineError(inputEl, errorEl, '请输入要搜索的关键词。');
        return;
    }

    const results = [];
    const lowerKey = normalized.toLowerCase();

    try {
        for await (const entry of window.dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.match(/^\d{4}_W\d+\.json$/)) {
                try {
                    const data = await window.readJson(entry.name);
                    if (!data) continue;

                    // Search Daily Tasks
                    if (data.dailyData) {
                        for (const date in data.dailyData) {
                            const day = data.dailyData[date];
                            if (day.tasks) {
                                day.tasks.forEach(t => {
                                    if (t.content && t.content.toLowerCase().includes(lowerKey)) {
                                        results.push({
                                            date: date,
                                            weekId: data.weekId,
                                            quadrant: t.quadrant,
                                            content: t.content,
                                            completed: t.progress >= 100,
                                            matchContext: '任务内容'
                                        });
                                    }
                                    if (t.subtasks) {
                                        t.subtasks.forEach(st => {
                                            if (st.content && st.content.toLowerCase().includes(lowerKey)) {
                                                results.push({
                                                    date: date,
                                                    weekId: data.weekId,
                                                    quadrant: t.quadrant,
                                                    content: `子任务：${st.content}（所属：${t.content}）`,
                                                    completed: st.completed,
                                                    matchContext: '子任务'
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                            if (day.summary && day.summary.toLowerCase().includes(lowerKey)) {
                                results.push({
                                    date: date,
                                    weekId: data.weekId,
                                    quadrant: null,
                                    content: '日复盘',
                                    completed: false,
                                    matchContext: day.summary.substring(0, 50) + '...'
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to read/parse ${entry.name}`, e);
                }
            }
        }
    } catch (e) {
        console.error("Search failed", e);
        setInlineError(inputEl, errorEl, '搜索失败：' + (e?.message || '未知错误'));
    }

    window.UIModule.renderSearchResults(results);
};

// AI & Automation
// (Core AI helpers in utils.js, Feature logic below)

async function callChatCompletions({ baseUrl, key, model }, messages) {
    if (!baseUrl) throw new Error('AI not configured.');
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, messages, stream: false })
        });
    } catch (_) {
        throw new Error('AI network error.');
    }

    if (!response.ok) {
        // Avoid surfacing raw backend/LLM details into UI.
        throw new Error(`AI request failed (${response.status}).`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
}

async function callChatCompletionsRaw({ baseUrl, key, model }, messages) {
    if (!baseUrl) throw new Error('AI not configured.');
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, messages, stream: false })
        });
    } catch (err) {
        return {
            ok: false,
            status: 0,
            statusText: 'NETWORK_ERROR',
            text: String(err?.message || err),
            content: ''
        };
    }

    const text = await response.text();
    let content = '';
    try {
        const data = JSON.parse(text);
        content = data?.choices?.[0]?.message?.content || '';
    } catch (_) {
        // Non-JSON response; keep raw text.
    }

    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        content
    };
}

window.generateAutoSummary = async function() {
    const summaryTextarea = document.getElementById('daily-summary');
    if (!summaryTextarea) return;
    
    const aiBaseUrl = localStorage.getItem('aiBaseUrl');
    const aiKey = localStorage.getItem('aiKey');
    const aiModel = localStorage.getItem('aiModel');
    
    if (!aiBaseUrl) {
        window.showAlert("请先在“设置”中配置 AI 基础地址。", '提示');
        return;
    }

    // 1. 获取历史 Context (RAG Lite)
    window.UIModule.updateSaveIndicator('saving'); // 借用 saving 状态显示 loading
    const historyContext = await fetchRecentSummaries(7);

    // 2. 获取今日数据
    const dailyData = window.appData.weekData.dailyData[window.appData.currentDateStr];
    const tasks = dailyData.tasks || [];
    const completedTasks = tasks.filter(t => t.progress >= 100);
    const unfinishedTasks = tasks.filter(t => t.progress < 100);
    const totalTime = tasks.reduce((acc, t) => acc + (t.timer?.totalWork || 0) + (t.timer?.totalPomodoro || 0), 0);
    
    const currentContext = `
        Date: ${window.appData.currentDateStr}
        Completed Tasks: ${completedTasks.map(t => t.content).join(', ')}
        Unfinished Tasks: ${unfinishedTasks.map(t => t.content).join(', ')}
        Total Focus Time: ${window.formatTimeForAnalytics(totalTime)}
        Long Term Goals: ${(window.appData.longTermData?.goals || []).map(g => g.title).join(', ')}
    `;

    const fullContext = `
        ${historyContext}
        
        Current Day Data:
        ${currentContext}
    `;

    const systemPrompt = localStorage.getItem('aiCustomPrompt') || "你是一名生产力教练。根据提供的数据总结用户的一天。使用Markdown格式（成就 🌟，分析 ⏱️，建议 💡）。保持简洁。如果提供了历史数据，提及任何趋势。";

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (aiKey) headers['Authorization'] = 'Bearer ' + aiKey;

        const response = await fetch(`${aiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: aiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: fullContext + "\n\n根据数据对用户今天的工作进行复盘:" }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const summaryRaw = data.choices[0].message.content;
        const summary = (summaryRaw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
        
        window.appData.weekData.dailyData[window.appData.currentDateStr].summary = summary;
        window.UIModule.renderAll(window.appData); // re-render to update summary view
        saveData();
        window.UIModule.updateSaveIndicator('saved');

    } catch (e) {
        console.error(e);
        window.showAlert("AI 复盘生成失败：" + (e?.message || '未知错误'), '错误');
        window.UIModule.updateSaveIndicator('error');
    }
};

window.finalizeDayAndWeek = async function() {
    // Check for completed but unscheduled tasks first
    if (typeof window.ScheduleModule?.checkCompletedButUnscheduled === 'function') {
        const check = window.ScheduleModule.checkCompletedButUnscheduled();
        if (check.hasIssues) {
            const taskNames = check.tasks.map(t => `• ${t.content}`).slice(0, 5).join('\n');
            const moreText = check.tasks.length > 5 ? `\n...及其他 ${check.tasks.length - 5} 个任务` : '';
            const proceed = await new Promise(resolve => {
                window.showConfirm(
                    `以下已完成任务未排入时间轴：\n${taskNames}${moreText}\n\n是否继续完成今天的工作？`,
                    () => resolve(true),
                    '未排程任务提醒'
                );
                // Set up cancel handler
                setTimeout(() => {
                    const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');
                    if (cancelBtn) {
                        const originalClick = cancelBtn.onclick;
                        cancelBtn.onclick = () => {
                            if (originalClick) originalClick();
                            resolve(false);
                        };
                    }
                }, 0);
            });
            if (!proceed) return;
        }
    }

    const todayStr = window.appData.currentDateStr;
    const todayDate = new Date(todayStr);
    const nextDate = new Date(todayDate);
    nextDate.setDate(nextDate.getDate() + 1);
    const nextDateStr = nextDate.toISOString().split('T')[0];
    
    const todayDay = window.appData.weekData.dailyData[todayStr];
    if (!todayDay) return;

    // 1. 收集未完成的每日任务
    const unfinishedDaily = (todayDay.tasks || []).filter(t => t.progress < 100);
    
    // 2. 收集未完成的周任务 (仅限周日)
    let unfinishedWeekly = [];
    if (todayDate.getDay() === 0) { // 0 is Sunday
        unfinishedWeekly = (window.appData.weekData.weeklyTasks || []).filter(t => !t.completed);
    }

    // 3. 收集今日推荐任务 (未处理的)
    // 推荐任务本身没有 "completed" 状态，通常如果被拖拽走了就不在列表里了。
    // 如果还在列表里，说明没做或者没采纳，都应该顺延到明天。
    const pendingRecommendations = todayDay.recommendations || [];

    const count = unfinishedDaily.length + unfinishedWeekly.length + pendingRecommendations.length;
    if (count === 0) {
        if (window.UIModule?.showToast) {
            window.UIModule.showToast('今天没有需要迁移的项目', { type: 'info' });
        } else {
            window.showAlert("今天没有未完成的任务或推荐任务需要迁移。", "提示");
        }
        return;
    }

    window.showConfirm(`将 ${count} 个项目移动到明天的推荐列表?\n(含: ${unfinishedDaily.length} 个未完成任务, ${unfinishedWeekly.length} 个周任务, ${pendingRecommendations.length} 个推荐任务)`, async () => {
        window.UIModule.updateSaveIndicator('saving');

        try {
            // 确定目标文件
            const nextWeekFile = window.getWeekFileName(nextDateStr);
            let targetData = null;
            let isCrossWeek = (nextWeekFile !== window.appData.currentWeekFile);

            if (isCrossWeek) {
                // 跨周：读取下周文件
                targetData = await window.readJson(nextWeekFile);
                if (!targetData) {
                    targetData = { 
                        weekId: window.getWeekId(nextDateStr), 
                        weeklyTasks: [], 
                        dailyData: {} 
                    };
                }
            } else {
                // 同周：直接使用内存数据
                targetData = window.appData.weekData;
            }

            // 确保数据结构存在
            if (!targetData.dailyData[nextDateStr]) {
                targetData.dailyData[nextDateStr] = { tasks: [], recommendations: [], summary: "", schedule: [] };
            }
            if (!targetData.dailyData[nextDateStr].recommendations) {
                targetData.dailyData[nextDateStr].recommendations = [];
            }
            if (!targetData.dailyData[nextDateStr].schedule) {
                targetData.dailyData[nextDateStr].schedule = [];
            }

            const targetRecs = targetData.dailyData[nextDateStr].recommendations;

            // 辅助函数：去重添加（保留进度和子任务，但清除计时器）
            const addRec = (task, isWeeklyTask = false) => {
                const content = isWeeklyTask ? `[周任务] ${task.content}` : task.content;
                const exists = targetRecs.some(r => r.content === content);
                if (!exists) {
                    targetRecs.push({
                        id: window.uuid(),
                        content: content,
                        quadrant: task.quadrant || 4,
                        progress: task.progress || 0,
                        timer: { totalWork: 0, isRunning: false, lastStart: null },
                        subtasks: task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : []
                    });
                }
            };

            // 迁移每日任务（保留完整数据包括子任务）
            unfinishedDaily.forEach(t => addRec(t, false));

            // 迁移周任务 (添加前缀区分)
            unfinishedWeekly.forEach(t => addRec({ content: t.content, quadrant: 2, progress: 0, timer: null, subtasks: [] }, true));

            // 迁移推荐任务（保留完整数据）
            pendingRecommendations.forEach(r => addRec(r, false));

            // 保存数据
            if (isCrossWeek) {
                await window.writeJson(nextWeekFile, targetData);
            }
            // 总是保存当前数据
            await saveData();

            window.UIModule.updateSaveIndicator('saved');
            if (window.UIModule?.showToast) {
                window.UIModule.showToast(`已迁移 ${count} 个项目 → ${nextDateStr}`, { type: 'success', duration: 2200 });
            } else {
                window.showAlert(`已将 ${count} 个任务迁移至 ${nextDateStr} 的推荐列表。`, "迁移成功");
            }

        } catch (e) {
            console.error(e);
            window.UIModule.updateSaveIndicator('error');
            window.showAlert("迁移失败: " + e.message, "错误");
        }
    }, "确认迁移");
};

window.breakdownTaskWithAI = async function(taskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (!task) return;

    const aiConfig = window.getAiConfig();
    if (!aiConfig.baseUrl) {
        window.showAlert("请先在“设置”中配置 AI 参数。", '提示');
        return;
    }

    const btn = document.getElementById(`btn-magic-${taskId}`);
    if(btn) btn.innerText = "⏳";

    try {
        const system = [
            '你是一个任务拆分助手。',
            '请基于用户任务，返回 3-5 条子任务。',
            '只输出严格的 JSON 数组（字符串数组），不要 markdown，不要解释，不要额外文本，不要 <think>。',
            '示例：["步骤 1", "步骤 2"]。'
        ].join(' ');

        const raw = await callChatCompletions(aiConfig, [
            { role: 'system', content: system },
            { role: 'user', content: `Task: ${task.content}` }
        ]);

        const parsed = window.extractAndParseJson(raw);
        const subtasks = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.subtasks) ? parsed.subtasks : null);

        if (Array.isArray(subtasks)) {
            subtasks.forEach(st => {
                task.subtasks.push({ id: window.uuid(), content: st, completed: false });
            });
            window.renderDaily();
            saveData();
        }

    } catch (e) {
        console.error(e);
        window.showAlert("AI 拆分失败：" + (e?.message || '未知错误'), '错误');
    } finally {
        if(btn) btn.innerText = "✨";
    }
};

// Drag and Drop (Global Handlers)
// Note: External scripts modify window.dragSrcType directly.
// We must check if they have set it, or if we set it.

// 创建自定义拖拽预览
let dragPreviewEl = null;

function ensureDragPreviewElement() {
    if (!dragPreviewEl || !document.body.contains(dragPreviewEl)) {
        dragPreviewEl = document.createElement('div');
        dragPreviewEl.id = 'drag-preview-ghost';
        document.body.appendChild(dragPreviewEl);
    }
    return dragPreviewEl;
}

function createDragPreview(e, text) {
    const preview = ensureDragPreviewElement();
    const displayText = text && text.length > 40 ? text.substring(0, 40) + '...' : (text || '任务');
    preview.textContent = displayText;
    
    // 获取计算后的 CSS 变量值
    const computedStyle = getComputedStyle(document.body);
    const cardBg = computedStyle.getPropertyValue('--card-bg').trim() || '#ffffff';
    const accent = computedStyle.getPropertyValue('--accent').trim() || '#0071e3';
    const textMain = computedStyle.getPropertyValue('--text-main').trim() || '#1d1d1f';
    
    // 设置样式 - 使用 !important 确保生效
    preview.setAttribute('style', `
        position: absolute !important;
        top: -1000px !important;
        left: 0 !important;
        padding: 12px 16px !important;
        background: ${cardBg} !important;
        color: ${textMain} !important;
        border: 2px solid ${accent} !important;
        border-radius: 8px !important;
        box-shadow: 0 8px 25px rgba(0,0,0,0.25) !important;
        font-size: 14px !important;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif !important;
        max-width: 280px !important;
        white-space: nowrap !important;
        overflow: hidden !important;
        text-overflow: ellipsis !important;
        pointer-events: none !important;
        z-index: 99999 !important;
        display: block !important;
        visibility: visible !important;
        opacity: 1 !important;
    `);
    
    // 确保元素在 DOM 中
    if (!document.body.contains(preview)) {
        document.body.appendChild(preview);
    }

    // 使用 setDragImage
    try {
        if (e.dataTransfer && typeof e.dataTransfer.setDragImage === 'function') {
            e.dataTransfer.setDragImage(preview, 0, 0);
        }
    } catch (err) {
        // 静默处理
    }
}

window.dragStartWeekly = function(e, task) {
    window.dragSrcType = 'weekly';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'copy';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartDaily = function(e, task) {
    window.dragSrcType = 'daily';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'move';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.day-task-item')?.classList.add('dragging');
};

window.dragStartRecommendation = function(e, task) {
    window.dragSrcType = 'recommendation';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'move';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartRecurring = function(e, tpl) {
    window.dragSrcType = 'recurring';
    window.dragPayload = tpl;
    e.dataTransfer.effectAllowed = 'copy';
    createDragPreview(e, tpl.title || 'Recurring Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartSubtask = function(e, taskId, subtaskId) {
    e.stopPropagation();
    window.dragSrcType = 'subtask';
    window.dragPayload = { taskId, subtaskId };
    e.dataTransfer.effectAllowed = 'move';
    
    // 尝试查找子任务内容
    let content = 'Subtask';
    const findSubtask = (tasks) => {
        for (const t of tasks) {
            if (t.id === taskId && t.subtasks) {
                const st = t.subtasks.find(s => s.id === subtaskId);
                if (st) return st.content;
            }
        }
        return null;
    };
    
    if (window.appData.weekData) {
        content = findSubtask(window.appData.weekData.weeklyTasks) || 
                  findSubtask(window.appData.weekData.dailyData[window.appData.currentDateStr]?.tasks || []) || 
                  'Subtask';
    }
    
    createDragPreview(e, content);
    e.target.closest('.subtask-item')?.classList.add('dragging');
};

window.allowDrop = function(e) {
    e.preventDefault();
    e.stopPropagation();
    
    const container = e.target.closest('.q-tasks');
    if (!container) {
        const otherContainer = e.target.closest('#weekly-list, #recommendation-list, #recurring-list');
        if (otherContainer) otherContainer.classList.add('drag-over');
        return;
    }

    // Remove existing indicators
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());

    // Calculate position
    const siblings = [...container.querySelectorAll('.day-task-item:not(.dragging)')];
    const result = siblings.reduce((closest, child) => {
        const box = child.getBoundingClientRect();
        const offset = e.clientY - box.top - box.height / 2;
        if (offset < 0 && offset > closest.offset) {
            return { offset: offset, element: child };
        } else {
            return closest;
        }
    }, { offset: Number.NEGATIVE_INFINITY });

    // Create indicator
    const indicator = document.createElement('div');
    indicator.className = 'drop-indicator';

    if (result.element) {
        container.insertBefore(indicator, result.element);
        window.dropBeforeId = result.element.id.replace('task-', '');
    } else {
        container.appendChild(indicator);
        window.dropBeforeId = null;
    }
};

const dropStrategies = {
    weekly: (payload, targetQ) => ({
        id: window.uuid(),
        content: payload.content,
        quadrant: targetQ,
        progress: 0,
        timer: { totalWork: 0, isRunning: false, lastStart: null },
        subtasks: []
    }),
    
    daily: (payload, targetQ) => {
        const sourceList = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        const sourceIdx = sourceList.findIndex(t => t.id === payload.id);
        if (sourceIdx > -1) {
            const [task] = sourceList.splice(sourceIdx, 1);
            window.pushUndo('MOVE_TASK', { 
                taskId: task.id, 
                fromDate: window.appData.currentDateStr, 
                fromQuadrant: task.quadrant, 
                toQuadrant: targetQ 
            }, "Task Moved. Undo?");
            task.quadrant = targetQ;
            return task;
        }
        return null;
    },

    recommendation: (payload, targetQ) => {
        const recs = window.appData.weekData.dailyData[window.appData.currentDateStr].recommendations;
        const idx = recs.findIndex(t => t.id === payload.id);
        if (idx > -1) {
            const [task] = recs.splice(idx, 1);
            return {
                id: window.uuid(),
                content: task.content,
                quadrant: targetQ,
                progress: task.progress || 0,
                timer: { totalWork: 0, isRunning: false, lastStart: null },
                subtasks: task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : []
            };
        }
        return null;
    },

    recurring: (payload, targetQ) => ({
        id: window.uuid(),
        content: payload.title,
        quadrant: targetQ,
        progress: 0,
        timer: { totalWork: 0, isRunning: false, lastStart: null },
        templateId: payload.id,
        subtasks: []
    }),

    inbox: (payload, targetQ) => {
        if (typeof window.removeInboxItem === 'function') {
            window.removeInboxItem(payload.id);
        }
        return {
            id: window.uuid(),
            content: payload.content,
            quadrant: targetQ,
            progress: 0,
            timer: { totalWork: 0, isRunning: false, lastStart: null },
            subtasks: []
        };
    }
};

window.drop = function(e, targetQ) {
    e.preventDefault();
    document.querySelectorAll('.drag-over').forEach(q => q.classList.remove('drag-over'));
    document.querySelectorAll('.drop-indicator').forEach(el => el.remove());
    document.querySelectorAll('.dragging').forEach(el => el.classList.remove('dragging'));

    const handler = dropStrategies[window.dragSrcType];
    const newTask = handler ? handler(window.dragPayload, targetQ) : null;
    
    if (newTask) {
        const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        let insertIndex = tasks.length;
        if (window.dropBeforeId) {
            const beforeIndex = tasks.findIndex(t => t.id === window.dropBeforeId);
            if (beforeIndex > -1) insertIndex = beforeIndex;
        }
        tasks.splice(insertIndex, 0, newTask);
    }
    
    window.dragSrcType = null;
    window.dragPayload = null;
    window.dropBeforeId = null;
    window.renderDaily();
    window.renderRecommendations();
    saveData();
};

window.editTaskContent = function(id) {
    const container = document.getElementById(`task-${id}`).querySelector('.task-content-wrapper');
    if (!container) return;
    const view = container.querySelector('.markdown-content');
    const edit = container.querySelector('.edit-content');
    
    view.style.display = 'none';
    edit.style.display = 'block';
    // Get raw content from data
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === id);
    edit.innerText = task ? task.content : '';
    edit.focus();
};

window.saveTaskContent = function(id, el) {
    const val = el.innerText;
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === id);
    if (task) {
        task.content = val;
        saveData();
        window.renderDaily();
    }
};

window.dropItem = function(e, targetId, targetType) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    window.dragSrcType = null;
};

window.dropSubtask = function(e, targetTaskId, targetSubtaskId) {
    e.preventDefault();
    e.stopPropagation();
    window.dragSrcType = null;
};


// Resizer Logic (Ported)
function setupResizer() {
    const resizer = document.getElementById('resizer');
    const sidebar = document.getElementById('sidebar');
    
    if (!resizer || !sidebar) return;

    resizer.addEventListener('mousedown', (e) => {
        e.preventDefault();
        document.body.style.cursor = 'col-resize';
        const startX = e.clientX;
        const startWidth = parseInt(window.getComputedStyle(sidebar).width, 10);
        
        const doDrag = (e) => {
            const newWidth = startWidth + e.clientX - startX;
            if (newWidth > 200 && newWidth < 600) {
                sidebar.style.width = newWidth + 'px';
            }
        };
        
        const stopDrag = () => {
            document.body.style.cursor = 'default';
            document.removeEventListener('mousemove', doDrag);
            document.removeEventListener('mouseup', stopDrag);
        };
        
        document.addEventListener('mousemove', doDrag);
        document.addEventListener('mouseup', stopDrag);
    });

    // Right resizer for schedule sidebar
    const resizerRight = document.getElementById('resizer-right');
    const scheduleSidebar = document.getElementById('schedule-sidebar');
    
    if (resizerRight && scheduleSidebar) {
        resizerRight.addEventListener('mousedown', (e) => {
            e.preventDefault();
            document.body.style.cursor = 'col-resize';
            resizerRight.classList.add('resizing');
            const startX = e.clientX;
            const startWidth = parseInt(window.getComputedStyle(scheduleSidebar).width, 10);
            
            const doDrag = (e) => {
                const newWidth = startWidth - (e.clientX - startX);
                if (newWidth > 280 && newWidth < 450) {
                    scheduleSidebar.style.width = newWidth + 'px';
                }
            };
            
            const stopDrag = () => {
                document.body.style.cursor = 'default';
                resizerRight.classList.remove('resizing');
                document.removeEventListener('mousemove', doDrag);
                document.removeEventListener('mouseup', stopDrag);
            };
            
            document.addEventListener('mousemove', doDrag);
            document.addEventListener('mouseup', stopDrag);
        });
    }
}

// --- Smart Capture Logic ---

window.openSmartAddModal = function() {
    document.getElementById('smart-add-modal-overlay').style.display = 'flex';
    document.getElementById('smart-add-input').focus();
    document.getElementById('smart-add-preview').innerText = '';
    setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
};

window.closeSmartAddModal = function() {
    document.getElementById('smart-add-modal-overlay').style.display = 'none';
    setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
};

window.executeSmartAdd = async function() {
    const inputEl = document.getElementById('smart-add-input');
    const errorEl = document.getElementById('smart-add-error');
    const input = (inputEl?.value || '').trim();
    setInlineError(inputEl, errorEl, '');
    if (!input) {
        setInlineError(inputEl, errorEl, '请输入要解析的内容。');
        return;
    }

    const btn = document.getElementById('btn-smart-add-confirm');
    const originalText = btn.innerText;
    btn.innerText = "解析中...";
    btn.disabled = true;

    const previewEl = document.getElementById('smart-add-preview');
    if (previewEl) previewEl.innerText = '正在解析...';

    const aiConfig = window.getAiConfig();
    if (!aiConfig.baseUrl) {
        setInlineError(inputEl, errorEl, '请先在“设置”中配置 AI 参数。');
        btn.innerText = originalText;
        btn.disabled = false;
        if (previewEl) previewEl.innerText = '';
        return;
    }

    const today = window.appData.currentDateStr;

    // Ensure Inbox data exists (inbox.js uses a module-scoped binding; we also mirror it on window).
    if (!window.inboxData) {
        if (typeof window.loadInbox === 'function') {
            try { await window.loadInbox(); } catch (_) { /* ignore */ }
        }
        if (!window.inboxData) window.inboxData = { items: [] };
        if (!Array.isArray(window.inboxData.items)) window.inboxData.items = [];
    }
    
    // Prompt: 指导 AI 进行结构化提取
    const systemPrompt = `你是一个任务解析助手。当前日期：${today}。
严格按规则抽取结构化信息，并且【只输出 JSON】（不要解释，不要思考过程，不要 <think>）。
规则：
1) 输入体现明确执行日期（如“明天”“下周一”）=> target="daily" 且 date="YYYY-MM-DD"。
2) 只有截止日期/期限（如“周五前”）=> target="weekly" 且 deadline="YYYY-MM-DD"。
3) 无法判断 => target="inbox"。
4) 根据紧急/重要词推断 quadrant=1-4，默认 4。
5) 抽取干净的 content。

仅输出 JSON：{ "target": "inbox"|"daily"|"weekly", "content": "...", "date": "YYYY-MM-DD"?, "deadline": "YYYY-MM-DD"?, "quadrant": 1-4 }`;

    try {
        const rawResp = await callChatCompletionsRaw(aiConfig, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input }
        ]);

        if (!rawResp.ok) {
            if (previewEl) {
                previewEl.innerText = [
                    '❌ AI 请求失败（将显示完整返回内容用于排查）',
                    `HTTP: ${rawResp.status} ${rawResp.statusText || ''}`.trim(),
                    '',
                    rawResp.text || '(empty response body)'
                ].join('\n');
            }
            return;
        }

        let result;
        try {
            result = window.extractAndParseJson(rawResp.content || rawResp.text);
        } catch (_) {
            // Second pass: ask the model to convert its prior output into strict JSON.
            const fixerSystem = `你是一个严格的 JSON 纠错器。只输出 JSON，不要解释，不要思考过程，不要 <think>。\n\n` +
                `目标 schema：{ "target": "inbox"|"daily"|"weekly", "content": "...", "date": "YYYY-MM-DD"?, "deadline": "YYYY-MM-DD"?, "quadrant": 1-4 }`;
            const cleanedRaw = window.stripModelThinking(rawResp.content || rawResp.text).slice(0, 2000);
            const fixedResp = await callChatCompletionsRaw(aiConfig, [
                { role: 'system', content: fixerSystem },
                { role: 'user', content: `User input: ${input}\n\nBad output (convert to JSON only):\n${cleanedRaw}` }
            ]);

            if (!fixedResp.ok) {
                if (previewEl) {
                    previewEl.innerText = [
                        '❌ AI 二次纠错请求失败（将显示完整返回内容用于排查）',
                        `HTTP: ${fixedResp.status} ${fixedResp.statusText || ''}`.trim(),
                        '',
                        fixedResp.text || '(empty response body)',
                        '',
                        '----',
                        '首次模型输出（完整）：',
                        rawResp.content || rawResp.text || '(empty)'
                    ].join('\n');
                }
                return;
            }

            result = window.extractAndParseJson(fixedResp.content || fixedResp.text);
        }

        // Normalize/validate
        if (!result || typeof result !== 'object') throw new Error('AI returned invalid result.');
        if (typeof result.target === 'string') result.target = result.target.toLowerCase();
        if (!result.content || typeof result.content !== 'string') throw new Error('AI returned invalid content.');
        if (result.quadrant != null) result.quadrant = Number(result.quadrant);
        if (![1, 2, 3, 4].includes(result.quadrant)) result.quadrant = 4;

        // Dispatch Logic (自动分发)
        let message = "";
        if (result.target === 'daily') {
            // 如果是今天，直接添加
            if (result.date === window.appData.currentDateStr) {
                window.appData.weekData.dailyData[result.date].tasks.push({
                    id: window.uuid(),
                    content: result.content,
                    quadrant: result.quadrant || 4,
                    progress: 0,
                    timer: { totalWork: 0, isRunning: false },
                    subtasks: []
                });
                window.renderDaily();
                message = `已添加到今日 Q${result.quadrant}`;
            } else {
                // 如果是未来日期，为了简化，暂时放入 Inbox 并带上日期前缀
                window.inboxData.items.push({
                    id: window.uuid(),
                    content: `[${result.date}] ${result.content}`,
                    createdAt: new Date().toISOString(),
                    status: 'active'
                });
                if (window.renderInbox) window.renderInbox();
                if (window.saveInbox) await window.saveInbox();
                message = `已添加到收件箱（未来日期：${result.date}）`;
            }
        } else if (result.target === 'weekly') {
            window.appData.weekData.weeklyTasks.push({
                id: window.uuid(),
                content: result.content,
                deadline: result.deadline || "",
                completed: false
            });
            window.renderWeekly();
            message = "已添加到周任务";
        } else {
            window.inboxData.items.push({
                id: window.uuid(),
                content: result.content,
                createdAt: new Date().toISOString(),
                status: 'active'
            });
            if (window.renderInbox) window.renderInbox();
            if (window.saveInbox) await window.saveInbox();
            message = "已添加到收件箱";
        }

        saveData(); // 保存主数据
        
        // UI Feedback
        if (previewEl) previewEl.innerText = `✅ ${message}：${result.content}`;
        document.getElementById('smart-add-input').value = '';
        setTimeout(() => {
             window.closeSmartAddModal();
             if (previewEl) previewEl.innerText = '';
        }, 1500);

    } catch (e) {
        console.error(e);
        const msg = String(e?.message || '');
        if (previewEl) {
            previewEl.innerText = [
                '❌ AI 解析/执行失败（将显示完整错误信息用于排查）',
                msg || '(no error message)'
            ].join('\n');
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

// --- RAG Lite Helper (Context-Aware History) ---

async function fetchRecentSummaries(daysToLookBack = 7) {
    if (!window.dirHandle) return "";
    
    let context = "Recent History (Last 7 Days):\n";
    const today = new Date(window.appData.currentDateStr);
    
    // 回溯过去 N 天
    for (let i = 1; i <= daysToLookBack; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const fileName = window.getWeekFileName(dateStr); 
        
        try {
            let data;
            // 优化: 如果文件名和当前加载的一样，直接用内存数据
            if (fileName === window.appData.currentWeekFile) {
                data = window.appData.weekData;
            } else {
                // 否则尝试从磁盘读取 (跨周情况)
                data = await window.readJson(fileName);
            }

            if (data && data.dailyData && data.dailyData[dateStr]) {
                const summary = data.dailyData[dateStr].summary;
                if (summary) {
                    // 截取前200字符节省Token
                    context += `- ${dateStr}: ${summary.substring(0, 200)}...\n`; 
                }
            }
        } catch (e) {
            // 忽略文件不存在的情况
        }
    }
    return context;
}
