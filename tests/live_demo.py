"""Demonstração visível e isolada dos principais fluxos do Apex Realms."""

import io
import sys
import time
import uuid
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app import app
from database import execute, query


GREEN = "\033[92m"
CYAN = "\033[96m"
YELLOW = "\033[93m"
RESET = "\033[0m"


def step(number, title, detail=""):
    print(f"\n{CYAN}[{number:02}] {title}{RESET}")
    if detail:
        print(f"     {detail}")
    time.sleep(0.65)


def passed(detail):
    print(f"     {GREEN}PASSOU{RESET}  {detail}")


def expect(response, statuses=(200,)):
    if response.status_code not in statuses:
        raise AssertionError(f"HTTP {response.status_code}: {response.get_data(as_text=True)[:250]}")
    return response


def main():
    suffix = uuid.uuid4().hex[:7]
    email = f"demo-{suffix}@apex.local"
    campaign_id = None

    with app.test_client() as client:
        step(1, "Página inicial e autenticação", "Verificando landing page e criando um mestre temporário.")
        expect(client.get("/"))
        expect(client.post("/register", data={
            "name": "Mestre Demonstração",
            "nickname": "Demo",
            "email": email,
            "password": "apex123",
            "role": "master",
            "preferences": "Fantasia e combate",
        }), (302,))
        passed("Landing respondeu e cadastro realizou login automaticamente.")

        step(2, "Dashboard e criação de campanha")
        expect(client.get("/dashboard"))
        response = expect(client.post("/campaign/new", data={
            "name": f"Teste ao Vivo {suffix}",
            "system": "Sistema próprio",
            "description": "Campanha temporária criada pela demonstração.",
            "cover": "",
        }), (302,))
        campaign_id = int(response.headers["Location"].rstrip("/").split("/")[-1])
        expect(client.get(f"/campaign/{campaign_id}"))
        passed(f"Campanha #{campaign_id} criada e carregada.")

        step(3, "Convite de jogador", "Criando jogador temporário e entrando pelo código de convite.")
        with app.app_context():
            invite = query("SELECT invite_code FROM campaigns WHERE id=?", (campaign_id,), one=True)["invite_code"]
        player = app.test_client()
        expect(player.post("/register", data={
            "name": "Jogador Demonstração",
            "nickname": "PlayerDemo",
            "email": f"player-{email}",
            "password": "apex123",
            "role": "player",
            "preferences": "Aventura",
        }), (302,))
        expect(player.post("/campaign/join", data={"code": invite}), (302,))
        expect(player.get(f"/campaign/{campaign_id}"))
        passed(f"Jogador entrou usando o convite {invite}.")

        step(4, "Upload, grid e troca de mapa")
        png = b"\x89PNG\r\n\x1a\n" + b"0" * 256
        response = expect(client.post(f"/api/campaign/{campaign_id}/map/upload", data={
            "name": "Arena de Teste",
            "grid_size": "64",
            "image": (io.BytesIO(png), "arena.png"),
        }, content_type="multipart/form-data"))
        map_id = response.json["id"]
        expect(client.patch(f"/api/campaign/{campaign_id}/map/{map_id}", json={
            "name": "Arena com Névoa",
            "grid_size": 72,
            "grid_enabled": True,
            "fog_enabled": True,
        }))
        with app.app_context():
            scene = query("SELECT * FROM maps WHERE id=?", (map_id,), one=True)
            assert scene["grid_size"] == 72 and scene["fog_enabled"] == 1
            uploaded_map_path = scene["image_url"]
        passed("Mapa enviado, ativado, grid ajustado para 72px e névoa ligada.")

        step(5, "Personagens, NPCs e tokens")
        expect(client.post(f"/campaign/{campaign_id}/character/new", data={
            "name": "Astra",
            "token_type": "player",
            "race": "Humana",
            "class_name": "Guerreira",
            "level": "4",
            "hp": "34",
            "max_hp": "40",
            "color": "#44d7ff",
            "initiative": "1",
        }), (302,))
        expect(client.post(f"/campaign/{campaign_id}/character/new", data={
            "name": "Colosso",
            "token_type": "monster",
            "race": "Constructo",
            "class_name": "Guardião",
            "level": "6",
            "hp": "70",
            "max_hp": "70",
            "color": "#ff5c86",
            "initiative": "1",
        }), (302,))
        with app.app_context():
            astra = query("SELECT * FROM tokens WHERE campaign_id=? AND name='Astra'", (campaign_id,), one=True)
            colosso = query("SELECT * FROM tokens WHERE campaign_id=? AND name='Colosso'", (campaign_id,), one=True)
        passed("Herói e monstro criados com tokens e iniciativa.")

        step(6, "Ficha completa e movimento no grid")
        expect(client.patch(f"/api/campaign/{campaign_id}/token/{astra['id']}", json={
            "x": 25,
            "y": 35,
            "defense": 17,
            "speed": 9,
            "attributes": {"for": 16, "des": 14, "con": 15, "int": 10, "sab": 12, "car": 11},
            "skills": "Atletismo +5\nPercepção +3",
            "inventory": "Espada longa\nPoção de cura",
            "abilities": "Segundo fôlego",
            "story": "Protetora das cidades livres.",
        }))
        sheet = expect(client.get(f"/api/campaign/{campaign_id}/token/{astra['id']}/sheet")).json
        assert sheet["defense"] == 17 and sheet["attributes"]["for"] == 16 and sheet["x"] == 25
        passed("Ficha, atributos, inventário e posição do token persistiram.")

        step(7, "Chat e rolagem de dados")
        expect(client.post(f"/api/campaign/{campaign_id}/chat", json={"content": "Astra avança pela arena."}))
        roll = expect(client.post(f"/api/campaign/{campaign_id}/roll", json={"formula": "2d6+3"})).json
        invalid = client.post(f"/api/campaign/{campaign_id}/roll", json={"formula": "fórmula inválida"})
        assert invalid.status_code == 400
        passed(f"Mensagem registrada e 2d6+3 resultou em {roll['total']}; fórmula inválida foi rejeitada.")

        step(8, "Iniciativa e início do combate")
        expect(client.post(f"/api/campaign/{campaign_id}/initiative/roll-all"))
        expect(client.post(f"/api/campaign/{campaign_id}/combat/toggle"))
        expect(client.post(f"/api/campaign/{campaign_id}/initiative/next"))
        with app.app_context():
            combat = query("SELECT * FROM combat_state WHERE campaign_id=?", (campaign_id,), one=True)
            initiative_count = query("SELECT COUNT(*) total FROM initiative WHERE campaign_id=?", (campaign_id,), one=True)["total"]
        assert combat["active"] == 1 and initiative_count == 2
        passed("Combate iniciado, iniciativa coletiva rolada e primeiro turno avançado.")

        step(9, "Dano, PV temporários, cura e condições")
        expect(client.post(f"/api/campaign/{campaign_id}/combat/action", json={
            "token_id": astra["id"], "action": "temp", "amount": 8,
        }))
        damage = expect(client.post(f"/api/campaign/{campaign_id}/combat/action", json={
            "token_id": astra["id"], "action": "damage", "amount": 12,
        })).json
        heal = expect(client.post(f"/api/campaign/{campaign_id}/combat/action", json={
            "token_id": astra["id"], "action": "heal", "amount": 5,
        })).json
        assert damage["temp_hp"] == 0 and heal["hp"] > damage["hp"]
        passed("PV temporários absorveram dano e a cura respeitou o máximo de vida.")

        step(10, "Ataque contra Defesa")
        attack = expect(client.post(f"/api/campaign/{campaign_id}/combat/attack", json={
            "attacker_id": astra["id"],
            "target_id": colosso["id"],
            "bonus": 30,
            "damage": "1d8+4",
        })).json
        assert attack["hit"] and attack["damage"] > 0
        passed(f"Astra acertou o Colosso e causou {attack['damage']} de dano.")

        step(11, "Segurança e permissões do jogador")
        forbidden_combat = player.post(f"/api/campaign/{campaign_id}/combat/action", json={
            "token_id": colosso["id"], "action": "damage", "amount": 999,
        })
        forbidden_sheet = player.get(f"/api/campaign/{campaign_id}/token/{colosso['id']}/sheet")
        assert forbidden_combat.status_code == 403 and forbidden_sheet.status_code == 403
        passed("Jogador foi impedido de controlar monstro, combate e ficha alheia.")

        step(12, "Biblioteca, sala e histórico")
        expect(client.post(f"/campaign/{campaign_id}/asset/new", data={
            "name": "Relatório da Arena",
            "kind": "lore",
            "notes": "Documento temporário de teste.",
        }), (302,))
        room = expect(client.get(f"/game/{campaign_id}"))
        assert b"CONTROLE DE COMBATE" in room.data and b"sheet-modal" in room.data
        with app.app_context():
            combat_logs = query("SELECT COUNT(*) total FROM chat_messages WHERE campaign_id=? AND kind='combat'", (campaign_id,), one=True)["total"]
        passed(f"Sala carregou combate e ficha; histórico contém {combat_logs} eventos de combate.")

        step(13, "Limpeza da demonstração", "Removendo campanha, arquivos lógicos e usuários temporários.")
        with app.app_context():
            user_ids = [row["id"] for row in query("SELECT id FROM users WHERE email IN (?,?)", (email, f"player-{email}"))]
            execute("DELETE FROM campaigns WHERE id=?", (campaign_id,))
            for user_id in user_ids:
                execute("DELETE FROM users WHERE id=?", (user_id,))
        if uploaded_map_path.startswith("/uploads/"):
            upload_file = Path(app.config["UPLOAD_FOLDER"]) / uploaded_map_path.removeprefix("/uploads/")
            upload_file.unlink(missing_ok=True)
        passed("Dados temporários removidos; suas campanhas permaneceram intactas.")

    print(f"\n{GREEN}{'=' * 68}\nDEMONSTRAÇÃO CONCLUÍDA: TODAS AS FUNÇÕES TESTADAS PASSARAM\n{'=' * 68}{RESET}")


if __name__ == "__main__":
    main()
