# HTTPS LAN Access — Design Spec
Date: 2026-05-08
Status: Approved

## Goal

Enable camera access (`getUserMedia`) on mobile devices connected to the same WiFi network.
Browsers require HTTPS for `getUserMedia` on non-localhost origins — without it, the 📷 scan button silently fails on phones.

## Approach

Single HTTPS server on `0.0.0.0:8080` with a self-signed certificate.

- PC opens `https://localhost:8080` — accepts cert warning once, then works forever
- Phone opens `https://192.168.x.x:8080` — accepts cert warning once, then works forever
- Camera works on phone after accepting cert

Rejected alternative: HTTP localhost + HTTPS LAN (two servers, two ports, higher complexity).

## Architecture

All changes confined to `launcher.py` and `inventarycare.spec`. No backend or frontend changes needed.

### New functions in `launcher.py`

**`_get_local_ip() -> str`**
- Opens UDP socket toward `8.8.8.8:80` (no data sent), reads `getsockname()[0]`
- Returns LAN IP (e.g. `192.168.1.42`) or `"127.0.0.1"` on failure
- Called once at startup, result stored in module-level variable

**`_ensure_ssl_cert(ip: str) -> tuple[Path, Path]`**
- Cert/key stored at `AppData/InventaryCare/cert.pem` and `key.pem`
- On startup: if files missing, cert expires within 7 days, or detected IP not in cert SANs → regenerate
- Cert validity: 1 year
- Subject: `CN=localhost`
- SANs: `DNS:localhost`, `IP:127.0.0.1`, `IP:<detected LAN IP>`
- Uses `cryptography` library (already installed via `python-jose[cryptography]`)
- Returns `(cert_path, key_path)`

### Modified functions in `launcher.py`

**`_run_server(cert: Path, key: Path)`**
- Adds `ssl_certfile=str(cert)`, `ssl_keyfile=str(key)` to `uvicorn.run()`

**`URL` constant**
- Changes from `http://localhost:{PORT}` → `https://localhost:{PORT}`

**Health check loop in `main()`**
- URL changes to `https://localhost:{PORT}/health`
- Uses `ssl.create_default_context()` with `check_hostname=False`, `verify_mode=ssl.CERT_NONE`
- Handles self-signed cert without error

**Tray menu in `main()`**
- Adds read-only item: `"Red local: https://{ip}:{PORT}"`
- If IP detection fails (returns `127.0.0.1`): shows `"Red local: no detectada"`
- Item has no click action (`enabled=False`)

### Changes in `inventarycare.spec`

Add to `hiddenimports`:

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

No changes to `datas` or `binaries` — `cryptography` is pure Python + cffi (already bundled).

## Data Flow

```
launcher starts
  → _get_local_ip()           # detect LAN IP once
  → _ensure_ssl_cert(ip)      # generate/renew cert if needed
  → _run_server(cert, key)    # uvicorn with SSL
  → health check loop         # HTTPS with cert verification disabled
  → webbrowser.open(URL)      # https://localhost:8080
  → tray menu with LAN URL    # https://192.168.x.x:8080
```

## Error Handling

- `_get_local_ip()`: any exception → return `"127.0.0.1"`, log warning
- `_ensure_ssl_cert()`: any exception → log + re-raise (app cannot start without cert)
- Cert regeneration: if existing cert is unreadable/corrupt → delete and regenerate

## User Experience

- First launch: cert generated (~instant), browser opens with HTTPS warning
- User clicks "Advanced → Proceed" once on PC, once on phone — never again
- Tray shows LAN URL so workers know what to type on their phones
- No configuration required

## Testing

- Existing 23 tests unaffected (test client hits FastAPI directly, no SSL layer)
- Manual test: open `https://localhost:8080` in browser, verify cert accepted
- Manual test: open LAN URL on phone, verify camera button works

## Files Changed

| File | Change |
|------|--------|
| `launcher.py` | Add `_get_local_ip`, `_ensure_ssl_cert`, update `_run_server`, URL, health check, tray menu |
| `inventarycare.spec` | Add cryptography hidden imports |
