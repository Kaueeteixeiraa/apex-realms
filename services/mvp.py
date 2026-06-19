import json
import secrets

from database import query


CAMPAIGN_VISIBILITIES = {"private", "public"}
SHEET_STATUSES = {"draft", "submitted", "approved", "needs_changes"}
LIBRARY_TYPES = {"monster", "npc", "item", "spell", "location", "note", "custom_system"}
IMAGE_EXTENSIONS = {"png", "jpg", "jpeg", "webp"}
IMAGE_MIMES = {"image/png", "image/jpeg", "image/webp"}


def generate_invite_code():
    alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
    while True:
        part = lambda: "".join(secrets.choice(alphabet) for _ in range(4))
        code = f"AR-{part()}-{part()}"
        if not query("SELECT id FROM campaigns WHERE invite_code = ?", (code,), one=True):
            return code


def invite_value_for_visibility(visibility, existing=None):
    if visibility == "private":
        return existing or generate_invite_code()
    invite_column = next((column for column in query("PRAGMA table_info(campaigns)") if column["name"] == "invite_code"), None)
    return f"PUBLIC-{secrets.token_hex(8)}" if invite_column and invite_column["notnull"] else None


def campaign_to_dict(campaign):
    value = dict(campaign)
    if value.get("visibility") == "public":
        value["invite_code"] = None
    return value


def library_item_to_dict(item):
    return dict(item)


def sheet_to_dict(sheet):
    value = dict(sheet)
    try:
        value["data"] = json.loads(value.get("data") or "{}")
    except (TypeError, json.JSONDecodeError):
        value["data"] = {}
    return value


def clean_text(value, maximum=2000):
    return str(value or "").strip()[:maximum]


def clean_sheet_data(value):
    if not isinstance(value, dict):
        return {}
    serialized = json.dumps(value, ensure_ascii=False)
    if len(serialized) > 50_000:
        raise ValueError("A ficha excede o limite de dados permitido.")
    return value


def validate_image_upload(file):
    if not file or not file.filename:
        return
    extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
    if extension not in IMAGE_EXTENSIONS or file.mimetype not in IMAGE_MIMES:
        raise ValueError("Use uma imagem PNG, JPG ou WEBP.")
    header = file.stream.read(16)
    file.stream.seek(0)
    valid = (
        header.startswith(b"\x89PNG\r\n\x1a\n")
        or header.startswith(b"\xff\xd8\xff")
        or (header.startswith(b"RIFF") and header[8:12] == b"WEBP")
    )
    if not valid:
        raise ValueError("O conteudo enviado nao corresponde a uma imagem valida.")
