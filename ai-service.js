// ai-service.js - Modularized AI Logic for Infinity Flow

async function callChatCompletions({ baseUrl, key, model }, messages) {
    if (!baseUrl) throw new Error('AI not configured.');
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, messages, stream: false })
        });
    } catch (_) {
        throw new Error('AI network error.');
    }

    if (!response.ok) {
        throw new Error(`AI request failed (${response.status}).`);
    }

    const data = await response.json();
    return data?.choices?.[0]?.message?.content || '';
}

async function callChatCompletionsRaw({ baseUrl, key, model }, messages) {
    if (!baseUrl) throw new Error('AI not configured.');
    const headers = { 'Content-Type': 'application/json' };
    if (key) headers['Authorization'] = 'Bearer ' + key;

    const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
    let response;
    try {
        response = await fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify({ model, messages, stream: false })
        });
    } catch (err) {
        return {
            ok: false,
            status: 0,
            statusText: 'NETWORK_ERROR',
            text: String(err?.message || err),
            content: ''
        };
    }

    const text = await response.text();
    let content = '';
    try {
        const data = JSON.parse(text);
        content = data?.choices?.[0]?.message?.content || '';
    } catch (_) {
        // Non-JSON response; keep raw text.
    }

    return {
        ok: response.ok,
        status: response.status,
        statusText: response.statusText,
        text,
        content
    };
}

window.generateAutoSummary = async function () {
    const summaryTextarea = document.getElementById('daily-summary');
    if (!summaryTextarea) return;

    const aiBaseUrl = localStorage.getItem('aiBaseUrl');
    const aiKey = localStorage.getItem('aiKey');
    const aiModel = localStorage.getItem('aiModel');

    if (!aiBaseUrl) {
        window.showAlert("请先在“设置”中配置 AI 基础地址。", '提示');
        return;
    }

    // 1. 获取历史 Context (RAG Lite)
    window.UIModule.updateSaveIndicator('saving');
    const historyContext = await fetchRecentSummaries(7);

    // 2. 获取今日数据
    const dailyData = window.appData.weekData.dailyData[window.appData.currentDateStr];
    const tasks = dailyData.tasks || [];
    const completedTasks = tasks.filter(t => t.progress >= 100);
    const unfinishedTasks = tasks.filter(t => t.progress < 100);
    const totalTime = tasks.reduce((acc, t) => acc + (t.timer?.totalWork || 0) + (t.timer?.totalPomodoro || 0), 0);

    const currentContext = `
        Date: ${window.appData.currentDateStr}
        Completed Tasks: ${completedTasks.map(t => t.content).join(', ')}
        Unfinished Tasks: ${unfinishedTasks.map(t => t.content).join(', ')}
        Total Focus Time: ${window.formatTimeForAnalytics(totalTime)}
        Long Term Goals: ${(window.appData.longTermData?.goals || []).map(g => g.title).join(', ')}
    `;

    const fullContext = `
        ${historyContext}
        
        Current Day Data:
        ${currentContext}
    `;

    const systemPrompt = localStorage.getItem('aiCustomPrompt') || "你是一名生产力教练。根据提供的数据总结用户的一天。使用Markdown格式（成就 🌟，分析 ⏱️，建议 💡）。保持简洁。如果提供了历史数据，提及任何趋势。";

    try {
        const headers = { 'Content-Type': 'application/json' };
        if (aiKey) headers['Authorization'] = 'Bearer ' + aiKey;

        const response = await fetch(`${aiBaseUrl.replace(/\/+$/, '')}/chat/completions`, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                model: aiModel,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: fullContext + "\n\n根据数据对用户今天的工作进行复盘:" }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const summaryRaw = data.choices[0].message.content;
        const summary = (summaryRaw || '').replace(/<think>[\s\S]*?<\/think>/gi, '').trim();

        window.appData.weekData.dailyData[window.appData.currentDateStr].summary = summary;
        window.UIModule.renderAll(window.appData);
        saveData();
        window.UIModule.updateSaveIndicator('saved');

    } catch (e) {
        console.error(e);
        window.showAlert("AI 复盘生成失败：" + (e?.message || '未知错误'), '错误');
        window.UIModule.updateSaveIndicator('error');
    }
};

