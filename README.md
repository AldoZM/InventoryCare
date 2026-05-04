# InventaryCare

Inventory management system for small and medium businesses. Web application with a Python FastAPI backend and a vanilla JavaScript SPA frontend with a dark theme. Ships as a one-click Windows installer — no technical setup required.

---

## Features

- **Dashboard** with real-time KPIs: total products, locations, items below minimum stock, and today's movements. Auto-refreshes every 60 seconds.
- **Products** — full CRUD with real-time search. Barcode label printing (Code128) for thermal printers.
- **Inventory** — stock by product and location with automatic row highlighting when stock falls below the minimum.
- **Movements** — record incoming (IN), outgoing (OUT), and transfers between locations. Barcode scanner support (auto-select product by SKU on Enter).
- **History** — filterable movement log by date, product, and type. Pagination and CSV export.
- **Users** — account management with admin/operator roles (admin only).
- **Locations** — warehouse location CRUD (admin only).
- **Authentication** via JWT with 8-hour sessions.
- **System tray** — runs in the background, accessible from the Windows system tray.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13 + FastAPI |
| Database | SQLite (built-in, zero configuration) |
| Frontend | HTML/CSS/JS vanilla, ES Modules |
| Auth | JWT (python-jose) + Argon2 (passlib) |
| Launcher | pystray + Pillow (system tray icon) |
| Packaging | PyInstaller + Inno Setup 6 |

---

## Windows Installer (Recommended)

Download `InventaryCare_Setup.exe`, double-click, and follow the installer. The app runs from the system tray — no Python or database setup required.

Default credentials: `admin` / `admin123` — **change after first login**.

---

## Run from Source

### Requirements

- Python 3.11+

### 1. Clone the repository

```bash
git clone https://github.com/AldoZM/InventoryCare.git
cd InventoryCare
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Launch

```bash
python launcher.py
```

The app opens automatically in your default browser at **http://localhost:8080**. A system tray icon lets you reopen the browser or quit cleanly.

The SQLite database is stored automatically at:
- Windows: `%APPDATA%\InventaryCare\inventorycare.db`

### Optional: environment variables

Create a `.env` file to override defaults:

```env
SECRET_KEY=change-this-value-in-production
TOKEN_EXPIRE_HOURS=8
PORT=8080
DB_PATH=C:\custom\path\inventorycare.db
```

---

## Run Tests

```bash
pip install pytest
python -m pytest tests/ -v
```

---

## Build Windows Installer

Requirements: PyInstaller + [Inno Setup 6](https://jrsoftware.org/isdl.php)

```bash
pip install pyinstaller
python -m PyInstaller inventarycare.spec --noconfirm
```

Then compile `installer.iss` with Inno Setup to produce `InventaryCare_Setup.exe`.

---

## Local Network Access

The server listens on `0.0.0.0:8080`, so other PCs on the same network can connect using the host machine's IP:

```
http://192.168.x.x:8080
```

No installation required on client PCs — just a modern browser (Chrome, Firefox, Edge).

---

## Project Structure

```
InventaryCare/
├── app/
│   ├── main.py          # FastAPI app, static files mount
│   ├── auth.py          # JWT, password hashing
│   ├── config.py        # Settings via env vars
│   ├── database.py      # SQLite connection + threading lock
│   ├── migrations.py    # Schema and seed data
│   └── routers/
│       ├── auth.py
│       ├── products.py
│       ├── locations.py
│       ├── inventory.py
│       ├── movements.py
│       ├── reports.py
│       └── users.py
├── www/
│   ├── index.html       # SPA shell
│   ├── favicon.ico      # Browser tab icon
│   ├── css/app.css      # Dark theme variables + styles
│   ├── images/          # Logo and icons
│   └── js/
│       ├── app.js       # Boot, auth guard, sidebar
│       ├── router.js    # Hash router
│       ├── api.js       # Fetch wrapper with JWT
│       ├── session.js   # localStorage session
│       ├── components.js# Modal, toast, confirm, renderTable, badge
│       ├── i18n.js      # Spanish UI strings
│       └── views/       # One module per screen
├── assets/
│   └── icon.ico         # App icon (tray + installer)
├── tests/
│   ├── conftest.py      # TestClient with temp SQLite DB
│   ├── test_auth.py     # Auth endpoint tests
│   └── test_integration.py # Full flow integration tests
├── launcher.py          # System tray + uvicorn launcher
├── inventarycare.spec   # PyInstaller build spec
├── installer.iss        # Inno Setup installer script
└── requirements.txt
```

---

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access: CRUD products, locations, users, movements |
| `operator` | Read-only on products and inventory. Can record movements. |
