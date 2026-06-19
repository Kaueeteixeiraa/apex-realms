// Versioned storage adapter for the static build. The Flask build persists the
// same concepts in SQLite; Vercel/GitHub Pages intentionally use this local fallback.
(() => {
  const SCHEMA_VERSION = 3;
  const KEYS = Object.freeze({
    version: "apex-mvp-schema-version",
    campaigns: "apex-realms-campaigns",
    campaignsAlias: "apex_campaigns",
    library: "apex-realms-master-library",
    sheets: "apex_character_sheets",
    sheetsLegacy: "apex-realms-master-sheets",
    players: "apex_players",
    memberships: "apex-realms-player-campaigns",
    accounts: "apex-realms-static-accounts"
  });

  const read = (key, fallback = []) => {
    try {
      const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
      return value && typeof value === "object" ? value : fallback;
    } catch {
      return fallback;
    }
  };

  const write = (key, value) => {
    localStorage.setItem(key, JSON.stringify(value));
    return value;
  };

  const normalizeEmail = value => String(value || "").trim().toLowerCase();
  const currentUser = () => window.ApexStaticAuth?.getUser?.() || read("apex-realms-static-user", null);
  const ownerId = (user = currentUser()) => normalizeEmail(user?.email) || String(user?.id || "");
  const makeId = prefix => `${prefix}-${globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`}`;
  const visibility = campaign => campaign?.visibility === "public" || campaign?.private === false ? "public" : "private";

  const migrateCampaigns = () => {
    const user = currentUser();
    const owner = user?.role === "master" ? ownerId(user) : "";
    const campaigns = read(KEYS.campaigns, []).map(raw => {
      const access = visibility(raw);
      const inviteCode = access === "private" ? String(raw.inviteCode || raw.code || "") : "";
      return {
        ...raw,
        id: raw.id || makeId("cmp"),
        ownerId: raw.ownerId || owner,
        visibility: access,
        private: access === "private",
        inviteCode,
        code: inviteCode,
        players: Array.isArray(raw.players) ? raw.players : [],
        createdAt: raw.createdAt || new Date().toISOString(),
        updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
      };
    });
    write(KEYS.campaigns, campaigns);
    write(KEYS.campaignsAlias, campaigns);
  };

  const migrateOwnedCollections = () => {
    const user = currentUser();
    if (user?.role !== "master") return;
    const owner = ownerId(user);
    write(KEYS.library, read(KEYS.library, []).map(item => ({...item, id: item.id || makeId("lib"), ownerId: item.ownerId || owner})));
    const primary = read(KEYS.sheets, []);
    const sheets = primary.length ? primary : read(KEYS.sheetsLegacy, []);
    const migrated = sheets.map(sheet => {
      const ownerRole = sheet.ownerRole || (sheet.ownerEmail ? "player" : "master");
      return {
        ...sheet,
        id: sheet.id || makeId("sheet"),
        ownerId: sheet.ownerId || (ownerRole === "player" ? normalizeEmail(sheet.ownerEmail) : owner),
        ownerRole
      };
    });
    write(KEYS.sheets, migrated);
    write(KEYS.sheetsLegacy, migrated);
  };

  const migrate = () => {
    const version = Number(localStorage.getItem(KEYS.version) || 0);
    if (version >= SCHEMA_VERSION) return;
    migrateCampaigns();
    migrateOwnedCollections();
    localStorage.setItem(KEYS.version, String(SCHEMA_VERSION));
  };

  const removeCampaignData = campaignId => {
    const id = String(campaignId || "");
    write(KEYS.library, read(KEYS.library, []).filter(item => String(item.campaignId || "") !== id));
    const sheets = read(KEYS.sheets, []).filter(sheet => String(sheet.campaignId || "") !== id);
    write(KEYS.sheets, sheets);
    write(KEYS.sheetsLegacy, sheets);
    write(KEYS.players, read(KEYS.players, []).filter(player => String(player.campaignId || "") !== id));
    const memberships = read(KEYS.memberships, {});
    Object.keys(memberships).forEach(email => {
      memberships[email] = (Array.isArray(memberships[email]) ? memberships[email] : []).filter(entry => String(entry.campaignId || "") !== id);
    });
    write(KEYS.memberships, memberships);
    localStorage.removeItem(`apex-realms-vtt:${id}`);
  };

  const apiBase = String(window.APEX_API_BASE || "").replace(/\/$/, "");
  const request = async (path, options = {}) => {
    if (!apiBase) throw new Error("Backend nao configurado nesta publicacao.");
    const response = await fetch(`${apiBase}${path}`, {
      credentials: "include",
      headers: {"Content-Type": "application/json", ...(options.headers || {})},
      ...options
    });
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || "Falha ao comunicar com o backend.");
    return response.status === 204 ? null : response.json();
  };

  migrate();
  window.ApexMvpStore = Object.freeze({
    schemaVersion: SCHEMA_VERSION,
    mode: apiBase ? "backend" : "local",
    keys: KEYS,
    read,
    write,
    makeId,
    ownerId,
    currentUser,
    normalizeEmail,
    visibility,
    migrate,
    removeCampaignData,
    request
  });
})();
