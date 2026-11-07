# Shuriken

**An interactive application launcher that lives on your desktop wallpaper.**

A three-bladed shuriken rests at the center of your desktop. Hover one of its blades and your apps fan out around it in an orbit — click to launch, right-click to manage. Built as a [Lively Wallpaper](https://www.rocksdanister.com/lively/) web wallpaper with a small local companion service that gives the browser real powers: reading your installed applications, extracting their icons, and launching them.

```
        ╭─────────────╮
        │   SHURIKEN  │
        │  ◜◠ above ◞ │   ← hover a blade
        │ ◜ left  right◝ │   ← apps orbit out
        │   ◟ below ◠ ◟ │   ← click to launch
        ╰─────────────╯
```

---

## Features

- **Interactive launcher wallpaper** — three spring-animated blades (decks), each fanning out its apps in an *arc*, *fan*, or *spiral* arrangement
- **Files & folders too** — pin any file or folder from disk into a deck via the built-in picker (browse drives, quick links, or paste a path); icons/thumbnails are extracted per item and clicks open them with their default association
- **Hold-to-shutdown power button** — optionally, holding the hollow center of the logo for 1.5s (with a filling ring) runs a registered power-off script; releasing early cancels, so stray clicks are harmless
- **Automatic app discovery** — Start Menu, desktop shortcuts, Store/UWP apps, and registry entries, scanned by the companion service with cached high-resolution (256px) icon extraction, including Store-app package logos
- **Launch anything** — apps start through the companion (no shell, trusted-ids only); Store apps launch via `shell:AppsFolder`
- **Thermal mode sync** — on Lenovo LOQ/Legion laptops, the logo mirrors the Fn+Q power mode like the power-button LED: white · balance, red · performance, blue · quiet (driven by real WMI state, so it also tracks LegionZone/Vantage changes)
- **Panel fill modes** — outline only, hovered blade fills, or the whole shuriken filled with the accent color
- **Custom accent colors** — pick any hex per mode (picker + hex field in Settings → Appearance)
- **Rich per-deck management** — custom deck names, per-app icon overrides (30+ built-in glyphs or custom images), favorites, hide/reorder apps, move apps between decks
- **Appearance controls** — icon size, animation speed, connector filaments, monochrome icons (color on hover), labels on hover/always, favorites-first
- **Persistent everywhere** — settings sync between the wallpaper and the companion and survive reboots, reinstalls, and cache wipes
- **Self-contained wallpaper build** — the entire UI compiles to a single `index.html` (CSS/JS inlined), served fresh from the companion

## Architecture

```
┌─────────────────────────────┐         ┌──────────────────────────────┐
│  Wallpaper (WebView2/CEF)   │  HTTP   │  Companion (Node + Express)  │
│  React + Vite + Tailwind    │ ──────► │  127.0.0.1:47811             │
│  loaded from the companion: │         │  · app scan (PowerShell)     │
│  /wallpaper                 │ ◄────── │  · icon extraction + serving │
│                             │         │  · app launch / reveal       │
└─────────────────────────────┘         │  · config persistence        │
                                        └──────────────────────────────┘
```

The wallpaper is a static page and cannot touch the filesystem by itself — the companion does all native work and listens on loopback only.

> **Why the wallpaper is served by the companion:** Lively renders local wallpapers from `file://`, and modern Chromium/Edge (WebView2) blocks network requests from `file://` pages to `http://127.0.0.1` (Local Network Access protection). Serving the wallpaper from `http://127.0.0.1:47811/wallpaper` keeps the page and API on the same loopback origin, which is exempt — and means rebuilds go live without re-importing anything into Lively.

## Requirements

- **Windows** 10 / 11
- **Node.js** 18+ (companion service)
- **[Lively Wallpaper](https://www.rocksdanister.com/lively/)** for the desktop experience (any recent version)

## Setup

### 1. Install dependencies

```bash
# wallpaper web app
npm install

# companion service
cd companion
npm install
```

### 2. Start the companion

```bash
cd companion
npm start                          # runs in a console on 127.0.0.1:47811
```

First start performs an application scan and caches icons to `%APPDATA%\ShurikenWallpaper\icons\`.

**Auto-start with Windows (recommended):**

```bash
npm run install-autostart          # adds a hidden launcher to shell:startup
npm run uninstall-autostart        # undo
```

**Thermal mode sync — Lenovo LOQ / Legion only (optional):**

```bash
npm run install-thermal            # one UAC prompt: registers the ShurikenThermalWatch task
npm run uninstall-thermal          # undo
```

This installs a hidden elevated scheduled task that reads the real power mode from the Lenovo GameZone WMI provider (`LENOVO_GAMEZONE_DATA.GetSmartFanMode` + `LENOVO_GAMEZONE_THERMAL_MODE_EVENT` push events, which require admin rights) and writes it to a state file the companion serves at `/api/thermal`. The wallpaper then mirrors the mode on the logo — toggled any time from **Settings → Appearance → Thermal mode sync**.

### 3. Add the wallpaper in Lively

1. Build the web app (from the project root):
   ```bash
   npm run build
   ```
2. In Lively: **Add Wallpaper → Web (URL)** and enter:
   ```
   http://127.0.0.1:47811/wallpaper
   ```
3. For interactivity, in Lively **Settings → Wallpaper**:
   - **Wallpaper Input** → **Mouse** (or Keyboard + Mouse)
   - Playback → **Interactive**
   - Turn off **pause on focus** if hover stops working after clicking the desktop

> A zip import (`shuriken-wallpaper.zip`) also works for offline/file-based setups, but the URL method is recommended for the reasons above.

### 4. Development

```bash
npm run dev                        # Vite dev server on http://localhost:5173
```

The dev server talks to the same companion, so scans/launches work during development. Settings changed in either origin sync through the companion (last change wins).

## Usage

| Action | Result |
|---|---|
| Hover a blade | That deck's apps orbit out around the logo |
| Click an app | Launches it (deck closes on success) |
| Right-click a blade | Open that deck's settings |
| Right-click an app | Favorites, move between decks, reveal in Explorer, remove, change icon |
| **Pin file or folder** (Decks / Library tab) | Browse drives & quick links or paste a path; picked items get their shell icon extracted and join the deck like apps |
| **Hold the logo center** (optional) | Fill the ring for 1.5s → runs the registered power-off script; release early to cancel |
| Move the mouse | A gear button appears bottom-right |
| `Ctrl+Alt+N` (configurable) | Open settings |

## Configuration & data

All data lives in **`%APPDATA%\ShurikenWallpaper`**:

| File / dir | Purpose |
|---|---|
| `config.json` | Decks, assignments, appearance, overrides (synced from the wallpaper) |
| `apps.json` | Detected applications from the last scan |
| `pins.json` | Pinned files & folders (registered paths, keyed by path hash) |
| `power.json` | Path of the registered power-off script (`.bat`/`.cmd`) |
| `icons/*.png` | Extracted application icons (cached by app id) |

The wallpaper also mirrors the config in its own localStorage and restores whichever copy is newer on load, so nothing is lost across reboots or cache clears. Data from the project's previous name (`%APPDATA%\NexusWallpaper`) is migrated automatically on first run.

### Companion environment variables

| Variable | Default | Purpose |
|---|---|---|
| `SHURIKEN_PORT` | `47811` | HTTP port (always binds `127.0.0.1`) |
| `SHURIKEN_ALLOWED_ORIGINS` | — | Comma-separated extra allowed origins |
| `SHURIKEN_ALLOW_ANY_ORIGIN` | `0` | Set to `1` to disable the origin allowlist |

## API

| Method | Path | Purpose |
|---|---|---|
| GET | `/wallpaper` | Serves the built wallpaper (`dist/index.html`) |
| GET | `/api/system/status` | Health check |
| GET | `/api/apps` | Detected applications + pinned files/folders |
| POST | `/api/apps/scan` | Rescan (`{ "forceIcons": true }` to re-extract icons) |
| GET | `/api/apps/:id` | App or pin details |
| POST | `/api/apps/launch` | `{ "id" }` launches a registered app — or opens a pinned file/folder with its default association |
| POST | `/api/apps/reveal` | `{ "id" }` opens Explorer at the app's location |
| GET | `/api/icons/:id` | Extracted icon PNG |
| POST | `/api/pins/resolve` | `{ "paths": [...] }` — validate, register and extract icons for files/folders; returns per-path results |
| POST | `/api/pins/remove` | `{ "id" }` — forget a pin |
| GET | `/api/fs/roots` | Drives (with volume labels) + quick links for the picker |
| GET | `/api/fs/list?dir=…` | Directory listing (folders first) for the picker |
| GET | `/api/power` | Registered power-off script (`{ script, configured }`) |
| POST | `/api/power/script` | `{ "path" }` — register/clear the `.bat`/`.cmd` the power action runs |
| POST | `/api/power/off` | Trigger the power action (`{ "dryRun": true }` returns the path without executing) |
| GET | `/api/thermal` | Power mode (`quiet` / `balance` / `performance`), from the thermal watcher |
| GET | `/api/thermal/stream` | Same, as Server-Sent Events — pushed the moment the mode changes |
| GET/PUT | `/api/config` | Saved wallpaper configuration |

## Security

- Binds to `127.0.0.1` only; requests whose `Host` is not localhost are rejected (blocks DNS rebinding)
- Origin allowlist: `null`/`file://` (Lively), `localhost`, `127.0.0.1` — extend with `SHURIKEN_ALLOWED_ORIGINS`
- `POST`/`PUT` require the `X-Shuriken-Client` header, which forces a CORS preflight and blocks drive-by requests from random websites
- Launch accepts only the 12-character hex id from scan results — no paths or commands are accepted and no shell is used: shortcuts start via `explorer.exe <shortcut>`, executables via direct `spawn`
- Store apps launch through the documented `shell:AppsFolder` mechanism
- Pinned files/folders are the one place paths enter the system: only during `POST /api/pins/resolve`, where each path must exist on disk and is canonicalized before registration. Launch/reveal still accept ids only, and `explorer.exe` opens the registered path with the default Windows association — no shell, no arbitrary commands
- The power action is the one exception that runs a command: the companion executes only the single `.bat`/`.cmd` registered in `power.json` (validated to exist, via `POST /api/power/script`) through `cmd.exe /c`. The wallpaper can only say "trigger" or "dry-run" — it cannot name a script at trigger time, and triggering requires the same CSRF-preflighted header as every other mutation

## Troubleshooting

| Symptom | Fix |
|---|---|
| **Offline** badge in the corner | Companion isn't running. `cd companion && npm start`, or reinstall autostart. Verify: `curl http://127.0.0.1:47811/api/system/status` |
| Offline **only in Lively** (fine in browser) | You added the wallpaper as a **file/zip** — re-add it as the URL `http://127.0.0.1:47811/wallpaper` (WebView2 blocks `file:// → localhost` requests) |
| Hover stops after clicking the desktop | Disable **pause on focus** in Lively's settings |
| An app has no icon / generic monogram | Open settings → **Rescan**; if still missing, **Force icon refresh** (the app's package may not expose a logo, e.g. Copilot) |
| A pinned file/folder has no icon | It shows a folder glyph / monogram fallback — unpin and pin it again to re-extract |
| Pinned item says "no longer exists" | The file or folder was deleted or moved — unpin it and pin the new path |
| Icons look blurry / low-res | Open settings → **Rescan** with force icon refresh — icons re-extract at 256px (old 32px sources get re-cached automatically) |
| Logo doesn't react to Fn+Q | `cd companion && npm run install-thermal` (accept the UAC prompt), then confirm `curl http://127.0.0.1:47811/api/thermal` reports `"supported": true` |
| Thermal mode colors look swapped | The LED↔mode mapping lives in `src/lib/thermal.ts` — adjust and rebuild |
| Launcher blocks clicks in a game | Lively pauses wallpapers over fullscreen apps by design |

## Project structure

```
├── index.html               # Vite entry
├── package.json             # wallpaper web app (React 19, Vite 7, Tailwind 4)
├── vite.config.ts           # single-file build config
├── public/LivelyInfo.json   # Lively wallpaper metadata
├── src/
│   ├── App.tsx              # layout, chrome, toasts
│   ├── components/          # Logo, Reveal (deck fan-out), Settings, Dialogs, ContextMenu, AppIcon, FilePicker
│   ├── hooks/useReveal.ts   # hover/reveal state machine
│   └── lib/                 # geometry math, store (state + persistence), api client, defaults
├── dist/                    # production build (gitignored)
└── companion/
    ├── server.mjs           # Express API on 127.0.0.1:47811
    ├── scan.ps1             # app discovery + icon extraction
    ├── pin-icon.ps1         # icon/thumbnail extraction for pinned files & folders
    ├── thermal-watch.ps1    # elevated WMI watcher for Fn+Q power mode
    ├── install-thermal.ps1 / uninstall-thermal.ps1  # scheduled-task installers
    ├── install-autostart.ps1 / uninstall-autostart.ps1
    └── start-hidden.vbs     # windowless launcher used by autostart
```

## Tech stack

React 19 · Vite 7 · Tailwind CSS 4 · Framer Motion · TypeScript · Express · PowerShell (scanner) · lucide-react icons
