import os
import sys
import threading
import webbrowser
import time
import traceback
from pathlib import Path

import uvicorn
import pystray

PORT = 8080
URL = f"http://localhost:{PORT}"

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


def _run_server():
    try:
        _log("[server] importing app...")
        from app.main import app
        _log("[server] starting uvicorn...")
        # Disable uvicorn logging when no console (frozen without console window)
        log_cfg = None if not sys.stdout or not hasattr(sys.stdout, 'isatty') else "default"
        uvicorn.run(app, host="0.0.0.0", port=PORT, log_config=log_cfg)
        _log("[server] uvicorn exited")
    except Exception:
        _log("[server] CRASH:\n" + traceback.format_exc())


def _open_browser(icon=None, item=None):
    webbrowser.open(URL)


def _quit(icon, item):
    icon.stop()


def main():
    server_thread = threading.Thread(target=_run_server, daemon=True)
    server_thread.start()

    # Wait until server responds (up to 15s)
    import urllib.request, urllib.error
    for _ in range(30):
        time.sleep(0.5)
        try:
            urllib.request.urlopen(f"http://localhost:{PORT}/health", timeout=1)
            _log("[launcher] server ready")
            break
        except Exception:
            pass
    else:
        _log("[launcher] server never became ready — check inventarycare.log")

    webbrowser.open(URL)

    menu = pystray.Menu(
        pystray.MenuItem("Abrir InventaryCare", _open_browser, default=True),
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
