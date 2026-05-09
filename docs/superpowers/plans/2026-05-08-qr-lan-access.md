# QR LAN Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a QR code card in the Settings view so admins can show workers how to access the app from their phones on the same WiFi network.

**Architecture:** New FastAPI router detects LAN IP at request time (socket trick); frontend fetches the URL and renders a QR code using a locally-bundled `qrcode.min.js` library; new card added at the top of the settings grid.

**Tech Stack:** FastAPI (Python), socket stdlib, vanilla JS, qrcodejs library (davidshimjs, ~10KB, bundled offline).

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `app/routers/system.py` | Create | LAN URL detection endpoint |
| `app/main.py` | Modify | Register system router |
| `www/js/qrcode.min.js` | Create | Bundled QR code generator library |
| `www/js/views/settings.js` | Modify | Add QR card with lazy lib loading |
| `tests/test_system.py` | Create | Tests for /api/system/lan-url |

---

### Task 1: Backend `/api/system/lan-url` endpoint

**Files:**
- Create: `app/routers/system.py`
- Modify: `app/main.py`
- Test: `tests/test_system.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_system.py`:

```python
import pytest

PORT = 8080


def test_lan_url_no_auth_required(client):
    r = client.get("/api/system/lan-url")
    assert r.status_code == 200


def test_lan_url_returns_expected_keys(client):
    r = client.get("/api/system/lan-url")
    data = r.json()
    assert "url" in data
    assert "lan_ip" in data


def test_lan_url_values_consistent(client):
    r = client.get("/api/system/lan-url")
    data = r.json()
    if data["lan_ip"] is not None:
        parts = data["lan_ip"].split(".")
        assert len(parts) == 4
        assert all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)
        assert data["url"] == f"https://{data['lan_ip']}:{PORT}"
    else:
        assert data["url"] is None
```

- [ ] **Step 2: Run tests to verify they fail**

```
cd "D:\Codigo Abierto\InventoryCare"
python -m pytest tests/test_system.py -v
```

Expected: `404` errors — route doesn't exist yet.

- [ ] **Step 3: Create `app/routers/system.py`**

```python
import socket
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])

_PORT = 8080


@router.get("/lan-url")
def get_lan_url():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
        return {"url": f"https://{ip}:{_PORT}", "lan_ip": ip}
    except Exception:
        return {"url": None, "lan_ip": None}
```

- [ ] **Step 4: Register router in `app/main.py`**

Add import after the existing `scan` import on line 12:

```python
from app.routers import auth as auth_router
from app.routers import users, products, locations, inventory, movements, reports, backup, export, shortcut, scan, system
```

Add router registration after `scan.router` on line 45:

```python
app.include_router(scan.router)
app.include_router(system.router)
```

- [ ] **Step 5: Run tests to verify they pass**

```
python -m pytest tests/test_system.py -v
```

Expected: `3 passed`

- [ ] **Step 6: Run full suite to check no regressions**

```
python -m pytest -v
```

Expected: `34 passed` (31 existing + 3 new)

- [ ] **Step 7: Commit**

```bash
git add app/routers/system.py app/main.py tests/test_system.py
git commit -m "feat(api): add /api/system/lan-url endpoint"
```

---

### Task 2: Bundle `qrcode.min.js` locally

**Files:**
- Create: `www/js/qrcode.min.js`

No automated tests — verified by Task 3 (the card renders a QR).

- [ ] **Step 1: Download the library**

```
cd "D:\Codigo Abierto\InventoryCare"
python -c "import urllib.request; urllib.request.urlretrieve('https://raw.githubusercontent.com/davidshimjs/qrcodejs/master/qrcode.min.js', 'www/js/qrcode.min.js'); print('Downloaded OK')"
```

Expected output: `Downloaded OK`

- [ ] **Step 2: Verify the file exists and is not empty**

```
python -c "from pathlib import Path; f=Path('www/js/qrcode.min.js'); print(f'Size: {f.stat().st_size} bytes'); assert f.stat().st_size > 5000"
```

Expected: `Size: XXXXX bytes` (should be ~10KB+)

- [ ] **Step 3: Commit**

```bash
git add www/js/qrcode.min.js
git commit -m "chore: bundle qrcode.min.js for offline QR generation"
```

---

### Task 3: QR card in Settings view

**Files:**
- Modify: `www/js/views/settings.js`

No automated tests — verify manually by opening Settings in the app.

- [ ] **Step 1: Add QR card and lazy loader to `settings.js`**

Replace the entire content of `www/js/views/settings.js` with:

