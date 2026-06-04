import { Fragment, useEffect } from 'react';
import { Keyboard, X } from 'lucide-react';

/**
 * ShortcutsModal — aide-mémoire des raccourcis clavier.
 *
 * Ce n'est PAS une fenêtre OS : c'est un popup interne à l'app (overlay React).
 * L'arrière-plan (l'app) est flouté ; on ferme via la croix, un clic à
 * l'extérieur (sur l'app floutée) ou `Échap`.
 */

// Groupes de raccourcis affichés. Reste aligné avec le tableau du README.
const GROUPS = [
  {
    title: 'Outils',
    items: [
      { keys: ['B'], desc: 'Crayon' },
      { keys: ['E'], desc: 'Gomme' },
      { keys: ['Maj'], hold: true, desc: 'Gomme temporaire (restaure l’outil au relâchement)' },
    ],
  },
  {
    title: 'Édition',
    items: [
      { keys: ['Ctrl', 'Z'], desc: 'Annuler' },
      { keys: ['Ctrl', 'Y'], alt: ['Ctrl', 'Maj', 'Z'], desc: 'Rétablir' },
    ],
  },
  {
    title: 'Fichiers',
    items: [
      { keys: ['Ctrl', 'S'], desc: 'Enregistrer le projet .strok' },
      { keys: ['Ctrl', 'O'], desc: 'Ouvrir un projet .strok' },
      { keys: ['Ctrl', 'Maj', 'E'], desc: 'Exporter en PNG' },
    ],
  },
  {
    title: 'Onglets',
    items: [
      { keys: ['Ctrl', 'T'], desc: 'Nouvel onglet' },
      { keys: ['Ctrl', 'W'], desc: 'Fermer l’onglet actif' },
    ],
  },
  {
    title: 'Vue',
    items: [
      { keys: ['Ctrl', '0'], desc: 'Réinitialiser le zoom' },
      { keys: ['Molette'], desc: 'Zoomer / dézoomer (vers le curseur)' },
      { keys: ['Ctrl', 'Molette'], desc: 'Taille du pinceau / gomme' },
      { keys: ['Clic-molette'], hold: true, desc: 'Déplacer la toile (pan)' },
    ],
  },
];

function Combo({ keys, hold }) {
  return (
    <span className="sc-combo">
      {keys.map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="sc-plus">+</span>}
          <kbd className="kbd">{k}</kbd>
        </Fragment>
      ))}
      {hold && <span className="sc-hold">maintenu</span>}
    </span>
  );
}

export default function ShortcutsModal({ onClose }) {
  // Échap ferme le popup.
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
      className="modal-overlay modal-overlay--blur"
      onPointerDown={(e) => {
        // clic sur l'app floutée derrière (hors carte) = fermeture
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal modal--shortcuts"
        role="dialog"
        aria-modal="true"
        aria-label="Raccourcis clavier"
      >
        <header className="modal__head">
          <div className="modal__title">
            <Keyboard size={16} strokeWidth={1.7} />
            <span>Raccourcis clavier</span>
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

        <div className="modal__body shortcuts">
          {GROUPS.map((g) => (
            <div className="sc-group" key={g.title}>
              <div className="sc-group__title">{g.title}</div>
              {g.items.map((it, i) => (
                <div className="sc-row" key={i}>
                  <span className="sc-row__desc">{it.desc}</span>
                  <span className="sc-row__keys">
                    <Combo keys={it.keys} hold={it.hold} />
                    {it.alt && (
                      <>
                        <span className="sc-or">ou</span>
                        <Combo keys={it.alt} />
                      </>
                    )}
                  </span>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
