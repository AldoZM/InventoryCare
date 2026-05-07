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

    ps_dialog = (
        'Add-Type -AssemblyName System.Windows.Forms,System.Drawing;'
        '$f=New-Object System.Windows.Forms.Form;'
        '$f.Text="InventaryCare";'
        '$f.Size=New-Object System.Drawing.Size(400,190);'
        '$f.StartPosition="CenterScreen";'
        '$f.FormBorderStyle="FixedDialog";'
        '$f.MaximizeBox=$false;$f.MinimizeBox=$false;$f.TopMost=$true;'
        '$l=New-Object System.Windows.Forms.Label;'
        '$l.Text="Deseas crear un acceso directo de InventaryCare en el escritorio?";'
        '$l.Location=New-Object System.Drawing.Point(20,18);'
        '$l.Size=New-Object System.Drawing.Size(355,44);'
        '$l.Font=New-Object System.Drawing.Font("Segoe UI",10);'
        '$f.Controls.Add($l);'
        '$c=New-Object System.Windows.Forms.CheckBox;'
        '$c.Text="No volver a mostrar";'
        '$c.Location=New-Object System.Drawing.Point(20,72);'
        '$c.Size=New-Object System.Drawing.Size(200,24);'
        '$c.Font=New-Object System.Drawing.Font("Segoe UI",9);'
        '$f.Controls.Add($c);'
        '$bS=New-Object System.Windows.Forms.Button;'
        '$bS.Text="Si";'
        '$bS.Location=New-Object System.Drawing.Point(200,118);'
        '$bS.Size=New-Object System.Drawing.Size(80,30);'
        '$bS.DialogResult=[System.Windows.Forms.DialogResult]::Yes;'
        '$f.Controls.Add($bS);'
        '$bN=New-Object System.Windows.Forms.Button;'
        '$bN.Text="No";'
        '$bN.Location=New-Object System.Drawing.Point(292,118);'
        '$bN.Size=New-Object System.Drawing.Size(80,30);'
        '$bN.DialogResult=[System.Windows.Forms.DialogResult]::No;'
        '$f.Controls.Add($bN);'
        '$f.AcceptButton=$bS;$f.CancelButton=$bN;'
        '$r=$f.ShowDialog();'
        'Write-Output "$r|$($c.Checked)"'
    )

    try:
        proc = subprocess.run(
            ["powershell", "-NoProfile", "-NonInteractive", "-Command", ps_dialog],
            capture_output=True, text=True, timeout=120,
        )
        parts = proc.stdout.strip().split("|")
        answer   = parts[0] if parts else "No"
        no_show  = len(parts) > 1 and parts[1].lower() == "true"

        if answer == "Yes":
            _SHORTCUT_FLAG.touch()
            _create_shortcut()
        elif no_show:
            _SHORTCUT_FLAG.touch()
    except Exception:
        _log("[launcher] shortcut dialog failed:\n" + traceback.format_exc())


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
