import pytest

PORT = 8080


def test_lan_url_no_auth_required(client):
    r = client.get("/api/system/lan-url")
    assert r.status_code == 200


def test_lan_url_returns_expected_keys(client):
    r = client.get("/api/system/lan-url")
    data = r.json()
    assert "url" in data
    assert "lan_ip" in data


def test_lan_url_values_consistent(client):
    r = client.get("/api/system/lan-url")
    data = r.json()
    if data["lan_ip"] is not None:
        parts = data["lan_ip"].split(".")
        assert len(parts) == 4
        assert all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)
        assert data["url"] == f"https://{data['lan_ip']}:{PORT}"
    else:
        assert data["url"] is None
