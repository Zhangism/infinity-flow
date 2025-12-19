// controllers/task-controller.js - Daily Task Operations
// Handles CRUD operations for daily tasks and subtasks

(function () {
    'use strict';

    const TaskController = {};

    // ============ Daily Task Operations ============

    TaskController.addDailyTaskUI = function (quadrant) {
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

    TaskController.deleteDailyTask = function (id) {
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

    TaskController.updateDailyText = function (id, txt) {
        const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        const task = tasks.find(t => t.id === id);
        if (task && task.content !== txt) {
            task.content = txt;
            window.debouncedSave();
        }
    };

    TaskController.updateDailyProgressUI = function (id, el) {
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

    TaskController.resetTask = function (id) {
        const tasks = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks;
        const task = tasks.find(t => t.id === id);
        if (task) {
            task.progress = 0;
            window.renderDaily();
            window.debouncedSave();
        }
    };

    // ============ Subtask Operations ============

    TaskController.addSubtaskUI = function (taskId) {
        const input = document.getElementById(`subtask-input-${taskId}`);
        const val = input.value.trim();
        if (!val) return;

        const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
        if (task) {
            task.subtasks.push({ id: window.uuid(), content: val, completed: false });
            input.value = '';
            TaskController.updateDailyProgressFromSubtasks(task);
            window.renderDaily();
            window.debouncedSave();
        }
    };

    TaskController.toggleSubtaskCompletion = function (taskId, subtaskId) {
        const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
        if (task) {
            const subtask = task.subtasks.find(st => st.id === subtaskId);
            if (subtask) {
                subtask.completed = !subtask.completed;
                TaskController.updateDailyProgressFromSubtasks(task);
                window.renderDaily();
                window.debouncedSave();
            }
        }
    };

    TaskController.deleteSubtask = function (taskId, subtaskId) {
        const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
        if (task) {
            task.subtasks = task.subtasks.filter(st => st.id !== subtaskId);
            TaskController.updateDailyProgressFromSubtasks(task);
            window.renderDaily();
            window.debouncedSave();
        }
    };

    TaskController.updateSubtaskContent = function (taskId, subtaskId, content) {
        const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
        if (task) {
            const subtask = task.subtasks.find(st => st.id === subtaskId);
            if (subtask) {
                subtask.content = content;
                window.debouncedSave();
            }
        }
    };

    TaskController.updateDailyProgressFromSubtasks = function (task) {
        if (task && task.subtasks.length > 0) {
            const completedCount = task.subtasks.filter(st => st.completed).length;
            task.progress = Math.round((completedCount / task.subtasks.length) * 100);
        }
    };

    // ============ Register & Expose ============

    // Register with App namespace
    if (window.App && window.App.Controllers) {
        window.App.Controllers.Task = TaskController;
    }

    // Expose to window for backward compatibility (HTML onclick handlers)
    window.addDailyTaskUI = TaskController.addDailyTaskUI;
    window.deleteDailyTask = TaskController.deleteDailyTask;
    window.updateDailyText = TaskController.updateDailyText;
    window.updateDailyProgressUI = TaskController.updateDailyProgressUI;
    window.resetTask = TaskController.resetTask;
    window.addSubtaskUI = TaskController.addSubtaskUI;
    window.toggleSubtaskCompletion = TaskController.toggleSubtaskCompletion;
    window.deleteSubtask = TaskController.deleteSubtask;
    window.updateSubtaskContent = TaskController.updateSubtaskContent;

})();
