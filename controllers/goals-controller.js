// controllers/goals-controller.js - Goals & Recurring Tasks Operations
// Handles recurring tasks, long-term goals, and recommendations

(function () {
    'use strict';

    const GoalsController = {};

    // ============ Recurring Tasks ============

    GoalsController.addRecurringTaskUI = function () {
        const input = document.getElementById('new-recurring-input');
        const val = input.value.trim();
        if (!val) return;
        window.appData.recurringData.recurring.push({ id: window.uuid(), title: val });
        input.value = '';
        window.renderRecurring();
        window.debouncedSave();
    };

    GoalsController.deleteRecurringTask = function (id) {
        window.animateAndDelete(`recurring-${id}`, () => {
            window.appData.recurringData.recurring = window.appData.recurringData.recurring.filter(t => t.id !== id);
            window.debouncedSave();
            window.renderRecurring();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除日常模板', { type: 'info' });
        });
    };

    GoalsController.updateRecurringTitle = function (id, text) {
        const template = window.appData.recurringData.recurring.find(t => t.id === id);
        if (template) { template.title = text; window.debouncedSave(); }
    };

    // ============ Long-term Goals ============

    GoalsController.addLongTermGoalUI = function () {
        const input = document.getElementById('new-goal-input');
        if (!input.value) return;
        window.appData.longTermData.goals.push({ title: input.value, subGoals: [] });
        input.value = '';
        window.renderLongTerm();
        window.debouncedSave();
    };

    GoalsController.deleteLongTermGoal = function (index) {
        window.appData.longTermData.goals.splice(index, 1);
        window.debouncedSave();
        window.renderLongTerm();
        if (window.UIModule?.showToast) window.UIModule.showToast('Project deleted', { type: 'info' });
    };

    GoalsController.addSubGoalUI = function (goalIndex) {
        const input = document.createElement('input');
        input.placeholder = "Enter sub-goal and press Enter";
        input.style.cssText = "width:100%; padding:5px; margin-top:5px; border:1px solid #ccc; font-size:12px;";
        input.onkeydown = (e) => {
            if (e.key === 'Enter' && input.value) {
                window.appData.longTermData.goals[goalIndex].subGoals.push({ title: input.value, progress: 0 });
                window.renderLongTerm();
                window.debouncedSave();
            }
        };
        document.getElementById('long-term-list').children[goalIndex].appendChild(input);
        input.focus();
    };

    GoalsController.deleteSubGoal = function (goalIndex, subGoalIndex) {
        window.appData.longTermData.goals[goalIndex].subGoals.splice(subGoalIndex, 1);
        window.debouncedSave();
        window.renderLongTerm();
        if (window.UIModule?.showToast) window.UIModule.showToast('Sub-goal deleted', { type: 'info' });
    };

    GoalsController.updateSubGoal = function (goalIndex, subGoalIndex, element) {
        const val = element.value;
        element.style.backgroundSize = `${val}% 100%`;
        element.previousElementSibling.innerText = `${val}%`;
        window.appData.longTermData.goals[goalIndex].subGoals[subGoalIndex].progress = parseInt(val);
        window.debouncedSave();
    };

    // ============ Recommendations ============

    GoalsController.deleteRecommendation = function (id) {
        window.animateAndDelete(`rec-${id}`, () => {
            const recommendations = window.appData.weekData.dailyData[window.appData.currentDateStr].recommendations;
            const index = recommendations.findIndex(t => t.id === id);
            if (index > -1) {
                recommendations.splice(index, 1);
                window.debouncedSave();
                window.renderRecommendations();
                if (window.UIModule?.showToast) window.UIModule.showToast('Recommendation removed', { type: 'info' });
            }
        });
    };

    // ============ Register & Expose ============

    if (window.App && window.App.Controllers) {
        window.App.Controllers.Goals = GoalsController;
    }

    // Expose to window for backward compatibility
    window.addRecurringTaskUI = GoalsController.addRecurringTaskUI;
    window.deleteRecurringTask = GoalsController.deleteRecurringTask;
    window.updateRecurringTitle = GoalsController.updateRecurringTitle;
    window.addLongTermGoalUI = GoalsController.addLongTermGoalUI;
    window.deleteLongTermGoal = GoalsController.deleteLongTermGoal;
    window.addSubGoalUI = GoalsController.addSubGoalUI;
    window.deleteSubGoal = GoalsController.deleteSubGoal;
    window.updateSubGoal = GoalsController.updateSubGoal;
    window.deleteRecommendation = GoalsController.deleteRecommendation;

})();
