# Strok

Application desktop de dessin / croquis — **Electron + React (Vite)**.
UI dark, minimaliste, 100 % custom (aucun élément natif Windows visible).

## Stack

- **Electron 33** — fenêtre frameless (`frame: false`), titlebar custom.
- **React 18 + Vite 6** — UI et bundling.
- **HTML5 Canvas** — moteur de dessin (double canvas main/overlay).
- **CSS écrit à la main** — pas de Tailwind, pas de Material UI.
- **lucide-react** — icônes fines monochromes.

## Scripts

```bash
npm install      # installe les dépendances
npm run dev      # Vite + Electron en mode dev (HMR)
npm run build    # build React (-> dist/)
npm run dist     # génère release/Strok-Setup-1.0.0.exe (NSIS)
npm run pack     # build non packagé (release/win-unpacked/) pour test rapide
npm run icon     # régénère build/icon.ico
```

`npm run dev` lance Vite (port 5173) puis Electron une fois le serveur prêt.

## Fonctionnalités

- **Canvas** plein écran, papier encadré sur fond sombre pointillé.
- **Crayon** (trait libre lissé) et **Gomme**.
- **Taille** et **Opacité** du trait via sliders custom.
- **Taille à la molette** : `Ctrl + molette` agrandit / rapetisse le pinceau ou
  la gomme à la volée (pas adaptatif), sans avoir à viser le slider.
- **Gomme express** : maintenir `Maj` bascule temporairement sur la gomme ;
  au relâchement, l'outil précédent revient automatiquement.
- **Color picker** custom : zone saturation/valeur, bandeau de teinte, champ
  hex, palette de presets, **5 dernières couleurs**.
- **Onglets multi-documents** type navigateur : ouvrir / fermer / basculer,
  chacun avec son propre dessin et son propre niveau de zoom.
- **Mode sombre du calque** : papier teinté comme les menus de l'app (pas noir),
  le crayon bascule automatiquement vers un gris clair coordonné.
- **Zoom / dézoom** : `molette` simple (vers le curseur), boutons `−` / `+`,
  clic sur le `%` pour réinitialiser ; pan au **clic-molette** (glisser).
- **Titlebar custom** (minimiser / maximiser / fermer) + **anneau de curseur**
  indiquant la taille du pinceau (suit le zoom).
- **Annuler / Rétablir** (`Ctrl + Z` / `Ctrl + Y`), historique par onglet
  compatible toile infinie (géométrie + bitmap restaurés).
- **Fichiers** : projet `.strok` ré-éditable (enregistrer / ouvrir) + export PNG.

### Raccourcis

| Touche | Action |
| --- | --- |
| `B` / `E` | Crayon / Gomme |
| `Maj` (maintenu) | Gomme temporaire (restaure l'outil au relâchement) |
| `Ctrl + Z` | Annuler |
| `Ctrl + Y` / `Ctrl + Maj + Z` | Rétablir |
| `Ctrl + S` / `Ctrl + O` | Enregistrer / Ouvrir un projet `.strok` |
| `Ctrl + Maj + E` | Exporter en PNG |
| `Ctrl + T` | Nouvel onglet |
| `Ctrl + W` | Fermer l'onglet actif |
| `Ctrl + 0` | Réinitialiser le zoom |
| `molette` | Zoomer / dézoomer (vers le curseur) |
| `Ctrl + molette` | Taille du pinceau / gomme |

### Architecture du dessin

Deux canvases empilés assurent une **opacité uniforme** : le trait en cours est
tracé à pleine opacité sur l'`overlay`, puis aplati sur le canvas `main` au
relâchement avec l'opacité choisie (évite l'accumulation sombre aux
recouvrements). Lissage par courbes quadratiques + `getCoalescedEvents()` pour
un tracé fluide sans latence (pas besoin de batcher en rAF).

**Onglets** : un `<Canvas>` est monté par onglet (seul l'actif est visible) — le
bitmap de chaque document persiste naturellement sans recopie manuelle.

**Zoom / pan** : appliqués via une transformation CSS (`translate` + `scale`) sur
un `.canvas-viewport`. La résolution du canvas ne change pas (zoom raster) ; les
coordonnées de dessin sont retrouvées en divisant par le zoom (le `rect`
transformé encode déjà le pan).

## Structure

```
Stroke/
├── electron/
│   ├── main.cjs        # main process durci (frameless, IPC fenêtre + fichiers)
│   └── preload.cjs     # bridge sécurisé (contextIsolation)
├── src/
│   ├── App.jsx         # état global + assemblage
│   ├── components/     # TitleBar, Sidebar, Toolbar, ColorPicker, Canvas
│   ├── hooks/          # useCanvas (dessin + historique undo/redo)
│   └── styles/global.css
├── build/
│   ├── generate-icon.cjs
│   └── icon.ico / icon.png
├── index.html
├── vite.config.js
├── electron-builder.yml
└── package.json
```

## Sécurité

Durcissement appliqué côté Electron et build :

- **Isolation du renderer** : `contextIsolation` + `sandbox` + `nodeIntegration: false`
  — le renderer ne peut faire que les appels IPC explicitement exposés par
  `preload.cjs`, aucun accès direct à Node ou au système.
- **Pas de fuite réseau** : navigation verrouillée à l'origine de l'app
  (`will-navigate`), nouvelles fenêtres refusées (`setWindowOpenHandler`), aucune
  permission web accordée, CSP strict `default-src 'self'` en production.
- **Protection du code** : DevTools désactivés en production (+ raccourcis
  inspecteur neutralisés, menu applicatif supprimé) ; build minifié **sans
  source-maps**, `console.*` retirés.
- **Validation IPC** : taille des projets/images plafonnée, écritures fichier
  toujours via un dialogue OS (chemin choisi par l'utilisateur).

> Limite assumée : un `.exe` Electron exécute du code sur la machine cible et
> l'`app.asar` est extractible — le durcissement **élève la barre**, il ne rend
> pas le code source inviolable.

## Build du `.exe` — note importante

La **signature de code est désactivée** dans `npm run dist`
(`CSC_IDENTITY_AUTO_DISCOVERY=false`). Cela évite l'extraction du paquet
`winCodeSign` d'electron-builder, qui échoue sous Windows sans le privilège de
création de liens symboliques (Developer Mode désactivé / hors admin). L'`.exe`
généré reste **autonome** (Node + Chromium embarqués) ; il sera simplement non
signé. Pour signer plus tard, fournir un certificat via `CSC_LINK` / `CSC_KEY_PASSWORD`.

## Reste à faire

Formes (ligne / rectangle / ellipse), remplissage, pipette, export JPG,
splash screen. _(Zoom, fichiers `.strok`/PNG et undo/redo déjà implémentés.)_
