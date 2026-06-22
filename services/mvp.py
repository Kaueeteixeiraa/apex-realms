import json
import secrets

from database import query


CAMPAIGN_VISIBILITIES = {"private", "public"}
SHEET_STATUSES = {"draft", "submitted", "approved", "needs_changes"}
LIBRARY_TYPES = {"monster", "npc", "item", "spell", "location", "note", "custom_system"}
TOKEN_VISIBILITIES = {"public", "partial", "secret"}
TOKEN_CARD_KINDS = {"player", "npc-ally", "npc-neutral", "npc-hostile", "monster", "elite", "boss"}
TOKEN_IMAGE_VISIBILITIES = {"real", "silhouette", "hidden"}
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


def health_state(hp, maximum):
    maximum = max(1, int(maximum or 1))
    hp = max(0, int(hp or 0))
    if hp == 0:
        return "Caido"
    percent = hp / maximum * 100
    if percent >= 75:
        return "Saudavel"
    if percent >= 50:
        return "Ferido"
    if percent >= 25:
        return "Muito Ferido"
    return "Critico"


def campaign_card_settings(campaign):
    value = dict(campaign)
    return {
        "display_mode": value.get("token_display_mode") or "card",
        "show_narrative_health": bool(value.get("show_narrative_health", 1)),
        "monster_name_mode": value.get("monster_name_mode") or "real",
        "monster_image_mode": value.get("monster_image_mode") or "real",
        "show_ally_hp": bool(value.get("show_ally_hp", 0)),
    }


def token_to_view(token, campaign, viewer):
    raw = dict(token)
    campaign_value = dict(campaign)
    settings = campaign_card_settings(campaign_value)
    is_master = viewer["role"] == "admin" or campaign_value["owner_id"] == viewer["id"]
    is_owner = raw.get("token_type") == "player" and raw.get("owner_id") == viewer["id"]
    visibility = "secret" if raw.get("hidden") else raw.get("visibility", "partial")
    if visibility not in TOKEN_VISIBILITIES:
        visibility = "partial"
    card_kind = raw.get("card_kind") or ("player" if raw.get("token_type") == "player" else raw.get("token_type") or "monster")

    if is_master:
        raw["attributes"] = json.loads(raw.get("attributes") or "{}")
        raw.update({
            "viewer_scope": "master",
            "can_see_stats": True,
            "can_open_sheet": True,
            "visibility": visibility,
            "card_kind": card_kind,
            "health_state": health_state(raw.get("hp"), raw.get("max_hp")),
        })
        return raw

    base = {
        "id": raw["id"],
        "campaign_id": raw["campaign_id"],
        "token_type": raw.get("token_type") or "monster",
        "card_kind": card_kind,
        "visibility": visibility,
        "x": raw.get("x", 50),
        "y": raw.get("y", 50),
        "size": raw.get("size", 1),
        "color": raw.get("color") or "#6f5cff",
        "locked": bool(raw.get("locked", 0)),
        "viewer_scope": "owner" if is_owner else "player",
        "can_see_stats": False,
        "can_open_sheet": bool(is_owner),
    }

    if is_owner:
        owner_fields = (
            "name", "token_type", "class_name", "race", "level", "image_url", "hp", "max_hp", "temp_hp",
            "resource", "max_resource", "defense", "speed", "conditions", "buffs", "debuffs", "attributes",
            "skills", "inventory", "abilities", "spells", "story", "custom_fields"
        )
        base.update({field: raw.get(field) for field in owner_fields})
        base["attributes"] = json.loads(raw.get("attributes") or "{}")
        base["can_see_stats"] = True
        base["health_state"] = health_state(raw.get("hp"), raw.get("max_hp"))
        return base

    is_creature = raw.get("token_type") in {"monster", "npc"}
    generic_name = "Criatura Desconhecida" if raw.get("token_type") == "monster" else "Figura Desconhecida"
    name_mode = settings["monster_name_mode"] if is_creature else "real"
    if visibility == "secret" or name_mode == "generic":
        public_name = raw.get("public_name") or generic_name
    elif name_mode == "hidden":
        public_name = "???"
    else:
        public_name = raw.get("name") or generic_name
    image_mode = raw.get("image_visibility") or "real"
    if is_creature and settings["monster_image_mode"] != "real":
        image_mode = settings["monster_image_mode"]
    if visibility == "secret" and image_mode == "real":
        image_mode = "silhouette"

    base.update({
        "name": public_name,
        "public_name": public_name,
        "card_kind": "monster" if visibility == "secret" and is_creature else card_kind,
        "public_type": "Personagem" if raw.get("token_type") == "player" else ("NPC" if raw.get("token_type") == "npc" else "Criatura"),
        "image_mode": image_mode,
        "image_url": raw.get("image_url") if image_mode == "real" else "",
    })
    if raw.get("token_type") == "player" and raw.get("share_class_race"):
        base.update({"class_name": raw.get("class_name"), "race": raw.get("race")})
    if raw.get("token_type") == "player" and settings["show_ally_hp"]:
        base.update({"hp": raw.get("hp"), "max_hp": raw.get("max_hp"), "can_see_stats": True})
    if visibility == "partial" and settings["show_narrative_health"] and raw.get("show_life_state", 1):
        base["health_state"] = health_state(raw.get("hp"), raw.get("max_hp"))
    return base


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
