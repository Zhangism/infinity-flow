let snippetData = { snippets: [] };
let currentRefineSnippetId = null;
let currentEditSnippetId = null; // null for add mode, id for edit mode

async function loadSnippets() {
    snippetData = await readJson('snippets.json') || { snippets: [] };
    if (!Array.isArray(snippetData.snippets)) snippetData.snippets = [];
    renderSnippets();
}

async function saveSnippets() {
    await writeJson('snippets.json', snippetData);
}

function renderSnippets() {
    const container = document.getElementById('snippets-module');
    if (!container) return;

    let listContainer = document.getElementById('snippet-list');

    if (!listContainer) {
        container.innerHTML = `
            <div class="section-title">代码片段库</div>
            <div id="snippet-list"></div>
            <div class="inline-input-group" style="margin-top: 15px;">
                <button class="btn-small btn-large-add" onclick="openSnippetModal(null)">+ 新建片段</button>
            </div>
        `;
        listContainer = document.getElementById('snippet-list');
    }

    // Cleanup removed items
    Array.from(listContainer.children).forEach(el => {
        if (el.className.includes('empty-state')) return;
        if (el.id && el.id.startsWith('snippet-card-')) {
            const id = el.id.replace('snippet-card-', '');
            if (!snippetData.snippets.find(s => s.id === id)) el.remove();
        }
    });

    if (snippetData.snippets.length === 0) {
        if (!listContainer.querySelector('.empty-state')) {
             const emptyDiv = document.createElement('div');
             emptyDiv.innerHTML = window.UIModule?.emptyHtml ? window.UIModule.emptyHtml('暂无代码片段') : '<div class="empty-state small-hint">暂无代码片段</div>';
             listContainer.appendChild(emptyDiv.firstChild);
        }
    } else {
        const emptyState = listContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();

        snippetData.snippets.forEach(s => {
            let div = document.getElementById(`snippet-card-${s.id}`);
            if (!div) {
                 div = document.createElement('div');
                 div.id = `snippet-card-${s.id}`;
                 div.className = 'task-list-item snippet-card';
                 div.style.display = 'block';
                 div.style.position = 'relative';
                 listContainer.appendChild(div);
            }
            
            // Update Content
            const isLinux = s.type === 'linux';
            const contentHtml = isLinux 
                ? `<pre><code class="language-bash" style="cursor:pointer;" onclick="copySnippet('${s.id}')">${escapeHtml(s.content)}</code></pre>`
                : `<div style="cursor:pointer; white-space: pre-wrap; font-size: 13px;" onclick="copySnippet('${s.id}')">${escapeHtml(s.content)}</div>`;
            
            const newHTML = `
                <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:5px;">
                    <span class="snippet-badge ${s.type}">${s.type}</span>
                    <div class="snippet-actions">
                        <button class="btn-icon" id="copy-btn-${s.id}" onclick="copySnippet('${s.id}')" title="复制">📋</button>
                        <button class="btn-icon" onclick="openSnippetAIModal('${s.id}')" title="AI 优化">✨</button>
                        <button class="btn-icon" onclick="openSnippetModal('${s.id}')" title="编辑">✏️</button>
                        <button class="btn-delete" onclick="deleteSnippet('${s.id}')">×</button>
                    </div>
                </div>
                <div style="font-weight:600; font-size:13px; margin-bottom:5px;">${s.description}</div>
                ${contentHtml}
            `;
            
            // Avoid unnecessary updates if content matches (ignoring whitespace differences potentially caused by browser normalization)
            if (div.innerHTML !== newHTML) {
                div.innerHTML = newHTML;
            }
        });
        
        if (window.hljs) hljs.highlightAll();
    }
}

function escapeHtml(text) {
    if (!text) return text;
    return text
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");
}

function openSnippetModal(id) {
    currentEditSnippetId = id;
    const modal = document.getElementById('snippet-modal');
    const title = document.getElementById('snippet-modal-title');
    
    if (id) {
        // Edit Mode
        const s = snippetData.snippets.find(s => s.id === id);
        if (!s) return;
        title.innerText = "编辑片段";
        document.getElementById('snippet-type').value = s.type;
        document.getElementById('snippet-desc').value = s.description;
        document.getElementById('snippet-content').value = s.content;
    } else {
        // Add Mode
        title.innerText = "新建片段";
        document.getElementById('snippet-type').value = 'linux';
        document.getElementById('snippet-desc').value = '';
        document.getElementById('snippet-content').value = '';
    }
    
    document.getElementById('snippet-modal-overlay').style.display = 'flex';
}

function closeSnippetModal() {
    document.getElementById('snippet-modal-overlay').style.display = 'none';
    currentEditSnippetId = null;
}

