# Strok

Desktop drawing / sketching application — **Electron + React (Vite)**.
Dark, minimalist UI, 100% custom (no native Windows elements visible).

## Stack

- **Electron 33** — frameless window (`frame: false`), custom titlebar.
- **React 18 + Vite 6** — UI and bundling.
- **HTML5 Canvas** — drawing engine (dual main/overlay canvas).
- **Handwritten CSS** — no Tailwind, no Material UI.
- **lucide-react** — thin monochrome icons.

## Scripts

```bash
npm install      # install dependencies
npm run dev      # Vite + Electron in dev mode (HMR)
npm run build    # build React (-> dist/)
npm run dist     # generate release/Strok-Setup-1.4.1.exe (NSIS)
npm run pack     # unpackaged build (release/win-unpacked/) for quick testing
npm run icon     # regenerate build/icon.ico
```

`npm run dev` starts Vite (port 5173) then Electron once the server is ready.

## Features

- **Fullscreen canvas**, framed paper on a dark dotted background.
- **Pencil** (smoothed freehand stroke) and **Eraser**.
- **Size** and **Opacity** via custom sliders.
- **Scroll-wheel size**: `Ctrl + scroll` increases / decreases the brush or
  eraser size on the fly (non-adaptive), without having to target the slider.
- **Quick eraser**: holding `Shift` temporarily switches to the eraser;
  releasing it automatically restores the previous tool.
- **Custom color picker**: saturation/value zone, hue strip, hex field,
  preset palette, **last 5 colors**.
- **Multi-document tabs** (browser-style): open / close / switch,
  each with its own drawing and zoom level.
- **Dark layer mode**: paper tinted like the app menus (not black),
  the pencil automatically switches to a coordinated light grey.
- **Zoom / unzoom**: `scroll wheel` (toward cursor), `−` / `+` buttons,
  click on `%` to reset; pan with **middle-click drag**.
- **Custom titlebar** (minimize / maximize / close) + **cursor ring**
  showing brush size (follows zoom).
