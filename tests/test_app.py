import io
import tempfile
import unittest
from pathlib import Path

from werkzeug.security import generate_password_hash

from app import create_app, init_database
from database import execute, query


class ApexRealmsTestCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.app = create_app()
        self.app.config.update(
            TESTING=True,
            DATABASE=self.root / "test.db",
            UPLOAD_FOLDER=self.root / "uploads",
        )
        Path(self.app.config["UPLOAD_FOLDER"]).mkdir()
        init_database(self.app)
        self.client = self.app.test_client()
        with self.app.app_context():
            self.master_id = self.create_user("Mestre Um", "mestre1@example.com", "master")
            self.other_master_id = self.create_user("Mestre Dois", "mestre2@example.com", "master")
            self.player_id = self.create_user("Jogador", "player@example.com", "player")

    @staticmethod
    def create_user(name, email, role):
        return execute(
            "INSERT INTO users (name,nickname,email,password_hash,role) VALUES (?,?,?,?,?)",
            (name, name.replace(" ", ""), email, generate_password_hash("apex123"), role),
        )

    def login(self, email):
        return self.client.post("/login", data={"email": email, "password": "apex123"})

    def logout(self):
        self.client.get("/logout")

    def create_campaign(self, visibility="private"):
        response = self.client.post("/api/campaigns", json={
            "name": "Portal Astral",
            "system": "D&D 5e",
            "description": "Uma campanha real.",
            "visibility": visibility,
        })
        self.assertEqual(response.status_code, 201)
        return response.json

    def test_campaign_crud_visibility_invite_and_join(self):
        self.login("mestre1@example.com")
        private_campaign = self.create_campaign("private")
        self.assertRegex(private_campaign["invite_code"], r"^AR-[A-Z2-9]{4}-[A-Z2-9]{4}$")

        public_campaign = self.create_campaign("public")
        self.assertIsNone(public_campaign["invite_code"])
        updated = self.client.patch(f"/api/campaigns/{public_campaign['id']}", json={"visibility": "private"})
        self.assertEqual(updated.status_code, 200)
        self.assertRegex(updated.json["invite_code"], r"^AR-")

        self.logout()
        self.login("player@example.com")
        joined = self.client.post("/api/campaigns/join", json={"code": private_campaign["invite_code"]})
        self.assertEqual(joined.status_code, 200)
        campaigns = self.client.get("/api/campaigns").json["campaigns"]
        self.assertEqual([item["id"] for item in campaigns], [private_campaign["id"]])

        self.logout()
        self.login("mestre1@example.com")
        self.assertEqual(self.client.delete(f"/api/campaigns/{public_campaign['id']}").status_code, 204)
        ids = [item["id"] for item in self.client.get("/api/campaigns").json["campaigns"]]
        self.assertNotIn(public_campaign["id"], ids)

    def test_campaign_delete_unlinks_sheet_and_cross_origin_write_is_blocked(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        blocked = self.client.post(
            "/api/campaigns",
            json={"name": "Cross origin", "system": "D&D 5e", "visibility": "private"},
            headers={"Origin": "https://example.invalid"},
        )
        self.assertEqual(blocked.status_code, 403)

        self.logout()
        self.login("player@example.com")
        self.client.post("/api/campaigns/join", json={"code": campaign["invite_code"]})
        sheet = self.client.post(
            "/api/sheets",
            json={"name": "Lyra", "campaign_id": campaign["id"], "data": {}},
        ).json

        self.logout()
        self.login("mestre1@example.com")
        self.assertEqual(self.client.delete(f"/api/campaigns/{campaign['id']}").status_code, 204)
        with self.app.app_context():
            stored = query("SELECT campaign_id,status FROM character_sheets WHERE id=?", (sheet["id"],), one=True)
            self.assertIsNone(stored["campaign_id"])
            self.assertEqual(stored["status"], "draft")

    def test_master_cannot_manage_another_master_campaign(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        self.logout()
        self.login("mestre2@example.com")
        self.assertEqual(self.client.patch(f"/api/campaigns/{campaign['id']}", json={"name": "Roubada"}).status_code, 403)
        self.assertEqual(self.client.delete(f"/api/campaigns/{campaign['id']}").status_code, 403)

    def test_library_crud_duplicate_filters_and_isolation(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        created = self.client.post("/api/library", json={
            "name": "Guardiao do Veu",
            "type": "monster",
            "campaign_id": campaign["id"],
            "system": "D&D 5e",
            "description": "Chefe das ruinas.",
            "attributes": "PV 86; CA 17",
            "abilities": "Explosao astral",
            "tags": "chefe, ruinas",
            "master_notes": "Protege a chave.",
        })
        self.assertEqual(created.status_code, 201)
        item = created.json
        filtered = self.client.get(f"/api/library?campaign_id={campaign['id']}&type=monster").json["items"]
        self.assertEqual(len(filtered), 1)
        self.assertEqual(filtered[0]["attributes"], "PV 86; CA 17")

        changed = self.client.patch(f"/api/library/{item['id']}", json={"abilities": "Explosao astral; Teleporte"})
        self.assertEqual(changed.status_code, 200)
        duplicate = self.client.post(f"/api/library/{item['id']}/duplicate")
        self.assertEqual(duplicate.status_code, 201)
        self.assertNotEqual(duplicate.json["id"], item["id"])

        self.logout()
        self.login("mestre2@example.com")
        self.assertEqual(self.client.get("/api/library").json["items"], [])
        self.assertEqual(self.client.patch(f"/api/library/{item['id']}", json={"name": "Invasao"}).status_code, 403)

        self.logout()
        self.login("mestre1@example.com")
        self.assertEqual(self.client.delete(f"/api/library/{item['id']}").status_code, 204)

    def test_player_sheet_review_comment_and_resubmission(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        self.logout()
        self.login("player@example.com")
        self.assertEqual(self.client.post("/api/campaigns/join", json={"code": campaign["invite_code"]}).status_code, 200)
        created = self.client.post("/api/sheets", json={
            "name": "Lyra Vex",
            "campaign_id": campaign["id"],
            "system": "D&D 5e",
            "data": {"className": "Maga", "level": 5, "hpMax": 30},
        })
        self.assertEqual(created.status_code, 201)
        sheet = created.json
        self.assertEqual(sheet["status"], "draft")
        self.assertEqual(self.client.post(f"/api/sheets/{sheet['id']}/submit").json["status"], "submitted")

        self.logout()
        self.login("mestre1@example.com")
        requested = self.client.post(f"/api/sheets/{sheet['id']}/review", json={
            "status": "needs_changes",
            "comment": "Revise os pontos de vida.",
        })
        self.assertEqual(requested.status_code, 200)
        self.assertEqual(requested.json["master_comment"], "Revise os pontos de vida.")
        approved = self.client.post(f"/api/sheets/{sheet['id']}/review", json={"status": "approved", "comment": "Pronta para jogar."})
        self.assertEqual(approved.json["status"], "approved")

        self.logout()
        self.login("player@example.com")
        visible = self.client.get("/api/sheets").json["sheets"][0]
        self.assertEqual(visible["master_comment"], "Pronta para jogar.")
        edited = self.client.patch(f"/api/sheets/{sheet['id']}", json={"data": {"className": "Maga", "level": 6}})
        self.assertEqual(edited.json["status"], "submitted")
        self.assertEqual(edited.json["revision"], 2)

    def test_sheet_and_image_permissions(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        self.logout()
        self.login("player@example.com")
        self.client.post("/api/campaigns/join", json={"code": campaign["invite_code"]})
        sheet = self.client.post("/api/sheets", json={"name": "Kael", "campaign_id": campaign["id"], "data": {}}).json
        bad_image = self.client.post(
            f"/api/sheets/{sheet['id']}/avatar",
            data={"image": (io.BytesIO(b"not-an-image"), "avatar.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(bad_image.status_code, 400)
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
        valid_image = self.client.post(
            f"/api/sheets/{sheet['id']}/avatar",
            data={"image": (io.BytesIO(png), "avatar.png")},
            content_type="multipart/form-data",
        )
        self.assertEqual(valid_image.status_code, 200)

        self.logout()
        self.login("mestre2@example.com")
        self.assertEqual(self.client.post(f"/api/sheets/{sheet['id']}/review", json={"status": "approved"}).status_code, 403)

    def test_token_card_api_filters_secret_fields_by_viewer(self):
        self.login("mestre1@example.com")
        campaign = self.create_campaign()
        with self.app.app_context():
            execute("INSERT INTO memberships (campaign_id,user_id) VALUES (?,?)", (campaign["id"], self.player_id))
            hero_id = execute(
                """INSERT INTO tokens
                   (campaign_id,owner_id,name,token_type,card_kind,visibility,hp,max_hp,resource,max_resource,
                    defense,attributes,notes,master_notes,class_name,race,image_url)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (campaign["id"], self.player_id, "Lyra", "player", "player", "public", 24, 30, 6, 10,
                 15, '{"for": 10}', "nota privada", "segredo do mestre", "Maga", "Elfa", "/uploads/lyra.png"),
            )
            ally_id = execute(
                """INSERT INTO tokens
                   (campaign_id,owner_id,name,token_type,card_kind,visibility,hp,max_hp,resource,max_resource,
                    defense,class_name,race,share_class_race,image_url)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (campaign["id"], self.master_id, "Rogar", "player", "player", "public", 32, 40, 4, 8,
                 17, "Guerreiro", "Humano", 1, "/uploads/rogar.png"),
            )
            monster_id = execute(
                """INSERT INTO tokens
                   (campaign_id,name,public_name,token_type,card_kind,visibility,hp,max_hp,resource,max_resource,
                    defense,attributes,notes,master_notes,class_name,image_url,show_life_state)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
                (campaign["id"], "Goblin Xama", "Xama Mascarado", "monster", "elite", "partial", 18, 30, 8, 10,
                 14, '{"des": 16}', "fraqueza ao fogo", "protege o portal", "Xama", "/uploads/goblin.png", 1),
            )
            secret_id = execute(
                """INSERT INTO tokens
                   (campaign_id,name,public_name,token_type,card_kind,visibility,hp,max_hp,defense,notes,image_url)
                   VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
                (campaign["id"], "Devorador Astral", "Criatura Velada", "monster", "boss", "secret", 200, 200,
                 22, "verdadeiro nome secreto", "/uploads/boss.png"),
            )

        master_view = self.client.get(f"/api/campaign/{campaign['id']}/table").json
        self.assertEqual(master_view["settings"]["display_mode"], "card")
        self.assertFalse(master_view["settings"]["show_ally_hp"])
        self.assertEqual(next(token for token in master_view["tokens"] if token["id"] == monster_id)["hp"], 18)
        self.assertIn("master_notes", next(token for token in master_view["tokens"] if token["id"] == monster_id))

        changed = self.client.patch(f"/api/campaign/{campaign['id']}/card-settings", json={
            "display_mode": "token",
            "show_narrative_health": True,
            "monster_name_mode": "real",
            "monster_image_mode": "silhouette",
            "show_ally_hp": True,
        })
        self.assertEqual(changed.status_code, 200)
        self.assertEqual(changed.json["display_mode"], "token")

        self.logout()
        self.login("player@example.com")
        player_view = self.client.get(f"/api/campaign/{campaign['id']}/table").json
        hero = next(token for token in player_view["tokens"] if token["id"] == hero_id)
        ally = next(token for token in player_view["tokens"] if token["id"] == ally_id)
        monster = next(token for token in player_view["tokens"] if token["id"] == monster_id)
        secret = next(token for token in player_view["tokens"] if token["id"] == secret_id)
        self.assertEqual(hero["viewer_scope"], "owner")
        self.assertEqual(hero["hp"], 24)
        self.assertNotIn("notes", hero)
        self.assertNotIn("master_notes", hero)
        self.assertEqual(ally["viewer_scope"], "player")
        self.assertEqual(ally["hp"], 32)
        self.assertEqual(ally["class_name"], "Guerreiro")
        for private_field in ("resource", "max_resource", "defense", "attributes", "notes", "master_notes"):
            self.assertNotIn(private_field, ally)
        self.assertEqual(monster["health_state"], "Ferido")
        self.assertEqual(monster["image_mode"], "silhouette")
        self.assertEqual(monster["image_url"], "")
        for private_field in ("hp", "max_hp", "resource", "defense", "attributes", "notes", "master_notes"):
            self.assertNotIn(private_field, monster)
        self.assertEqual(secret["name"], "Criatura Velada")
        self.assertEqual(secret["card_kind"], "monster")
        self.assertEqual(secret["image_url"], "")
        self.assertNotIn("hp", secret)
        self.assertEqual(self.client.get(f"/api/campaign/{campaign['id']}/token/{monster_id}/sheet").status_code, 403)


if __name__ == "__main__":
    unittest.main(verbosity=2)
