# Product Scan Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add barcode/QR scanning + OCR to the product form so users can scan a physical label with their phone camera to pre-fill name, category, and price when creating new products.

**Architecture:** `html5-qrcode` (bundled locally) handles camera/barcode in browser; `Tesseract.js` (lazy-loaded from CDN) provides client-side OCR; a new FastAPI `/api/scan` router handles SKU lookup, external barcode API fallback, and optional server-side pytesseract OCR. Products gain a `price REAL` column. All scan UI lives in a new `www/js/scan.js` module imported by `products.js`.

**Tech Stack:** html5-qrcode 2.3.8 (local bundle), Tesseract.js 5.x (CDN lazy-loaded), pytesseract optional (requires Tesseract binary on host), Open Food Facts API + UPCitemdb (external, graceful failure), urllib.request (stdlib), FastAPI UploadFile.

---

## File Map

| File | Action | Responsibility |
|------|--------|---------------|
| `app/migrations.py` | Modify | Add `price REAL` to SCHEMA + ALTER TABLE for existing DBs |
| `app/routers/products.py` | Modify | Add price to models, queries, `_row_to_dict` |
| `app/routers/scan.py` | Create | 3 endpoints: SKU lookup, external lookup, OCR |
| `app/main.py` | Modify | Import + register scan router |
| `requirements.txt` | Modify | Add pytesseract (optional dep) |
| `www/js/html5-qrcode.min.js` | Create | Downloaded + bundled locally for offline use |
| `www/index.html` | Modify | Load html5-qrcode.min.js before app.js |
| `www/css/app.css` | Modify | Scan overlay, modal, tabs, preview styles |
| `www/js/scan.js` | Create | Scan modal, camera control, barcode flow, OCR flow |
| `www/js/views/products.js` | Modify | Price field in form/table + scan button wired to openCreate/openEdit |
| `tests/test_scan.py` | Create | Tests for all 3 scan endpoints |

---

## Task 1: Add price column — migrations + products router

**Files:**
- Modify: `app/migrations.py`
- Modify: `app/routers/products.py`
- Create: `tests/test_scan.py` (first two tests)

- [ ] **Step 1: Create tests/test_scan.py with failing price tests**

```python
import os
import tempfile
os.environ.setdefault("DB_PATH", tempfile.mktemp(suffix="_scan_test.db"))

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_product_price_field_accepted(client, auth):
    r = client.post("/api/products", json={
        "sku": "SCAN-001", "name": "Test Scan", "unit": "pcs", "price": 9.99
    }, headers=auth)
    assert r.status_code == 201
    assert r.json()["price"] == 9.99


def test_product_price_optional(client, auth):
    r = client.post("/api/products", json={
        "sku": "SCAN-002", "name": "No Price", "unit": "pcs"
    }, headers=auth)
    assert r.status_code == 201
    assert r.json()["price"] is None
```

- [ ] **Step 2: Run — confirm failure**

```
pytest tests/test_scan.py::test_product_price_field_accepted -v
```
Expected: FAIL — `422 Unprocessable Entity` (unknown field) or `KeyError: 'price'`

- [ ] **Step 3: Update app/migrations.py — add price to SCHEMA + ALTER migration**

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
    price       REAL,
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
        try:
            conn.execute("ALTER TABLE products ADD COLUMN price REAL")
        except Exception:
            pass  # column already exists in existing databases


def is_first_run() -> bool:
    with db_conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM users")
        return cur.fetchone()[0] == 0


def setup_first_run():
    from app.auth import hash_password
    with db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            ("admin", hash_password("admin123")),
        )
