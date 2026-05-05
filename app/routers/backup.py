import shutil
import sqlite3
import tempfile
from pathlib import Path
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse
from app.auth import require_admin
from app.config import settings
from app.database import init_db, _lock
import app.database as _db

router = APIRouter(prefix="/api", tags=["backup"])


@router.get("/backup")
def download_backup(_=Depends(require_admin)):
    if not settings.db_path.exists():
        raise HTTPException(404, "Database file not found")
    # Use SQLite backup API for a consistent snapshot (WAL-safe)
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        tmp_path = Path(tmp.name)
    dst = sqlite3.connect(str(tmp_path))
    with _lock:
        _db._conn.backup(dst)
    dst.close()
    return FileResponse(
        path=str(tmp_path),
        filename="inventarycare_backup.db",
        media_type="application/octet-stream",
        background=None,
    )


@router.post("/restore", status_code=200)
async def restore_backup(file: UploadFile = File(...), _=Depends(require_admin)):
    if not file.filename.endswith(".db"):
        raise HTTPException(400, "File must be a .db file")

    # Write upload to a temp file first so we can validate it
    with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
        tmp_path = Path(tmp.name)
        content = await file.read()
        tmp.write(content)

    # Validate: SQLite magic bytes
    if content[:16] != b"SQLite format 3\x00":
        tmp_path.unlink(missing_ok=True)
        raise HTTPException(400, "Invalid SQLite database file")

    # Swap DB under the lock: close → replace → reinit + run migrations
    from app.migrations import run_migrations
    with _lock:
        if _db._conn:
            _db._conn.close()
            _db._conn = None
        shutil.copy2(tmp_path, settings.db_path)
        tmp_path.unlink(missing_ok=True)
        init_db()
        run_migrations()

    return {"status": "restored"}
