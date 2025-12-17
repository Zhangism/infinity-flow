// utils.js - Standard Script Version

window.uuid = function() {
    return Date.now().toString(36) + Math.random().toString(36).substr(2);
};

window.debounce = function(func, wait) {
    let timeout;
    return function(...args) {
        clearTimeout(timeout);
        timeout = setTimeout(() => func.apply(this, args), wait);
    };
};

window.formatTime = function(ms) {
    if (ms === 0) return '00:00';
    const totalSeconds = Math.floor(ms / 1000);
    const h = Math.floor(totalSeconds / 3600);
    const m = Math.floor((totalSeconds % 3600) / 60);
    const s = totalSeconds % 60;

    const pad = (n) => n.toString().padStart(2, '0');
    if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
    return `${pad(m)}:${pad(s)}`;
};

window.formatTimeForAnalytics = function(ms) {
    if (ms === 0) return '0h 0m';
    const totalMinutes = Math.floor(ms / 60000);
    const hours = Math.floor(totalMinutes / 60);
    const minutes = totalMinutes % 60;
    return `${hours}h ${minutes}m`;
};

window.getWeekId = function(dateStr) {
    const d = new Date(dateStr);
    d.setHours(0,0,0,0);
    d.setDate(d.getDate() + 4 - (d.getDay()||7));
    const yearStart = new Date(d.getFullYear(),0,1);
    const weekNo = Math.ceil((((d - yearStart) / 86400000) + 1)/7);
    return `${d.getFullYear()}_W${weekNo}`;
};

window.getWeekFileName = function(dateStr) {
    return `${window.getWeekId(dateStr)}.json`;
};

window.getLocalTodayStr = function() {
    const d = new Date();
    const offset = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - offset).toISOString().split('T')[0];
};

window.calculateDaysLeft = function(dateStr, currentDateStr) {
    if (!dateStr) return null;
    const target = new Date(dateStr);
    const today = new Date(currentDateStr);
    const diff = Math.ceil((target - today) / (1000 * 60 * 60 * 24));
    
    let label = '';
    let urgent = false;
    
    if (diff < 0) {
        label = `逾期 ${Math.abs(diff)} 天`;
        urgent = true;
    } else if (diff === 0) {
        label = `今天截止`;
        urgent = true;
    } else if (diff <= 2) {
        label = `剩 ${diff} 天`;
        urgent = true;
    } else {
        label = `剩 ${diff} 天`;
        urgent = false;
    }
    
    return { diff, label, urgent };
};

// --- AI Helpers ---

window.getAiConfig = function() {
    const aiBaseUrl = (localStorage.getItem('aiBaseUrl') || '').trim();
    const aiKey = (localStorage.getItem('aiKey') || '').trim();
    const aiModel = (localStorage.getItem('aiModel') || '').trim();
    return {
        baseUrl: aiBaseUrl,
        key: aiKey,
        model: aiModel || 'deepseek-r1:latest'
    };
};

window.stripModelThinking = function(text) {
    return (text || '')
        .replace(/<think>[\s\S]*?<\/think>/gi, '')
        .replace(/```json/gi, '```')
        .replace(/```/g, '')
        .trim();
};

window.repairJsonString = function(jsonLike) {
    let s = (jsonLike || '').trim();
    // Normalize “smart quotes”
    s = s.replace(/[\u201C\u201D]/g, '"').replace(/[\u2018\u2019]/g, "'");
    // Remove trailing commas
    s = s.replace(/,\s*([}\]])/g, '$1');
    // Replace Python-ish literals
    s = s.replace(/\bNone\b/g, 'null').replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false');
    // Quote unquoted keys: { target: ... } or , quadrant: ...
    s = s.replace(/([{,]\s*)([A-Za-z_][A-Za-z0-9_\-]*)(\s*):/g, '$1"$2"$3:');
    // Convert single-quoted strings to double-quoted (best-effort)
    s = s.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (m, g1) => {
        const escaped = String(g1).replace(/"/g, '\\"');
        return '"' + escaped + '"';
    });
    return s;
};

window.extractAndParseJson = function(text) {
    const cleaned = window.stripModelThinking(text);
    try {
        return JSON.parse(cleaned);
    } catch (_) {
        // Try best-effort extraction if model returned extra text.
        const firstObj = cleaned.indexOf('{');
        const firstArr = cleaned.indexOf('[');
        const hasObj = firstObj !== -1;
        const hasArr = firstArr !== -1;

        if (!hasObj && !hasArr) throw new Error('AI did not return JSON.');

        const start = (!hasArr || (hasObj && firstObj < firstArr)) ? firstObj : firstArr;
        const end = start === firstObj ? cleaned.lastIndexOf('}') : cleaned.lastIndexOf(']');
        if (end === -1 || end <= start) throw new Error('AI returned malformed JSON.');

        const slice = cleaned.slice(start, end + 1);
        try {
            return JSON.parse(slice);
        } catch (_) {
            return JSON.parse(window.repairJsonString(slice));
        }
    }
};