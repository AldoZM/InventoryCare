import socket
import pytest
from launcher import _get_local_ip


def test_get_local_ip_returns_valid_ip():
    ip = _get_local_ip()
    parts = ip.split(".")
    assert len(parts) == 4
    assert all(p.isdigit() and 0 <= int(p) <= 255 for p in parts)


def test_get_local_ip_fallback_on_error(monkeypatch):
    class _BadSocket:
        def __init__(self, *a, **kw):
            pass
        def connect(self, *a, **kw):
            raise OSError("network unreachable")
        def close(self):
            pass

    monkeypatch.setattr(socket, "socket", _BadSocket)
    assert _get_local_ip() == "127.0.0.1"
