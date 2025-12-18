// --- Timer & Pomodoro Logic ---

function openTimerModal(taskId) {
    console.log('[Timer] Opening modal for task:', taskId);
    // window.alert('Timer triggered for: ' + taskId); // Uncommented for direct user feedback if needed
    const dateStr = window.appData.currentDateStr;
    const dailyData = window.appData.weekData?.dailyData?.[dateStr];

    if (!dailyData || !dailyData.tasks) {
        console.error('[Timer] Daily data or tasks missing for date:', dateStr);
        return;
    }

    const task = dailyData.tasks.find(t => t.id === taskId);
    if (!task) {
        console.error('[Timer] Task not found in current daily tasks:', taskId, 'Available IDs:', dailyData.tasks.map(t => t.id));
        return;
    }

    // Initialize timer if missing (defensive)
    if (!task.timer) {
        task.timer = { totalWork: 0, isRunning: false, lastStart: null };
    }

    // Store current task id
    window.appData.currentTimerTaskId = taskId;

    const titleEl = document.getElementById('timer-task-title');
    const manualInput = document.getElementById('manual-time-input');
    const overlay = document.getElementById('timer-modal-overlay');

    if (titleEl) titleEl.innerText = task.content || '未命名任务';
    if (manualInput) manualInput.value = Math.round((task.timer.totalWork || 0) / 60000);

    if (overlay) {
        console.log('[Timer] Showing overlay');
        overlay.style.display = 'flex';
        // Use timeout to trigger CSS transition
        setTimeout(() => {
            overlay.classList.add('show');
        }, 10);
    } else {
        console.error('[Timer] #timer-modal-overlay not found in DOM!');
    }

    // Ensure display/buttons reflect current running state
    if (typeof window.updateTimerUI === 'function') {
        window.updateTimerUI();
    }
}

function closeTimerModal() {
    const dateStr = window.appData.currentDateStr;
    const tasks = window.appData.weekData?.dailyData?.[dateStr]?.tasks;
    const task = tasks?.find(t => t.id === window.appData.currentTimerTaskId);
    const isRunning = !!(task && (task.timer?.isRunning || (task.timer?.pomodoro && task.timer.pomodoro.isRunning)));

    const hide = () => {
        const overlay = document.getElementById('timer-modal-overlay');
        if (overlay) {
            overlay.classList.remove('show');
            setTimeout(() => {
                overlay.style.display = 'none';
                window.appData.currentTimerTaskId = null;
            }, 300);
        }
    };

    if (!isRunning) {
        hide();
        return;
    }

    // Reuse existing confirm modal: left = continue in background, right = stop and close
    const overlay = document.getElementById('confirm-modal-overlay');
    const titleEl = document.getElementById('confirm-title');
    const msgEl = document.getElementById('confirm-message');
    const yesBtn = document.getElementById('confirm-yes-btn');
    const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');

    if (!overlay || !titleEl || !msgEl || !yesBtn || !cancelBtn) {
        // Fallback: close without stopping
        hide();
        return;
    }

    titleEl.innerText = '计时进行中';
    msgEl.innerText = '关闭计时面板后，计时可以继续在后台运行。请选择：';
    cancelBtn.style.display = 'inline-block';
    yesBtn.style.display = 'inline-block';

    // Save original handlers if needed, but here we just overwrite
    cancelBtn.innerText = '继续后台计时';
    yesBtn.innerText = '停止并关闭';

    cancelBtn.onclick = () => {
        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
        hide();
    };

    yesBtn.onclick = () => {
        // Stop timers
        if (task?.timer?.pomodoro?.isRunning) window.pausePomodoro();
        if (task?.timer?.isRunning) window.toggleStopwatch(task.id);

        overlay.classList.remove('show');
        setTimeout(() => overlay.style.display = 'none', 300);
        hide();
    };

    overlay.style.display = 'flex';
    setTimeout(() => overlay.classList.add('show'), 10);
}

function switchTimerTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));

    const content = document.getElementById(`${tab}-tab`);
    if (content) content.classList.add('active');

    const btn = document.querySelector(`.tab-btn[onclick*="${tab}"]`);
    if (btn) btn.classList.add('active');
}

function setupTimerStyle() {
    const savedStyle = localStorage.getItem('timerStyle') || 'dashboard';
    const modal = document.getElementById('timer-modal');
    if (modal) {
        modal.classList.remove('style-dashboard', 'style-minimal');
        modal.classList.add(`style-${savedStyle}`);
    }
}

