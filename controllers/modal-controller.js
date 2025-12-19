// controllers/modal-controller.js - Modal & Dialog Operations
// Handles all modal windows: confirm, alert, settings, analytics, export, smart-add

(function () {
    'use strict';

    const ModalController = {};

    // ============ Confirm/Alert Modals ============

    ModalController.showConfirm = function (message, onConfirm, title = "确认") {
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
            ModalController.closeConfirmModal();
        };
        const overlay = document.getElementById('confirm-modal-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
    };

    ModalController.showAlert = function (message, title = "Alert") {
        document.getElementById('confirm-title').innerText = title;
        document.getElementById('confirm-message').innerText = message;
        const yesBtn = document.getElementById('confirm-yes-btn');
        const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');

        // Hide cancel, change confirm to OK
        cancelBtn.style.display = 'none';
        yesBtn.innerText = "知道了";
        yesBtn.style.display = 'inline-block';

        yesBtn.onclick = () => {
            ModalController.closeConfirmModal();
        };
        const overlay = document.getElementById('confirm-modal-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
    };

    ModalController.closeConfirmModal = function () {
        const overlay = document.getElementById('confirm-modal-overlay');
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    // ============ Settings Modal ============

    ModalController.openSettings = function () {
        const overlay = document.getElementById('settings-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
    };

    ModalController.closeSettings = function () {
        const overlay = document.getElementById('settings-overlay');
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    ModalController.loadSettings = function () {
        const aiBaseUrl = localStorage.getItem('aiBaseUrl') || 'http://10.204.65.181:3000/api';
        const aiKey = localStorage.getItem('aiKey') || '';
        const aiModel = localStorage.getItem('aiModel') || 'deepseek-r1:latest';
        const aiCustomPrompt = localStorage.getItem('aiCustomPrompt') || '';
        document.getElementById('ai-base-url').value = aiBaseUrl;
        document.getElementById('ai-key').value = aiKey;
        document.getElementById('ai-model').value = aiModel;
        document.getElementById('ai-custom-prompt').value = aiCustomPrompt;
    };

    ModalController.saveSettings = function () {
        const aiBaseUrl = document.getElementById('ai-base-url').value;
        const aiKey = document.getElementById('ai-key').value;
        const aiModel = document.getElementById('ai-model').value;
        const aiCustomPrompt = document.getElementById('ai-custom-prompt').value;
        localStorage.setItem('aiBaseUrl', aiBaseUrl);
        localStorage.setItem('aiKey', aiKey);
        localStorage.setItem('aiModel', aiModel);
        localStorage.setItem('aiCustomPrompt', aiCustomPrompt);
        ModalController.closeSettings();
    };

    // ============ Analytics Modal ============

    ModalController.openAnalytics = function () {
        const overlay = document.getElementById('analytics-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => overlay.classList.add('show'), 10);
        ModalController.switchAnalyticsTab('daily');
    };

    ModalController.closeAnalytics = function () {
        const overlay = document.getElementById('analytics-overlay');
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
    };

    ModalController.switchAnalyticsTab = function (tab) {
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

    // ============ Export Dialog ============

    ModalController.toggleExportDialog = function () {
        const overlay = document.getElementById('dialog-overlay');
        if (overlay.classList.contains('show')) {
            overlay.classList.remove('show');
            setTimeout(() => overlay.style.display = 'none', 300);
        } else {
            overlay.style.display = 'flex';
            setTimeout(() => overlay.classList.add('show'), 10);
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

    ModalController.executeExport = function () {
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
        ModalController.toggleExportDialog();
    };

    // ============ Smart Add Modal ============

    ModalController.openSmartAddModal = function () {
        const overlay = document.getElementById('smart-add-modal-overlay');
        overlay.style.display = 'flex';
        setTimeout(() => {
            overlay.classList.add('show');
            document.getElementById('smart-add-input').focus();
        }, 10);
        document.getElementById('smart-add-preview').innerText = '';
        if (window.setInlineError) {
            window.setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
        }
    };

    ModalController.closeSmartAddModal = function () {
        const overlay = document.getElementById('smart-add-modal-overlay');
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
        if (window.setInlineError) {
            window.setInlineError(document.getElementById('smart-add-input'), document.getElementById('smart-add-error'), '');
        }
    };

    // ============ Register & Expose ============

    if (window.App && window.App.Controllers) {
        window.App.Controllers.Modal = ModalController;
    }

    // Expose to window for backward compatibility
    window.showConfirm = ModalController.showConfirm;
    window.showAlert = ModalController.showAlert;
    window.closeConfirmModal = ModalController.closeConfirmModal;
    window.openSettings = ModalController.openSettings;
    window.closeSettings = ModalController.closeSettings;
    window.loadSettings = ModalController.loadSettings;
    window.saveSettings = ModalController.saveSettings;
    window.openAnalytics = ModalController.openAnalytics;
    window.closeAnalytics = ModalController.closeAnalytics;
    window.switchAnalyticsTab = ModalController.switchAnalyticsTab;
    window.toggleExportDialog = ModalController.toggleExportDialog;
    window.executeExport = ModalController.executeExport;
    window.openSmartAddModal = ModalController.openSmartAddModal;
    window.closeSmartAddModal = ModalController.closeSmartAddModal;

})();
