# SQLite Migration + Windows Installer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace PostgreSQL with SQLite and package the app as a one-click Windows installer (.exe) so non-technical users can install it by double-clicking.

**Architecture:** Single shared SQLite connection with `check_same_thread=False` and a `threading.Lock()` wrapping all operations. `launcher.py` starts uvicorn in a background daemon thread, opens the browser, then runs a pystray system tray icon. PyInstaller bundles everything into `dist/InventaryCare/`. Inno Setup wraps that folder into `InventaryCare_Setup.exe`.

**Tech Stack:** Python sqlite3 (built-in), pystray, Pillow, PyInstaller, Inno Setup 6

---

## File Map

| File | Action | What changes |
|---|---|---|
| `app/config.py` | Modify | Remove PG vars, add `db_path` using `%APPDATA%` |
| `requirements.txt` | Modify | Remove psycopg2-binary; add pystray, Pillow |
| `app/database.py` | Rewrite | sqlite3 + threading.Lock, row_factory |
| `app/migrations.py` | Rewrite | SQLite schema (INTEGER PRIMARY KEY, datetime('now')) |
| `app/main.py` | Modify | `init_pool` → `init_db`, absolute path for StaticFiles |
| `app/routers/auth.py` | Modify | `%s` → `?`, remove cursor context manager |
| `app/routers/products.py` | Modify | `%s` → `?`, ILIKE → LIKE, fix cursor |
| `app/routers/locations.py` | Modify | `%s` → `?`, fix cursor |
| `app/routers/inventory.py` | Modify | `%s` → `?`, fix cursor |
| `app/routers/movements.py` | Modify | `%s` → `?`, fix ON CONFLICT, fix cursor |
| `app/routers/reports.py` | Modify | `%s` → `?`, DATE_TRUNC → strftime, fix cursor |
| `app/routers/users.py` | Modify | `%s` → `?`, fix cursor |
| `tests/conftest.py` | Create | TestClient with temp SQLite DB |
| `tests/test_integration.py` | Create | End-to-end smoke tests |
| `assets/icon.ico` | Create | Placeholder icon via Pillow |
| `launcher.py` | Create | pystray tray + uvicorn thread + browser open |
| `inventarycare.spec` | Create | PyInstaller one-folder bundle spec |
| `installer.iss` | Create | Inno Setup script |

**Critical note on sqlite3 cursors:** psycopg2 cursors support `with conn.cursor() as cur:`. sqlite3 cursors do NOT — they have no `__enter__`/`__exit__`. Every `with conn.cursor() as cur:` block must become `cur = conn.cursor()`.

---

## Task 1: Update config.py + requirements.txt

**Files:**
- Modify: `app/config.py`
- Modify: `requirements.txt`

- [ ] **Step 1: Replace app/config.py**

```python
import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_appdata = Path(os.environ.get("APPDATA") or Path.home())
_default_db = _appdata / "InventaryCare" / "inventorycare.db"


class Settings:
    db_path: Path = Path(os.getenv("DB_PATH", str(_default_db)))
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    token_expire_hours: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "8"))
    port: int = int(os.getenv("PORT", "8080"))


settings = Settings()
```

- [ ] **Step 2: Replace requirements.txt**

```
fastapi==0.115.0
uvicorn[standard]==0.32.0
passlib[argon2]==1.7.4
python-jose[cryptography]==3.3.0
python-dotenv==1.0.1
pystray==0.19.5
Pillow==10.4.0
pytest==8.3.0
httpx==0.27.0
pytest-asyncio==0.24.0
```

- [ ] **Step 3: Install updated dependencies**

```
pip install -r requirements.txt
```

Expected: all packages install successfully; psycopg2-binary is NOT installed.

- [ ] **Step 4: Commit**

```
git add app/config.py requirements.txt
git commit -m "chore: remove PostgreSQL deps, add pystray+Pillow, simplify config"
```

---

## Task 2: Rewrite database.py

**Files:**
- Modify: `app/database.py`

- [ ] **Step 1: Write the new database.py**

```python
import sqlite3
import threading
from contextlib import contextmanager
from app.config import settings

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()


def init_db():
    global _conn
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.execute("PRAGMA foreign_keys=ON")
    _conn.commit()


@contextmanager
def db_conn():
    with _lock:
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def get_db():
    with db_conn() as conn:
        yield conn
```

- [ ] **Step 2: Commit**

```
git add app/database.py
git commit -m "feat: replace psycopg2 pool with sqlite3 single connection + Lock"
```

---

## Task 3: Rewrite migrations.py

