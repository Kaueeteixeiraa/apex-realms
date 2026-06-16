CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    nickname TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'player' CHECK (role IN ('player', 'master', 'admin')),
    bio TEXT DEFAULT '',
    preferences TEXT DEFAULT '',
    avatar TEXT DEFAULT '',
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS campaigns (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id INTEGER NOT NULL REFERENCES users(id),
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    system TEXT NOT NULL,
    cover TEXT DEFAULT '',
    scene TEXT DEFAULT 'Cena inicial',
    invite_code TEXT UNIQUE NOT NULL,
    gm_notes TEXT DEFAULT '',
    public_notes TEXT DEFAULT '',
    last_summary TEXT DEFAULT '',
    last_session TEXT DEFAULT CURRENT_TIMESTAMP,
    quick_session INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS memberships (
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    character_name TEXT DEFAULT '',
    PRIMARY KEY (campaign_id, user_id)
);

CREATE TABLE IF NOT EXISTS assets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    kind TEXT NOT NULL,
    file_url TEXT DEFAULT '',
    favorite INTEGER DEFAULT 0,
    notes TEXT DEFAULT ''
);

CREATE TABLE IF NOT EXISTS tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    owner_id INTEGER REFERENCES users(id),
    name TEXT NOT NULL,
    token_type TEXT DEFAULT 'player',
    class_name TEXT DEFAULT '',
    race TEXT DEFAULT '',
    level INTEGER DEFAULT 1,
    image_url TEXT DEFAULT '',
    notes TEXT DEFAULT '',
    hp INTEGER DEFAULT 10,
    max_hp INTEGER DEFAULT 10,
    temp_hp INTEGER DEFAULT 0,
    defense INTEGER DEFAULT 10,
    speed INTEGER DEFAULT 9,
    attributes TEXT DEFAULT '{}',
    skills TEXT DEFAULT '',
    inventory TEXT DEFAULT '',
    abilities TEXT DEFAULT '',
    spells TEXT DEFAULT '',
    story TEXT DEFAULT '',
    custom_fields TEXT DEFAULT '',
    x REAL DEFAULT 50,
    y REAL DEFAULT 50,
    color TEXT DEFAULT '#6f5cff',
    conditions TEXT DEFAULT '',
    size INTEGER DEFAULT 1,
    hidden INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS maps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    image_url TEXT NOT NULL,
    grid_size INTEGER DEFAULT 50,
    grid_enabled INTEGER DEFAULT 1,
    active INTEGER DEFAULT 0,
    fog_enabled INTEGER DEFAULT 0,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS chat_messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    user_id INTEGER REFERENCES users(id),
    author TEXT NOT NULL,
    kind TEXT DEFAULT 'message',
    content TEXT NOT NULL,
    created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS initiative (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id INTEGER NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    token_id INTEGER REFERENCES tokens(id) ON DELETE CASCADE,
    score INTEGER DEFAULT 0,
    active INTEGER DEFAULT 0
);

CREATE TABLE IF NOT EXISTS combat_state (
    campaign_id INTEGER PRIMARY KEY REFERENCES campaigns(id) ON DELETE CASCADE,
    active INTEGER DEFAULT 0,
    round INTEGER DEFAULT 1,
    started_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS app_meta (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
