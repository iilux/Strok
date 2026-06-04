import { useCallback, useEffect, useRef, useState } from 'react';
import TitleBar from './components/TitleBar.jsx';
import Sidebar from './components/Sidebar.jsx';
import Toolbar from './components/Toolbar.jsx';
import ColorPicker from './components/ColorPicker.jsx';
import Canvas from './components/Canvas.jsx';

const INK_LIGHT = '#111111'; // crayon par défaut sur papier clair
const INK_DARK = '#d4d4d4'; // crayon coordonné sur papier sombre

const PROJECT_VERSION = 1;

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

let tabSeq = 0;
function makeTab() {
  tabSeq += 1;
  return {
    id: `tab-${Date.now()}-${tabSeq}`,
    name: `Calque ${tabSeq}`,
    zoom: 1,
    panX: 0,
    panY: 0,
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
      <div className="statusbar__brand">Strok · v1.0</div>
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

  const clearCanvas = useCallback(() => setClearSignal((n) => n + 1), []);

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

  const closeTab = useCallback(
    (id) => {
      setTabs((prev) => {
        if (prev.length <= 1) return prev;
        const idx = prev.findIndex((t) => t.id === id);
        const next = prev.filter((t) => t.id !== id);
        setActiveTabId((cur) =>
          cur === id ? next[Math.max(0, idx - 1)].id : cur
        );
        return next;
      });
    },
    []
  );

  const setTabView = useCallback((id, partial) => {
    setTabs((prev) =>
      prev.map((t) => (t.id === id ? { ...t, ...partial } : t))
    );
  }, []);

  // --- Fichiers : projet .strok (ré-éditable) + export image ---
  const handleSaveProject = useCallback(async () => {
    const handle = canvasRefs.current.get(activeTabId);
    if (!handle) return;
    const { doc, image } = handle.getProject();
    const project = {
      app: 'strok',
      version: PROJECT_VERSION,
      name: activeTab.name,
      darkCanvas,
      view: { zoom: activeTab.zoom, panX: activeTab.panX, panY: activeTab.panY },
      doc,
      image,
    };
    const json = JSON.stringify(project);
    const suggested = `${sanitize(activeTab.name)}.strok`;
    if (api?.saveProject) await api.saveProject(json, suggested);
    else downloadText(suggested, json, 'application/json');
  }, [activeTabId, activeTab, darkCanvas]);

  const handleOpenProject = useCallback(async () => {
    const handle = canvasRefs.current.get(activeTabId);
    if (!handle) return;
    let json;
    let fileName;
    if (api?.openProject) {
      const res = await api.openProject();
      if (!res || !res.ok) return;
      json = res.json;
      fileName = res.name;
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
        } else if (k === 'y') {
          e.preventDefault();
          canvasRefs.current.get(activeTabId)?.redo?.();
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
    </div>
  );
}
