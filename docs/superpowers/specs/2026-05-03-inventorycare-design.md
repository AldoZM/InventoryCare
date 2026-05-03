# InventoryCare — Design Spec
**Date:** 2026-05-03  
**Status:** Approved

---

## Overview

Cross-platform inventory manager for small/medium businesses and warehouses. 2-3 simultaneous users from Windows or Linux machines. Non-technical users — zero-dependency install via ZIP.

**Stack:** C++17, PostgreSQL portable, cpp-httplib (header-only), libpq, HTML/CSS/JS vanilla, CMake, GitHub Actions.

---

## Architecture

Single binary bundles an HTTP server and serves the web frontend. PostgreSQL portable auto-starts alongside the binary. One machine acts as server; other users connect via browser.

```
inventorycare/
  inventorycare.exe       ← main binary (Win) / inventorycare (Linux)
  pgsql/                  ← portable PostgreSQL (auto-starts)
  www/                    ← HTML/CSS/JS frontend
  data/                   ← PostgreSQL data directory
  config.ini              ← HTTP port, DB credentials, language
  logs/                   ← rotating daily logs
```

**Startup sequence:**
1. Binary starts PostgreSQL portable
2. Healthcheck loop until PostgreSQL ready
3. First run: create DB, tables, default admin user
4. HTTP server starts on port 8080
5. Opens browser automatically → `http://localhost:8080`
6. Other users connect via `http://<server-ip>:8080`

**Distribution:**

| OS | Package |
|---|---|
| Windows | `InventoryCare-win-x64.zip` → unzip → double-click |
| Linux | `InventoryCare-linux-x64.tar.gz` → extract → `./inventorycare` |

GitHub Actions builds both on every release tag.

---

## Data Model

```sql
users (
  id SERIAL PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'operator')),
  created_at TIMESTAMPTZ DEFAULT NOW()
)

products (
  id SERIAL PRIMARY KEY,
  sku TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  category TEXT,
  unit TEXT NOT NULL,         -- piezas, kg, litros, etc.
  min_stock INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
)

locations (
  id SERIAL PRIMARY KEY,
  code TEXT UNIQUE NOT NULL,  -- e.g. "A3"
  name TEXT NOT NULL,
  description TEXT
)

inventory (
  product_id INTEGER REFERENCES products(id),
  location_id INTEGER REFERENCES locations(id),
  quantity INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (product_id, location_id)
)

movements (
  id SERIAL PRIMARY KEY,
  product_id INTEGER REFERENCES products(id),
  location_id INTEGER REFERENCES locations(id),
  type TEXT NOT NULL CHECK (type IN ('IN', 'OUT', 'TRANSFER')),
  quantity INTEGER NOT NULL,
  reference TEXT,             -- order number, invoice, etc.
  notes TEXT,
  user_id INTEGER REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
)
```

---

## REST API

```
POST   /api/auth/login
POST   /api/auth/logout

GET    /api/products
POST   /api/products
PUT    /api/products/:id
DELETE /api/products/:id

GET    /api/locations
POST   /api/locations
PUT    /api/locations/:id
DELETE /api/locations/:id

POST   /api/movements/in
POST   /api/movements/out
POST   /api/movements/transfer
GET    /api/movements?product=&from=&to=&user=

GET    /api/reports/stock
GET    /api/reports/low-stock
GET    /api/reports/movements?from=&to=

GET    /api/users            (admin only)
POST   /api/users            (admin only)
PUT    /api/users/:id        (admin only)
DELETE /api/users/:id        (admin only)
```

All responses: JSON. HTTP status codes: 200/201/400/401/403/404/500.

---

## Frontend Screens

| Route | Description | Role |
|---|---|---|
| `/login` | Authentication | all |
| `/dashboard` | Alerts, recent movements, totals | all |
| `/products` | Product catalog + search + CRUD | admin full, operator read |
| `/inventory` | Stock by location | all |
| `/movements` | Register IN / OUT / TRANSFER | operator+ |
| `/history` | Filterable history + export CSV | all |
| `/settings/users` | User management | admin |
| `/settings/locations` | Location management | admin |

---

## Roles

| Action | admin | operator |
|---|---|---|
| View stock / history | ✓ | ✓ |
| Register movements | ✓ | ✓ |
| Create / edit products | ✓ | ✗ |
| Delete products | ✓ | ✗ |
| Manage users | ✓ | ✗ |
| Manage locations | ✓ | ✗ |
| Export reports | ✓ | ✓ |

---

## Error Handling

- PostgreSQL not ready → clear UI message, retry loop with timeout
- All input validated server-side in C++ before any query
- SQL errors logged to `logs/inventorycare.log` (daily rotation, keep 30 days)
- API always returns structured JSON error: `{"error": "message"}`

---

## First Run

1. Creates database `inventorycare`
2. Runs schema migrations
3. Creates default user: `admin` / `admin123`
4. Forces password change on first login

---

## Testing

- Unit tests (C++): stock calculation, input validation, role checks
- Integration tests: all API endpoints against real PostgreSQL (no mocks)
- Smoke test: startup sequence, DB connection, HTTP server response

---

## Build System

- CMake 3.20+
- vcpkg for dependency management (libpq, cpp-httplib)
- GitHub Actions: matrix build Windows + Linux on push to `main` and release tags
