// --- Timer & Pomodoro Logic ---

function openTimerModal(taskId) {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (!task) return;

    // Store current task id
    appData.currentTimerTaskId = taskId;

    document.getElementById('timer-task-title').innerText = task.content;
    document.getElementById('manual-time-input').value = Math.round(task.timer.totalWork / 60000);
    
    document.getElementById('timer-modal-overlay').style.display = 'flex';

    // Ensure display/buttons reflect current running state
    updateTimerUI();
}

function closeTimerModal() {
    const tasks = appData.weekData?.dailyData?.[appData.currentDateStr]?.tasks;
    const task = tasks?.find(t => t.id === appData.currentTimerTaskId);
    const isRunning = !!(task && (task.timer?.isRunning || (task.timer?.pomodoro && task.timer.pomodoro.isRunning)));

    if (!isRunning) {
        document.getElementById('timer-modal-overlay').style.display = 'none';
        appData.currentTimerTaskId = null;
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
        document.getElementById('timer-modal-overlay').style.display = 'none';
        appData.currentTimerTaskId = null;
        return;
    }

    titleEl.innerText = '计时进行中';
    msgEl.innerText = '关闭计时面板后，计时可以继续在后台运行。请选择：';
    cancelBtn.style.display = 'inline-block';
    yesBtn.style.display = 'inline-block';
    const restoreCancel = () => {
        cancelBtn.innerText = '取消';
        cancelBtn.onclick = () => {
            if (typeof window.closeConfirmModal === 'function') window.closeConfirmModal();
            else overlay.style.display = 'none';
        };
    };

    cancelBtn.innerText = '继续后台计时';
    yesBtn.innerText = '停止并关闭';

    cancelBtn.onclick = () => {
        overlay.style.display = 'none';
        restoreCancel();
        document.getElementById('timer-modal-overlay').style.display = 'none';
        appData.currentTimerTaskId = null;
    };

    yesBtn.onclick = () => {
        // Stop timers but keep accumulated time
        if (task?.timer?.pomodoro?.isRunning) pausePomodoro();
        if (task?.timer?.isRunning) toggleStopwatch(task.id);
        overlay.style.display = 'none';
        restoreCancel();
        document.getElementById('timer-modal-overlay').style.display = 'none';
        appData.currentTimerTaskId = null;
    };

    overlay.style.display = 'flex';
}

function switchTimerTab(tab) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(el => el.classList.remove('active'));
    document.getElementById(`${tab}-tab`).classList.add('active');
    document.querySelector(`.tab-btn[onclick="switchTimerTab('${tab}')"]`).classList.add('active');
}

function setupTimerStyle() {
    const savedStyle = localStorage.getItem('timerStyle') || 'dashboard';
    const modal = document.getElementById('timer-modal');
    modal.classList.remove('style-dashboard', 'style-minimal');
    modal.classList.add(`style-${savedStyle}`);
}

function toggleTimerStyle() {
    const modal = document.getElementById('timer-modal');
    let currentStyle = modal.classList.contains('style-minimal') ? 'minimal' : 'dashboard';
    let newStyle = currentStyle === 'dashboard' ? 'minimal' : 'dashboard';
    
    modal.classList.remove(`style-${currentStyle}`);
    modal.classList.add(`style-${newStyle}`);
    localStorage.setItem('timerStyle', newStyle);
}

function togglePomodoro() {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (!task) return;

    if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
        pausePomodoro();
    } else {
        startPomodoro();
    }
}

function startPomodoro() {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (!task) return;

    if (task.timer.isRunning) {
        toggleStopwatch(task.id); // Pause stopwatch
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
    // UI refresh is handled by the global timer loop in script.js
    updateTimerUI();
}

function pausePomodoro() {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (!task || !task.timer.pomodoro || !task.timer.pomodoro.isRunning) return;

    const pomodoro = task.timer.pomodoro;
    const elapsed = Date.now() - pomodoro.lastStart;
    pomodoro.isRunning = false;
    pomodoro.remaining -= elapsed;
    task.timer.totalPomodoro = (task.timer.totalPomodoro || 0) + elapsed;
    pomodoro.lastStart = null;
    saveData();
}

function resetPomodoro() {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (!task || !task.timer.pomodoro) return;

    const pomodoro = task.timer.pomodoro;
    pomodoro.isRunning = false;
    pomodoro.remaining = pomodoro.duration;
    pomodoro.lastStart = null;
    updateTimerUI();
}

function resetStopwatch() {
    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (task) {
        task.timer.totalWork = 0;
        task.timer.isRunning = false;
        task.timer.lastStart = null;
        saveData();
    }
}

function updateManualTime() {
    const newTime = document.getElementById('manual-time-input').value;
    if (newTime === '' || isNaN(newTime)) return;

    const task = appData.weekData.dailyData[appData.currentDateStr].tasks.find(t => t.id === appData.currentTimerTaskId);
    if (task) {
        task.timer.totalWork = newTime * 60000;
        task.timer.totalPomodoro = 0; // Reset Pomodoro so total = manual input
        saveData();
        closeTimerModal();
    }
}

function toggleStopwatch(id) {
    id = id || appData.currentTimerTaskId;
    const tasks = appData.weekData.dailyData[appData.currentDateStr].tasks;
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
        updateTimerUI();
    } else {
        // Start (and pause others)
        if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
            pausePomodoro(); // Pause pomodoro if running on this task
        }
        
        tasks.forEach(t => {
            if (t.timer.isRunning) {
                t.timer.totalWork += (now - t.timer.lastStart);
                t.timer.isRunning = false;
                t.timer.lastStart = null;
            }
        });
        task.timer.isRunning = true;
        task.timer.lastStart = now;
        // UI refresh is handled by the global timer loop in script.js
        updateTimerUI();
    }
    saveData();
}

