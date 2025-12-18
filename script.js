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



window.onload = async () => {
    // External Scripts Init
    if (window.setupThemeSwitcher) window.setupThemeSwitcher();
    if (window.setupTimerStyle) window.setupTimerStyle();

    setupResizer();
    loadSettings();

    // Configure marked for XSS protection
    if (typeof marked !== 'undefined') {
        marked.setOptions({
            breaks: true,
            gfm: true,
            // Sanitize HTML by escaping dangerous tags
            sanitize: false, // deprecated in newer versions, we'll use custom renderer
        });

        // Create a custom renderer that escapes HTML in code blocks
        const renderer = new marked.Renderer();
        const originalCodeRenderer = renderer.code;
        renderer.code = function (code, language, isEscaped) {
            // Escape HTML entities in code
            const escapedCode = String(code)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            return `<pre><code class="language-${language || ''}">${escapedCode}</code></pre>`;
        };

        // Override html renderer to prevent raw HTML injection
        renderer.html = function (html) {
            // Escape raw HTML blocks for security
            return String(html)
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
        };

        marked.use({ renderer });
    }

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

window.showWorkspaceIntro = function (autoResult) {
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
    setTimeout(() => intro.classList.add('show'), 10);
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
window.pushUndo = function (type, payload, message) {
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

window.performUndo = function () {
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
window.showConfirm = function (message, onConfirm, title = "确认") {
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
    const overlay = document.getElementById('confirm-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
};

window.showAlert = function (message, title = "Alert") {
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
    const overlay = document.getElementById('confirm-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
};

window.closeConfirmModal = function () {
    const overlay = document.getElementById('confirm-modal-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
};

// --- Controller Logic ---

window.selectWorkspace = async function () {
    const handle = await window.StorageModule.selectWorkspace();
    if (handle) {
        const intro = document.getElementById('intro-screen');
        intro.classList.remove('show');
        setTimeout(() => {
            intro.style.display = 'none';
            loadAllData();
        }, 300);
    }
};

// Prefer this entry point from the intro screen:
// - If a workspace was remembered but needs permission, request it via user gesture.
// - Otherwise, let the user pick a folder.
window.openWorkspace = async function () {
    const handle = await window.StorageModule.requestSavedWorkspacePermission();
    if (handle) {
        const intro = document.getElementById('intro-screen');
        intro.classList.remove('show');
        setTimeout(() => {
            intro.style.display = 'none';
            loadAllData();
        }, 300);
    } else {
        // Fallback to manual selection if auto-permission fails
        window.selectWorkspace();
    }
};

window.refreshApp = () => location.reload();

window.changeDate = function (offset) {
    const d = new Date(window.appData.currentDateStr);
    d.setDate(d.getDate() + offset);
    window.appData.currentDateStr = d.toISOString().split('T')[0];
    loadAllData();
};

window.goToDate = function (val) {
    if (!val) return;
    window.appData.currentDateStr = val;
    loadAllData();
    window.closeSearchResults();
};

window.closeSearchResults = function () {
    const overlay = document.getElementById('search-results-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
};

window.goToToday = function () {
    window.appData.currentDateStr = window.getLocalTodayStr();
    loadAllData();
};

// Weekly Tasks
window.addWeeklyTaskUI = function () {
    const input = document.getElementById('new-weekly-input');
    const val = input.value.trim();
    if (!val) return;
    window.appData.weekData.weeklyTasks.push({ id: window.uuid(), content: val, deadline: '', completed: false });
    input.value = '';
    window.renderWeekly();
    window.debouncedSave();
};

window.toggleWeeklyCheck = function (id) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if (t) t.completed = !t.completed;
    window.debouncedSave();
    window.renderWeekly();
};

window.updateWeeklyText = function (id, txt) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if (t && t.content !== txt) { t.content = txt; window.debouncedSave(); }
};

window.updateWeeklyDate = function (id, date) {
    const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
    if (t) { t.deadline = date; window.debouncedSave(); window.renderWeekly(); }
};

window.deleteWeeklyTask = function (id) {
    window.animateAndDelete(`weekly-task-${id}`, () => {
        const idx = window.appData.weekData.weeklyTasks.findIndex(t => t.id === id);
        if (idx > -1) {
            window.appData.weekData.weeklyTasks.splice(idx, 1);
            window.debouncedSave();
            window.renderWeekly();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除周任务', { type: 'info' });
        }
    });
};

// Daily Tasks
window.addDailyTaskUI = function (quadrant) {
    const input = document.getElementById(`input-q${quadrant}`);
    const val = input.value.trim();
    if (!val) return;

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
    window.debouncedSave();
};

window.deleteDailyTask = function (id) {
    window.animateAndDelete(`task-${id}`, () => {
        const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        const idx = tasks.findIndex(t => t.id === id);
        if (idx > -1) {
            const [task] = tasks.splice(idx, 1);
            window.pushUndo('DELETE_TASK', { task: task, date: window.appData.currentDateStr }, "任务已删除，撤销？");
            window.debouncedSave();
            window.renderDaily();
        }
    });
};

window.updateDailyText = function (id, txt) {
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if (task && task.content !== txt) {
        task.content = txt;
        window.debouncedSave();
    }
};

window.updateDailyProgressUI = function (id, el) {
    const val = el.value;
    el.style.backgroundSize = `${val}% 100%`;
    const pctSpan = document.getElementById(`pct-${id}`);
    if (pctSpan) pctSpan.innerText = val + '%';

    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if (task) {
        const oldProgress = task.progress;
        task.progress = parseInt(val);
        if (task.progress >= 100 && oldProgress < 100) {
            // Trigger Confetti
            const rect = el.getBoundingClientRect();
            window.triggerConfetti(rect.left + rect.width / 2, rect.top);

            // Render update
            window.renderDaily();
        } else if (task.progress < 100 && oldProgress >= 100) {
            window.renderDaily();
        }
    }
};

window.resetTask = function (id) {
    const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
    const task = tasks.find(t => t.id === id);
    if (task) {
        task.progress = 0;
        window.renderDaily();
        window.debouncedSave();
    }
};

// Subtasks
window.addSubtaskUI = function (taskId) {
    const input = document.getElementById(`subtask-input-${taskId}`);
    const val = input.value.trim();
    if (!val) return;

    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        task.subtasks.push({ id: window.uuid(), content: val, completed: false });
        input.value = '';
        updateDailyProgressFromSubtasks(task);
        window.renderDaily();
        window.debouncedSave();
    }
};

window.toggleSubtaskCompletion = function (taskId, subtaskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.completed = !subtask.completed;
            updateDailyProgressFromSubtasks(task);
            window.renderDaily();
            window.debouncedSave();
        }
    }
};

window.deleteSubtask = function (taskId, subtaskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
        updateDailyProgressFromSubtasks(task);
        window.renderDaily();
        window.debouncedSave();
    }
};

window.updateSubtaskContent = function (taskId, subtaskId, content) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (task) {
        const subtask = task.subtasks.find(st => st.id === subtaskId);
        if (subtask) {
            subtask.content = content;
            window.debouncedSave();
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
window.addRecurringTaskUI = function () {
    const input = document.getElementById('new-recurring-input');
    const val = input.value.trim();
    if (!val) return;
    window.appData.recurringData.recurring.push({ id: window.uuid(), title: val });
    input.value = '';
    window.renderRecurring();
    window.debouncedSave();
};

window.deleteRecurringTask = function (id) {
    window.animateAndDelete(`recurring-${id}`, () => {
        window.appData.recurringData.recurring = window.appData.recurringData.recurring.filter(t => t.id !== id);
        window.debouncedSave();
        window.renderRecurring();
        if (window.UIModule?.showToast) window.UIModule.showToast('已删除日常模板', { type: 'info' });
    });
};

window.updateRecurringTitle = function (id, txt) {
    const tpl = window.appData.recurringData.recurring.find(t => t.id === id);
    if (tpl) { tpl.title = txt; window.debouncedSave(); }
};

window.addLongTermGoalUI = function () {
    const input = document.getElementById('new-goal-input');
    if (!input.value) return;
    window.appData.longTermData.goals.push({ title: input.value, subGoals: [] });
    input.value = '';
    window.renderLongTerm();
    window.debouncedSave();
};

window.deleteLongTermGoal = function (i) {
    // Note: Long Term Goals are rendered by index, not stable ID. 
    // We'd need to modify renderLongTerm to give them IDs if we want smooth delete.
    // For now, let's keep it simple or use a querySelector by index?
    // Let's assume the renderLongTerm assigns IDs? It doesn't yet.
    // We will skip animation for Long Term Goals for this step or update renderLongTerm next.
    // For consistency, let's just do the deletion.
    window.appData.longTermData.goals.splice(i, 1);
    window.debouncedSave();
    window.renderLongTerm();
    if (window.UIModule?.showToast) window.UIModule.showToast('已删除长期目标', { type: 'info' });
};

window.addSubGoalUI = function (idx) {
    const input = document.createElement('input');
    input.placeholder = "输入子目标名称然后回车";
    input.style.cssText = "width:100%; padding:5px; margin-top:5px; border:1px solid #ccc; font-size:12px;";
    input.onkeydown = (e) => {
        if (e.key === 'Enter' && input.value) {
            window.appData.longTermData.goals[idx].subGoals.push({ title: input.value, progress: 0 });
            window.renderLongTerm();
            window.debouncedSave();
        }
    };
    document.getElementById('long-term-list').children[idx].appendChild(input);
    input.focus();
};

window.deleteSubGoal = function (gIdx, sIdx) {
    window.appData.longTermData.goals[gIdx].subGoals.splice(sIdx, 1);
    window.debouncedSave();
    window.renderLongTerm();
    if (window.UIModule?.showToast) window.UIModule.showToast('已删除子目标', { type: 'info' });
};

window.updateSubGoal = function (gIdx, sIdx, el) {
    const val = el.value;
    el.style.backgroundSize = `${val}% 100%`;
    el.previousElementSibling.innerText = `${val}%`;
    window.appData.longTermData.goals[gIdx].subGoals[sIdx].progress = parseInt(val);
    debouncedSave();
};

window.deleteRecommendation = function (id) {
    window.animateAndDelete(`rec-${id}`, () => {
        const recs = window.appData.weekData.dailyData[window.appData.currentDateStr].recommendations;
        const idx = recs.findIndex(t => t.id === id);
        if (idx > -1) {
            recs.splice(idx, 1);
            window.debouncedSave();
            window.renderRecommendations();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除推荐任务', { type: 'info' });
        }
    });
};

// Summary
window.handleSummaryInput = function () {
    const val = document.getElementById('daily-summary').value;
    window.appData.weekData.dailyData[window.appData.currentDateStr].summary = val;
    debouncedSave();
};

window.toggleSummaryEdit = function (showEdit) {
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
window.toggleSummaryDock = function () {
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
window.openSettings = function () {
    const overlay = document.getElementById('settings-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
};
window.closeSettings = function () {
    const overlay = document.getElementById('settings-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
};

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

window.saveSettings = function () {
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
window.openAnalytics = function () {
    const overlay = document.getElementById('analytics-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
    window.switchAnalyticsTab('daily');
};

window.closeAnalytics = function () {
    const overlay = document.getElementById('analytics-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
};

window.switchAnalyticsTab = function (tab) {
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
window.enterFocusMode = function (qid) {
    const isAlreadyFocused = document.body.classList.contains('focus-mode') && document.getElementById(qid).classList.contains('focused');
    if (isAlreadyFocused) {
        window.exitFocusMode();
    } else {
        document.body.classList.add('focus-mode');
        document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
        document.getElementById(qid).classList.add('focused');
    }
};

window.exitFocusMode = function () {
    document.body.classList.remove('focus-mode');
    document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
};

// Search
window.toggleExportDialog = function () {
    const overlay = document.getElementById('dialog-overlay');
    if (overlay.classList.contains('show')) {
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    } else {
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
        // Basic Export Content
        document.getElementById('dialog-content').innerHTML = `
            <h3>导出数据</h3>
            <p>点击下载当前周数据。</p>
            <div style="margin-top:20px; display:flex; justify-content:flex-end; gap:10px;">
                <button class="btn-small" onclick="window.toggleExportDialog()">关闭</button>
                <button class="btn-small" onclick="executeExport()">下载 JSON</button>
            </div>
        `;
    }
};

window.executeExport = function () {
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



// AI & Automation
// (Core AI helpers in utils.js, Feature logic below)



window.finalizeDayAndWeek = async function () {
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



// --- Drag & Drop Bridge ---
// These are currently in drag-drop-manager.js, we will keep them there and remove from here
// after ensuring the global exposure is correct.



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

window.openSmartAddModal = function () {
    const overlay = document.getElementById('smart-add-modal-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => {
        overlay.classList.add('show');
        document.getElementById('smart-add-input').focus();
    }, 10);
    document.getElementById('smart-add-preview').innerText = '';
    setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
};

window.closeSmartAddModal = function () {
    const overlay = document.getElementById('smart-add-modal-overlay');
    overlay.classList.remove('show');
    setTimeout(() => overlay.style.display = 'none', 300);
    setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
};



// --- RAG Lite Helper (Context-Aware History) ---