window.breakdownTaskWithAI = async function (taskId) {
    const task = window.appData.weekData.dailyData[window.appData.currentDateStr].tasks.find(t => t.id === taskId);
    if (!task) return;

    const aiConfig = window.getAiConfig();
    if (!aiConfig.baseUrl) {
        window.showAlert("请先在“设置”中配置 AI 参数。", '提示');
        return;
    }

    const btn = document.getElementById(`btn-magic-${taskId}`);
    if (btn) btn.innerText = "⏳";

    try {
        const system = [
            '你是一个任务拆分助手。',
            '请基于用户任务，返回 3-5 条子任务。',
            '只输出严格的 JSON 数组（字符串数组），不要 markdown，不要解释，不要额外文本，不要 <think>。',
            '示例：["步骤 1", "步骤 2"]。'
        ].join(' ');

        const raw = await callChatCompletions(aiConfig, [
            { role: 'system', content: system },
            { role: 'user', content: `Task: ${task.content}` }
        ]);

        const parsed = window.extractAndParseJson(raw);
        const subtasks = Array.isArray(parsed) ? parsed : (Array.isArray(parsed?.subtasks) ? parsed.subtasks : null);

        if (Array.isArray(subtasks)) {
            subtasks.forEach(st => {
                task.subtasks.push({ id: window.uuid(), content: st, completed: false });
            });
            window.renderDaily();
            saveData();
        }

    } catch (e) {
        console.error(e);
        window.showAlert("AI 拆分失败：" + (e?.message || '未知错误'), '错误');
    } finally {
        if (btn) btn.innerText = "✨";
    }
};

