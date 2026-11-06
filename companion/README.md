# Shuriken — Companion Service

The wallpaper is a static web page, so it can't read the filesystem or start programs by itself.
This small local Node.js + Express service handles both. It listens on **127.0.0.1:47811** only.

## Install
1. Install Node.js 18+.
2. `cd companion && npm install`
3. `npm start` to run it in a console, **or** `npm run install-autostart` to start it with Windows
   (adds a hidden launcher to `shell:startup`). Undo with `npm run uninstall-autostart`.

## Wallpaper (Lively)
1. In the project root, run `npm run build`. `dist/` holds `index.html` and `LivelyInfo.json`.
2. In Lively choose **Add Wallpaper → select `dist/index.html`** (or zip the `dist` folder).
3. In Lively **Settings → Wallpaper → Wallpaper Input** pick **Mouse** (or Keyboard + Mouse).
   Use the **Interactive** playback mode so clicks reach the wallpaper. Turn off "pause on focus"
   if hover stops after you click the desktop.
4. Move the mouse to show the gear button in the lower right, or press **Ctrl+Alt+N**, to open settings.

## API
| Method | Path | Purpose |
|---|---|---|
| GET  | /wallpaper | Serves the built wallpaper (`dist/index.html`). Add it in Lively as a **Web/URL** wallpaper — loopback origins are exempt from the browser Local-Network-Access blocks that affect `file://` pages. |
| GET  | /api/system/status | Health check |
| GET  | /api/apps | Detected applications |
| POST | /api/apps/scan | Rescan (assignments live in the wallpaper config, so nothing is lost) |
| GET  | /api/apps/:id | App details |
| POST | /api/apps/launch | `{ id }` launches a registered app |
| POST | /api/apps/reveal | `{ id }` opens Explorer at the app's location |
| GET  | /api/icons/:id | Extracted icon PNG |
| GET/PUT | /api/config | Saved wallpaper configuration |

## Security
* Binds to `127.0.0.1`. Requests whose `Host` isn't localhost are rejected (blocks DNS rebinding).
* Allowed origins: `null`/`file://` (Lively), `localhost`, `127.0.0.1`. Add more with `SHURIKEN_ALLOWED_ORIGINS`.
* POST/PUT requests need the `X-Shuriken-Client` header, which triggers a CORS preflight.
* Launch takes only a 12-character hex id from the scan results. No paths or commands are accepted
  and no shell is used: apps start through `explorer.exe <shortcut>` or a direct `spawn`.

Data is stored in `%APPDATA%\ShurikenWallpaper` (apps.json, config.json, icons/). Existing `%APPDATA%\NexusWallpaper` data is migrated automatically on first run.
