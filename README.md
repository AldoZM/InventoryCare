# InventaryCare

Inventory management system for small and medium businesses. Web application with a Python FastAPI backend and a vanilla JavaScript SPA frontend with a dark theme.

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

---

## Tech Stack

| Layer | Technology |
|---|---|
| Backend | Python 3.13 + FastAPI |
| Database | PostgreSQL |
| Frontend | HTML/CSS/JS vanilla, ES Modules |
| Auth | JWT (python-jose) + Argon2 (passlib) |
| DB driver | psycopg2-binary |

---

## Requirements

- Python 3.11+
- PostgreSQL 13+

---

## Setup

### 1. Clone the repository

```bash
git clone https://github.com/AldoZM/InventoryCare.git
cd InventoryCare
```

### 2. Create virtual environment and install dependencies

```bash
python -m venv venv

# Windows
venv\Scripts\activate

# Linux/Mac
source venv/bin/activate

pip install -r requirements.txt
```

### 3. Configure the database

Create a user and database in PostgreSQL:

```sql
CREATE USER inventorycare WITH PASSWORD 'your_password';
ALTER USER inventorycare CREATEDB;
```

### 4. Create a `.env` file

```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=inventorycare
DB_USER=inventorycare
DB_PASSWORD=your_password
SECRET_KEY=change-this-value-in-production
TOKEN_EXPIRE_HOURS=8
PORT=8080
```

### 5. Start the server

```bash
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Open in your browser: **http://localhost:8080**

Default credentials: `admin` / `admin123` — **change after first login**.

---

## Local Network Access

The server listens on `0.0.0.0:8080`, so other PCs on the same network can access it using the host machine's IP:

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
│   ├── database.py      # PostgreSQL connection pool
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
│   ├── css/app.css      # Dark theme variables + styles
│   └── js/
│       ├── app.js       # Boot, auth guard, sidebar
│       ├── router.js    # Hash router
│       ├── api.js       # Fetch wrapper with JWT
│       ├── session.js   # localStorage session
│       ├── components.js# modal, toast, confirm, renderTable, badge
│       ├── i18n.js      # Spanish UI strings
│       └── views/       # One module per screen
├── requirements.txt
└── .env                 # Not included in git
```

---

## Roles

| Role | Permissions |
|---|---|
| `admin` | Full access: CRUD products, locations, users, movements |
| `operator` | Read-only on products and inventory. Can record movements. |
