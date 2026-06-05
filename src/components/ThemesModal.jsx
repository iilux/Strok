import { useEffect } from 'react';
import {
  X,
  Plus,
  Trash2,
  FolderOpen,
  AlertTriangle,
  Palette,
  Check,
} from 'lucide-react';

/**
 * ThemesModal — fenêtre de gestion des thèmes (custom, pas de menu OS).
 * Choisir un thème intégré, en importer un (.stroktheme), l'appliquer ou le
 * supprimer. Chaque carte montre un mini-aperçu de l'app peint avec ses couleurs.
 */

// Petit aperçu « app miniature » construit à partir des variables du thème.
function ThemePreview({ v }) {
  const c = (key, fallback) => (v && v[key]) || fallback;
  return (
    <div
      className="theme-card__preview"
      style={{ background: c('--bg-app', '#0d0d0d') }}
      aria-hidden="true"
    >
      <span
        className="theme-card__rail"
        style={{
          background: c('--bg-rail', '#141414'),
          borderColor: c('--border', '#2a2a2a'),
        }}
      >
        <i style={{ background: c('--accent', '#e8e8e8') }} />
        <i style={{ background: c('--icon', '#8a8a8a') }} />
        <i style={{ background: c('--icon', '#8a8a8a') }} />
      </span>
      <span className="theme-card__paper" />
      <span
        className="theme-card__panel"
        style={{
          background: c('--bg-panel', '#1a1a1a'),
          borderColor: c('--border', '#2a2a2a'),
        }}
      >
        <i
          className="theme-card__bar"
          style={{ background: c('--text-bright', '#e8e8e8') }}
        />
        <i
          className="theme-card__bar is-dim"
          style={{ background: c('--text-dim', '#6b6b6b') }}
        />
        <i
          className="theme-card__chip"
          style={{ background: c('--accent', '#e8e8e8') }}
        />
      </span>
    </div>
  );
}

export default function ThemesModal({
  themes,
  busy,
  isElectron,
  onApply,
  onImport,
  onRemove,
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
      <div className="modal" role="dialog" aria-modal="true" aria-label="Thèmes">
        <header className="modal__head">
          <div className="modal__title">
            <Palette size={16} strokeWidth={1.7} />
            <span>Thèmes</span>
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
            Importer un thème…
          </button>
          {isElectron && (
            <button className="btn" onClick={onOpenFolder}>
              <FolderOpen size={15} strokeWidth={1.8} />
              Dossier des thèmes
            </button>
          )}
        </div>

        <div className="modal__body">
          <div className="theme-grid">
            {themes.map((t) => (
              <div
                className={`theme-card${t.active ? ' is-active' : ''}${
                  t.error ? ' has-error' : ''
                }`}
                key={t.file}
              >
                <button
                  className="theme-card__hit"
                  onClick={() => !t.error && onApply(t.file)}
                  disabled={!!t.error}
                  aria-pressed={t.active}
                  title={
                    t.error
                      ? t.error
                      : t.active
                      ? 'Thème appliqué'
                      : `Appliquer « ${t.manifest.name} »`
                  }
                >
                  {t.error ? (
                    <div className="theme-card__broken">
                      <AlertTriangle size={20} strokeWidth={1.6} />
                    </div>
                  ) : (
                    <ThemePreview v={t.variables} />
                  )}

                  <div className="theme-card__info">
                    <div className="theme-card__name">
                      {t.manifest.name}
                      {t.active && (
                        <span className="theme-card__badge">
                          <Check size={11} strokeWidth={2.4} />
                          Actif
                        </span>
                      )}
                    </div>
                    {t.error ? (
                      <div className="theme-card__err">{t.error}</div>
                    ) : (
                      <div className="theme-card__meta">
                        {t.builtin
                          ? 'Intégré'
                          : t.manifest.author
                          ? `par ${t.manifest.author}`
                          : 'Importé'}
                        {t.manifest.version && t.manifest.version !== '—' && (
                          <span className="theme-card__ver"> · v{t.manifest.version}</span>
                        )}
                      </div>
                    )}
                  </div>
                </button>

                {!t.builtin && (
                  <button
                    className="theme-card__remove tip"
                    data-tip="Supprimer"
                    data-tip-pos="bottom"
                    onClick={() => onRemove(t.file)}
                    aria-label="Supprimer le thème"
                  >
                    <Trash2 size={14} strokeWidth={1.7} />
                  </button>
                )}
              </div>
            ))}
          </div>

          <p className="theme-hint">
            Un thème est un fichier <code>.stroktheme</code> (JSON) qui surcharge
            les couleurs de l'app. Téléchargez-en un, puis « Importer un thème… ».
          </p>
        </div>
      </div>
    </div>
  );
}
