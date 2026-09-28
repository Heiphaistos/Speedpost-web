// SpeedPost pour Windows — processus principal Electron.
// Fichiers reçus : glisser-déposer, bouton Parcourir, « Envoyer vers → SpeedPost » (clic droit dans l'Explorateur), ligne de commande.
const { app, BrowserWindow, ipcMain, dialog, clipboard, shell, Notification, Tray, Menu, nativeImage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { sendFiles, deleteTransfer, getConfig } = require('./uploader.cjs');

const DEFAULT_SERVER = process.env.SPEEDPOST_SERVER || 'https://speedpost.example.com';
let win = null; let tray = null; let current = null; let ready = false; const pending = [];

const cfgFile = () => path.join(app.getPath('userData'), 'settings.json');
const histFile = () => path.join(app.getPath('userData'), 'history.json');
const readJson = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const writeJson = (f, v) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(v, null, 2)); };
const settings = () => ({ server: DEFAULT_SERVER, uploadPassword: '', email: '', autoCopy: true, days: 7, ...readJson(cfgFile(), {}) });

/** Chemins de fichiers passés en argument (Envoyer vers, glisser sur l'icône). Les dossiers sont ignorés. */
const filesFromArgv = (argv) => argv.slice(app.isPackaged ? 1 : 2).filter((a) => !a.startsWith('-')).filter((a) => { try { return fs.statSync(a).isFile(); } catch { return false; } });
function addFiles(list) {
  if (!list.length) return;
  if (ready) win.webContents.send('files:add', list.map(describe));
  else pending.push(...list);
  if (win) { if (win.isMinimized()) win.restore(); win.show(); win.focus(); }
}
const describe = (p) => ({ path: p, name: path.basename(p), size: fs.statSync(p).size });

if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', (_e, argv) => addFiles(filesFromArgv(argv)));
  app.whenReady().then(() => {
    app.setAppUserModelId('fr.speedpost.app');
    win = new BrowserWindow({
      width: 560, height: 760, minWidth: 420, minHeight: 560, title: 'SpeedPost', backgroundColor: '#0b0d12', autoHideMenuBar: true,
      icon: path.join(__dirname, 'build', 'icon.png'),
      webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
    });
    win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
    win.webContents.on('did-finish-load', () => { ready = true; addFiles([...pending.splice(0), ...filesFromArgv(process.argv)]); });
    // Aucun lien ne s'ouvre dans l'application : navigateur par défaut
    win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: 'deny' }; });
    win.webContents.on('will-navigate', (e) => e.preventDefault());
    try {
      tray = new Tray(nativeImage.createFromPath(path.join(__dirname, 'build', 'icon.png')).resize({ width: 16, height: 16 }));
      tray.setToolTip('SpeedPost');
      tray.setContextMenu(Menu.buildFromTemplate([{ label: 'Ouvrir SpeedPost', click: () => { win.show(); win.focus(); } }, { type: 'separator' }, { label: 'Quitter', click: () => app.quit() }]));
      tray.on('click', () => { win.show(); win.focus(); });
    } catch { /* barre des tâches indisponible */ }
  });
  app.on('window-all-closed', () => app.quit());
}

ipcMain.handle('settings:get', () => settings());
ipcMain.handle('settings:set', (_e, v) => { const s = { ...settings(), ...v }; s.server = String(s.server || '').trim().replace(/\/+$/, ''); writeJson(cfgFile(), s); return s; });
ipcMain.handle('server:check', async (_e, server) => getConfig(server));
ipcMain.handle('files:pick', async () => {
  const r = await dialog.showOpenDialog(win, { properties: ['openFile', 'multiSelections'], title: 'Choisir des fichiers à envoyer' });
  return r.canceled ? [] : r.filePaths.map(describe);
});
ipcMain.handle('files:describe', (_e, paths) => paths.filter((p) => { try { return fs.statSync(p).isFile(); } catch { return false; } }).map(describe));
ipcMain.handle('history:get', () => readJson(histFile(), []));
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true; });
ipcMain.handle('open:external', (_e, url) => { if (/^(https?|mailto):/.test(url)) shell.openExternal(url); });

ipcMain.handle('send:start', async (e, { paths, options }) => {
  if (current) throw new Error('Un envoi est déjà en cours');
  const s = settings();
  current = new AbortController();
  try {
    const r = await sendFiles({ server: s.server, files: paths, options: { ...options, uploadPassword: s.uploadPassword }, signal: current.signal, onProgress: (p) => { e.sender.send('send:progress', p); win?.setProgressBar(p.total ? p.totalSent / p.total : 1); } });
    writeJson(histFile(), [{ ...r, server: s.server }, ...readJson(histFile(), [])].slice(0, 200));
    if (s.autoCopy) clipboard.writeText(r.url);
    if (Notification.isSupported()) new Notification({ title: 'SpeedPost — envoi terminé', body: s.autoCopy ? 'Lien copié dans le presse-papiers.' : r.title }).show();
    return r;
  } finally { current = null; win?.setProgressBar(-1); }
});
ipcMain.handle('send:cancel', () => { current?.abort(); });
ipcMain.handle('history:delete', async (_e, id) => {
  const list = readJson(histFile(), []);
  const item = list.find((x) => x.id === id);
  if (item) { try { await deleteTransfer(item.server, item.id, item.deleteToken); } catch (err) { if (err.status !== 404) throw err; } }
  writeJson(histFile(), list.filter((x) => x.id !== id));
  return true;
});
