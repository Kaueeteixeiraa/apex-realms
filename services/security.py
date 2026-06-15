from functools import wraps

from flask import abort, session

from database import query


def current_user():
    user_id = session.get("user_id")
    return query("SELECT * FROM users WHERE id = ?", (user_id,), one=True) if user_id else None


def login_required(view):
    @wraps(view)
    def wrapped(*args, **kwargs):
        if not current_user():
            return abort(401)
        return view(*args, **kwargs)
    return wrapped


def campaign_access(campaign_id, owner_only=False):
    user = current_user()
    campaign = query("SELECT * FROM campaigns WHERE id = ?", (campaign_id,), one=True)
    if not user or not campaign:
        abort(404)
    member = query(
        "SELECT 1 FROM memberships WHERE campaign_id = ? AND user_id = ?",
        (campaign_id, user["id"]),
        one=True,
    )
    if campaign["owner_id"] != user["id"] and (owner_only or not member):
        abort(403)
    return campaign

