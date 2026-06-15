# Apex Realms

Plataforma de mesa virtual de RPG online da Apex Technologies. Este MVP reúne autenticação, campanhas, convites, biblioteca e uma sala interativa com mapas, tokens, chat, dados e iniciativa.

## Recursos implementados

- Cadastro, login, senha com hash e perfis de mestre/jogador
- Dashboard com campanhas mestradas e jogadas
- Criação de campanha e entrada por código de convite
- Página da campanha com resumo, jogadores e biblioteca
- Upload e ativação de mapas com grid configurável
- Criação de personagens, NPCs e monstros com imagem, raça, classe, nível e vida
- Sala de jogo com mapa ativo, grid, névoa de guerra, zoom, medição, marcações e tokens arrastáveis
- Controle de token baseado em permissões
- Chat persistente e rolagens com fórmulas como `2d6+3`
- Iniciativa e avanço de turnos pelo mestre
- Biblioteca com upload de handouts, itens e documentos
- SQLite com schema relacional pronto para posterior migração
- Interface escura, responsiva e inspirada na Apex Technologies

## Instalação

Requer Python 3.10 ou superior.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:5000`.

O banco e os dados de demonstração são criados automaticamente na primeira execução.

## Contas de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Mestre | `mestre@apexrealms.com` | `apex123` |
| Jogador | `jogador@apexrealms.com` | `apex123` |

Código de convite da campanha demo: `APEX2026`.

## Estrutura

```text
apex-realms/
├── app.py                  # Aplicação, rotas e APIs do MVP
├── config.py               # Configuração e limites de upload
├── database.py             # Acesso centralizado ao SQLite
├── models/schema.sql       # Schema relacional
├── services/security.py    # Login e permissões
├── templates/              # Páginas Jinja
├── static/css/             # Design system e layouts
├── static/js/              # Interações globais e sala de jogo
├── uploads/                # Arquivos enviados
└── database/               # Banco local
```

## Segurança e evolução

As senhas usam hash do Werkzeug, campanhas e tokens validam permissões no servidor, e o limite global de upload é de 8 MB. Para produção, defina `SECRET_KEY`, use PostgreSQL, implemente CSRF, armazenamento externo de arquivos e substitua o chat HTTP por WebSocket.

O código concentra as rotas em `app.py` para manter este MVP fácil de executar. A camada de banco e permissões já está separada, facilitando mover cada domínio para Blueprints em `routes/` conforme o produto crescer.

## Testes

Execute a suíte completa:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Ela valida autenticação, permissões, upload e grid, fichas, chat, dados, iniciativa, rodadas, dano, cura, PV temporários e ataques contra Defesa.
