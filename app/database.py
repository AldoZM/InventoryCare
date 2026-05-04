import sqlite3
import threading
from contextlib import contextmanager
from app.config import settings

_conn: sqlite3.Connection | None = None
_lock = threading.Lock()


def init_db():
    global _conn
    settings.db_path.parent.mkdir(parents=True, exist_ok=True)
    _conn = sqlite3.connect(str(settings.db_path), check_same_thread=False)
    _conn.row_factory = sqlite3.Row
    _conn.execute("PRAGMA journal_mode=WAL")
    _conn.execute("PRAGMA foreign_keys=ON")
    _conn.commit()


@contextmanager
def db_conn():
    with _lock:
        try:
            yield _conn
            _conn.commit()
        except Exception:
            _conn.rollback()
            raise


def get_db():
    with db_conn() as conn:
        yield conn
