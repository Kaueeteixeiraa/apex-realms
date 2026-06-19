import json
import os
import random
import re
import secrets
import sqlite3
from pathlib import Path

from flask import Flask, abort, flash, jsonify, redirect, render_template, request, send_from_directory, session, url_for
from werkzeug.utils import secure_filename
from werkzeug.security import check_password_hash, generate_password_hash

from config import Config
from database import execute, get_db, init_app, query
from services.security import ROLES, admin_required, campaign_access, can_manage_campaign, current_user, login_required, master_required, role_label
from services.mvp import (
    CAMPAIGN_VISIBILITIES,
    LIBRARY_TYPES,
    TOKEN_CARD_KINDS,
    TOKEN_IMAGE_VISIBILITIES,
    TOKEN_VISIBILITIES,
    campaign_to_dict,
    campaign_card_settings,
    clean_sheet_data,
    clean_text,
    generate_invite_code,
    invite_value_for_visibility,
    library_item_to_dict,
    sheet_to_dict,
    token_to_view,
    validate_image_upload,
)


def roll_formula(formula):
    normalized = str(formula).lower().replace(" ", "")
    match = re.fullmatch(r"(\d{1,2})d(4|6|8|10|12|20|100)([+-]\d{1,3})?", normalized)
    if not match:
        raise ValueError("Use uma fórmula como 1d20+5.")
    count, sides, modifier = int(match.group(1)), int(match.group(2)), int(match.group(3) or 0)
    rolls = [random.randint(1, sides) for _ in range(min(count, 30))]
    return normalized, rolls, sum(rolls) + modifier, modifier


