# HTTPS LAN Access Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable camera access on LAN phones by adding self-signed HTTPS to the launcher.

**Architecture:** Single uvicorn server on `0.0.0.0:8080` with auto-generated self-signed cert. Cert stored in `AppData/InventaryCare/`, regenerated when missing/expiring/IP-changed. Tray shows LAN URL. All changes in `launcher.py` and `inventarycare.spec`.

**Tech Stack:** Python `cryptography` lib (already installed via `python-jose[cryptography]`), `ssl` stdlib, `socket` stdlib, `uvicorn` SSL params.

---

## File Map

| File | Action | Responsibility |
|------|--------|----------------|
| `launcher.py` | Modify | Add `_get_local_ip`, `_ensure_ssl_cert`; update `_run_server`, `URL`, health check, tray menu |
| `inventarycare.spec` | Modify | Add cryptography hidden imports for PyInstaller |
| `tests/test_launcher.py` | Create | Unit tests for `_get_local_ip` and `_ensure_ssl_cert` |

---

### Task 1: TDD `_get_local_ip()`

**Files:**
- Create: `tests/test_launcher.py`
- Modify: `launcher.py`

- [ ] **Step 1: Write the failing test**

Create `tests/test_launcher.py`:

```python
import socket
import pytest
from launcher import _get_local_ip


def test_get_local_ip_returns_valid_ip():
    ip = _get_local_ip()
    parts = ip.split(".")
    assert len(parts) == 4
    assert all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


def test_get_local_ip_fallback_on_error(monkeypatch):
    class _BadSocket:
        def __init__(self, *a, **kw):
            pass
        def connect(self, *a, **kw):
            raise OSError("network unreachable")

    monkeypatch.setattr(socket, "socket", _BadSocket)
    assert _get_local_ip() == "127.0.0.1"
```

- [ ] **Step 2: Run test to verify it fails**

```
cd D:\Codigo Abierto\InventoryCare
venv\Scripts\activate
pytest tests/test_launcher.py -v
```

Expected: `ImportError` or `AttributeError: module 'launcher' has no attribute '_get_local_ip'`

- [ ] **Step 3: Add `_get_local_ip` to `launcher.py`**

Add after the `_log` function (line 27), before `_load_icon`:

```python
def _get_local_ip() -> str:
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        _log("[launcher] could not detect local IP, defaulting to 127.0.0.1")
        return "127.0.0.1"
```

- [ ] **Step 4: Run test to verify it passes**

```
pytest tests/test_launcher.py::test_get_local_ip_returns_valid_ip tests/test_launcher.py::test_get_local_ip_fallback_on_error -v
```

Expected: `2 passed`

- [ ] **Step 5: Commit**

```bash
git add tests/test_launcher.py launcher.py
git commit -m "feat(launcher): add _get_local_ip with tests"
```

---

### Task 2: TDD `_ensure_ssl_cert()`

**Files:**
- Modify: `tests/test_launcher.py`
- Modify: `launcher.py`

- [ ] **Step 1: Append failing tests to `tests/test_launcher.py`**

Add after the existing tests:

```python
import datetime
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from launcher import _ensure_ssl_cert


def test_ensure_ssl_cert_creates_files(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, key_path = _ensure_ssl_cert("192.168.1.42")
    assert cert_path.exists()
    assert key_path.exists()


def test_ensure_ssl_cert_has_correct_sans(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    ips = [str(a) for a in san.value.get_values_for_type(x509.IPAddress)]
    dns = san.value.get_values_for_type(x509.DNSName)
    assert "127.0.0.1" in ips
    assert "192.168.1.42" in ips
    assert "localhost" in dns


def test_ensure_ssl_cert_reuses_valid_cert(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    mtime1 = cert_path.stat().st_mtime
    _ensure_ssl_cert("192.168.1.42")
    assert cert_path.stat().st_mtime == mtime1  # file not touched


def test_ensure_ssl_cert_regenerates_when_ip_changes(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    _ensure_ssl_cert("192.168.1.42")
    cert_path, _ = _ensure_ssl_cert("192.168.1.99")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    ips = [str(a) for a in san.value.get_values_for_type(x509.IPAddress)]
    assert "192.168.1.99" in ips
    assert "192.168.1.42" not in ips


def test_ensure_ssl_cert_regenerates_when_corrupt(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    (tmp_path / "cert.pem").write_text("not a cert")
    (tmp_path / "key.pem").write_text("not a key")
    cert_path, key_path = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    assert cert is not None


def test_ensure_ssl_cert_valid_one_year(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    delta = cert.not_valid_after - cert.not_valid_before
    assert delta.days >= 364
```

