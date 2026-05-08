import pytest


@pytest.fixture(scope="session", autouse=True)
def ensure_scan_products(client, auth_headers):
    """Ensure products used by scan tests exist, idempotent."""
    existing = client.get("/api/products", headers=auth_headers).json()
    skus = {p["sku"] for p in existing}
    if "SCAN-001" not in skus:
        client.post("/api/products", json={
            "sku": "SCAN-001", "name": "Test Scan", "unit": "pcs", "price": 9.99
        }, headers=auth_headers)


def test_product_price_field_accepted(client, auth_headers):
    r = client.post("/api/products", json={
        "sku": "SCAN-001", "name": "Test Scan", "unit": "pcs", "price": 9.99
    }, headers=auth_headers)
    assert r.status_code in (201, 409)
    if r.status_code == 201:
        assert r.json()["price"] == 9.99


def test_product_price_optional(client, auth_headers):
    r = client.post("/api/products", json={
        "sku": "SCAN-002", "name": "No Price", "unit": "pcs"
    }, headers=auth_headers)
    assert r.status_code in (201, 409)


def test_scan_sku_not_found(client, auth_headers):
    r = client.get("/api/scan/sku/NOTEXIST999", headers=auth_headers)
    assert r.status_code == 404


def test_scan_sku_found(client, auth_headers):
    # SCAN-001 was created by test_product_price_field_accepted (session scope — runs first)
    r = client.get("/api/scan/sku/SCAN-001", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["sku"] == "SCAN-001"
    assert data["price"] == 9.99


def test_scan_lookup_not_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app.routers.scan._fetch_external", lambda _: None)
    r = client.get("/api/scan/lookup/000000000000", headers=auth_headers)
    assert r.status_code == 404


def test_scan_lookup_found(client, auth_headers, monkeypatch):
    monkeypatch.setattr(
        "app.routers.scan._fetch_external",
        lambda _: {"name": "Leche Entera 1L", "category": "Lácteos", "price": 25.50},
    )
    r = client.get("/api/scan/lookup/7501055300906", headers=auth_headers)
    assert r.status_code == 200
    data = r.json()
    assert data["name"] == "Leche Entera 1L"
    assert data["price"] == 25.50


def test_scan_ocr_unavailable(client, auth_headers, monkeypatch):
    monkeypatch.setattr("app.routers.scan._pytesseract_available", False)
    minimal_jpg = (
        b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00'
        b'\xff\xd9'
    )
    r = client.post(
        "/api/scan/ocr",
        files={"image": ("scan.jpg", minimal_jpg, "image/jpeg")},
        headers=auth_headers,
    )
    assert r.status_code == 503
