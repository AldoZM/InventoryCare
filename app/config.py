import os
from dotenv import load_dotenv

load_dotenv()

class Settings:
    db_host: str         = os.getenv("DB_HOST", "localhost")
    db_port: int         = int(os.getenv("DB_PORT", "5432"))
    db_name: str         = os.getenv("DB_NAME", "inventorycare")
    db_user: str         = os.getenv("DB_USER", "inventorycare")
    db_password: str     = os.getenv("DB_PASSWORD", "")
    secret_key: str      = os.getenv("SECRET_KEY", "change-me-in-production")
    token_expire_hours: int = int(os.getenv("TOKEN_EXPIRE_HOURS", "8"))
    port: int            = int(os.getenv("PORT", "8080"))

settings = Settings()
