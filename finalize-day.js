// finalize-day.js - Day/Week Finalization Logic
// Handles migration of unfinished tasks to the next day

(function () {
    'use strict';

    const FinalizeDay = {};

    FinalizeDay.finalizeDayAndWeek = async function () {
        // Check for completed but unscheduled tasks first
        if (typeof window.ScheduleModule?.checkCompletedButUnscheduled === 'function') {
            const check = window.ScheduleModule.checkCompletedButUnscheduled();
            if (check.hasIssues) {
                const taskNames = check.tasks.map(t => `• ${t.content}`).slice(0, 5).join('\n');
                const moreText = check.tasks.length > 5 ? `\n...及其他 ${check.tasks.length - 5} 个任务` : '';
                const proceed = await new Promise(resolve => {
                    window.showConfirm(
                        `以下已完成任务未排入时间轴：\n${taskNames}${moreText}\n\n是否继续完成今天的工作？`,
                        () => resolve(true),
                        '未排程任务提醒'
                    );
                    // Set up cancel handler
                    setTimeout(() => {
                        const cancelBtn = document.querySelector('#confirm-modal-overlay .btn-cancel');
                        if (cancelBtn) {
                            const originalClick = cancelBtn.onclick;
                            cancelBtn.onclick = () => {
                                if (originalClick) originalClick();
                                resolve(false);
                            };
                        }
                    }, 0);
                });
                if (!proceed) return;
            }
        }

        const todayStr = window.appData.currentDateStr;
        const todayDate = new Date(todayStr);
        const nextDate = new Date(todayDate);
        nextDate.setDate(nextDate.getDate() + 1);
        const nextDateStr = nextDate.toISOString().split('T')[0];

        const todayDay = window.appData.weekData.dailyData[todayStr];
        if (!todayDay) return;

        // 1. 收集未完成的每日任务
        const unfinishedDaily = (todayDay.tasks || []).filter(t => t.progress < 100);

        // 2. 收集未完成的周任务 (仅限周日)
        let unfinishedWeekly = [];
        if (todayDate.getDay() === 0) { // 0 is Sunday
            unfinishedWeekly = (window.appData.weekData.weeklyTasks || []).filter(t => !t.completed);
        }

        // 3. 收集今日推荐任务 (未处理的)
        const pendingRecommendations = todayDay.recommendations || [];

        const count = unfinishedDaily.length + unfinishedWeekly.length + pendingRecommendations.length;
        if (count === 0) {
            if (window.UIModule?.showToast) {
                window.UIModule.showToast('今天没有需要迁移的项目', { type: 'info' });
            } else {
                window.showAlert("今天没有未完成的任务或推荐任务需要迁移。", "提示");
            }
            return;
        }

        window.showConfirm(`将 ${count} 个项目移动到明天的推荐列表?\n(含: ${unfinishedDaily.length} 个未完成任务, ${unfinishedWeekly.length} 个周任务, ${pendingRecommendations.length} 个推荐任务)`, async () => {
            window.UIModule.updateSaveIndicator('saving');

            try {
                // 确定目标文件
                const nextWeekFile = window.getWeekFileName(nextDateStr);
                let targetData = null;
                let isCrossWeek = (nextWeekFile !== window.appData.currentWeekFile);

                if (isCrossWeek) {
                    // 跨周：读取下周文件
                    targetData = await window.readJson(nextWeekFile);
                    if (!targetData) {
                        targetData = {
                            weekId: window.getWeekId(nextDateStr),
                            weeklyTasks: [],
                            dailyData: {}
                        };
                    }
                } else {
                    // 同周：直接使用内存数据
                    targetData = window.appData.weekData;
                }

                // 确保数据结构存在
                if (!targetData.dailyData[nextDateStr]) {
                    targetData.dailyData[nextDateStr] = { tasks: [], recommendations: [], summary: "", schedule: [] };
                }
                if (!targetData.dailyData[nextDateStr].recommendations) {
                    targetData.dailyData[nextDateStr].recommendations = [];
                }
                if (!targetData.dailyData[nextDateStr].schedule) {
                    targetData.dailyData[nextDateStr].schedule = [];
                }

                const targetRecs = targetData.dailyData[nextDateStr].recommendations;

                // 辅助函数：去重添加（保留进度和子任务，但清除计时器）
                const addRec = (task, isWeeklyTask = false) => {
                    const content = isWeeklyTask ? `[周任务] ${task.content}` : task.content;
                    const exists = targetRecs.some(r => r.content === content);
                    if (!exists) {
                        targetRecs.push({
                            id: window.uuid(),
                            content: content,
                            quadrant: task.quadrant || 4,
                            progress: task.progress || 0,
                            timer: { totalWork: 0, isRunning: false, lastStart: null },
                            subtasks: task.subtasks ? JSON.parse(JSON.stringify(task.subtasks)) : []
                        });
                    }
                };

                // 迁移每日任务（保留完整数据包括子任务）
                unfinishedDaily.forEach(t => addRec(t, false));

                // 迁移周任务 (添加前缀区分)
                unfinishedWeekly.forEach(t => addRec({ content: t.content, quadrant: 2, progress: 0, timer: null, subtasks: [] }, true));

                // 迁移推荐任务（保留完整数据）
                pendingRecommendations.forEach(r => addRec(r, false));

                // 保存数据
                if (isCrossWeek) {
                    await window.writeJson(nextWeekFile, targetData);
                }
                // 总是保存当前数据
                await window.saveData();

                window.UIModule.updateSaveIndicator('saved');
                if (window.UIModule?.showToast) {
                    window.UIModule.showToast(`已迁移 ${count} 个项目 → ${nextDateStr}`, { type: 'success', duration: 2200 });
                } else {
                    window.showAlert(`已将 ${count} 个任务迁移至 ${nextDateStr} 的推荐列表。`, "迁移成功");
                }

            } catch (e) {
                console.error(e);
                window.UIModule.updateSaveIndicator('error');
                window.showAlert("迁移失败: " + e.message, "错误");
            }
        }, "确认迁移");
    };

    // ============ Register & Expose ============

    if (window.App) {
        window.App.FinalizeDay = FinalizeDay;
    }

    window.finalizeDayAndWeek = FinalizeDay.finalizeDayAndWeek;

})();