function toggleTimerStyle() {
    const modal = document.getElementById('timer-modal');
    if (!modal) return;
    let currentStyle = modal.classList.contains('style-minimal') ? 'minimal' : 'dashboard';
    let newStyle = currentStyle === 'dashboard' ? 'minimal' : 'dashboard';

    modal.classList.remove(`style-${currentStyle}`);
    modal.classList.add(`style-${newStyle}`);
    localStorage.setItem('timerStyle', newStyle);
}

function togglePomodoro() {
    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (!task) return;

    if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
        window.pausePomodoro();
    } else {
        window.startPomodoro();
    }
}

function startPomodoro() {
    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (!task) return;

    if (task.timer.isRunning) {
        window.toggleStopwatch(task.id); // Pause stopwatch
    }

    if (!task.timer.pomodoro) {
        task.timer.pomodoro = {
            duration: 25 * 60 * 1000,
            remaining: 25 * 60 * 1000,
            isRunning: false,
            lastStart: null
        };
    }

    const pomodoro = task.timer.pomodoro;
    if (pomodoro.isRunning) return;

    pomodoro.isRunning = true;
    pomodoro.lastStart = Date.now();
    window.updateTimerUI();
}

function pausePomodoro() {
    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (!task || !task.timer.pomodoro || !task.timer.pomodoro.isRunning) return;

    const pomodoro = task.timer.pomodoro;
    const elapsed = Date.now() - pomodoro.lastStart;
    pomodoro.isRunning = false;
    pomodoro.remaining -= elapsed;
    task.timer.totalPomodoro = (task.timer.totalPomodoro || 0) + elapsed;
    pomodoro.lastStart = null;
    if (window.debouncedSave) window.debouncedSave();
}

function resetPomodoro() {
    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (!task || !task.timer.pomodoro) return;

    const pomodoro = task.timer.pomodoro;
    pomodoro.isRunning = false;
    pomodoro.remaining = pomodoro.duration;
    pomodoro.lastStart = null;
    window.updateTimerUI();
}

function resetStopwatch() {
    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (task) {
        task.timer.totalWork = 0;
        task.timer.isRunning = false;
        task.timer.lastStart = null;
        if (window.debouncedSave) window.debouncedSave();
    }
}

function updateManualTime() {
    const manualInput = document.getElementById('manual-time-input');
    if (!manualInput) return;
    const newTime = manualInput.value;
    if (newTime === '' || isNaN(newTime)) return;

    const dateStr = window.appData.currentDateStr;
    const task = window.appData.weekData?.dailyData?.[dateStr]?.tasks.find(t => t.id === window.appData.currentTimerTaskId);
    if (task) {
        task.timer.totalWork = newTime * 60000;
        task.timer.totalPomodoro = 0; // Reset Pomodoro so total = manual input
        if (window.debouncedSave) window.debouncedSave();
        window.closeTimerModal();
    }
}

function toggleStopwatch(id) {
    id = id || window.appData.currentTimerTaskId;
    const dateStr = window.appData.currentDateStr;
    const tasks = window.appData.weekData?.dailyData?.[dateStr]?.tasks || [];
    const task = tasks.find(t => t.id === id);
    if (!task) return;

    if (!task.timer) {
        task.timer = { totalWork: 0, isRunning: false, lastStart: null };
    }

    const now = Date.now();
    if (task.timer.isRunning) {
        // Pause current
        task.timer.totalWork += (now - task.timer.lastStart);
        task.timer.isRunning = false;
        task.timer.lastStart = null;
    } else {
        // Start (and pause others)
        if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
            window.pausePomodoro(); // Pause pomodoro if running on this task
        }

        tasks.forEach(t => {
            if (t.timer && t.timer.isRunning) {
                t.timer.totalWork += (now - t.timer.lastStart);
                t.timer.isRunning = false;
                t.timer.lastStart = null;
            }
        });
        task.timer.isRunning = true;
        task.timer.lastStart = now;
    }
    window.updateTimerUI();
    if (window.debouncedSave) window.debouncedSave();
}

function calculateTotalTime(task) {
    if (!task.timer) return 0;
    let total = (task.timer.totalWork || 0) + (task.timer.totalPomodoro || 0);
    if (task.timer.isRunning && task.timer.lastStart) {
        total += (Date.now() - task.timer.lastStart);
    }
    if (task.timer.pomodoro && task.timer.pomodoro.isRunning && task.timer.pomodoro.lastStart) {
        total += (Date.now() - task.timer.pomodoro.lastStart);
    }
    return total;
}