def create_app():
    app = Flask(__name__)
    app.config.from_object(Config)
    if app.config["ENVIRONMENT"] == "production" and app.config["SECRET_KEY"] == "dev-change-this-secret":
        raise RuntimeError("Defina SECRET_KEY por variavel de ambiente antes de iniciar em producao.")
    if app.config["ENVIRONMENT"] == "production" and app.config["ADMIN_INITIAL_PASSWORD"] == "apex123":
        raise RuntimeError("Defina ADMIN_INITIAL_PASSWORD antes de iniciar em producao.")
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    init_app(app)

    @app.before_request
    def protect_mutating_requests():
        if request.method not in {"POST", "PUT", "PATCH", "DELETE"}:
            return None
        origin = request.headers.get("Origin")
        if origin and origin.rstrip("/") != request.host_url.rstrip("/"):
            abort(403)
        return None

    @app.after_request
    def add_security_headers(response):
        response.headers.setdefault("X-Content-Type-Options", "nosniff")
        response.headers.setdefault("X-Frame-Options", "DENY")
        response.headers.setdefault("Referrer-Policy", "strict-origin-when-cross-origin")
        return response

    @app.context_processor
    def inject_user():
        return {"current_user": current_user(), "roles": ROLES, "role_label": role_label}

    def post_login_redirect(user):
        return url_for("admin_dashboard") if user["role"] == "admin" else url_for("dashboard")

    @app.get("/")
    def landing():
        return render_template("landing.html")

    @app.get("/uploads/<path:filename>")
    def uploaded_file(filename):
        return send_from_directory(app.config["UPLOAD_FOLDER"], filename)

    @app.route("/login", methods=["GET", "POST"])
    def login():
        if request.method == "POST":
            user = query("SELECT * FROM users WHERE email = ?", (request.form["email"].lower(),), one=True)
            if user and check_password_hash(user["password_hash"], request.form["password"]):
                session.clear()
                session["user_id"] = user["id"]
                return redirect(post_login_redirect(user))
            flash("E-mail ou senha inválidos.", "error")
        return render_template("auth/login.html")

    @app.route("/register", methods=["GET", "POST"])
    def register():
        if request.method == "POST":
            role = request.form.get("role", "player")
            email = request.form.get("email", "").strip().lower()
            password = request.form.get("password", "")
            if role not in ROLES:
                flash("Escolha um perfil válido para a conta.", "error")
                return render_template("auth/register.html")
            if len(password) < 6:
                flash("A senha precisa ter pelo menos 6 caracteres.", "error")
                return render_template("auth/register.html")
            if role == "admin" and request.form.get("admin_code", "").strip() != app.config["ADMIN_REGISTRATION_CODE"]:
                flash("Código interno de administrador inválido.", "error")
                return render_template("auth/register.html")
            try:
                user_id = execute(
                    "INSERT INTO users (name, nickname, email, password_hash, role, preferences) VALUES (?, ?, ?, ?, ?, ?)",
                    (
                        request.form["name"].strip(),
                        request.form["nickname"].strip(),
                        email,
                        generate_password_hash(password),
                        role,
                        request.form.get("preferences", ""),
                    ),
                )
                session.clear()
                session["user_id"] = user_id
                flash(f"Conta de {role_label(role).lower()} criada com sucesso.", "success")
                return redirect(url_for("admin_dashboard" if role == "admin" else "dashboard"))
            except sqlite3.IntegrityError:
                flash("Esse e-mail já está em uso.", "error")
        return render_template("auth/register.html")

    @app.get("/logout")
    def logout():
        session.clear()
        return redirect(url_for("landing"))

    @app.get("/dashboard")
    @login_required
    def dashboard():
        user = current_user()
        if user["role"] == "admin":
            campaigns = query(
                """SELECT c.*, u.nickname AS owner_name, 'admin' AS access_role
                   FROM campaigns c JOIN users u ON u.id = c.owner_id
                   ORDER BY c.last_session DESC"""
            )
        else:
            campaigns = query(
                """SELECT c.*, u.nickname AS owner_name,
                   CASE WHEN c.owner_id = ? THEN 'master' ELSE 'player' END AS access_role
                   FROM campaigns c JOIN users u ON u.id = c.owner_id
                   LEFT JOIN memberships m ON m.campaign_id = c.id
                   WHERE c.owner_id = ? OR m.user_id = ?
                   GROUP BY c.id ORDER BY c.last_session DESC""",
                (user["id"], user["id"], user["id"]),
            )
        return render_template("dashboard.html", campaigns=campaigns)

    @app.get("/admin")
    @admin_required
    def admin_dashboard():
        stats = {
            "users": query("SELECT COUNT(*) AS total FROM users", one=True)["total"],
            "masters": query("SELECT COUNT(*) AS total FROM users WHERE role='master'", one=True)["total"],
            "players": query("SELECT COUNT(*) AS total FROM users WHERE role='player'", one=True)["total"],
            "admins": query("SELECT COUNT(*) AS total FROM users WHERE role='admin'", one=True)["total"],
            "campaigns": query("SELECT COUNT(*) AS total FROM campaigns", one=True)["total"],
        }
        users = query(
            """SELECT u.*,
               (SELECT COUNT(*) FROM campaigns c WHERE c.owner_id = u.id) AS owned_campaigns,
               (SELECT COUNT(*) FROM memberships m WHERE m.user_id = u.id) AS joined_campaigns
               FROM users u ORDER BY u.created_at DESC, u.id DESC"""
        )
        campaigns = query(
            """SELECT c.*, u.nickname AS owner_name,
               (SELECT COUNT(*) FROM memberships m WHERE m.campaign_id = c.id) AS player_count
               FROM campaigns c JOIN users u ON u.id = c.owner_id
               ORDER BY c.last_session DESC LIMIT 8"""
        )
        return render_template("admin/dashboard.html", stats=stats, users=users, campaigns=campaigns)

    @app.post("/admin/users/<int:user_id>/role")
    @admin_required
    def admin_user_role(user_id):
        role = request.form.get("role", "")
        if role not in ROLES:
            abort(400)
        if user_id == current_user()["id"] and role != "admin":
            flash("Você não pode remover seu próprio acesso administrativo.", "error")
            return redirect(url_for("admin_dashboard"))
        user = query("SELECT id FROM users WHERE id = ?", (user_id,), one=True)
        if not user:
            abort(404)
        execute("UPDATE users SET role = ? WHERE id = ?", (role, user_id))
        flash("Perfil do usuário atualizado.", "success")
        return redirect(url_for("admin_dashboard"))

    @app.route("/campaign/new", methods=["GET", "POST"])
    @master_required
    def campaign_new():
        if request.method == "POST":
            visibility = request.form.get("visibility", "private")
            if visibility not in CAMPAIGN_VISIBILITIES:
                abort(400)
            campaign_id = execute(
                """INSERT INTO campaigns (owner_id, name, description, system, cover, visibility, invite_code)
                   VALUES (?, ?, ?, ?, ?, ?, ?)""",
                (
                    current_user()["id"],
                    clean_text(request.form["name"], 100),
                    clean_text(request.form.get("description", ""), 2000),
                    clean_text(request.form["system"], 80),
                    clean_text(request.form.get("cover", ""), 500),
                    visibility,
                    invite_value_for_visibility(visibility),
                ),
            )
            return redirect(url_for("campaign_detail", campaign_id=campaign_id))
        return render_template("campaigns/new.html")

    @app.route("/campaign/<int:campaign_id>/edit", methods=["GET", "POST"])
    @master_required
    def campaign_edit(campaign_id):
        campaign = campaign_access(campaign_id, owner_only=True)
        if request.method == "POST":
            visibility = request.form.get("visibility", campaign["visibility"])
            if visibility not in CAMPAIGN_VISIBILITIES:
                abort(400)
            invite_code = invite_value_for_visibility(
                visibility,
                campaign["invite_code"] if visibility == "private" and campaign["visibility"] == "private" else None,
            )
            execute(
                """UPDATE campaigns SET name=?,description=?,system=?,cover=?,visibility=?,invite_code=?,updated_at=CURRENT_TIMESTAMP
                   WHERE id=?""",
                (clean_text(request.form["name"], 100), clean_text(request.form.get("description"), 2000),
                 clean_text(request.form["system"], 80), clean_text(request.form.get("cover"), 500),
                 visibility, invite_code, campaign_id),
            )
            return redirect(url_for("campaign_detail", campaign_id=campaign_id))
        return render_template("campaigns/new.html", campaign=campaign)

    @app.post("/campaign/quick")
    @master_required
    def quick_campaign():
        campaign_id = execute(
            """INSERT INTO campaigns (owner_id, name, description, system, invite_code, quick_session)
               VALUES (?, ?, ?, ?, ?, 1)""",
            (current_user()["id"], "Sessão rápida", "Uma sala pronta para jogar agora.", "Sistema livre", generate_invite_code()),
        )
        return redirect(url_for("game_room", campaign_id=campaign_id))

    @app.get("/campaign/<int:campaign_id>")
    @login_required
    def campaign_detail(campaign_id):
        campaign = campaign_access(campaign_id)
        players = query(
            """SELECT u.* FROM users u JOIN memberships m ON m.user_id = u.id
               WHERE m.campaign_id = ?""",
            (campaign_id,),
        )
        assets = query(
            """SELECT *, item_type AS kind, image_url AS file_url FROM library_items
               WHERE campaign_id = ? ORDER BY updated_at DESC, id DESC""",
            (campaign_id,),
        )
        maps = query("SELECT * FROM maps WHERE campaign_id = ? ORDER BY active DESC, id DESC", (campaign_id,))
        tokens = query("SELECT * FROM tokens WHERE campaign_id = ? ORDER BY token_type, name", (campaign_id,))
        return render_template("campaigns/detail.html", campaign=campaign, players=players, assets=assets, maps=maps, tokens=tokens, is_owner=can_manage_campaign(campaign))

    def save_upload(file, image_only=False):
        if not file or not file.filename:
            return ""
        extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        if image_only:
            try:
                validate_image_upload(file)
            except ValueError as error:
                abort(400, str(error))
        elif extension not in app.config["ALLOWED_EXTENSIONS"]:
            abort(400, "Tipo de arquivo não permitido.")
        safe_name = secure_filename(file.filename)
        if not safe_name:
            abort(400, "Nome de arquivo inválido.")
        filename = f"{secrets.token_hex(8)}-{safe_name}"
        file.save(Path(app.config["UPLOAD_FOLDER"]) / filename)
        return url_for("uploaded_file", filename=filename)

    @app.post("/campaign/<int:campaign_id>/map/new")
    @login_required
    def map_new(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        image_url = save_upload(request.files.get("image"), image_only=True)
        if not image_url:
            flash("Escolha uma imagem para o mapa.", "error")
            return redirect(url_for("campaign_detail", campaign_id=campaign_id))
        has_map = query("SELECT id FROM maps WHERE campaign_id = ? LIMIT 1", (campaign_id,), one=True)
        map_id = execute(
            "INSERT INTO maps (campaign_id, name, image_url, grid_size, active) VALUES (?, ?, ?, ?, ?)",
            (campaign_id, request.form["name"], image_url, int(request.form.get("grid_size", 50)), 0 if has_map else 1),
        )
        execute("INSERT INTO assets (campaign_id, name, kind, file_url) VALUES (?, ?, 'map', ?)", (campaign_id, request.form["name"], image_url))
        flash("Mapa adicionado à campanha.", "success")
        return redirect(url_for("campaign_detail", campaign_id=campaign_id, added=map_id))

    @app.post("/campaign/<int:campaign_id>/map/<int:map_id>/activate")
    @login_required
    def map_activate(campaign_id, map_id):
        campaign_access(campaign_id, owner_only=True)
        if not query("SELECT id FROM maps WHERE id = ? AND campaign_id = ?", (map_id, campaign_id), one=True):
            abort(404)
        execute("UPDATE maps SET active = 0 WHERE campaign_id = ?", (campaign_id,))
        execute("UPDATE maps SET active = 1 WHERE id = ?", (map_id,))
        return redirect(request.referrer or url_for("campaign_detail", campaign_id=campaign_id))

    @app.post("/api/campaign/<int:campaign_id>/map/upload")
    @login_required
    def api_map_upload(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        image_url = save_upload(request.files.get("image"), image_only=True)
        if not image_url:
            return jsonify({"error": "Selecione uma imagem."}), 400
        execute("UPDATE maps SET active = 0 WHERE campaign_id = ?", (campaign_id,))
        map_id = execute(
            "INSERT INTO maps (campaign_id, name, image_url, grid_size, active) VALUES (?, ?, ?, ?, 1)",
            (campaign_id, request.form.get("name", "Nova cena")[:100], image_url, max(20, min(200, int(request.form.get("grid_size", 50))))),
        )
        execute("INSERT INTO assets (campaign_id, name, kind, file_url) VALUES (?, ?, 'map', ?)", (campaign_id, request.form.get("name", "Nova cena")[:100], image_url))
        return jsonify({"ok": True, "id": map_id, "name": request.form.get("name", "Nova cena"), "image_url": image_url})

    @app.post("/api/campaign/<int:campaign_id>/map/<int:map_id>/activate")
    @login_required
    def api_map_activate(campaign_id, map_id):
        campaign_access(campaign_id, owner_only=True)
        scene_map = query("SELECT * FROM maps WHERE id = ? AND campaign_id = ?", (map_id, campaign_id), one=True)
        if not scene_map:
            abort(404)
        execute("UPDATE maps SET active = 0 WHERE campaign_id = ?", (campaign_id,))
        execute("UPDATE maps SET active = 1 WHERE id = ?", (map_id,))
        return jsonify({"ok": True})

    @app.patch("/api/campaign/<int:campaign_id>/map/<int:map_id>")
    @login_required
    def api_map_update(campaign_id, map_id):
        campaign_access(campaign_id, owner_only=True)
        scene_map = query("SELECT * FROM maps WHERE id = ? AND campaign_id = ?", (map_id, campaign_id), one=True)
        if not scene_map:
            abort(404)
        data = request.get_json() or {}
        execute(
            "UPDATE maps SET name = ?, grid_size = ?, grid_enabled = ?, fog_enabled = ? WHERE id = ?",
            (data.get("name", scene_map["name"])[:100], max(20, min(200, int(data.get("grid_size", scene_map["grid_size"])))),
             1 if data.get("grid_enabled", scene_map["grid_enabled"]) else 0, 1 if data.get("fog_enabled", scene_map["fog_enabled"]) else 0, map_id),
        )
        return jsonify({"ok": True})

    @app.delete("/api/campaign/<int:campaign_id>/map/<int:map_id>")
    @login_required
    def api_map_delete(campaign_id, map_id):
        campaign_access(campaign_id, owner_only=True)
        scene_map = query("SELECT * FROM maps WHERE id = ? AND campaign_id = ?", (map_id, campaign_id), one=True)
        if not scene_map:
            abort(404)
        execute("DELETE FROM maps WHERE id = ?", (map_id,))
        next_map = query("SELECT id FROM maps WHERE campaign_id = ? ORDER BY id DESC LIMIT 1", (campaign_id,), one=True)
        if next_map:
            execute("UPDATE maps SET active = 1 WHERE id = ?", (next_map["id"],))
        return jsonify({"ok": True})

    @app.post("/campaign/<int:campaign_id>/character/new")
    @login_required
    def character_new(campaign_id):
        campaign = campaign_access(campaign_id)
        user = current_user()
        token_type = request.form.get("token_type", "player")
        if not can_manage_campaign(campaign, user) and token_type != "player":
            abort(403)
        owner_id = user["id"] if token_type == "player" else None
        default_kind = {"player": "player", "npc": "npc-neutral", "monster": "monster"}.get(token_type, "monster")
        card_kind = request.form.get("card_kind", default_kind)
        visibility = request.form.get("visibility", "public" if token_type == "player" else "partial")
        if card_kind not in TOKEN_CARD_KINDS or visibility not in TOKEN_VISIBILITIES:
            abort(400)
        image_url = save_upload(request.files.get("image"), image_only=True)
        token_id = execute(
            """INSERT INTO tokens
               (campaign_id, owner_id, name, public_name, token_type, card_kind, visibility, class_name, race, level,
                image_url, notes, master_notes, hp, max_hp, resource, max_resource, color, x, y)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (campaign_id, owner_id, request.form["name"], request.form.get("public_name", ""), token_type,
             card_kind, visibility, request.form.get("class_name", ""), request.form.get("race", ""),
             int(request.form.get("level", 1)), image_url, "", request.form.get("notes", ""),
             int(request.form.get("hp", 10)), int(request.form.get("max_hp", 10)),
             int(request.form.get("resource", 0)), int(request.form.get("max_resource", 0)),
             request.form.get("color", "#765cff"), random.randint(30, 70), random.randint(30, 70)),
        )
        execute("INSERT INTO assets (campaign_id, name, kind, file_url) VALUES (?, ?, 'token', ?)", (campaign_id, request.form["name"], image_url))
        if request.form.get("initiative"):
            execute("INSERT INTO initiative (campaign_id, token_id, score) VALUES (?, ?, ?)", (campaign_id, token_id, random.randint(1, 20)))
        flash("Personagem adicionado à mesa.", "success")
        return redirect(request.referrer or url_for("campaign_detail", campaign_id=campaign_id))

    @app.post("/campaign/<int:campaign_id>/asset/new")
    @login_required
    def asset_new(campaign_id):
        campaign = campaign_access(campaign_id, owner_only=True)
        file_url = save_upload(request.files.get("file"), image_only=True)
        item_type = request.form.get("kind", "item")
        if item_type not in LIBRARY_TYPES:
            abort(400)
        execute(
            """INSERT INTO library_items
               (owner_id,campaign_id,name,item_type,system,description,attributes,abilities,image_url,tags,master_notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (current_user()["id"], campaign_id, clean_text(request.form["name"], 100), item_type,
             clean_text(request.form.get("system", campaign["system"]), 80), clean_text(request.form.get("description"), 4000),
             clean_text(request.form.get("attributes"), 4000), clean_text(request.form.get("abilities"), 4000),
             file_url, clean_text(request.form.get("tags"), 500), clean_text(request.form.get("master_notes"), 4000)),
        )
        flash("Item adicionado à biblioteca.", "success")
        return redirect(url_for("campaign_detail", campaign_id=campaign_id))

    @app.post("/campaign/join")
    @login_required
    def campaign_join():
        campaign = query("SELECT * FROM campaigns WHERE visibility = 'private' AND invite_code = ?", (request.form["code"].strip().upper(),), one=True)
        if campaign:
            execute("INSERT OR IGNORE INTO memberships (campaign_id, user_id) VALUES (?, ?)", (campaign["id"], current_user()["id"]))
            return redirect(url_for("campaign_detail", campaign_id=campaign["id"]))
        flash("Código de convite não encontrado.", "error")
        return redirect(url_for("dashboard"))

    @app.post("/campaign/<int:campaign_id>/delete")
    @login_required
    def campaign_delete(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        for table in ("chat_messages", "initiative", "combat_state", "library_items", "assets", "maps", "tokens", "memberships"):
            execute(f"DELETE FROM {table} WHERE campaign_id = ?", (campaign_id,))
        execute("UPDATE character_sheets SET campaign_id = NULL, status = 'draft', master_comment = '' WHERE campaign_id = ?", (campaign_id,))
        execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
        flash("Campanha excluida.", "success")
        return redirect(url_for("admin_dashboard" if current_user()["role"] == "admin" else "dashboard"))

    def user_campaigns(user):
        if user["role"] == "admin":
            return query("SELECT * FROM campaigns ORDER BY updated_at DESC, id DESC")
        if user["role"] == "master":
            return query("SELECT * FROM campaigns WHERE owner_id = ? ORDER BY updated_at DESC, id DESC", (user["id"],))
        return query(
            """SELECT c.* FROM campaigns c JOIN memberships m ON m.campaign_id = c.id
               WHERE m.user_id = ? ORDER BY c.updated_at DESC, c.id DESC""",
            (user["id"],),
        )

    @app.get("/api/campaigns")
    @login_required
    def api_campaigns():
        return jsonify({"campaigns": [campaign_to_dict(item) for item in user_campaigns(current_user())]})

    @app.post("/api/campaigns")
    @master_required
    def api_campaign_create():
        data = request.get_json() or {}
        visibility = data.get("visibility", "private")
        if visibility not in CAMPAIGN_VISIBILITIES or not clean_text(data.get("name"), 100) or not clean_text(data.get("system"), 80):
            return jsonify({"error": "Nome, sistema e visibilidade validos sao obrigatorios."}), 400
        invite_code = invite_value_for_visibility(visibility)
        campaign_id = execute(
            """INSERT INTO campaigns (owner_id, name, description, system, cover, visibility, invite_code, updated_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)""",
            (current_user()["id"], clean_text(data["name"], 100), clean_text(data.get("description"), 2000),
             clean_text(data["system"], 80), clean_text(data.get("cover"), 500), visibility, invite_code),
        )
        return jsonify(campaign_to_dict(query("SELECT * FROM campaigns WHERE id = ?", (campaign_id,), one=True))), 201

    @app.patch("/api/campaigns/<int:campaign_id>")
    @master_required
    def api_campaign_update(campaign_id):
        campaign = campaign_access(campaign_id, owner_only=True)
        data = request.get_json() or {}
        visibility = data.get("visibility", campaign["visibility"])
        name = clean_text(data.get("name", campaign["name"]), 100)
        system = clean_text(data.get("system", campaign["system"]), 80)
        if visibility not in CAMPAIGN_VISIBILITIES or not name or not system:
            return jsonify({"error": "Nome, sistema e visibilidade validos sao obrigatorios."}), 400
        invite_code = campaign["invite_code"]
        if visibility == "public":
            invite_code = invite_value_for_visibility(visibility)
        elif campaign["visibility"] == "public" or not invite_code or str(invite_code).startswith("PUBLIC-"):
            invite_code = invite_value_for_visibility(visibility)
        execute(
            """UPDATE campaigns SET name = ?, description = ?, system = ?, cover = ?, visibility = ?,
               invite_code = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?""",
            (name, clean_text(data.get("description", campaign["description"]), 2000), system,
             clean_text(data.get("cover", campaign["cover"]), 500),
             visibility, invite_code, campaign_id),
        )
        return jsonify(campaign_to_dict(query("SELECT * FROM campaigns WHERE id = ?", (campaign_id,), one=True)))

    @app.delete("/api/campaigns/<int:campaign_id>")
    @master_required
    def api_campaign_delete(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        execute(
            "UPDATE character_sheets SET campaign_id=NULL,status='draft',master_comment='',updated_at=CURRENT_TIMESTAMP WHERE campaign_id=?",
            (campaign_id,),
        )
        execute("DELETE FROM campaigns WHERE id = ?", (campaign_id,))
        return "", 204

    @app.post("/api/campaigns/join")
    @login_required
    def api_campaign_join():
        user = current_user()
        if user["role"] != "player":
            abort(403)
        code = clean_text((request.get_json() or {}).get("code"), 20).upper()
        campaign = query("SELECT * FROM campaigns WHERE visibility = 'private' AND invite_code = ?", (code,), one=True)
        if not campaign:
            return jsonify({"error": "Codigo de convite nao encontrado."}), 404
        execute("INSERT OR IGNORE INTO memberships (campaign_id, user_id) VALUES (?, ?)", (campaign["id"], user["id"]))
        return jsonify(campaign_to_dict(campaign))

    def owned_library_item(item_id):
        item = query("SELECT * FROM library_items WHERE id = ?", (item_id,), one=True)
        user = current_user()
        if not item:
            abort(404)
        if user["role"] != "admin" and item["owner_id"] != user["id"]:
            abort(403)
        return item

    def validate_owned_campaign(campaign_id):
        if campaign_id in (None, ""):
            return None
        try:
            campaign_id = int(campaign_id)
        except (TypeError, ValueError):
            abort(400)
        campaign = query("SELECT * FROM campaigns WHERE id = ?", (campaign_id,), one=True)
        if not campaign or not can_manage_campaign(campaign):
            abort(403)
        return campaign_id

    @app.get("/api/library")
    @master_required
    def api_library_list():
        campaign_id = request.args.get("campaign_id")
        item_type = request.args.get("type")
        sql = "SELECT * FROM library_items WHERE owner_id = ?"
        params = [current_user()["id"]]
        if campaign_id:
            validate_owned_campaign(campaign_id)
            sql += " AND campaign_id = ?"
            params.append(int(campaign_id))
        if item_type:
            sql += " AND item_type = ?"
            params.append(item_type)
        sql += " ORDER BY updated_at DESC, id DESC"
        return jsonify({"items": [library_item_to_dict(item) for item in query(sql, tuple(params))]})

    @app.post("/api/library")
    @master_required
    def api_library_create():
        data = request.get_json() or {}
        item_type = data.get("type", "item")
        name = clean_text(data.get("name"), 100)
        if not name or item_type not in LIBRARY_TYPES:
            return jsonify({"error": "Nome e tipo valido sao obrigatorios."}), 400
        campaign_id = validate_owned_campaign(data.get("campaign_id"))
        item_id = execute(
            """INSERT INTO library_items
               (owner_id, campaign_id, name, item_type, system, description, attributes, abilities, image_url, tags, master_notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (current_user()["id"], campaign_id, name, item_type, clean_text(data.get("system"), 80),
             clean_text(data.get("description"), 4000), clean_text(data.get("attributes"), 4000),
             clean_text(data.get("abilities"), 4000), clean_text(data.get("image_url"), 500),
             clean_text(data.get("tags"), 500), clean_text(data.get("master_notes"), 4000)),
        )
        return jsonify(library_item_to_dict(query("SELECT * FROM library_items WHERE id = ?", (item_id,), one=True))), 201

    @app.patch("/api/library/<int:item_id>")
    @master_required
    def api_library_update(item_id):
        item = owned_library_item(item_id)
        data = request.get_json() or {}
        item_type = data.get("type", item["item_type"])
        name = clean_text(data.get("name", item["name"]), 100)
        if item_type not in LIBRARY_TYPES or not name:
            return jsonify({"error": "Nome e tipo valido sao obrigatorios."}), 400
        campaign_id = validate_owned_campaign(data.get("campaign_id", item["campaign_id"]))
        execute(
            """UPDATE library_items SET campaign_id=?, name=?, item_type=?, system=?, description=?, attributes=?,
               abilities=?, image_url=?, tags=?, master_notes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (campaign_id, name, item_type,
             clean_text(data.get("system", item["system"]), 80), clean_text(data.get("description", item["description"]), 4000),
             clean_text(data.get("attributes", item["attributes"]), 4000), clean_text(data.get("abilities", item["abilities"]), 4000),
             clean_text(data.get("image_url", item["image_url"]), 500), clean_text(data.get("tags", item["tags"]), 500),
             clean_text(data.get("master_notes", item["master_notes"]), 4000), item_id),
        )
        return jsonify(library_item_to_dict(query("SELECT * FROM library_items WHERE id = ?", (item_id,), one=True)))

    @app.post("/api/library/<int:item_id>/duplicate")
    @master_required
    def api_library_duplicate(item_id):
        item = owned_library_item(item_id)
        new_id = execute(
            """INSERT INTO library_items (owner_id,campaign_id,name,item_type,system,description,attributes,abilities,image_url,tags,master_notes)
               VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
            (item["owner_id"], item["campaign_id"], f"{item['name']} (copia)", item["item_type"], item["system"], item["description"],
             item["attributes"], item["abilities"], item["image_url"], item["tags"], item["master_notes"]),
        )
        return jsonify(library_item_to_dict(query("SELECT * FROM library_items WHERE id = ?", (new_id,), one=True))), 201

    @app.delete("/api/library/<int:item_id>")
    @master_required
    def api_library_delete(item_id):
        owned_library_item(item_id)
        execute("DELETE FROM library_items WHERE id = ?", (item_id,))
        return "", 204

    @app.post("/api/library/<int:item_id>/image")
    @master_required
    def api_library_image(item_id):
        owned_library_item(item_id)
        image_url = save_upload(request.files.get("image"), image_only=True)
        if not image_url:
            return jsonify({"error": "Selecione uma imagem."}), 400
        execute("UPDATE library_items SET image_url=?, updated_at=CURRENT_TIMESTAMP WHERE id=?", (image_url, item_id))
        return jsonify({"image_url": image_url})

    def get_sheet(sheet_id):
        sheet = query("SELECT * FROM character_sheets WHERE id = ?", (sheet_id,), one=True)
        if not sheet:
            abort(404)
        return sheet

    def can_review_sheet(sheet, user=None):
        user = user or current_user()
        if user["role"] == "admin":
            return True
        if user["role"] != "master" or not sheet["campaign_id"]:
            return False
        campaign = query("SELECT owner_id FROM campaigns WHERE id = ?", (sheet["campaign_id"],), one=True)
        return bool(campaign and campaign["owner_id"] == user["id"])

    def validate_sheet_campaign(campaign_id, user):
        if campaign_id in (None, ""):
            return None
        try:
            campaign_id = int(campaign_id)
        except (TypeError, ValueError):
            abort(400)
        if user["role"] == "master":
            campaign_access(campaign_id, owner_only=True)
        elif user["role"] == "player":
            member = query("SELECT 1 FROM memberships WHERE campaign_id=? AND user_id=?", (campaign_id, user["id"]), one=True)
            if not member:
                abort(403)
        else:
            abort(403)
        return campaign_id

    @app.get("/api/sheets")
    @login_required
    def api_sheet_list():
        user = current_user()
        if user["role"] == "player":
            sheets = query("SELECT * FROM character_sheets WHERE owner_id=? ORDER BY updated_at DESC", (user["id"],))
        elif user["role"] == "master":
            sheets = query(
                """SELECT DISTINCT s.* FROM character_sheets s LEFT JOIN campaigns c ON c.id=s.campaign_id
                   WHERE s.owner_id=? OR c.owner_id=? ORDER BY s.updated_at DESC""",
                (user["id"], user["id"]),
            )
        else:
            sheets = query("SELECT * FROM character_sheets ORDER BY updated_at DESC")
        return jsonify({"sheets": [sheet_to_dict(sheet) for sheet in sheets]})

    @app.post("/api/sheets")
    @login_required
    def api_sheet_create():
        user = current_user()
        if user["role"] not in {"player", "master"}:
            abort(403)
        data = request.get_json() or {}
        name = clean_text(data.get("name"), 100)
        if not name:
            return jsonify({"error": "O nome da ficha e obrigatorio."}), 400
        campaign_id = validate_sheet_campaign(data.get("campaign_id"), user)
        sheet_data = clean_sheet_data(data.get("data", {}))
        sheet_id = execute(
            """INSERT INTO character_sheets (owner_id,campaign_id,name,system,status,data)
               VALUES (?,?,?,?,?,?)""",
            (user["id"], campaign_id, name, clean_text(data.get("system", "D&D 5e"), 80), "draft",
             json.dumps(sheet_data, ensure_ascii=False)),
        )
        return jsonify(sheet_to_dict(get_sheet(sheet_id))), 201

    @app.patch("/api/sheets/<int:sheet_id>")
    @login_required
    def api_sheet_update(sheet_id):
        sheet = get_sheet(sheet_id)
        user = current_user()
        if sheet["owner_id"] != user["id"]:
            abort(403)
        data = request.get_json() or {}
        name = clean_text(data.get("name", sheet["name"]), 100)
        if not name:
            return jsonify({"error": "O nome da ficha e obrigatorio."}), 400
        campaign_id = validate_sheet_campaign(data.get("campaign_id", sheet["campaign_id"]), user)
        status = "submitted" if sheet["status"] == "approved" else sheet["status"]
        revision = sheet["revision"] + (1 if sheet["status"] == "approved" else 0)
        sheet_data = clean_sheet_data(data.get("data", sheet_to_dict(sheet)["data"]))
        execute(
            """UPDATE character_sheets SET campaign_id=?,name=?,system=?,status=?,data=?,revision=?,
               submitted_at=CASE WHEN ?='submitted' THEN CURRENT_TIMESTAMP ELSE submitted_at END,
               updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (campaign_id, name, clean_text(data.get("system", sheet["system"]), 80),
             status, json.dumps(sheet_data, ensure_ascii=False), revision, status, sheet_id),
        )
        return jsonify(sheet_to_dict(get_sheet(sheet_id)))

    @app.post("/api/sheets/<int:sheet_id>/submit")
    @login_required
    def api_sheet_submit(sheet_id):
        sheet = get_sheet(sheet_id)
        if sheet["owner_id"] != current_user()["id"]:
            abort(403)
        if not sheet["campaign_id"]:
            return jsonify({"error": "Vincule a ficha a uma campanha antes de enviar."}), 400
        if sheet["status"] == "approved":
            return jsonify({"error": "Edite a ficha aprovada para iniciar uma nova revisao."}), 409
        execute("UPDATE character_sheets SET status='submitted',submitted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", (sheet_id,))
        return jsonify(sheet_to_dict(get_sheet(sheet_id)))

    @app.post("/api/sheets/<int:sheet_id>/review")
    @login_required
    def api_sheet_review(sheet_id):
        sheet = get_sheet(sheet_id)
        if not can_review_sheet(sheet):
            abort(403)
        data = request.get_json() or {}
        status = data.get("status")
        comment = clean_text(data.get("comment"), 2000)
        if status not in {"approved", "needs_changes"}:
            return jsonify({"error": "Decisao de revisao invalida."}), 400
        if sheet["status"] not in {"submitted", "approved", "needs_changes"}:
            return jsonify({"error": "A ficha ainda nao foi enviada para revisao."}), 409
        if status == "needs_changes" and not comment:
            return jsonify({"error": "Explique o ajuste solicitado."}), 400
        execute("UPDATE character_sheets SET status=?,master_comment=?,reviewed_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP WHERE id=?", (status, comment, sheet_id))
        return jsonify(sheet_to_dict(get_sheet(sheet_id)))

    @app.post("/api/sheets/<int:sheet_id>/avatar")
    @login_required
    def api_sheet_avatar(sheet_id):
        sheet = get_sheet(sheet_id)
        if sheet["owner_id"] != current_user()["id"]:
            abort(403)
        image_url = save_upload(request.files.get("image"), image_only=True)
        if not image_url:
            return jsonify({"error": "Selecione uma imagem."}), 400
        approved_edit = sheet["status"] == "approved"
        new_status = "submitted" if approved_edit else sheet["status"]
        execute(
            """UPDATE character_sheets SET portrait_url=?,status=?,revision=revision+?,
               submitted_at=CASE WHEN ? THEN CURRENT_TIMESTAMP ELSE submitted_at END,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (image_url, new_status, 1 if approved_edit else 0, 1 if approved_edit else 0, sheet_id),
        )
        return jsonify({"portrait_url": image_url, "status": new_status})

    @app.delete("/api/sheets/<int:sheet_id>")
    @login_required
    def api_sheet_delete(sheet_id):
        sheet = get_sheet(sheet_id)
        if sheet["owner_id"] != current_user()["id"] or sheet["status"] == "approved":
            abort(403)
        execute("DELETE FROM character_sheets WHERE id=?", (sheet_id,))
        return "", 204

    @app.get("/game/<int:campaign_id>")
    @login_required
    def game_room(campaign_id):
        campaign = campaign_access(campaign_id)
        is_owner = can_manage_campaign(campaign)
        user = current_user()
        token_rows = query("SELECT * FROM tokens WHERE campaign_id = ?", (campaign_id,))
        tokens = [token_to_view(token, campaign, user) for token in token_rows]
        token_by_id = {token["id"]: token for token in tokens}
        messages = query("SELECT * FROM chat_messages WHERE campaign_id = ? ORDER BY id DESC LIMIT 30", (campaign_id,))
        initiative = []
        for entry in query("SELECT * FROM initiative WHERE campaign_id = ? ORDER BY score DESC", (campaign_id,)):
            token = token_by_id.get(entry["token_id"])
            if token:
                initiative.append({**dict(entry), **token})
        active_map = query("SELECT * FROM maps WHERE campaign_id = ? AND active = 1 LIMIT 1", (campaign_id,), one=True)
        maps = query("SELECT * FROM maps WHERE campaign_id = ? ORDER BY active DESC, id DESC", (campaign_id,))
        combat = query("SELECT * FROM combat_state WHERE campaign_id = ?", (campaign_id,), one=True)
        return render_template("game.html", campaign=campaign, tokens=tokens, messages=reversed(messages), initiative=initiative, active_map=active_map, maps=maps, is_owner=is_owner, combat=combat)

    @app.get("/api/campaign/<int:campaign_id>/table")
    @login_required
    def api_table_state(campaign_id):
        campaign = campaign_access(campaign_id)
        user = current_user()
        tokens = [token_to_view(token, campaign, user) for token in query("SELECT * FROM tokens WHERE campaign_id=?", (campaign_id,))]
        return jsonify({"campaign_id": campaign_id, "settings": campaign_card_settings(campaign), "tokens": tokens})

    @app.patch("/api/campaign/<int:campaign_id>/card-settings")
    @master_required
    def api_card_settings(campaign_id):
        campaign = campaign_access(campaign_id, owner_only=True)
        data = request.get_json() or {}
        display_mode = data.get("display_mode", campaign["token_display_mode"])
        name_mode = data.get("monster_name_mode", campaign["monster_name_mode"])
        image_mode = data.get("monster_image_mode", campaign["monster_image_mode"])
        if display_mode not in {"card", "token"} or name_mode not in {"real", "generic", "hidden"} or image_mode not in TOKEN_IMAGE_VISIBILITIES:
            return jsonify({"error": "Configuracao de cartas invalida."}), 400
        execute(
            """UPDATE campaigns SET token_display_mode=?,show_narrative_health=?,monster_name_mode=?,
               monster_image_mode=?,show_ally_hp=?,updated_at=CURRENT_TIMESTAMP WHERE id=?""",
            (display_mode, 1 if data.get("show_narrative_health", campaign["show_narrative_health"]) else 0,
             name_mode, image_mode, 1 if data.get("show_ally_hp", campaign["show_ally_hp"]) else 0, campaign_id),
        )
        return jsonify(campaign_card_settings(query("SELECT * FROM campaigns WHERE id=?", (campaign_id,), one=True)))

    @app.post("/api/campaign/<int:campaign_id>/chat")
    @login_required
    def api_chat(campaign_id):
        campaign_access(campaign_id)
        data = request.get_json()
        msg_id = execute(
            "INSERT INTO chat_messages (campaign_id, user_id, author, kind, content) VALUES (?, ?, ?, 'message', ?)",
            (campaign_id, current_user()["id"], current_user()["nickname"], data["content"][:500]),
        )
        return jsonify({"id": msg_id, "author": current_user()["nickname"], "content": data["content"], "kind": "message"})

    @app.post("/api/campaign/<int:campaign_id>/roll")
    @login_required
    def api_roll(campaign_id):
        campaign_access(campaign_id)
        try:
            formula, rolls, total, modifier = roll_formula(request.get_json().get("formula", "1d20"))
        except ValueError as error:
            return jsonify({"error": str(error)}), 400
        content = f"rolou {formula}: {total} ({' + '.join(map(str, rolls))}{modifier:+d})"
        execute(
            "INSERT INTO chat_messages (campaign_id, user_id, author, kind, content) VALUES (?, ?, ?, 'roll', ?)",
            (campaign_id, current_user()["id"], current_user()["nickname"], content),
        )
        return jsonify({"author": current_user()["nickname"], "content": content, "kind": "roll", "total": total})

    @app.patch("/api/campaign/<int:campaign_id>/token/<int:token_id>")
    @login_required
    def api_token(campaign_id, token_id):
        campaign = campaign_access(campaign_id)
        token = query("SELECT * FROM tokens WHERE id = ? AND campaign_id = ?", (token_id, campaign_id), one=True)
        user = current_user()
        is_master = can_manage_campaign(campaign, user)
        if not token or (not is_master and token["owner_id"] != user["id"]):
            return jsonify({"error": "Sem permissão para controlar este token."}), 403
        if not is_master and token["locked"]:
            return jsonify({"error": "Esta carta foi travada pelo Mestre."}), 403
        data = request.get_json() or {}
        visibility = data.get("visibility", token["visibility"]) if is_master else token["visibility"]
        card_kind = data.get("card_kind", token["card_kind"]) if is_master else token["card_kind"]
        image_visibility = data.get("image_visibility", token["image_visibility"]) if is_master else token["image_visibility"]
        if visibility not in TOKEN_VISIBILITIES or card_kind not in TOKEN_CARD_KINDS or image_visibility not in TOKEN_IMAGE_VISIBILITIES:
            return jsonify({"error": "Configuracao de visibilidade invalida."}), 400
        fields = {
            "x": float(data.get("x", token["x"])), "y": float(data.get("y", token["y"])),
            "hp": max(0, int(data.get("hp", token["hp"]))), "max_hp": max(1, int(data.get("max_hp", token["max_hp"]))),
            "name": str(data.get("name", token["name"]))[:100], "class_name": str(data.get("class_name", token["class_name"]))[:100],
            "conditions": str(data.get("conditions", token["conditions"]))[:300], "notes": str(data.get("notes", token["notes"]))[:2000],
            "color": str(data.get("color", token["color"]))[:20], "size": max(1, min(4, int(data.get("size", token["size"])))),
            "hidden": 0 if is_master and "visibility" in data else (1 if (data.get("hidden", token["hidden"]) if is_master else token["hidden"]) else 0),
            "temp_hp": max(0, int(data.get("temp_hp", token["temp_hp"]))), "defense": max(0, int(data.get("defense", token["defense"]))),
            "speed": max(0, int(data.get("speed", token["speed"]))), "race": str(data.get("race", token["race"]))[:100],
            "level": max(1, int(data.get("level", token["level"]))), "attributes": json.dumps(data.get("attributes", json.loads(token["attributes"] or "{}"))),
            "skills": str(data.get("skills", token["skills"]))[:5000], "inventory": str(data.get("inventory", token["inventory"]))[:5000],
            "abilities": str(data.get("abilities", token["abilities"]))[:5000], "spells": str(data.get("spells", token["spells"]))[:5000],
            "story": str(data.get("story", token["story"]))[:10000], "custom_fields": str(data.get("custom_fields", token["custom_fields"]))[:5000],
            "resource": max(0, int(data.get("resource", token["resource"]))), "max_resource": max(0, int(data.get("max_resource", token["max_resource"]))),
            "buffs": str(data.get("buffs", token["buffs"]))[:1000], "debuffs": str(data.get("debuffs", token["debuffs"]))[:1000],
            "public_name": str(data.get("public_name", token["public_name"]))[:100] if is_master else token["public_name"],
            "card_kind": card_kind, "visibility": visibility, "image_visibility": image_visibility,
            "show_life_state": 1 if (data.get("show_life_state", token["show_life_state"]) if is_master else token["show_life_state"]) else 0,
            "share_class_race": 1 if (data.get("share_class_race", token["share_class_race"]) if is_master else token["share_class_race"]) else 0,
            "master_notes": str(data.get("master_notes", token["master_notes"]))[:3000] if is_master else token["master_notes"],
            "locked": 1 if (data.get("locked", token["locked"]) if is_master else token["locked"]) else 0,
        }
        execute("""UPDATE tokens SET x=:x,y=:y,hp=:hp,max_hp=:max_hp,name=:name,class_name=:class_name,
                   conditions=:conditions,notes=:notes,color=:color,size=:size,hidden=:hidden,temp_hp=:temp_hp,
                   defense=:defense,speed=:speed,race=:race,level=:level,attributes=:attributes,skills=:skills,
                   inventory=:inventory,abilities=:abilities,spells=:spells,story=:story,custom_fields=:custom_fields,
                   resource=:resource,max_resource=:max_resource,buffs=:buffs,debuffs=:debuffs,public_name=:public_name,
                   card_kind=:card_kind,visibility=:visibility,image_visibility=:image_visibility,
                   show_life_state=:show_life_state,share_class_race=:share_class_race,master_notes=:master_notes,locked=:locked
                   WHERE id=:id""", {**fields, "id": token_id})
        return jsonify(token_to_view(query("SELECT * FROM tokens WHERE id=?", (token_id,), one=True), campaign, user))

    @app.get("/api/campaign/<int:campaign_id>/token/<int:token_id>/sheet")
    @login_required
    def api_token_sheet(campaign_id, token_id):
        campaign = campaign_access(campaign_id)
        token = query("SELECT * FROM tokens WHERE id=? AND campaign_id=?", (token_id, campaign_id), one=True)
        if not token:
            abort(404)
        user = current_user()
        if not can_manage_campaign(campaign) and token["owner_id"] != user["id"]:
            abort(403)
        return jsonify(token_to_view(token, campaign, user))

    @app.delete("/api/campaign/<int:campaign_id>/token/<int:token_id>")
    @login_required
    def api_token_delete(campaign_id, token_id):
        campaign_access(campaign_id, owner_only=True)
        execute("DELETE FROM tokens WHERE id = ? AND campaign_id = ?", (token_id, campaign_id))
        return jsonify({"ok": True})

    @app.post("/api/campaign/<int:campaign_id>/initiative/<int:token_id>")
    @login_required
    def api_initiative_add(campaign_id, token_id):
        campaign_access(campaign_id, owner_only=True)
        if not query("SELECT id FROM tokens WHERE id=? AND campaign_id=?", (token_id, campaign_id), one=True):
            abort(404)
        data = request.get_json() or {}
        execute("DELETE FROM initiative WHERE campaign_id=? AND token_id=?", (campaign_id, token_id))
        execute("INSERT INTO initiative (campaign_id, token_id, score) VALUES (?, ?, ?)", (campaign_id, token_id, int(data.get("score", random.randint(1, 20)))))
        return jsonify({"ok": True})

    @app.delete("/api/campaign/<int:campaign_id>/initiative/<int:token_id>")
    @login_required
    def api_initiative_remove(campaign_id, token_id):
        campaign_access(campaign_id, owner_only=True)
        execute("DELETE FROM initiative WHERE campaign_id=? AND token_id=?", (campaign_id, token_id))
        return jsonify({"ok": True})

    @app.post("/api/campaign/<int:campaign_id>/combat/toggle")
    @login_required
    def api_combat_toggle(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        state = query("SELECT * FROM combat_state WHERE campaign_id=?", (campaign_id,), one=True)
        active = 0 if state and state["active"] else 1
        execute("INSERT OR IGNORE INTO combat_state (campaign_id) VALUES (?)", (campaign_id,))
        execute("UPDATE combat_state SET active=?, round=CASE WHEN ?=1 THEN 1 ELSE round END WHERE campaign_id=?", (active, active, campaign_id))
        text = "Combate iniciado." if active else "Combate encerrado."
        execute("INSERT INTO chat_messages (campaign_id, author, kind, content) VALUES (?, 'Apex Realms', 'system', ?)", (campaign_id, text))
        return jsonify({"ok": True, "active": active})

    @app.post("/api/campaign/<int:campaign_id>/combat/action")
    @login_required
    def api_combat_action(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        data = request.get_json() or {}
        token = query("SELECT * FROM tokens WHERE id=? AND campaign_id=?", (int(data.get("token_id", 0)), campaign_id), one=True)
        if not token:
            abort(404)
        action, amount = data.get("action"), max(0, int(data.get("amount", 0)))
        hp, temp_hp = token["hp"], token["temp_hp"]
        if action == "damage":
            absorbed = min(temp_hp, amount)
            temp_hp -= absorbed
            hp = max(0, hp - (amount - absorbed))
            description = f"{token['name']} sofreu {amount} de dano."
        elif action == "heal":
            hp = min(token["max_hp"], hp + amount)
            description = f"{token['name']} recuperou {amount} PV."
        elif action == "temp":
            temp_hp = amount
            description = f"{token['name']} recebeu {amount} PV temporários."
        else:
            return jsonify({"error": "Ação de combate inválida."}), 400
        conditions = token["conditions"]
        if hp == 0 and "Caído" not in conditions:
            conditions = (conditions + ", Caído").strip(", ")
        execute("UPDATE tokens SET hp=?,temp_hp=?,conditions=? WHERE id=?", (hp, temp_hp, conditions, token["id"]))
        execute("INSERT INTO chat_messages (campaign_id, author, kind, content) VALUES (?, 'Combate', 'combat', ?)", (campaign_id, description))
        return jsonify({"ok": True, "hp": hp, "temp_hp": temp_hp, "content": description})

    @app.post("/api/campaign/<int:campaign_id>/combat/attack")
    @login_required
    def api_combat_attack(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        data = request.get_json() or {}
        attacker = query("SELECT * FROM tokens WHERE id=? AND campaign_id=?", (int(data.get("attacker_id", 0)), campaign_id), one=True)
        target = query("SELECT * FROM tokens WHERE id=? AND campaign_id=?", (int(data.get("target_id", 0)), campaign_id), one=True)
        if not attacker or not target:
            abort(404)
        attack_roll = random.randint(1, 20)
        bonus = int(data.get("bonus", 0))
        total = attack_roll + bonus
        critical = attack_roll == 20
        hit = critical or total >= target["defense"]
        damage = 0
        if hit:
            try:
                _, rolls, damage, _ = roll_formula(data.get("damage", "1d6"))
                if critical:
                    damage += sum(rolls)
            except ValueError as error:
                return jsonify({"error": str(error)}), 400
            absorbed = min(target["temp_hp"], damage)
            new_hp = max(0, target["hp"] - (damage - absorbed))
            conditions = target["conditions"]
            if new_hp == 0 and "Caído" not in conditions:
                conditions = (conditions + ", Caído").strip(", ")
            execute("UPDATE tokens SET temp_hp=?, hp=?, conditions=? WHERE id=?", (target["temp_hp"] - absorbed, new_hp, conditions, target["id"]))
        description = f"{attacker['name']} atacou {target['name']}: {total} contra Defesa {target['defense']} — " + (f"acertou e causou {damage} de dano." if hit else "errou.")
        execute("INSERT INTO chat_messages (campaign_id, author, kind, content) VALUES (?, 'Combate', 'combat', ?)", (campaign_id, description))
        return jsonify({"ok": True, "hit": hit, "critical": critical, "attack": total, "damage": damage, "content": description})

    @app.post("/api/campaign/<int:campaign_id>/initiative/roll-all")
    @login_required
    def api_initiative_roll_all(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        tokens = query("SELECT id,attributes FROM tokens WHERE campaign_id=? AND hidden=0", (campaign_id,))
        execute("DELETE FROM initiative WHERE campaign_id=?", (campaign_id,))
        for token in tokens:
            attributes = json.loads(token["attributes"] or "{}")
            dexterity = int(attributes.get("des", 10))
            modifier = (dexterity - 10) // 2
            execute("INSERT INTO initiative (campaign_id,token_id,score) VALUES (?,?,?)", (campaign_id, token["id"], random.randint(1, 20) + modifier))
        return jsonify({"ok": True, "count": len(tokens)})

    @app.post("/api/campaign/<int:campaign_id>/initiative/next")
    @login_required
    def api_next_turn(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        rows = query("SELECT id, active FROM initiative WHERE campaign_id = ? ORDER BY score DESC", (campaign_id,))
        if rows:
            active_index = next((i for i, row in enumerate(rows) if row["active"]), -1)
            next_index = (active_index + 1) % len(rows)
            execute("UPDATE initiative SET active = 0 WHERE campaign_id = ?", (campaign_id,))
            execute("UPDATE initiative SET active = 1 WHERE id = ?", (rows[next_index]["id"],))
            if next_index == 0 and active_index >= 0:
                execute("UPDATE combat_state SET round=round+1 WHERE campaign_id=? AND active=1", (campaign_id,))
        return jsonify({"ok": True})

    @app.post("/api/campaign/<int:campaign_id>/notes")
    @login_required
    def api_notes(campaign_id):
        campaign = campaign_access(campaign_id, owner_only=True)
        data = request.get_json() or {}
        public_notes = data.get("public_notes", "")[:10000]
        gm_notes = campaign["gm_notes"]
        if can_manage_campaign(campaign):
            gm_notes = data.get("gm_notes", "")[:10000]
        execute("UPDATE campaigns SET public_notes = ?, gm_notes = ? WHERE id = ?", (public_notes, gm_notes, campaign_id))
        return jsonify({"ok": True})

    @app.cli.command("init-db")
    def init_db_command():
        init_database(app)
        print("Banco inicializado sem dados de exemplo.")

    return app


def init_database(app):
    with app.app_context():
        schema = (Path(__file__).parent / "models" / "schema.sql").read_text(encoding="utf-8")
        get_db().executescript(schema)
        # Lightweight migrations keep existing local databases compatible.
        columns = {row["name"] for row in query("PRAGMA table_info(tokens)")}
        for name, definition in [
            ("race", "TEXT DEFAULT ''"), ("level", "INTEGER DEFAULT 1"), ("image_url", "TEXT DEFAULT ''"),
            ("notes", "TEXT DEFAULT ''"), ("size", "INTEGER DEFAULT 1"), ("hidden", "INTEGER DEFAULT 0"),
            ("temp_hp", "INTEGER DEFAULT 0"), ("defense", "INTEGER DEFAULT 10"), ("speed", "INTEGER DEFAULT 9"),
            ("attributes", "TEXT DEFAULT '{}'"), ("skills", "TEXT DEFAULT ''"), ("inventory", "TEXT DEFAULT ''"),
            ("abilities", "TEXT DEFAULT ''"), ("spells", "TEXT DEFAULT ''"), ("story", "TEXT DEFAULT ''"),
            ("custom_fields", "TEXT DEFAULT ''"), ("public_name", "TEXT DEFAULT ''"),
            ("card_kind", "TEXT NOT NULL DEFAULT 'monster'"), ("visibility", "TEXT NOT NULL DEFAULT 'partial'"),
            ("image_visibility", "TEXT NOT NULL DEFAULT 'real'"), ("show_life_state", "INTEGER NOT NULL DEFAULT 1"),
            ("share_class_race", "INTEGER NOT NULL DEFAULT 0"), ("resource", "INTEGER NOT NULL DEFAULT 0"),
            ("max_resource", "INTEGER NOT NULL DEFAULT 0"), ("buffs", "TEXT DEFAULT ''"),
            ("debuffs", "TEXT DEFAULT ''"), ("master_notes", "TEXT DEFAULT ''"), ("locked", "INTEGER NOT NULL DEFAULT 0"),
        ]:
            if name not in columns:
                get_db().execute(f"ALTER TABLE tokens ADD COLUMN {name} {definition}")
        get_db().execute("UPDATE tokens SET card_kind=CASE WHEN token_type='player' THEN 'player' WHEN token_type='npc' THEN 'npc-neutral' ELSE card_kind END WHERE card_kind='monster'")
        get_db().execute("UPDATE tokens SET card_kind=REPLACE(card_kind, '_', '-') WHERE card_kind IN ('npc_ally','npc_neutral','npc_hostile')")
        get_db().execute("UPDATE tokens SET visibility='secret', hidden=0 WHERE hidden=1")
        map_columns = {row["name"] for row in query("PRAGMA table_info(maps)")}
        if "fog_enabled" not in map_columns:
            get_db().execute("ALTER TABLE maps ADD COLUMN fog_enabled INTEGER DEFAULT 0")
        campaign_columns = {row["name"] for row in query("PRAGMA table_info(campaigns)")}
        for name, definition in [
            ("visibility", "TEXT NOT NULL DEFAULT 'private'"),
            ("created_at", "TEXT"),
            ("updated_at", "TEXT"),
            ("token_display_mode", "TEXT NOT NULL DEFAULT 'card'"),
            ("show_narrative_health", "INTEGER NOT NULL DEFAULT 1"),
            ("monster_name_mode", "TEXT NOT NULL DEFAULT 'real'"),
            ("monster_image_mode", "TEXT NOT NULL DEFAULT 'real'"),
            ("show_ally_hp", "INTEGER NOT NULL DEFAULT 0"),
        ]:
            if name not in campaign_columns:
                get_db().execute(f"ALTER TABLE campaigns ADD COLUMN {name} {definition}")
        get_db().execute("UPDATE campaigns SET created_at=COALESCE(created_at,CURRENT_TIMESTAMP), updated_at=COALESCE(updated_at,CURRENT_TIMESTAMP)")
        get_db().commit()
        execute("UPDATE users SET role = 'player' WHERE role NOT IN ('player', 'master', 'admin')")
        admin = query("SELECT id FROM users WHERE email = ?", ("admin@apexrealms.com",), one=True)
        if not admin:
            execute(
                "INSERT INTO users (name, nickname, email, password_hash, role, bio, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("Admin Apex", "Admin", "admin@apexrealms.com", generate_password_hash(app.config["ADMIN_INITIAL_PASSWORD"]), "admin", "Administrador do sistema Apex Realms.", "Gestão, segurança e suporte"),
            )
        else:
            execute(
                "UPDATE users SET name = ?, nickname = ?, role = 'admin', bio = ?, preferences = ? WHERE id = ?",
                ("Admin Apex", "Admin", "Administrador do sistema Apex Realms.", "Gestão, segurança e suporte", admin["id"]),
            )
        reset_done = query("SELECT value FROM app_meta WHERE key = 'launch_reset_v1'", one=True)
        if not reset_done:
            admin = query("SELECT id FROM users WHERE email = ?", ("admin@apexrealms.com",), one=True)
            for table in ("chat_messages", "initiative", "combat_state", "library_items", "character_sheets", "assets", "maps", "tokens", "memberships"):
                execute(f"DELETE FROM {table}")
            execute("DELETE FROM campaigns")
            execute("DELETE FROM users WHERE id <> ?", (admin["id"],))
            execute("INSERT OR REPLACE INTO app_meta (key, value) VALUES ('launch_reset_v1', 'done')")


app = create_app()

if __name__ == "__main__":
    init_database(app)
    app.run(
        debug=os.environ.get("FLASK_DEBUG", "1") == "1",
        host=os.environ.get("HOST", "127.0.0.1"),
        port=int(os.environ.get("PORT", 5000)),
    )
