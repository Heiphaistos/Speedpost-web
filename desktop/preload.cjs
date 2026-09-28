// Pont sécurisé entre la fenêtre et le processus principal (aucun accès Node dans la page).
const { contextBridge, ipcRenderer, webUtils } = require('electron');

contextBridge.exposeInMainWorld('speedpost', {
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (v) => ipcRenderer.invoke('settings:set', v),
  checkServer: (server) => ipcRenderer.invoke('server:check', server),
  pickFiles: () => ipcRenderer.invoke('files:pick'),
  // Glisser-déposer : le chemin réel du fichier n'est accessible que par webUtils
  describeDropped: (files) => ipcRenderer.invoke('files:describe', [...files].map((f) => webUtils.getPathForFile(f)).filter(Boolean)),
  send: (paths, options) => ipcRenderer.invoke('send:start', { paths, options }),
  cancel: () => ipcRenderer.invoke('send:cancel'),
  history: () => ipcRenderer.invoke('history:get'),
  deleteTransfer: (id) => ipcRenderer.invoke('history:delete', id),
  copy: (text) => ipcRenderer.invoke('clipboard:write', text),
  open: (url) => ipcRenderer.invoke('open:external', url),
  onProgress: (cb) => ipcRenderer.on('send:progress', (_e, p) => cb(p)),
  onFiles: (cb) => ipcRenderer.on('files:add', (_e, list) => cb(list)),
});
