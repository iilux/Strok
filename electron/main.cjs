'use strict';

/**
 * Strok — processus principal Electron (durci).
 *
 * Ce fichier était absent du dépôt ; il a été reconstruit à partir du contrat
 * IPC défini dans `preload.cjs` et utilisé par `src/App.jsx` / `src/components`,
 * en y ajoutant une couche de durcissement sécurité (cf. bloc « SÉCURITÉ »).
 *
 * Contrat IPC reconstruit :
 *   window:minimize / window:maximize / window:close   (send)
 *   window:isMaximized                                  (invoke -> bool)
 *   window:maximized                                    (event -> bool)
 *   project:save  { json, suggestedName }               (invoke -> {ok,...})
 *   project:open                                        (invoke -> {ok,json,name})
 *   image:export  { dataURL, suggestedName }            (invoke -> {ok,...})
 */

const { app, BrowserWindow, ipcMain, dialog, Menu, shell, session } = require('electron');
const path = require('node:path');
const fs = require('node:fs/promises');

// ───────────────────────── Environnement ─────────────────────────
// En dev, `dev:electron` pose NODE_ENV=development (cross-env) et sert l'UI via
// Vite sur 127.0.0.1:5173. En prod (exe empaqueté), on charge le build file://.
const isDev = !app.isPackaged && process.env.NODE_ENV === 'development';
const DEV_URL = 'http://127.0.0.1:5173';

// Limites de sécurité sur les payloads IPC (anti-DoS mémoire / fichiers géants).
const MAX_PROJECT_BYTES = 256 * 1024 * 1024; // 256 Mo de JSON .strok
const MAX_IMAGE_BYTES = 256 * 1024 * 1024; // 256 Mo de PNG décodé
const MAX_ADDON_BYTES = 2 * 1024 * 1024; // 2 Mo de code par addon
const MAX_THEME_BYTES = 256 * 1024; // 256 Ko de JSON par thème

// Extensions reconnues pour un fichier d'addon (script ES/CommonJS « .strokaddon »).
const ADDON_EXT_RE = /\.(strokaddon|mjs|js)$/i;
// Extension d'un fichier de thème (JSON déclaratif « .stroktheme »).
const THEME_EXT_RE = /\.stroktheme$/i;
// Les addons importés sont copiés ici (persistants entre les sessions). On les
// range dans userData et JAMAIS dans le bundle de l'app (asar = lecture seule).
const addonsDir = () => path.join(app.getPath('userData'), 'strok-addons');
// Idem pour les thèmes importés (JSON, aucun code exécuté).
const themesDir = () => path.join(app.getPath('userData'), 'strok-themes');

let mainWindow = null;

// ╔══════════════════════════════════════════════════════════════╗
// ║                          SÉCURITÉ                              ║
// ╚══════════════════════════════════════════════════════════════╝
//
// Confidentialité (empêcher l'app d'exfiltrer des données de l'utilisateur) :
//   • contextIsolation + sandbox + nodeIntegration:false : le renderer n'a aucun
//     accès direct à Node/au système ; il ne peut faire QUE les appels IPC
//     explicitement exposés par preload.cjs.
//   • setWindowOpenHandler(deny) + will-navigate : impossible d'ouvrir une
//     fenêtre ou de naviguer vers une URL distante → aucune fuite réseau.
//   • CSP `default-src 'self'` (injecté en <meta> par vite.config.js en prod) :
//     bloque tout chargement/connexion externe.
//
// Protection du code source (élever la barre face à l'extraction) :
//   • devTools désactivés en production + raccourcis inspecteur neutralisés +
//     menu applicatif supprimé (plus de « Afficher la source » / DevTools).
//   • Le build Vite est minifié, sans source-maps, console strippée
//     (cf. vite.config.js). NB : un .exe Electron reste, par nature, du code qui
//     s'exécute sur la machine cible — l'asar est extractible. On rend la
//     récupération nettement plus pénible, on ne la rend pas impossible.