```javascript
import { toast } from '../components.js';
import { getSession } from '../session.js';

function _loadQrLib() {
  return new Promise((resolve) => {
    if (typeof QRCode !== 'undefined') { resolve(); return; }
    const s = document.createElement('script');
    s.src = '/js/qrcode.min.js';
    s.onload = resolve;
    s.onerror = resolve;
    document.head.appendChild(s);
  });
}

async function _renderQrCard() {
  await _loadQrLib();
  try {
    const res = await fetch('/api/system/lan-url');
    const { url, lan_ip } = await res.json();
    const container = document.getElementById('qr-container');
    const textEl = document.getElementById('lan-url-text');
    if (url && typeof QRCode !== 'undefined') {
      new QRCode(container, { text: url, width: 150, height: 150 });
      textEl.textContent = url;
    } else if (url) {
      container.textContent = '';
      textEl.textContent = url;
    } else {
      container.textContent = 'No conectado a red local. Conecta la computadora a una red WiFi.';
    }
  } catch {
    const container = document.getElementById('qr-container');
    if (container) container.textContent = 'Error al obtener dirección de red.';
  }
}

export function renderSettings(container) {
  container.innerHTML = `
    <div class="settings-grid">

      <div class="card settings-card">
        <h3>📱 Acceso desde teléfono</h3>
        <p>Escanea este código con la cámara de tu celular para abrir InventaryCare en tu teléfono.</p>
        <div id="qr-container" style="margin:16px 0;min-height:40px"></div>
        <div id="lan-url-text" style="font-size:12px;color:var(--text-2);word-break:break-all"></div>
      </div>

      <div class="card settings-card">
        <h3>Backup de base de datos</h3>
        <p>Descarga una copia del archivo de base de datos. Guárdala en un lugar seguro.</p>
        <button class="btn btn-primary" id="btn-backup">Descargar backup</button>
      </div>

      <div class="card settings-card">
        <h3>Restaurar base de datos</h3>
        <p>Reemplaza la base de datos actual con un archivo de backup previamente descargado. <strong>Esta acción no se puede deshacer.</strong></p>
        <label class="btn btn-secondary" style="cursor:pointer">
          Seleccionar archivo .db
          <input type="file" id="file-restore" accept=".db" style="display:none">
        </label>
        <span id="restore-filename" style="margin-left:10px;font-size:13px;color:var(--text-3)"></span>
        <br><br>
        <button class="btn btn-danger" id="btn-restore" disabled>Restaurar</button>
      </div>

    </div>`;

  _renderQrCard();

  // Backup
  document.getElementById('btn-backup').addEventListener('click', () => {
    const s = getSession();
    const a = document.createElement('a');
    a.href = '/api/backup';
    a.download = 'inventarycare_backup.db';
    fetch('/api/backup', { headers: { Authorization: `Bearer ${s.token}` } })
      .then(r => {
        if (!r.ok) throw new Error('Error al generar backup');
        return r.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        a.href = url;
        document.body.appendChild(a);
        a.click();
        a.remove();
        URL.revokeObjectURL(url);
        toast('Backup descargado');
      })
      .catch(e => toast(e.message, 'error'));
  });

  // Restore — file picker
  const fileInput = document.getElementById('file-restore');
  const btnRestore = document.getElementById('btn-restore');
  const nameLabel  = document.getElementById('restore-filename');

  fileInput.addEventListener('change', () => {
    const f = fileInput.files[0];
    if (f) {
      nameLabel.textContent = f.name;
      btnRestore.disabled = false;
    }
  });

  btnRestore.addEventListener('click', async () => {
    const f = fileInput.files[0];
    if (!f) return;
    if (!confirm('¿Restaurar la base de datos? Se perderán todos los datos actuales.')) return;

    const s = getSession();
    const form = new FormData();
    form.append('file', f);

    try {
      btnRestore.disabled = true;
      btnRestore.textContent = 'Restaurando...';
      const res = await fetch('/api/restore', {
        method: 'POST',
        headers: { Authorization: `Bearer ${s.token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.detail || 'Error al restaurar');
      }
      toast('Base de datos restaurada. Recargando...');
      setTimeout(() => window.location.reload(), 1500);
    } catch (e) {
      toast(e.message, 'error');
      btnRestore.disabled = false;
      btnRestore.textContent = 'Restaurar';
    }
  });
}
```

- [ ] **Step 2: Run full test suite**

```
python -m pytest -v
```

Expected: `34 passed`

- [ ] **Step 3: Commit**

```bash
git add www/js/views/settings.js
git commit -m "feat(ui): add QR LAN access card to Settings"
```

- [ ] **Step 4: Rebuild .exe and verify manually**

```
python -m PyInstaller inventarycare.spec -y 2>&1 | tail -3
```

Open `dist\InventaryCare\InventaryCare.exe` → login as admin → go to Configuración → verify QR code appears with the LAN URL below it.

---

## Verification Checklist

- [ ] `pytest -v` shows `34 passed`
- [ ] Settings page shows QR card as first card
- [ ] QR encodes `https://192.168.x.x:8080` (verify with phone camera or online QR reader)
- [ ] URL shown in text below QR matches QR content
- [ ] If no network: message shown instead of QR
- [ ] Existing backup/restore cards still work
