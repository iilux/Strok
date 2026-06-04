import { useCallback, useEffect, useRef, useState } from 'react';
import { AddonHost } from './host.js';

/**
 * useAddons — couche React au-dessus de AddonHost.
 *
 * Persistance des fichiers d'addon :
 *   - Electron  : fichiers dans userData/strok-addons (via window.strok.*).
 *   - Navigateur (vite preview, fallback) : code stocké dans localStorage.
 * L'état activé/désactivé vit dans localStorage dans les deux cas (par fichier).
 */

const api = typeof window !== 'undefined' ? window.strok : undefined;
const isElectron = !!(api && api.importAddon);

const LS_DISABLED = 'strok.addons.disabled'; // [file, ...] désactivés
const LS_FILES = 'strok.addons.files'; // fallback navigateur : { file: code }

const loadDisabled = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(LS_DISABLED) || '[]'));
  } catch {
    return new Set();
  }
};
const saveDisabled = (set) => {
  try {
    localStorage.setItem(LS_DISABLED, JSON.stringify([...set]));
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

// Récupère la liste des { file, code } selon le mode (Electron ou navigateur).
async function fetchFiles() {
  if (isElectron) {
    const res = await api.listAddons();
    return res && res.ok ? res.addons : [];
  }
  return Object.entries(browserFiles()).map(([file, code]) => ({ file, code }));
}

// Lit le code d'un fichier précis.
async function fetchCode(file) {
  if (isElectron) {
    const res = await api.listAddons();
    return res?.addons?.find((a) => a.file === file)?.code ?? null;
  }
  return browserFiles()[file] ?? null;
}

function pickAddonFile() {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.strokaddon,.js,.mjs,text/javascript';
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

export default function useAddons(bridge) {
  // Une seule instance d'hôte pour toute la durée de vie de l'app.
  const hostRef = useRef(null);
  if (!hostRef.current) hostRef.current = new AddonHost(bridge);
  const host = hostRef.current;

  const [addons, setAddons] = useState([]);
  const [commands, setCommands] = useState([]);
  const [busy, setBusy] = useState(false);

  // Re-render React quand le registre de l'hôte change.
  useEffect(() => {
    host.onChange = () => {
      setAddons(host.list());
      setCommands(
        host.commands.map((c) => ({
          key: c.key,
          label: c.label,
          icon: c.icon,
          addon: c.addon,
        }))
      );
    };
    return () => {
      host.onChange = null;
    };
  }, [host]);

  // Charge tous les addons présents (au démarrage).
  const refreshAll = useCallback(async () => {
    const disabled = loadDisabled();
    const files = await fetchFiles();
    // Décharge ceux qui ont disparu du disque.
    for (const rec of host.list()) {
      if (!files.some((f) => f.file === rec.file)) host.unload(rec.file);
    }
    for (const { file, code } of files) {
      await host.load(file, code, !disabled.has(file));
    }
  }, [host]);

  useEffect(() => {
    refreshAll();
  }, [refreshAll]);

  const importAddon = useCallback(async () => {
    setBusy(true);
    try {
      if (isElectron) {
        const res = await api.importAddon();
        if (res && res.ok) {
          await host.load(res.file, res.code, true);
          bridge.pushToast?.(`Addon « ${res.file} » importé`, 'success');
        } else if (res && !res.canceled) {
          bridge.pushToast?.(`Import échoué : ${res.error || 'erreur'}`, 'error');
        }
      } else {
        const picked = await pickAddonFile();
        if (picked) {
          const obj = browserFiles();
          obj[picked.name] = picked.text;
          saveBrowserFiles(obj);
          await host.load(picked.name, picked.text, true);
          bridge.pushToast?.(`Addon « ${picked.name} » importé`, 'success');
        }
      }
    } finally {
      setBusy(false);
    }
  }, [host, bridge]);

  const removeAddon = useCallback(
    async (file) => {
      if (isElectron) {
        await api.removeAddon(file);
      } else {
        const obj = browserFiles();
        delete obj[file];
        saveBrowserFiles(obj);
      }
      host.unload(file);
      const disabled = loadDisabled();
      disabled.delete(file);
      saveDisabled(disabled);
      bridge.pushToast?.(`Addon « ${file} » supprimé`, 'info');
    },
    [host, bridge]
  );

  const toggleAddon = useCallback(
    async (file, enabled) => {
      const disabled = loadDisabled();
      if (enabled) disabled.delete(file);
      else disabled.add(file);
      saveDisabled(disabled);
      const code = await fetchCode(file);
      if (code != null) await host.load(file, code, enabled);
    },
    [host]
  );

  const runCommand = useCallback((key) => host.runCommand(key), [host]);
  const openFolder = useCallback(() => api?.openAddonsFolder?.(), []);
  const emit = useCallback((event, payload) => host.emit(event, payload), [host]);

  return {
    addons,
    commands,
    busy,
    isElectron,
    importAddon,
    removeAddon,
    toggleAddon,
    runCommand,
    openFolder,
    emit,
  };
}
