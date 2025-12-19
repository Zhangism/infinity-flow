// script.js - Application Entry Point
// Core initialization, data loading/saving, and render bridges

// --- Initialize State ---
// State is now managed in app-namespace.js via window.App.state
// but we ensure backward compatibility here
if (!window.appData) {
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
}

// --- Expose Globals for Legacy Scripts ---
window.readJson = window.StorageModule.readJson;
window.writeJson = window.StorageModule.writeJson;

// Proxy dirHandle
Object.defineProperty(window, 'dirHandle', {
    get: () => window.StorageModule.dirHandle,
    set: (val) => { /* read-only external set */ },
    configurable: true
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
            sanitize: false,
        });

        const renderer = new marked.Renderer();
        renderer.code = function (code, language, isEscaped) {
            const escapedCode = String(code)
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
                .replace(/"/g, '&quot;')
                .replace(/'/g, '&#39;');
            return `<pre><code class="language-${language || ''}">${escapedCode}</code></pre>`;
        };

        renderer.html = function (html) {
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
    if (typeof ensureDragPreviewElement === 'function') ensureDragPreviewElement();

    // Calendar Initialization
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

// --- Inline Error Helper ---
function setInlineError(inputEl, errorEl, message) {
    if (!errorEl) return;
    errorEl.textContent = message || '';
    errorEl.style.display = message ? 'block' : 'none';
    if (inputEl) inputEl.classList.toggle('is-invalid', !!message);
}
window.setInlineError = setInlineError;

// --- Daily Summary Autosize ---
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

// --- Workspace Intro ---
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

// --- Data Loading ---
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
window.loadAllData = loadAllData;

// --- Data Saving ---
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
            ? '可能是工作区权限已失效。你可以在"设置"里点击「📂 切换工作区」重新授权。'
            : '你可以在"设置"里点击「📂 切换工作区」重新选择工作区后重试。';

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

console.log('[App] Entry point loaded');
