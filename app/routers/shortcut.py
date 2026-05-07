import os
import sys
import subprocess
from pathlib import Path
from fastapi import APIRouter

router = APIRouter(prefix="/api/shortcut", tags=["shortcut"])

_FLAG = Path(os.environ.get("APPDATA", Path.home())) / "InventaryCare" / ".shortcut_offered"


@router.get("/status")
def shortcut_status():
    return {"offered": _FLAG.exists()}


@router.post("/create")
def create_shortcut():
    _FLAG.touch()
    exe = sys.executable
    icon = str(Path(sys._MEIPASS) / "assets" / "icon.ico") if getattr(sys, "frozen", False) else ""
    desktop = Path(os.environ.get("USERPROFILE", Path.home())) / "Desktop"
    shortcut = str(desktop / "InventaryCare.lnk")
    ps = (
        f'$s=(New-Object -COM WScript.Shell).CreateShortcut("{shortcut}");'
        f'$s.TargetPath="{exe}";'
        f'$s.WorkingDirectory="{Path(exe).parent}";'
        f'$s.IconLocation="{icon}";'
        f'$s.Save()'
    )
    subprocess.run(["powershell", "-NoProfile", "-Command", ps],
                   capture_output=True, timeout=10)
    return {"ok": True}


@router.post("/dismiss")
def dismiss_shortcut():
    _FLAG.touch()
    return {"ok": True}