function updateTimerUI() {
    const dateStr = window.appData.currentDateStr;
    const tasks = window.appData.weekData?.dailyData?.[dateStr]?.tasks;
    if (!tasks) return;

    tasks.forEach(task => {
        const totalTime = calculateTotalTime(task);
        if (typeof window.formatTime !== 'function') return;
        const timeStr = window.formatTime(totalTime);
        const isTimerActive = !!(task.timer.isRunning || (task.timer.pomodoro && task.timer.pomodoro.isRunning));

        const card = document.getElementById(`task-${task.id}`);
        if (card) {
            const badge = card.querySelector('.timer-badge');
            const badgeSpan = card.querySelector('.timer-badge span');
            if (badge && badgeSpan) {
                badgeSpan.innerText = `⏱ ${timeStr}`;
                badge.classList.toggle('active', isTimerActive);
            }
        }
    });

    // Update Timer displays if modal is open
    if (window.appData.currentTimerTaskId) {
        const task = tasks.find(t => t.id === window.appData.currentTimerTaskId);
        if (task) {
            const stopwatchDisplay = document.getElementById('stopwatch-display');
            if (stopwatchDisplay) {
                const totalStopwatchTime = (task.timer.totalWork || 0) + (task.timer.isRunning ? (Date.now() - task.timer.lastStart) : 0);
                stopwatchDisplay.innerText = window.formatTime(totalStopwatchTime);
            }

            const pomodoroDisplay = document.getElementById('pomodoro-display');
            if (pomodoroDisplay) {
                if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
                    const pomodoro = task.timer.pomodoro;
                    const elapsed = Date.now() - pomodoro.lastStart;
                    const remaining = Math.max(0, pomodoro.remaining - elapsed);

                    if (remaining <= 0) {
                        pomodoro.isRunning = false;
                        const actualElapsed = Date.now() - pomodoro.lastStart;
                        task.timer.totalPomodoro = (task.timer.totalPomodoro || 0) + actualElapsed;
                        pomodoro.remaining = pomodoro.duration;
                        pomodoro.lastStart = null;
                        if (window.debouncedSave) window.debouncedSave();
                        const audio = new Audio('https://www.soundjay.com/buttons/sounds/button-1.mp3');
                        audio.play().catch(() => { });
                        if (typeof window.showAlert === 'function') {
                            window.showAlert('番茄钟结束！', '提醒');
                        }
                        pomodoroDisplay.innerText = window.formatTime(pomodoro.duration);
                    } else {
                        pomodoroDisplay.innerText = window.formatTime(remaining);
                    }
                } else if (task.timer.pomodoro) {
                    pomodoroDisplay.innerText = window.formatTime(task.timer.pomodoro.remaining);
                } else {
                    pomodoroDisplay.innerText = window.formatTime(25 * 60 * 1000);
                }
            }

            const pomodoroToggleButton = document.getElementById('pomodoro-toggle-btn');
            if (pomodoroToggleButton) {
                pomodoroToggleButton.innerText = (task.timer.pomodoro && task.timer.pomodoro.isRunning) ? '暂停' : '开始';
            }

            const pomodoroResetButton = document.getElementById('pomodoro-reset-btn');
            if (pomodoroResetButton) {
                pomodoroResetButton.disabled = !!(task.timer.pomodoro && task.timer.pomodoro.isRunning);
            }

            const stopwatchToggleButton = document.getElementById('stopwatch-toggle-btn');
            if (stopwatchToggleButton) {
                stopwatchToggleButton.innerText = task.timer.isRunning ? '暂停' : '开始';
            }

            const stopwatchResetButton = document.getElementById('stopwatch-reset-btn');
            if (stopwatchResetButton) {
                stopwatchResetButton.disabled = !!task.timer.isRunning;
            }

            const manualInput = document.getElementById('manual-time-input');
            const manualBtn = document.querySelector('.manual-time-adjust button.btn-small');
            const anyRunning = !!(task.timer.isRunning || (task.timer.pomodoro && task.timer.pomodoro.isRunning));
            if (manualInput) manualInput.disabled = anyRunning;
            if (manualBtn) manualBtn.disabled = anyRunning;
        }
    }
}

// Expose functions to window
window.openTimerModal = openTimerModal;
window.closeTimerModal = closeTimerModal;
window.switchTimerTab = switchTimerTab;
window.setupTimerStyle = setupTimerStyle;
window.toggleTimerStyle = toggleTimerStyle;
window.togglePomodoro = togglePomodoro;
window.startPomodoro = startPomodoro;
window.pausePomodoro = pausePomodoro;
window.resetPomodoro = resetPomodoro;
window.resetStopwatch = resetStopwatch;
window.updateManualTime = updateManualTime;
window.toggleStopwatch = toggleStopwatch;
window.updateTimerUI = updateTimerUI;
