// ui-renderer.js - Standard Script Version

window.UIModule = {};

// Shared UI helpers
window.UIModule.emptyHtml = function(message) {
    const safe = String(message || '').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<div class="empty-state small-hint">${safe}</div>`;
};

window.UIModule.showToast = function(message, opts = {}) {
    const toast = document.getElementById('app-toast');
    const msg = document.getElementById('app-toast-msg');
    const actionBtn = document.getElementById('app-toast-action');
    if (!toast || !msg) return;

    const type = opts.type || 'info';
    const duration = typeof opts.duration === 'number' ? opts.duration : 1800;
    const actionText = opts.actionText;
    const onAction = typeof opts.onAction === 'function' ? opts.onAction : null;

    // Clear previous timers/handlers
    if (window.UIModule._toastTimer) {
        clearTimeout(window.UIModule._toastTimer);
        window.UIModule._toastTimer = null;
    }
    if (actionBtn) {
        actionBtn.onclick = null;
        actionBtn.textContent = '';
    }

    msg.textContent = String(message || '');
    toast.classList.remove('toast-success', 'toast-error', 'toast-info', 'has-action');
    toast.classList.add('show');
    toast.classList.add(type === 'success' ? 'toast-success' : (type === 'error' ? 'toast-error' : 'toast-info'));

    if (actionBtn && actionText && onAction) {
        toast.classList.add('has-action');
        actionBtn.textContent = String(actionText);
        actionBtn.onclick = () => {
            try { onAction(); } finally { window.UIModule.hideToast(); }
        };
    }

    if (duration > 0) {
        window.UIModule._toastTimer = setTimeout(() => {
            window.UIModule.hideToast();
        }, duration);
    }
};

window.UIModule.hideToast = function() {
    const toast = document.getElementById('app-toast');
    if (!toast) return;
    toast.classList.remove('show', 'toast-success', 'toast-error', 'toast-info', 'has-action');
    if (window.UIModule._toastTimer) {
        clearTimeout(window.UIModule._toastTimer);
        window.UIModule._toastTimer = null;
    }
};

window.UIModule.generateSubtasksHTML = function(task) {
    return task.subtasks.map(subtask => `
        <div class="subtask-item ${subtask.completed ? 'completed' : ''}" 
             draggable="true" 
             ondragstart="dragStartSubtask(event, '${task.id}', '${subtask.id}')"
             ondragover="allowDrop(event)"
             ondrop="dropSubtask(event, '${task.id}', '${subtask.id}')">
            <label class="custom-checkbox">
                <input type="checkbox" ${subtask.completed ? 'checked' : ''} onclick="toggleSubtaskCompletion('${task.id}', '${subtask.id}')">
                <span class="checkmark"></span>
            </label>
            <div class="subtask-text" contenteditable="true" onblur="updateSubtaskContent('${task.id}', '${subtask.id}', this.innerText)">${subtask.content}</div>
            <button class="btn-delete" onclick="deleteSubtask('${task.id}', '${subtask.id}')" title="删除子任务">×</button>
        </div>
    `).join('');
};

window.UIModule.generateTaskHTML = function(task, isDone) {
    if (!task.timer) task.timer = { totalWork: 0, isRunning: false, lastStart: null };
    if (typeof task.progress !== 'number') task.progress = 0;
    if (!Array.isArray(task.subtasks)) task.subtasks = [];

    const totalTime = (task.timer.totalWork || 0) + (task.timer.pomodoro?.totalPomodoro || 0);
    const timeStr = window.formatTime(totalTime);
    const isTimerActive = task.timer.isRunning || (task.timer.pomodoro && task.timer.pomodoro.isRunning);
    const timerClass = isTimerActive ? 'timer-badge active' : 'timer-badge';
    
    const isRecurringInstance = !!task.templateId;
    const lockIcon = isRecurringInstance ? '<span class="task-lock-icon" title="来自日常模板 (只读)">🔒</span>' : '';
    
    let contentHtml = '';
    if (isRecurringInstance) {
         contentHtml = `<div class="task-text ${isDone?'done':''}">${lockIcon}${task.content}</div>`;
    } else {
         const renderedMarkdown = (typeof marked !== 'undefined') ? marked.parse(task.content) : task.content;
         contentHtml = `
            <div class="task-content-wrapper">
                <div class="markdown-content ${isDone?'done':''}" onclick="editTaskContent('${task.id}')">${renderedMarkdown}</div>
                <div class="edit-content" contenteditable="true" onblur="saveTaskContent('${task.id}', this)" style="display:none"></div>
            </div>
         `;
    }
    
    const subtasksHtml = window.UIModule.generateSubtasksHTML(task);

    return `
        <div class="row-main">
            ${contentHtml}
            <div class="task-actions">
                <button class="btn-icon btn-ai-magic" id="btn-magic-${task.id}" onclick="breakdownTaskWithAI('${task.id}')" title="AI 智能拆分">✨</button>
                <button class="btn-delete" onclick="deleteDailyTask('${task.id}')" title="删除任务">×</button>
            </div>
        </div>

        <div class="subtask-container">
            ${subtasksHtml}
        </div>

        <div class="inline-input-group subtask-input-group">
            <input type="text" id="subtask-input-${task.id}" class="inline-input" placeholder="添加子任务..." onkeydown="if(event.key==='Enter') addSubtaskUI('${task.id}')">
            <button class="btn-small" onclick="addSubtaskUI('${task.id}')">添加</button>
        </div>
        
        <div class="controls-row">
            <div class="${timerClass}" onclick="openTimerModal('${task.id}')">
                <span>⏱ ${timeStr}</span>
            </div>

            <div class="slider-container" ${isDone ? 'style="display:none"' : 'style="flex:1; margin:0 10px;"'}
                onmouseenter="this.closest('.day-task-item').draggable = false"
                onmouseleave="this.closest('.day-task-item').draggable = true"
                onmousedown="event.stopPropagation()" 
                ontouchstart="event.stopPropagation()">
                <span class="percent-text" id="pct-${task.id}">${task.progress}%</span>
                <input type="range" min="0" max="100" value="${task.progress}" 
                    style="background-size: ${task.progress}% 100%"
                    oninput="updateDailyProgressUI('${task.id}', this)"
                    onchange="debouncedSave()">
            </div>
            <div style="color:var(--success); cursor:pointer; ${isDone ? '' : 'display:none'}" onclick="resetTask('${task.id}')">
                ✅ 已完成
            </div>
        </div>
    `;
};

window.UIModule.renderAll = function(appData) {
    window.UIModule.renderLongTerm(appData.longTermData.goals);
    window.UIModule.renderWeekly(appData.weekData.weeklyTasks, appData.currentDateStr);
    window.UIModule.renderRecommendations(appData.weekData.dailyData[appData.currentDateStr].recommendations);
    window.UIModule.renderRecurring(appData.recurringData.recurring);
    window.UIModule.renderDaily(appData.weekData.dailyData[appData.currentDateStr], appData.currentDateStr);
    
    const summaryVal = appData.weekData.dailyData[appData.currentDateStr].summary || "";
    document.getElementById('daily-summary').value = summaryVal;
    
    if (window.toggleSummaryEdit) window.toggleSummaryEdit(false);
};

window.UIModule.renderLongTerm = function(goals) {
    const list = document.getElementById('long-term-list');
    list.innerHTML = '';
    goals.forEach((goal, i) => {
        const div = document.createElement('div');
        div.className = 'task-list-item';
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:5px;">
                <div style="font-weight:600;">${goal.title}</div>
                <button class="btn-delete" onclick="deleteLongTermGoal(${i})" title="删除目标">×</button>
            </div>
            ${goal.subGoals.map((sub, j) => `
                <div style="display:flex; align-items:center; font-size:12px; margin-top:4px;">
                    <span style="flex:1; min-width:0; margin-right:5px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${sub.title}</span>
                    <div class="slider-container" style="width:40%; max-width:120px; flex:none;"
                        onmousedown="event.stopPropagation()" 
                        ontouchstart="event.stopPropagation()"
                        ondragstart="event.preventDefault(); event.stopPropagation()">
                        <span class="percent-text">${sub.progress}%</span>
                        <input type="range" min="0" max="100" value="${sub.progress}"
                            style="background-size: ${sub.progress}% 100%"
                            draggable="false"
                            oninput="updateSubGoal(${i}, ${j}, this)"
                            onchange="debouncedSave()">
                    </div>
                    <button class="btn-delete" onclick="deleteSubGoal(${i}, ${j})" title="删除子目标">×</button>
                </div>
            `).join('')}
            <div style="margin-top:5px; text-align:right;">
                <button class="btn-small btn-secondary" onclick="addSubGoalUI(${i})">+ 子目标</button>
            </div>
        `;
        list.appendChild(div);
    });
};

