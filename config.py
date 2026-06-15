import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent


class Config:
    SECRET_KEY = os.environ.get("SECRET_KEY", "dev-change-this-secret")
    ADMIN_REGISTRATION_CODE = os.environ.get("ADMIN_REGISTRATION_CODE", "APEX-ADMIN-2026")
    DATABASE = Path(os.environ.get("DATABASE_PATH", BASE_DIR / "database" / "apex_realms.db"))
    UPLOAD_FOLDER = Path(os.environ.get("UPLOAD_FOLDER", BASE_DIR / "uploads"))
    MAX_CONTENT_LENGTH = 8 * 1024 * 1024
    ALLOWED_EXTENSIONS = {"png", "jpg", "jpeg", "webp", "gif", "pdf", "txt"}

