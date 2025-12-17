// Expose inbox data on window so other scripts (e.g. Smart Capture) can safely access it.
let inboxData = window.inboxData || { items: [] };
window.inboxData = inboxData;

async function loadInbox() {
    inboxData = await readJson('inbox.json') || { items: [] };
    if (!Array.isArray(inboxData.items)) inboxData.items = [];
    window.inboxData = inboxData;
    renderInbox();
}

async function saveInbox() {
    window.inboxData = inboxData;
    await writeJson('inbox.json', inboxData);
}

function renderInbox() {
    const moduleContainer = document.getElementById('inbox-module');
    if (!moduleContainer) return;

    let listContainer = document.getElementById('inbox-list');
    let archivedContainer = document.getElementById('inbox-archived');
    let actionsContainer = document.getElementById('inbox-actions');

    const activeItems = inboxData.items.filter(i => i.status === 'active');
    const archivedItems = inboxData.items.filter(i => i.status === 'archived');

    // Create shell if missing
    if (!listContainer) {
         moduleContainer.innerHTML = `
            <div id="inbox-header" class="section-title" style="display:flex; justify-content:space-between; align-items:center;">
                收件箱
                <div id="inbox-actions"></div>
            </div>
            <div id="inbox-list"></div>
            <div id="inbox-archived" class="archived-container" style="max-height: 0; opacity: 0; overflow: hidden; transition: all 0.3s ease;"></div>
            <div class="inline-input-group">
                <input type="text" id="new-inbox-input" class="inline-input" placeholder="输入待办..." onkeydown="if(event.key==='Enter') addInboxItem()">
                <button class="btn-small" onclick="addInboxItem()">添加</button>
            </div>
         `;
         listContainer = document.getElementById('inbox-list');
         archivedContainer = document.getElementById('inbox-archived');
         actionsContainer = document.getElementById('inbox-actions');
    }

    // Update Header Actions
    const headerHtml = `
        <button class="btn-icon" onclick="openSmartAddModal()" title="AI 智能录入">✨</button>
        ${archivedItems.length > 0 ? `<button class="btn-icon" onclick="expandInbox()" title="展开归档 (${archivedItems.length})">📂</button>` : ''}
        <button class="btn-icon" onclick="archiveAllInbox()" title="全部归档">📥</button>
    `;
    if (actionsContainer && actionsContainer.innerHTML !== headerHtml) actionsContainer.innerHTML = headerHtml;

    // Helper to update lists
    const updateList = (container, items, isArchived) => {
        // Cleanup
        Array.from(container.children).forEach(el => {
            if (el.className.includes('empty-state')) return;
            if (el.id && el.id.startsWith('inbox-item-')) {
                 const id = el.id.replace('inbox-item-', '');
                 if (!items.find(i => i.id === id)) el.remove();
            }
        });
        
        items.forEach(item => {
            let div = document.getElementById(`inbox-item-${item.id}`);
            if (!div) {
                div = document.createElement('div');
                div.id = `inbox-item-${item.id}`;
                div.className = `task-list-item inbox-item ${isArchived ? 'archived' : ''}`;
                if (!isArchived) {
                    div.draggable = true;
                    div.ondragstart = (e) => dragStartInbox(e, item.id);
                } else {
                    div.style.opacity = '0.7';
                    div.style.background = 'transparent';
                    div.style.borderStyle = 'dashed';
                }
                
                div.innerHTML = isArchived ? `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; text-decoration: line-through;">${item.content}</div>
                        <button class="btn-icon" onclick="restoreInboxItem('${item.id}')" title="还原">⬆️</button>
                    </div>
                ` : `
                    <div style="display:flex; justify-content:space-between; align-items:center; gap:8px;">
                        <div style="flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${item.content}</div>
                        <button class="btn-delete" onclick="deleteInboxItem('${item.id}')">×</button>
                    </div>
                `;
                container.appendChild(div);
            }
        });
    };

    updateList(listContainer, activeItems, false);
    updateList(archivedContainer, archivedItems, true);

    // Empty state logic
    if (activeItems.length === 0) {
        if (!listContainer.querySelector('.empty-state')) {
             const emptyDiv = document.createElement('div');
             emptyDiv.innerHTML = window.UIModule?.emptyHtml ? window.UIModule.emptyHtml('暂无待办事项') : '<div class="empty-state small-hint">暂无待办事项</div>';
             listContainer.appendChild(emptyDiv.firstChild);
        }
    } else {
        const emptyState = listContainer.querySelector('.empty-state');
        if (emptyState) emptyState.remove();
    }
}

function addInboxItem() {
    const input = document.getElementById('new-inbox-input');
    const val = input.value.trim();
    if (!val) return;

    inboxData.items.push({
        id: Date.now().toString(36) + Math.random().toString(36).substr(2),
        content: val,
        createdAt: new Date().toISOString(),
        status: 'active'
    });

    saveInbox();
    renderInbox();
    if (window.UIModule?.showToast) window.UIModule.showToast('已添加到收件箱', { type: 'success' });
}

function deleteInboxItem(id) {
    if (typeof window.showConfirm === 'function') {
        window.showConfirm('确定删除此条目吗？', () => {
            inboxData.items = inboxData.items.filter(i => i.id !== id);
            saveInbox();
            renderInbox();
            if (window.UIModule?.showToast) window.UIModule.showToast('已删除收件箱条目', { type: 'info' });
        }, '确认删除');
        return;
    }
    if (typeof window.showAlert === 'function') window.showAlert('界面尚未就绪，请刷新后重试。', '提示');
}

function archiveAllInbox() {
    let changed = false;
    inboxData.items.forEach(item => {
        if (item.status === 'active') {
            item.status = 'archived';
            changed = true;
        }
    });
    if (changed) {
        saveInbox();
        renderInbox();
        if (window.UIModule?.showToast) window.UIModule.showToast('已全部归档', { type: 'success' });
    }
}

function expandInbox() {
    const el = document.getElementById('inbox-archived');
    if (el.style.maxHeight === '0px' || el.style.maxHeight === '') {
        el.style.maxHeight = el.scrollHeight + 'px';
        el.style.opacity = '1';
    } else {
        el.style.maxHeight = '0';
        el.style.opacity = '0';
    }
}

function restoreInboxItem(id) {
    const item = inboxData.items.find(i => i.id === id);
    if (item) {
        item.status = 'active';
        saveInbox();
        renderInbox();
        if (window.UIModule?.showToast) window.UIModule.showToast('已还原条目', { type: 'success' });
    }
}

function dragStartInbox(e, id) {
    const item = inboxData.items.find(i => i.id === id);
    if (item) {
        // We set these on the global scope as per script.js logic
        window.dragSrcType = 'inbox';
        window.dragPayload = item;
        e.dataTransfer.effectAllowed = 'move';
    }
}

// Function to be called from script.js when item is dropped
function removeInboxItem(id) {
    inboxData.items = inboxData.items.filter(i => i.id !== id);
    saveInbox();
    renderInbox();
}

// Expose functions to window for cross-module access
window.loadInbox = loadInbox;
window.saveInbox = saveInbox;
window.renderInbox = renderInbox;
window.removeInboxItem = removeInboxItem;
window.addInboxItem = addInboxItem;
window.deleteInboxItem = deleteInboxItem;
window.archiveAllInbox = archiveAllInbox;
window.expandInbox = expandInbox;
window.restoreInboxItem = restoreInboxItem;
window.dragStartInbox = dragStartInbox;