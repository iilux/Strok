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
- **Aide-mémoire des raccourcis** : un bouton **?** dans la titlebar (juste à
  côté de « minimiser ») ouvre un **popup intégré** listant tous les raccourcis.
  Voir [Aide-mémoire des raccourcis](#aide-mémoire-des-raccourcis).
- **Annuler / Rétablir** (`Ctrl + Z` / `Ctrl + Y`), historique par onglet
  compatible toile infinie (géométrie + bitmap restaurés).
- **Fichiers** : projet `.strok` ré-éditable (enregistrer / ouvrir) + export PNG.
- **Extensions (addons)** : système de plugins — les utilisateurs téléchargent un
  fichier `.strokaddon` et l'importent via le rail de gauche. Voir
  [Extensions (addons)](#extensions-addons).

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
| `clic-molette` (glisser) | Déplacer la toile (pan) |

> 💡 Cette même liste est consultable **dans l'app** via le bouton **?** de la
> titlebar — cf. [Aide-mémoire des raccourcis](#aide-mémoire-des-raccourcis).

### Aide-mémoire des raccourcis

Un bouton **?** est placé dans la titlebar, **juste à gauche du bouton
« minimiser »** (le trait `—`). Au clic, il ouvre un **popup intégré** récapitulant
tous les raccourcis, regroupés par thème (Outils, Édition, Fichiers, Onglets, Vue).

Comment il réagit :

- Ce **n'est pas une vraie fenêtre OS** : c'est un overlay rendu **dans l'app**
  (même mécanique que la modale [Extensions (addons)](#extensions-addons)).
- L'**app derrière est floutée** (effet `backdrop-filter`) tant que le popup est
  ouvert.
- On le **ferme** de trois façons : la **petite croix** en haut à droite du popup,
  un **clic sur l'app floutée** (en dehors de la carte), ou la touche **`Échap`**.

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

## Extensions (addons)

Strok est extensible par des **addons** : de petits scripts que **n'importe qui
peut écrire**, partager / **télécharger ailleurs**, puis **importer** dans l'app
via un bouton. Il n'y a **aucune boutique intégrée** — on importe un fichier.

### Pour les utilisateurs

1. Récupérez un fichier **`.strokaddon`** (par ex. ceux de
   [`examples/addons/`](examples/addons/)).
2. Dans Strok : **rail de gauche → icône Extensions** (pièce de puzzle).
3. **« Importer un addon… »** et choisissez le fichier.
   - Alternative : **« Dossier des addons »** ouvre le dossier de stockage ; vous
     pouvez y déposer vos `.strokaddon` à la main (chargés au prochain démarrage).
4. Les addons sont **persistants** (rangés dans
   `…/AppData/Roaming/Strok/strok-addons` sous Windows). Chaque ligne a un
   **interrupteur** (activer / désactiver) et un bouton **supprimer**.
5. Les commandes ajoutées par les addons apparaissent dans la modale **et** dans
   la section « Extensions » du panneau de droite.

> ⚠️ Un addon est du code qui s'exécute dans l'app.
> **N'installez que des addons dont vous avez confiance dans la source.**
> Ils restent toutefois confinés (cf. [Sécurité des addons](#sécurité-des-addons)).

### Pour les développeurs d'addons

Un addon est **un seul fichier JavaScript** (extension `.strokaddon`), **sans
build**. Il renseigne un objet `module` :

```js
module.manifest = {
  id: 'com.exemple.mon-addon',   // identifiant unique (reverse-DNS conseillé)
  name: 'Mon addon',
  version: '1.0.0',
  author: 'Votre nom',
  description: 'Ce que fait votre addon, en une phrase.',
};

module.activate = function (strok) {
  strok.addCommand({
    id: 'hello',
    label: 'Dire bonjour',
    run: () => strok.notify(`Couleur courante : ${strok.getColor()}`),
  });
  // Renvoyez éventuellement un nettoyage, exécuté à la désactivation/suppression.
  return { deactivate: () => {} };
};
```

> `module.exports = { manifest, activate }` et `exports.activate = …` marchent
> aussi. `activate(strok)` est appelé une fois au chargement. Point de départ
> recommandé : [`examples/addons/TEMPLATE.strokaddon`](examples/addons/TEMPLATE.strokaddon).

#### API `strok`

**Pinceau / outil**

| Méthode | Description |
| --- | --- |
| `getColor()` / `setColor('#rrggbb')` | Couleur (l'écriture l'ajoute aux récentes) |
| `getTool()` / `setTool(id)` | Outil — `'pencil'` ou `'eraser'` |
| `getSize()` / `setSize(px)` | Taille du pinceau (1–100) |
| `getOpacity()` / `setOpacity(0..1)` | Opacité |

**Calque actif**

| Méthode | Description |
| --- | --- |
| `getContext()` | `CanvasRenderingContext2D` (transform dpr posée → dessin en **px CSS**). `null` si aucun calque. |
| `getCanvasInfo()` | `{ width, height` (px **physiques**)`, dpr, doc:{ x, y, w, h }` (px CSS)` }` |
| `commit()` | À appeler **après** avoir dessiné : valide l'édition dans l'undo/redo |

> Dessin vectoriel (`fillRect`, `stroke`…) → dimensions `doc.w / doc.h` (px CSS).
> Accès pixel (`getImageData` / `putImageData`) → `width / height` (px physiques),
> car ces méthodes ignorent la transform.

**Contributions**

| Méthode | Description |
| --- | --- |
| `addCommand({ id, label, run })` | Ajoute un bouton-commande. Renvoie une fonction de retrait. |

**Événements** (renvoient une fonction de désabonnement)

| Événement | Charge utile | Déclenché… |
| --- | --- | --- |
| `on('strokeEnd', fn)` | — | après chaque trait validé |
| `on('colorChange', fn)` | `hex` | quand la couleur change |
| `on('toolChange', fn)` | `id` | quand l'outil change |

**Divers**

| Méthode | Description |
| --- | --- |
| `notify(msg, type?)` | Toast — `'info'` (défaut) / `'success'` / `'error'` |
| `storage.get(key, fallback)` · `set(key, val)` · `remove(key)` | Stockage persistant **isolé par addon** |
| `version` | Version de l'app hôte |
| `manifest` | Le manifeste de votre propre addon |

#### Exemples fournis

| Fichier | Démontre |
| --- | --- |
| [`fill-background.strokaddon`](examples/addons/fill-background.strokaddon) | `addCommand`, dessin vectoriel, `commit` |
| [`invert-colors.strokaddon`](examples/addons/invert-colors.strokaddon) | accès pixel `getImageData` / `putImageData` |
| [`rainbow-stroke.strokaddon`](examples/addons/rainbow-stroke.strokaddon) | événements, `storage`, `deactivate` |
| [`TEMPLATE.strokaddon`](examples/addons/TEMPLATE.strokaddon) | squelette commenté + API complète |

Pour **distribuer** un addon, partagez simplement son fichier `.strokaddon`.
Choisissez un `id` de manifeste **unique** : il sert d'espace de noms pour
`storage`.

### Sécurité des addons

Le code d'un addon tourne dans le **renderer durci** d'Electron :

- **`contextIsolation` + `sandbox` + `nodeIntegration:false`** → **aucun** accès
  Node ni au système de fichiers.
- **CSP `default-src 'self'`** → impossible de charger un script externe ou de
  **contacter le réseau** → pas d'exfiltration de données.
- **Navigation verrouillée** à l'origine de l'app ; ouverture de fenêtres refusée.

Pour exécuter le code d'addon, la CSP de **production** autorise
`script-src 'self' 'unsafe-eval'` (lancement via `new Function`). C'est
**nécessaire et assumé** — sans cela, aucun addon ne peut tourner — et cela
**n'ouvre pas** de voie d'injection distante puisque `default-src 'self'`
interdit déjà de récupérer le moindre contenu externe. Le pire qu'un addon
malveillant puisse faire est de manipuler la toile en cours d'exécution ; il ne
peut **ni** toucher vos fichiers **ni** téléphoner à un serveur. Restez prudent :
**n'installez que ce dont vous avez confiance dans la source.**

L'IPC d'addons (`electron/main.cjs`) ne fait que de la **persistance fichier**
dans `userData/strok-addons` (lister / importer / supprimer / ouvrir le dossier,
avec garde anti path-traversal et limite de taille) — **le processus principal
n'exécute jamais ce code**, c'est le renderer qui le charge.

## Structure

```
Stroke/
├── electron/
│   ├── main.cjs        # main process durci (IPC fenêtre + fichiers + addons)
│   └── preload.cjs     # bridge sécurisé (contextIsolation)
├── src/
│   ├── App.jsx         # état global + assemblage + intégration addons/toasts
│   ├── components/     # TitleBar, Sidebar, Toolbar, ColorPicker, Canvas,
│   │                   #   AddonsModal, ShortcutsModal
│   ├── hooks/          # useCanvas (dessin + historique undo/redo)
│   ├── addons/         # host.js (moteur addons) + useAddons.js (couche React)
│   └── styles/global.css
├── examples/addons/    # addons d'exemple (.strokaddon) + TEMPLATE
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
  permission web accordée, CSP strict `default-src 'self'` en production. (La
  CSP de prod autorise `script-src 'self' 'unsafe-eval'` **uniquement** pour
  exécuter les addons — cf. [Sécurité des addons](#sécurité-des-addons).)
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
