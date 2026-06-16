# Apex Realms

Plataforma de mesa virtual de RPG online da Apex Technologies. O projeto reune landing page, login, cadastro, dashboard, campanhas, fichas, biblioteca, painel do mestre e uma mesa preparada para evoluir para uso real com jogadores e mestres.

## Estado atual

- A versao estatica fica na pasta `docs/` e roda em GitHub Pages ou Vercel.
- A versao Flask fica em `app.py`, `templates/`, `static/` e `models/schema.sql`.
- O ambiente publicado estatico usa `localStorage` para simular contas, sessoes, campanhas e fichas.
- O backend Flask cria apenas a conta administrativa inicial e nao semeia campanhas, mestre, jogador ou aventura fake.
- Para uso real multiusuario, o backend precisa de banco persistente, armazenamento de uploads e variaveis seguras.

## Recursos implementados

- Cadastro e login no backend Flask, com senha em hash.
- Perfis de jogador, mestre e administrador.
- Painel administrativo para acompanhar usuarios e campanhas.
- Dashboard limpo, sem dados demonstrativos.
- Criacao de campanha, entrada por codigo e exclusao de campanha.
- Pagina de fichas separada da mesa.
- Biblioteca, painel do mestre, configuracoes e salas em estado inicial limpo.
- Sala de jogo zerada ate existir uma campanha real.
- Seed do banco com reset de lancamento unico para remover dados antigos de demonstracao.

## Publicacao estatica

O GitHub Pages publica os arquivos da pasta `docs/`.

O Vercel tambem esta preparado para servir `docs/` diretamente. O arquivo `vercel.json` define:

```json
{
  "outputDirectory": "docs",
  "cleanUrls": true
}
```

Depois de importar este repositorio no Vercel, ele deve publicar a versao estatica do Apex Realms sem precisar de build.

Links atuais no GitHub Pages:

- Site: `https://kaueeteixeiraa.github.io/apex-realms/`
- Login: `https://kaueeteixeiraa.github.io/apex-realms/login.html`
- Cadastro: `https://kaueeteixeiraa.github.io/apex-realms/cadastro.html`
- Dashboard: `https://kaueeteixeiraa.github.io/apex-realms/dashboard.html`

## Backend Flask

Requer Python 3.10 ou superior.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:5000`.

O repositorio inclui:

- `wsgi.py` como ponto de entrada WSGI.
- `Procfile` com `gunicorn wsgi:app`.
- `render.yaml` com blueprint basico para Render.
- suporte a `PORT`, `HOST`, `DATABASE_PATH`, `UPLOAD_FOLDER`, `SECRET_KEY` e `ADMIN_REGISTRATION_CODE`.

## Conta inicial

O seed do backend cria apenas a conta administrativa inicial. As telas publicas nao exibem contas de teste.

| Perfil | E-mail | Senha inicial |
| --- | --- | --- |
| Administrador | `admin@apexrealms.com` | `apex123` |

Antes de colocar o backend em producao, troque a senha inicial, defina `SECRET_KEY` e use banco persistente.

## Estrutura

```text
apex-realms/
├── app.py                  # Aplicacao Flask, rotas e APIs do MVP
├── config.py               # Configuracao e limites de upload
├── database.py             # Acesso centralizado ao SQLite
├── docs/                   # Site estatico para Pages/Vercel
├── models/schema.sql       # Schema relacional
├── services/security.py    # Login e permissoes
├── static/                 # CSS/JS/imagens do backend Flask
├── templates/              # Paginas Jinja do backend Flask
├── uploads/                # Arquivos enviados localmente
├── vercel.json             # Configuracao estatica do Vercel
└── wsgi.py                 # Entrada WSGI
```

## Producao real

Para jogadores e mestres usando dados compartilhados em producao:

- migrar SQLite para PostgreSQL;
- usar armazenamento externo para uploads;
- configurar `SECRET_KEY` forte;
- proteger formularios com CSRF;
- mover autenticacao e permissoes para sessao persistente;
- substituir partes simuladas do Pages por chamadas ao backend;
- adicionar logs, backups e monitoramento.

## Testes

Execute a suite completa quando o ambiente Python estiver instalado:

```powershell
.\.venv\Scripts\python.exe -m unittest discover -s tests -v
```
