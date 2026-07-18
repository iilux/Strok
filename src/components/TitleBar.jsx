import { memo, useEffect, useState } from 'react';
import { Plus, X, HelpCircle } from 'lucide-react';

function Logo() {
  return (
    <svg
      className="titlebar__logo"
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M4 17.5C4 17.5 6.5 6 11 6c2.6 0 2.2 4.2 4 4.2C20.5 10.2 20 17.5 20 17.5"
        stroke="#e8e8e8"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <circle cx="6" cy="18.5" r="1.4" fill="#e8e8e8" />
    </svg>
  );
}

const api = typeof window !== 'undefined' ? window.strok : undefined;
// macOS : les feux tricolores natifs (à gauche, hiddenInset) remplacent les
// boutons custom min/max/fermer.
const isMac = api?.platform === 'darwin';

function TitleBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  onOpenHelp,
}) {
  const [isMax, setIsMax] = useState(false);

  useEffect(() => {
    if (!api || isMac) return;
    api.isMaximized().then(setIsMax).catch(() => {});
    return api.onMaximizeChange(setIsMax);
  }, []);

  const showClose = tabs.length > 1;

  return (
    <div className={`titlebar${isMac ? ' titlebar--mac' : ''}`}>
      <div className="titlebar__brand">
        <Logo />
        <span className="titlebar__title">Strok</span>
        <span className="titlebar__sep" />
      </div>

      <div className="tabs">
        {tabs.map((tab) => (
          <div
            key={tab.id}
            className={`tab${tab.id === activeTabId ? ' is-active' : ''}`}
            onMouseDown={(e) => {
              // clic milieu = fermer (comme un navigateur)
              if (e.button === 1 && showClose) {
                e.preventDefault();
                onCloseTab(tab.id);
              } else if (e.button === 0) {
                onSelectTab(tab.id);
              }
            }}
            title={tab.name}
          >
            <span className="tab__name">{tab.name}</span>
            {showClose && (
              <button
                className="tab__close"
                onClick={(e) => {
                  e.stopPropagation();
                  onCloseTab(tab.id);
                }}
                aria-label="Fermer l'onglet"
              >
                <X size={12} strokeWidth={2} />
              </button>
            )}
          </div>
        ))}
        <button className="tab__new" onClick={onNewTab} aria-label="Nouvel onglet">
          <Plus size={15} strokeWidth={2} />
        </button>
      </div>

      <div className="titlebar__spacer" />

      <div className="titlebar__controls">
        <button
          className="win-btn win-btn--help"
          onClick={onOpenHelp}
          aria-label="Raccourcis clavier"
        >
          <HelpCircle size={15} strokeWidth={1.7} />
        </button>

        {!isMac && (
          <>
            <button
              className="win-btn"
              onClick={() => api?.minimize()}
              aria-label="Minimiser"
            >
              <svg width="11" height="11" viewBox="0 0 11 11">
                <rect x="1" y="5" width="9" height="1" fill="currentColor" />
              </svg>
            </button>

            <button
              className="win-btn"
              onClick={() => api?.maximize()}
              aria-label={isMax ? 'Restaurer' : 'Maximiser'}
            >
              {isMax ? (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="1.5" y="3" width="6.5" height="6.5" stroke="currentColor" strokeWidth="1" />
                  <path d="M3.5 3V1.5H9.5V7.5H8" stroke="currentColor" strokeWidth="1" />
                </svg>
              ) : (
                <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                  <rect x="1.5" y="1.5" width="8" height="8" stroke="currentColor" strokeWidth="1" />
                </svg>
              )}
            </button>

            <button
              className="win-btn win-btn--close"
              onClick={() => api?.close()}
              aria-label="Fermer"
            >
              <svg width="11" height="11" viewBox="0 0 11 11" fill="none">
                <path d="M1.5 1.5L9.5 9.5M9.5 1.5L1.5 9.5" stroke="currentColor" strokeWidth="1.1" strokeLinecap="round" />
              </svg>
            </button>
          </>
        )}
      </div>
    </div>
  );
}

export default memo(TitleBar);
