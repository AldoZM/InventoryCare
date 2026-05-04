import psycopg2
import psycopg2.pool
from contextlib import contextmanager
from app.config import settings

_pool = None


def _conn_kwargs(dbname: str) -> dict:
    kw = dict(
        host=settings.db_host,
        port=settings.db_port,
        dbname=dbname,
        user=settings.db_user,
    )
    if settings.db_password:
        kw["password"] = settings.db_password
    return kw


def create_database_if_needed():
    conn = psycopg2.connect(**_conn_kwargs("postgres"))
    conn.autocommit = True
    with conn.cursor() as cur:
        cur.execute("SELECT 1 FROM pg_database WHERE datname = %s", (settings.db_name,))
        if not cur.fetchone():
            cur.execute(f'CREATE DATABASE "{settings.db_name}" OWNER "{settings.db_user}"')
    conn.close()


def init_pool():
    global _pool
    create_database_if_needed()
    _pool = psycopg2.pool.ThreadedConnectionPool(
        minconn=1,
        maxconn=10,
        **_conn_kwargs(settings.db_name),
    )


@contextmanager
def db_conn():
    conn = _pool.getconn()
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        _pool.putconn(conn)


def get_db():
    with db_conn() as conn:
        yield conn
