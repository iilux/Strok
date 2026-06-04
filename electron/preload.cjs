const { contextBridge, ipcRenderer } = require('electron');

// API minimale et sûre exposée au renderer (contextIsolation activé).
contextBridge.exposeInMainWorld('strok', {
  minimize: () => ipcRenderer.send('window:minimize'),
  maximize: () => ipcRenderer.send('window:maximize'),
  close: () => ipcRenderer.send('window:close'),
  isMaximized: () => ipcRenderer.invoke('window:isMaximized'),
  // S'abonner aux changements d'état maximisé. Renvoie une fonction de désinscription.
  onMaximizeChange: (callback) => {
    const handler = (_event, isMax) => callback(isMax);
    ipcRenderer.on('window:maximized', handler);
    return () => ipcRenderer.removeListener('window:maximized', handler);
  },

  // Fichiers : projet .strok ré-éditable + export image PNG.
  saveProject: (json, suggestedName) =>
    ipcRenderer.invoke('project:save', { json, suggestedName }),
  openProject: () => ipcRenderer.invoke('project:open'),
  exportImage: (dataURL, suggestedName) =>
    ipcRenderer.invoke('image:export', { dataURL, suggestedName }),
});