- [ ] **Step 2: Run tests to verify they fail**

```
pytest tests/test_launcher.py -k "ssl_cert" -v
```

Expected: `ImportError` or `AttributeError: module 'launcher' has no attribute '_ensure_ssl_cert'`

- [ ] **Step 3: Add `_ensure_ssl_cert` to `launcher.py`**

Add after `_get_local_ip`, before `_load_icon`:

```python
def _ensure_ssl_cert(ip: str):
    import datetime
    import ipaddress
    from cryptography import x509
    from cryptography.x509.oid import NameOID
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import rsa
    from cryptography.hazmat.backends import default_backend

    cert_path = _log_dir / "cert.pem"
    key_path = _log_dir / "key.pem"

    def _needs_regen() -> bool:
        if not cert_path.exists() or not key_path.exists():
            return True
        try:
            cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
            if (cert.not_valid_after - datetime.datetime.utcnow()) < datetime.timedelta(days=7):
                return True
            san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
            ip_addrs = [str(a) for a in san.value.get_values_for_type(x509.IPAddress)]
            if ip != "127.0.0.1" and ip not in ip_addrs:
                return True
            return False
        except Exception:
            return True

    if not _needs_regen():
        return cert_path, key_path

    _log(f"[ssl] generating self-signed cert for IP {ip}...")
    private_key = rsa.generate_private_key(
        public_exponent=65537,
        key_size=2048,
        backend=default_backend(),
    )
    subject = issuer = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "localhost")])
    san_list = [
        x509.DNSName("localhost"),
        x509.IPAddress(ipaddress.IPv4Address("127.0.0.1")),
    ]
    if ip != "127.0.0.1":
        san_list.append(x509.IPAddress(ipaddress.IPv4Address(ip)))
    now = datetime.datetime.utcnow()
    cert = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer)
        .public_key(private_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + datetime.timedelta(days=365))
        .add_extension(x509.SubjectAlternativeName(san_list), critical=False)
        .sign(private_key, hashes.SHA256(), default_backend())
    )
    cert_path.write_bytes(cert.public_bytes(serialization.Encoding.PEM))
    key_path.write_bytes(private_key.private_bytes(
        serialization.Encoding.PEM,
        serialization.PrivateFormat.TraditionalOpenSSL,
        serialization.NoEncryption(),
    ))
    _log(f"[ssl] cert written to {cert_path}")
    return cert_path, key_path
```

- [ ] **Step 4: Run all launcher tests**

```
pytest tests/test_launcher.py -v
```

Expected: `8 passed`

- [ ] **Step 5: Run full test suite to check no regressions**

```
pytest -v
```

Expected: `31 passed` (23 existing + 8 new)

- [ ] **Step 6: Commit**

```bash
git add tests/test_launcher.py launcher.py
git commit -m "feat(launcher): add _ensure_ssl_cert with tests"
```

---

### Task 3: Wire HTTPS into `main()` and update `_run_server`

**Files:**
- Modify: `launcher.py`

No unit tests for this task — uvicorn and pystray require a running system to test. Verified manually.

- [ ] **Step 1: Add `import ssl` to top-level imports in `launcher.py`**

Change the imports block at the top of `launcher.py` from:

```python
import os
import sys
import threading
import webbrowser
import time
import traceback
from pathlib import Path
```

To:

```python
import os
import ssl
import sys
import threading
import webbrowser
import time
import traceback
from pathlib import Path
```

- [ ] **Step 2: Update `URL` constant**

Change:

```python
URL = f"http://localhost:{PORT}"
```

To:

```python
URL = f"https://localhost:{PORT}"
```

