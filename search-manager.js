// search-manager.js - Modularized Search Logic for Infinity Flow

window.searchAllFiles = async function (keyword) {
    const inputEl = document.getElementById('search-input');
    const errorEl = document.getElementById('search-error');
    const raw = (keyword ?? inputEl?.value ?? '').toString();
    const normalized = raw.trim();
    setInlineError(inputEl, errorEl, '');

    if (!window.dirHandle) {
        setInlineError(inputEl, errorEl, '请先打开项目工作区后再搜索。');
        return;
    }
    if (!normalized) {
        setInlineError(inputEl, errorEl, '请输入要搜索的关键词。');
        return;
    }

    const results = [];
    const lowerKey = normalized.toLowerCase();

    try {
        for await (const entry of window.dirHandle.values()) {
            if (entry.kind === 'file' && entry.name.match(/^\d{4}_W\d+\.json$/)) {
                try {
                    const data = await window.readJson(entry.name);
                    if (!data) continue;

                    // Search Daily Tasks
                    if (data.dailyData) {
                        for (const date in data.dailyData) {
                            const day = data.dailyData[date];
                            if (day.tasks) {
                                day.tasks.forEach(t => {
                                    if (t.content && t.content.toLowerCase().includes(lowerKey)) {
                                        results.push({
                                            date: date,
                                            weekId: data.weekId,
                                            quadrant: t.quadrant,
                                            content: t.content,
                                            completed: t.progress >= 100,
                                            matchContext: '任务内容'
                                        });
                                    }
                                    if (t.subtasks) {
                                        t.subtasks.forEach(st => {
                                            if (st.content && st.content.toLowerCase().includes(lowerKey)) {
                                                results.push({
                                                    date: date,
                                                    weekId: data.weekId,
                                                    quadrant: t.quadrant,
                                                    content: `子任务：${st.content}（所属：${t.content}）`,
                                                    completed: st.completed,
                                                    matchContext: '子任务'
                                                });
                                            }
                                        });
                                    }
                                });
                            }
                            if (day.summary && day.summary.toLowerCase().includes(lowerKey)) {
                                results.push({
                                    date: date,
                                    weekId: data.weekId,
                                    quadrant: null,
                                    content: '日复盘',
                                    completed: false,
                                    matchContext: day.summary.substring(0, 50) + '...'
                                });
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`Failed to read/parse ${entry.name}`, e);
                }
            }
        }
    } catch (e) {
        console.error("Search failed", e);
        setInlineError(inputEl, errorEl, '搜索失败：' + (e?.message || '未知错误'));
    }

    window.UIModule.renderSearchResults(results);
};