**Files:**
- Modify: `app/migrations.py`

- [ ] **Step 1: Write the new migrations.py**

```python
from app.database import db_conn

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operator'
                      CHECK (role IN ('admin', 'operator')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    sku         TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    min_stock   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
    product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS movements (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    type        TEXT    NOT NULL CHECK (type IN ('IN', 'OUT', 'TRANSFER')),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    reference   TEXT,
    notes       TEXT,
    user_id     INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def run_migrations():
    with db_conn() as conn:
        conn.executescript(SCHEMA)


def is_first_run() -> bool:
    with db_conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM users")
        return cur.fetchone()[0] == 0


def setup_first_run():
    from app.auth import hash_password
    with db_conn() as conn:
        conn.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            ("admin", hash_password("admin123")),
        )
```

- [ ] **Step 2: Commit**

```
git add app/migrations.py
git commit -m "feat: adapt schema for SQLite (INTEGER PRIMARY KEY, datetime('now'))"
```

---

## Task 4: Update main.py

**Files:**
- Modify: `app/main.py`

- [ ] **Step 1: Write the new main.py**

The only changes are: `init_pool` → `init_db`, and the StaticFiles mount uses an absolute path based on the executable location so PyInstaller one-folder bundles work correctly.

```python
import os
import sys
from contextlib import asynccontextmanager
from pathlib import Path
from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.database import init_db
from app.migrations import run_migrations, is_first_run, setup_first_run
from app.routers import auth as auth_router
from app.routers import users, products, locations, inventory, movements, reports


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    run_migrations()
    if is_first_run():
        setup_first_run()
        print("[boot] First run — admin user created (admin / admin123)")
    yield


app = FastAPI(title="InventoryCare API", version="1.0.0", lifespan=lifespan)

app.include_router(auth_router.router)
app.include_router(users.router)
app.include_router(products.router)
app.include_router(locations.router)
app.include_router(inventory.router)
app.include_router(movements.router)
app.include_router(reports.router)


@app.get("/health")
def health():
    return {"status": "ok"}


# Resolve www/ relative to the exe when frozen, else relative to project root
if getattr(sys, "frozen", False):
    _www = Path(sys.executable).parent / "www"
else:
    _www = Path(__file__).parent.parent / "www"

if _www.is_dir():
    app.mount("/", StaticFiles(directory=str(_www), html=True), name="static")
```

- [ ] **Step 2: Verify server starts**

```
python -m uvicorn app.main:app --host 0.0.0.0 --port 8080
```

Expected output contains:
```
[boot] First run — admin user created (admin / admin123)
INFO:     Application startup complete.
```

A file `inventorycare.db` is created in `%APPDATA%\InventaryCare\`.

- [ ] **Step 3: Commit**

```
git add app/main.py
git commit -m "chore: wire init_db, use absolute www path for PyInstaller compat"
```

---

## Task 5: Update routers/auth.py

**Files:**
- Modify: `app/routers/auth.py`

- [ ] **Step 1: Write updated auth.py**

Changes: `%s` → `?`, `with conn.cursor() as cur:` → `cur = conn.cursor()`.

```python
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from app.database import get_db
from app.auth import verify_password, create_token

router = APIRouter(prefix="/api/auth", tags=["auth"])


class LoginRequest(BaseModel):
    username: str
    password: str


@router.post("/login")
def login(req: LoginRequest, conn=Depends(get_db)):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, username, password_hash, role FROM users WHERE username = ?",
        (req.username,),
    )
    user = cur.fetchone()

    if not user or not verify_password(req.password, user[2]):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    return {
        "access_token": create_token(user[0], user[1], user[3]),
        "token_type": "bearer",
        "role": user[3],
    }


@router.post("/logout")
def logout():
    return {"detail": "logged out"}
