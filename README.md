# 🎮 GBA by David Thompson

A free, browser-based Game Boy Advance player with a library of **180+ games**. It installs as an
app (PWA), works offline, and plays with a **keyboard, a game controller or touch**.

**🚀 [Play now at gba.davidthompson.dev](https://gba.davidthompson.dev/)** · Made by [David Thompson](https://davidthompson.dev)

---

## ✨ Features

- **Big library**: 183 Game Boy Advance titles, searchable, with a "Downloaded" filter.
- **Installable app**: "Install app" button (Chrome, Edge, Android) and Add to Home Screen instructions for iPhone and iPad.
- **Offline**: the app shell is cached, and each game you play is saved for offline use.
- **Controllers**: Xbox, PlayStation, Switch Pro and generic pads, with matching button hints, analog sticks and optional rumble.
- **Full remapping**: rebind every action for keyboard and controller (per controller if you like), with conflict warnings and swap.
- **Touch controls**: on-screen d-pad and buttons on phones and tablets. You can move and resize them and switch to a left-handed layout.
- **Saves**: kept on your device (localStorage) and written automatically when you pause or leave.
- **Light and dark mode**: follows your system setting, with a manual toggle.

## 🛠️ Run it locally

The site is static HTML, CSS and JavaScript (ES modules) with **no framework and no npm dependencies**.
You need [Node.js](https://nodejs.org/) 20 or newer only for the helper scripts.

```bash
npm run serve        # http://localhost:8080  (PORT=3000 npm run serve to change the port)
npm test             # unit tests + checks that sw.js is up to date
npm run build:sw     # regenerate the service worker precache list (run after changing any app file)
```

Opening `index.html` directly from disk (`file://`) won't work. The games are downloaded over HTTP, and
service workers need `http://localhost` or HTTPS.

### "Build" = `npm run build:sw`

Nothing gets bundled. The only build step writes the list of precached files, with content hashes, into
`sw.js`. **Run `npm run build:sw` and commit `sw.js` whenever you change an HTML, CSS, JS or icon file.**
Otherwise installed apps won't see the update. `npm test` fails when `sw.js` is out of date.

## 🚀 Deploy

The site is hosted on **Vercel** as a static site (no build command; the output directory is the repository root).
`vercel.json` only adds headers: `sw.js` and the HTML pages are always revalidated, and the manifest is served with
the right content type.

1. `npm run build:sw && npm test`
2. Commit and push. Vercel deploys the branch.
3. Users with the app open get an **"Update available, Reload"** prompt.

**HTTPS is required** for the PWA features (service worker, install prompt). Vercel and GitHub Pages
both serve HTTPS. Locally, `http://localhost` also counts as secure.

## 🕹️ Controls

| GBA / action | Keyboard (default) | Controller (default, standard layout) |
| --- | --- | --- |
| D-pad | Arrow keys | D-pad or left stick |
| A / B | X / Z | A / B (✕ / ○ on PlayStation, B / A on Switch) |
| L / R | A / S | LB / RB or LT / RT |
| Start / Select | Enter / Shift | Menu / View |
| Fast-forward (hold) | Space | not set (bind a trigger for analog speed) |
| Speed ±10% | 3 / 4 | not set |
| Volume up / down | R / D | not set |
| Menu (pause, settings) | Esc | Right-stick click or Home |
| Menus: confirm / back | Enter or Space / Backspace | A / B |

All of these can be changed under **Settings → Controls**.

## 🧩 How input works

All input goes through one action layer in `input/`:

```
keyboard.js ─┐
gamepad.js  ─┼─► InputManager (actions.js) ─► "actiondown" / "actionup" / "analog" events
touch-overlay.js ┘        ▲                          │
                 bindings.js (which key/button → which action)
                                                     ├─► user_scripts/IodineGBAJoyPadGlueCode.js → emulator
                                                     ├─► menu-nav.js (focus navigation in menus)
                                                     └─► ui/launcher.js, ui/library.js (menu, hotkeys)
```

- **Actions** (`input/actions.js`): `up/down/left/right`, `a/b/l/r/start/select`, `fast_forward`, `speed_up/down`,
  `volume_up/down`, `menu`, `confirm`, `back`. Each has a scope: `game` (only while playing), `menu` (only in menus)
  or `both`. App code listens only for actions, never for raw keys or buttons.
- **Bindings** (`input/bindings.js`): keyboard bindings use `KeyboardEvent.code` (`"KeyX"`), so they follow key
  positions on any layout. Gamepad bindings use the standard layout: `"b0"` is button 0 and `"a1-"` is axis 1 pushed up.
  An action can have several bindings. A binding conflicts only with actions whose scopes overlap, so Enter can be
  Start in game and Confirm in menus.
- **Storage**: `localStorage["gba.bindings.v1"]` stores only changed actions, for the keyboard and per controller
  profile (`"*"` = all controllers, or a specific `Gamepad.id`). Settings live in `localStorage["gba.settings.v1"]`.
- **Gamepad** (`input/gamepad.js`): uses `gamepadconnected`/`gamepaddisconnected` and polls `navigator.getGamepads()`
  in a `requestAnimationFrame` loop. It has a radial stick dead zone, an analog trigger threshold, menu auto-repeat
  and optional `vibrationActuator` rumble. Pads without the standard mapping still work on raw indices and can be remapped.
- **Touch** (`input/touch-overlay.js`): Pointer Events with pointer capture and multi-touch. You can slide across the
  d-pad and between buttons. The overlay shows automatically on touch and hides when a controller or key is used.
- **Remapping** (`input/remap-ui.js`): Settings → Controls. **Rebind** waits for a key or button (5 s timeout; Esc or
  holding B cancels). **+** adds an extra binding, selecting a binding removes it, and ↺ resets an action.
  If the button is taken, you're offered a **Swap**.

## 📁 Project layout

| Path | What it is |
| --- | --- |
| `index.html`, `ui/library.js`, `css/library.css` | Game library |
| `launcher.html`, `ui/launcher.js`, `user_css/main.css` | Emulator page, pause menu, touch layout editor |
| `css/tokens.css` | **Brand tokens** (colours, fonts, spacing, radii) for light and dark |
| `css/app.css` | Shared components (buttons, dialogs, tabs, toasts, remap screen) |
| `ui/` | App start-up, settings dialog, dialogs, theme, toasts, button hints |
| `input/` | Input action layer (see above) |
| `pwa/`, `sw.js`, `manifest.webmanifest` | Service worker registration, update prompt, install button |
| `data/games.js` | Game catalogue shared by both pages |
| `icons/` | Logo (black and white) and app icons |
| `IodineGBA/`, `user_scripts/` | Emulator core and its glue code |
| `scripts/` | `build-sw.mjs`, `serve.mjs`, `fetch-covers.mjs` (Node built-ins only) |
| `covers/` | 256x256 box art, `manifest.json` and `sources.list` (libretro names) |
| `tests/` | `node:test` unit tests |

## ➕ Adding a game

1. Copy the ROM to `Binaries/<id>.gba`.
2. Add `{"id": "<id>", "title": "Full Title", "short": "Card title"}` to `data/games.js`
   (optionally `"cover": "path.png"`, or add a line to `covers/sources.list` and run `npm run fetch:covers`).
3. `npm test` (it checks every entry has a ROM). The ROM itself isn't precached, so `build:sw` is only needed
   because `data/games.js` changed.

## 🤝 Credits

- **Emulator core**: [IodineGBA](https://github.com/taisel/IodineGBA) by Grant Galitz (MIT) · audio by XAudioJS
- **Original site and engine setup**: Keyz
- **Box art**: [libretro-thumbnails](https://github.com/libretro-thumbnails/Nintendo_-_Game_Boy_Advance) (Named_Boxarts), resized to 256x256
- **Design, PWA, input and touch**: [David Thompson](https://davidthompson.dev)

---
*Disclaimer: This project is for educational and entertainment purposes. Please only play games you own.*
