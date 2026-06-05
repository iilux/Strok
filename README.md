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
npm run dist     # génère release/Strok-Setup-1.3.1.exe (NSIS)
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
- **Sauvegarde automatique** : l'app retient tout votre espace de travail. En
  quittant, chaque onglet (dessin, vue, onglet actif) est conservé et **restauré
  à l'identique** au prochain lancement — même les calques jamais enregistrés sur
  le disque. Fermer un **onglet** modifié propose de l'enregistrer. Voir
  [Sauvegarde automatique](#sauvegarde-automatique).
- **Extensions (addons)** : système de plugins — les utilisateurs téléchargent un
  fichier `.strokaddon` et l'importent via le rail de gauche. Voir
  [Extensions (addons)](#extensions-addons).
- **Thèmes** : changez toute l'esthétique de l'app. 5 thèmes intégrés (défaut,
  Clair, Nuit, Nord, Sépia) + import de thèmes `.stroktheme` (JSON) sur le même
  principe que les addons. Voir [Thèmes](#thèmes).

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

## Sauvegarde automatique

Strok distingue **fermer l'application** de **fermer un onglet**.

### Fermer l'application

Rien n'est perdu et **rien n'est demandé**. Tout l'espace de travail est persisté
en interne (dans `…/AppData/Roaming/Strok/strok-session.json` sous Windows) puis
**restauré à l'identique** au lancement suivant : tous les onglets, leur dessin,
leur zoom/pan, le mode clair/sombre **et l'onglet sur lequel vous étiez**. Un
calque jamais enregistré dans un `.strok` reste donc disponible dans l'app.

Un **autosave** discret réécrit aussi la session quelques secondes après chaque
modification : en cas de coupure/crash, vous retrouvez quasiment tout.

### Fermer un onglet

Là, Strok vous prévient si vous risquez de perdre quelque chose :

| Onglet… | À la fermeture |
| --- | --- |
| vierge, ou inchangé depuis la dernière sauvegarde | se ferme sans rien demander |
| **modifié, jamais enregistré** | propose de l'enregistrer (dialogue `.strok`) |
| **modifié, déjà lié à un fichier** | demande d'enregistrer les **dernières modifications** (écrase le fichier) |

La fenêtre de confirmation offre **Enregistrer** / **Ne pas enregistrer** /
**Annuler** (overlay interne à l'app, pas une fenêtre Windows native ; `Échap` ou
un clic à l'extérieur = annuler). Si vous annulez le dialogue d'enregistrement,
l'onglet **n'est pas** fermé.

> Une fois un calque enregistré (ou ouvert depuis un `.strok`), `Ctrl + S` et
> « Enregistrer les dernières modifications » **réécrivent le même fichier** sans
> redemander l'emplacement. Par sécurité, seuls les fichiers que vous avez
> désignés vous-même via un dialogue durant la session sont réinscriptibles en
> silence ; après un redémarrage de l'app, le premier enregistrement d'un onglet
> restauré reconfirme l'emplacement.

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

## Thèmes

Comme les addons, mais pour l'**apparence** : un thème change toute l'esthétique
de l'app (fonds, panneaux, bordures, texte, icônes, accent). Tout le style de
Strok est piloté par des **variables CSS** sur `:root` — un thème les surcharge,
et l'interface entière est repeinte.

Contrairement à un addon, un thème est **du JSON purement déclaratif** : il
n'exécute **aucun code** (ni `new Function`, ni `'unsafe-eval'`). C'est donc
intrinsèquement plus sûr.

### Pour les utilisateurs

1. **Rail de gauche → icône Thèmes** (palette).
2. **5 thèmes intégrés** sont proposés d'emblée — cliquez une carte pour
   l'appliquer instantanément :
   - **Strok (défaut)** · **Clair** · **Nuit** · **Nord** · **Sépia**.
3. **« Importer un thème… »** pour ajouter un fichier `.stroktheme` (par ex. ceux
   de [`examples/themes/`](examples/themes/)).
   - Alternative : **« Dossier des thèmes »** ouvre le dossier de stockage ; vous
     pouvez y déposer vos `.stroktheme` à la main (chargés au prochain démarrage).
4. Le thème choisi est **mémorisé** et ré-appliqué au prochain lancement. Les
   thèmes importés sont **persistants** (rangés dans
   `…/AppData/Roaming/Strok/strok-themes` sous Windows) et **supprimables** (les
   intégrés, non). Chaque carte affiche un **mini-aperçu** de l'app à ses couleurs.

> La **surface de dessin** (le papier) reste indépendante du thème : sa teinte se
> règle via le bouton **calque clair / sombre** du rail, pas via les thèmes.

### Pour les créateurs de thèmes

Un thème est **un seul fichier JSON** (extension `.stroktheme`), **sans build** :

```json
{
  "manifest": {
    "id": "com.exemple.mon-theme",
    "name": "Mon thème",
    "version": "1.0.0",
    "author": "Votre nom",
    "description": "Décrivez votre thème en une phrase."
  },
  "variables": {
    "--bg-app": "#0d0d0d",
    "--bg-panel": "#1a1a1a",
    "--text-bright": "#e8e8e8",
    "--accent": "#6d8bff"
  }
}
```

Point de départ recommandé :
[`examples/themes/TEMPLATE.stroktheme`](examples/themes/TEMPLATE.stroktheme)
(reprend le thème par défaut avec **toutes** les variables à personnaliser).

#### Variables disponibles

Seules ces clés (couleurs) sont reconnues ; toute autre clé est ignorée. Une
variable absente garde la valeur du thème par défaut.

| Groupe | Variables |
| --- | --- |
| **Fonds** | `--bg-app`, `--bg-canvas-area`, `--bg-panel`, `--bg-panel-2`, `--bg-titlebar`, `--bg-rail` |
| **Surfaces** | `--surface-hover`, `--surface-active`, `--surface-input` |
| **Bordures** | `--border`, `--border-soft`, `--border-strong` |
| **Texte / icônes** | `--text`, `--text-dim`, `--text-bright`, `--icon`, `--icon-hover`, `--icon-active` |
| **Accent** | `--accent`, `--danger` |

> Les valeurs sont des couleurs CSS (`#rrggbb`, `rgb()`, `hsl()`, mots-clés). Le
> JSON **n'autorise pas de commentaires** (`//`) — d'où le champ `_help` dans le
> modèle, simplement ignoré au chargement.

### Sécurité des thèmes

- Un thème est **de la donnée, pas du code** : il est `JSON.parse`é, jamais
  exécuté. Aucune élévation de la CSP (les thèmes n'ont **pas** besoin de
  `'unsafe-eval'`, contrairement aux addons).
- **Liste blanche** : seules les variables cosmétiques ci-dessus sont appliquées,
  via `setProperty` sur `:root` — un thème **ne peut pas** modifier la mise en
  page (métriques, polices) ni casser l'app, ni injecter du CSS arbitraire (les
  valeurs sont validées : pas de `;`, `{`, `}`, `<`, `>`).
- L'IPC de thèmes (`electron/main.cjs`) ne fait, là encore, que de la
  **persistance fichier** dans `userData/strok-themes` (mêmes gardes
  anti path-traversal et limite de taille que les addons).

## Structure

```
Stroke/
├── electron/
│   ├── main.cjs        # main process durci (IPC fenêtre + fichiers + addons + thèmes + session)
│   └── preload.cjs     # bridge sécurisé (contextIsolation)
├── src/
│   ├── App.jsx         # état global + assemblage + intégration addons/thèmes/toasts
│   ├── components/     # TitleBar, Sidebar, Toolbar, ColorPicker, Canvas,
│   │                   #   AddonsModal, ThemesModal, ShortcutsModal, ConfirmModal
│   ├── hooks/          # useCanvas (dessin + historique undo/redo)
│   ├── addons/         # host.js (moteur addons) + useAddons.js (couche React)
│   ├── themes/         # themeHost.js + builtins.js + useThemes.js
│   └── styles/global.css
├── examples/
│   ├── addons/         # addons d'exemple (.strokaddon) + TEMPLATE
│   └── themes/         # thèmes d'exemple (.stroktheme) + TEMPLATE
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
