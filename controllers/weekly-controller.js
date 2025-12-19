// controllers/weekly-controller.js - Weekly Task Operations
// Handles CRUD operations for weekly tasks

(function () {
    'use strict';

    const WeeklyController = {};

    WeeklyController.addWeeklyTaskUI = function () {
        const input = document.getElementById('new-weekly-input');
        const val = input.value.trim();
        if (!val) return;
        window.appData.weekData.weeklyTasks.push({ id: window.uuid(), content: val, deadline: '', completed: false });
        input.value = '';
        window.renderWeekly();
        window.debouncedSave();
    };

    WeeklyController.toggleWeeklyCheck = function (id) {
        const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
        if (t) t.completed = !t.completed;
        window.debouncedSave();
        window.renderWeekly();
    };

    WeeklyController.updateWeeklyText = function (id, txt) {
        const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
        if (t && t.content !== txt) { t.content = txt; window.debouncedSave(); }
    };

    WeeklyController.updateWeeklyDate = function (id, date) {
        const t = window.appData.weekData.weeklyTasks.find(t => t.id === id);
        if (t) { t.deadline = date; window.debouncedSave(); window.renderWeekly(); }
    };

    WeeklyController.deleteWeeklyTask = function (id) {
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

    // ============ Register & Expose ============

    if (window.App && window.App.Controllers) {
        window.App.Controllers.Weekly = WeeklyController;
    }

    // Expose to window for backward compatibility
    window.addWeeklyTaskUI = WeeklyController.addWeeklyTaskUI;
    window.toggleWeeklyCheck = WeeklyController.toggleWeeklyCheck;
    window.updateWeeklyText = WeeklyController.updateWeeklyText;
    window.updateWeeklyDate = WeeklyController.updateWeeklyDate;
    window.deleteWeeklyTask = WeeklyController.deleteWeeklyTask;

})();
