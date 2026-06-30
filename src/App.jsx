import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import Canvas from './components/Canvas.jsx';
import AddonsModal from './components/AddonsModal.jsx';
import ThemesModal from './components/ThemesModal.jsx';
import ShortcutsModal from './components/ShortcutsModal.jsx';
import ConfirmModal from './components/ConfirmModal.jsx';
import useAddons from './addons/useAddons.js';
import useThemes from './themes/useThemes.js';

const INK_LIGHT = '#111111'; // crayon par défaut sur papier clair
const INK_DARK = '#d4d4d4'; // crayon coordonné sur papier sombre

const APP_VERSION = '1.4.0';
const PROJECT_VERSION = 1;
const SESSION_VERSION = 1;
const AUTOSAVE_DELAY = 2000; // ms après la dernière modif avant l'autosave anti-crash

// API Electron (dialogues fichier). Absente sous `vite preview` => fallback navigateur.
const api = typeof window !== 'undefined' ? window.strok : undefined;

const sanitize = (name) =>
  (name || 'Projet').replace(/[\\/:*?"<>|]+/g, '_').trim() || 'Projet';

// Fallbacks navigateur (quand l'app tourne hors Electron).
function downloadBlob(filename, blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function downloadText(filename, text, mime) {
  downloadBlob(filename, new Blob([text], { type: mime }));
}
function downloadDataURL(filename, dataURL) {
  const a = document.createElement('a');
  a.href = dataURL;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
}
function pickFileText(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => {
      const file = input.files && input.files[0];
      if (!file) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: file.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(file);
    };
    input.click();
  });
}

let toastSeq = 0;

function Toasts({ toasts }) {
  return (
    <div className="toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`toast toast--${t.type || 'info'}`}>
          {t.message}
        </div>
      ))}
    </div>
  );
}

let tabSeq = 0;
function makeTab() {
  tabSeq += 1;
  return {
    id: `tab-${Date.now()}-${tabSeq}`,
    name: `Calque ${tabSeq}`,
    zoom: 1,
    panX: 0,
    panY: 0,
    dirty: false, // modifié depuis la dernière sauvegarde / création
    filePath: null, // chemin du .strok lié (null = jamais enregistré sur le PC)
  };
}

function StatusBar({ tabName, zoom, tool, size, opacity, color }) {
  return (
    <footer className="statusbar">
      <div className="statusbar__item">
        <span className="statusbar__dot" style={{ background: color }} />
        <span style={{ textTransform: 'uppercase' }}>{color}</span>
      </div>
      <div className="statusbar__item">{tool === 'eraser' ? 'Gomme' : 'Crayon'}</div>
      <div className="statusbar__item">{size} px</div>
      <div className="statusbar__item">{Math.round(opacity * 100)} %</div>
      <div className="statusbar__spacer" />
      <div className="statusbar__item">{tabName}</div>
      <div className="statusbar__item">{Math.round(zoom * 100)} %</div>
      <div className="statusbar__brand">Strok · v{APP_VERSION}</div>
    </footer>
  );
}