```

- [ ] **Step 4: Replace app/routers/products.py — add price to models, _row_to_dict, all queries**

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
    price: Optional[float] = None


class ProductUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    unit: Optional[str] = None
    min_stock: Optional[int] = None
    price: Optional[float] = None


def _row_to_dict(r):
    return {
        "id": r["id"], "sku": r["sku"], "name": r["name"],
        "description": r["description"], "category": r["category"],
        "unit": r["unit"], "min_stock": r["min_stock"],
        "price": r["price"], "created_at": r["created_at"],
    }


@router.get("")
def list_products(
    search: Optional[str] = Query(None),
    conn=Depends(get_db),
    _=Depends(get_current_user),
):
    cur = conn.cursor()
    if search:
        cur.execute(
            "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
            "FROM products WHERE name LIKE ? OR sku LIKE ? ORDER BY name",
            (f"%{search}%", f"%{search}%"),
        )
    else:
        cur.execute(
            "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
            "FROM products ORDER BY name"
        )
    return [_row_to_dict(r) for r in cur.fetchall()]


@router.post("", status_code=201)
def create_product(body: ProductCreate, conn=Depends(get_db), _=Depends(require_admin)):
    cur = conn.cursor()
    try:
        cur.execute(
            "INSERT INTO products (sku,name,description,category,unit,min_stock,price) "
            "VALUES (?,?,?,?,?,?,?) "
            "RETURNING id,sku,name,description,category,unit,min_stock,price,created_at",
            (body.sku, body.name, body.description, body.category,
             body.unit, body.min_stock, body.price),
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
        "RETURNING id,sku,name,description,category,unit,min_stock,price,created_at",
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

- [ ] **Step 5: Run price tests — confirm pass**

```
pytest tests/test_scan.py::test_product_price_field_accepted tests/test_scan.py::test_product_price_optional -v
```
Expected: PASS

- [ ] **Step 6: Run full suite — no regressions**

```
pytest tests/ -v
```
Expected: all 10 existing tests + 2 new = PASS

- [ ] **Step 7: Commit**

```bash
git add app/migrations.py app/routers/products.py tests/test_scan.py
git commit -m "feat: add price column to products"
```

---

## Task 2: Create scan router

**Files:**
- Create: `app/routers/scan.py`
- Modify: `app/main.py`
- Modify: `requirements.txt`
- Modify: `tests/test_scan.py`

- [ ] **Step 1: Append failing scan endpoint tests to tests/test_scan.py**

```python
def test_scan_sku_not_found(client, auth):
    r = client.get("/api/scan/sku/NOTEXIST999", headers=auth)
    assert r.status_code == 404


def test_scan_sku_found(client, auth):
    # SCAN-001 created in test_product_price_field_accepted (module scope — runs first)
    r = client.get("/api/scan/sku/SCAN-001", headers=auth)
    assert r.status_code == 200
    data = r.json()
    assert data["sku"] == "SCAN-001"
    assert data["price"] == 9.99


def test_scan_lookup_not_found(client, auth, monkeypatch):
    monkeypatch.setattr("app.routers.scan._fetch_external", lambda _: None)
    r = client.get("/api/scan/lookup/000000000000", headers=auth)
    assert r.status_code == 404


def test_scan_lookup_found(client, auth, monkeypatch):
    monkeypatch.setattr(
        "app.routers.scan._fetch_external",
        lambda _: {"name": "Leche Entera 1L", "category": "Lácteos", "price": 25.50},
    )
    r = client.get("/api/scan/lookup/7501055300906", headers=auth)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Leche Entera 1L"
    assert data["price"] == 25.50


def test_scan_ocr_unavailable(client, auth, monkeypatch):
    monkeypatch.setattr("app.routers.scan._pytesseract_available", False)
    minimal_jpg = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xd9'
    )
    r = client.post(
        "/api/scan/ocr",
        files={"image": ("scan.jpg", minimal_jpg, "image/jpeg")},
        headers=auth,
    )
    assert r.status_code == 503
```

- [ ] **Step 2: Run — confirm failure**

```
pytest tests/test_scan.py::test_scan_sku_not_found -v
```
Expected: FAIL — route does not exist

- [ ] **Step 3: Create app/routers/scan.py**

```python
import re
import json
import urllib.request
from fastapi import APIRouter, Depends, HTTPException, File, UploadFile
from app.database import get_db
from app.auth import get_current_user
from app.routers.products import _row_to_dict

router = APIRouter(prefix="/api/scan", tags=["scan"])

try:
    import pytesseract
    from PIL import Image as _PILImage
    import io as _io
    _pytesseract_available = True
except ImportError:
    _pytesseract_available = False