```

- [ ] **Step 2: Test login works**

Start the server and run:
```
curl -s -X POST http://localhost:8080/api/auth/login -H "Content-Type: application/json" -d "{\"username\":\"admin\",\"password\":\"admin123\"}"
```

Expected: JSON response containing `"access_token"`.

- [ ] **Step 3: Commit**

```
git add app/routers/auth.py
git commit -m "fix: adapt auth router for SQLite (? placeholders, no cursor ctx mgr)"
```

---

## Task 6: Update routers/products.py

**Files:**
- Modify: `app/routers/products.py`

- [ ] **Step 1: Write updated products.py**

Changes: `%s` → `?`, `ILIKE` → `LIKE`, `with conn.cursor() as cur:` → `cur = conn.cursor()`, dynamic SET clause uses `?`.

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/products", tags=["products"])


class ProductCreate(BaseModel):
    sku: str
    name: str
    description: Optional[str] = None
    category: Optional[str] = None
    unit: str = "pcs"
    min_stock: int = 0


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[int] = None


def _row_to_dict(r):
    return {"id": r[0], "sku": r[1], "name": r[2], "description": r[3],
            "category": r[4], "unit": r[5], "min_stock": r[6], "created_at": r[7]}


@router.get("")
def list_products(
    search: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    cur = conn.cursor()
    if search:
        cur.execute(
            "SELECT id,sku,name,description,category,unit,min_stock,created_at "
            "FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY name",
            (f"%{search}%", f"%{search}%"),
        )
    else:
        cur.execute("SELECT id,sku,name,description,category,unit,min_stock,created_at FROM products ORDER BY name")
    return [_row_to_dict(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_product(body: ProductCreate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO products (sku,name,description,category,unit,min_stock) "
            "VALUES (?,?,?,?,?,?) RETURNING id,sku,name,description,category,unit,min_stock,created_at",
            (body.sku, body.name, body.description, body.category, body.unit, body.min_stock),
        )
        return _row_to_dict(cur.fetchone())
    except Exception:
        raise HTTPException(409, "SKU already exists")


@router.put("/{product_id}")
def update_product(product_id: int, body: ProductUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=?" for k in fields)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE products SET {set_clause} WHERE id=? "
        "RETURNING id,sku,name,description,category,unit,min_stock,created_at",
        (*fields.values(), product_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Product not found")
    return _row_to_dict(row)


@router.delete("/{product_id}", status_code=204)
def delete_product(product_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("DELETE FROM products WHERE id=? RETURNING id", (product_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Product not found")
```

- [ ] **Step 2: Commit**

```
git add app/routers/products.py
git commit -m "fix: adapt products router for SQLite"
```

---

## Task 7: Update routers/locations.py

**Files:**
- Modify: `app/routers/locations.py`

- [ ] **Step 1: Write updated locations.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user, require_admin

router = APIRouter(prefix="/api/locations", tags=["locations"])


class LocationCreate(BaseModel):
    code: str
    name: str
    description: Optional[str] = None


class LocationUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None


def _row(r):
    return {"id": r[0], "code": r[1], "name": r[2], "description": r[3]}