window.executeSmartAdd = async function () {
    const inputEl = document.getElementById('smart-add-input');
    const errorEl = document.getElementById('smart-add-error');
    const input = (inputEl?.value || '').trim();
    setInlineError(inputEl, errorEl, '');
    if (!input) {
        setInlineError(inputEl, errorEl, '请输入要解析的内容。');
        return;
    }

    const btn = document.getElementById('btn-smart-add-confirm');
    const originalText = btn.innerText;
    btn.innerText = "解析中...";
    btn.disabled = true;

    const previewEl = document.getElementById('smart-add-preview');
    if (previewEl) previewEl.innerText = '正在解析...';

    const aiConfig = window.getAiConfig();
    if (!aiConfig.baseUrl) {
        setInlineError(inputEl, errorEl, '请先在“设置”中配置 AI 参数。');
        btn.innerText = originalText;
        btn.disabled = false;
        if (previewEl) previewEl.innerText = '';
        return;
    }

    const today = window.appData.currentDateStr;

    if (!window.inboxData) {
        if (typeof window.loadInbox === 'function') {
            try { await window.loadInbox(); } catch (_) { /* ignore */ }
        }
        if (!window.inboxData) window.inboxData = { items: [] };
        if (!Array.isArray(window.inboxData.items)) window.inboxData.items = [];
    }

    const systemPrompt = `你是一个任务解析助手。当前日期：${today}。
严格按规则抽取结构化信息，并且【只输出 JSON】（不要解释，不要思考过程，不要 <think>）。
规则：
1) 输入体现明确执行日期（如“明天”“下周一”）=> target="daily" 且 date="YYYY-MM-DD"。
2) 只有截止日期/期限（如“周五前”）=> target="weekly" 且 deadline="YYYY-MM-DD"。
3) 无法判断 => target="inbox"。
4) 根据紧急/重要词推断 quadrant=1-4，默认 4。
5) 抽取干净的 content。

仅输出 JSON：{ "target": "inbox"|"daily"|"weekly", "content": "...", "date": "YYYY-MM-DD"?, "deadline": "YYYY-MM-DD"?, "quadrant": 1-4 }`;

    try {
        const rawResp = await callChatCompletionsRaw(aiConfig, [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: input }
        ]);

        if (!rawResp.ok) {
            if (previewEl) {
                previewEl.innerText = [
                    '❌ AI 请求失败（将显示完整返回内容用于排查）',
                    `HTTP: ${rawResp.status} ${rawResp.statusText || ''}`.trim(),
                    '',
                    rawResp.text || '(empty response body)'
                ].join('\n');
            }
            return;
        }

        let result;
        try {
            result = window.extractAndParseJson(rawResp.content || rawResp.text);
        } catch (_) {
            const fixerSystem = `你是一个严格的 JSON 纠错器。只输出 JSON，不要解释，不要思考过程，不要 <think>。\n\n` +
                `目标 schema：{ "target": "inbox"|"daily"|"weekly", "content": "...", "date": "YYYY-MM-DD"?, "deadline": "YYYY-MM-DD"?, "quadrant": 1-4 }`;
            const cleanedRaw = window.stripModelThinking(rawResp.content || rawResp.text).slice(0, 2000);
            const fixedResp = await callChatCompletionsRaw(aiConfig, [
                { role: 'system', content: fixerSystem },
                { role: 'user', content: `User input: ${input}\n\nBad output (convert to JSON only):\n${cleanedRaw}` }
            ]);

            if (!fixedResp.ok) {
                if (previewEl) {
                    previewEl.innerText = [
                        '❌ AI 二次纠错请求失败（将显示完整返回内容用于排查）',
                        `HTTP: ${fixedResp.status} ${fixedResp.statusText || ''}`.trim(),
                        '',
                        fixedResp.text || '(empty response body)',
                        '',
                        '----',
                        '首次模型输出（完整）：',
                        rawResp.content || rawResp.text || '(empty)'
                    ].join('\n');
                }
                return;
            }

            result = window.extractAndParseJson(fixedResp.content || fixedResp.text);
        }

        if (!result || typeof result !== 'object') throw new Error('AI returned invalid result.');
        if (typeof result.target === 'string') result.target = result.target.toLowerCase();
        if (!result.content || typeof result.content !== 'string') throw new Error('AI returned invalid content.');
        if (result.quadrant != null) result.quadrant = Number(result.quadrant);
        if (![1, 2, 3, 4].includes(result.quadrant)) result.quadrant = 4;

        let message = "";
        if (result.target === 'daily') {
            if (result.date === window.appData.currentDateStr) {
                window.appData.weekData.dailyData[result.date].tasks.push({
                    id: window.uuid(),
                    content: result.content,
                    quadrant: result.quadrant || 4,
                    progress: 0,
                    timer: { totalWork: 0, isRunning: false },
                    subtasks: []
                });
                window.renderDaily();
                message = `已添加到今日 Q${result.quadrant}`;
            } else {
                window.inboxData.items.push({
                    id: window.uuid(),
                    content: `[${result.date}] ${result.content}`,
                    createdAt: new Date().toISOString(),
                    status: 'active'
                });
                if (window.renderInbox) window.renderInbox();
                if (window.saveInbox) await window.saveInbox();
                message = `已添加到收件箱（未来日期：${result.date}）`;
            }
        } else if (result.target === 'weekly') {
            window.appData.weekData.weeklyTasks.push({
                id: window.uuid(),
                content: result.content,
                deadline: result.deadline || "",
                completed: false
            });
            window.renderWeekly();
            message = "已添加到周任务";
        } else {
            window.inboxData.items.push({
                id: window.uuid(),
                content: result.content,
                createdAt: new Date().toISOString(),
                status: 'active'
            });
            if (window.renderInbox) window.renderInbox();
            if (window.saveInbox) await window.saveInbox();
            message = "已添加到收件箱";
        }

        saveData();

        if (previewEl) previewEl.innerText = `✅ ${message}：${result.content}`;
        document.getElementById('smart-add-input').value = '';
        setTimeout(() => {
            window.closeSmartAddModal();
            if (previewEl) previewEl.innerText = '';
        }, 1500);

    } catch (e) {
        console.error(e);
        const msg = String(e?.message || '');
        if (previewEl) {
            previewEl.innerText = [
                '❌ AI 解析/执行失败（将显示完整错误信息用于排查）',
                msg || '(no error message)'
            ].join('\n');
        }
    } finally {
        btn.innerText = originalText;
        btn.disabled = false;
    }
};

async function fetchRecentSummaries(daysToLookBack = 7) {
    if (!window.dirHandle) return "";

    let context = "Recent History (Last 7 Days):\n";
    const today = new Date(window.appData.currentDateStr);

    for (let i = 1; i <= daysToLookBack; i++) {
        const d = new Date(today);
        d.setDate(d.getDate() - i);
        const dateStr = d.toISOString().split('T')[0];
        const fileName = window.getWeekFileName(dateStr);

        try {
            let data;
            if (fileName === window.appData.currentWeekFile) {
                data = window.appData.weekData;
            } else {
                data = await window.readJson(fileName);
            }

            if (data && data.dailyData && data.dailyData[dateStr]) {
                const summary = data.dailyData[dateStr].summary;
                if (summary) {
                    context += `- ${dateStr}: ${summary.substring(0, 200)}...\n`;
                }
            }
        } catch (e) {
        }
    }
    return context;
}