- [ ] **Step 3: Update `_run_server` signature and body**

Replace the entire `_run_server` function:

```python
def _run_server(cert: Path, key: Path):
    try:
        _log("[server] importing app...")
        from app.main import app
        _log("[server] starting uvicorn...")
        log_cfg = None if not sys.stdout or not hasattr(sys.stdout, 'isatty') else "default"
        uvicorn.run(
            app,
            host="0.0.0.0",
            port=PORT,
            log_config=log_cfg,
            ssl_certfile=str(cert),
            ssl_keyfile=str(key),
        )
        _log("[server] uvicorn exited")
    except Exception:
        _log("[server] CRASH:\n" + traceback.format_exc())
```

- [ ] **Step 4: Update `main()` to call new functions and fix health check**

Replace the entire `main()` function:

```python
def main():
    local_ip = _get_local_ip()
    cert, key = _ensure_ssl_cert(local_ip)

    server_thread = threading.Thread(target=_run_server, args=(cert, key), daemon=True)
    server_thread.start()

    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    import urllib.request, urllib.error
    for _ in range(30):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"https://localhost:{PORT}/health", timeout=1, context=ctx)
            _log("[launcher] server ready")
            break
        except Exception:
            pass
    else:
        _log("[launcher] server never became ready — check inventarycare.log")

    webbrowser.open(URL)

    lan_label = (
        f"Red local: https://{local_ip}:{PORT}"
        if local_ip != "127.0.0.1"
        else "Red local: no detectada"
    )
    menu = pystray.Menu(
        pystray.MenuItem("Abrir InventaryCare", _open_browser, default=True),
        pystray.MenuItem(lan_label, None, enabled=False),
        pystray.MenuItem("Salir", _quit),
    )
    img = _load_icon()
    if img is None:
        try:
            from PIL import Image
            img = Image.new("RGB", (64, 64), (29, 78, 216))
        except Exception:
            _log("[launcher] PIL unavailable — no tray icon")
            return
    icon = pystray.Icon("InventaryCare", img, "InventaryCare", menu)
    icon.run()
    sys.exit(0)
```

- [ ] **Step 5: Run full test suite to verify no regressions**

```
pytest -v
```

Expected: `31 passed`

- [ ] **Step 6: Manual smoke test**

```
python launcher.py
```

- Browser opens `https://localhost:8080`
- Browser shows "Your connection is not private" warning — click Advanced → Proceed
- App loads normally
- Tray icon shows "Red local: https://192.168.x.x:8080" (or "no detectada" if no WiFi)

- [ ] **Step 7: Commit**

```bash
git add launcher.py
git commit -m "feat(launcher): wire HTTPS — SSL cert, URL, health check, tray LAN URL"
```

---

### Task 4: Update `inventarycare.spec` with cryptography hidden imports

**Files:**
- Modify: `inventarycare.spec`

- [ ] **Step 1: Add cryptography hidden imports**

In `inventarycare.spec`, find the `hiddenimports` list and add these entries after `'et_xmlfile'`:

```python
        'cryptography',
        'cryptography.hazmat.primitives',
        'cryptography.hazmat.primitives.asymmetric',
        'cryptography.hazmat.primitives.asymmetric.rsa',
        'cryptography.hazmat.primitives.hashes',
        'cryptography.hazmat.primitives.serialization',
        'cryptography.x509',
        'cryptography.x509.oid',
        'cryptography.hazmat.backends',
        'cryptography.hazmat.backends.default_backend',
```

- [ ] **Step 2: Commit**

```bash
git add inventarycare.spec
git commit -m "build(spec): add cryptography hidden imports for SSL cert generation"
```

---

## Verification Checklist

After all tasks complete:

- [ ] `pytest -v` shows `31 passed`, `0 failed`
- [ ] `python launcher.py` opens `https://localhost:8080` in browser
- [ ] Browser cert warning appears, app loads after accepting
- [ ] Tray menu shows LAN URL item
- [ ] Phone on same WiFi can open the LAN URL and use the camera for scanning
- [ ] Second launch: no cert regeneration (cert reused from AppData)
