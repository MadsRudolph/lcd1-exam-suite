const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    checkUpdate: () => ipcRenderer.send('check-update'),
    onUpdateStatus: (callback) => ipcRenderer.on('update-status', (event, value) => callback(value))
});