function saveSnippetFromModal() {
    const type = document.getElementById('snippet-type').value;
    const desc = document.getElementById('snippet-desc').value;
    const content = document.getElementById('snippet-content').value;

    if (!desc || !content) {
        if (typeof window.showAlert === 'function') window.showAlert('请填写描述和内容。', '提示');
        return;
    }

    if (currentEditSnippetId) {
        // Edit
        const s = snippetData.snippets.find(s => s.id === currentEditSnippetId);
        if (s) {
            s.type = type;
            s.description = desc;
            s.content = content;
        }
    } else {
        // Add
        snippetData.snippets.push({
            id: Date.now().toString(36),
            type: type,
            description: desc,
            content: content
        });
    }

    saveSnippets();
    renderSnippets();
    closeSnippetModal();
    if (window.UIModule?.showToast) window.UIModule.showToast('已保存片段', { type: 'success' });
}

function deleteSnippet(id) {
    if (typeof window.showConfirm === 'function') {
        window.showConfirm('确定删除此片段吗？', () => {
            snippetData.snippets = snippetData.snippets.filter(s => s.id !== id);
            saveSnippets();
            renderSnippets();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除片段', { type: 'info' });
        }, '确认删除');
        return;
    }
    if (typeof window.showAlert === 'function') window.showAlert('界面尚未就绪，请刷新后重试。', '提示');
}

function copySnippet(id) {
    const s = snippetData.snippets.find(s => s.id === id);
    if (s) {
        navigator.clipboard.writeText(s.content).then(() => {
            showCopyFeedback(id);
        });
    }
}

function showCopyFeedback(id) {
    const btn = document.getElementById(`copy-btn-${id}`);
    if (btn) {
        // Create a floating element for visual feedback near the button
        const feedback = document.createElement('div');
        feedback.className = 'copy-feedback';
        feedback.innerText = '已复制';
        document.body.appendChild(feedback);

        const rect = btn.getBoundingClientRect();
        // Position it near the button
        feedback.style.left = (rect.left + window.scrollX) + 'px';
        feedback.style.top = (rect.top + window.scrollY - 20) + 'px';

        // Trigger animation
        requestAnimationFrame(() => {
            feedback.classList.add('show');
        });

        // Cleanup
        setTimeout(() => {
            if (document.body.contains(feedback)) {
                document.body.removeChild(feedback);
            }
        }, 1000);
    }
}

// AI Refinement
function openSnippetAIModal(id) {
    currentRefineSnippetId = id;
    document.getElementById('snippet-ai-modal-overlay').style.display = 'flex';
    document.getElementById('snippet-ai-input').value = '';
    document.getElementById('snippet-ai-input').focus();
}

function closeSnippetAIModal() {
    document.getElementById('snippet-ai-modal-overlay').style.display = 'none';
    currentRefineSnippetId = null;
}

async function executeSnippetRefinement() {
    const instruction = document.getElementById('snippet-ai-input').value;
    if (!instruction) return;

    const originalSnippet = snippetData.snippets.find(s => s.id === currentRefineSnippetId);
    if (!originalSnippet) return;

    const aiBaseUrl = localStorage.getItem('aiBaseUrl');
    const aiKey = localStorage.getItem('aiKey');
    const aiModel = localStorage.getItem('aiModel');

    if (!aiBaseUrl) {
        if (typeof window.showAlert === 'function') window.showAlert('请先在“设置”中配置 AI 基础地址。', '提示');
        return;
    }

    const systemPrompt = `你是一名代码专家。\n用户会提供原始片段与修改要求。\n你必须且只能输出 JSON 对象：{ "newContent": "...", "shortDescription": "..." }。\n不要输出 markdown，不要解释。`;

    const userPrompt = `原始内容：${originalSnippet.content}\n修改要求：${instruction}\n只输出 JSON：`;

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
                    { role: "user", content: userPrompt }
                ],
                stream: false
            })
        });

        const data = await response.json();
        const result = window.extractAndParseJson(data.choices[0].message.content || '');

        snippetData.snippets.push({
            id: Date.now().toString(36),
            type: originalSnippet.type,
            description: result.shortDescription || (originalSnippet.description + " (AI)"),
            content: result.newContent
        });

        saveSnippets();
        renderSnippets();
        closeSnippetAIModal();
        if (window.UIModule?.showToast) window.UIModule.showToast('已生成新片段', { type: 'success', duration: 2200 });

    } catch (e) {
        console.error(e);
        if (typeof window.showAlert === 'function') window.showAlert('AI 生成失败：' + (e?.message || '未知错误'), '错误');
    }
}

// Expose functions to window for HTML onclick handlers
window.loadSnippets = loadSnippets;
window.saveSnippets = saveSnippets;
window.renderSnippets = renderSnippets;
window.openSnippetModal = openSnippetModal;
window.closeSnippetModal = closeSnippetModal;
window.saveSnippetFromModal = saveSnippetFromModal;
window.deleteSnippet = deleteSnippet;
window.copySnippet = copySnippet;
window.openSnippetAIModal = openSnippetAIModal;
window.closeSnippetAIModal = closeSnippetAIModal;
window.executeSnippetRefinement = executeSnippetRefinement;