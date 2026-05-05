def test_health(client):
    r = client.get("/health")
    assert r.status_code == 200
    assert r.json() == {"status": "ok"}


def test_login_admin(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "admin123"})
    assert r.status_code == 200
    data = r.json()
    assert "access_token" in data
    assert data["role"] == "admin"


def test_login_wrong_password(client):
    r = client.post("/api/auth/login", json={"username": "admin", "password": "wrong"})
    assert r.status_code == 401


def test_create_and_list_product(client, auth_headers):
    r = client.post("/api/products", headers=auth_headers, json={
        "sku": "TEST-001", "name": "Test Product", "unit": "pcs", "min_stock": 5
    })
    assert r.status_code == 201
    p = r.json()
    assert p["sku"] == "TEST-001"
    assert p["id"] > 0

    r = client.get("/api/products", headers=auth_headers)
    assert r.status_code == 200
    skus = [x["sku"] for x in r.json()]
    assert "TEST-001" in skus


def test_search_product(client, auth_headers):
    r = client.get("/api/products?search=test", headers=auth_headers)
    assert r.status_code == 200
    assert any(p["sku"] == "TEST-001" for p in r.json())


def test_create_location(client, auth_headers):
    r = client.post("/api/locations", headers=auth_headers, json={
        "code": "WH-A", "name": "Warehouse A"
    })
    assert r.status_code == 201
    assert r.json()["code"] == "WH-A"


def test_movement_in_and_inventory(client, auth_headers):
    products = client.get("/api/products", headers=auth_headers).json()
    product_id = next(p["id"] for p in products if p["sku"] == "TEST-001")

    locations = client.get("/api/locations", headers=auth_headers).json()
    location_id = next(l["id"] for l in locations if l["code"] == "WH-A")

    r = client.post("/api/movements/in", headers=auth_headers, json={
        "product_id": product_id, "location_id": location_id, "quantity": 10
    })
    assert r.status_code == 201
    assert r.json()["type"] == "IN"

    r = client.get("/api/inventory", headers=auth_headers)
    assert r.status_code == 200
    entry = next(
        x for x in r.json()
        if x["product"]["id"] == product_id and x["location"]["id"] == location_id
    )
    assert entry["quantity"] == 10
    assert not entry["low_stock"]


def test_movement_out_insufficient_stock(client, auth_headers):
    products = client.get("/api/products", headers=auth_headers).json()
    product_id = next(p["id"] for p in products if p["sku"] == "TEST-001")
    locations = client.get("/api/locations", headers=auth_headers).json()
    location_id = next(l["id"] for l in locations if l["code"] == "WH-A")

    r = client.post("/api/movements/out", headers=auth_headers, json={
        "product_id": product_id, "location_id": location_id, "quantity": 999
    })
    assert r.status_code == 400
    assert "Insufficient stock" in r.json()["detail"]


def test_reports_stock(client, auth_headers):
    r = client.get("/api/reports/stock", headers=auth_headers)
    assert r.status_code == 200
    assert isinstance(r.json(), list)


def test_create_user(client, auth_headers):
    r = client.post("/api/users", headers=auth_headers, json={
        "username": "operator1", "password": "pass123", "role": "operator"
    })
    assert r.status_code == 201
    assert r.json()["role"] == "operator"


def test_export_excel(client, auth_headers):
    r = client.get("/api/export", headers=auth_headers)
    assert r.status_code == 200
    assert r.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert len(r.content) > 0