def _fetch_openfoodfacts(barcode: str):
    url = (
        f"https://world.openfoodfacts.org/api/v2/product/{barcode}.json"
        "?fields=product_name,categories_tags"
    )
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "InventaryCare/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        if data.get("status") != 1:
            return None
        p = data.get("product", {})
        cats = p.get("categories_tags", [])
        category = cats[0].replace("en:", "").replace("-", " ").title() if cats else None
        name = p.get("product_name") or None
        return {"name": name, "category": category, "price": None}
    except Exception:
        return None


def _fetch_upcitemdb(barcode: str):
    url = f"https://api.upcitemdb.com/prod/trial/lookup?upc={barcode}"
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "InventaryCare/1.0"})
        with urllib.request.urlopen(req, timeout=5) as resp:
            data = json.loads(resp.read())
        items = data.get("items", [])
        if not items:
            return None
        item = items[0]
        price = item.get("lowest_recorded_price")
        return {
            "name": item.get("title") or None,
            "category": item.get("category") or None,
            "price": float(price) if price is not None else None,
        }
    except Exception:
        return None


def _fetch_external(barcode: str):
    result = _fetch_openfoodfacts(barcode)
    if result and result.get("name"):
        price_data = _fetch_upcitemdb(barcode)
        if price_data:
            result["price"] = price_data.get("price")
        return result
    return _fetch_upcitemdb(barcode)


def _parse_ocr_text(text: str):
    lines = [l.strip() for l in text.splitlines() if l.strip()]
    name = lines[0] if lines else None

    price = None
    price_match = re.search(r'\$?\s*(\d{1,6}[.,]\d{2})', text)
    if price_match:
        price = float(price_match.group(1).replace(",", "."))

    CATEGORIES = [
        "alimento", "bebida", "limpieza", "higiene", "electrónico",
        "ropa", "herramienta", "lácteo", "cereal", "snack",
    ]
    category = None
    text_lower = text.lower()
    for cat in CATEGORIES:
        if cat in text_lower:
            category = cat.title()
            break

    return {"name": name, "category": category, "price": price, "raw_text": text}


@router.get("/sku/{barcode}")
def lookup_sku(barcode: str, conn=Depends(get_db), _=Depends(get_current_user)):
    cur = conn.cursor()
    cur.execute(
        "SELECT id,sku,name,description,category,unit,min_stock,price,created_at "
        "FROM products WHERE sku=?",
        (barcode,),
    )
    row = cur.fetchone()
    if not row:
        raise HTTPException(404, "SKU not found")
    return _row_to_dict(row)


@router.get("/lookup/{barcode}")
def external_lookup(barcode: str, _=Depends(get_current_user)):
    result = _fetch_external(barcode)
    if not result:
        raise HTTPException(404, "Product not found in external databases")
    return result


@router.post("/ocr")
async def ocr_image(image: UploadFile = File(...), _=Depends(get_current_user)):
    if not _pytesseract_available:
        raise HTTPException(503, "pytesseract not installed")
    contents = await image.read()
    img = _PILImage.open(_io.BytesIO(contents))
    raw_text = pytesseract.image_to_string(img, lang="spa+eng")
    return _parse_ocr_text(raw_text)
