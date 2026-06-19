# Apex Realms

Plataforma de RPG online da Apex Technologies. O repositorio possui uma interface estatica publicada no Vercel e um backend Flask/SQLite para os fluxos persistentes do MVP.

## Modos de execucao

### Site estatico (`docs/`)

O Vercel e o GitHub Pages publicam a pasta `docs/`. Neste modo os dados ficam somente no navegador, por meio do adaptador versionado `docs/assets/js/mvp-storage.js`.

- Nao existe sincronizacao entre navegadores ou dispositivos.
- Limpar os dados do navegador remove campanhas, biblioteca e fichas locais.
- O adaptador migra os registros legados e separa dados por proprietario.
- Este modo e um fallback demonstrativo, nao um banco multiusuario.

Site publicado: https://apex-realms.vercel.app

### Backend Flask (`app.py`)

O backend persiste usuarios, campanhas, membros, biblioteca e fichas no SQLite. Ele aplica permissoes por papel e por proprietario, gera convites privados e valida arquivos de imagem.

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
python app.py
```

Abra `http://127.0.0.1:5000`.

## Variaveis de ambiente

Em producao, `SECRET_KEY` e `ADMIN_INITIAL_PASSWORD` sao obrigatorias e nao podem usar os valores de desenvolvimento.

```powershell
$env:APP_ENV = "production"
$env:SECRET_KEY = "uma-chave-longa-e-aleatoria"
$env:ADMIN_INITIAL_PASSWORD = "uma-senha-inicial-forte"
$env:ADMIN_REGISTRATION_CODE = "codigo-interno"
$env:SESSION_COOKIE_SECURE = "1"
$env:DATABASE_PATH = "C:\dados\apex_realms.db"
$env:UPLOAD_FOLDER = "C:\dados\uploads"
```

Tambem sao aceitas `PORT` e `HOST`. O upload HTTP e limitado a 8 MB; avatares e imagens funcionais aceitam PNG, JPG e WEBP e tem o conteudo real validado.

## Fluxos funcionais

### Campanhas

- Mestre cria, edita e exclui apenas as proprias campanhas.
- Cada campanha possui ID unico.
- Campanha privada recebe um convite `AR-XXXX-XXXX` que nao muda durante edicoes.
- Campanha publica nao exibe codigo.
- Jogador usa o convite privado e vira membro da campanha.
- A exclusao remove recursos vinculados e desvincula fichas de forma segura.

### Biblioteca

- CRUD completo e duplicacao de monstros, NPCs, itens, magias, locais, notas e sistemas customizados.
- Filtros por campanha e tipo.
- Campos para descricao, atributos, habilidades, tags, observacoes privadas e imagem.
- Itens globais e itens separados por campanha e por mestre.

### Fichas

- Jogador cria e edita fichas, envia avatar e vincula a uma campanha da qual participa.
- Ciclo: `draft`, `submitted`, `approved` e `needs_changes`.
- Mestre responsavel pode aprovar ou pedir ajustes com comentario.
- O comentario fica visivel para o jogador.
- Alterar uma ficha aprovada cria nova revisao e exige aprovacao novamente.

## APIs do MVP

- `/api/campaigns` e `/api/campaigns/<id>`
- `/api/campaigns/join`
- `/api/library` e `/api/library/<id>`
- `/api/library/<id>/duplicate` e `/api/library/<id>/image`
- `/api/sheets` e `/api/sheets/<id>`
- `/api/sheets/<id>/submit`, `/review` e `/avatar`

As APIs exigem sessao valida, verificam o papel do usuario e impedem que um mestre altere dados de outro mestre. Escritas vindas de outra origem sao rejeitadas e os cookies usam `HttpOnly` e `SameSite=Lax`.

## Banco e migracao

Na inicializacao, o Flask executa `models/schema.sql` e adapta bancos antigos com as novas colunas de campanha. As tabelas principais adicionadas sao `library_items` e `character_sheets`.

Para producao com varios usuarios, migre o SQLite para PostgreSQL e os uploads para armazenamento persistente externo. O Vercel atual serve apenas o modo estatico.

## Testes

```powershell
python -m unittest discover -s tests -v
```

A suite cobre:

- campanha privada/publica, edicao, exclusao e entrada por convite;
- isolamento entre mestres;
- CRUD, filtros e duplicacao da biblioteca;
- envio, comentario, ajuste, aprovacao e nova revisao de ficha;
- rejeicao de upload falso e revisao por mestre incorreto.

## Estrutura principal

```text
app.py                     Aplicacao Flask e APIs
config.py                  Configuracao e seguranca
database.py                Acesso centralizado ao SQLite
docs/                      Site estatico para Vercel/Pages
models/schema.sql          Schema relacional
services/mvp.py            Validacao e serializacao do MVP
services/security.py       Login e permissoes
templates/                 Paginas Jinja do backend
tests/test_app.py          Testes dos fluxos principais
vercel.json                Publicacao estatica
```
