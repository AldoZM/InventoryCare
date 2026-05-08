import os
import tempfile
os.environ.setdefault("DB_PATH", tempfile.mktemp(suffix="_scan_test.db"))

import pytest
from fastapi.testclient import TestClient
from app.main import app


@pytest.fixture(scope="module")
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture(scope="module")
def auth(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def test_product_price_field_accepted(client, auth):
    r = client.post("/api/products", json={
        "sku": "SCAN-001", "name": "Test Scan", "unit": "pcs", "price": 9.99
    }, headers=auth)
    assert r.status_code == 201
    assert r.json()["price"] == 9.99


def test_product_price_optional(client, auth):
    r = client.post("/api/products", json={
        "sku": "SCAN-002", "name": "No Price", "unit": "pcs"
    }, headers=auth)
    assert r.status_code == 201
    assert r.json()["price"] is None
