import os
import sys
import threading
import webbrowser
import time
import traceback
import subprocess
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

_SHORTCUT_FLAG = _log_dir / ".shortcut_offered"


def _log(msg: str):
    with LOG.open("a", encoding="utf-8") as f:
        f.write(msg + "\n")


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


def _create_shortcut():
    exe = str(_BUNDLE / "InventaryCare.exe") if getattr(sys, "frozen", False) else sys.executable
    icon_path = str(_BUNDLE / "assets" / "icon.ico")
    desktop = Path(os.environ.get("USERPROFILE", Path.home())) / "Desktop"
    shortcut = str(desktop / "InventaryCare.lnk")
    ps = (
        f'$s=(New-Object -COM WScript.Shell).CreateShortcut("{shortcut}");'
        f'$s.TargetPath="{exe}";'
        f'$s.WorkingDirectory="{_BUNDLE}";'
        f'$s.IconLocation="{icon_path}";'
        f'$s.Save()'
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, timeout=10)
    _log("[launcher] desktop shortcut created")


def _offer_shortcut():
    if _SHORTCUT_FLAG.exists():
        return

    import ctypes
    import ctypes.wintypes as wintypes

    class TASKDIALOGCONFIG(ctypes.Structure):
        _fields_ = [
            ("cbSize",                  wintypes.UINT),
            ("hwndParent",              wintypes.HWND),
            ("hInstance",               wintypes.HINSTANCE),
            ("dwFlags",                 wintypes.DWORD),
            ("dwCommonButtons",         wintypes.DWORD),
            ("pszWindowTitle",          wintypes.LPCWSTR),
            ("hMainIcon",               ctypes.c_void_p),
            ("pszMainInstruction",      wintypes.LPCWSTR),
            ("pszContent",              wintypes.LPCWSTR),
            ("cButtons",                wintypes.UINT),
            ("pButtons",                ctypes.c_void_p),
            ("nDefaultButton",          ctypes.c_int),
            ("cRadioButtons",           wintypes.UINT),
            ("pRadioButtons",           ctypes.c_void_p),
            ("nDefaultRadioButton",     ctypes.c_int),
            ("pszVerificationText",     wintypes.LPCWSTR),
            ("pszExpandedInformation",  wintypes.LPCWSTR),
            ("pszExpandedControlText",  wintypes.LPCWSTR),
            ("pszCollapsedControlText", wintypes.LPCWSTR),
            ("hFooterIcon",             ctypes.c_void_p),
            ("pszFooter",               wintypes.LPCWSTR),
            ("pfCallback",              ctypes.c_void_p),
            ("lpCallbackData",          ctypes.c_size_t),
            ("cxWidth",                 wintypes.UINT),
        ]

    TDCBF_YES_BUTTON          = 0x0002
    TDCBF_NO_BUTTON           = 0x0004
    TDF_ALLOW_DIALOG_CANCELLATION = 0x0008
    TD_INFORMATION_ICON       = 0xFFFD  # MAKEINTRESOURCEW(-3)
    IDYES = 6

    cfg = TASKDIALOGCONFIG()
    cfg.cbSize              = ctypes.sizeof(TASKDIALOGCONFIG)
    cfg.dwFlags             = TDF_ALLOW_DIALOG_CANCELLATION
    cfg.dwCommonButtons     = TDCBF_YES_BUTTON | TDCBF_NO_BUTTON
    cfg.pszWindowTitle      = "InventaryCare"
    cfg.hMainIcon           = TD_INFORMATION_ICON
    cfg.pszMainInstruction  = "Acceso directo en el escritorio"
    cfg.pszContent          = "¿Deseas crear un acceso directo de InventaryCare en el escritorio para abrirlo más fácilmente?"
    cfg.pszVerificationText = "No volver a mostrar"

    pnButton  = ctypes.c_int(0)
    pVerified = ctypes.c_bool(False)

    try:
        hr = ctypes.windll.comctl32.TaskDialogIndirect(
            ctypes.byref(cfg),
            ctypes.byref(pnButton),
            None,
            ctypes.byref(pVerified),
        )
        if hr != 0:
            raise OSError(f"TaskDialogIndirect hr={hr:#010x}")
    except Exception:
        _log("[launcher] shortcut dialog failed:\n" + traceback.format_exc())
        return

    if pnButton.value == IDYES:
        _SHORTCUT_FLAG.touch()
        _create_shortcut()
    elif pVerified.value:
        _SHORTCUT_FLAG.touch()


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
    _offer_shortcut()

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