/** Applique les garde-fous de navigation/ouverture à un webContents. */
function hardenContents(contents) {
  // 1) Aucune nouvelle fenêtre : les liens externes partent dans le navigateur
  //    système, jamais dans une fenêtre Electron (qui aurait nos privilèges).
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//i.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });

  // 2) Navigation verrouillée à l'origine de l'app (dev server ou file://).
  contents.on('will-navigate', (event, url) => {
    const allowed = isDev
      ? url.startsWith(DEV_URL)
      : url.startsWith('file://');
    if (!allowed) event.preventDefault();
  });

  // 3) Aucune balise <webview> ne peut s'attacher.
  contents.on('will-attach-webview', (event) => event.preventDefault());

  // 4) DevTools : interdits en production (protection du code).
  if (!isDev) {
    contents.on('devtools-opened', () => contents.closeDevTools());
    contents.on('before-input-event', (event, input) => {
      const key = (input.key || '').toLowerCase();
      const f12 = key === 'f12';
      const inspector =
        (input.control || input.meta) &&
        input.shift &&
        (key === 'i' || key === 'j' || key === 'c');
      const viewSource = (input.control || input.meta) && key === 'u';
      if (f12 || inspector || viewSource) event.preventDefault();
    });
  }
}

// Durcit TOUT webContents créé (fenêtre principale incluse).
app.on('web-contents-created', (_event, contents) => hardenContents(contents));

// ───────────────────────── Fenêtre ─────────────────────────
function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    show: false, // évite le flash blanc : on montre sur 'ready-to-show'
    frame: false, // titlebar custom (aucun chrome natif Windows)
    backgroundColor: '#0d0d0d',
    autoHideMenuBar: true,
    icon: isDev ? undefined : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      // ── Isolation maximale du renderer ──
      contextIsolation: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      sandbox: true,
      webSecurity: true,
      allowRunningInsecureContent: false,
      experimentalFeatures: false,
      webviewTag: false,
      spellcheck: false,
      // DevTools désactivés dans l'app empaquetée (prod).
      devTools: isDev,
    },
  });

  // Supprime le menu natif (et ses accélérateurs DevTools / View Source).
  mainWindow.removeMenu();

  mainWindow.once('ready-to-show', () => mainWindow.show());

  // Notifie le renderer des changements d'état maximisé (titlebar custom).
  const sendMax = () =>
    mainWindow.webContents.send('window:maximized', mainWindow.isMaximized());
  mainWindow.on('maximize', sendMax);
  mainWindow.on('unmaximize', sendMax);
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  if (isDev) {
    mainWindow.loadURL(DEV_URL);
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

// ───────────────────────── Cycle de vie ─────────────────────────
// Instance unique : empêche plusieurs processus de tourner en parallèle.
if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      if (mainWindow.isMinimized()) mainWindow.restore();
      mainWindow.focus();
    }
  });

  // Pas de menu applicatif global (Windows/Linux).
  Menu.setApplicationMenu(null);

  app.whenReady().then(() => {
    // Refuse toute demande de permission web (caméra, micro, géoloc, etc.) :
    // une app de dessin locale n'en a besoin d'aucune.
    session.defaultSession.setPermissionRequestHandler((_wc, _perm, cb) =>
      cb(false)
    );

    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
  });

  app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') app.quit();
  });
}

// ───────────────────────── IPC : contrôles fenêtre ─────────────────────────
ipcMain.on('window:minimize', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.minimize();
});

ipcMain.on('window:maximize', (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  if (!win) return;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
});

ipcMain.on('window:close', (e) => {
  BrowserWindow.fromWebContents(e.sender)?.close();
});

ipcMain.handle('window:isMaximized', (e) => {
  return BrowserWindow.fromWebContents(e.sender)?.isMaximized() ?? false;
});

// ───────────────────────── IPC : fichiers ─────────────────────────
// Toutes les écritures passent par un dialogue OS : c'est l'utilisateur qui
// choisit le chemin → pas de traversée de répertoire possible depuis le renderer.

