import os
import tempfile
import pytest

# Must be set before app.config is imported
os.environ["DB_PATH"] = tempfile.mktemp(suffix="_test.db")

from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="session")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="session")
def auth_headers(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    token = r.json()["access_token"]
    return {"Authorization": f"Bearer {token}"}
