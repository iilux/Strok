const { contextBridge, ipcRenderer } = require('electron');

// API minimale et sûre exposée au renderer (contextIsolation activé).
contextBridge.exposeInMainWorld('strok', {
  // 'darwin' | 'win32' | 'linux' — l'UI adapte titlebar et libellés (⌘ vs Ctrl).
  platform: process.platform,

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
  // Écrase en silence un .strok déjà lié (refusé si le chemin n'a pas été choisi
  // via un dialogue OS pendant cette session).
  saveProjectTo: (path, json) =>
    ipcRenderer.invoke('project:saveTo', { path, json }),
  openProject: () => ipcRenderer.invoke('project:open'),
  exportImage: (dataURL, suggestedName) =>
    ipcRenderer.invoke('image:export', { dataURL, suggestedName }),

  // Session : sauvegarde auto / restauration de l'espace de travail.
  saveSession: (json) => ipcRenderer.invoke('session:save', { json }),
  loadSession: () => ipcRenderer.invoke('session:load'),
  clearSession: () => ipcRenderer.invoke('session:clear'),
  // À la fermeture, le main demande au renderer de persister la session. Le callback
  // doit appeler `saveSession(...)` puis `sessionFlushed()`. Renvoie une désinscription.
  onSessionFlush: (callback) => {
    const handler = () => callback();
    ipcRenderer.on('session:flush-request', handler);
    return () => ipcRenderer.removeListener('session:flush-request', handler);
  },
  sessionFlushed: () => ipcRenderer.send('session:flushed'),

  // Addons : persistance fichier dans userData (le renderer exécute le code).
  listAddons: () => ipcRenderer.invoke('addons:list'),
  importAddon: () => ipcRenderer.invoke('addons:import'),
  removeAddon: (file) => ipcRenderer.invoke('addons:remove', { file }),
  openAddonsFolder: () => ipcRenderer.invoke('addons:openFolder'),

  // Thèmes : persistance fichier dans userData (JSON déclaratif, aucun code).
  listThemes: () => ipcRenderer.invoke('themes:list'),
  importTheme: () => ipcRenderer.invoke('themes:import'),
  removeTheme: (file) => ipcRenderer.invoke('themes:remove', { file }),
  openThemesFolder: () => ipcRenderer.invoke('themes:openFolder'),
});