const safeName = (name, fallback, ext) => {
  const base = String(name || fallback).replace(/[\\/:*?"<>|]+/g, '_').trim();
  const clean = base || fallback;
  return ext && !clean.toLowerCase().endsWith(ext) ? clean + ext : clean;
};

ipcMain.handle('project:save', async (e, payload) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const json = payload?.json;
  if (typeof json !== 'string') return { ok: false, error: 'bad-payload' };
  if (Buffer.byteLength(json, 'utf8') > MAX_PROJECT_BYTES)
    return { ok: false, error: 'too-large' };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Enregistrer le projet',
    defaultPath: safeName(payload?.suggestedName, 'Projet', '.strok'),
    filters: [{ name: 'Projet Strok', extensions: ['strok'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };

  try {
    await fs.writeFile(filePath, json, 'utf8');
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('project:open', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Ouvrir un projet',
    properties: ['openFile'],
    filters: [{ name: 'Projet Strok', extensions: ['strok'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };

  try {
    const filePath = filePaths[0];
    const stat = await fs.stat(filePath);
    if (stat.size > MAX_PROJECT_BYTES) return { ok: false, error: 'too-large' };
    const json = await fs.readFile(filePath, 'utf8');
    return { ok: true, json, name: path.basename(filePath) };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('image:export', async (e, payload) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dataURL = payload?.dataURL;
  const PREFIX = 'data:image/png;base64,';
  if (typeof dataURL !== 'string' || !dataURL.startsWith(PREFIX))
    return { ok: false, error: 'bad-payload' };

  let buffer;
  try {
    buffer = Buffer.from(dataURL.slice(PREFIX.length), 'base64');
  } catch {
    return { ok: false, error: 'decode-failed' };
  }
  if (buffer.length === 0 || buffer.length > MAX_IMAGE_BYTES)
    return { ok: false, error: 'bad-size' };

  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Exporter en PNG',
    defaultPath: safeName(payload?.suggestedName, 'Strok', '.png'),
    filters: [{ name: 'Image PNG', extensions: ['png'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };

  try {
    await fs.writeFile(filePath, buffer);
    return { ok: true, path: filePath };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

// ───────────────────────── IPC : addons (extensions) ─────────────────────────
// Les addons sont du code tiers que l'utilisateur télécharge puis importe. On les
// stocke sous forme de fichiers dans userData/strok-addons. Le renderer les charge
// et les exécute LUI-MÊME (sandbox sans Node) ; le main ne fait QUE de la
// persistance fichier — il n'exécute jamais ce code.

async function ensureAddonsDir() {
  const dir = addonsDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Résout un nom de fichier d'addon en chemin sûr DANS le dossier addons.
// Refuse toute traversée de répertoire (..\, chemins absolus, sous-dossiers).
function resolveAddonPath(dir, file) {
  const base = path.basename(String(file || ''));
  if (!base || !ADDON_EXT_RE.test(base)) return null;
  const full = path.join(dir, base);
  if (path.dirname(full) !== dir) return null; // anti path-traversal
  return full;
}

ipcMain.handle('addons:list', async () => {
  try {
    const dir = await ensureAddonsDir();
    const names = await fs.readdir(dir);
    const addons = [];
    for (const name of names) {
      if (!ADDON_EXT_RE.test(name)) continue;
      try {
        const full = path.join(dir, name);
        const stat = await fs.stat(full);
        if (!stat.isFile() || stat.size > MAX_ADDON_BYTES) continue;
        const code = await fs.readFile(full, 'utf8');
        addons.push({ file: name, code });
      } catch {
        /* fichier illisible : on l'ignore */
      }
    }
    return { ok: true, addons };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('addons:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dir = await ensureAddonsDir();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importer un addon',
    properties: ['openFile'],
    filters: [{ name: 'Addon Strok', extensions: ['strokaddon', 'js', 'mjs'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };

  try {
    const src = filePaths[0];
    const stat = await fs.stat(src);
    if (stat.size > MAX_ADDON_BYTES) return { ok: false, error: 'too-large' };
    const code = await fs.readFile(src, 'utf8');

    // Nom de destination assaini + unique (suffixe « (n) » en cas de collision).
    let base = path.basename(src).replace(/[\\/:*?"<>|]+/g, '_');
    if (!ADDON_EXT_RE.test(base)) base += '.strokaddon';
    let dest = path.join(dir, base);
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await fs.access(dest);
      } catch {
        break; // n'existe pas encore -> nom libre
      }
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      dest = path.join(dir, `${stem} (${n})${ext}`);
      n += 1;
    }
    await fs.writeFile(dest, code, 'utf8');
    return { ok: true, file: path.basename(dest), code };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('addons:remove', async (_e, payload) => {
  try {
    const dir = await ensureAddonsDir();
    const full = resolveAddonPath(dir, payload?.file);
    if (!full) return { ok: false, error: 'bad-file' };
    await fs.rm(full, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('addons:openFolder', async () => {
  try {
    const dir = await ensureAddonsDir();
    await shell.openPath(dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

// ───────────────────────── IPC : thèmes (apparence) ─────────────────────────
// Un thème est un fichier JSON « .stroktheme » que l'utilisateur télécharge puis
// importe. Comme pour les addons, le main ne fait QUE de la persistance fichier
// dans userData/strok-themes ; le renderer lit le JSON et applique les variables
// CSS. Aucun code n'est exécuté (un thème est purement déclaratif).

async function ensureThemesDir() {
  const dir = themesDir();
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

// Résout un nom de fichier de thème en chemin sûr DANS le dossier des thèmes.
function resolveThemePath(dir, file) {
  const base = path.basename(String(file || ''));
  if (!base || !THEME_EXT_RE.test(base)) return null;
  const full = path.join(dir, base);
  if (path.dirname(full) !== dir) return null; // anti path-traversal
  return full;
}

ipcMain.handle('themes:list', async () => {
  try {
    const dir = await ensureThemesDir();
    const names = await fs.readdir(dir);
    const themes = [];
    for (const name of names) {
      if (!THEME_EXT_RE.test(name)) continue;
      try {
        const full = path.join(dir, name);
        const stat = await fs.stat(full);
        if (!stat.isFile() || stat.size > MAX_THEME_BYTES) continue;
        const code = await fs.readFile(full, 'utf8');
        themes.push({ file: name, code });
      } catch {
        /* fichier illisible : on l'ignore */
      }
    }
    return { ok: true, themes };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('themes:import', async (e) => {
  const win = BrowserWindow.fromWebContents(e.sender);
  const dir = await ensureThemesDir();
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Importer un thème',
    properties: ['openFile'],
    filters: [{ name: 'Thème Strok', extensions: ['stroktheme', 'json'] }],
  });
  if (canceled || !filePaths || !filePaths[0]) return { ok: false, canceled: true };

  try {
    const src = filePaths[0];
    const stat = await fs.stat(src);
    if (stat.size > MAX_THEME_BYTES) return { ok: false, error: 'too-large' };
    const code = await fs.readFile(src, 'utf8');

    // Nom de destination assaini + unique (suffixe « (n) » en cas de collision).
    let base = path.basename(src).replace(/[\\/:*?"<>|]+/g, '_');
    if (!THEME_EXT_RE.test(base)) base += '.stroktheme';
    let dest = path.join(dir, base);
    let n = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await fs.access(dest);
      } catch {
        break; // n'existe pas encore -> nom libre
      }
      const ext = path.extname(base);
      const stem = base.slice(0, base.length - ext.length);
      dest = path.join(dir, `${stem} (${n})${ext}`);
      n += 1;
    }
    await fs.writeFile(dest, code, 'utf8');
    return { ok: true, file: path.basename(dest), code };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('themes:remove', async (_e, payload) => {
  try {
    const dir = await ensureThemesDir();
    const full = resolveThemePath(dir, payload?.file);
    if (!full) return { ok: false, error: 'bad-file' };
    await fs.rm(full, { force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});

ipcMain.handle('themes:openFolder', async () => {
  try {
    const dir = await ensureThemesDir();
    await shell.openPath(dir);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err && err.message) };
  }
});
