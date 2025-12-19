// controllers/navigation-controller.js - Navigation & Workspace Operations
// Handles workspace selection, date navigation, focus mode, and summary dock

(function () {
    'use strict';

    const NavigationController = {};

    // ============ Workspace Operations ============

    NavigationController.selectWorkspace = async function () {
        const handle = await window.StorageModule.selectWorkspace();
        if (handle) {
            const intro = document.getElementById('intro-screen');
            intro.classList.remove('show');
            setTimeout(() => {
                intro.style.display = 'none';
                if (window.loadAllData) window.loadAllData();
            }, 300);
        }
    };

    NavigationController.openWorkspace = async function () {
        const handle = await window.StorageModule.requestSavedWorkspacePermission();
        if (handle) {
            const intro = document.getElementById('intro-screen');
            intro.classList.remove('show');
            setTimeout(() => {
                intro.style.display = 'none';
                if (window.loadAllData) window.loadAllData();
            }, 300);
        } else {
            NavigationController.selectWorkspace();
        }
    };

    NavigationController.refreshApp = function () {
        location.reload();
    };

    // ============ Date Navigation ============

    NavigationController.changeDate = function (offset) {
        const d = new Date(window.appData.currentDateStr);
        d.setDate(d.getDate() + offset);
        window.appData.currentDateStr = d.toISOString().split('T')[0];
        if (window.loadAllData) window.loadAllData();
    };

    NavigationController.goToDate = function (val) {
        if (!val) return;
        window.appData.currentDateStr = val;
        if (window.loadAllData) window.loadAllData();
        NavigationController.closeSearchResults();
    };

    NavigationController.closeSearchResults = function () {
        const overlay = document.getElementById('search-results-overlay');
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    NavigationController.goToToday = function () {
        window.appData.currentDateStr = window.getLocalTodayStr();
        if (window.loadAllData) window.loadAllData();
    };

    // ============ Focus Mode ============

    NavigationController.enterFocusMode = function (qid) {
        const isAlreadyFocused = document.body.classList.contains('focus-mode') && document.getElementById(qid).classList.contains('focused');
        if (isAlreadyFocused) {
            NavigationController.exitFocusMode();
        } else {
            document.body.classList.add('focus-mode');
            document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
            document.getElementById(qid).classList.add('focused');
        }
    };

    NavigationController.exitFocusMode = function () {
        document.body.classList.remove('focus-mode');
        document.querySelectorAll('.quadrant').forEach(q => q.classList.remove('focused'));
    };

    // ============ Summary Dock ============

    NavigationController.toggleSummaryDock = function () {
        const dock = document.getElementById('bottom-summary-dock');
        const toggleBtn = document.getElementById('dock-toggle-btn');
        if (dock) {
            dock.classList.toggle('collapsed');
            if (toggleBtn) {
                toggleBtn.textContent = dock.classList.contains('collapsed') ? '▲' : '▼';
            }
        }
    };

    NavigationController.handleSummaryInput = function () {
        const val = document.getElementById('daily-summary').value;
        window.appData.weekData.dailyData[window.appData.currentDateStr].summary = val;
        window.debouncedSave();
    };

    NavigationController.toggleSummaryEdit = function (showEdit) {
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

    // ============ Register & Expose ============

    if (window.App && window.App.Controllers) {
        window.App.Controllers.Navigation = NavigationController;
    }

    // Expose to window for backward compatibility
    window.selectWorkspace = NavigationController.selectWorkspace;
    window.openWorkspace = NavigationController.openWorkspace;
    window.refreshApp = NavigationController.refreshApp;
    window.changeDate = NavigationController.changeDate;
    window.goToDate = NavigationController.goToDate;
    window.closeSearchResults = NavigationController.closeSearchResults;
    window.goToToday = NavigationController.goToToday;
    window.enterFocusMode = NavigationController.enterFocusMode;
    window.exitFocusMode = NavigationController.exitFocusMode;
    window.toggleSummaryDock = NavigationController.toggleSummaryDock;
    window.handleSummaryInput = NavigationController.handleSummaryInput;
    window.toggleSummaryEdit = NavigationController.toggleSummaryEdit;

})();
