import { useCallback, useEffect, useRef, useState } from 'react';
import { ThemeHost, DEFAULT_THEME_ID } from './themeHost.js';

/**
 * useThemes — couche React au-dessus de ThemeHost.
 *
 * Persistance des fichiers de thème importés :
 *   - Electron  : fichiers dans userData/strok-themes (via window.strok.*).
 *   - Navigateur (vite preview, fallback) : JSON stocké dans localStorage.
 * Le thème actif est mémorisé dans localStorage dans les deux cas, et ré-appliqué
 * au démarrage. Les thèmes intégrés (builtins.js) sont toujours disponibles.
 */

const api = typeof window !== 'undefined' ? window.strok : undefined;
const isElectron = !!(api && api.importTheme);

const LS_ACTIVE = 'strok.theme.active'; // id du thème actif
const LS_FILES = 'strok.themes.files'; // fallback navigateur : { file: jsonText }

const loadActive = () => {
  try {
    return localStorage.getItem(LS_ACTIVE) || DEFAULT_THEME_ID;
  } catch {
    return DEFAULT_THEME_ID;
  }
};
const saveActive = (id) => {
  try {
    localStorage.setItem(LS_ACTIVE, id);
  } catch {
    /* noop */
  }
};
const browserFiles = () => {
  try {
    return JSON.parse(localStorage.getItem(LS_FILES) || '{}');
  } catch {
    return {};
  }
};
const saveBrowserFiles = (obj) => {
  try {
    localStorage.setItem(LS_FILES, JSON.stringify(obj));
  } catch {
    /* noop */
  }
};

// Récupère la liste des { file, code } importés selon le mode.
async function fetchFiles() {
  if (isElectron) {
    const res = await api.listThemes();
    return res && res.ok ? res.themes : [];
  }
  return Object.entries(browserFiles()).map(([file, code]) => ({ file, code }));
}

function pickThemeFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.stroktheme,application/json';
    input.onchange = () => {
      const f = input.files && input.files[0];
      if (!f) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve({ name: f.name, text: String(reader.result) });
      reader.onerror = () => resolve(null);
      reader.readAsText(f);
    };
    input.click();
  });
}

export default function useThemes(bridge) {
  // Une seule instance d'hôte pour toute la durée de vie de l'app.
  const hostRef = useRef(null);
  if (!hostRef.current) hostRef.current = new ThemeHost();
  const host = hostRef.current;

  const [themes, setThemes] = useState([]);
  const [busy, setBusy] = useState(false);

  // Re-render React quand le registre de l'hôte change.
  useEffect(() => {
    host.onChange = () => setThemes(host.list());
    return () => {
      host.onChange = null;
    };
  }, [host]);

  // Charge les thèmes importés présents puis applique le thème mémorisé.
  const refreshAll = useCallback(async () => {
    const files = await fetchFiles();
    // Retire ceux qui ont disparu du disque.
    for (const rec of host.list()) {
      if (!rec.builtin && !files.some((f) => f.file === rec.file)) {
        host.unload(rec.file);
      }
    }
    for (const { file, code } of files) host.load(file, code);
    host.apply(loadActive());
  }, [host]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const applyTheme = useCallback(
    (file) => {
      const id = host.apply(file);
      saveActive(id);
      const t = host.list().find((x) => x.file === id);
      bridge?.pushToast?.(
        `Thème « ${t?.manifest?.name || id} » appliqué`,
        'success'
      );
    },
    [host, bridge]
  );

  const importTheme = useCallback(async () => {
    setBusy(true);
    try {
      if (isElectron) {
        const res = await api.importTheme();
        if (res && res.ok) {
          const rec = host.load(res.file, res.code);
          if (rec.error) {
            bridge?.pushToast?.(`Thème invalide : ${rec.error}`, 'error');
          } else {
            applyTheme(res.file);
          }
        } else if (res && !res.canceled) {
          bridge?.pushToast?.(`Import échoué : ${res.error || 'erreur'}`, 'error');
        }
      } else {
        const picked = await pickThemeFile();
        if (picked) {
          const obj = browserFiles();
          obj[picked.name] = picked.text;
          saveBrowserFiles(obj);
          const rec = host.load(picked.name, picked.text);
          if (rec.error) {
            bridge?.pushToast?.(`Thème invalide : ${rec.error}`, 'error');
          } else {
            applyTheme(picked.name);
          }
        }
      }
    } finally {
      setBusy(false);
    }
  }, [host, bridge, applyTheme]);

  const removeTheme = useCallback(
    async (file) => {
      if (isElectron) {
        await api.removeTheme(file);
      } else {
        const obj = browserFiles();
        delete obj[file];
        saveBrowserFiles(obj);
      }
      const wasActive = host.activeId === file;
      host.unload(file); // revient au défaut si c'était le thème actif
      if (wasActive) saveActive(DEFAULT_THEME_ID);
      bridge?.pushToast?.(`Thème « ${file} » supprimé`, 'info');
    },
    [host, bridge]
  );

  const openFolder = useCallback(() => api?.openThemesFolder?.(), []);

  return {
    themes,
    busy,
    isElectron,
    applyTheme,
    importTheme,
    removeTheme,
    openFolder,
  };
}