function calculateTotalTime(task) {
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
    const tasks = appData.weekData?.dailyData?.[appData.currentDateStr]?.tasks;
    if (!tasks) return;

    tasks.forEach(task => {
        const totalTime = calculateTotalTime(task);
        // formatTime is global from script.js
        const timeStr = formatTime(totalTime);
        const isTimerActive = task.timer.isRunning || (task.timer.pomodoro && task.timer.pomodoro.isRunning);
        
        const card = document.getElementById(`task-${task.id}`);
        if (card) {
            const badge = card.querySelector('.timer-badge');
            const badgeSpan = card.querySelector('.timer-badge span');
            if (badge && badgeSpan) {
                badgeSpan.innerText = `⏱ ${timeStr}`;
                if (isTimerActive) {
                    badge.classList.add('active');
                } else {
                    badge.classList.remove('active');
                }
            }
        }
    });

    // Update Timer displays if modal is open
    if (appData.currentTimerTaskId) {
        const task = tasks.find(t => t.id === appData.currentTimerTaskId);
        if (task) {
            // Stopwatch Display
            const stopwatchDisplay = document.getElementById('stopwatch-display');
            if (stopwatchDisplay) {
                const totalStopwatchTime = (task.timer.totalWork || 0) + (task.timer.isRunning ? (Date.now() - task.timer.lastStart) : 0);
                stopwatchDisplay.innerText = formatTime(totalStopwatchTime);
            }

            // Pomodoro Display
            const pomodoroDisplay = document.getElementById('pomodoro-display');
            if (pomodoroDisplay) {
                if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
                    const pomodoro = task.timer.pomodoro;
                    const elapsed = Date.now() - pomodoro.lastStart;
                    const remaining = pomodoro.remaining - elapsed;

                    if (remaining <= 0) {
                        pomodoro.isRunning = false;
                        pomodoro.remaining = pomodoro.duration;
                        task.timer.totalPomodoro = (task.timer.totalPomodoro || 0) + pomodoro.duration;
                        saveData();
                        const audio = new Audio('https://www.soundjay.com/buttons/sounds/button-1.mp3');
                        audio.play().catch(() => {});
                        if (typeof window.showAlert === 'function') {
                            window.showAlert('番茄钟结束！', '提醒');
                        }
                        pomodoroDisplay.innerText = formatTime(pomodoro.duration);
                    } else {
                        pomodoroDisplay.innerText = formatTime(remaining);
                    }
                } else if (task.timer.pomodoro) {
                    pomodoroDisplay.innerText = formatTime(task.timer.pomodoro.remaining);
                } else {
                    pomodoroDisplay.innerText = formatTime(25 * 60 * 1000);
                }
            }

            // Update Pomodoro Toggle Button Text
            const pomodoroToggleButton = document.getElementById('pomodoro-toggle-btn');
            if (pomodoroToggleButton) {
                if (task.timer.pomodoro && task.timer.pomodoro.isRunning) {
                    pomodoroToggleButton.innerText = '暂停';
                } else {
                    pomodoroToggleButton.innerText = '开始';
                }
            }

            // Disable reset / manual adjust while running
            const pomodoroResetButton = document.getElementById('pomodoro-reset-btn');
            if (pomodoroResetButton) {
                pomodoroResetButton.disabled = !!(task.timer.pomodoro && task.timer.pomodoro.isRunning);
            }

            // Update Stopwatch Toggle Button Text
            const stopwatchToggleButton = document.getElementById('stopwatch-toggle-btn');
            if (stopwatchToggleButton) {
                if (task.timer.isRunning) {
                    stopwatchToggleButton.innerText = '暂停';
                } else {
                    stopwatchToggleButton.innerText = '开始';
                }
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

// Expose functions to window for HTML onclick handlers
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
