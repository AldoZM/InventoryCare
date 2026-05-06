# InventaryCare — SQLite Migration + Windows Installer Design Spec
**Date:** 2026-05-04
**Status:** Approved

---

## Overview

Two sequential deliverables:
1. Migrate backend from PostgreSQL to SQLite (no external DB server required)
2. Package the app as a one-click Windows installer (.exe) with a system tray launcher

Target user: non-technical. Zero terminal interaction after installation.

---

## Part 1: SQLite Migration

### Goal

Replace psycopg2 + PostgreSQL with Python's built-in `sqlite3`. The database file lives in `%APPDATA%\InventaryCare\inventorycare.db` so data survives reinstallation.

### Files Changed

| File | Change |
|---|---|
| `app/database.py` | Full rewrite — sqlite3, threading.Lock for write safety, AppData path |
| `app/migrations.py` | Adapt schema + seed for SQLite syntax |
| `app/config.py` | Remove PostgreSQL vars, add DB_PATH |
| `app/routers/*.py` | All 7 routers: `%s` → `?`, row dicts via `row_factory` |
| `requirements.txt` | Remove psycopg2-binary, add pystray, Pillow |
| `.env` | No longer needed (no secrets to configure) |

### SQLite Schema Adaptations

| PostgreSQL | SQLite |
|---|---|
| `SERIAL PRIMARY KEY` | `INTEGER PRIMARY KEY` |
| `TIMESTAMPTZ NOT NULL DEFAULT NOW()` | `TEXT NOT NULL DEFAULT (datetime('now'))` |
| `%s` placeholder | `?` placeholder |
| `cursor.fetchone()[0]` | same |
| `ThreadedConnectionPool` | single connection + `threading.Lock()` |

### Database Location

```
%APPDATA%\InventaryCare\inventorycare.db
```

Created automatically on first run. Directory created if it doesn't exist.

### Concurrency

SQLite with `check_same_thread=False` + a `threading.Lock()` wrapping all write operations. Reads are concurrent. Safe for 2-3 simultaneous users.

### Row Factory

Use `conn.row_factory = sqlite3.Row` so rows behave like dicts — minimal changes to router code.

---

## Part 2: Windows Installer

### Components

| File | Purpose |
|---|---|
| `launcher.py` | Tray icon app — starts uvicorn, opens browser, system tray menu |
| `assets/icon.ico` | App icon (placeholder until user provides final logo) |
| `inventarycare.spec` | PyInstaller spec — bundles app + www/ + dependencies |
| `installer.iss` | Inno Setup script — creates Setup.exe |

### launcher.py Behavior

1. On start: launch uvicorn in a background thread (port 8080)
2. Wait ~1.5s for server to be ready, then open `http://localhost:8080` in default browser
3. Show system tray icon with menu:
   - **Abrir InventaryCare** → opens browser
   - **Salir** → stops server, removes tray icon, exits

No window. No terminal. Completely silent background process.

### PyInstaller Packaging

- Entry point: `launcher.py`
- One-folder mode (not one-file — faster startup, no extraction on each run)
- Includes: `www/` directory, `app/` package, `assets/icon.ico`
- Hidden imports: `uvicorn`, `fastapi`, `pystray`, `PIL`
- Output: `dist/InventaryCare/`

### Inno Setup Installer

**Installer behavior:**
- Default install path: `C:\Program Files\InventaryCare` (user can change)
- Creates desktop shortcut: "InventaryCare"
- Adds to Windows startup (auto-launch on PC boot) via registry key:
  `HKCU\Software\Microsoft\Windows\CurrentVersion\Run`
- Includes uninstaller (removes app + shortcuts + registry key, does NOT delete database in AppData)
- No questions beyond install path — just Next → Next → Install → Finish

**Installer pages (in order):**
1. Welcome
2. Install location (default: `C:\Program Files\InventaryCare`)
3. Ready to install
4. Installing (progress bar)
5. Finish (checkbox: "Abrir InventaryCare ahora")

### Icon Placeholder

A simple colored square `.ico` is used as placeholder. When the user provides the final logo (dropped in `ClaudeSS/` folder), it replaces `assets/icon.ico` and the installer is rebuilt.

---

## Build Process (developer only)

```bash
# 1. Install build tools (once)
pip install pyinstaller
# Install Inno Setup from https://jrsoftware.org/isinfo.php

# 2. Bundle app
pyinstaller inventarycare.spec

# 3. Build installer
iscc installer.iss

# Output: Output/InventaryCare_Setup.exe
```

---

## Data Safety

- Database at `%APPDATA%\InventaryCare\` is NOT touched by uninstaller
- Reinstalling or updating the app never deletes user data
- Backup = copy `inventorycare.db` to a safe location
