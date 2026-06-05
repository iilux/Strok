import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmModal — boîte de confirmation générique (PAS une fenêtre OS native).
 *
 * Overlay React flouté, dans la même veine que ShortcutsModal/AddonsModal :
 * `Échap` ou un clic sur l'app floutée = annuler. Trois actions au choix :
 *   - confirm  (bouton accent)  → ex. « Enregistrer »
 *   - deny     (bouton danger)  → ex. « Ne pas enregistrer »
 *   - cancel   (bouton neutre)  → ex. « Annuler »
 *
 * `denyLabel`/`onDeny` sont optionnels : sans eux, la modale n'a que
 * confirmer / annuler (confirmation simple à deux boutons).
 */
export default function ConfirmModal({
  title,
  message,
  confirmLabel = 'Confirmer',
  denyLabel,
  cancelLabel = 'Annuler',
  onConfirm,
  onDeny,
  onCancel,
}) {
  // Échap = annuler (capture pour passer avant les raccourcis globaux de l'app).
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCancel();
      } else if (e.key === 'Enter') {
        e.stopPropagation();
        onConfirm();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [onCancel, onConfirm]);

  return (
    <div
      className="modal-overlay modal-overlay--blur"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal modal--confirm"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="modal__head">
          <div className="modal__title">
            <AlertTriangle size={16} strokeWidth={1.7} />
            <span>{title}</span>
          </div>
          <button
            className="modal__close tip"
            data-tip="Fermer"
            data-tip-pos="bottom"
            onClick={onCancel}
            aria-label="Fermer"
          >
            <X size={16} strokeWidth={1.8} />
          </button>
        </header>

        <div className="modal__body modal__text">{message}</div>

        <footer className="modal__foot">
          <button className="btn" onClick={onCancel}>
            {cancelLabel}
          </button>
          <div className="modal__foot-spacer" />
          {denyLabel && (
            <button className="btn btn--danger" onClick={onDeny}>
              {denyLabel}
            </button>
          )}
          <button className="btn btn--primary" onClick={onConfirm}>
            {confirmLabel}
          </button>
        </footer>
      </div>
    </div>
  );
}
