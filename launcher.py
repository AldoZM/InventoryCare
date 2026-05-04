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
    sys.exit(0)


if __name__ == "__main__":
    main()