```

- [ ] **Step 4: Register scan router in app/main.py**

Change the import line from:
```python
from app.routers import auth as auth_router
from app.routers import users, products, locations, inventory, movements, reports, backup, export, shortcut
```
to:
```python
from app.routers import auth as auth_router
from app.routers import users, products, locations, inventory, movements, reports, backup, export, shortcut, scan
```

And add after `app.include_router(shortcut.router)`:
```python
app.include_router(scan.router)
```

- [ ] **Step 5: Add pytesseract to requirements.txt**

Add at end of `requirements.txt`:
```
# optional — server-side OCR; requires Tesseract binary: https://github.com/UB-Mannheim/tesseract/wiki
pytesseract==0.3.13
```

- [ ] **Step 6: Run scan tests**

```
pytest tests/test_scan.py -v
```
Expected: all scan tests PASS

- [ ] **Step 7: Run full suite**

```
pytest tests/ -v
```
Expected: all tests PASS

- [ ] **Step 8: Commit**

```bash
git add app/routers/scan.py app/main.py requirements.txt tests/test_scan.py
git commit -m "feat: add scan router (SKU lookup, external API, optional OCR)"
```

---

## Task 3: Bundle html5-qrcode + update index.html

**Files:**
- Create: `www/js/html5-qrcode.min.js`
- Modify: `www/index.html`

- [ ] **Step 1: Download html5-qrcode 2.3.8 locally**

Run from project root in PowerShell:
```powershell
Invoke-WebRequest -Uri "https://unpkg.com/html5-qrcode@2.3.8/html5-qrcode.min.js" -OutFile "www/js/html5-qrcode.min.js"
```

Verify (~200KB):
```powershell
Get-Item www/js/html5-qrcode.min.js | Select-Object Name, Length
```
Expected: `Length` around 200000

- [ ] **Step 2: Add script tag to www/index.html before chart.min.js**

Change:
```html
  <script src="/js/chart.min.js"></script>
  <script type="module" src="/js/app.js"></script>
```
To:
```html
  <script src="/js/html5-qrcode.min.js"></script>
  <script src="/js/chart.min.js"></script>
  <script type="module" src="/js/app.js"></script>
```

- [ ] **Step 3: Commit**

```bash
git add www/js/html5-qrcode.min.js www/index.html
git commit -m "feat: bundle html5-qrcode 2.3.8 for offline use"
```

---

## Task 4: Add scan CSS to app.css

**Files:**
- Modify: `www/css/app.css`

- [ ] **Step 1: Append scan styles at end of www/css/app.css**

```css
/* ── Scan overlay ── */
.scan-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.85);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}

.scan-modal {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 12px;
  width: min(480px, 96vw);
  max-height: 90vh;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
}

.scan-modal-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 20px 12px;
  border-bottom: 1px solid var(--border);
}

.scan-modal-header h2 {
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
  margin: 0;
}

.scan-close-btn {
  background: none;
  border: none;
  color: var(--text-2);
  font-size: 18px;
  cursor: pointer;
  padding: 4px 8px;
  border-radius: 4px;
}

.scan-close-btn:hover { background: var(--bg-hover, rgba(255,255,255,0.06)); }

.scan-tabs {
  display: flex;
  border-bottom: 1px solid var(--border);
}

.scan-tab {
  flex: 1;
  padding: 10px;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s, border-color 0.15s;
}

.scan-tab.active {
  color: var(--accent);
  border-bottom-color: var(--accent);
}

.scan-body {
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 10px;
}

#scan-reader {
  width: 100%;
  max-width: 400px;
  border-radius: 8px;
  overflow: hidden;
}

.scan-video {
  width: 100%;
  max-width: 400px;
  border-radius: 8px;
  background: #000;
}

.scan-capture-btn { width: 100%; max-width: 400px; }

.scan-status {
  padding: 6px 20px 10px;
  font-size: 12px;
  color: var(--text-2);
  text-align: center;
  min-height: 28px;
}

.scan-preview {
  padding: 12px 20px 16px;
  border-top: 1px solid var(--border);
}

.scan-preview h3 {
  font-size: 13px;
  color: var(--text-2);
  margin: 0 0 8px;
}

.scan-preview-field {
  display: flex;
  gap: 8px;
  font-size: 13px;
  margin-bottom: 4px;
  color: var(--text-1);
}

.scan-preview-label {
  color: var(--text-2);
  min-width: 80px;
  flex-shrink: 0;
}

.scan-preview-actions {
  display: flex;
  gap: 8px;
  margin-top: 12px;
}
```

- [ ] **Step 2: Commit**

```bash
git add www/css/app.css
git commit -m "feat: add scan modal CSS"
```

---

## Task 5: Create scan.js module

**Files:**
- Create: `www/js/scan.js`

- [ ] **Step 1: Create www/js/scan.js**

```javascript
import { getSession } from './session.js';

let _scanner = null;
let _stream = null;
let _onResult = null;
let _tesseractLoaded = false;

