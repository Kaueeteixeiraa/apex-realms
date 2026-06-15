# Apex Realms

Plataforma de mesa virtual de RPG online da Apex Technologies. Este MVP reúne autenticação, campanhas, convites, biblioteca e uma sala interativa com mapas, tokens, chat, dados e iniciativa.

## Recursos implementados

- Cadastro, login, senha com hash e perfis de jogador, mestre e administrador
- Painel administrativo para acompanhar usuários, campanhas e alterar papéis
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

## Publicação

O GitHub Pages publica apenas os arquivos estáticos da pasta `docs/`. Para cadastro, login, dashboard real e painel admin, publique o backend Flask em um host Python.

No Pages, a demonstração estática tem entradas visíveis para testar os perfis:

- Login demo: `https://kaueeteixeiraa.github.io/apex-realms/login.html`
- Cadastro demo: `https://kaueeteixeiraa.github.io/apex-realms/cadastro.html`
- Dashboard: `https://kaueeteixeiraa.github.io/apex-realms/dashboard.html`

Este repositório já inclui:

- `wsgi.py` como ponto de entrada WSGI
- `Procfile` com `gunicorn wsgi:app`
- `render.yaml` com blueprint básico para Render
- suporte a `PORT`, `HOST`, `DATABASE_PATH`, `UPLOAD_FOLDER`, `SECRET_KEY` e `ADMIN_REGISTRATION_CODE`

Em produção, use variáveis de ambiente seguras e armazenamento persistente para banco e uploads.

## Contas de demonstração

| Perfil | E-mail | Senha |
| --- | --- | --- |
| Mestre | `mestre@apexrealms.com` | `apex123` |
| Jogador | `jogador@apexrealms.com` | `apex123` |
| Administrador | `admin@apexrealms.com` | `apex123` |

Código de convite da campanha demo: `APEX2026`.

Para criar administradores pelo formulário de cadastro local, use o código interno padrão `APEX-ADMIN-2026`.
Em produção, defina outro valor com a variável de ambiente `ADMIN_REGISTRATION_CODE`.

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

As senhas usam hash do Werkzeug, campanhas e tokens validam permissões no servidor, administradores usam código interno de cadastro, e o limite global de upload é de 8 MB. Para produção, defina `SECRET_KEY`, altere `ADMIN_REGISTRATION_CODE`, use PostgreSQL, implemente CSRF, armazenamento externo de arquivos e substitua o chat HTTP por WebSocket.

O código concentra as rotas em `app.py` para manter este MVP fácil de executar. A camada de banco e permissões já está separada, facilitando mover cada domínio para Blueprints em `routes/` conforme o produto crescer.

## Testes

Execute a suíte completa:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```

Ela valida autenticação, papéis de jogador/mestre/admin, painel administrativo, permissões, upload e grid, fichas, chat, dados, iniciativa, rodadas, dano, cura, PV temporários e ataques contra Defesa.
