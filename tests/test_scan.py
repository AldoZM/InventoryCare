def test_product_price_field_accepted(client, auth_headers):
    r = client.post("/api/products", json={
        "sku": "SCAN-001", "name": "Test Scan", "unit": "pcs", "price": 9.99
    }, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["price"] == 9.99


def test_product_price_optional(client, auth_headers):
    r = client.post("/api/products", json={
        "sku": "SCAN-002", "name": "No Price", "unit": "pcs"
    }, headers=auth_headers)
    assert r.status_code == 201
    assert r.json()["price"] is None