export function openScanModal(onResult) {
  _onResult = onResult;
  document.body.insertAdjacentHTML('beforeend', _buildHTML());

  const overlay = document.getElementById('scan-overlay');
  document.getElementById('scan-close').addEventListener('click', _closeModal);
  overlay.addEventListener('click', e => { if (e.target === overlay) _closeModal(); });
  document.getElementById('tab-barcode').addEventListener('click', () => _switchTab('barcode'));
  document.getElementById('tab-ocr').addEventListener('click', () => _switchTab('ocr'));
  document.getElementById('btn-capture').addEventListener('click', _captureAndOCR);

  _switchTab('barcode');
}

function _buildHTML() {
  return `
    <div class="scan-overlay" id="scan-overlay">
      <div class="scan-modal">
        <div class="scan-modal-header">
          <h2>📷 Escanear producto</h2>
          <button class="scan-close-btn" id="scan-close">✕</button>
        </div>
        <div class="scan-tabs">
          <button class="scan-tab active" id="tab-barcode">Código de barras</button>
          <button class="scan-tab" id="tab-ocr">Texto (OCR)</button>
        </div>
        <div class="scan-body">
          <div id="scan-reader"></div>
          <video id="scan-video" class="scan-video hidden" autoplay playsinline muted></video>
          <button class="btn btn-primary scan-capture-btn hidden" id="btn-capture">📸 Capturar y leer</button>
        </div>
        <div class="scan-status" id="scan-status"></div>
        <div class="scan-preview hidden" id="scan-preview">
          <h3>Datos detectados:</h3>
          <div id="scan-preview-content"></div>
          <div class="scan-preview-actions">
            <button class="btn btn-primary" id="btn-use-data">Usar datos</button>
            <button class="btn btn-secondary" id="btn-scan-retry">Reintentar</button>
          </div>
        </div>
      </div>
    </div>`;
}

async function _switchTab(mode) {
  await _stopAll();
  document.getElementById('tab-barcode').classList.toggle('active', mode === 'barcode');
  document.getElementById('tab-ocr').classList.toggle('active', mode === 'ocr');
  document.getElementById('scan-reader').classList.toggle('hidden', mode !== 'barcode');
  document.getElementById('scan-video').classList.toggle('hidden', mode !== 'ocr');
  document.getElementById('btn-capture').classList.toggle('hidden', mode !== 'ocr');
  document.getElementById('scan-preview').classList.add('hidden');

  if (mode === 'barcode') {
    _setStatus('Apunta la cámara al código de barras');
    await _startBarcodeScanner();
  } else {
    _setStatus('Apunta al texto de la etiqueta y captura');
    _loadTesseract();
    await _startOCRCamera();
  }
}

async function _startBarcodeScanner() {
  if (!window.Html5Qrcode) { _setStatus('Error: librería html5-qrcode no cargada'); return; }
  try {
    _scanner = new window.Html5Qrcode('scan-reader');
    await _scanner.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 150 } },
      _onBarcodeDecode,
      () => {}
    );
  } catch (e) {
    _setStatus('Sin acceso a cámara: ' + e.message);
  }
}

async function _startOCRCamera() {
  try {
    _stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
    document.getElementById('scan-video').srcObject = _stream;
  } catch (e) {
    _setStatus('Sin acceso a cámara: ' + e.message);
  }
}

function _loadTesseract() {
  if (_tesseractLoaded || typeof Tesseract !== 'undefined') return;
  const s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
  s.onload = () => { _tesseractLoaded = true; };
  document.head.appendChild(s);
}

async function _stopAll() {
  if (_scanner) {
    await _scanner.stop().catch(() => {});
    _scanner = null;
  }
  if (_stream) {
    _stream.getTracks().forEach(t => t.stop());
    _stream = null;
  }
}

async function _onBarcodeDecode(code) {
  await _stopAll();
  _setStatus('Código: ' + code + ' — buscando...');

  const headers = { Authorization: `Bearer ${getSession()?.token}` };

  // 1. Check local SKU
  try {
    const r = await fetch(`/api/scan/sku/${encodeURIComponent(code)}`, { headers });
    if (r.ok) {
      const product = await r.json();
      _closeModal();
      _onResult({ found: true, product });
      return;
    }
  } catch {}

  // 2. External lookup
  let fields = { sku: code, name: '', category: '', price: null };
  try {
    const r = await fetch(`/api/scan/lookup/${encodeURIComponent(code)}`, { headers });
    if (r.ok) {
      const data = await r.json();
      fields = { sku: code, name: data.name || '', category: data.category || '', price: data.price ?? null };
    }
  } catch {}

  _showPreview(fields, () => { _closeModal(); _onResult({ found: false, fields }); });
}

