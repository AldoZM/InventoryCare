import sqlite3

from app.database import db_conn

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY,
    username      TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role          TEXT NOT NULL DEFAULT 'operator'
                      CHECK (role IN ('admin', 'operator')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS products (
    id          INTEGER PRIMARY KEY,
    sku         TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT,
    category    TEXT,
    unit        TEXT NOT NULL DEFAULT 'pcs',
    min_stock   INTEGER NOT NULL DEFAULT 0,
    price       REAL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS locations (
    id          INTEGER PRIMARY KEY,
    code        TEXT UNIQUE NOT NULL,
    name        TEXT NOT NULL,
    description TEXT
);

CREATE TABLE IF NOT EXISTS inventory (
    product_id  INTEGER NOT NULL REFERENCES products(id)  ON DELETE CASCADE,
    location_id INTEGER NOT NULL REFERENCES locations(id) ON DELETE CASCADE,
    quantity    INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (product_id, location_id)
);

CREATE TABLE IF NOT EXISTS movements (
    id          INTEGER PRIMARY KEY,
    product_id  INTEGER NOT NULL REFERENCES products(id),
    location_id INTEGER NOT NULL REFERENCES locations(id),
    type        TEXT    NOT NULL CHECK (type IN ('IN', 'OUT', 'TRANSFER')),
    quantity    INTEGER NOT NULL CHECK (quantity > 0),
    reference   TEXT,
    notes       TEXT,
    user_id     INTEGER REFERENCES users(id),
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
"""


def run_migrations():
    with db_conn() as conn:
        conn.executescript(SCHEMA)
        try:
            conn.execute("ALTER TABLE products ADD COLUMN price REAL")
        except sqlite3.OperationalError:
            pass  # column already exists in existing databases


def is_first_run() -> bool:
    with db_conn() as conn:
        cur = conn.execute("SELECT COUNT(*) FROM users")
        return cur.fetchone()[0] == 0


def setup_first_run():
    from app.auth import hash_password
    with db_conn() as conn:
        conn.execute(
            "INSERT OR IGNORE INTO users (username, password_hash, role) VALUES (?, ?, 'admin')",
            ("admin", hash_password("admin123")),
        )
