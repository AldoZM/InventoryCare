import os
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()

_appdata = Path(os.environ.get("APPDATA") or Path.home())
_default_db = _appdata / "InventaryCare" / "inventorycare.db"


class Settings:
    db_path: Path = Path(os.getenv("DB_PATH", str(_default_db)))
    secret_key: str = os.getenv("SECRET_KEY", "change-me-in-production")
    token_expire_hours: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "8"))
    port: int = int(os.getenv("PORT", "8080"))


settings = Settings()
