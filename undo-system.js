// undo-system.js - Undo System for Task Operations
// Provides undo capability for delete and move operations

(function () {
    'use strict';

    const UndoSystem = {};

    UndoSystem.pushUndo = function (type, payload, message) {
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
            console.warn('UIModule.showToast not found');
        }

        // Auto-clear after 5 seconds
        window.appData.undoTimeout = setTimeout(() => {
            window.appData.undoState = null;
            if (window.UIModule?.hideToast) window.UIModule.hideToast();
        }, 5000);
    };

    UndoSystem.performUndo = function () {
        const state = window.appData.undoState;
        if (!state) return;

        if (state.type === 'DELETE_TASK') {
            const { task, date } = state.payload;
            // Restore task
            if (window.appData.weekData.dailyData[date]) {
                window.appData.weekData.dailyData[date].tasks.push(task);
                window.renderDaily();
                window.saveData();
            }
        } else if (state.type === 'MOVE_TASK') {
            const { taskId, fromDate, fromQuadrant, toQuadrant } = state.payload;
            if (window.appData.weekData.dailyData[fromDate]) {
                const tasks = window.appData.weekData.dailyData[fromDate].tasks;
                const task = tasks.find(t => t.id === taskId);
                if (task) {
                    task.quadrant = fromQuadrant;
                    window.renderDaily();
                    window.saveData();
                }
            }
        }

        // Clear state
        window.appData.undoState = null;
        if (window.UIModule?.hideToast) window.UIModule.hideToast();
        if (window.appData.undoTimeout) clearTimeout(window.appData.undoTimeout);
    };

    // ============ Register & Expose ============

    if (window.App) {
        window.App.UndoSystem = UndoSystem;
    }

    window.pushUndo = UndoSystem.pushUndo;
    window.performUndo = UndoSystem.performUndo;

})();
