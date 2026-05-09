import os
import ssl
import sys
import threading
import webbrowser
import time
import traceback
from pathlib import Path

import uvicorn
import pystray

PORT = 8080
URL = f"https://localhost:{PORT}"

# When frozen by PyInstaller, resolve bundle root via _MEIPASS
_BUNDLE = Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).parent

_log_dir = Path(os.environ.get("APPDATA", Path.home())) / "InventaryCare"
_log_dir.mkdir(parents=True, exist_ok=True)
LOG = _log_dir / "launcher.log"
LOG.write_text("")  # reset on each launch


def _log(msg: str):
    with LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


def _get_local_ip() -> str:
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            return s.getsockname()[0]
        finally:
            s.close()
    except Exception:
        _log("[launcher] could not detect local IP, defaulting to 127.0.0.1")
        return "127.0.0.1"


def _ensure_ssl_cert(ip: str) -> tuple:
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
            if (cert.not_valid_after_utc - datetime.datetime.now(datetime.timezone.utc)) < datetime.timedelta(days=7):
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
    now = datetime.datetime.now(datetime.timezone.utc)
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


def _load_icon():
    try:
        from PIL import Image, ImageDraw
        icon_path = _BUNDLE / "assets" / "icon.ico"
        if icon_path.exists():
            return Image.open(icon_path)
        img = Image.new("RGBA", (64, 64), (29, 78, 216, 255))
        d = ImageDraw.Draw(img)
        d.rectangle([20, 28, 44, 36], fill=(255, 255, 255))
        d.rectangle([28, 20, 36, 44], fill=(255, 255, 255))
        return img
    except Exception:
        return None


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


def _open_browser(icon=None, item=None):
    webbrowser.open(URL)


def _quit(icon, item):
    icon.stop()


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


if __name__ == "__main__":
    main()