async function _captureAndOCR() {
  const video = document.getElementById('scan-video');
  if (!video || !video.videoWidth) { _setStatus('Cámara no lista'); return; }

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  _setStatus('Analizando imagen...');

  canvas.toBlob(async blob => {
    let fields = await _runClientOCR(blob) || await _runServerOCR(blob);
    if (fields) {
      _showPreview(fields, () => { _closeModal(); _onResult({ found: false, fields }); });
    } else {
      _setStatus('No se pudo leer el texto. Intenta con mejor iluminación.');
    }
  }, 'image/jpeg', 0.85);
}

async function _runClientOCR(blob) {
  if (typeof Tesseract === 'undefined') return null;
  try {
    const worker = await Tesseract.createWorker(['spa', 'eng']);
    const { data } = await worker.recognize(blob);
    await worker.terminate();
    if (data.confidence < 40 || !data.text.trim()) return null;
    return _parseOCRText(data.text);
  } catch { return null; }
}

async function _runServerOCR(blob) {
  const fd = new FormData();
  fd.append('image', blob, 'scan.jpg');
  try {
    const r = await fetch('/api/scan/ocr', {
      method: 'POST',
      headers: { Authorization: `Bearer ${getSession()?.token}` },
      body: fd,
    });
    if (!r.ok) return null;
    const data = await r.json();
    return { sku: '', name: data.name || '', category: data.category || '', price: data.price ?? null };
  } catch { return null; }
}

function _parseOCRText(text) {
  const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
  const name = lines[0] || '';
  const priceMatch = text.match(/\$?\s*(\d{1,6}[.,]\d{2})/);
  const price = priceMatch ? parseFloat(priceMatch[1].replace(',', '.')) : null;
  return { sku: '', name, category: '', price };
}

function _showPreview(fields, onUse) {
  document.getElementById('scan-preview-content').innerHTML = `
    <div class="scan-preview-field"><span class="scan-preview-label">SKU:</span>${fields.sku || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Nombre:</span>${fields.name || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Categoría:</span>${fields.category || '—'}</div>
    <div class="scan-preview-field"><span class="scan-preview-label">Precio:</span>${fields.price != null ? '$' + Number(fields.price).toFixed(2) : '—'}</div>
  `;
  document.getElementById('scan-preview').classList.remove('hidden');
  _setStatus('');

  document.getElementById('btn-use-data').onclick = onUse;
  document.getElementById('btn-scan-retry').onclick = () => {
    document.getElementById('scan-preview').classList.add('hidden');
    const mode = document.getElementById('tab-barcode').classList.contains('active') ? 'barcode' : 'ocr';
    _switchTab(mode);
  };
}

function _setStatus(msg) {
  const el = document.getElementById('scan-status');
  if (el) el.textContent = msg;
}

async function _closeModal() {
  await _stopAll();
  document.getElementById('scan-overlay')?.remove();
}
```

- [ ] **Step 2: Commit**

```bash
git add www/js/scan.js
git commit -m "feat: add scan.js module (barcode + OCR flow)"
```

---

## Task 6: Update products.js — price field + scan button

**Files:**
- Modify: `www/js/views/products.js`

- [ ] **Step 1: Replace www/js/views/products.js**

```javascript
import { api } from '../api.js';
import { modal, confirm, toast, renderTable } from '../components.js';
import { t } from '../i18n.js';
import { openScanModal } from '../scan.js';