@router.get("")
def list_locations(conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute("SELECT id,code,name,description FROM locations ORDER BY code")
    return [_row(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_location(body: LocationCreate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO locations (code,name,description) VALUES (?,?,?) "
            "RETURNING id,code,name,description",
            (body.code, body.name, body.description),
        )
        return _row(cur.fetchone())
    except Exception:
        raise HTTPException(409, "Location code already exists")


@router.put("/{location_id}")
def update_location(location_id: int, body: LocationUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    fields = {k: v for k, v in body.model_dump().items() if v is not None}
    if not fields:
        raise HTTPException(400, "No fields to update")
    set_clause = ", ".join(f"{k}=?" for k in fields)
    cur = conn.cursor()
    cur.execute(
        f"UPDATE locations SET {set_clause} WHERE id=? RETURNING id,code,name,description",
        (*fields.values(), location_id),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "Location not found")
    return _row(row)


@router.delete("/{location_id}", status_code=204)
def delete_location(location_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("DELETE FROM locations WHERE id=? RETURNING id", (location_id,))
    if not cur.fetchone():
        raise HTTPException(404, "Location not found")
```

- [ ] **Step 2: Commit**

```
git add app/routers/locations.py
git commit -m "fix: adapt locations router for SQLite"
```

---

## Task 8: Update routers/inventory.py

**Files:**
- Modify: `app/routers/inventory.py`

- [ ] **Step 1: Write updated inventory.py**

```python
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/inventory", tags=["inventory"])


@router.get("")
def get_inventory(
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT p.id, p.sku, p.name, p.unit, p.min_stock,
               l.id, l.code, l.name,
               COALESCE(i.quantity, 0)
        FROM products p
        CROSS JOIN locations l
        LEFT JOIN inventory i ON i.product_id=p.id AND i.location_id=l.id
        WHERE 1=1
    """
    params = []
    if product_id:
        sql += " AND p.id = ?"
        params.append(product_id)
    if location_id:
        sql += " AND l.id = ?"
        params.append(location_id)
    sql += " ORDER BY p.name, l.code"

    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()

    return [
        {
            "product": {"id": r[0], "sku": r[1], "name": r[2], "unit": r[3], "min_stock": r[4]},
            "location": {"id": r[5], "code": r[6], "name": r[7]},
            "quantity": r[8],
            "low_stock": r[8] < r[4],
        }
        for r in rows
    ]
```

- [ ] **Step 2: Commit**

```
git add app/routers/inventory.py
git commit -m "fix: adapt inventory router for SQLite"
```

---

## Task 9: Update routers/movements.py

**Files:**
- Modify: `app/routers/movements.py`

- [ ] **Step 1: Write updated movements.py**

Key changes:
- `%s` → `?`
- `ON CONFLICT ... DO UPDATE SET quantity = inventory.quantity + EXCLUDED.quantity` — SQLite 3.24+ supports this syntax (Python 3.11+ ships SQLite 3.39+).
- `RETURNING id,created_at` — supported in SQLite 3.35+ (Python 3.11+ ships 3.39+).
- `with conn.cursor() as cur:` → `cur = conn.cursor()`

```python
from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/movements", tags=["movements"])


class MovementIn(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


class MovementOut(BaseModel):
    product_id: int
    location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


class MovementTransfer(BaseModel):
    product_id: int
    from_location_id: int
    to_location_id: int
    quantity: int
    reference: Optional[str] = None
    notes: Optional[str] = None


def _upsert_inventory(cur, product_id, location_id, delta):
    cur.execute(
        """
        INSERT INTO inventory (product_id, location_id, quantity)
        VALUES (?, ?, ?)
        ON CONFLICT (product_id, location_id)
        DO UPDATE SET quantity = inventory.quantity + excluded.quantity
        """,
        (product_id, location_id, delta),
    )


def _check_stock(cur, product_id, location_id, quantity):
    cur.execute(
        "SELECT COALESCE(quantity,0) FROM inventory WHERE product_id=? AND location_id=?",
        (product_id, location_id),
    )
    row = cur.fetchone()
    stock = row[0] if row else 0
    if stock < quantity:
        raise HTTPException(400, f"Insufficient stock: available {stock}, requested {quantity}")


@router.post("/in", status_code=201)
def movement_in(body: MovementIn, conn=Depends(get_db), user=Depends(get_current_user)):
    cur = conn.cursor()
    _upsert_inventory(cur, body.product_id, body.location_id, body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'IN',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "IN", "created_at": row[1]}


@router.post("/out", status_code=201)
def movement_out(body: MovementOut, conn=Depends(get_db), user=Depends(get_current_user)):
    cur = conn.cursor()
    _check_stock(cur, body.product_id, body.location_id, body.quantity)
    _upsert_inventory(cur, body.product_id, body.location_id, -body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'OUT',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "OUT", "created_at": row[1]}


@router.post("/transfer", status_code=201)
def movement_transfer(body: MovementTransfer, conn=Depends(get_db), user=Depends(get_current_user)):
    if body.from_location_id == body.to_location_id:
        raise HTTPException(400, "Source and destination must be different")
    cur = conn.cursor()
    _check_stock(cur, body.product_id, body.from_location_id, body.quantity)
    _upsert_inventory(cur, body.product_id, body.from_location_id, -body.quantity)
    _upsert_inventory(cur, body.product_id, body.to_location_id, body.quantity)
    cur.execute(
        "INSERT INTO movements (product_id,location_id,type,quantity,reference,notes,user_id) "
        "VALUES (?,?,'TRANSFER',?,?,?,?) RETURNING id,created_at",
        (body.product_id, body.from_location_id, body.quantity, body.reference, body.notes, user["sub"]),
    )
    row = cur.fetchone()
    return {"id": row[0], "type": "TRANSFER", "created_at": row[1]}


@router.get("")
def list_movements(
    product_id: Optional[int] = Query(None),
    location_id: Optional[int] = Query(None),
    user_id: Optional[int] = Query(None),
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT m.id, p.sku, p.name, l.code, m.type, m.quantity,
               m.reference, m.notes, u.username, m.created_at
        FROM movements m
        JOIN products p ON p.id = m.product_id
        JOIN locations l ON l.id = m.location_id
        LEFT JOIN users u ON u.id = m.user_id
        WHERE 1=1
    """
    params = []
    if product_id:
        sql += " AND m.product_id=?"; params.append(product_id)
    if location_id:
        sql += " AND m.location_id=?"; params.append(location_id)
    if user_id:
        sql += " AND m.user_id=?"; params.append(user_id)
    if from_date:
        sql += " AND m.created_at >= ?"; params.append(from_date)
    if to_date:
        sql += " AND m.created_at <= ?"; params.append(to_date)
    sql += " ORDER BY m.created_at DESC LIMIT 500"

    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()

    return [
        {
            "id": r[0], "product_sku": r[1], "product_name": r[2],
            "location_code": r[3], "type": r[4], "quantity": r[5],
            "reference": r[6], "notes": r[7], "user": r[8], "created_at": r[9],
        }
        for r in rows
    ]
```

- [ ] **Step 2: Commit**

```
git add app/routers/movements.py
git commit -m "fix: adapt movements router for SQLite (ON CONFLICT, RETURNING, ? placeholders)"
```

---

## Task 10: Update routers/reports.py

**Files:**
- Modify: `app/routers/reports.py`

- [ ] **Step 1: Write updated reports.py**

Key changes:
- `%s` → `?`
- `DATE_TRUNC('day', m.created_at)` → `strftime('%Y-%m-%d', m.created_at)`
- GROUP BY must use the full expression, not the alias (SQLite doesn't allow aliases in GROUP BY)
- `with conn.cursor() as cur:` → `cur = conn.cursor()`

```python
from fastapi import APIRouter, Depends, Query
from typing import Optional
from app.database import get_db
from app.auth import get_current_user

router = APIRouter(prefix="/api/reports", tags=["reports"])


@router.get("/stock")
def report_stock(conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute("""
        SELECT p.sku, p.name, p.unit, p.category,
               COALESCE(SUM(i.quantity), 0) AS total
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        GROUP BY p.id, p.sku, p.name, p.unit, p.category
        ORDER BY p.name
    """)
    rows = cur.fetchall()
    return [
        {"sku": r[0], "name": r[1], "unit": r[2], "category": r[3], "total_stock": r[4]}
        for r in rows
    ]


@router.get("/low-stock")
def report_low_stock(conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute("""
        SELECT p.sku, p.name, p.unit, p.min_stock,
               COALESCE(SUM(i.quantity), 0) AS total
        FROM products p
        LEFT JOIN inventory i ON i.product_id = p.id
        GROUP BY p.id, p.sku, p.name, p.unit, p.min_stock
        HAVING COALESCE(SUM(i.quantity), 0) < p.min_stock
        ORDER BY p.name
    """)
    rows = cur.fetchall()
    return [
        {"sku": r[0], "name": r[1], "unit": r[2], "min_stock": r[3], "total_stock": r[4]}
        for r in rows
    ]


@router.get("/movements")
def report_movements(
    from_date: Optional[str] = Query(None),
    to_date: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    sql = """
        SELECT m.type, COUNT(*), SUM(m.quantity),
               strftime('%Y-%m-%d', m.created_at) AS day
        FROM movements m
        WHERE 1=1
    """
    params = []
    if from_date:
        sql += " AND m.created_at >= ?"; params.append(from_date)
    if to_date:
        sql += " AND m.created_at <= ?"; params.append(to_date)
    sql += " GROUP BY m.type, strftime('%Y-%m-%d', m.created_at) ORDER BY day DESC, m.type"

    cur = conn.cursor()
    cur.execute(sql, params)
    rows = cur.fetchall()

    return [
        {"type": r[0], "count": r[1], "total_quantity": r[2], "day": r[3]}
        for r in rows
    ]
```

- [ ] **Step 2: Commit**

```
git add app/routers/reports.py
git commit -m "fix: adapt reports router for SQLite (strftime, ? placeholders)"
```

---

## Task 11: Update routers/users.py

**Files:**
- Modify: `app/routers/users.py`

- [ ] **Step 1: Write updated users.py**

```python
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from typing import Optional
from app.database import get_db
from app.auth import require_admin, hash_password

router = APIRouter(prefix="/api/users", tags=["users"])


class UserCreate(BaseModel):
    username: str
    password: str
    role: str = "operator"


class UserUpdate(BaseModel):
    password: Optional[str] = None
    role: Optional[str] = None


@router.get("")
def list_users(conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("SELECT id, username, role, created_at FROM users ORDER BY id")
    rows = cur.fetchall()
    return [{"id": r[0], "username": r[1], "role": r[2], "created_at": r[3]} for r in rows]


@router.post("", status_code=201)
def create_user(body: UserCreate, conn=Depends(get_db), _=Depends(require_admin)):
    if body.role not in ("admin", "operator"):
        raise HTTPException(400, "role must be admin or operator")
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?) RETURNING id",
            (body.username, hash_password(body.password), body.role),
        )
        user_id = cur.fetchone()[0]
    except Exception:
        raise HTTPException(409, "Username already exists")
    return {"id": user_id, "username": body.username, "role": body.role}


@router.put("/{user_id}")
def update_user(user_id: int, body: UserUpdate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    if body.password:
        cur.execute("UPDATE users SET password_hash=? WHERE id=?", (hash_password(body.password), user_id))
    if body.role:
        if body.role not in ("admin", "operator"):
            raise HTTPException(400, "role must be admin or operator")
        cur.execute("UPDATE users SET role=? WHERE id=?", (body.role, user_id))
    cur.execute("SELECT id, username, role FROM users WHERE id=?", (user_id,))
    user = cur.fetchone()
    if not user:
        raise HTTPException(404, "User not found")
    return {"id": user[0], "username": user[1], "role": user[2]}


@router.delete("/{user_id}", status_code=204)
def delete_user(user_id: int, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    cur.execute("DELETE FROM users WHERE id=? RETURNING id", (user_id,))
    if not cur.fetchone():
        raise HTTPException(404, "User not found")
```

- [ ] **Step 2: Commit**

```
git add app/routers/users.py
git commit -m "fix: adapt users router for SQLite"
```

---

## Task 12: Add integration tests

**Files:**
- Create: `tests/conftest.py`
- Create: `tests/test_integration.py`

- [ ] **Step 1: Create tests/conftest.py**

Setting `DB_PATH` at module level (before any app import) forces config.py to use the temp database.

```python
import os
import tempfile
import pytest

# Must be set before app.config is imported
os.environ["DB_PATH"] = tempfile.mktemp(suffix="_test.db")

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
```

- [ ] **Step 2: Create tests/test_integration.py**

```python
def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_create_and_list_product(client, auth_headers):
    r = client.post("/api/products", headers=auth_headers, json={
        "sku": "TEST-001", "name": "Test Product", "unit": "pcs", "min_stock": 5
    })
    assert r.status_code == 201
    p = r.json()
    assert p["sku"] == "TEST-001"
    assert p["id"] > 0

    r = client.get("/api/products", headers=auth_headers)
    assert r.status_code == 200
    skus = [x["sku"] for x in r.json()]
    assert "TEST-001" in skus


def test_search_product(client, auth_headers):
    r = client.get("/api/products?search=test", headers=auth_headers)
    assert r.status_code == 200
    assert any(p["sku"] == "TEST-001" for p in r.json())


def test_create_location(client, auth_headers):
    r = client.post("/api/locations", headers=auth_headers, json={
        "code": "WH-A", "name": "Warehouse A"
    })
    assert r.status_code == 201
    assert r.json()["code"] == "WH-A"


def test_movement_in_and_inventory(client, auth_headers):
    products = client.get("/api/products", headers=auth_headers).json()
    product_id = next(p["id"] for p in products if p["sku"] == "TEST-001")

    locations = client.get("/api/locations", headers=auth_headers).json()
    location_id = next(l["id"] for l in locations if l["code"] == "WH-A")

    r = client.post("/api/movements/in", headers=auth_headers, json={
        "product_id": product_id, "location_id": location_id, "quantity": 10
    })
    assert r.status_code == 201
    assert r.json()["type"] == "IN"

    r = client.get("/api/inventory", headers=auth_headers)
    assert r.status_code == 200
    entry = next(
        x for x in r.json()
        if x["product"]["id"] == product_id and x["location"]["id"] == location_id
    )
    assert entry["quantity"] == 10
    assert not entry["low_stock"]


def test_movement_out_insufficient_stock(client, auth_headers):
    products = client.get("/api/products", headers=auth_headers).json()
    product_id = next(p["id"] for p in products if p["sku"] == "TEST-001")
    locations = client.get("/api/locations", headers=auth_headers).json()
    location_id = next(l["id"] for l in locations if l["code"] == "WH-A")

    r = client.post("/api/movements/out", headers=auth_headers, json={
        "product_id": product_id, "location_id": location_id, "quantity": 999
    })
    assert r.status_code == 400
    assert "Insufficient stock" in r.json()["detail"]


def test_reports_stock(client, auth_headers):
    r = client.get("/api/reports/stock", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_user(client, auth_headers):
    r = client.post("/api/users", headers=auth_headers, json={
        "username": "operator1", "password": "pass123", "role": "operator"
    })
    assert r.status_code == 201
    assert r.json()["role"] == "operator"
```

- [ ] **Step 3: Run tests**

```
pytest tests/ -v
```

Expected: all tests PASS. If any fail, fix the underlying router before proceeding.

- [ ] **Step 4: Commit**

```
git add tests/conftest.py tests/test_integration.py
git commit -m "test: add SQLite integration tests covering all major routes"
```

---

## Task 13: Create placeholder icon

**Files:**
- Create: `assets/icon.ico`

Requires Pillow (already in requirements.txt).

- [ ] **Step 1: Create assets directory and icon**

Run this Python script from the project root:

```python
from PIL import Image, ImageDraw
from pathlib import Path

Path("assets").mkdir(exist_ok=True)

img = Image.new("RGBA", (64, 64), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
d.rounded_rectangle([2, 2, 62, 62], radius=12, fill=(29, 78, 216))
d.rectangle([16, 28, 48, 36], fill=(255, 255, 255))
d.rectangle([28, 16, 36, 48], fill=(255, 255, 255))

img.save("assets/icon.ico", format="ICO", sizes=[(64, 64), (32, 32), (16, 16)])
print("Created assets/icon.ico")
```

Save as `scripts/make_icon.py` and run:

```
python scripts/make_icon.py
```

Expected: file `assets/icon.ico` created (about 10–20 KB).

- [ ] **Step 2: Commit**

```
git add scripts/make_icon.py assets/icon.ico
git commit -m "feat: add placeholder app icon (blue with + symbol)"
```

---

## Task 14: Create launcher.py

**Files:**
- Create: `launcher.py`

- [ ] **Step 1: Write launcher.py**

```python
import os
import sys
import threading
import webbrowser
import time
from pathlib import Path

import uvicorn
from PIL import Image
import pystray

PORT = 8080
URL = f"http://localhost:{PORT}"

# When frozen by PyInstaller, chdir to the exe's folder so relative paths work
if getattr(sys, "frozen", False):
    os.chdir(Path(sys.executable).parent)


def _load_icon() -> Image.Image:
    icon_path = Path("assets/icon.ico")
    if icon_path.exists():
        return Image.open(icon_path)
    # Fallback: generate a minimal blue square
    from PIL import ImageDraw
    img = Image.new("RGBA", (64, 64), (29, 78, 216, 255))
    d = ImageDraw.Draw(img)
    d.rectangle([20, 28, 44, 36], fill=(255, 255, 255))
    d.rectangle([28, 20, 36, 44], fill=(255, 255, 255))
    return img


def _run_server():
    from app.main import app
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="error")


def _open_browser(icon=None, item=None):
    webbrowser.open(URL)


def _quit(icon, item):
    icon.stop()
    sys.exit(0)


def main():
    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()

    # Give uvicorn time to bind the port before opening the browser
    time.sleep(1.5)
    webbrowser.open(URL)

    menu = pystray.Menu(
        pystray.MenuItem("Abrir InventaryCare", _open_browser, default=True),
        pystray.MenuItem("Salir", _quit),
    )
    icon = pystray.Icon("InventaryCare", _load_icon(), "InventaryCare", menu)
    icon.run()


if __name__ == "__main__":
    main()
```

- [ ] **Step 2: Test launcher manually**

```
python launcher.py
```

Expected:
- Browser opens to `http://localhost:8080` after ~1.5 seconds.
- System tray icon appears (bottom-right taskbar area on Windows).
- Right-clicking shows "Abrir InventaryCare" and "Salir".
- "Salir" closes the app cleanly.

- [ ] **Step 3: Commit**

```
git add launcher.py
git commit -m "feat: add pystray launcher (tray icon + uvicorn + auto browser open)"
```

---

## Task 15: Create inventarycare.spec

**Files:**
- Create: `inventarycare.spec`

- [ ] **Step 1: Install PyInstaller**

```
pip install pyinstaller
```

- [ ] **Step 2: Write inventarycare.spec**

```python
# inventarycare.spec
block_cipher = None

a = Analysis(
    ['launcher.py'],
    pathex=[],
    binaries=[],
    datas=[
        ('www', 'www'),
        ('assets', 'assets'),
        ('app', 'app'),
    ],
    hiddenimports=[
        'uvicorn.logging',
        'uvicorn.loops',
        'uvicorn.loops.auto',
        'uvicorn.protocols',
        'uvicorn.protocols.http',
        'uvicorn.protocols.http.auto',
        'uvicorn.protocols.websockets',
        'uvicorn.protocols.websockets.auto',
        'uvicorn.lifespan',
        'uvicorn.lifespan.on',
        'fastapi',
        'pystray',
        'PIL',
        'PIL.Image',
        'PIL.ImageDraw',
        'passlib',
        'passlib.handlers',
        'passlib.handlers.argon2',
        'jose',
        'jose.jwt',
        'multipart',
        'email.mime.text',
        'email.mime.multipart',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['psycopg2', 'tkinter', 'matplotlib'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='InventaryCare',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,
    disable_windowed_traceback=False,
    argv_emulation=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon='assets/icon.ico',
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='InventaryCare',
)
```

- [ ] **Step 3: Build the bundle**

```
pyinstaller inventarycare.spec --clean
```

Expected: `dist/InventaryCare/` directory created containing `InventaryCare.exe` plus all dependencies. Build takes 1–3 minutes.

- [ ] **Step 4: Smoke-test the bundle**

Double-click `dist/InventaryCare/InventaryCare.exe`.

Expected:
- Browser opens to `http://localhost:8080`.
- InventaryCare login page loads.
- System tray icon visible.
- Login with `admin` / `admin123` works.

If the exe fails to start, check `dist/InventaryCare/` for a log file or run from a terminal to see the error output.

- [ ] **Step 5: Commit**

```
git add inventarycare.spec
git commit -m "feat: add PyInstaller spec for one-folder Windows bundle"
```

---

## Task 16: Create installer.iss

**Files:**
- Create: `installer.iss`

Requires Inno Setup 6 installed from https://jrsoftware.org/isinfo.php (free).

- [ ] **Step 1: Write installer.iss**

```ini
[Setup]
AppName=InventaryCare
AppVersion=1.0.0
AppPublisher=InventaryCare
AppPublisherURL=http://localhost:8080
DefaultDirName={autopf}\InventaryCare
DefaultGroupName=InventaryCare
OutputDir=Output
OutputBaseFilename=InventaryCare_Setup
Compression=lzma
SolidCompression=yes
WizardStyle=modern
UninstallDisplayIcon={app}\InventaryCare.exe
PrivilegesRequired=admin
SetupIconFile=assets\icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"

[Tasks]
Name: "desktopicon"; Description: "Crear acceso directo en el escritorio"; GroupDescription: "Iconos adicionales:"
Name: "startup"; Description: "Iniciar InventaryCare autom{225}ticamente al encender el PC"; GroupDescription: "Opciones de inicio:"

[Files]
Source: "dist\InventaryCare\*"; DestDir: "{app}"; Flags: ignoreversion recursesubdirs createallsubdirs

[Icons]
Name: "{group}\InventaryCare"; Filename: "{app}\InventaryCare.exe"
Name: "{userdesktop}\InventaryCare"; Filename: "{app}\InventaryCare.exe"; Tasks: desktopicon

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "InventaryCare"; ValueData: """{app}\InventaryCare.exe"""; Flags: uninsdeletevalue; Tasks: startup

[Run]
Filename: "{app}\InventaryCare.exe"; Description: "Abrir InventaryCare ahora"; Flags: nowait postinstall skipifsilent

[UninstallRun]
Filename: "taskkill"; Parameters: "/F /IM InventaryCare.exe"; Flags: runhidden

[Code]
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  // Database in %APPDATA% is intentionally NOT deleted so user data survives uninstall
end;
```

- [ ] **Step 2: Build the installer**

Open Inno Setup Compiler, open `installer.iss`, press F9 (or Compile).

Or from command line if `iscc` is in PATH:
```
iscc installer.iss
```

Expected: `Output\InventaryCare_Setup.exe` created (typically 40–80 MB).

- [ ] **Step 3: Test the installer**

Run `Output\InventaryCare_Setup.exe`. Walk through:
1. Welcome page — click Next
2. Install location — verify default is `C:\Program Files\InventaryCare`, change if needed, click Next
3. Ready to install — click Install
4. Progress bar completes
5. Finish page — "Abrir InventaryCare ahora" checkbox checked → click Finish

Expected:
- App opens in browser automatically.
- Desktop shortcut created (if selected).
- App visible in Windows Settings → Apps → Installed Apps.
- Uninstall via Apps: removes `C:\Program Files\InventaryCare` but does NOT delete `%APPDATA%\InventaryCare\inventorycare.db`.

- [ ] **Step 4: Commit**

```
git add installer.iss
git commit -m "feat: add Inno Setup installer script (Spanish UI, optional auto-start, data-safe uninstall)"
```

---

## Build Cheat Sheet (developer reference)

```bash
# Full build from scratch
pip install pyinstaller
pyinstaller inventarycare.spec --clean
iscc installer.iss
# Output: Output\InventaryCare_Setup.exe

# When user provides final logo: drop .ico into assets/icon.ico, rebuild
pyinstaller inventarycare.spec --clean && iscc installer.iss
```