- **Shortcuts cheat sheet**: a **?** button in the titlebar (just next to
  "minimize") opens a **built-in popup** listing all shortcuts.
  See [Shortcuts cheat sheet](#shortcuts-cheat-sheet).
- **Undo / Redo** (`Ctrl + Z` / `Ctrl + Y`), per-tab history
  compatible with infinite canvas (geometry + bitmap restored).
- **Files**: re-editable `.strok` project (save / open) + PNG export.
- **Autosave**: the app remembers your entire workspace. On quit,
  every tab (drawing, view, active tab) is persisted and **restored
  identically** on next launch — even layers never saved to disk.
  Closing a **modified tab** prompts to save. See
  [Autosave](#autosave).
- **Extensions (addons)**: plugin system — users download a
  `.strokaddon` file and import it via the left rail. Addons can open
  **floating, themed, draggable windows** (`createWindow`) to add tool panels
  that work alongside drawing — e.g. the bundled scientific calculator. See
  [Extensions (addons)](#extensions-addons).
- **Themes**: change the entire app aesthetic. 5 built-in themes (default,
  Light, Night, Nord, Sepia) + import `.stroktheme` files (JSON) following
  the same principle as addons. See [Themes](#themes).

### Shortcuts

| Key | Action |
| --- | --- |
| `B` / `E` | Pencil / Eraser |
| `Shift` (held) | Temporary eraser (restores tool on release) |
| `Ctrl + Z` | Undo |
| `Ctrl + Y` / `Ctrl + Shift + Z` | Redo |
| `Ctrl + S` / `Ctrl + O` | Save / Open a `.strok` project |
| `Ctrl + Shift + E` | Export as PNG |
| `Ctrl + T` | New tab |
| `Ctrl + W` | Close active tab |
| `Ctrl + 0` | Reset zoom |
| `scroll wheel` | Zoom in / out (toward cursor) |
| `Ctrl + scroll wheel` | Brush / eraser size |
| `middle-click drag` | Pan the canvas |

> 💡 This same list is available **inside the app** via the **?** button in the
> titlebar — see [Shortcuts cheat sheet](#shortcuts-cheat-sheet).

### Shortcuts cheat sheet

A **?** button is placed in the titlebar, **just to the left of the
"minimize" button** (the `—` dash). Clicking it opens a **built-in popup**
summarizing all shortcuts, grouped by category (Tools, Edit, Files, Tabs, View).

How it behaves:

- This is **not a real OS window**: it's an overlay rendered **inside the app**
  (same mechanism as the [Extensions (addons)](#extensions-addons) modal).
- The **app behind is blurred** (`backdrop-filter` effect) while the popup is open.
- It can be **closed** in three ways: the **small × button** in the top-right
  corner of the popup, a **click on the blurred app** (outside the card), or
  pressing **`Esc`**.

### Drawing architecture

Two stacked canvases ensure **uniform opacity**: the current stroke is drawn
at full opacity on the `overlay`, then flattened onto the `main` canvas on
pointer up with the chosen opacity (avoids dark accumulation at overlaps).
Smoothing via quadratic curves + `getCoalescedEvents()` for a fluid stroke
with no latency (no need to batch in rAF).

**Tabs**: one `<Canvas>` is mounted per tab (only the active one is visible) —
each document's bitmap persists naturally without manual copying.

**Zoom / pan**: applied via a CSS transform (`translate` + `scale`) on a
`.canvas-viewport`. Canvas resolution does not change (raster zoom); drawing
coordinates are recovered by dividing by the zoom (the transformed `rect`
already encodes the pan).

## Autosave

Strok distinguishes between **closing the application** and **closing a tab**.

### Closing the application

Nothing is lost and **nothing is asked**. The entire workspace is persisted
internally (in `…/AppData/Roaming/Strok/strok-session.json` on Windows) then
**restored identically** on next launch: all tabs, their drawing,
their zoom/pan, light/dark mode **and the tab you were on**. A layer never
saved to a `.strok` file remains available in the app.

A quiet **autosave** also rewrites the session a few seconds after each
change: in case of a crash/power cut, you recover almost everything.

### Closing a tab

Here, Strok warns you if you risk losing something:

| Tab… | On close |
| --- | --- |
| blank, or unchanged since last save | closes without asking |
| **modified, never saved** | prompts to save (`.strok` dialog) |
| **modified, already linked to a file** | asks to save the **latest changes** (overwrites the file) |

The confirmation dialog offers **Save** / **Don't save** /
**Cancel** (internal app overlay, not a native Windows window; `Esc` or a click
outside = cancel). If you cancel the save dialog, the tab is **not** closed.

> Once a layer is saved (or opened from a `.strok`), `Ctrl + S` and
> "Save latest changes" **overwrite the same file** without asking for the
> location again. For safety, only files you explicitly designated yourself via
> an OS dialog during the session are silently rewritable; after an app restart,
> the first save of a restored tab reconfirms the location.

## Extensions (addons)

Strok is extensible via **addons**: small scripts that **anyone can write**,
share / **download elsewhere**, then **import** into the app via a button.
There is **no built-in store** — you import a file.

### For users

1. Get a **`.strokaddon`** file (e.g. the ones in
   [`examples/addons/`](examples/addons/)).
2. In Strok: **left rail → Extensions icon** (puzzle piece).
3. **"Import an addon…"** and choose the file.
   - Alternative: **"Addons folder"** opens the storage folder; you can
     drop your `.strokaddon` files there manually (loaded on next startup).
4. Addons are **persistent** (stored in
   `…/AppData/Roaming/Strok/strok-addons` on Windows). Each row has an
   **toggle switch** (enable / disable) and a **delete** button.
5. Commands added by addons appear in the modal **and** in the "Extensions"
   section of the right panel.

> ⚠️ An addon is code that runs inside the app.
> **Only install addons whose source you trust.**
> They are however sandboxed (see [Addon security](#addon-security)).

### For addon developers

An addon is **a single JavaScript file** (`.strokaddon` extension), **no
build required**. It populates a `module` object:

```js
module.manifest = {
  id: 'com.example.my-addon',   // unique identifier (reverse-DNS recommended)
  name: 'My addon',
  version: '1.0.0',
  author: 'Your name',
  description: 'What your addon does, in one sentence.',
};

module.activate = function (strok) {
  strok.addCommand({
    id: 'hello',
    label: 'Say hello',
    run: () => strok.notify(`Current color: ${strok.getColor()}`),
  });
  // Optionally return a cleanup function, called on deactivation/deletion.
  return { deactivate: () => {} };
};
```

> `module.exports = { manifest, activate }` and `exports.activate = …` also
> work. `activate(strok)` is called once on load. Recommended starting point:
> [`examples/addons/TEMPLATE.strokaddon`](examples/addons/TEMPLATE.strokaddon).

#### `strok` API

**Brush / tool**

| Method | Description |
| --- | --- |
| `getColor()` / `setColor('#rrggbb')` | Color (writing adds it to recents) |
| `getTool()` / `setTool(id)` | Tool — `'pencil'` or `'eraser'` |
| `getSize()` / `setSize(px)` | Brush size (1–100) |
| `getOpacity()` / `setOpacity(0..1)` | Opacity |

**Active layer**

| Method | Description |
| --- | --- |
| `getContext()` | `CanvasRenderingContext2D` (dpr transform applied → draw in **CSS px**). `null` if no layer. |
| `getCanvasInfo()` | `{ width, height` (physical **px**)`, dpr, doc:{ x, y, w, h }` (CSS px)` }` |
| `commit()` | Call **after** drawing: validates the edit into undo/redo |

> Vector drawing (`fillRect`, `stroke`…) → use `doc.w / doc.h` dimensions (CSS px).
> Pixel access (`getImageData` / `putImageData`) → use `width / height` (physical px),
> as these methods ignore the transform.

**Contributions**

| Method | Description |
| --- | --- |
| `addCommand({ id, label, run })` | Adds a command button. Returns a removal function. |
| `createWindow(opts)` | Opens a floating, **themed**, draggable window. Returns a handle (see below). |

**Floating windows** — `createWindow(opts)`

A small in-app window the addon fully owns: it follows the active **theme**,
can be dragged, and can act on the app directly (it has the whole `strok` API in
scope). Usable **alongside** drawing — perfect for tool panels.

| Option | Default | Description |
| --- | --- | --- |
| `title` | `'Addon'` | Title-bar text |
| `width` / `height` | `320` / auto | Size in px |
| `x` / `y` | centered | Initial position in px |
| `draggable` | `true` | Move it by its title bar |
| `resizable` | `false` | Bottom-right resize handle |
| `backdrop` | `false` | `false` \| `'dim'` \| `'blur'` — a backdrop behind it (clicking it closes the window; `Esc` also closes) |
| `closable` | `true` | Show the close button |
| `className` | — | Extra CSS class for styling |
| `onClose` | — | Called after the window closes |

Returns a handle: `{ el, body, setTitle, setSize, move, focus, isOpen, close }`.
Fill `handle.body` with your own DOM. Themed helper classes are available:
`.aw-btn` (`--fn` / `--accent` / `--danger`), `.aw-display`, `.aw-grid`.
Open windows are **closed automatically** when the addon is disabled/removed.

> ⚠️ The production CSP forbids inline `onclick=` handlers — wire events with
> `addEventListener`, not inline attributes.

**Events** (return an unsubscribe function)

| Event | Payload | Fired… |
| --- | --- | --- |
| `on('strokeEnd', fn)` | — | after each committed stroke |
| `on('colorChange', fn)` | `hex` | when the color changes |
| `on('toolChange', fn)` | `id` | when the tool changes |

**Misc**

| Method | Description |
| --- | --- |
| `notify(msg, type?)` | Toast — `'info'` (default) / `'success'` / `'error'` |
| `storage.get(key, fallback)` · `set(key, val)` · `remove(key)` | Persistent storage **isolated per addon** |
| `version` | Host app version |
| `manifest` | Your own addon's manifest |

#### Provided examples

| File | Demonstrates |
| --- | --- |
| [`fill-background.strokaddon`](examples/addons/fill-background.strokaddon) | `addCommand`, vector drawing, `commit` |
| [`invert-colors.strokaddon`](examples/addons/invert-colors.strokaddon) | pixel access `getImageData` / `putImageData` |
| [`rainbow-stroke.strokaddon`](examples/addons/rainbow-stroke.strokaddon) | events, `storage`, `deactivate` |
| [`scientific-calculator.strokaddon`](examples/addons/scientific-calculator.strokaddon) | `createWindow`, floating themed UI, `setSize` |
| [`TEMPLATE.strokaddon`](examples/addons/TEMPLATE.strokaddon) | commented skeleton + full API |

To **distribute** an addon, simply share its `.strokaddon` file.
Choose a **unique** manifest `id`: it serves as the namespace for `storage`.

### Addon security

An addon's code runs inside Electron's **hardened renderer**:

- **`contextIsolation` + `sandbox` + `nodeIntegration:false`** → **no** access
  to Node or the file system.
- **CSP `default-src 'self'`** → impossible to load an external script or
  **reach the network** → no data exfiltration.
- **Navigation locked** to the app's origin; opening new windows is refused.

To execute addon code, the **production** CSP allows
`script-src 'self' 'unsafe-eval'` (invocation via `new Function`). This is
**necessary and intentional** — without it, no addon can run — and it
**does not open** a remote injection path since `default-src 'self'`
already prevents fetching any external content. The worst a malicious addon
can do is manipulate the current canvas; it can **neither** touch your files
**nor** phone home to a server. Stay cautious:
**only install addons from sources you trust.**

The addons IPC (`electron/main.cjs`) only handles **file persistence**
in `userData/strok-addons` (list / import / delete / open folder,
with path-traversal guard and size limit) — **the main process never executes
this code**, it's the renderer that loads it.

## Themes

Like addons, but for **appearance**: a theme changes the entire app aesthetic
(backgrounds, panels, borders, text, icons, accent). Strok's entire style is
driven by **CSS variables** on `:root` — a theme overrides them, and the whole
interface is repainted.

Unlike an addon, a theme is **purely declarative JSON**: it executes **no code**
(no `new Function`, no `'unsafe-eval'`). It is therefore inherently safer.

### For users

1. **Left rail → Themes icon** (palette).
2. **5 built-in themes** are available right away — click a card to apply
   it instantly:
   - **Strok (default)** · **Light** · **Night** · **Nord** · **Sepia**.
3. **"Import a theme…"** to add a `.stroktheme` file (e.g. the ones in
   [`examples/themes/`](examples/themes/)).
   - Alternative: **"Themes folder"** opens the storage folder; you can
     drop your `.stroktheme` files there manually (loaded on next startup).
4. The chosen theme is **remembered** and re-applied on next launch. Imported
   themes are **persistent** (stored in
   `…/AppData/Roaming/Strok/strok-themes` on Windows) and **deletable** (built-in
   ones are not). Each card shows a **mini-preview** of the app in its colors.

> The **drawing surface** (the paper) is independent from the theme: its tint is
> controlled via the **light / dark layer button** on the rail, not via themes.

### For theme creators

A theme is **a single JSON file** (`.stroktheme` extension), **no build required**:

```json
{
  "manifest": {
    "id": "com.example.my-theme",
    "name": "My theme",
    "version": "1.0.0",
    "author": "Your name",
    "description": "Describe your theme in one sentence."
  },
  "variables": {
    "--bg-app": "#0d0d0d",
    "--bg-panel": "#1a1a1a",
    "--text-bright": "#e8e8e8",
    "--accent": "#6d8bff"
  }
}
```

Recommended starting point:
[`examples/themes/TEMPLATE.stroktheme`](examples/themes/TEMPLATE.stroktheme)
(contains the default theme with **all** customizable variables).

#### Available variables

Only these keys (colors) are recognized; any other key is ignored. A missing
variable keeps the default theme value.

| Group | Variables |
| --- | --- |
| **Backgrounds** | `--bg-app`, `--bg-canvas-area`, `--bg-panel`, `--bg-panel-2`, `--bg-titlebar`, `--bg-rail` |
| **Surfaces** | `--surface-hover`, `--surface-active`, `--surface-input` |
| **Borders** | `--border`, `--border-soft`, `--border-strong` |
| **Text / icons** | `--text`, `--text-dim`, `--text-bright`, `--icon`, `--icon-hover`, `--icon-active` |
| **Accent** | `--accent`, `--danger` |

> Values are CSS colors (`#rrggbb`, `rgb()`, `hsl()`, keywords). JSON **does not
> allow comments** (`//`) — hence the `_help` field in the template, which is
> simply ignored on load.

### Theme security

- A theme is **data, not code**: it is `JSON.parse`d, never executed. No CSP
  elevation needed (themes do **not** require `'unsafe-eval'`, unlike addons).
- **Allowlist**: only the cosmetic variables listed above are applied,
  via `setProperty` on `:root` — a theme **cannot** modify layout
  (metrics, fonts) or break the app, nor inject arbitrary CSS (values are
  validated: no `;`, `{`, `}`, `<`, `>`).
- The themes IPC (`electron/main.cjs`) likewise only handles
  **file persistence** in `userData/strok-themes` (same path-traversal guard
  and size limit as addons).

## Structure

```
Stroke/
├── electron/
│   ├── main.cjs        # hardened main process (IPC window + files + addons + themes + session)
│   └── preload.cjs     # secure bridge (contextIsolation)
├── src/
│   ├── App.jsx         # global state + assembly + addon/theme/toast integration
│   ├── components/     # TitleBar, Sidebar, Toolbar, ColorPicker, Canvas,
│   │                   #   AddonsModal, ThemesModal, ShortcutsModal, ConfirmModal
│   ├── hooks/          # useCanvas (drawing + undo/redo history)
│   ├── addons/         # host.js (addon engine) + useAddons.js (React layer)
│   ├── themes/         # themeHost.js + builtins.js + useThemes.js
│   └── styles/global.css
├── examples/
│   ├── addons/         # example addons (.strokaddon) + TEMPLATE
│   └── themes/         # example themes (.stroktheme) + TEMPLATE
├── build/
│   ├── generate-icon.cjs
│   └── icon.ico / icon.png
├── index.html
├── vite.config.js
├── electron-builder.yml
└── package.json
```

## Security

Hardening applied on the Electron side and build:

- **Renderer isolation**: `contextIsolation` + `sandbox` + `nodeIntegration: false`
  — the renderer can only make IPC calls explicitly exposed by
  `preload.cjs`, no direct access to Node or the system.
- **No network leak**: navigation locked to the app's origin
  (`will-navigate`), new windows refused (`setWindowOpenHandler`), no web
  permission granted, strict `default-src 'self'` CSP in production. (The
  prod CSP allows `script-src 'self' 'unsafe-eval'` **only** to execute
  addons — see [Addon security](#addon-security).)
- **Code protection**: DevTools disabled in production (+ inspector shortcuts
  neutralized, app menu removed); minified build **without source maps**,
  `console.*` stripped.
- **IPC validation**: project/image size capped, file writes always go through
  an OS dialog (path chosen by the user).

> Known limitation: an Electron `.exe` executes code on the target machine and
> the `app.asar` is extractable — hardening **raises the bar**, it does not make
> the source code tamper-proof.

## Building the `.exe` — important note

**Code signing is disabled** in `npm run dist`
(`CSC_IDENTITY_AUTO_DISCOVERY=false`). This avoids extracting the
`winCodeSign` package from electron-builder, which fails on Windows without
the symbolic link creation privilege (Developer Mode disabled / non-admin).
The generated `.exe` remains **self-contained** (Node + Chromium bundled); it
will simply be unsigned. To sign later, provide a certificate via
`CSC_LINK` / `CSC_KEY_PASSWORD`.

## To do

Shapes (line / rectangle / ellipse), fill, color picker tool, JPG export,
splash screen. _(Zoom, `.strok`/PNG files, and undo/redo already implemented.)_
