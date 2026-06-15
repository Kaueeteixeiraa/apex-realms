from functools import wraps

from flask import abort, session

from database import query


ROLES = {
    "player": "Jogador",
    "master": "Mestre",
    "admin": "Administrador",
}


def current_user():
    user_id = session.get("user_id")
    return query("SELECT * FROM users WHERE id = ?", (user_id,), one=True) if user_id else None


def role_label(role):
    return ROLES.get(role, "Usuário")


def is_admin(user=None):
    user = user or current_user()
    return bool(user and user["role"] == "admin")


def can_manage_campaign(campaign, user=None):
    user = user or current_user()
    return bool(user and (user["role"] == "admin" or campaign["owner_id"] == user["id"]))


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user():
            return abort(401)
        return view(*args, **kwargs)
    return wrapped


def roles_required(*roles):
    def decorator(view):
        @wraps(view)
        def wrapped(*args, **kwargs):
            user = current_user()
            if not user:
                return abort(401)
            if user["role"] not in roles:
                return abort(403)
            return view(*args, **kwargs)
        return wrapped
    return decorator


admin_required = roles_required("admin")
master_required = roles_required("master")


def campaign_access(campaign_id, owner_only=False):
    user = current_user()
    campaign = query("SELECT * FROM campaigns WHERE id = ?", (campaign_id,), one=True)
    if not user or not campaign:
        abort(404)
    if is_admin(user):
        return campaign
    member = query(
        "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ?",
        (campaign_id, user["id"]),
        one=True,
    )
    if campaign["owner_id"] != user["id"] and (owner_only or not member):
        abort(403)
    return campaign

