import io
import tempfile
import unittest
from pathlib import Path

from app import create_app, init_database
from database import query


class ApexRealmsTestCase(unittest.TestCase):
    def setUp(self):
        self.root = Path(tempfile.mkdtemp())
        self.app = create_app()
        self.app.config.update(TESTING=True, DATABASE=self.root / "test.db", UPLOAD_FOLDER=self.root / "uploads")
        Path(self.app.config["UPLOAD_FOLDER"]).mkdir()
        init_database(self.app)
        self.client = self.app.test_client()

    def login(self, email="mestre@apexrealms.com"):
        return self.client.post("/login", data={"email": email, "password": "apex123"})

    def test_public_pages_and_auth(self):
        self.assertEqual(self.client.get("/").status_code, 200)
        self.assertEqual(self.login().status_code, 302)
        self.assertEqual(self.client.get("/dashboard").status_code, 200)
        self.assertEqual(self.client.get("/game/1").status_code, 200)

    def test_map_upload_grid_update_and_delete(self):
        self.login()
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 100
        response = self.client.post("/api/campaign/1/map/upload", data={
            "name": "Arena", "grid_size": "64", "image": (io.BytesIO(png), "arena.png")
        }, content_type="multipart/form-data")
        self.assertEqual(response.status_code, 200)
        map_id = response.json["id"]
        self.assertEqual(self.client.patch(f"/api/campaign/1/map/{map_id}", json={
            "grid_size": 72, "grid_enabled": False, "fog_enabled": True
        }).status_code, 200)
        with self.app.app_context():
            scene = query("SELECT * FROM maps WHERE id=?", (map_id,), one=True)
            self.assertEqual(scene["grid_size"], 72)
            self.assertEqual(scene["grid_enabled"], 0)
            self.assertEqual(scene["fog_enabled"], 1)
        self.assertEqual(self.client.delete(f"/api/campaign/1/map/{map_id}").status_code, 200)

    def test_sheet_update_and_permissions(self):
        self.login()
        payload = {"defense": 18, "speed": 12, "temp_hp": 5, "attributes": {"for": 16}, "inventory": "Espada"}
        self.assertEqual(self.client.patch("/api/campaign/1/token/1", json=payload).status_code, 200)
        sheet = self.client.get("/api/campaign/1/token/1/sheet").json
        self.assertEqual(sheet["defense"], 18)
        self.assertEqual(sheet["attributes"]["for"], 16)
        self.client.get("/logout")
        self.login("jogador@apexrealms.com")
        self.assertEqual(self.client.delete("/api/campaign/1/token/2").status_code, 403)

    def test_combat_damage_temp_hp_heal_and_chat(self):
        self.login()
        self.client.patch("/api/campaign/1/token/1", json={"hp": 30, "max_hp": 40, "temp_hp": 5})
        self.assertEqual(self.client.post("/api/campaign/1/combat/toggle").json["active"], 1)
        damage = self.client.post("/api/campaign/1/combat/action", json={"token_id": 1, "action": "damage", "amount": 8}).json
        self.assertEqual((damage["hp"], damage["temp_hp"]), (27, 0))
        heal = self.client.post("/api/campaign/1/combat/action", json={"token_id": 1, "action": "heal", "amount": 50}).json
        self.assertEqual(heal["hp"], 40)
        with self.app.app_context():
            self.assertTrue(query("SELECT id FROM chat_messages WHERE campaign_id=1 AND kind='combat'", one=True))

    def test_initiative_rounds_roll_and_chat(self):
        self.login()
        self.client.post("/api/campaign/1/combat/toggle")
        for _ in range(3):
            self.assertEqual(self.client.post("/api/campaign/1/initiative/next").status_code, 200)
        with self.app.app_context():
            self.assertGreaterEqual(query("SELECT round FROM combat_state WHERE campaign_id=1", one=True)["round"], 2)
        self.assertEqual(self.client.post("/api/campaign/1/roll", json={"formula": "2d6+3"}).status_code, 200)
        self.assertEqual(self.client.post("/api/campaign/1/roll", json={"formula": "banana"}).status_code, 400)
        self.assertEqual(self.client.post("/api/campaign/1/chat", json={"content": "Olá"}).status_code, 200)

    def test_attack_and_roll_all_initiative(self):
        self.login()
        self.client.patch("/api/campaign/1/token/2", json={"defense": 1, "hp": 50, "max_hp": 60})
        attack = self.client.post("/api/campaign/1/combat/attack", json={
            "attacker_id": 1, "target_id": 2, "bonus": 20, "damage": "1d6+2"
        })
        self.assertEqual(attack.status_code, 200)
        self.assertTrue(attack.json["hit"])
        self.assertGreater(attack.json["damage"], 0)
        rolled = self.client.post("/api/campaign/1/initiative/roll-all")
        self.assertEqual(rolled.status_code, 200)
        self.assertEqual(rolled.json["count"], 3)

    def test_security_rejects_player_combat_and_foreign_sheet(self):
        self.login("jogador@apexrealms.com")
        self.assertEqual(self.client.post("/api/campaign/1/combat/toggle").status_code, 403)
        self.assertEqual(self.client.post("/api/campaign/1/combat/action", json={
            "token_id": 2, "action": "damage", "amount": 999
        }).status_code, 403)
        self.assertEqual(self.client.get("/api/campaign/1/token/2/sheet").status_code, 403)
        self.assertEqual(self.client.get("/api/campaign/1/token/1/sheet").status_code, 200)

    def test_upload_validation_and_grid_limits(self):
        self.login()
        bad = self.client.post("/api/campaign/1/map/upload", data={
            "name": "Arquivo ruim", "image": (io.BytesIO(b"not-an-image"), "mapa.exe")
        }, content_type="multipart/form-data")
        self.assertEqual(bad.status_code, 400)
        response = self.client.patch("/api/campaign/1/map/1", json={"grid_size": 999, "grid_enabled": True})
        self.assertEqual(response.status_code, 200)
        with self.app.app_context():
            self.assertEqual(query("SELECT grid_size FROM maps WHERE id=1", one=True)["grid_size"], 200)


if __name__ == "__main__":
    unittest.main(verbosity=2)
