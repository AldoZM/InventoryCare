import socket
from fastapi import APIRouter

router = APIRouter(prefix="/api/system", tags=["system"])

_PORT = 8080


@router.get("/lan-url")
def get_lan_url():
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        try:
            s.connect(("8.8.8.8", 80))
            ip = s.getsockname()[0]
        finally:
            s.close()
        return {"url": f"https://{ip}:{_PORT}", "lan_ip": ip}
    except Exception:
        return {"url": None, "lan_ip": None}
