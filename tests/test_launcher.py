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


import datetime
from pathlib import Path
from cryptography import x509
from cryptography.hazmat.backends import default_backend
from launcher import _ensure_ssl_cert


def test_ensure_ssl_cert_creates_files(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, key_path = _ensure_ssl_cert("192.168.1.42")
    assert cert_path.exists()
    assert key_path.exists()


def test_ensure_ssl_cert_has_correct_sans(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    ips = [str(a) for a in san.value.get_values_for_type(x509.IPAddress)]
    dns = san.value.get_values_for_type(x509.DNSName)
    assert "127.0.0.1" in ips
    assert "192.168.1.42" in ips
    assert "localhost" in dns


def test_ensure_ssl_cert_reuses_valid_cert(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    mtime1 = cert_path.stat().st_mtime
    _ensure_ssl_cert("192.168.1.42")
    assert cert_path.stat().st_mtime == mtime1  # file not touched


def test_ensure_ssl_cert_regenerates_when_ip_changes(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    _ensure_ssl_cert("192.168.1.42")
    cert_path, _ = _ensure_ssl_cert("192.168.1.99")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    san = cert.extensions.get_extension_for_class(x509.SubjectAlternativeName)
    ips = [str(a) for a in san.value.get_values_for_type(x509.IPAddress)]
    assert "192.168.1.99" in ips
    assert "192.168.1.42" not in ips


def test_ensure_ssl_cert_regenerates_when_corrupt(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    (tmp_path / "cert.pem").write_text("not a cert")
    (tmp_path / "key.pem").write_text("not a key")
    cert_path, key_path = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    assert cert is not None


def test_ensure_ssl_cert_valid_one_year(tmp_path, monkeypatch):
    monkeypatch.setattr("launcher._log_dir", tmp_path)
    cert_path, _ = _ensure_ssl_cert("192.168.1.42")
    cert = x509.load_pem_x509_certificate(cert_path.read_bytes(), default_backend())
    delta = cert.not_valid_after - cert.not_valid_before
    assert delta.days >= 364