window.UIModule.renderWeekly = function(tasks, currentDateStr) {
    const list = document.getElementById('weekly-list');
    
    // 1. Cleanup
    Array.from(list.children).forEach(el => {
        if (el.id && el.id.startsWith('weekly-task-')) {
            const id = el.id.replace('weekly-task-', '');
            const task = tasks.find(t => t.id === id);
            if (!task) {
                el.remove();
            }
        }
    });

    tasks.forEach(task => {
        let div = document.getElementById(`weekly-task-${task.id}`);
        const daysLeft = window.calculateDaysLeft(task.deadline, currentDateStr);
        const daysLeftHtml = daysLeft ? `<span class="ddl-tag ${daysLeft.urgent ? 'ddl-urgent' : 'ddl-normal'}">${daysLeft.label}</span>` : '';
        const deadlineHtml = task.deadline ? `<span class="ddl-tag ddl-normal">截止 ${task.deadline}</span>` : '';

        if (!div) {
            // Create
            div = document.createElement('div');
            div.id = `weekly-task-${task.id}`;
            div.className = `task-list-item ${task.completed ? 'completed' : ''}`;
            div.draggable = true;
            div.ondragstart = (e) => window.dragStartWeekly(e, task);
            div.ondragover = (e) => window.allowDrop(e);
            div.ondragleave = (e) => e.currentTarget.classList.remove('drag-over');
            div.ondrop = (e) => window.dropItem(e, task.id, 'weekly');
            
            div.innerHTML = `
            <div class="row-main" style="align-items:flex-start; gap:8px;">
                <label class="custom-checkbox">
                    <input type="checkbox" ${task.completed ? 'checked' : ''} onclick="toggleWeeklyCheck('${task.id}')">
                    <span class="checkmark"></span>
                </label>
                <div style="flex:1; min-width:0;">
                    <div class="task-title" contenteditable="true" onblur="updateWeeklyText('${task.id}', this.innerText)">${task.content}</div>
                    <div class="task-meta-row">
                        ${daysLeftHtml}
                        ${deadlineHtml}
                        <input type="date" value="${task.deadline || ''}" 
                               class="ddl-input"
                               onchange="updateWeeklyDate('${task.id}', this.value)">
                        <span class="ddl-picker" onclick="this.previousElementSibling.showPicker()">📅 设置截止</span>
                    </div>
                </div>
                <div class="task-actions">
                    <button class="btn-delete" onclick="deleteWeeklyTask('${task.id}')" title="删除任务">×</button>
                </div>
            </div>`;
            list.appendChild(div);
        } else {
            // Update
            div.className = `task-list-item ${task.completed ? 'completed' : ''}`;
            const checkbox = div.querySelector('input[type="checkbox"]');
            if (checkbox) checkbox.checked = task.completed;
            
            // Update Title only if not editing
            const titleDiv = div.querySelector('.task-title');
            if (titleDiv && document.activeElement !== titleDiv) {
                if (titleDiv.innerText !== task.content) titleDiv.innerText = task.content;
            }
            
            // Update Meta Row
            const metaRow = div.querySelector('.task-meta-row');
            if (metaRow) {
                 const newMetaHTML = `
                        ${daysLeftHtml}
                        ${deadlineHtml}
                        <input type="date" value="${task.deadline || ''}" 
                               class="ddl-input"
                               onchange="updateWeeklyDate('${task.id}', this.value)">
                        <span class="ddl-picker" onclick="this.previousElementSibling.showPicker()">📅 设置截止</span>
                 `;
                 // Simple innerHTML compare might fail due to whitespace, but it's okay to overwrite here as inputs (date) are not main focus area
                 // Actually, if I am picking a date, the picker is open. Updating innerHTML might close it?
                 // But renderWeekly is called on updateWeeklyDate -> saveData -> ... no renderWeekly call in updateWeeklyDate!
                 // Wait, updateWeeklyDate calls renderWeekly!
                 // window.updateWeeklyDate = function(id, date) { ... window.renderWeekly(); }
                 // So picking a date triggers a re-render. If I wipe innerHTML, the picker might glitch or close?
                 // But typically date picker 'onchange' happens after selection.
                 // So it should be fine.
                 metaRow.innerHTML = newMetaHTML;
            }
        }
    });
};

