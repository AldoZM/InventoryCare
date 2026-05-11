# InventaryCare

Inventory management system for small and medium businesses. Web application with a Python FastAPI backend and a vanilla JavaScript SPA frontend with a dark theme. Ships as a one-click Windows installer — no technical setup required.

---

## Features

- **Dashboard** with real-time KPIs: total products, locations, items below minimum stock, and today's movements. Auto-refreshes every 60 seconds. Stock and movement charts.
- **Products** — full CRUD with real-time search, price field, and barcode label printing (Code128) for thermal printers.
- **Camera scanning** — scan product barcodes directly from the browser camera (desktop or phone). OCR tab for reading text from labels. Works offline (html5-qrcode bundled).
- **Inventory** — stock by product and location. Rows highlight red when stock falls below the minimum. Category filter.
- **Movements** — record incoming (IN), outgoing (OUT), and transfers between locations. Barcode scanner support (auto-select product by SKU on Enter).
- **History** — filterable movement log by date, product, and type. Date shortcuts. Pagination and CSV export.
- **Excel export** — download full inventory report as `.xlsx` from the dashboard.
- **Backup** — one-click SQLite database download from Settings (admin only).
- **Users** — account management with admin/operator roles (admin only). Password change per user.
- **Locations** — warehouse location CRUD (admin only).
- **Authentication** via JWT with 8-hour sessions.
- **HTTPS + LAN access** — self-signed certificate generated on first launch. Phones on the same Wi-Fi network can access the app and use the camera scanner. Settings page shows a QR code to open the app on any device without typing the URL.
- **System tray** — runs in the background, accessible from the Windows system tray. Shows local network address.
- **First-run tutorial** — step-by-step onboarding with spotlight per section. Per-user, skippable, never repeats. Adapted for mobile screens.
- **Mobile responsive** — full UI works on smartphones and tablets.
- **Desktop shortcut** — offered as a browser modal on first launch.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13 + FastAPI |
| Database | SQLite (built-in, zero configuration) |
| Frontend | HTML/CSS/JS vanilla, ES Modules |
| Auth | JWT (python-jose) + Argon2 (passlib) |
| SSL | cryptography (self-signed cert generation) |
| Excel export | openpyxl |
| Launcher | pystray + Pillow (system tray icon) |
| Barcode scanning | html5-qrcode (bundled, offline) |
| QR generation | qrcode.min.js (bundled, offline) |
| Packaging | PyInstaller + Inno Setup 6 |

---

## Windows Installer (Recommended)

Download `InventaryCare_Setup.exe`, double-click, and follow the installer. The app runs from the system tray — no Python or database setup required.

Default credentials: `admin` / `admin123` — **change after first login**.

The app opens at **https://localhost:8080**. On first launch your browser will show a "connection not private" warning — this is expected for the self-signed certificate. Click **Advanced → Proceed** once and it won't appear again.

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

The app opens automatically in your default browser at **https://localhost:8080**. A system tray icon lets you reopen the browser or quit cleanly.

The SQLite database and SSL certificate are stored automatically at:
- Windows: `%APPDATA%\InventaryCare\`

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

```powershell
# Kill the running app first if open
Stop-Process -Name "InventaryCare" -Force -ErrorAction SilentlyContinue

pip install pyinstaller
python -m PyInstaller inventarycare.spec --noconfirm
```

Output: `dist\InventaryCare\InventaryCare.exe`

Then compile `installer.iss` with Inno Setup to produce `InventaryCare_Setup.exe`.

---

## Local Network Access (Phone / Tablet)

The server listens on `0.0.0.0:8080` with HTTPS. Any device on the same Wi-Fi network can connect:

```
https://192.168.x.x:8080
```

The easiest way: open **Settings → Acceso desde teléfono** on the PC and scan the QR code with your phone camera.

> **Note:** Phones will show a "connection not private" warning on first visit. Tap **Advanced → Proceed** once. After that the app works normally, including the camera scanner.

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
│       ├── users.py
│       ├── backup.py
│       ├── export.py
│       ├── shortcut.py
│       ├── scan.py      # Barcode/OCR scan endpoints
│       └── system.py   # LAN URL endpoint
├── www/
│   ├── index.html       # SPA shell
│   ├── favicon.ico
│   ├── css/app.css      # Dark theme variables + styles
│   ├── images/
│   └── js/
│       ├── app.js       # Boot, auth guard, sidebar
│       ├── router.js    # Hash router
│       ├── api.js       # Fetch wrapper with JWT
│       ├── session.js   # localStorage session
│       ├── components.js
│       ├── i18n.js      # Spanish UI strings
│       ├── tutorial.js  # First-run onboarding
│       ├── scan.js      # Camera scan modal
│       ├── html5-qrcode.min.js  # Bundled barcode scanner
│       ├── qrcode.min.js        # Bundled QR generator
│       └── views/       # One module per screen
├── assets/
│   └── icon.ico
├── tests/
│   ├── conftest.py
│   ├── test_auth.py
│   ├── test_integration.py
│   ├── test_scan.py
│   ├── test_system.py
│   └── test_launcher.py
├── launcher.py          # System tray + uvicorn HTTPS launcher
├── inventarycare.spec   # PyInstaller build spec
├── installer.iss        # Inno Setup installer script
└── requirements.txt
```

---

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access: CRUD products, locations, users, movements, backup, export |
| `operator` | Read-only on products and inventory. Can record movements. |
