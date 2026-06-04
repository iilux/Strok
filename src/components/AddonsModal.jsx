import { useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  FolderOpen,
  AlertTriangle,
  Puzzle,
  Play,
} from 'lucide-react';

/**
 * AddonsModal — fenêtre de gestion des extensions (custom, pas de menu OS).
 * Importer / activer-désactiver / supprimer un addon, et lancer ses commandes.
 */
export default function AddonsModal({
  addons,
  commands,
  busy,
  isElectron,
  onImport,
  onRemove,
  onToggle,
  onRun,
  onOpenFolder,
  onClose,
}) {
  // Échap ferme la fenêtre.
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onClose]);

  return (
    <div
      className="modal-overlay"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal" role="dialog" aria-modal="true" aria-label="Extensions">
        <header className="modal__head">
          <div className="modal__title">
            <Puzzle size={16} strokeWidth={1.7} />
            <span>Extensions</span>
          </div>
          <button
            className="modal__close tip"
            data-tip="Fermer"
            data-tip-pos="bottom"
            onClick={onClose}
            aria-label="Fermer"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="modal__bar">
          <button className="btn btn--primary" onClick={onImport} disabled={busy}>
            <Plus size={15} strokeWidth={1.9} />
            Importer un addon…
          </button>
          {isElectron && (
            <button className="btn" onClick={onOpenFolder}>
              <FolderOpen size={15} strokeWidth={1.8} />
              Dossier des addons
            </button>
          )}
        </div>

        <div className="modal__body">
          {addons.length === 0 && (
            <div className="addon-empty">
              <Puzzle size={28} strokeWidth={1.2} />
              <p>Aucune extension installée.</p>
              <p className="addon-empty__hint">
                Téléchargez un fichier <code>.strokaddon</code>, puis cliquez sur
                « Importer un addon… ».
              </p>
            </div>
          )}

          {addons.map((a) => (
            <div className={`addon-row${a.error ? ' has-error' : ''}`} key={a.file}>
              <label className="switch" title={a.enabled ? 'Activé' : 'Désactivé'}>
                <input
                  type="checkbox"
                  checked={a.enabled}
                  onChange={(e) => onToggle(a.file, e.target.checked)}
                />
                <span className="switch__track">
                  <span className="switch__thumb" />
                </span>
              </label>

              <div className="addon-row__main">
                <div className="addon-row__name">
                  {a.manifest.name}
                  <span className="addon-row__ver">v{a.manifest.version}</span>
                </div>
                {a.manifest.author && (
                  <div className="addon-row__meta">par {a.manifest.author}</div>
                )}
                {a.manifest.description && (
                  <div className="addon-row__desc">{a.manifest.description}</div>
                )}
                {a.error && (
                  <div className="addon-row__error">
                    <AlertTriangle size={12} strokeWidth={1.9} />
                    {a.error}
                  </div>
                )}
                {!a.error && a.enabled && a.commandCount > 0 && (
                  <div className="addon-row__meta">
                    {a.commandCount} commande{a.commandCount > 1 ? 's' : ''}
                  </div>
                )}
                <div className="addon-row__file">{a.file}</div>
              </div>

              <button
                className="addon-row__remove tip"
                data-tip="Supprimer"
                onClick={() => onRemove(a.file)}
                aria-label="Supprimer l'addon"
              >
                <Trash2 size={15} strokeWidth={1.7} />
              </button>
            </div>
          ))}
        </div>

        {commands.length > 0 && (
          <div className="modal__commands">
            <div className="modal__commands-title">Commandes disponibles</div>
            <div className="ext-list">
              {commands.map((c) => (
                <button
                  key={c.key}
                  className="ext-btn"
                  onClick={() => onRun(c.key)}
                  title={`${c.label} — ${c.addon}`}
                >
                  <Play size={13} strokeWidth={1.9} className="ext-btn__icon" />
                  <span className="ext-btn__label">{c.label}</span>
                  <span className="ext-btn__addon">{c.addon}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