window.UIModule.renderRecommendations = function(recommendations) {
    const list = document.getElementById('recommendation-list');
    list.innerHTML = '';

    if (!recommendations || !recommendations.length) {
        const empty = document.createElement('div');
        empty.innerHTML = window.UIModule.emptyHtml('暂无推荐任务');
        list.appendChild(empty.firstElementChild);
        return;
    }

    recommendations.forEach(task => {
        const div = document.createElement('div');
        div.className = 'task-list-item recommendation';
        div.draggable = true;
        div.ondragstart = (e) => window.dragStartRecommendation(e, task);
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div style="flex:1; min-width:0; font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${task.content}</div>
                <span class="pill-tag pill-tag--recommendation">推荐</span>
                <div class="task-actions">
                    <button class="btn-delete" onclick="deleteRecommendation('${task.id}')" title="删除推荐">×</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
};

window.UIModule.renderRecurring = function(recurringTasks) {
    const list = document.getElementById('recurring-list');
    list.innerHTML = '';

    if (!recurringTasks || !recurringTasks.length) {
        const empty = document.createElement('div');
        empty.innerHTML = window.UIModule.emptyHtml('暂无日常模板');
        list.appendChild(empty.firstElementChild);
        return;
    }

    recurringTasks.forEach(tpl => {
        const div = document.createElement('div');
        div.className = 'task-list-item recurring';
        div.draggable = true;
        div.ondragstart = (e) => window.dragStartRecurring(e, tpl);
        div.innerHTML = `
            <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                <div contenteditable="true" style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600;" onblur="updateRecurringTitle('${tpl.id}', this.innerText)">${tpl.title}</div>
                <span class="pill-tag pill-tag--recurring">日常</span>
                <div class="task-actions">
                    <button class="btn-delete" onclick="deleteRecurringTask('${tpl.id}')" title="删除模板">×</button>
                </div>
            </div>
        `;
        list.appendChild(div);
    });
};

window.UIModule.renderDaily = function(dailyData, currentDateStr) {
    const tasks = dailyData.tasks || [];
    const quadrants = [1, 2, 3, 4];
    
    // 1. Clean up removed tasks or moved tasks
    quadrants.forEach(q => {
        const list = document.getElementById(`list-q${q}`);
        // Use Array.from to avoid live collection issues during removal
        Array.from(list.children).forEach(el => {
            if (el.id && el.id.startsWith('task-')) {
                const id = el.id.replace('task-', '');
                const task = tasks.find(t => t.id === id);
                if (!task || task.quadrant !== q) {
                    el.remove();
                }
            }
        });
    });

    tasks.forEach(task => {
        const list = document.getElementById(`list-q${task.quadrant}`);
        let div = document.getElementById(`task-${task.id}`);
        const isDone = task.progress >= 100;

        if (!div) {
            // CREATE NEW
            div = document.createElement('div');
            div.id = `task-${task.id}`;
            div.className = `day-task-item ${isDone ? 'completed-task' : ''}`;
            div.draggable = true;
            div.ondragstart = (e) => window.dragStartDaily(e, task);
            div.ondragover = (e) => window.allowDrop(e);
            div.ondragleave = (e) => e.currentTarget.classList.remove('drag-over');
            div.innerHTML = window.UIModule.generateTaskHTML(task, isDone);
            list.appendChild(div);
        } else {
            // UPDATE EXISTING
            div.className = `day-task-item ${isDone ? 'completed-task' : ''}`;
            // Re-bind listeners to ensure fresh closure context (latest task object)
            div.ondragstart = (e) => window.dragStartDaily(e, task);
            div.ondragover = (e) => window.allowDrop(e);
            div.ondragleave = (e) => e.currentTarget.classList.remove('drag-over');
            
            // 1. Update Timer Badge
            const totalTime = (task.timer.totalWork || 0) + (task.timer.pomodoro?.totalPomodoro || 0);
            const timeStr = window.formatTime(totalTime);
            const isTimerActive = task.timer.isRunning || (task.timer.pomodoro && task.timer.pomodoro.isRunning);
            const badge = div.querySelector('.timer-badge');
            const badgeSpan = div.querySelector('.timer-badge span');
            if (badge && badgeSpan) {
                badgeSpan.innerText = `⏱ ${timeStr}`;
                if (isTimerActive) badge.classList.add('active');
                else badge.classList.remove('active');
            }

            // 2. Update Progress
            const slider = div.querySelector('input[type="range"]');
            const pctText = div.querySelector('.percent-text');
            if (slider) {
                slider.value = task.progress;
                slider.style.backgroundSize = `${task.progress}% 100%`;
            }
            if (pctText) pctText.innerText = `${task.progress}%`;
            
            // 3. Update Content/Markdown (Only if not currently editing)
            const editContent = div.querySelector('.edit-content');
            const isEditing = (document.activeElement === editContent);
            
            if (!isEditing) {
                const markdownView = div.querySelector('.markdown-content');
                if (markdownView) {
                     const rendered = (typeof marked !== 'undefined') ? marked.parse(task.content) : task.content;
                     if (markdownView.innerHTML !== rendered) markdownView.innerHTML = rendered;
                     markdownView.className = `markdown-content ${isDone?'done':''}`;
                }
                const taskText = div.querySelector('.task-text'); // For recurring
                if (taskText) {
                    taskText.className = `task-text ${isDone?'done':''}`;
                    // Only update text if changed to avoid cursor issues (though recurring is read-only usually)
                    // taskText contains lock icon + text.
                    const isRecurringInstance = !!task.templateId;
                    const lockIcon = isRecurringInstance ? '<span class="task-lock-icon" title="来自日常模板 (只读)">🔒</span>' : '';
                    if (taskText.innerHTML !== lockIcon + task.content) {
                        taskText.innerHTML = lockIcon + task.content;
                    }
                }
            }
            
            // 4. Update Subtasks (Rebuild container innerHTML)
            const subtaskContainer = div.querySelector('.subtask-container');
            if (subtaskContainer) {
                 const newSubtasksHTML = window.UIModule.generateSubtasksHTML(task);
                 if (subtaskContainer.innerHTML !== newSubtasksHTML) {
                     subtaskContainer.innerHTML = newSubtasksHTML;
                 }
            }

            // 5. Update Done Button Visibility
            const doneBtn = div.querySelector('.controls-row > div:last-child');
            if (doneBtn) doneBtn.style.display = isDone ? '' : 'none';
            
            const sliderContainer = div.querySelector('.slider-container');
            if (sliderContainer) {
                if (isDone) {
                    sliderContainer.style.display = 'none';
                } else {
                    sliderContainer.style.display = 'flex';
                    sliderContainer.style.flex = '1';
                    sliderContainer.style.margin = '0 10px';
                }
            }
            
            // Re-insert the element to ensure DOM order matches array order (fixes reordering issues)
            list.appendChild(div);
        }
    });
};

window.UIModule.updateDateHeader = function(currentDateStr, weekId) {
    const d = new Date(currentDateStr);
    const days = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    document.getElementById('header-date').innerText = d.toLocaleDateString('zh-CN', { year: 'numeric', month: '2-digit', day: '2-digit' });
    
    let weekStr = "--";
    if (weekId) {
        const parts = weekId.split('_W');
        if (parts.length === 2) {
            weekStr = `${parts[0]} 第 ${parts[1]} 周`;
        }
    }
    document.getElementById('header-week').innerText = `${weekStr} · ${days[d.getDay()]}`;

    const dNow = new Date();
    const offset = dNow.getTimezoneOffset() * 60000;
    const todayStr = new Date(dNow.getTime() - offset).toISOString().split('T')[0];
    document.getElementById('btn-today').style.display = (currentDateStr !== todayStr) ? 'block' : 'none';
};

window.UIModule.updateSaveIndicator = function(status) {
    // Ensure blocking overlay exists
    let overlay = document.getElementById('save-overlay');
    if (!overlay) {
        overlay = document.createElement('div');
        overlay.id = 'save-overlay';
        // Inline styles to ensure functionality regardless of external CSS
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.width = '100vw';
        overlay.style.height = '100vh';
        overlay.style.backgroundColor = 'rgba(0, 0, 0, 0.2)';
        overlay.style.zIndex = '9999';
        overlay.style.display = 'none';
        overlay.style.justifyContent = 'center';
        overlay.style.alignItems = 'center';
        overlay.style.cursor = 'wait';
        document.body.appendChild(overlay);
    }

    // Toggle overlay
    if (status === 'saving') {
        overlay.style.display = 'flex';
    } else {
        overlay.style.display = 'none';
    }

    const indicator = document.getElementById('save-indicator');
    if (!indicator) return;

    if (window.UIModule._saveIndicatorClearTimer) {
        clearTimeout(window.UIModule._saveIndicatorClearTimer);
        window.UIModule._saveIndicatorClearTimer = null;
    }

    if (status === 'saving') {
        indicator.textContent = '保存中...';
        indicator.className = 'saving';
    } else if (status === 'saved') {
        indicator.textContent = '已保存';
        indicator.className = 'saved';
        window.UIModule._saveIndicatorClearTimer = setTimeout(() => {
            indicator.className = '';
            window.UIModule._saveIndicatorClearTimer = null;
        }, 2000);
    } else if (status === 'error') {
        indicator.textContent = '保存失败';
        indicator.className = 'error';
    } else {
        indicator.className = '';
    }
};

window.UIModule.renderDailyAnalytics = function(dayData) {
    const analyticsContent = document.getElementById('analytics-content');
    if (!dayData || !dayData.tasks || dayData.tasks.length === 0) {
        analyticsContent.innerHTML = '<div class="small-hint">当天暂无数据。</div>';
        return;
    }

    const quadrantTime = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalFocusTime = 0;
    let completedTasks = 0;

    dayData.tasks.forEach(task => {
        const tWork = (task.timer?.totalWork || 0) + (task.timer?.totalPomodoro || 0);
        if (tWork > 0) {
            quadrantTime[task.quadrant] += tWork;
            totalFocusTime += tWork;
        }
        if (task.progress >= 100) completedTasks++;
    });

    const completionRate = (completedTasks / dayData.tasks.length) * 100;
    analyticsContent.innerHTML = window.UIModule.generateAnalyticsHTML('四象限时间分布（当天）', quadrantTime, totalFocusTime, completionRate);
};

window.UIModule.renderWeeklyAnalytics = function(weekData) {
    const analyticsContent = document.getElementById('analytics-content');
    if (!weekData || !weekData.dailyData) {
        analyticsContent.innerHTML = '<div class="small-hint">本周暂无数据。</div>';
        return;
    }

    const quadrantTime = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalFocusTime = 0;
    let completedTasks = 0;
    let totalTasks = 0;

    for (const date in weekData.dailyData) {
        const dayData = weekData.dailyData[date];
        if (dayData.tasks) {
            totalTasks += dayData.tasks.length;
            dayData.tasks.forEach(task => {
                const tWork = (task.timer?.totalWork || 0) + (task.timer?.totalPomodoro || 0);
                if (tWork > 0) {
                    quadrantTime[task.quadrant] += tWork;
                    totalFocusTime += tWork;
                }
                if (task.progress >= 100) completedTasks++;
            });
        }
    }

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    analyticsContent.innerHTML = window.UIModule.generateAnalyticsHTML('四象限时间分布（本周）', quadrantTime, totalFocusTime, completionRate);
};

window.UIModule.renderMonthlyAnalytics = async function(dirHandle, currentDateStr) {
    const analyticsContent = document.getElementById('analytics-content');
    analyticsContent.innerHTML = '<p>正在汇总本月数据...</p>';

    const quadrantTime = { 1: 0, 2: 0, 3: 0, 4: 0 };
    let totalFocusTime = 0;
    let completedTasks = 0;
    let totalTasks = 0;

    const currentMonth = new Date(currentDateStr).getMonth();
    const currentYear = new Date(currentDateStr).getFullYear();

    try {
        for await (const entry of dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.match(/^\d{4}_W\d+\.json$/)) {
                const match = entry.name.match(/^(\d{4})_W(\d+)\.json$/);
                if (!match) continue;
                const fileYear = parseInt(match[1], 10);
                const fileWeek = parseInt(match[2], 10);

                const weekDate = new Date(fileYear, 0, 1 + (fileWeek - 1) * 7);
                weekDate.setDate(weekDate.getDate() + (1 - weekDate.getDay() + 7) % 7);
                
                if (weekDate.getMonth() === currentMonth && weekDate.getFullYear() === currentYear) {
                    const fileContent = await window.StorageModule.readJson(entry.name);
                    if (fileContent && fileContent.dailyData) {
                        for (const date in fileContent.dailyData) {
                            const dayDate = new Date(date);
                            if (dayDate.getMonth() === currentMonth && dayDate.getFullYear() === currentYear) {
                                const dayData = fileContent.dailyData[date];
                                if (dayData.tasks) {
                                    totalTasks += dayData.tasks.length;
                                    dayData.tasks.forEach(task => {
                                        const tWork = (task.timer?.totalWork || 0) + (task.timer?.totalPomodoro || 0);
                                        if (tWork > 0) {
                                            quadrantTime[task.quadrant] += tWork;
                                            totalFocusTime += tWork;
                                        }
                                        if (task.progress >= 100) completedTasks++;
                                    });
                                }
                            }
                        }
                    }
                }
            }
        }
    } catch (e) {
        console.error('Monthly analytics failed', e);
        analyticsContent.innerHTML = window.UIModule.emptyHtml('本月数据汇总失败。');
        return;
    }

    const completionRate = totalTasks > 0 ? (completedTasks / totalTasks) * 100 : 0;
    analyticsContent.innerHTML = window.UIModule.generateAnalyticsHTML('四象限时间分布（本月）', quadrantTime, totalFocusTime, completionRate);
};

window.UIModule.renderSearchResults = function(results) {
    const container = document.getElementById('search-results-content');
    const overlay = document.getElementById('search-results-overlay');
    
    if (!results || results.length === 0) {
        container.innerHTML = window.UIModule.emptyHtml('没有找到匹配结果。');
    } else {
        container.innerHTML = results.map(r => `
            <div class="task-list-item" style="cursor:pointer;" onclick="goToDate('${r.date}')">
                <div style="font-weight:600; font-size:12px; color:var(--text-light);">${r.date} ${r.weekId ? `(${r.weekId})` : ''}</div>
                <div style="margin-top:4px;">
                    ${r.quadrant ? `<span class="pill-tag">Q${r.quadrant}</span>` : ''}
                    <span class="${r.completed ? 'done' : ''}">${r.content}</span>
                </div>
                ${r.matchContext ? `<div style="font-size:11px; color:var(--text-light); margin-top:2px;">...${r.matchContext}...</div>` : ''}
            </div>
        `).join('');
    }
    overlay.style.display = 'flex';
};

window.UIModule.generateAnalyticsHTML = function(title, quadrantTime, totalFocusTime, completionRate) {
    return `
        <div class="chart-container">
            <div class="chart-title">${title}</div>
            <div class="bar-chart">
                <div class="bar" style="height: ${totalFocusTime > 0 ? (quadrantTime[1] / totalFocusTime) * 100 : 0}%; background-color: var(--color-danger);" title="Q1: ${window.formatTimeForAnalytics(quadrantTime[1])}"></div>
                <div class="bar" style="height: ${totalFocusTime > 0 ? (quadrantTime[2] / totalFocusTime) * 100 : 0}%; background-color: var(--color-warning);" title="Q2: ${window.formatTimeForAnalytics(quadrantTime[2])}"></div>
                <div class="bar" style="height: ${totalFocusTime > 0 ? (quadrantTime[3] / totalFocusTime) * 100 : 0}%; background-color: var(--accent);" title="Q3: ${window.formatTimeForAnalytics(quadrantTime[3])}"></div>
                <div class="bar" style="height: ${totalFocusTime > 0 ? (quadrantTime[4] / totalFocusTime) * 100 : 0}%; background-color: var(--text-light);" title="Q4: ${window.formatTimeForAnalytics(quadrantTime[4])}"></div>
            </div>
            <div class="bar-chart-labels">
                <div class="bar-label">Q1</div>
                <div class="bar-label">Q2</div>
                <div class="bar-label">Q3</div>
                <div class="bar-label">Q4</div>
            </div>
        </div>
        <div class="metrics-container">
            <div class="metric">
                <div class="metric-value">${window.formatTimeForAnalytics(totalFocusTime)}</div>
                <div class="metric-label">专注总时长</div>
            </div>
            <div class="metric">
                <div class="metric-value">${completionRate.toFixed(1)}%</div>
                <div class="metric-label">完成率</div>
            </div>
        </div>
    `;
};