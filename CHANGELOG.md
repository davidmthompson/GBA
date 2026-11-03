# Changelog

## Unreleased: Cover art

- **Box art for 180 of 183 games** from [libretro-thumbnails](https://github.com/libretro-thumbnails/Nintendo_-_Game_Boy_Advance)
  (Named_Boxarts), scaled to fit a transparent 256x256 PNG in `covers/` and listed in `covers/manifest.json`.
  `marioland`, `nesgh1` and `pokemongb` have no art and keep the placeholder tile.
- **`npm run fetch:covers`** (`scripts/fetch-covers.mjs` + `scripts/resize-covers.ps1`) re-downloads and resizes
  everything listed in `covers/sources.list` (`id|file|libretro name[|fallback]`).

## 2.0.0 (2026-11-02): Redesign, PWA, controllers, remapping and touch

### Branding (Goal 1)
- **`css/tokens.css`** holds every brand value as CSS custom properties, taken from davidthompson.dev's CSS:
  the navy → black gradient (`#01315f` → `#000`), accent `#1e90ff`, button gradient `#0d6efd` → `#1d4ed8`,
  the dark panel gradient, translucent "glass" surfaces with a 12px blur, Roboto, and 8/12/14/50px radii.
  Dark is the default (like the site); there's also a light theme. Text pairs were checked for WCAG AA.
- **Logo**: `icons/logo-black.png` (original) and a generated **white version** `icons/logo-white.png` for dark
  backgrounds. The page swaps between them with the theme.
- **Icons** generated from the logo on brand navy: `icon-192`, `icon-512`, `icon-maskable-512` (logo inside the
  safe zone), `apple-touch-icon` (180) and `favicon-32` (camera mark only, so it stays legible).
- **"Made by David Thompson"** credit linking to https://davidthompson.dev, in the footer, the About tab and the pause menu.

### UI (Goal 2)
- The library (`index.html`) is rebuilt from `data/games.js` with semantic header/main/footer, a skip link,
  a sticky glass header, a responsive grid (320px phones to 4K), cover art or generated placeholder tiles,
  search with a live result count, a **Downloaded** filter and **Offline** badges.
- The emulator page (`launcher.html`) has a toolbar, an **aspect-correct 3:2 pixel-perfect screen** (the old canvas
  stretched to fill the window), a pause menu (Resume, Save, Controls, Move touch buttons, Settings, Full screen,
  Back to library) and friendly errors for unknown games and failed or offline downloads, plus a download percentage.
- **Settings dialog** (General, Controls, Touch, About), shared by both pages. Tabs can be swiped on touch.
- **Light and dark mode** follow the system, with a header toggle (System → Light → Dark) saved per device.
- Visible hover, focus and pressed states. Focus rings are thick, and stronger again during gamepad navigation.
  `prefers-reduced-motion` is respected.
- **Every screen works with keyboard, mouse, touch and gamepad** (spatial navigation in `input/menu-nav.js`).

### PWA (Goal 3)
- `manifest.webmanifest`: name, short name, description, brand theme and background colours, `standalone`,
  start URL and scope, the 192/512/maskable icons, and a "Controls" shortcut.
- **`sw.js`** (hand-written, see the decisions below):
  - The app shell, the emulator core and the BIOS are precached.
  - Pages are **network-first** with an offline fallback.
  - **ROMs are cached the first time you play them**, so played games work offline. The library is
    several GB, so ROMs aren't precached.
  - Cover art uses stale-while-revalidate, and Google Fonts are cached.
- `scripts/build-sw.mjs` writes the precache list with content hashes into `sw.js`, and the version changes
  whenever any file changes. `npm test` fails if you forget to run it.
- **"Update available, Reload"** toast (and an About-tab button) uses `SKIP_WAITING`.
- **Install app** button via `beforeinstallprompt`, plus an **iOS Safari sheet** (Share → Add to Home Screen).
- iOS and Android meta tags: `apple-touch-icon`, `apple-mobile-web-app-capable`, `mobile-web-app-capable`,
  `apple-mobile-web-app-status-bar-style` (`black-translucent`), `theme-color`, `viewport-fit=cover`.
- `vercel.json` sets no-cache headers on `sw.js`, the HTML and the manifest, and the manifest content type.
- Settings → General shows how many games are stored offline and can remove them (saves are kept).

### Gamepad and remapping (Goal 4)
- New **input action layer** (`input/`). Keyboard, gamepad and touch all produce named actions. The emulator bridge
  (`user_scripts/IodineGBAJoyPadGlueCode.js`, rewritten), the menus and the library only listen for actions.
- Gamepad API, polled every animation frame:
  - Works with standard-mapping Xbox, PlayStation, Switch and generic pads; non-standard pads work on raw indices.
  - Radial stick **dead zone** (configurable). The sticks also drive menus, with auto-repeat.
  - Analog **trigger threshold**. Fast-forward follows trigger pressure when bound to a trigger.
  - **Connect and disconnect toasts**.
  - **Button hints** (Xbox A/B/X/Y, PlayStation ✕/○/□/△, Switch, keyboard keys).
  - Optional **rumble**.
- **Controls screen** lists every action with its keyboard and controller bindings:
  - **Rebind**: "press a key or button…" with a 5 s timeout, cancelled by Esc, holding B or the Cancel button.
  - **Conflict warning with Swap**, **multiple bindings per action** (+), removing a binding, and **reset per action / all**.
  - **Per-controller profiles**, saved in localStorage and loaded on start-up.
  - The whole screen is gamepad-navigable.
- Keyboard bindings now use `KeyboardEvent.code` (layout independent) instead of the deprecated `keyCode`.
  The defaults keep the original keys.

### Touch (Goal 5)
- On-screen **d-pad (8-way, slide between directions), A, B, L, R, Select, Start and a menu button** built on
  Pointer Events with pointer capture and multi-touch. All targets are at least 44px.
- It shows automatically on touch, and hides when a controller connects or a key is pressed. Settings can set it to
  Automatic, Always or Never.
- **Layout editor**: drag groups to move them (saved per orientation), button size, opacity, a **left-handed layout**
  and reset.
- Portrait puts the screen on top and the controls below. Landscape puts the controls on the sides, and short
  landscape screens drop the toolbar. Safe areas are respected (`env(safe-area-inset-*)`).
- A one-time "turn your phone sideways" tip on small portrait screens.
- Browser gestures are suppressed while playing: pull-to-refresh, double-tap zoom, text selection, the long-press
  menu and pinch (`overscroll-behavior`, `touch-action`, `user-select`, `-webkit-touch-callout`, `contextmenu`).
- Optional **haptics** (`navigator.vibrate`) on each press.

### Fixes
- **Saves on mobile**: saves were written only on `unload`, which often doesn't fire on phones or in installed apps.
  They're now also written on `pagehide` and when the tab is hidden (and the emulator already saves on pause).
- Library cards added for **Megaman Battle Network 4 Red Sun** and **Megaman Battle Network 5** (their ROMs existed,
  but they had no card).
- **Four ROMs that weren't playable are now mapped**, identified from their ROM headers: `ff4` Final Fantasy IV Advance,
  `thu` Tony Hawk's Underground, `thu2` Tony Hawk's Underground 2, and `nfrp` **"Pokemon FireRed (nfrp hack)"**.
  The header only says FireRed. ⚠️ **David: please rename `nfrp`** in `data/games.js` to the hack's real name.
- The missing `Advance Wars 2.png` cover and broken images now fall back to a placeholder tile.
- The footer wiki link pointed at another person's repo (`Browncha023/GBA`). It now goes to this repo, and controls
  help lives in the app.
- Audio contexts are resumed on the first tap or key press (browser autoplay policies).

### Under the hood
- The game list moved from `IodineGBACoreGlueCode.js` into **`data/games.js`**, shared by both pages, with a test
  that every entry has a ROM and every ROM has an entry.
- `package.json` has scripts only (no dependencies): `serve`, `build:sw`, `test`.
- Tests (`node:test`, 33 cases) cover:
  - bindings: defaults, conflicts, swap, multiple bindings, reset and persistence with a fake localStorage;
  - the input manager: modes, release on mode change, capture, analog;
  - spatial navigation and controller glyph detection;
  - the manifest and icon sizes, precache completeness, and the catalogue.
- The library can read an optional **`covers/manifest.json`** (`{ "<id>": "covers/<file>.png" }`) for box art.
  Covers are lazy-loaded with alt text, fall back to the placeholder, and are runtime-cached by the service worker.

### Decisions on ambiguous points
- **No Workbox / no framework**: the project has no bundler. Workbox would have needed a CDN or a vendored copy,
  so the service worker is hand-written and uses Workbox-style strategies.
- **`display: standalone`** rather than fullscreen, so the status bar and the system back gesture stay available.
  The pause menu has a Full screen option.
- **Default gamepad layout is label-based**: Xbox A = GBA A, Xbox B = GBA B. On PlayStation that's ✕ = A and ○ = B.
  On Switch it follows button positions (B = GBA A). L/R are on both bumpers and triggers.
  **Menu** is right-stick click or Home, because Start belongs to the game. All of this can be remapped.
- **Fast-forward** defaults to holding Space. There's no controller default, because the triggers are L/R.
  Binding a trigger to it gives analog speed.
- **Esc always cancels** while listening for a new binding, so Esc itself can't be bound to another action.
- **Press Start 2P** is kept only for the "GBA" wordmark and placeholder tiles, as a retro accent. Everything else uses
  the brand's Roboto. The site names Roboto but doesn't load it, so this app loads it from Google Fonts.
- **iOS audio**: the original code turns audio off on iPhone and iPad. That's unchanged.
- `Binaries/gba.png` and `Binaries/here.png` are no longer used. I left them in place in case anything links to them.
- The commits are grouped by goal, but the goals depend on each other (for example, the library page imports the PWA
  module). Only the final commit is meant to be run.
