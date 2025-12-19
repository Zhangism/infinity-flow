// storage.js - Standard Script Version

// Register with App namespace
window.App = window.App || {};
window.App.Storage = {};
// Backward compatibility
window.StorageModule = window.App.Storage;

// IndexedDB Configuration
const DB_NAME = 'InfinityFlowDB';
const STORE_NAME = 'settings';
const DB_VERSION = 3;

// State
window.StorageModule.dirHandle = null;
window.StorageModule.savedDirHandle = null;

// Helpers
window.StorageModule.openDB = async function () {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = e => {
            const db = e.target.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) db.createObjectStore(STORE_NAME);
            if (db.objectStoreNames.contains('folderHandles')) {
                try { db.deleteObjectStore('folderHandles'); } catch (e) { }
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e);
    });
};

window.StorageModule.verifyPermission = async function (handle) {
    try {
        if ((await handle.queryPermission({ mode: 'readwrite' })) === 'granted') return true;
        if ((await handle.requestPermission({ mode: 'readwrite' })) === 'granted') return true;
    } catch (e) { console.error("Permission check failed", e); }
    return false;
};

window.StorageModule.getSavedWorkspaceHandle = async function () {
    try {
        const db = await window.StorageModule.openDB();
        const tx = db.transaction(STORE_NAME, 'readonly');
        const req = tx.objectStore(STORE_NAME).get('handle');

        return new Promise((resolve) => {
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => resolve(null);
        });
    } catch (e) {
        console.error('Failed to read saved workspace handle', e);
        return null;
    }
};

window.StorageModule.selectWorkspace = async function () {
    try {
        window.StorageModule.dirHandle = await window.showDirectoryPicker();
        window.StorageModule.savedDirHandle = null;
        const db = await window.StorageModule.openDB();
        const tx = db.transaction(STORE_NAME, 'readwrite');
        tx.objectStore(STORE_NAME).put(window.StorageModule.dirHandle, 'handle');
        return window.StorageModule.dirHandle;
    } catch (e) {
        console.error("Workspace select failed", e);
        if (e.name !== 'AbortError') {
            const msg = String(e?.message || '未知错误');
            const hint = '请确认浏览器已允许文件访问权限；也可尝试换一个文件夹。';
            if (typeof window.showAlert === 'function') {
                window.showAlert(`无法打开工作区：${msg}\n\n${hint}`, '错误');
            } else {
                alert(`无法打开工作区：${msg}\n\n${hint}`);
            }
        }
        return null;
    }
};

window.StorageModule.tryAutoLoadWorkspace = async function () {
    try {
        const savedHandle = await window.StorageModule.getSavedWorkspaceHandle();
        if (!savedHandle) {
            return { status: 'none', handle: null, handleName: null };
        }

        // Important: do NOT call requestPermission() here.
        // Browsers usually require a user gesture for requestPermission(); calling it on page load
        // makes auto-restore fail and forces users to re-pick the folder.
        let perm = 'prompt';
        try {
            perm = await savedHandle.queryPermission({ mode: 'readwrite' });
        } catch (e) {
            console.warn('queryPermission failed', e);
        }

        if (perm === 'granted') {
            window.StorageModule.dirHandle = savedHandle;
            window.StorageModule.savedDirHandle = null;
            return { status: 'ready', handle: savedHandle, handleName: savedHandle.name || null };
        }

        window.StorageModule.savedDirHandle = savedHandle;
        return { status: 'needs-permission', handle: null, handleName: savedHandle.name || null };
    } catch (e) {
        console.error("Auto-load failed", e);
        return { status: 'error', handle: null, handleName: null };
    }
};

window.StorageModule.requestSavedWorkspacePermission = async function () {
    const handle = window.StorageModule.savedDirHandle || await window.StorageModule.getSavedWorkspaceHandle();
    if (!handle) return null;

    const ok = await window.StorageModule.verifyPermission(handle);
    if (!ok) return null;

    window.StorageModule.dirHandle = handle;
    window.StorageModule.savedDirHandle = null;
    return handle;
};

window.StorageModule.readJson = async function (filename) {
    if (!window.StorageModule.dirHandle) return null;
    try {
        const handle = await window.StorageModule.dirHandle.getFileHandle(filename);
        const file = await handle.getFile();
        const text = await file.text();
        return JSON.parse(text);
    } catch (e) { return null; }
};

window.StorageModule.writeJson = async function (filename, data) {
    if (!window.StorageModule.dirHandle) throw new Error("No workspace selected");
    try {
        const tempFilename = `${filename}.tmp`;
        const tempHandle = await window.StorageModule.dirHandle.getFileHandle(tempFilename, { create: true });
        const writable = await tempHandle.createWritable();
        await writable.write(JSON.stringify(data));
        await writable.close();
        await tempHandle.move(window.StorageModule.dirHandle, filename);
    } catch (e) {
        console.error("Write failed", e);
        throw e;
    }
};

window.StorageModule.saveDataToDisk = async function (filesToSave) {
    if (!window.StorageModule.dirHandle) return;

    // Init caches
    if (!window.StorageModule._lastSavedCache) window.StorageModule._lastSavedCache = {};
    if (!window.StorageModule._lastBackupTime) window.StorageModule._lastBackupTime = {};

    for (const file of filesToSave) {
        if (!file.name) continue;

        // Optimization 1: Skip unchanged files
        const currentStr = JSON.stringify(file.data);
        if (window.StorageModule._lastSavedCache[file.name] === currentStr) {
            continue;
        }

        try {
            // Optimization 2: Throttle backups (once every 10 minutes)
            const now = Date.now();
            const lastBackup = window.StorageModule._lastBackupTime[file.name] || 0;
            const shouldBackup = (now - lastBackup) > 600000; // 10 minutes

            if (shouldBackup) {
                const backupDirHandle = await window.StorageModule.dirHandle.getDirectoryHandle('backups', { create: true });

                try {
                    const sourceHandle = await window.StorageModule.dirHandle.getFileHandle(file.name);
                    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
                    const backupFileName = `${file.name}-${timestamp}`;

                    const backupFileHandle = await backupDirHandle.getFileHandle(backupFileName, { create: true });
                    const writable = await backupFileHandle.createWritable();
                    const readable = await sourceHandle.getFile();
                    await writable.write(await readable.text());
                    await writable.close();

                    window.StorageModule._lastBackupTime[file.name] = now;

                    const backups = [];
                    for await (const entry of backupDirHandle.values()) {
                        if (entry.kind === 'file' && entry.name.startsWith(file.name)) {
                            backups.push(entry);
                        }
                    }
                    backups.sort((a, b) => a.name.localeCompare(b.name));
                    while (backups.length > 5) {
                        const oldestBackup = backups.shift();
                        await backupDirHandle.removeEntry(oldestBackup.name);
                    }
                } catch (e) {
                    // Backup might fail if file doesn't exist yet or other IO issues
                    // We continue to save the main file regardless
                }
            }

            await window.StorageModule.writeJson(file.name, file.data);
            window.StorageModule._lastSavedCache[file.name] = currentStr;

        } catch (error) {
            console.error('Error saving file:', file.name, error);
            throw error;
        }
    }
};