export async function renderProducts(container, session) {
  let products = [];

  function productForm(p = {}) {
    return `
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.sku}</label>
          <input id="f-sku" value="${p.sku || ''}" ${p.id ? 'readonly' : 'required'}>
        </div>
        <div class="form-group">
          <label>${t.products.name}</label>
          <input id="f-name" value="${p.name || ''}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.category}</label>
          <input id="f-cat" value="${p.category || ''}">
        </div>
        <div class="form-group">
          <label>${t.products.unit}</label>
          <input id="f-unit" value="${p.unit || 'pcs'}" required>
        </div>
      </div>
      <div class="form-row">
        <div class="form-group">
          <label>${t.products.minStock}</label>
          <input id="f-min" type="number" min="0" value="${p.min_stock ?? 0}" required>
        </div>
        <div class="form-group">
          <label>Precio</label>
          <input id="f-price" type="number" step="0.01" min="0" value="${p.price ?? ''}">
        </div>
      </div>
      <div class="form-row">
        <div class="form-group" style="flex:1">
          <label>${t.products.description}</label>
          <input id="f-desc" value="${p.description || ''}">
        </div>
      </div>`;
  }

  async function load() {
    products = await api.get('/api/products') || [];
    render();
  }

  function render(filter = '', catFilter = '') {
    const cats = [...new Set(products.map(p => p.category).filter(Boolean))].sort();

    const visible = products.filter(p => {
      const q = filter.toLowerCase();
      const matchText = !q || p.name.toLowerCase().includes(q) || p.sku.toLowerCase().includes(q);
      const matchCat  = !catFilter || p.category === catFilter;
      return matchText && matchCat;
    });

    const actions = [
      { key: 'print', label: '🖨', style: 'secondary', onClick: printLabel },
      ...(session.role === 'admin' ? [
        { key: 'edit',   label: t.common.edit,   style: 'secondary', onClick: openEdit },
        { key: 'delete', label: t.common.delete, style: 'danger',    onClick: doDelete },
      ] : []),
    ];

    container.innerHTML = `
      <div class="toolbar">
        <div class="toolbar-left">
          <input class="search-input" id="search" placeholder="${t.products.search}" value="${filter}">
          <select id="cat-filter" style="background:var(--bg-card);border:1px solid var(--border);border-radius:6px;color:var(--text-1);padding:7px 10px;font-size:12px;outline:none">
            <option value="">Todas las categorías</option>
            ${cats.map(c => `<option value="${c}" ${c === catFilter ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
        <div class="toolbar-right">
          <button class="btn btn-secondary" id="btn-scan">📷 Escanear</button>
          ${session.role === 'admin' ? `<button class="btn btn-primary" id="btn-new">+ ${t.products.new}</button>` : ''}
        </div>
      </div>
      <div class="card" id="table-area"></div>`;

    renderTable(
      document.getElementById('table-area'),
      [
        { key: 'sku',       label: t.products.sku },
        { key: 'name',      label: t.products.name },
        { key: 'category',  label: t.products.category },
        { key: 'unit',      label: t.products.unit },
        { key: 'min_stock', label: t.products.minStock },
        {
          key: 'price',
          label: 'Precio',
          render: p => p.price != null ? `$${Number(p.price).toFixed(2)}` : '—',
        },
      ],
      visible,
      actions
    );

    document.getElementById('search').addEventListener('input', e =>
      render(e.target.value, document.getElementById('cat-filter').value));
    document.getElementById('cat-filter').addEventListener('change', e =>
      render(document.getElementById('search').value, e.target.value));
    document.getElementById('btn-new')?.addEventListener('click', () => openCreate());
    document.getElementById('btn-scan').addEventListener('click', () => {
      openScanModal(({ found, product, fields }) => {
        if (found) {
          if (session.role === 'admin') {
            openEdit(product);
          } else {
            toast(`Producto: ${product.name} (SKU: ${product.sku})`);
          }
        } else {
          if (session.role === 'admin') {
            openCreate(fields);
          } else {
            toast('Producto no encontrado en inventario', 'error');
          }
        }
      });
    });
  }

  function printLabel(p) {
    const win = window.open('', '_blank', 'width=320,height=240');
    win.document.write(`<!DOCTYPE html>
<html>
<head>
  <style>
    @page { size: 57mm 32mm; margin: 2mm; }
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, sans-serif; width: 53mm; }
    .name { font-size: 9pt; font-weight: bold; margin-bottom: 2mm; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .sku  { font-size: 7pt; color: #444; text-align: center; margin-top: 1mm; }
  </style>
  <script src="https://cdn.jsdelivr.net/npm/jsbarcode@3.11.6/dist/JsBarcode.all.min.js"><\/script>
</head>
<body>
  <div class="name">${p.name}</div>
  <svg id="bc"></svg>
  <div class="sku">${p.sku}</div>
  <script>
    JsBarcode('#bc','${p.sku}',{format:'CODE128',width:1.5,height:40,displayValue:false,margin:0});
    setTimeout(()=>window.print(),300);
  <\/script>
</body>
</html>`);
    win.document.close();
  }

  function openCreate(prefill = {}) {
    modal(`+ ${t.products.new}`, productForm(prefill), async el => {
      const body = {
        sku:         el.querySelector('#f-sku').value.trim(),
        name:        el.querySelector('#f-name').value.trim(),
        category:    el.querySelector('#f-cat').value.trim() || null,
        unit:        el.querySelector('#f-unit').value.trim(),
        min_stock:   +el.querySelector('#f-min').value,
        price:       el.querySelector('#f-price').value ? +el.querySelector('#f-price').value : null,
        description: el.querySelector('#f-desc').value.trim() || null,
      };
      try {
        await api.post('/api/products', body);
        el.remove();
        toast('Producto creado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  function openEdit(p) {
    modal(`${t.common.edit}: ${p.name}`, productForm(p), async el => {
      const body = {
        name:        el.querySelector('#f-name').value.trim(),
        category:    el.querySelector('#f-cat').value.trim() || null,
        unit:        el.querySelector('#f-unit').value.trim(),
        min_stock:   +el.querySelector('#f-min').value,
        price:       el.querySelector('#f-price').value ? +el.querySelector('#f-price').value : null,
        description: el.querySelector('#f-desc').value.trim() || null,
      };
      try {
        await api.put(`/api/products/${p.id}`, body);
        el.remove();
        toast('Producto actualizado');
        await load();
      } catch (e) { toast(e.message, 'error'); }
    });
  }

  async function doDelete(p) {
    if (!await confirm(t.products.confirmDelete)) return;
    try {
      await api.del(`/api/products/${p.id}`);
      toast('Producto eliminado');
      await load();
    } catch (e) { toast(e.message, 'error'); }
  }

  await load();
}
```

- [ ] **Step 2: Run full test suite**

```
pytest tests/ -v
```
Expected: all tests PASS

- [ ] **Step 3: Commit**

```bash
git add www/js/views/products.js
git commit -m "feat: add price field and scan button to products view"
```

---

## Self-Review

**Spec coverage:**
- Feature inside existing product form ✓ (scan button in toolbar, opens overlay modal)
- Phone browser on local IP ✓ (html5-qrcode works in mobile browsers via HTTPS or localhost)
- Barcode + QR scan ✓ (html5-qrcode handles both formats)
- Barcode fallback layered: SKU exists → open product ✓ → external API → pre-fill ✓ → SKU only ✓ (fields.sku=code, name='')
- OCR fallback ✓ (Tesseract.js client-side → pytesseract server)
- Tesseract server optional ✓ (`_pytesseract_available` flag, HTTP 503 if missing, scan.js handles gracefully)
- Pre-fill name + category + price ✓ (all three passed in `fields` object)
- User confirms before save ✓ (scan opens create/edit modal, user presses Save)

**Placeholder scan:** None found.

**Type consistency:** `_row_to_dict` in products.py matches import in scan.py ✓. `fields` object shape `{sku, name, category, price}` matches `productForm(p)` fields ✓. `openScanModal` callback shape `{found, product?, fields?}` matches products.js handler ✓.

**One note:** `HTTPS required for camera` on non-localhost. The app runs on `http://localhost:PORT` for the desktop user. For phone access on local IP (`http://192.168.x.x`), browsers block `getUserMedia` without HTTPS. If mobile scan is needed, either add a self-signed cert or use `chrome://flags/#unsafely-treat-insecure-origin-as-secure`. Document this in README if mobile scan is a priority.