export default function App() {
  const [tool, setTool] = useState('pencil');
  const [color, setColor] = useState(INK_LIGHT);
  const [size, setSize] = useState(6);
  const [opacity, setOpacity] = useState(1);
  const [recentColors, setRecentColors] = useState([]);
  const [darkCanvas, setDarkCanvas] = useState(false);
  const [clearSignal, setClearSignal] = useState(0);

  const [tabs, setTabs] = useState(() => [makeTab()]);
  const [activeTabId, setActiveTabId] = useState(() => tabs[0].id);

  const activeTab = tabs.find((t) => t.id === activeTabId) || tabs[0];

  // Handles impératifs des <Canvas> montés, indexés par id d'onglet.
  const canvasRefs = useRef(new Map());

  // --- Sauvegarde auto / restauration de session ---
  // Onglet en attente de confirmation de fermeture (modale « enregistrer ? »).
  const [pendingClose, setPendingClose] = useState(null);
  // Compteur de modifications de contenu : déclenche l'autosave anti-rebond.
  const [autosaveTick, setAutosaveTick] = useState(0);
  // Miroir « live » de l'état persistable, lu par les callbacks stables (flush,
  // autosave, save/close) sans les recréer à chaque rendu.
  const sessionRef = useRef({ tabs, activeTabId, darkCanvas: false });
  // Bitmaps restaurés en attente d'application (id d'onglet -> { doc, image }).
  const pendingRestore = useRef(null);
  const restoredRef = useRef(false);

  // Marque un onglet « modifié » (contenu) et relance le minuteur d'autosave.
  const markDirty = useCallback((id) => {
    if (!id) return;
    setTabs((prev) => {
      const t = prev.find((x) => x.id === id);
      if (!t || t.dirty) return prev; // déjà marqué -> pas de re-rendu inutile
      return prev.map((x) => (x.id === id ? { ...x, dirty: true } : x));
    });
    setAutosaveTick((n) => n + 1);
  }, []);

  // Repasse un onglet « propre » après une sauvegarde réussie ; lie le fichier.
  const markClean = useCallback((id, filePath) => {
    setTabs((prev) =>
      prev.map((t) =>
        t.id === id
          ? { ...t, dirty: false, filePath: filePath ?? t.filePath }
          : t
      )
    );
  }, []);

  // --- Extensions (addons) + thèmes + notifications toast ---
  const [addonsOpen, setAddonsOpen] = useState(false);
  const [themesOpen, setThemesOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [toasts, setToasts] = useState([]);

  const pushToast = useCallback((message, type = 'info') => {
    const id = (toastSeq += 1);
    setToasts((list) => [...list, { id, message, type }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3400);
  }, []);

  // Pont vers l'état de l'app, donné aux addons. Les méthodes délèguent à des
  // refs « live » pour rester stables (l'hôte d'addons ne doit jamais être recréé)
  // tout en lisant/écrivant toujours l'état courant.
  const liveRef = useRef({});
  const actionsRef = useRef({});
  const bridgeRef = useRef(null);
  if (!bridgeRef.current) {
    bridgeRef.current = {
      appVersion: APP_VERSION,
      getColor: () => liveRef.current.color,
      getTool: () => liveRef.current.tool,
      getSize: () => liveRef.current.size,
      getOpacity: () => liveRef.current.opacity,
      setColor: (hex) => actionsRef.current.setColor?.(hex),
      setTool: (id) => actionsRef.current.setTool?.(id),
      setSize: (n) => actionsRef.current.setSize?.(n),
      setOpacity: (n) => actionsRef.current.setOpacity?.(n),
      getActiveCanvas: () => actionsRef.current.getActiveCanvas?.(),
      pushToast: (msg, type) => actionsRef.current.pushToast?.(msg, type),
    };
  }

  const {
    addons: addonList,
    commands: addonCommands,
    busy: addonsBusy,
    isElectron: addonsElectron,
    importAddon,
    removeAddon,
    toggleAddon,
    runCommand,
    openFolder,
    emit: emitAddon,
  } = useAddons(bridgeRef.current);

  const {
    themes: themeList,
    busy: themesBusy,
    isElectron: themesElectron,
    applyTheme,
    importTheme,
    removeTheme,
    openFolder: openThemesFolder,
  } = useThemes(bridgeRef.current);

  // Gomme temporaire : tant que Maj est maintenue on force la gomme, et on
  // restaure l'outil précédent au relâchement (`shiftErasing` évite de
  // ré-enregistrer l'outil à chaque auto-répétition de la touche).
  const shiftErasing = useRef(false);
  const toolBeforeShift = useRef('pencil');

  const addRecent = useCallback((hex) => {
    setRecentColors((prev) => [
      hex,
      ...prev.filter((c) => c.toLowerCase() !== hex.toLowerCase()),
    ].slice(0, 5));
  }, []);

  const handleColorCommit = useCallback(
    (hex) => {
      setColor(hex);
      addRecent(hex);
    },
    [addRecent]
  );

  const clearCanvas = useCallback(() => {
    setClearSignal((n) => n + 1);
    markDirty(sessionRef.current.activeTabId);
  }, [markDirty]);

  // Mode sombre du calque : bascule la couleur du papier ET le crayon vers une
  // teinte coordonnée (gris clair sur sombre, encre sombre sur clair).
  const toggleDark = useCallback(() => {
    setDarkCanvas((d) => {
      const next = !d;
      setColor((c) => {
        if (next && c.toLowerCase() === INK_LIGHT) return INK_DARK;
        if (!next && c.toLowerCase() === INK_DARK) return INK_LIGHT;
        return c;
      });
      return next;
    });
  }, []);

  // --- Onglets ---
  const newTab = useCallback(() => {
    const t = makeTab();
    setTabs((prev) => [...prev, t]);
    setActiveTabId(t.id);
  }, []);

  // Retire réellement un onglet (sans aucune question).
  const removeTab = useCallback((id) => {
    setTabs((prev) => {
      if (prev.length <= 1) return prev; // on garde toujours au moins un onglet
      const idx = prev.findIndex((t) => t.id === id);
      if (idx === -1) return prev;
      const next = prev.filter((t) => t.id !== id);
      setActiveTabId((cur) => (cur === id ? next[Math.max(0, idx - 1)].id : cur));
      return next;
    });
  }, []);

  // Demande de fermeture d'onglet : si le calque a été modifié, on propose de
  // l'enregistrer (modale) ; sinon on ferme directement. (La fermeture de l'APP,
  // elle, ne demande rien : tout est persisté en session — cf. flush-on-close.)
  const closeTab = useCallback(
    (id) => {
      const list = sessionRef.current.tabs;
      if (list.length <= 1) return; // jamais le dernier onglet
      const tab = list.find((t) => t.id === id);
      if (!tab) return;
      if (!tab.dirty) {
        removeTab(id);
        return;
      }
      setPendingClose(tab);
    },
    [removeTab]
  );

  const setTabView = useCallback((id, partial) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...partial } : t))
    );
  }, []);

  // --- Fichiers : projet .strok (ré-éditable) + export image ---
  // Enregistre l'onglet `id`. Si l'onglet est déjà lié à un fichier, on l'écrase
  // en silence (project:saveTo) ; sinon on ouvre le dialogue « Enregistrer sous ».
  // Renvoie { ok, canceled? } pour piloter la fermeture d'onglet.
  const saveTab = useCallback(async (id) => {
    const handle = canvasRefs.current.get(id);
    const { tabs: list, darkCanvas: dark } = sessionRef.current;
    const tab = list.find((t) => t.id === id);
    if (!handle || !tab) return { ok: false };

    const { doc, image } = handle.getProject();
    const json = JSON.stringify({
      app: 'strok',
      version: PROJECT_VERSION,
      name: tab.name,
      darkCanvas: dark,
      view: { zoom: tab.zoom, panX: tab.panX, panY: tab.panY },
      doc,
      image,
    });

    // 1) Onglet déjà lié -> écrasement direct (refusé si chemin inconnu : on
    //    retombe alors sur le dialogue, par ex. après un redémarrage de l'app).
    if (tab.filePath && api?.saveProjectTo) {
      const res = await api.saveProjectTo(tab.filePath, json);
      if (res?.ok) {
        markClean(id, tab.filePath);
        return { ok: true };
      }
      if (res?.error !== 'unknown-path') return { ok: false };
    }

    // 2) Dialogue « Enregistrer sous » (ou téléchargement en mode navigateur).
    const suggested = `${sanitize(tab.name)}.strok`;
    if (api?.saveProject) {
      const res = await api.saveProject(json, suggested);
      if (res?.ok) {
        markClean(id, res.path || null);
        return { ok: true };
      }
      return { ok: false, canceled: !!res?.canceled };
    }
    downloadText(suggested, json, 'application/json');
    markClean(id, null); // pas de chemin réinscriptible hors Electron
    return { ok: true };
  }, [markClean]);

  const handleSaveProject = useCallback(
    () => saveTab(sessionRef.current.activeTabId),
    [saveTab]
  );

  const handleOpenProject = useCallback(async () => {
    const handle = canvasRefs.current.get(activeTabId);
    if (!handle) return;
    let json;
    let fileName;
    let filePath = null;
    if (api?.openProject) {
      const res = await api.openProject();
      if (!res || !res.ok) return;
      json = res.json;
      fileName = res.name;
      filePath = res.path || null; // lie l'onglet au fichier (écrasement direct ensuite)
    } else {
      const picked = await pickFileText('.strok,application/json');
      if (!picked) return;
      json = picked.text;
      fileName = picked.name;
    }
    let project;
    try {
      project = JSON.parse(json);
    } catch {
      return; // fichier illisible -> on ignore silencieusement
    }
    if (!project || project.app !== 'strok' || !project.doc) return;

    await handle.loadProject({ doc: project.doc, image: project.image });
    const base = (fileName || project.name || 'Projet').replace(/\.strok$/i, '');
    const v = project.view || {};
    setTabView(activeTabId, {
      name: base,
      zoom: v.zoom ?? 1,
      panX: v.panX ?? 0,
      panY: v.panY ?? 0,
      dirty: false, // tout juste chargé -> rien à sauvegarder
      filePath,
    });
    if (typeof project.darkCanvas === 'boolean') setDarkCanvas(project.darkCanvas);
  }, [activeTabId, setTabView]);

  const handleExportImage = useCallback(async () => {
    const handle = canvasRefs.current.get(activeTabId);
    if (!handle) return;
    const dataURL = handle.exportImage(darkCanvas);
    const suggested = `${sanitize(activeTab.name)}.png`;
    if (api?.exportImage) await api.exportImage(dataURL, suggested);
    else downloadDataURL(suggested, dataURL);
  }, [activeTabId, activeTab, darkCanvas]);

  // Une commande d'addon peut modifier le calque actif -> on le marque modifié.
  const handleRunCommand = useCallback(
    (key) => {
      runCommand(key);
      markDirty(sessionRef.current.activeTabId);
    },
    [runCommand, markDirty]
  );

  // Maintient les refs « live » à jour à chaque rendu (pont addon + session).
  sessionRef.current = { tabs, activeTabId, darkCanvas };
  liveRef.current = { color, tool, size, opacity, activeTabId };
  actionsRef.current = {
    setColor: handleColorCommit,
    setTool,
    setSize,
    setOpacity,
    getActiveCanvas: () => canvasRefs.current.get(activeTabId),
    pushToast,
  };

  // Diffuse les changements d'état pertinents aux addons abonnés.
  useEffect(() => {
    emitAddon('colorChange', color);
  }, [color, emitAddon]);
  useEffect(() => {
    emitAddon('toolChange', tool);
  }, [tool, emitAddon]);

  // --- Sérialisation / restauration de session (sauvegarde auto) ---
  // Sérialise tout l'espace de travail (onglets + dessins + vue + onglet actif).
  // Tous les <Canvas> étant montés, `getProject()` lit leur backing-store même
  // s'ils sont cachés ; un onglet jamais initialisé (doc.w == 0) est stocké sans image.
  const serializeSession = useCallback(() => {
    const { tabs: list, activeTabId: active, darkCanvas: dark } = sessionRef.current;
    const outTabs = list.map((t) => {
      let doc = null;
      let image = null;
      const handle = canvasRefs.current.get(t.id);
      if (handle) {
        try {
          const p = handle.getProject();
          if (p.doc && p.doc.w > 0) {
            doc = p.doc;
            image = p.image;
          }
        } catch {
          /* onglet non sérialisable -> on garde ses métadonnées seules */
        }
      }
      return {
        id: t.id,
        name: t.name,
        view: { zoom: t.zoom, panX: t.panX, panY: t.panY },
        dirty: !!t.dirty,
        filePath: t.filePath || null,
        doc,
        image,
      };
    });
    return JSON.stringify({
      app: 'strok',
      version: SESSION_VERSION,
      activeTabId: active,
      darkCanvas: dark,
      tabs: outTabs,
    });
  }, []);

  const persistSession = useCallback(async () => {
    const json = serializeSession();
    if (api?.saveSession) {
      try {
        await api.saveSession(json);
      } catch {
        /* non bloquant */
      }
    } else {
      try {
        localStorage.setItem('strok.session', json);
      } catch {
        /* quota navigateur dépassé -> ignoré (la cible réelle est Electron) */
      }
    }
  }, [serializeSession]);

  // Restauration au démarrage : recharge l'espace de travail de la session précédente.
  useEffect(() => {
    if (restoredRef.current) return;
    restoredRef.current = true;
    let cancelled = false;
    (async () => {
      let json = null;
      if (api?.loadSession) {
        const res = await api.loadSession();
        if (res?.ok) json = res.json;
      } else {
        try {
          json = localStorage.getItem('strok.session');
        } catch {
          /* noop */
        }
      }
      if (!json || cancelled) return;
      let data;
      try {
        data = JSON.parse(json);
      } catch {
        return; // session illisible -> on démarre sur l'onglet neuf par défaut
      }
      if (
        !data ||
        data.app !== 'strok' ||
        !Array.isArray(data.tabs) ||
        data.tabs.length === 0
      )
        return;

      const restored = data.tabs.map((t, i) => ({
        id: t.id || `tab-restore-${Date.now()}-${i}`,
        name: t.name || 'Calque',
        zoom: t.view?.zoom ?? 1,
        panX: t.view?.panX ?? 0,
        panY: t.view?.panY ?? 0,
        dirty: !!t.dirty,
        filePath: t.filePath || null,
      }));
      // Les bitmaps sont appliqués après le montage des <Canvas> (effet sur [tabs]).
      const pend = new Map();
      data.tabs.forEach((t, i) => {
        if (t.doc && t.doc.w > 0)
          pend.set(restored[i].id, { doc: t.doc, image: t.image || null });
      });
      pendingRestore.current = pend.size ? pend : null;
      // Évite les collisions de noms « Calque N » pour les futurs onglets.
      tabSeq = Math.max(tabSeq, data.tabs.length);

      setTabs(restored);
      const active = restored.find((t) => t.id === data.activeTabId);
      setActiveTabId(active ? active.id : restored[0].id);
      if (typeof data.darkCanvas === 'boolean') setDarkCanvas(data.darkCanvas);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Applique les bitmaps restaurés dès que les <Canvas> correspondants sont montés.
  useEffect(() => {
    const pend = pendingRestore.current;
    if (!pend || pend.size === 0) return;
    for (const [id, data] of pend) {
      const handle = canvasRefs.current.get(id);
      if (handle) {
        handle.loadProject(data);
        pend.delete(id);
      }
    }
    if (pend.size === 0) pendingRestore.current = null;
  }, [tabs]);

  // Persistance à la fermeture de l'app : le process principal demande un flush,
  // on sérialise + écrit la session, puis on signale que la fenêtre peut se fermer.
  useEffect(() => {
    if (!api?.onSessionFlush) return;
    return api.onSessionFlush(async () => {
      await persistSession();
      api.sessionFlushed();
    });
  }, [persistSession]);

  // Autosave anti-crash : ~2 s après la dernière modification de contenu.
  useEffect(() => {
    if (autosaveTick === 0) return; // aucune modif à sauver pour l'instant
    const id = setTimeout(() => {
      persistSession();
    }, AUTOSAVE_DELAY);
    return () => clearTimeout(id);
  }, [autosaveTick, persistSession]);

  // --- Raccourcis clavier ---
  useEffect(() => {
    const onKey = (e) => {
      const el = e.target;
      const typing =
        el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (e.ctrlKey || e.metaKey) {
        if (typing) return;
        const k = e.key.toLowerCase();
        if (k === 't') {
          e.preventDefault();
          newTab();
        } else if (k === 'w') {
          e.preventDefault();
          closeTab(activeTabId);
        } else if (k === '0') {
          e.preventDefault();
          setTabView(activeTabId, { zoom: 1, panX: 0, panY: 0 });
        } else if (k === 's') {
          e.preventDefault();
          handleSaveProject();
        } else if (k === 'o') {
          e.preventDefault();
          handleOpenProject();
        } else if (k === 'e' && e.shiftKey) {
          e.preventDefault();
          handleExportImage();
        } else if (k === 'z') {
          // Ctrl+Z = annuler ; Ctrl+Maj+Z = rétablir.
          e.preventDefault();
          const handle = canvasRefs.current.get(activeTabId);
          if (e.shiftKey) handle?.redo?.();
          else handle?.undo?.();
          markDirty(activeTabId);
        } else if (k === 'y') {
          e.preventDefault();
          canvasRefs.current.get(activeTabId)?.redo?.();
          markDirty(activeTabId);
        }
        return;
      }
      if (typing || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k === 'b') setTool('pencil');
      else if (k === 'e') setTool('eraser');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    activeTabId,
    newTab,
    closeTab,
    setTabView,
    handleSaveProject,
    handleOpenProject,
    handleExportImage,
    markDirty,
  ]);

  // --- Maj maintenu => gomme temporaire (restaure l'outil au relâchement) ---
  useEffect(() => {
    const restore = () => {
      if (!shiftErasing.current) return;
      shiftErasing.current = false;
      setTool(toolBeforeShift.current);
    };
    const onDown = (e) => {
      if (e.key !== 'Shift') return;
      if (e.ctrlKey || e.metaKey || e.altKey) return; // réservé aux raccourcis (Ctrl+Maj+…)
      if (shiftErasing.current) return; // auto-répétition : déjà actif
      const el = e.target;
      if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) return;
      shiftErasing.current = true;
      setTool((cur) => {
        toolBeforeShift.current = cur; // mémorise l'outil courant (même la gomme)
        return 'eraser';
      });
    };
    const onUp = (e) => {
      if (e.key === 'Shift') restore();
    };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', restore); // sécurité si la fenêtre perd le focus
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', restore);
    };
  }, []);

  return (
    <div className="app">
      <TitleBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={setActiveTabId}
        onCloseTab={closeTab}
        onNewTab={newTab}
        onOpenHelp={() => setHelpOpen(true)}
      />

      <div className="workspace">
        <Sidebar
          tool={tool}
          onToolChange={setTool}
          onClear={clearCanvas}
          darkCanvas={darkCanvas}
          onToggleDark={toggleDark}
          onSaveProject={handleSaveProject}
          onOpenProject={handleOpenProject}
          onExportImage={handleExportImage}
          onOpenAddons={() => setAddonsOpen(true)}
          onOpenThemes={() => setThemesOpen(true)}
        />

        <div className="stage-host">
          {tabs.map((tab) => (
            <Canvas
              key={tab.id}
              ref={(h) => {
                if (h) canvasRefs.current.set(tab.id, h);
                else canvasRefs.current.delete(tab.id);
              }}
              active={tab.id === activeTabId}
              tool={tool}
              color={color}
              size={size}
              opacity={opacity}
              darkCanvas={darkCanvas}
              zoom={tab.zoom}
              panX={tab.panX}
              panY={tab.panY}
              onViewChange={(v) => setTabView(tab.id, v)}
              onSizeChange={setSize}
              onStroke={() => {
                emitAddon('strokeEnd');
                markDirty(tab.id);
              }}
              clearSignal={clearSignal}
            />
          ))}
        </div>

        <aside className="panel">
          <Toolbar
            tool={tool}
            size={size}
            opacity={opacity}
            color={color}
            onSizeChange={setSize}
            onOpacityChange={setOpacity}
          />
          <ColorPicker
            color={color}
            recentColors={recentColors}
            onColorChange={setColor}
            onColorCommit={handleColorCommit}
          />

          {addonCommands.length > 0 && (
            <div className="section">
              <div className="section__head">
                <span className="section__title">Extensions</span>
                <span className="section__value">{addonCommands.length}</span>
              </div>
              <div className="ext-list">
                {addonCommands.map((c) => (
                  <button
                    key={c.key}
                    className="ext-btn"
                    onClick={() => handleRunCommand(c.key)}
                    title={`${c.label} — ${c.addon}`}
                  >
                    <span className="ext-btn__label">{c.label}</span>
                    <span className="ext-btn__addon">{c.addon}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>

      <StatusBar
        tabName={activeTab.name}
        zoom={activeTab.zoom}
        tool={tool}
        size={size}
        opacity={opacity}
        color={color}
      />

      {addonsOpen && (
        <AddonsModal
          addons={addonList}
          commands={addonCommands}
          busy={addonsBusy}
          isElectron={addonsElectron}
          onImport={importAddon}
          onRemove={removeAddon}
          onToggle={toggleAddon}
          onRun={handleRunCommand}
          onOpenFolder={openFolder}
          onClose={() => setAddonsOpen(false)}
        />
      )}

      {themesOpen && (
        <ThemesModal
          themes={themeList}
          busy={themesBusy}
          isElectron={themesElectron}
          onApply={applyTheme}
          onImport={importTheme}
          onRemove={removeTheme}
          onOpenFolder={openThemesFolder}
          onClose={() => setThemesOpen(false)}
        />
      )}

      {helpOpen && <ShortcutsModal onClose={() => setHelpOpen(false)} />}

      {pendingClose && (
        <ConfirmModal
          title="Fermer le calque"
          message={
            pendingClose.filePath ? (
              <>
                Le calque <strong>{pendingClose.name}</strong> a été modifié.
                Enregistrer les dernières modifications&nbsp;?
              </>
            ) : (
              <>
                Le calque <strong>{pendingClose.name}</strong> n'a jamais été
                enregistré. L'enregistrer avant de fermer&nbsp;?
              </>
            )
          }
          confirmLabel="Enregistrer"
          denyLabel="Ne pas enregistrer"
          cancelLabel="Annuler"
          onConfirm={async () => {
            const id = pendingClose.id;
            const res = await saveTab(id);
            setPendingClose(null);
            if (res?.ok) removeTab(id); // sauvegarde annulée -> on garde l'onglet
          }}
          onDeny={() => {
            const id = pendingClose.id;
            setPendingClose(null);
            removeTab(id);
          }}
          onCancel={() => setPendingClose(null)}
        />
      )}

      <Toasts toasts={toasts} />
    </div>
  );
}
