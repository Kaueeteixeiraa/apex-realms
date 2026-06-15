import json
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
    Path(app.config["UPLOAD_FOLDER"]).mkdir(parents=True, exist_ok=True)
    Path(app.config["DATABASE"]).parent.mkdir(parents=True, exist_ok=True)
    init_app(app)

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
            campaign_id = execute(
                """INSERT INTO campaigns (owner_id, name, description, system, cover, invite_code)
                   VALUES (?, ?, ?, ?, ?, ?)""",
                (
                    current_user()["id"],
                    request.form["name"],
                    request.form.get("description", ""),
                    request.form["system"],
                    request.form.get("cover", ""),
                    secrets.token_hex(4).upper(),
                ),
            )
            return redirect(url_for("campaign_detail", campaign_id=campaign_id))
        return render_template("campaigns/new.html")

    @app.post("/campaign/quick")
    @master_required
    def quick_campaign():
        campaign_id = execute(
            """INSERT INTO campaigns (owner_id, name, description, system, invite_code, quick_session)
               VALUES (?, ?, ?, ?, ?, 1)""",
            (current_user()["id"], "Sessão rápida", "Uma sala pronta para jogar agora.", "Sistema livre", secrets.token_hex(4).upper()),
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
        assets = query("SELECT * FROM assets WHERE campaign_id = ? ORDER BY favorite DESC, id DESC", (campaign_id,))
        maps = query("SELECT * FROM maps WHERE campaign_id = ? ORDER BY active DESC, id DESC", (campaign_id,))
        tokens = query("SELECT * FROM tokens WHERE campaign_id = ? ORDER BY token_type, name", (campaign_id,))
        return render_template("campaigns/detail.html", campaign=campaign, players=players, assets=assets, maps=maps, tokens=tokens, is_owner=can_manage_campaign(campaign))

    def save_upload(file, image_only=False):
        if not file or not file.filename:
            return ""
        extension = file.filename.rsplit(".", 1)[-1].lower() if "." in file.filename else ""
        allowed = {"png", "jpg", "jpeg", "webp", "gif"} if image_only else app.config["ALLOWED_EXTENSIONS"]
        if extension not in allowed:
            abort(400, "Tipo de arquivo não permitido.")
        filename = f"{secrets.token_hex(8)}-{secure_filename(file.filename)}"
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
        image_url = save_upload(request.files.get("image"), image_only=True)
        token_id = execute(
            """INSERT INTO tokens
               (campaign_id, owner_id, name, token_type, class_name, race, level, image_url, notes, hp, max_hp, color, x, y)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (campaign_id, owner_id, request.form["name"], token_type, request.form.get("class_name", ""),
             request.form.get("race", ""), int(request.form.get("level", 1)), image_url, request.form.get("notes", ""),
             int(request.form.get("hp", 10)), int(request.form.get("max_hp", 10)), request.form.get("color", "#765cff"),
             random.randint(30, 70), random.randint(30, 70)),
        )
        execute("INSERT INTO assets (campaign_id, name, kind, file_url) VALUES (?, ?, 'token', ?)", (campaign_id, request.form["name"], image_url))
        if request.form.get("initiative"):
            execute("INSERT INTO initiative (campaign_id, token_id, score) VALUES (?, ?, ?)", (campaign_id, token_id, random.randint(1, 20)))
        flash("Personagem adicionado à mesa.", "success")
        return redirect(request.referrer or url_for("campaign_detail", campaign_id=campaign_id))

    @app.post("/campaign/<int:campaign_id>/asset/new")
    @login_required
    def asset_new(campaign_id):
        campaign_access(campaign_id, owner_only=True)
        file_url = save_upload(request.files.get("file"))
        execute(
            "INSERT INTO assets (campaign_id, name, kind, file_url, notes) VALUES (?, ?, ?, ?, ?)",
            (campaign_id, request.form["name"], request.form["kind"], file_url, request.form.get("notes", "")),
        )
        flash("Item adicionado à biblioteca.", "success")
        return redirect(url_for("campaign_detail", campaign_id=campaign_id))

    @app.post("/campaign/join")
    @login_required
    def campaign_join():
        campaign = query("SELECT * FROM campaigns WHERE invite_code = ?", (request.form["code"].upper(),), one=True)
        if campaign:
            execute("INSERT OR IGNORE INTO memberships (campaign_id, user_id) VALUES (?, ?)", (campaign["id"], current_user()["id"]))
            return redirect(url_for("campaign_detail", campaign_id=campaign["id"]))
        flash("Código de convite não encontrado.", "error")
        return redirect(url_for("dashboard"))

    @app.get("/game/<int:campaign_id>")
    @login_required
    def game_room(campaign_id):
        campaign = campaign_access(campaign_id)
        is_owner = can_manage_campaign(campaign)
        tokens = query("SELECT * FROM tokens WHERE campaign_id = ?" + ("" if is_owner else " AND hidden = 0"), (campaign_id,))
        messages = query("SELECT * FROM chat_messages WHERE campaign_id = ? ORDER BY id DESC LIMIT 30", (campaign_id,))
        initiative = query(
            """SELECT i.*, t.name, t.color, t.hp, t.max_hp, t.conditions
               FROM initiative i JOIN tokens t ON t.id = i.token_id
               WHERE i.campaign_id = ?""" + ("" if is_owner else " AND t.hidden = 0") + " ORDER BY i.score DESC",
            (campaign_id,),
        )
        active_map = query("SELECT * FROM maps WHERE campaign_id = ? AND active = 1 LIMIT 1", (campaign_id,), one=True)
        maps = query("SELECT * FROM maps WHERE campaign_id = ? ORDER BY active DESC, id DESC", (campaign_id,))
        combat = query("SELECT * FROM combat_state WHERE campaign_id = ?", (campaign_id,), one=True)
        return render_template("game.html", campaign=campaign, tokens=tokens, messages=reversed(messages), initiative=initiative, active_map=active_map, maps=maps, is_owner=is_owner, combat=combat)

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
        if not token or (not can_manage_campaign(campaign, user) and token["owner_id"] != user["id"]):
            return jsonify({"error": "Sem permissão para controlar este token."}), 403
        data = request.get_json()
        fields = {
            "x": float(data.get("x", token["x"])), "y": float(data.get("y", token["y"])),
            "hp": max(0, int(data.get("hp", token["hp"]))), "max_hp": max(1, int(data.get("max_hp", token["max_hp"]))),
            "name": str(data.get("name", token["name"]))[:100], "class_name": str(data.get("class_name", token["class_name"]))[:100],
            "conditions": str(data.get("conditions", token["conditions"]))[:300], "notes": str(data.get("notes", token["notes"]))[:2000],
            "color": str(data.get("color", token["color"]))[:20], "size": max(1, min(4, int(data.get("size", token["size"])))),
            "hidden": 1 if data.get("hidden", token["hidden"]) else 0,
            "temp_hp": max(0, int(data.get("temp_hp", token["temp_hp"]))), "defense": max(0, int(data.get("defense", token["defense"]))),
            "speed": max(0, int(data.get("speed", token["speed"]))), "race": str(data.get("race", token["race"]))[:100],
            "level": max(1, int(data.get("level", token["level"]))), "attributes": json.dumps(data.get("attributes", json.loads(token["attributes"] or "{}"))),
            "skills": str(data.get("skills", token["skills"]))[:5000], "inventory": str(data.get("inventory", token["inventory"]))[:5000],
            "abilities": str(data.get("abilities", token["abilities"]))[:5000], "spells": str(data.get("spells", token["spells"]))[:5000],
            "story": str(data.get("story", token["story"]))[:10000], "custom_fields": str(data.get("custom_fields", token["custom_fields"]))[:5000],
        }
        execute("""UPDATE tokens SET x=:x,y=:y,hp=:hp,max_hp=:max_hp,name=:name,class_name=:class_name,
                   conditions=:conditions,notes=:notes,color=:color,size=:size,hidden=:hidden,temp_hp=:temp_hp,
                   defense=:defense,speed=:speed,race=:race,level=:level,attributes=:attributes,skills=:skills,
                   inventory=:inventory,abilities=:abilities,spells=:spells,story=:story,custom_fields=:custom_fields WHERE id=:id""", {**fields, "id": token_id})
        return jsonify({"ok": True})

    @app.get("/api/campaign/<int:campaign_id>/token/<int:token_id>/sheet")
    @login_required
    def api_token_sheet(campaign_id, token_id):
        campaign = campaign_access(campaign_id)
        token = query("SELECT * FROM tokens WHERE id=? AND campaign_id=?", (token_id, campaign_id), one=True)
        if not token:
            abort(404)
        if not can_manage_campaign(campaign) and token["owner_id"] != current_user()["id"]:
            abort(403)
        result = dict(token)
        result["attributes"] = json.loads(result["attributes"] or "{}")
        return jsonify(result)

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
        print("Banco criado e dados de exemplo adicionados.")

    return app


def init_database(app):
    with app.app_context():
        schema = (Path(__file__).parent / "models" / "schema.sql").read_text(encoding="utf-8")
        get_db().executescript(schema)
        # Lightweight migrations keep existing local databases compatible.
        columns = {row["name"] for row in query("PRAGMA table_info(tokens)")}
        for name, definition in [("race", "TEXT DEFAULT ''"), ("level", "INTEGER DEFAULT 1"), ("image_url", "TEXT DEFAULT ''"), ("notes", "TEXT DEFAULT ''"), ("size", "INTEGER DEFAULT 1"), ("hidden", "INTEGER DEFAULT 0"), ("temp_hp", "INTEGER DEFAULT 0"), ("defense", "INTEGER DEFAULT 10"), ("speed", "INTEGER DEFAULT 9"), ("attributes", "TEXT DEFAULT '{}'"), ("skills", "TEXT DEFAULT ''"), ("inventory", "TEXT DEFAULT ''"), ("abilities", "TEXT DEFAULT ''"), ("spells", "TEXT DEFAULT ''"), ("story", "TEXT DEFAULT ''"), ("custom_fields", "TEXT DEFAULT ''")]:
            if name not in columns:
                get_db().execute(f"ALTER TABLE tokens ADD COLUMN {name} {definition}")
        map_columns = {row["name"] for row in query("PRAGMA table_info(maps)")}
        if "fog_enabled" not in map_columns:
            get_db().execute("ALTER TABLE maps ADD COLUMN fog_enabled INTEGER DEFAULT 0")
        get_db().commit()
        execute("UPDATE users SET role = 'player' WHERE role NOT IN ('player', 'master', 'admin')")
        if not query("SELECT id FROM users LIMIT 1", one=True):
            gm_id = execute(
                "INSERT INTO users (name, nickname, email, password_hash, role, bio, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("Lina Monteiro", "Lina", "mestre@apexrealms.com", generate_password_hash("apex123"), "master", "Narradora de mundos impossíveis.", "Fantasia sombria, investigação"),
            )
            player_id = execute(
                "INSERT INTO users (name, nickname, email, password_hash, role, bio, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("Caio Reis", "Caio", "jogador@apexrealms.com", generate_password_hash("apex123"), "player", "Sempre pronto para uma missão.", "D&D, Tormenta"),
            )
            campaign_id = execute(
                """INSERT INTO campaigns (owner_id, name, description, system, cover, scene, invite_code, public_notes, last_summary)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (gm_id, "Ecos de Vhal'Tor", "Uma expedição além do véu procura a cidade que desapareceu há trezentos anos.", "D&D 5e", "", "Ruínas do Observatório", "APEX2026", "A torre reage à luz da lua. Não confiem no cartógrafo.", "O grupo atravessou o Pântano de Vidro e encontrou o observatório."),
            )
            execute("INSERT INTO memberships (campaign_id, user_id, character_name) VALUES (?, ?, ?)", (campaign_id, player_id, "Kael Ardent"))
            token1 = execute("INSERT INTO tokens (campaign_id, owner_id, name, token_type, class_name, hp, max_hp, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (campaign_id, player_id, "Kael Ardent", "player", "Patrulheiro", 32, 38, 34, 61, "#44d7ff"))
            token2 = execute("INSERT INTO tokens (campaign_id, name, token_type, class_name, hp, max_hp, x, y, color, conditions) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)", (campaign_id, "Sentinela Vazia", "monster", "Constructo", 48, 60, 68, 35, "#a66bff", "Atordoado"))
            token3 = execute("INSERT INTO tokens (campaign_id, name, token_type, class_name, hp, max_hp, x, y, color) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)", (campaign_id, "Lyra Voss", "npc", "Arcanista", 21, 24, 48, 48, "#ff5ca8"))
            execute("INSERT INTO initiative (campaign_id, token_id, score, active) VALUES (?, ?, ?, 1)", (campaign_id, token1, 19))
            execute("INSERT INTO initiative (campaign_id, token_id, score) VALUES (?, ?, ?)", (campaign_id, token2, 14))
            execute("INSERT INTO initiative (campaign_id, token_id, score) VALUES (?, ?, ?)", (campaign_id, token3, 11))
            for name, kind, favorite in [("Observatório em ruínas", "map", 1), ("Sentinela Vazia", "token", 1), ("Carta do Cartógrafo", "handout", 0), ("Cristal de Vhal", "item", 0)]:
                execute("INSERT INTO assets (campaign_id, name, kind, favorite) VALUES (?, ?, ?, ?)", (campaign_id, name, kind, favorite))
            execute("INSERT INTO chat_messages (campaign_id, author, kind, content) VALUES (?, ?, ?, ?)", (campaign_id, "Apex Realms", "system", "A sessão começou nas Ruínas do Observatório."))
            execute("INSERT INTO chat_messages (campaign_id, user_id, author, kind, content) VALUES (?, ?, ?, ?, ?)", (campaign_id, player_id, "Caio", "message", "Kael examina as inscrições na porta."))
        if not query("SELECT id FROM users WHERE email = ?", ("admin@apexrealms.com",), one=True):
            execute(
                "INSERT INTO users (name, nickname, email, password_hash, role, bio, preferences) VALUES (?, ?, ?, ?, ?, ?, ?)",
                ("Admin Apex", "Admin", "admin@apexrealms.com", generate_password_hash("apex123"), "admin", "Administrador do sistema Apex Realms.", "Gestão, segurança e suporte"),
            )
        demo_campaign = query("SELECT id FROM campaigns ORDER BY id LIMIT 1", one=True)
        if demo_campaign and not query("SELECT id FROM maps WHERE campaign_id = ? LIMIT 1", (demo_campaign["id"],), one=True):
            execute(
                "INSERT INTO maps (campaign_id, name, image_url, grid_size, active) VALUES (?, ?, ?, ?, 1)",
                (demo_campaign["id"], "Observatório em ruínas", "/static/img/demo-map.svg", 50),
            )


app = create_app()

if __name__ == "__main__":
    init_database(app)
    app.run(debug=True, port=5000)
