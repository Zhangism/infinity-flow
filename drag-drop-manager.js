// drag-drop-manager.js - Modularized Drag & Drop Logic for Infinity Flow

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

window.dragStartWeekly = function (e, task) {
    window.dragSrcType = 'weekly';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'copy';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartDaily = function (e, task) {
    window.dragSrcType = 'daily';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'move';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.day-task-item')?.classList.add('dragging');
};

window.dragStartRecommendation = function (e, task) {
    window.dragSrcType = 'recommendation';
    window.dragPayload = task;
    e.dataTransfer.effectAllowed = 'move';
    createDragPreview(e, task.content || 'Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartRecurring = function (e, tpl) {
    window.dragSrcType = 'recurring';
    window.dragPayload = tpl;
    e.dataTransfer.effectAllowed = 'copy';
    createDragPreview(e, tpl.title || 'Recurring Task');
    e.target.closest('.task-list-item')?.classList.add('dragging');
};

window.dragStartSubtask = function (e, taskId, subtaskId) {
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

window.allowDrop = function (e) {
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

window.drop = function (e, targetQ) {
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

window.dropItem = function (e, targetId, targetType) {
    e.preventDefault();
    e.stopPropagation();
    document.querySelectorAll('.drag-over').forEach(el => el.classList.remove('drag-over'));
    window.dragSrcType = null;
};

window.dropSubtask = function (e, targetTaskId, targetSubtaskId) {
    e.preventDefault();
    e.stopPropagation();
    window.dragSrcType = null;
};
