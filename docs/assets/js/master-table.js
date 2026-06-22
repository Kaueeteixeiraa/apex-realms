// Integrated virtual tabletop for the static Apex Realms build.
(() => {
  if (!document.body.matches("[data-master-page='table']")) return;

  const KEYS = {
    campaigns: "apex-realms-campaigns",
    campaignsAlias: "apex_campaigns",
    players: "apex_players",
    sheets: "apex-realms-master-sheets",
    sheetsAlias: "apex_character_sheets",
    library: "apex-realms-master-library",
    profile: "apex_master_profile",
    notes: "apex-realms-master-notes",
    activeCampaign: "apex-realms-table-campaign",
    pendingResource: "apex-realms-pending-table-resource"
  };
  const WORLD = {width: 1600, height: 1000, grid: 50};
  const body = document.body;
  const isPlayerMode = body.matches("[data-player-page='table']");
  const $ = selector => document.querySelector(selector);
  const $$ = selector => [...document.querySelectorAll(selector)];
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const escapeText = value => String(value ?? "");

  const elements = {
    campaignSelect: $("[data-campaign-select]"),
    mapArea: $("[data-map-area]"),
    mapStage: $("[data-map-stage]"),
    mapWorld: $("[data-map-world]"),
    mapImage: $("[data-map-image]"),
    objectLayer: $("[data-object-layer]"),
    markerLayer: $("[data-marker-layer]"),
    fogLayer: $("[data-fog-layer]"),
    tokenLayer: $("[data-token-layer]"),
    effectLayer: $("[data-effect-layer]"),
    measureLayer: $("[data-measure-layer]"),
    rosterList: $("[data-roster-list]"),
    initiativeList: $("[data-initiative-list]"),
    chatList: $("[data-chat-list]"),
    rollList: $("[data-roll-list]"),
    eventList: $("[data-event-list]"),
    resourceDialog: $("[data-resource-dialog]"),
    resourceGrid: $("[data-resource-grid]"),
    tokenDialog: $("[data-token-dialog]"),
    tokenForm: $("[data-token-form]"),
    settingsDialog: $("[data-card-settings-dialog]"),
    settingsForm: $("[data-card-settings-form]"),
    healthDialog: $("[data-quick-health-dialog]"),
    healthForm: $("[data-quick-health-form]"),
    createDialog: $("[data-quick-create-dialog]"),
    createForm: $("[data-quick-create-form]"),
    combatHistory: $("[data-combat-history]"),
    rollAnimation: $("[data-roll-animation]"),
    emptyCampaign: $("[data-empty-campaign]")
  };

  function readStore(key, fallback) {
    try {
      const value = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      if (Array.isArray(fallback)) return Array.isArray(value) ? value : fallback;
      return value && typeof value === "object" ? value : fallback;
    } catch {
      return fallback;
    }
  }

  function writeStore(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      setMapStatus("Armazenamento cheio", false);
      return false;
    }
  }

  function readCampaigns() {
    const owner = window.ApexMvpStore?.ownerId?.() || "";
    const primary = readStore(KEYS.campaigns, []);
    const values = primary.length ? primary : readStore(KEYS.campaignsAlias, []);
    const account = window.ApexStaticAuth?.getUser?.();
    const joined = isPlayerMode && window.ApexInvites?.readJoinedCampaigns ? window.ApexInvites.readJoinedCampaigns(account) : [];
    const scopedValues = isPlayerMode
      ? (joined.length ? joined : values.filter(campaign => {
          const players = Array.isArray(campaign.players) ? campaign.players : [];
          return players.some(player => normalizeEmail(player.email) === normalizeEmail(account?.email));
        }))
      : values.filter(item => !owner || item.ownerId === owner);
    return scopedValues.filter(campaign => !campaign.archived).map(campaign => ({
      ...campaign,
      id: campaign.id || uid("campaign"),
      name: campaign.name || "Campanha sem nome",
      system: campaign.system || "D&D 5e",
      banner: campaign.banner || campaign.image || ""
    }));
  }

  function readSheets() {
    const primary = readStore(KEYS.sheets, []);
    return primary.length ? primary : readStore(KEYS.sheetsAlias, []);
  }

  function saveSheets(sheets) {
    writeStore(KEYS.sheets, sheets);
    writeStore(KEYS.sheetsAlias, sheets);
  }

  function defaultState(campaign) {
    return {
      version: 4,
      live: false,
      scene: {id: "ruins", name: "Ruinas arcanas", image: "../assets/ruins-map.jpg"},
      scenes: [],
      view: {panX: 0, panY: 0, zoom: 1},
      tool: "select",
      grid: true,
      snap: false,
      fog: false,
      fogReveals: [],
      markers: [],
      layers: {terrain: true, objects: true, npcs: true, markers: true, tokens: true, effects: true},
      combat: {active: false, startedAt: "", history: []},
      cardSettings: {
        displayMode: "card",
        showNarrativeHealth: true,
        monsterNameMode: "real",
        monsterImageMode: "real",
        showAllyHp: false
      },
      tokens: [],
      chat: [],
      rolls: [],
      events: [{id: uid("event"), title: "Mesa preparada", detail: `${campaign?.name || "Campanha"} pronta para receber a sessão.`, createdAt: now()}],
      initiative: {round: 1, current: 0, entries: []},
      notes: {private: "", public: ""},
      rosterTab: "heroes",
      sessionTab: "chat"
    };
  }

  let campaigns = readCampaigns();
  let campaign = null;
  let state = null;
  let sources = {heroes: [], creatures: [], library: [], maps: []};
  let resourceTab = "maps";
  let selectedTokenId = "";
  let selectedTokenIds = new Set();
  let pointer = null;
  let markerType = "Objetivo";
  let spacePressed = false;
  let saveFrame = 0;

  function stateKey(campaignId) {
    return `apex-realms-vtt:${campaignId}`;
  }

  function loadState(nextCampaign) {
    const fallback = defaultState(nextCampaign);
    const saved = readStore(stateKey(nextCampaign.id), {});
    state = {
      ...fallback,
      ...saved,
      scene: {...fallback.scene, ...(saved.scene || {})},
      view: {...fallback.view, ...(saved.view || {})},
      cardSettings: {...fallback.cardSettings, ...(saved.cardSettings || {})},
      initiative: {...fallback.initiative, ...(saved.initiative || {})},
      combat: {...fallback.combat, ...(saved.combat || {}), history: Array.isArray(saved.combat?.history) ? saved.combat.history : []},
      layers: {...fallback.layers, ...(saved.layers || {})},
      notes: {...fallback.notes, ...(saved.notes || {})},
      tokens: Array.isArray(saved.tokens) ? saved.tokens.map(normalizeToken) : [],
      chat: Array.isArray(saved.chat) ? saved.chat : [],
      rolls: Array.isArray(saved.rolls) ? saved.rolls : [],
      events: Array.isArray(saved.events) ? saved.events : fallback.events,
      fogReveals: Array.isArray(saved.fogReveals) ? saved.fogReveals : [],
      markers: Array.isArray(saved.markers) ? saved.markers : [],
      scenes: Array.isArray(saved.scenes) ? saved.scenes : []
    };
  }

  function saveState() {
    cancelAnimationFrame(saveFrame);
    saveFrame = requestAnimationFrame(() => {
      writeStore(stateKey(campaign.id), state);
      if (window.sessionState) {
        window.sessionState.activeMap = state.scene;
        window.sessionState.maps = state.scenes;
        window.sessionState.tokens = state.tokens;
        window.sessionState.chatMessages = state.chat;
        window.sessionState.diceRolls = state.rolls;
        window.sessionState.mapState = {
          ...window.sessionState.mapState,
          panX: state.view.panX,
          panY: state.view.panY,
          zoom: state.view.zoom,
          snapToGrid: state.snap,
          gridVisible: state.grid
        };
        window.saveSessionState?.();
      }
    });
  }

  function setMapStatus(message, healthy = true) {
    $("[data-map-status]").textContent = message;
    $(".vtt-map-status i")?.classList.toggle("online", healthy);
  }

  function formatTime(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "agora" : date.toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
  }

  function initials(name) {
    return escapeText(name).trim().split(/\s+/).slice(0, 2).map(part => part[0]).join("").toUpperCase() || "AR";
  }

  function currentUser() {
    const account = window.ApexStaticAuth?.getUser?.() || {};
    const profile = readStore(isPlayerMode ? "apex_player_profile" : KEYS.profile, {});
    return {
      name: profile.displayName || account.name || account.nickname || (isPlayerMode ? "Jogador" : "Mestre"),
      avatar: String(profile.avatar || account.avatar || "").startsWith("data:image/") ? (profile.avatar || account.avatar) : ""
    };
  }

  function normalizeEmail(value) {
    return String(value || "").trim().toLowerCase();
  }

  function currentAccount() {
    return window.ApexStaticAuth?.getUser?.() || {};
  }

  function currentPlayerRecord() {
    if (!isPlayerMode || !campaign) return null;
    const account = currentAccount();
    return readStore(KEYS.players, []).find(player => {
      return player.campaignId === campaign.id && normalizeEmail(player.email) === normalizeEmail(account.email);
    }) || null;
  }

  function canControlSource(source) {
    if (!isPlayerMode) return true;
    const account = currentAccount();
    const player = currentPlayerRecord();
    if (source.type !== "Personagem") return false;
    if (source.permissions?.moveToken === false) return false;
    if (player?.id && source.playerId === player.id) return true;
    const names = [account.name, account.nickname, player?.name, player?.nickname]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return names.includes(String(source.owner || "").trim().toLowerCase()) || names.includes(String(source.name || "").trim().toLowerCase());
  }

  function canControlToken(token) {
    if (!isPlayerMode) return true;
    const source = [...sources.heroes, ...sources.creatures].find(item => item.id === token.sourceId && item.origin === token.sourceOrigin);
    if (source) return canControlSource(source);
    const player = currentPlayerRecord();
    const account = currentAccount();
    const names = [account.name, account.nickname, player?.name, player?.nickname]
      .map(value => String(value || "").trim().toLowerCase())
      .filter(Boolean);
    return Boolean(token.playerId && player?.id && token.playerId === player.id) || names.includes(String(token.owner || "").trim().toLowerCase());
  }

  function deriveCardKind(raw = {}) {
    const tags = String(raw.tags || "").toLowerCase();
    if (/chefe|boss/.test(tags)) return "boss";
    if (/elite/.test(tags)) return "elite";
    if (raw.type === "Personagem" || raw.sourceType === "Personagem") return "player";
    if (raw.type === "Monstro" || raw.sourceType === "Monstro") return "monster";
    if (/aliad/.test(tags)) return "npc-ally";
    if (/hostil/.test(tags)) return "npc-hostile";
    return "npc-neutral";
  }

  function normalizeToken(raw = {}) {
    const sourceType = raw.sourceType || raw.type || "NPC";
    const isHero = sourceType === "Personagem";
    const isCreature = sourceType === "Monstro" || sourceType === "NPC";
    const hpMax = Math.max(0, Number(raw.hpMax ?? raw.maxHp ?? raw.hp ?? 0));
    return {
      ...raw,
      id: raw.id || uid("token"),
      sourceType,
      name: raw.name || "Sem nome",
      publicName: raw.publicName || "",
      portrait: raw.portrait || raw.avatar || raw.image || "",
      className: raw.className || "",
      race: raw.race || "",
      level: Math.max(0, Number(raw.level || 1)),
      hpCurrent: clamp(Number(raw.hpCurrent ?? raw.hp ?? 0), 0, hpMax || Number(raw.hpCurrent ?? raw.hp ?? 0)),
      hpMax,
      resourceCurrent: Math.max(0, Number(raw.resourceCurrent ?? raw.resource ?? raw.manaCurrent ?? 0)),
      resourceMax: Math.max(0, Number(raw.resourceMax ?? raw.maxResource ?? raw.manaMax ?? 0)),
      armorClass: Math.max(0, Number(raw.armorClass ?? raw.defense ?? 10)),
      initiative: Number(raw.initiative || 0),
      tempHp: Math.max(0, Number(raw.tempHp ?? raw.temp_hp ?? 0)),
      status: raw.status || (sourceType === "Monstro" ? "Hostil" : "Pronto"),
      conditions: String(raw.conditions || ""),
      buffs: String(raw.buffs || ""),
      debuffs: String(raw.debuffs || ""),
      masterNotes: String(raw.masterNotes || ""),
      weaknesses: String(raw.weaknesses || raw.fraquezas || ""),
      resistances: String(raw.resistances || raw.resistencias || ""),
      loot: String(raw.loot || ""),
      cardKind: raw.cardKind || deriveCardKind(raw),
      visibility: raw.hidden ? "secret" : (raw.visibilityLevel || (['public', 'partial', 'secret'].includes(raw.visibility) ? raw.visibility : (isHero ? "public" : "partial"))),
      imageVisibility: raw.imageVisibility || "real",
      showLifeState: raw.showLifeState !== false,
      shareClassRace: Boolean(raw.shareClassRace),
      locked: Boolean(raw.locked),
      x: Number(raw.x ?? 650),
      y: Number(raw.y ?? 430),
      owner: raw.owner || "Mestre",
      playerId: raw.playerId || "",
      isCreature
    };
  }

  function healthState(entity) {
    const hp = Math.max(0, Number(entity.hpCurrent || 0));
    const maximum = Math.max(1, Number(entity.hpMax || 1));
    if (hp === 0) return "Caido";
    const percent = hp / maximum * 100;
    if (percent >= 75) return "Saudavel";
    if (percent >= 50) return "Ferido";
    if (percent >= 25) return "Muito Ferido";
    return "Critico";
  }

  function publicEntityView(raw) {
    const entity = normalizeToken(raw);
    const controllable = isPlayerMode && canControlToken(entity);
    if (!isPlayerMode) return {...entity, viewerScope: "master", canSeeStats: true, canSeeResource: true, canSeeDefense: true, canOpenSheet: true};
    if (controllable) return {...entity, masterNotes: "", viewerScope: "owner", canSeeStats: true, canSeeResource: true, canSeeDefense: true, canOpenSheet: true};

    const settings = state?.cardSettings || defaultState(campaign).cardSettings;
    const creature = entity.sourceType === "Monstro" || entity.sourceType === "NPC";
    const visibility = entity.visibility;
    const genericName = entity.sourceType === "Monstro" ? "Criatura Desconhecida" : "Figura Desconhecida";
    let name = entity.name;
    if (visibility === "secret" || (creature && settings.monsterNameMode === "generic")) name = entity.publicName || genericName;
    if (creature && settings.monsterNameMode === "hidden") name = "???";
    let imageVisibility = entity.imageVisibility;
    if (creature && settings.monsterImageMode !== "real") imageVisibility = settings.monsterImageMode;
    if (visibility === "secret" && imageVisibility === "real") imageVisibility = "silhouette";
    const showNarrative = visibility === "partial" && settings.showNarrativeHealth && entity.showLifeState;
    const showAllyHp = entity.sourceType === "Personagem" && settings.showAllyHp;
    return {
      ...entity,
      name,
      sourceType: visibility === "secret" ? "Criatura" : entity.sourceType,
      cardKind: visibility === "secret" ? "monster" : entity.cardKind,
      portrait: imageVisibility === "real" ? entity.portrait : "",
      imageVisibility,
      className: entity.shareClassRace ? entity.className : "",
      race: entity.shareClassRace ? entity.race : "",
      conditions: "",
      buffs: "",
      debuffs: "",
      masterNotes: "",
      weaknesses: "",
      resistances: "",
      loot: "",
      status: "",
      hpCurrent: showAllyHp ? entity.hpCurrent : undefined,
      hpMax: showAllyHp ? entity.hpMax : undefined,
      resourceCurrent: undefined,
      resourceMax: undefined,
      armorClass: undefined,
      initiative: undefined,
      viewerScope: "player",
      canSeeStats: showAllyHp,
      canSeeResource: false,
      canSeeDefense: false,
      canOpenSheet: false,
      narrativeHealth: showNarrative ? healthState(entity) : ""
    };
  }

  function blockPlayerAction(message = "Somente o Mestre pode alterar este controle.") {
    setMapStatus(message, false);
    if (typeof showPrototypeToast === "function") showPrototypeToast(message);
  }

  function avatarContent(container, item) {
    container.replaceChildren();
    if (item.portrait || item.avatar || item.image) {
      const image = document.createElement("img");
      image.src = item.portrait || item.avatar || item.image;
      image.alt = "";
      container.append(image);
    } else {
      container.textContent = initials(item.name);
    }
  }

  function buildSources() {
    const masterOwner = window.ApexMvpStore?.ownerId?.() || "";
    const allPlayers = readStore(KEYS.players, []);
    const sheets = readSheets();
    const library = readStore(KEYS.library, []).filter(item => !masterOwner || item.ownerId === masterOwner);
    const approvedPlayers = allPlayers.filter(player => player.campaignId === campaign.id && player.status === "Aprovado");
    const sheetById = id => sheets.find(sheet => sheet.id === id);
    const linkedIds = new Set(approvedPlayers.map(player => player.sheetId).filter(Boolean));
    const campaignSheets = sheets.filter(sheet => !sheet.campaignId || sheet.campaignId === campaign.id);

    const linkedHeroes = approvedPlayers.map(player => {
      const sheet = sheetById(player.sheetId) || {};
      return normalizeSource({
        ...sheet,
        id: sheet.id || `player-${player.id}`,
        playerId: player.id,
        name: sheet.name || player.nickname || player.name,
        owner: player.name,
        portrait: sheet.portrait || player.avatar,
        type: "Personagem",
        connected: isRecentlyActive(player.lastAccess),
        permissions: player.permissions || {}
      }, "sheet");
    });
    const unlinkedHeroes = campaignSheets
      .filter(sheet => sheet.type === "Personagem" && !linkedIds.has(sheet.id))
      .map(sheet => normalizeSource(sheet, "sheet"));
    const sheetCreatures = campaignSheets
      .filter(sheet => sheet.type === "NPC" || sheet.type === "Monstro")
      .map(sheet => normalizeSource(sheet, "sheet"));
    const libraryCreatures = library
      .filter(item => (!item.campaignId || item.campaignId === campaign.id) && ["NPCs", "Monstros"].includes(item.type))
      .map(item => normalizeSource({...item, type: item.type === "Monstros" ? "Monstro" : "NPC"}, "library"));
    const libraryMaps = library
      .filter(item => (!item.campaignId || item.campaignId === campaign.id) && item.type === "Mapas" && item.image)
      .map(item => ({id: item.id, name: item.name, image: item.image, description: item.description || "Mapa da biblioteca", origin: "library"}));

    sources.heroes = uniqueSources([...linkedHeroes, ...unlinkedHeroes]);
    sources.creatures = uniqueSources([...sheetCreatures, ...libraryCreatures]);
    sources.library = library.filter(item => !item.campaignId || item.campaignId === campaign.id);
    sources.maps = [
      {id: "ruins", name: "Ruinas arcanas", image: "../assets/ruins-map.jpg", description: "Cenário tático padrão do Apex Realms", origin: "default"},
      ...state.scenes,
      ...libraryMaps
    ].filter((item, index, list) => list.findIndex(other => other.id === item.id) === index);
  }

  function isRecentlyActive(value) {
    const time = new Date(value || 0).getTime();
    return Number.isFinite(time) && Date.now() - time < 15 * 60 * 1000;
  }

  function normalizeSource(raw, origin) {
    const attributeText = String(raw.attributes || "");
    const numberFrom = pattern => Number(attributeText.match(pattern)?.[1] || 0);
    const parsedHp = numberFrom(/(?:PV|HP)\s*[:=]?\s*(\d+)/i);
    const parsedArmor = numberFrom(/(?:CA|DEF)\s*[:=]?\s*(\d+)/i);
    const parsedInitiative = numberFrom(/(?:INICIATIVA|INI)\s*[:=]?\s*([+-]?\d+)/i);
    const parsedAgility = numberFrom(/(?:AGILIDADE|DESTREZA|DES)\s*[:=]?\s*(\d+)/i);
    const sourceType = raw.type || "NPC";
    return {
      id: raw.id || uid("source"),
      origin,
      playerId: raw.playerId || "",
      name: raw.name || "Sem nome",
      publicName: raw.publicName || "",
      type: sourceType,
      owner: raw.owner || "Mestre",
      portrait: raw.portrait || raw.avatar || raw.image || "",
      className: raw.className || raw.race || raw.type || "Aventureiro",
      race: raw.race || "",
      level: Number(raw.level || 1),
      hpCurrent: Number(raw.hpCurrent ?? raw.hp ?? parsedHp),
      hpMax: Number(raw.hpMax ?? raw.maxHp ?? raw.hp ?? parsedHp),
      resourceCurrent: Number(raw.resourceCurrent ?? raw.manaCurrent ?? 0),
      resourceMax: Number(raw.resourceMax ?? raw.manaMax ?? 0),
      armorClass: Number(raw.armorClass || raw.defense || parsedArmor || 10),
      initiative: raw.initiative !== undefined && raw.initiative !== "" ? Number(raw.initiative) : (parsedInitiative || (parsedAgility ? Math.floor((parsedAgility - 10) / 2) : 0)),
      status: raw.status || "Pronto",
      conditions: raw.conditions || "",
      buffs: raw.buffs || "",
      debuffs: raw.debuffs || "",
      masterNotes: raw.masterNotes || "",
      weaknesses: raw.weaknesses || raw.fraquezas || "",
      resistances: raw.resistances || raw.resistencias || "",
      loot: raw.loot || "",
      biome: raw.biome || "Qualquer",
      profession: raw.profession || "",
      personality: raw.personality || "",
      tags: raw.tags || "",
      cardKind: raw.cardKind || deriveCardKind({...raw, sourceType}),
      visibilityLevel: raw.visibilityLevel || (sourceType === "Personagem" ? "public" : "partial"),
      imageVisibility: raw.imageVisibility || "real",
      showLifeState: raw.showLifeState !== false,
      shareClassRace: Boolean(raw.shareClassRace),
      locked: Boolean(raw.locked),
      connected: Boolean(raw.connected),
      permissions: raw.permissions || {},
      description: raw.description || raw.concept || "",
      abilities: raw.abilities || ""
    };
  }

  function uniqueSources(items) {
    const seen = new Set();
    return items.filter(item => {
      const key = `${item.origin}:${item.id}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  function populateCampaigns() {
    elements.campaignSelect.replaceChildren();
    if (!campaigns.length) {
      elements.campaignSelect.add(new Option("Nenhuma campanha", ""));
      elements.campaignSelect.disabled = true;
      elements.emptyCampaign.hidden = false;
      return false;
    }
    campaigns.forEach(item => elements.campaignSelect.add(new Option(item.name, item.id)));
    const saved = localStorage.getItem(KEYS.activeCampaign);
    const preferred = campaigns.find(item => item.id === saved) || campaigns[0];
    elements.campaignSelect.value = preferred.id;
    elements.campaignSelect.disabled = false;
    elements.emptyCampaign.hidden = true;
    selectCampaign(preferred.id);
    return true;
  }

  function selectCampaign(campaignId) {
    campaign = campaigns.find(item => item.id === campaignId) || campaigns[0];
    if (!campaign) return;
    localStorage.setItem(KEYS.activeCampaign, campaign.id);
    elements.campaignSelect.value = campaign.id;
    loadState(campaign);
    buildSources();
    syncTokensWithSources();
    renderAll();
  }

  function syncTokensWithSources() {
    const available = [...sources.heroes, ...sources.creatures];
    state.tokens = state.tokens.map(token => {
      const source = available.find(item => item.id === token.sourceId && item.origin === token.sourceOrigin);
      if (!source) return token;
      return normalizeToken({
        ...token,
        name: source.name,
        portrait: source.portrait,
        className: source.className,
        race: source.race,
        level: source.level,
        sourceType: source.type,
        weaknesses: source.weaknesses || token.weaknesses,
        resistances: source.resistances || token.resistances,
        loot: source.loot || token.loot,
        masterNotes: source.masterNotes || token.masterNotes
      });
    });
    syncInitiative();
  }

  function renderAll() {
    $("[data-campaign-system]").textContent = campaign.system;
    $("[data-scene-name]").textContent = state.scene.name;
    const connected = sources.heroes.filter(source => source.connected).length;
    $("[data-connected-count]").textContent = connected;
    renderSessionButton();
    renderMap();
    renderRoster();
    renderTokens();
    renderChat();
    renderRolls();
    renderEvents();
    renderInitiative();
    renderNotes();
    activateRosterTab(state.rosterTab || "heroes", false);
    activateSessionTab(state.sessionTab || "chat", false);
  }

  function renderSessionButton() {
    const button = $("[data-session-toggle]");
    button.classList.toggle("live", state.live);
    if (isPlayerMode) {
      button.querySelector("span").textContent = state.live ? "AO VIVO" : "Aguardando Mestre";
      setMapStatus(state.live ? "Sessao ao vivo" : "Aguardando Mestre", true);
      return;
    }
    button.querySelector("span").textContent = state.live ? "Encerrar sessao" : "Iniciar sessao";
    setMapStatus(state.live ? "Sessao ao vivo" : "Cena pronta", true);
  }

  function applyView() {
    elements.mapWorld.style.transform = `translate(-50%, -50%) translate(${state.view.panX}px, ${state.view.panY}px) scale(${state.view.zoom})`;
    const zoomSelect = $("[data-zoom-preset]");
    if (zoomSelect) {
      const value = String(state.view.zoom);
      let custom = zoomSelect.querySelector("option[data-custom]");
      if (![...zoomSelect.options].some(option => option.value === value)) {
        custom?.remove();
        custom = new Option(`${Math.round(state.view.zoom * 100)}%`, value, true, true);
        custom.dataset.custom = "true";
        zoomSelect.add(custom);
      }
      zoomSelect.value = value;
    }
  }

  function renderMap() {
    const image = state.scene.image || "../assets/ruins-map.jpg";
    elements.mapImage.style.backgroundImage = `url("${image}")`;
    elements.mapArea.classList.toggle("grid-off", !state.grid);
    elements.mapArea.classList.toggle("fog-on", state.fog);
    elements.mapArea.classList.toggle("token-mode", state.cardSettings.displayMode === "token");
    elements.mapArea.classList.toggle("card-mode", state.cardSettings.displayMode !== "token");
    Object.entries(state.layers).forEach(([name, visible]) => elements.mapArea.classList.toggle(`layer-${name}-hidden`, !visible));
    $("[data-grid-toggle]").classList.toggle("active", state.grid);
    $("[data-snap-toggle]").classList.toggle("active", state.snap);
    $("[data-fog-toggle]").classList.toggle("active", state.fog);
    $$('[data-tool]').forEach(button => button.classList.toggle("active", button.dataset.tool === state.tool));
    elements.mapStage.className = `vtt-map-stage tool-${state.tool}`;
    $$('[data-layer-toggle]').forEach(input => { input.checked = state.layers[input.dataset.layerToggle] !== false; });
    renderFog();
    renderMarkers();
    applyView();
  }

  function renderFog() {
    if (!elements.fogLayer) return;
    const context = elements.fogLayer.getContext("2d");
    context.clearRect(0, 0, WORLD.width, WORLD.height);
    context.fillStyle = isPlayerMode ? "rgba(3,4,8,.97)" : "rgba(4,4,9,.78)";
    context.fillRect(0, 0, WORLD.width, WORLD.height);
    context.globalCompositeOperation = "destination-out";
    state.fogReveals.forEach(reveal => {
      const radius = Math.max(70, Number(reveal.radius || 150));
      const gradient = context.createRadialGradient(reveal.x, reveal.y, radius * .58, reveal.x, reveal.y, radius);
      gradient.addColorStop(0, "rgba(0,0,0,1)");
      gradient.addColorStop(.72, "rgba(0,0,0,.92)");
      gradient.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = gradient;
      context.beginPath();
      context.arc(reveal.x, reveal.y, radius, 0, Math.PI * 2);
      context.fill();
    });
    context.globalCompositeOperation = "source-over";
  }

  function renderMarkers() {
    if (!elements.markerLayer) return;
    elements.markerLayer.replaceChildren();
    state.markers.forEach(marker => {
      const button = document.createElement("div");
      button.setAttribute("role", "button");
      button.tabIndex = 0;
      button.className = `vtt-map-marker marker-${String(marker.type).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\W+/g, "-")}`;
      button.style.left = `${marker.x}px`;
      button.style.top = `${marker.y}px`;
      button.dataset.markerId = marker.id;
      button.innerHTML = `<i></i><span></span>`;
      button.querySelector("i").textContent = marker.type.slice(0, 1).toUpperCase();
      button.querySelector("span").textContent = marker.label || marker.type;
      button.title = isPlayerMode ? marker.type : "Clique para remover";
      if (!isPlayerMode) button.addEventListener("click", () => {
        state.markers = state.markers.filter(item => item.id !== marker.id);
        addEvent("Marcador removido", `${marker.type} foi removido do mapa.`);
        renderMarkers();
        saveState();
      });
      elements.markerLayer.append(button);
    });
  }

  function rosterCard(source) {
    const visible = publicEntityView({...source, sourceType: source.type});
    const article = document.createElement("article");
    article.className = "vtt-roster-card";
    const token = state.tokens.find(item => item.sourceId === source.id && item.sourceOrigin === source.origin);
    const hpMax = Math.max(0, visible.hpMax);
    const hpCurrent = clamp(visible.hpCurrent, 0, hpMax || visible.hpCurrent || 0);
    const hpPercent = hpMax ? Math.round(hpCurrent / hpMax * 100) : 0;
    const resourceMax = Math.max(0, visible.resourceMax);
    const resourcePercent = resourceMax ? Math.round(visible.resourceCurrent / resourceMax * 100) : 0;
    const vitals = visible.canSeeStats ? `<div class="vtt-vital-row"><span>PV</span><span class="vtt-vital-track"><i></i></span><b></b></div>${resourceMax ? '<div class="vtt-vital-row mana"><span>RE</span><span class="vtt-vital-track"><i></i></span><b></b></div>' : ""}` : `<div class="vtt-roster-public-state">${visible.narrativeHealth || visible.sourceType}</div>`;
    article.innerHTML = `<span class="vtt-roster-avatar"><i></i></span><div class="vtt-roster-main"><header><h3></h3><span></span></header><p></p>${vitals}</div><button class="vtt-roster-add" type="button" aria-label="Adicionar ao mapa"><svg><use href="#vtt-plus"></use></svg></button>`;
    avatarContent(article.querySelector(".vtt-roster-avatar"), visible);
    const online = document.createElement("i");
    if (source.connected) article.querySelector(".vtt-roster-avatar").append(online);
    article.querySelector("h3").textContent = visible.name;
    article.querySelector("header span").textContent = visible.sourceType === "Personagem" ? `Nv. ${visible.level}` : visible.sourceType;
    article.querySelector("p").textContent = [visible.className, visible.race].filter(Boolean).join(" / ") || visible.sourceType;
    if (visible.canSeeStats) {
      article.querySelector(".vtt-vital-row i").style.width = `${hpPercent}%`;
      article.querySelector(".vtt-vital-row b").textContent = hpMax ? `${hpCurrent}/${hpMax}` : "--";
    }
    if (visible.canSeeStats && resourceMax) {
      article.querySelector(".vtt-vital-row.mana i").style.width = `${resourcePercent}%`;
      article.querySelector(".vtt-vital-row.mana b").textContent = `${visible.resourceCurrent}/${resourceMax}`;
    }
    const add = article.querySelector(".vtt-roster-add");
    add.classList.toggle("on-map", Boolean(token));
    add.setAttribute("aria-label", token ? "Remover do mapa" : "Adicionar ao mapa");
    add.querySelector("use").setAttribute("href", token ? "#vtt-minus" : "#vtt-plus");
    if (isPlayerMode && !canControlSource(source)) {
      add.disabled = true;
      add.title = "Controle liberado apenas para o Mestre ou dono da ficha";
      article.classList.add("locked");
    }
    add.addEventListener("click", () => token ? removeToken(token.id) : addSourceToMap(source));
    article.addEventListener("dblclick", () => {
      if (token) openTokenDialog(token.id);
      else if (isPlayerMode && !canControlSource(source)) blockPlayerAction("Voce so controla o seu proprio personagem.");
      else addSourceToMap(source, true);
    });
    return article;
  }

  function renderRoster() {
    const list = state.rosterTab === "creatures"
      ? (isPlayerMode ? state.tokens.filter(item => item.sourceType === "Monstro" || item.sourceType === "NPC").map(item => ({...item, type: item.sourceType})) : sources.creatures)
      : sources.heroes;
    $("[data-roster-count]").textContent = list.length;
    elements.rosterList.replaceChildren();
    if (!list.length) {
      elements.rosterList.innerHTML = `<div class="vtt-roster-empty"><svg><use href="#${state.rosterTab === "creatures" ? "vtt-sword" : "vtt-users"}"></use></svg><b>${state.rosterTab === "creatures" ? "Nenhuma criatura" : "Nenhum personagem"}</b><span>${state.rosterTab === "creatures" ? "Crie NPCs, monstros ou recursos na Biblioteca." : "Aprove jogadores e vincule suas fichas à campanha."}</span></div>`;
      return;
    }
    list.forEach(source => elements.rosterList.append(rosterCard(source)));
  }

  function activateRosterTab(name, persist = true) {
    state.rosterTab = name;
    $$('[data-roster-tab]').forEach(button => button.classList.toggle("active", button.dataset.rosterTab === name));
    renderRoster();
    if (persist) saveState();
  }

  function addSourceToMap(source, openAfter = false) {
    if (isPlayerMode && !canControlSource(source)) {
      blockPlayerAction("Voce so pode adicionar o seu proprio personagem ao mapa.");
      return;
    }
    const existing = state.tokens.find(item => item.sourceId === source.id && item.sourceOrigin === source.origin);
    if (existing) {
      if (openAfter) openTokenDialog(existing.id);
      return;
    }
    const count = state.tokens.length;
    const token = {
      id: uid("token"),
      sourceId: source.id,
      sourceOrigin: source.origin,
      sourceType: source.type,
      playerId: source.playerId || "",
      owner: source.owner || "",
      name: source.name,
      publicName: source.publicName || "",
      portrait: source.portrait,
      className: source.className,
      race: source.race,
      level: source.level,
      x: 650 + (count % 6) * 60,
      y: 430 + Math.floor(count / 6) * 70,
      hpCurrent: source.hpCurrent,
      hpMax: source.hpMax,
      resourceCurrent: source.resourceCurrent,
      resourceMax: source.resourceMax,
      armorClass: source.armorClass,
      initiative: source.initiative,
      tempHp: 0,
      status: source.type === "Monstro" ? "Hostil" : "Pronto",
      conditions: source.conditions,
      buffs: source.buffs,
      debuffs: source.debuffs,
      masterNotes: source.masterNotes,
      weaknesses: source.weaknesses,
      resistances: source.resistances,
      loot: source.loot,
      cardKind: source.cardKind,
      visibility: source.visibilityLevel,
      imageVisibility: source.imageVisibility,
      showLifeState: source.showLifeState,
      shareClassRace: source.shareClassRace,
      locked: source.locked
    };
    state.tokens.push(normalizeToken(token));
    addEvent("Token adicionado", `${source.name} entrou no mapa.`);
    syncInitiative();
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
    animateCardArrival(token.id).then(() => {
      if (openAfter) openTokenDialog(token.id);
    });
  }

  function removeToken(tokenId) {
    const token = state.tokens.find(item => item.id === tokenId);
    if (isPlayerMode && token && !canControlToken(token)) {
      blockPlayerAction("Apenas o Mestre pode remover este token.");
      return;
    }
    state.tokens = state.tokens.filter(item => item.id !== tokenId);
    selectedTokenId = "";
    selectedTokenIds.delete(tokenId);
    syncInitiative();
    if (token) addEvent("Token removido", `${token.name} saiu do mapa.`);
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
  }

  function renderTokens() {
    elements.tokenLayer.replaceChildren();
    const activeEntry = state.combat.active ? state.initiative.entries[state.initiative.current] : null;
    state.tokens.forEach(rawToken => {
      const token = normalizeToken(rawToken);
      const visible = publicEntityView(token);
      const button = document.createElement("button");
      button.type = "button";
      const healthCanBeShown = visible.canSeeStats || Boolean(visible.narrativeHealth);
      const hpPercent = healthCanBeShown && token.hpMax ? clamp(token.hpCurrent / token.hpMax * 100, 0, 100) : 0;
      const typeClass = token.sourceType === "Monstro" ? "hostile" : token.sourceType === "NPC" ? "npc" : "friendly";
      const narrativeState = healthState(token).toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/\s+/g, "-");
      const stateClasses = [selectedTokenIds.has(token.id) ? "selected" : "", token.locked || (isPlayerMode && !canControlToken(token)) ? "locked" : "", visible.visibility === "secret" ? "secret" : "", healthCanBeShown && token.hpMax && hpPercent <= 25 ? "low-life" : "", healthCanBeShown && token.hpMax && token.hpCurrent <= 0 ? "defeated" : "", activeEntry?.tokenId === token.id ? "turn-active" : "", `health-${narrativeState}`, `kind-${visible.cardKind}`].filter(Boolean).join(" ");
      button.className = `vtt-token vtt-card-token ${typeClass} ${stateClasses}`;
      button.dataset.tokenId = token.id;
      button.style.left = `${token.x}px`;
      button.style.top = `${token.y}px`;
      const hoverDetails = visible.canSeeStats ? [`PV ${visible.hpCurrent}/${visible.hpMax}`, token.tempHp ? `Escudo ${token.tempHp}` : "", visible.canSeeResource && visible.resourceMax ? `RE ${visible.resourceCurrent}/${visible.resourceMax}` : "", visible.canSeeDefense ? `CA ${visible.armorClass}` : "", visible.conditions, visible.weaknesses ? `Fraquezas: ${visible.weaknesses}` : "", visible.resistances ? `Resistencias: ${visible.resistances}` : "", visible.loot ? `Loot: ${visible.loot}` : "", visible.masterNotes].filter(Boolean) : [visible.sourceType, visible.narrativeHealth].filter(Boolean);
      button.dataset.cardHover = hoverDetails.join(" | ");
      button.setAttribute("aria-label", `${visible.name}. ${hoverDetails.join(". ")}`);

      const art = document.createElement("span");
      art.className = `vtt-card-art image-${visible.imageVisibility || "real"}`;
      if (visible.portrait) {
        const image = document.createElement("img");
        image.src = visible.portrait;
        image.alt = `Retrato de ${visible.name}`;
        art.append(image);
      } else {
        const label = document.createElement("b");
        label.textContent = visible.imageVisibility === "silhouette" ? "?" : initials(visible.name);
        art.append(label);
      }
      const crest = document.createElement("i");
      crest.textContent = visible.cardKind === "boss" ? "CHEFE" : visible.sourceType;
      art.append(crest);

      const identity = document.createElement("span");
      identity.className = "vtt-card-identity";
      const name = document.createElement("strong");
      name.textContent = visible.name;
      const type = document.createElement("small");
      type.textContent = [[visible.className, visible.race].filter(Boolean).join(" / "), visible.level ? `Nv. ${visible.level}` : ""].filter(Boolean).join(" - ") || visible.sourceType;
      identity.append(name, type);
      if (visible.canSeeStats && visible.conditions) {
        const condition = document.createElement("small");
        condition.className = "vtt-card-condition";
        condition.textContent = visible.conditions.split(",")[0].trim();
        identity.append(condition);
      }

      const footer = document.createElement("span");
      footer.className = "vtt-card-footer";
      if (visible.canSeeStats) {
        const hp = document.createElement("span");
        hp.innerHTML = `<small>PV</small><b>${visible.hpCurrent}/${visible.hpMax}</b><i style="--value:${hpPercent}%"></i>`;
        footer.append(hp);
        if (visible.canSeeResource && visible.resourceMax) {
          const resource = document.createElement("span");
          resource.innerHTML = `<small>RE</small><b>${visible.resourceCurrent}/${visible.resourceMax}</b>`;
          footer.append(resource);
        }
        if (visible.canSeeDefense) {
          const armor = document.createElement("span");
          armor.innerHTML = `<small>CA</small><b>${visible.armorClass}</b>`;
          footer.append(armor);
        }
        if (token.tempHp) {
          const shield = document.createElement("span");
          shield.className = "vtt-card-shield";
          shield.innerHTML = `<small>ESC</small><b>${token.tempHp}</b>`;
          footer.append(shield);
        }
      } else {
        const narrative = document.createElement("em");
        narrative.textContent = visible.narrativeHealth || (visible.visibility === "secret" ? "Identidade oculta" : "Informacao publica");
        footer.append(narrative);
      }
      button.append(art, identity, footer);
      if (!isPlayerMode) {
        const actions = document.createElement("span");
        actions.className = "vtt-card-actions";
        actions.innerHTML = `<i role="button" tabindex="0" data-quick-health="damage" title="Aplicar dano">-</i><i role="button" tabindex="0" data-quick-health="heal" title="Aplicar cura">+</i><i role="button" tabindex="0" data-quick-health="shield" title="Escudo temporario">S</i>`;
        const triggerHealthAction = event => {
          const action = event.target.closest("[data-quick-health]");
          if (!action || (event.type === "keydown" && !["Enter", " "].includes(event.key))) return;
          event.preventDefault();
          event.stopPropagation();
          openQuickHealth(token.id, action.dataset.quickHealth);
        };
        actions.addEventListener("click", triggerHealthAction);
        actions.addEventListener("keydown", triggerHealthAction);
        button.append(actions);
      }
      elements.tokenLayer.append(button);
    });
  }

  function animateCardArrival(tokenId) {
    const target = elements.tokenLayer.querySelector(`[data-token-id="${tokenId}"]`);
    if (!target) return Promise.resolve();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    target.classList.add("summoning");

    if (reducedMotion || typeof target.animate !== "function") {
      target.classList.remove("summoning");
      target.classList.add("arrived");
      setTimeout(() => target.classList.remove("arrived"), 420);
      return Promise.resolve();
    }

    const mapRect = elements.mapArea.getBoundingClientRect();
    const targetRect = target.getBoundingClientRect();
    const startX = mapRect.width / 2;
    const startY = Math.max(120, mapRect.height * .42);
    const targetX = targetRect.left + targetRect.width / 2 - mapRect.left;
    const targetY = targetRect.top + targetRect.height / 2 - mapRect.top;
    const deltaX = targetX - startX;
    const deltaY = targetY - startY;
    const duration = 1720;

    const overlay = document.createElement("div");
    overlay.className = "vtt-card-summon";
    overlay.setAttribute("aria-hidden", "true");
    overlay.style.setProperty("--portal-x", `${startX}px`);
    overlay.style.setProperty("--portal-y", `${startY}px`);
    overlay.style.setProperty("--impact-x", `${targetX}px`);
    overlay.style.setProperty("--impact-y", `${targetY}px`);

    const veil = document.createElement("span");
    veil.className = "vtt-summon-veil";
    const portal = document.createElement("span");
    portal.className = "vtt-summon-portal";
    portal.innerHTML = "<i></i><b></b><em></em>";
    const particles = document.createElement("span");
    particles.className = "vtt-summon-particles";
    for (let index = 0; index < 26; index += 1) {
      const spark = document.createElement("i");
      spark.style.setProperty("--angle", `${index / 26 * 360 + Math.random() * 12}deg`);
      spark.style.setProperty("--distance", `${70 + Math.random() * 150}px`);
      spark.style.setProperty("--delay", `${Math.random() * .34}s`);
      spark.style.setProperty("--spark-size", `${1 + Math.random() * 3}px`);
      particles.append(spark);
    }
    const impact = document.createElement("span");
    impact.className = "vtt-card-impact";

    const flyingCard = target.cloneNode(true);
    flyingCard.classList.remove("selected", "locked", "summoning", "arrived", "moving", "low-life");
    flyingCard.classList.add("vtt-summon-card");
    flyingCard.removeAttribute("data-token-id");
    flyingCard.removeAttribute("data-card-hover");
    flyingCard.removeAttribute("aria-label");
    flyingCard.disabled = true;
    flyingCard.style.left = `${startX}px`;
    flyingCard.style.top = `${startY}px`;

    overlay.append(veil, portal, particles, impact, flyingCard);
    elements.mapArea.append(overlay);
    setMapStatus(`Invocando ${target.querySelector("strong")?.textContent || "carta"}...`, true);

    const landingTransform = `translate(-50%, -50%) translate3d(${deltaX}px, ${deltaY}px, 0) rotateX(0) rotateY(0) rotateZ(0) scale(1)`;
    const flight = flyingCard.animate([
      {offset: 0, opacity: 0, filter: "blur(10px) brightness(2.2)", transform: "translate(-50%, -50%) translate3d(0, 70px, -240px) rotateX(76deg) rotateY(-760deg) rotateZ(-20deg) scale(.28)"},
      {offset: .16, opacity: 1, filter: "blur(0) brightness(1.7)", transform: "translate(-50%, -50%) translate3d(0, -34px, 250px) rotateX(34deg) rotateY(-510deg) rotateZ(13deg) scale(1.62)"},
      {offset: .42, opacity: 1, filter: "brightness(1.25)", transform: "translate(-50%, -50%) translate3d(0, -14px, 155px) rotateX(-11deg) rotateY(-245deg) rotateZ(-8deg) scale(1.46)"},
      {offset: .68, opacity: 1, filter: "brightness(1.12)", transform: `translate(-50%, -50%) translate3d(${deltaX * .48}px, ${deltaY * .3 - 30}px, 100px) rotateX(12deg) rotateY(-72deg) rotateZ(5deg) scale(1.3)`},
      {offset: .88, opacity: 1, filter: "brightness(1.05)", transform: `translate(-50%, -50%) translate3d(${deltaX * .9}px, ${deltaY * .82 - 12}px, 28px) rotateX(-5deg) rotateY(18deg) rotateZ(-2deg) scale(1.09)`},
      {offset: 1, opacity: 1, filter: "brightness(1)", transform: landingTransform}
    ], {duration, easing: "cubic-bezier(.18,.76,.22,1)", fill: "forwards"});

    const landingTimer = setTimeout(() => overlay.classList.add("landing"), duration * .78);
    return flight.finished.catch(() => undefined).then(() => {
      clearTimeout(landingTimer);
      flight.cancel();
      flyingCard.style.transform = landingTransform;
      target.classList.remove("summoning");
      target.classList.add("arrived");
      setMapStatus(`${target.querySelector("strong")?.textContent || "Carta"} entrou na cena.`, true);
      requestAnimationFrame(() => overlay.classList.add("landed"));
      return new Promise(resolve => setTimeout(() => {
        target.classList.remove("arrived");
        overlay.remove();
        resolve();
      }, 520));
    });
  }

  function worldPoint(event) {
    const rect = elements.mapStage.getBoundingClientRect();
    return {
      x: clamp((event.clientX - rect.left - rect.width / 2 - state.view.panX) / state.view.zoom + WORLD.width / 2, 0, WORLD.width),
      y: clamp((event.clientY - rect.top - rect.height / 2 - state.view.panY) / state.view.zoom + WORLD.height / 2, 0, WORLD.height)
    };
  }

  function snapped(point) {
    if (!state.snap) return point;
    return {x: Math.round(point.x / WORLD.grid) * WORLD.grid, y: Math.round(point.y / WORLD.grid) * WORLD.grid};
  }

  function beginPointer(event) {
    if (event.button !== 0) return;
    const healthAction = event.target.closest("[data-quick-health]");
    if (healthAction) {
      if (!isPlayerMode) openQuickHealth(healthAction.closest("[data-token-id]")?.dataset.tokenId, healthAction.dataset.quickHealth);
      event.preventDefault();
      return;
    }
    if (event.target.closest("[data-marker-id]")) return;
    const tokenElement = event.target.closest("[data-token-id]");
    const wantsPan = state.tool === "pan" || spacePressed;
    if (tokenElement && state.tool === "select" && !wantsPan) {
      const token = state.tokens.find(item => item.id === tokenElement.dataset.tokenId);
      if (!token) return;
      if (event.shiftKey) {
        selectedTokenIds.has(token.id) ? selectedTokenIds.delete(token.id) : selectedTokenIds.add(token.id);
        selectedTokenId = token.id;
        renderTokens();
        event.preventDefault();
        return;
      }
      if (!canControlToken(token)) {
        selectedTokenId = token.id;
        selectedTokenIds = new Set([token.id]);
        renderTokens();
        openTokenDialog(token.id);
        return;
      }
      selectedTokenId = token.id;
      if (!selectedTokenIds.has(token.id)) selectedTokenIds = new Set([token.id]);
      const group = state.tokens.filter(item => selectedTokenIds.has(item.id) && canControlToken(item)).map(item => ({id: item.id, x: item.x, y: item.y}));
      pointer = {type: "token", id: token.id, startX: event.clientX, startY: event.clientY, group, moved: false};
      renderTokens();
      group.forEach(item => elements.tokenLayer.querySelector(`[data-token-id="${item.id}"]`)?.classList.add("moving"));
      event.preventDefault();
      return;
    }
    if (wantsPan) {
      pointer = {type: "pan", startX: event.clientX, startY: event.clientY, panX: state.view.panX, panY: state.view.panY};
      elements.mapStage.classList.add("is-panning");
      event.preventDefault();
      return;
    }
    if (state.tool === "measure") {
      const point = snapped(worldPoint(event));
      pointer = {type: "measure", start: point, current: point};
      drawMeasurement(point, point);
      event.preventDefault();
      return;
    }
    if (state.tool === "ping") {
      createPing(worldPoint(event));
      return;
    }
    if (state.tool === "reveal") {
      if (isPlayerMode) return blockPlayerAction("A revelacao do mapa e controlada pelo Mestre.");
      const point = worldPoint(event);
      state.fog = true;
      state.fogReveals.push({id: uid("reveal"), x: point.x, y: point.y, radius: 155});
      state.fogReveals = state.fogReveals.slice(-24);
      addEvent("Area revelada", "Uma nova parte do mapa ficou visivel para o grupo.");
      renderMap();
      saveState();
      return;
    }
    if (state.tool === "marker") {
      if (isPlayerMode) return blockPlayerAction("Marcadores permanentes sao controlados pelo Mestre.");
      const point = snapped(worldPoint(event));
      state.markers.push({id: uid("marker"), type: markerType, label: markerType, x: point.x, y: point.y, createdAt: now()});
      addEvent("Marcador adicionado", `${markerType} foi marcado no mapa.`);
      renderMarkers();
      saveState();
      return;
    }
    selectedTokenId = "";
    selectedTokenIds.clear();
    renderTokens();
  }

  function movePointer(event) {
    if (!pointer) return;
    if (pointer.type === "pan") {
      state.view.panX = pointer.panX + event.clientX - pointer.startX;
      state.view.panY = pointer.panY + event.clientY - pointer.startY;
      applyView();
    }
    if (pointer.type === "token") {
      const rawDx = (event.clientX - pointer.startX) / state.view.zoom;
      const rawDy = (event.clientY - pointer.startY) / state.view.zoom;
      const anchor = pointer.group.find(item => item.id === pointer.id) || pointer.group[0];
      const snappedAnchor = state.snap && anchor ? snapped({x: anchor.x + rawDx, y: anchor.y + rawDy}) : null;
      const dx = snappedAnchor ? snappedAnchor.x - anchor.x : rawDx;
      const dy = snappedAnchor ? snappedAnchor.y - anchor.y : rawDy;
      pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      pointer.group.forEach(start => {
        const token = state.tokens.find(item => item.id === start.id);
        if (!token) return;
        const point = {x: start.x + dx, y: start.y + dy};
        token.x = clamp(point.x, 35, WORLD.width - 35);
        token.y = clamp(point.y, 55, WORLD.height - 55);
        const element = elements.tokenLayer.querySelector(`[data-token-id="${token.id}"]`);
        if (element) {
          element.style.left = `${token.x}px`;
          element.style.top = `${token.y}px`;
        }
      });
    }
    if (pointer.type === "measure") {
      pointer.current = snapped(worldPoint(event));
      drawMeasurement(pointer.start, pointer.current);
    }
  }

  function endPointer() {
    if (!pointer) return;
    if (pointer.type === "token") {
      if (pointer.moved) {
        const moved = pointer.group.length;
        addEvent("Movimento no mapa", moved > 1 ? `${moved} cartas foram reposicionadas.` : "Uma carta foi reposicionada.");
      } else {
        openTokenDialog(pointer.id);
      }
    }
    if (pointer.type === "measure") {
      const distance = measurementDistance(pointer.start, pointer.current);
      setMapStatus(`Distancia: ${distance}`, true);
    }
    elements.tokenLayer.querySelectorAll(".moving").forEach(card => card.classList.remove("moving"));
    elements.mapStage.classList.remove("is-panning");
    pointer = null;
    saveState();
  }

  function drawMeasurement(start, end) {
    elements.measureLayer.setAttribute("viewBox", `0 0 ${WORLD.width} ${WORLD.height}`);
    elements.measureLayer.replaceChildren();
    const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
    line.setAttribute("x1", start.x);
    line.setAttribute("y1", start.y);
    line.setAttribute("x2", end.x);
    line.setAttribute("y2", end.y);
    line.setAttribute("class", "vtt-measure-line");
    const label = document.createElementNS("http://www.w3.org/2000/svg", "text");
    label.setAttribute("x", (start.x + end.x) / 2);
    label.setAttribute("y", (start.y + end.y) / 2 - 12);
    label.setAttribute("text-anchor", "middle");
    label.setAttribute("class", "vtt-measure-label");
    label.textContent = measurementDistance(start, end);
    elements.measureLayer.append(line, label);
  }

  function measurementDistance(start, end) {
    const squares = Math.hypot(end.x - start.x, end.y - start.y) / WORLD.grid;
    return `${(squares * 1.5).toFixed(squares < 1 ? 1 : 0)} m`;
  }

  function createPing(point) {
    const ping = document.createElement("span");
    ping.className = "vtt-ping-effect";
    ping.style.left = `${point.x}px`;
    ping.style.top = `${point.y}px`;
    elements.effectLayer.append(ping);
    setTimeout(() => ping.remove(), 950);
    addEvent(isPlayerMode ? "Marcacao do jogador" : "Marcacao do Mestre", "Um ponto de interesse foi destacado no mapa.");
  }

  function setZoom(value, focusEvent = null) {
    const previous = state.view.zoom;
    const next = clamp(value, .25, 4);
    if (focusEvent && previous !== next) {
      const rect = elements.mapStage.getBoundingClientRect();
      const offsetX = focusEvent.clientX - rect.left - rect.width / 2;
      const offsetY = focusEvent.clientY - rect.top - rect.height / 2;
      state.view.panX -= offsetX / previous * (next - previous);
      state.view.panY -= offsetY / previous * (next - previous);
    }
    state.view.zoom = next;
    applyView();
    saveState();
  }

  function setTool(tool) {
    state.tool = tool;
    renderMap();
    saveState();
  }

  function openTokenDialog(tokenId) {
    const token = state.tokens.find(item => item.id === tokenId);
    if (!token) return;
    const visible = publicEntityView(token);
    const editable = canControlToken(token) && !(isPlayerMode && token.locked);
    const publicPanel = elements.tokenForm.querySelector("[data-token-public]");
    const editor = elements.tokenForm.querySelector("[data-token-editor]");
    const footer = elements.tokenForm.querySelector(":scope > footer");
    publicPanel.hidden = editable;
    editor.hidden = !editable;
    footer.hidden = !editable;
    elements.tokenForm.querySelectorAll("[data-master-only]").forEach(field => { field.hidden = isPlayerMode; });
    elements.tokenForm.elements.tokenId.value = token.id;
    const editableValues = {
      hpCurrent: token.hpCurrent, hpMax: token.hpMax, resourceCurrent: token.resourceCurrent,
      resourceMax: token.resourceMax, armorClass: token.armorClass, status: token.status,
      conditions: token.conditions, buffs: token.buffs, debuffs: token.debuffs, initiative: token.initiative
    };
    Object.entries(editableValues).forEach(([name, value]) => { elements.tokenForm.elements[name].value = editable ? value : ""; });
    if (!isPlayerMode) {
      elements.tokenForm.elements.publicName.value = token.publicName;
      elements.tokenForm.elements.cardKind.value = token.cardKind;
      elements.tokenForm.elements.visibility.value = token.visibility;
      elements.tokenForm.elements.imageVisibility.value = token.imageVisibility;
      elements.tokenForm.elements.masterNotes.value = token.masterNotes;
      elements.tokenForm.elements.weaknesses.value = token.weaknesses;
      elements.tokenForm.elements.resistances.value = token.resistances;
      elements.tokenForm.elements.loot.value = token.loot;
      elements.tokenForm.elements.showLifeState.checked = token.showLifeState;
      elements.tokenForm.elements.shareClassRace.checked = token.shareClassRace;
      elements.tokenForm.elements.locked.checked = token.locked;
    } else {
      elements.tokenForm.elements.publicName.value = "";
      elements.tokenForm.elements.masterNotes.value = "";
      elements.tokenForm.elements.showLifeState.checked = false;
      elements.tokenForm.elements.shareClassRace.checked = false;
      elements.tokenForm.elements.locked.checked = false;
    }
    $("[data-token-dialog-title]").textContent = visible.name;
    $("[data-token-identity]").textContent = [visible.sourceType, visible.className, visible.race].filter(Boolean).join(" / ");
    $("[data-token-public-name]").textContent = visible.name;
    $("[data-token-public-type]").textContent = [visible.sourceType, visible.className, visible.race].filter(Boolean).join(" / ");
    const publicStats = visible.canSeeStats ? [`PV ${visible.hpCurrent}/${visible.hpMax}`, visible.canSeeResource && visible.resourceMax ? `RE ${visible.resourceCurrent}/${visible.resourceMax}` : "", visible.canSeeDefense ? `CA ${visible.armorClass}` : "", visible.status].filter(Boolean).join(" | ") : "";
    $("[data-token-public-state]").textContent = publicStats || visible.narrativeHealth || "Somente informacoes publicas foram liberadas.";
    const preview = $("[data-token-preview]");
    avatarContent(preview, visible);
    elements.tokenDialog.showModal();
  }

  function saveTokenChanges(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(elements.tokenForm).entries());
    const token = state.tokens.find(item => item.id === data.tokenId);
    if (!token) return;
    if (!canControlToken(token)) return blockPlayerAction("Voce nao pode editar este token.");
    token.hpCurrent = Math.max(0, Number(data.hpCurrent || 0));
    token.hpMax = Math.max(0, Number(data.hpMax || 0));
    token.resourceCurrent = Math.max(0, Number(data.resourceCurrent || 0));
    token.resourceMax = Math.max(0, Number(data.resourceMax || 0));
    token.armorClass = Math.max(0, Number(data.armorClass || 0));
    token.status = data.status;
    token.conditions = data.conditions || "";
    token.buffs = data.buffs || "";
    token.debuffs = data.debuffs || "";
    token.initiative = Number(data.initiative || 0);
    if (!isPlayerMode) {
      token.publicName = data.publicName || "";
      token.cardKind = data.cardKind;
      token.visibility = data.visibility;
      token.imageVisibility = data.imageVisibility;
      token.masterNotes = data.masterNotes || "";
      token.weaknesses = data.weaknesses || "";
      token.resistances = data.resistances || "";
      token.loot = data.loot || "";
      token.showLifeState = elements.tokenForm.elements.showLifeState.checked;
      token.shareClassRace = elements.tokenForm.elements.shareClassRace.checked;
      token.locked = elements.tokenForm.elements.locked.checked;
    }
    token.status = healthState(token);
    updateLinkedSheet(token);
    syncInitiative();
    addEvent("Estado atualizado", `${token.name}: ${token.hpCurrent}/${token.hpMax} PV · ${token.status}.`);
    elements.tokenDialog.close();
    buildSources();
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
  }

  function updateLinkedSheet(token) {
    if (token.sourceOrigin !== "sheet") return;
    const sheets = readSheets();
    const changed = sheets.some(sheet => sheet.id === token.sourceId);
    if (!changed) return;
    saveSheets(sheets.map(sheet => sheet.id === token.sourceId ? {...sheet, hpCurrent: token.hpCurrent, hpMax: token.hpMax, resourceCurrent: token.resourceCurrent, resourceMax: token.resourceMax, armorClass: token.armorClass, initiative: token.initiative, conditions: token.conditions, updatedAt: now()} : sheet));
  }

  function openQuickHealth(tokenId, mode = "damage") {
    const token = state.tokens.find(item => item.id === tokenId);
    if (!token || !elements.healthDialog || isPlayerMode) return;
    elements.healthForm.elements.tokenId.value = token.id;
    elements.healthForm.elements.amount.value = 5;
    setHealthMode(mode);
    $("[data-quick-health-target]").textContent = `${token.name} - ${token.hpCurrent}/${token.hpMax} PV${token.tempHp ? ` - ${token.tempHp} de escudo` : ""}`;
    elements.healthDialog.showModal();
    elements.healthForm.elements.amount.select();
  }

  function setHealthMode(mode) {
    const allowed = ["damage", "heal", "shield"];
    const value = allowed.includes(mode) ? mode : "damage";
    elements.healthForm.elements.mode.value = value;
    const labels = {damage: "Aplicar dano", heal: "Aplicar cura", shield: "Escudo temporario"};
    $("[data-quick-health-title]").textContent = labels[value];
    $$('[data-health-mode]').forEach(button => button.classList.toggle("active", button.dataset.healthMode === value));
  }

  function recordCombatAction(detail, publicDetail = detail) {
    const entry = {id: uid("combat"), round: state.initiative.round, detail, publicDetail, createdAt: now()};
    state.combat.history.unshift(entry);
    state.combat.history = state.combat.history.slice(0, 30);
    addEvent("Acao de combate", detail, publicDetail);
  }

  function applyQuickHealth(event) {
    event.preventDefault();
    const token = state.tokens.find(item => item.id === elements.healthForm.elements.tokenId.value);
    if (!token) return;
    const amount = clamp(Math.floor(Number(elements.healthForm.elements.amount.value || 0)), 1, 9999);
    const mode = elements.healthForm.elements.mode.value;
    if (mode === "damage") {
      const absorbed = Math.min(token.tempHp, amount);
      token.tempHp -= absorbed;
      token.hpCurrent = Math.max(0, token.hpCurrent - (amount - absorbed));
      recordCombatAction(`${token.name} sofreu ${amount} de dano${absorbed ? ` (${absorbed} absorvido pelo escudo)` : ""}.`, `Uma criatura sofreu ${amount} de dano.`);
    }
    if (mode === "heal") {
      const before = token.hpCurrent;
      token.hpCurrent = Math.min(token.hpMax, token.hpCurrent + amount);
      recordCombatAction(`${token.name} recuperou ${token.hpCurrent - before} PV.`, `Uma criatura recebeu cura.`);
    }
    if (mode === "shield") {
      token.tempHp += amount;
      recordCombatAction(`${token.name} recebeu ${amount} de escudo temporario.`, `Uma criatura recebeu protecao temporaria.`);
    }
    token.status = healthState(token);
    updateLinkedSheet(token);
    elements.healthDialog.close();
    renderTokens();
    renderRoster();
    renderInitiative();
    renderEvents();
    saveState();
  }

  function openCardSettings() {
    if (isPlayerMode || !elements.settingsDialog) return;
    Object.entries(state.cardSettings).forEach(([name, value]) => {
      const field = elements.settingsForm.elements[name];
      if (!field) return;
      if (field.type === "checkbox") field.checked = Boolean(value);
      else field.value = value;
    });
    elements.settingsDialog.showModal();
  }

  function saveCardSettings(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(elements.settingsForm).entries());
    state.cardSettings = {
      displayMode: data.displayMode === "token" ? "token" : "card",
      showNarrativeHealth: elements.settingsForm.elements.showNarrativeHealth.checked,
      monsterNameMode: ["real", "generic", "hidden"].includes(data.monsterNameMode) ? data.monsterNameMode : "real",
      monsterImageMode: ["real", "silhouette", "hidden"].includes(data.monsterImageMode) ? data.monsterImageMode : "real",
      showAllyHp: elements.settingsForm.elements.showAllyHp.checked
    };
    elements.settingsDialog.close();
    renderMap();
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
  }

  function syncInitiative() {
    const currentEntries = Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
    state.initiative.entries = state.tokens.map(token => {
      const saved = currentEntries.find(entry => entry.tokenId === token.id);
      const value = saved?.value ?? (state.combat.active ? Math.floor(Math.random() * 20) + 1 + Number(token.initiative || 0) : token.initiative || 0);
      return {tokenId: token.id, value: Number(value)};
    }).sort((a, b) => b.value - a.value);
    state.initiative.current = clamp(state.initiative.current, 0, Math.max(0, state.initiative.entries.length - 1));
  }

  function renderInitiative() {
    syncInitiative();
    const entries = state.initiative.entries;
    elements.initiativeList.replaceChildren();
    $("[data-round]").textContent = state.combat.active ? state.initiative.round : 0;
    const current = entries[state.initiative.current];
    const currentToken = current && state.tokens.find(token => token.id === current.tokenId);
    $("[data-turn-name]").textContent = state.combat.active && currentToken ? publicEntityView(currentToken).name : "Aguardando combate";
    $("[data-next-turn]").disabled = isPlayerMode || !state.combat.active;
    $("[data-start-combat]")?.classList.toggle("active", state.combat.active);
    renderCombatHistory();
    if (!state.combat.active || !entries.length) {
      elements.initiativeList.innerHTML = emptyFeed("vtt-sword", "Combate ainda não iniciado", "Adicione personagens ao mapa para montar a ordem de iniciativa.");
      return;
    }
    entries.forEach((entry, index) => {
      const token = state.tokens.find(item => item.id === entry.tokenId);
      if (!token) return;
      const visible = publicEntityView(token);
      const article = document.createElement("article");
      article.className = `vtt-initiative-item${index === state.initiative.current ? " active" : ""}`;
      article.innerHTML = `<b>${index + 1}</b><i></i><div><h3></h3><span></span></div><input type="number" aria-label="Iniciativa">`;
      avatarContent(article.querySelector("i"), visible);
      article.querySelector("h3").textContent = visible.name;
      article.querySelector("span").textContent = visible.status || visible.narrativeHealth || visible.sourceType;
      const input = article.querySelector("input");
      input.value = entry.value;
      input.disabled = isPlayerMode;
      if (!isPlayerMode) {
        input.addEventListener("change", () => {
          entry.value = Number(input.value || 0);
          token.lastInitiativeRoll = entry.value;
          state.initiative.entries.sort((a, b) => b.value - a.value);
          state.initiative.current = 0;
          renderInitiative();
          saveState();
        });
        article.addEventListener("click", event => {
          if (event.target === input) return;
          state.initiative.current = index;
          selectedTokenId = token.id;
          renderInitiative();
          renderTokens();
          saveState();
        });
      }
      elements.initiativeList.append(article);
    });
  }

  function startCombat() {
    if (isPlayerMode) return blockPlayerAction("A iniciativa e controlada pelo Mestre.");
    if (!state.tokens.length) return setMapStatus("Adicione cartas ao mapa antes de iniciar o combate.", false);
    state.tokens.forEach(token => {
      const source = [...sources.heroes, ...sources.creatures].find(item => item.id === token.sourceId && item.origin === token.sourceOrigin);
      const modifier = Number(source?.initiative ?? token.initiative ?? 0);
      token.lastInitiativeRoll = Math.floor(Math.random() * 20) + 1 + modifier;
    });
    state.initiative.entries = state.tokens.map(token => ({tokenId: token.id, value: token.lastInitiativeRoll})).sort((a, b) => b.value - a.value);
    state.initiative.current = 0;
    state.initiative.round = 1;
    state.combat.active = true;
    state.combat.startedAt = now();
    state.combat.history = [];
    const first = state.tokens.find(token => token.id === state.initiative.entries[0]?.tokenId);
    recordCombatAction(`Combate iniciado com ${state.tokens.length} participantes. Primeiro turno: ${first?.name || "indefinido"}.`, `Combate iniciado com ${state.tokens.length} participantes.`);
    renderInitiative();
    renderTokens();
    activateSessionTab("initiative");
    saveState();
  }

  function endCombat() {
    if (isPlayerMode || !state.combat.active) return;
    recordCombatAction(`Combate encerrado na rodada ${state.initiative.round}.`, "O combate foi encerrado.");
    state.combat.active = false;
    state.initiative.round = 0;
    state.initiative.current = 0;
    renderInitiative();
    renderTokens();
    saveState();
  }

  function renderCombatHistory() {
    if (!elements.combatHistory) return;
    elements.combatHistory.replaceChildren();
    state.combat.history.slice(0, 5).forEach(item => {
      const line = document.createElement("li");
      line.textContent = isPlayerMode ? (item.publicDetail || "O combate foi atualizado.") : item.detail;
      elements.combatHistory.append(line);
    });
  }

  function nextTurn() {
    if (isPlayerMode) return blockPlayerAction("O Mestre avanca os turnos da mesa.");
    if (!state.combat.active || !state.initiative.entries.length) return;
    const previous = state.tokens.find(token => token.id === state.initiative.entries[state.initiative.current]?.tokenId);
    state.initiative.current += 1;
    if (state.initiative.current >= state.initiative.entries.length) {
      state.initiative.current = 0;
      state.initiative.round += 1;
      addEvent(`Rodada ${state.initiative.round}`, "Uma nova rodada de combate começou.");
    }
    const currentToken = state.tokens.find(token => token.id === state.initiative.entries[state.initiative.current]?.tokenId);
    recordCombatAction(`Turno de ${previous?.name || "participante"} encerrado. Agora: ${currentToken?.name || "participante"}.`, "O turno avancou para o proximo participante.");
    renderInitiative();
    renderTokens();
    saveState();
  }

  function parseFormula(value) {
    const formula = String(value || "").trim().toLowerCase().replace(/\s+/g, "");
    const match = formula.match(/^(\d{0,2})d(4|6|8|10|12|20|100)([+-]\d+)?$/);
    if (!match) return null;
    const count = clamp(Number(match[1] || 1), 1, 20);
    const sides = Number(match[2]);
    const modifier = Number(match[3] || 0);
    return {formula: `${count}d${sides}${modifier > 0 ? `+${modifier}` : modifier < 0 ? modifier : ""}`, count, sides, modifier};
  }

  function rollDice(formula) {
    const parsed = parseFormula(formula);
    if (!parsed) {
      setMapStatus("Use uma formula como 2d6+3", false);
      return;
    }
    const values = Array.from({length: parsed.count}, () => Math.floor(Math.random() * parsed.sides) + 1);
    const total = values.reduce((sum, value) => sum + value, 0) + parsed.modifier;
    const user = currentUser();
    const roll = {id: uid("roll"), author: user.name, formula: parsed.formula, values, modifier: parsed.modifier, total, critical: parsed.sides === 20 && parsed.count === 1 && values[0] === 20, createdAt: now()};
    state.rolls.unshift(roll);
    state.rolls = state.rolls.slice(0, 60);
    showRollAnimation(roll);
    renderRolls();
    saveState();
  }

  function showRollAnimation(roll) {
    cancelAnimationFrame(showRollAnimation.frame);
    clearTimeout(showRollAnimation.timer);
    elements.rollAnimation.hidden = false;
    elements.rollAnimation.classList.remove("landed", "critical");
    elements.rollAnimation.classList.toggle("critical", roll.critical);
    elements.rollAnimation.querySelector("b").textContent = roll.total;
    elements.rollAnimation.querySelector("span").textContent = `${roll.formula} · ${roll.values.join(" + ")}${roll.modifier ? ` ${roll.modifier > 0 ? "+" : "-"} ${Math.abs(roll.modifier)}` : ""}`;
    const canvas = elements.rollAnimation.querySelector("[data-roll-canvas]");
    const context = canvas.getContext("2d");
    const width = 440;
    const height = 340;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    const duration = reducedMotion ? 420 : 2100;
    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    const goldenRatio = (1 + Math.sqrt(5)) / 2;
    const vertices = [
      [-1, goldenRatio, 0], [1, goldenRatio, 0], [-1, -goldenRatio, 0], [1, -goldenRatio, 0],
      [0, -1, goldenRatio], [0, 1, goldenRatio], [0, -1, -goldenRatio], [0, 1, -goldenRatio],
      [goldenRatio, 0, -1], [goldenRatio, 0, 1], [-goldenRatio, 0, -1], [-goldenRatio, 0, 1]
    ].map(vertex => {
      const length = Math.hypot(...vertex);
      return vertex.map(value => value / length);
    });
    const faces = [
      [0,11,5], [0,5,1], [0,1,7], [0,7,10], [0,10,11],
      [1,5,9], [5,11,4], [11,10,2], [10,7,6], [7,1,8],
      [3,9,4], [3,4,2], [3,2,6], [3,6,8], [3,8,9],
      [4,9,5], [2,4,11], [6,2,10], [8,6,7], [9,8,1]
    ];
    const sparks = Array.from({length: 24}, (_, index) => ({
      angle: index / 24 * Math.PI * 2 + Math.random() * .25,
      distance: 45 + Math.random() * 105,
      size: 1 + Math.random() * 2.3,
      delay: Math.random() * .18
    }));
    const startedAt = performance.now();
    let landed = false;

    const rotateVertex = (vertex, rotationX, rotationY, rotationZ) => {
      let [x, y, z] = vertex;
      const cosX = Math.cos(rotationX), sinX = Math.sin(rotationX);
      [y, z] = [y * cosX - z * sinX, y * sinX + z * cosX];
      const cosY = Math.cos(rotationY), sinY = Math.sin(rotationY);
      [x, z] = [x * cosY + z * sinY, -x * sinY + z * cosY];
      const cosZ = Math.cos(rotationZ), sinZ = Math.sin(rotationZ);
      [x, y] = [x * cosZ - y * sinZ, x * sinZ + y * cosZ];
      return [x, y, z];
    };
    const easeOut = value => 1 - Math.pow(1 - value, 3);
    const bezier = (start, control, end, value) => {
      const inverse = 1 - value;
      return inverse * inverse * start + 2 * inverse * value * control + value * value * end;
    };

    const drawFrame = timestamp => {
      const progress = clamp((timestamp - startedAt) / duration, 0, 1);
      const flightEnd = .62;
      const flight = clamp(progress / flightEnd, 0, 1);
      const bounce = clamp((progress - flightEnd) / (1 - flightEnd), 0, 1);
      const floorY = 226;
      const centerX = progress < flightEnd ? bezier(45, 165, 220, easeOut(flight)) : 220;
      const centerY = progress < flightEnd
        ? bezier(45, -35, 188, flight)
        : 188 - Math.abs(Math.sin(bounce * Math.PI * 3)) * (1 - bounce) * 38;
      const radius = 36 + easeOut(flight) * 28;
      const spinDecay = progress < flightEnd ? progress : flightEnd + easeOut(bounce) * .19;
      const rotationX = .55 + spinDecay * 19.5 + roll.total * .013;
      const rotationY = -.35 + spinDecay * 16.7 + roll.values[0] * .021;
      const rotationZ = .2 + spinDecay * 12.3;
      context.clearRect(0, 0, width, height);

      const landingEnergy = clamp((progress - .48) / .52, 0, 1);
      context.save();
      context.translate(220, floorY + 3);
      context.scale(1, .27);
      const ringGradient = context.createRadialGradient(0, 0, 8, 0, 0, 118);
      ringGradient.addColorStop(0, roll.critical ? "rgba(255,211,105,.24)" : "rgba(178,104,255,.25)");
      ringGradient.addColorStop(.5, "rgba(105,84,224,.08)");
      ringGradient.addColorStop(1, "rgba(70,205,255,0)");
      context.fillStyle = ringGradient;
      context.beginPath();
      context.arc(0, 0, 118 * landingEnergy, 0, Math.PI * 2);
      context.fill();
      context.strokeStyle = roll.critical ? "rgba(255,214,123,.55)" : "rgba(170,107,255,.5)";
      context.lineWidth = 2;
      context.beginPath();
      context.arc(0, 0, 72 + Math.sin(timestamp / 180) * 5, 0, Math.PI * 2);
      context.stroke();
      context.restore();

      const heightAboveFloor = Math.max(0, floorY - centerY - radius * .55);
      const shadowWidth = 24 + (1 - clamp(heightAboveFloor / 180, 0, 1)) * 48;
      const shadow = context.createRadialGradient(centerX, floorY, 2, centerX, floorY, shadowWidth);
      shadow.addColorStop(0, "rgba(0,0,0,.55)");
      shadow.addColorStop(1, "rgba(0,0,0,0)");
      context.fillStyle = shadow;
      context.beginPath();
      context.ellipse(centerX, floorY, shadowWidth, shadowWidth * .22, 0, 0, Math.PI * 2);
      context.fill();

      if (progress > .48) {
        sparks.forEach(spark => {
          const sparkProgress = clamp((landingEnergy - spark.delay) / Math.max(.1, 1 - spark.delay), 0, 1);
          if (!sparkProgress || sparkProgress === 1) return;
          const distance = spark.distance * easeOut(sparkProgress);
          const x = 220 + Math.cos(spark.angle) * distance;
          const y = floorY + Math.sin(spark.angle) * distance * .3 - Math.sin(sparkProgress * Math.PI) * 28;
          context.globalAlpha = (1 - sparkProgress) * .9;
          context.fillStyle = roll.critical ? "#ffe09a" : (spark.angle > Math.PI ? "#65dfff" : "#c187ff");
          context.beginPath();
          context.arc(x, y, spark.size, 0, Math.PI * 2);
          context.fill();
        });
        context.globalAlpha = 1;
      }

      const rotated = vertices.map(vertex => rotateVertex(vertex, rotationX, rotationY, rotationZ));
      const focalLength = 360;
      const projected = rotated.map(([x, y, z]) => {
        const depthScale = focalLength / (focalLength - z * radius);
        return {x: centerX + x * radius * depthScale, y: centerY + y * radius * depthScale, z};
      });
      const sortedFaces = faces.map(indices => ({
        indices,
        depth: indices.reduce((sum, index) => sum + rotated[index][2], 0) / 3
      })).sort((left, right) => left.depth - right.depth);

      sortedFaces.forEach(({indices, depth}, faceIndex) => {
        const [a, b, c] = indices.map(index => projected[index]);
        const area = (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
        const front = area < 0;
        const light = clamp((depth + 1) / 2, 0, 1);
        context.beginPath();
        context.moveTo(a.x, a.y);
        context.lineTo(b.x, b.y);
        context.lineTo(c.x, c.y);
        context.closePath();
        const hue = roll.critical ? 39 : 258 + faceIndex % 3 * 9;
        const saturation = roll.critical ? 82 : 75;
        const luminosity = front ? 14 + light * 22 : 8 + light * 8;
        context.fillStyle = `hsla(${hue}, ${saturation}%, ${luminosity}%, ${front ? .96 : .28})`;
        context.fill();
        context.strokeStyle = roll.critical
          ? `rgba(255, ${190 + Math.round(light * 50)}, 100, ${front ? .85 : .24})`
          : `rgba(${110 + Math.round(light * 75)}, ${95 + Math.round(light * 80)}, 255, ${front ? .82 : .22})`;
        context.lineWidth = front ? 1.6 : .7;
        context.stroke();
      });

      const glow = context.createRadialGradient(centerX, centerY, 4, centerX, centerY, radius * 1.25);
      glow.addColorStop(0, roll.critical ? "rgba(255,231,157,.42)" : "rgba(219,164,255,.36)");
      glow.addColorStop(1, "rgba(106,80,219,0)");
      context.globalCompositeOperation = "screen";
      context.fillStyle = glow;
      context.beginPath();
      context.arc(centerX, centerY, radius * 1.25, 0, Math.PI * 2);
      context.fill();
      context.globalCompositeOperation = "source-over";

      if (progress > .84) {
        const reveal = clamp((progress - .84) / .12, 0, 1);
        context.globalAlpha = reveal;
        context.fillStyle = roll.critical ? "#fff0bd" : "#ffffff";
        context.font = `800 ${Math.round(25 + reveal * 7)}px Cinzel, serif`;
        context.textAlign = "center";
        context.textBaseline = "middle";
        context.shadowColor = roll.critical ? "#ffc95e" : "#b36fff";
        context.shadowBlur = 16;
        context.fillText(String(roll.total), centerX, centerY + 1);
        context.shadowBlur = 0;
        context.globalAlpha = 1;
      }

      if (progress >= .78 && !landed) {
        landed = true;
        elements.rollAnimation.classList.add("landed");
      }
      if (progress < 1) showRollAnimation.frame = requestAnimationFrame(drawFrame);
    };

    showRollAnimation.frame = requestAnimationFrame(drawFrame);
    showRollAnimation.timer = setTimeout(() => {
      elements.rollAnimation.hidden = true;
      elements.rollAnimation.classList.remove("landed", "critical");
    }, duration + 1450);
  }

  function renderRolls() {
    elements.rollList.replaceChildren();
    if (!state.rolls.length) {
      elements.rollList.innerHTML = emptyFeed("vtt-d20", "Nenhuma rolagem", "Use os dados na parte inferior do mapa para começar.");
      return;
    }
    state.rolls.forEach(roll => {
      const article = document.createElement("article");
      article.className = `vtt-roll-entry${roll.critical ? " critical" : ""}`;
      article.innerHTML = `<b></b><div><h3></h3><p></p></div><time></time>`;
      article.querySelector("b").textContent = roll.total;
      article.querySelector("h3").textContent = `${roll.author} · ${roll.formula}`;
      article.querySelector("p").textContent = `${roll.values.join(" + ")}${roll.modifier ? ` ${roll.modifier > 0 ? "+" : "-"} ${Math.abs(roll.modifier)}` : ""}${roll.critical ? " · CRÍTICO" : ""}`;
      article.querySelector("time").textContent = formatTime(roll.createdAt);
      elements.rollList.append(article);
    });
  }

  function sendChat(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const message = form.elements.message.value.trim();
    if (!message) return;
    const user = currentUser();
    state.chat.push({id: uid("message"), author: user.name, avatar: user.avatar, message, scope: form.elements.scope.value, createdAt: now()});
    state.chat = state.chat.slice(-100);
    form.elements.message.value = "";
    renderChat();
    saveState();
  }

  function renderChat() {
    elements.chatList.replaceChildren();
    const visibleMessages = state.chat.filter(message => !isPlayerMode || message.scope !== "master");
    if (!visibleMessages.length) {
      elements.chatList.innerHTML = emptyFeed("vtt-chat", "A mesa está em silêncio", "Mensagens, anúncios e decisões da sessão aparecerão aqui.");
      return;
    }
    visibleMessages.forEach(message => {
      const article = document.createElement("article");
      article.className = `vtt-message${message.scope === "master" ? " private" : ""}`;
      article.innerHTML = `<span class="vtt-message-avatar"></span><div><header><h3></h3><time></time></header><p></p></div>`;
      avatarContent(article.querySelector(".vtt-message-avatar"), {name: message.author, avatar: message.avatar});
      article.querySelector("h3").textContent = `${message.author}${message.scope === "master" ? " · privado" : ""}`;
      article.querySelector("time").textContent = formatTime(message.createdAt);
      article.querySelector("p").textContent = message.message;
      elements.chatList.append(article);
    });
    elements.chatList.scrollTop = elements.chatList.scrollHeight;
  }

  function addEvent(title, detail, publicDetail = "") {
    state.events.unshift({id: uid("event"), title, detail, publicDetail, createdAt: now()});
    state.events = state.events.slice(0, 80);
    renderEvents();
  }

  function renderEvents() {
    elements.eventList.replaceChildren();
    if (!state.events.length) {
      elements.eventList.innerHTML = emptyFeed("vtt-scroll", "Nenhum evento registrado", "Movimentos, turnos e mudanças importantes serão guardados aqui.");
      return;
    }
    state.events.forEach(item => {
      const article = document.createElement("article");
      article.className = "vtt-event-entry";
      article.innerHTML = `<h3></h3><p></p><time></time>`;
      article.querySelector("h3").textContent = item.title;
      const publicDetails = {
        "Token adicionado": "Uma nova presenca entrou no mapa.",
        "Token removido": "Uma presenca saiu do mapa.",
        "Movimento no mapa": "Cartas foram reposicionadas.",
        "Estado atualizado": "O estado de uma carta foi atualizado."
      };
      article.querySelector("p").textContent = isPlayerMode ? (publicDetails[item.title] || item.publicDetail || "A mesa foi atualizada pelo Mestre.") : item.detail;
      article.querySelector("time").textContent = formatTime(item.createdAt);
      elements.eventList.append(article);
    });
  }

  function emptyFeed(icon, title, text) {
    return `<div class="vtt-feed-empty"><svg><use href="#${icon}"></use></svg><b>${title}</b><span>${text}</span></div>`;
  }

  function activateSessionTab(name, persist = true) {
    state.sessionTab = name;
    $$('[data-session-tab]').forEach(button => button.classList.toggle("active", button.dataset.sessionTab === name));
    $$('[data-tab-panel]').forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === name));
    if (persist) saveState();
  }

  function renderNotes() {
    $$('[data-table-note]').forEach(area => {
      area.value = state.notes[area.dataset.tableNote] || "";
    });
  }

  function saveNote(area) {
    state.notes[area.dataset.tableNote] = area.value;
    writeStore(KEYS.notes, {...state.notes, campaignId: campaign.id});
    saveState();
  }

  function sharePublicNote() {
    if (isPlayerMode) return blockPlayerAction("Somente o Mestre publica avisos oficiais.");
    const message = state.notes.public.trim();
    if (!message) return;
    const user = currentUser();
    state.chat.push({id: uid("message"), author: user.name, avatar: user.avatar, message, scope: "group", createdAt: now()});
    activateSessionTab("chat");
    renderChat();
    saveState();
  }

  function togglePanel(name) {
    const className = `${name}-collapsed`;
    body.classList.toggle(className);
  }

  function generatedPortrait(name, kind = "NPC") {
    const initialsValue = initials(name).replace(/[&<>"]/g, character => ({"&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;"}[character]));
    const hue = [...String(name)].reduce((sum, char) => sum + char.charCodeAt(0), 0) % 80 + (kind === "Monstros" ? 300 : 210);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="480" height="600" viewBox="0 0 480 600"><defs><radialGradient id="g"><stop stop-color="hsl(${hue} 72% 48%)"/><stop offset="1" stop-color="#090711"/></radialGradient></defs><rect width="480" height="600" fill="url(#g)"/><circle cx="240" cy="245" r="126" fill="#090711" opacity=".64"/><path d="M110 540c20-130 240-130 260 0" fill="#120d20"/><text x="240" y="285" text-anchor="middle" fill="#f0ddff" font-family="serif" font-size="104" font-weight="700">${initialsValue}</text><circle cx="240" cy="245" r="160" fill="none" stroke="#c27cff" stroke-width="4" opacity=".65"/></svg>`;
    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function saveQuickLibraryItem(item) {
    const ownerId = window.ApexMvpStore?.ownerId?.() || "";
    const all = readStore(KEYS.library, []);
    const normalized = {...item, id: item.id || uid("lib"), ownerId, campaignId: item.campaignId ?? campaign.id, system: item.system || campaign.system, createdAt: item.createdAt || now(), updatedAt: now()};
    writeStore(KEYS.library, [normalized, ...all]);
    buildSources();
    return normalized;
  }

  function openQuickCreate(type, preset = {}) {
    if (isPlayerMode || !elements.createDialog) return;
    elements.createForm.reset();
    elements.createForm.elements.type.value = type;
    elements.createForm.elements.name.value = preset.name || "";
    elements.createForm.elements.level.value = preset.level || 1;
    elements.createForm.elements.biome.value = preset.biome || "Qualquer";
    elements.createForm.elements.profession.value = preset.profession || "";
    elements.createForm.elements.personality.value = preset.personality || "";
    elements.createForm.elements.description.value = preset.description || preset.shortHistory || "";
    elements.createForm.elements.attributes.value = preset.attributes || "";
    $("[data-quick-create-title]").textContent = `Novo ${type === "NPCs" ? "NPC" : type.replace(/s$/, "")}`;
    elements.createDialog.showModal();
    elements.createForm.elements.name.focus();
  }

  function submitQuickCreate(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(elements.createForm).entries());
    const isEntity = data.type === "NPCs" || data.type === "Monstros";
    const item = saveQuickLibraryItem({
      name: data.name.trim(), type: data.type, level: Number(data.level || 1), biome: data.biome,
      profession: data.profession.trim(), personality: data.personality.trim(), description: data.description.trim(),
      shortHistory: data.description.trim(), attributes: data.attributes.trim(), abilities: "", tags: [data.biome, data.profession].filter(Boolean).join(", "),
      visibility: isEntity ? "Disponivel na mesa" : "Privado do Mestre", image: isEntity ? generatedPortrait(data.name, data.type) : ""
    });
    elements.createDialog.close();
    if (isEntity) {
      const source = sources.creatures.find(entry => entry.id === item.id);
      if (source) addSourceToMap(source);
    } else {
      const snippet = `[${item.type}] ${item.name}\n${item.description || "Sem descricao."}`;
      state.notes.private = [state.notes.private, snippet].filter(Boolean).join("\n\n");
      addEvent(`${item.type} criado`, `${item.name} foi preparado durante a sessao.`);
      renderNotes();
      saveState();
    }
    renderRoster();
  }

  function generateRandomNpc() {
    const names = ["Aldren Voss", "Mira Valebris", "Toren Brumafria", "Selene Arkwright", "Bram Ferrovelho", "Ilyra do Luar"];
    const professions = ["Cartografo", "Mercadora de reliquias", "Ferreiro", "Curandeira", "Capitao da guarda", "Arcanista itinerante"];
    const personalities = ["Cauteloso e observador", "Carismatica, mas desconfiada", "Direto e leal", "Curiosa e inquieta", "Severo com um senso de honra", "Gentil e cheio de segredos"];
    const pick = list => list[Math.floor(Math.random() * list.length)];
    openQuickCreate("NPCs", {name: pick(names), profession: pick(professions), personality: pick(personalities), biome: "Cidade", description: "Conhece rumores locais e pode se tornar aliado, contato ou obstaculo da campanha.", attributes: "PV: 18 | CA: 12 | Iniciativa: 1"});
  }

  function generateRandomEncounter() {
    if (isPlayerMode) return;
    const encounter = [
      ...Array.from({length: 3}, (_, index) => ({name: `Goblin Batedor ${index + 1}`, tags: "goblin, hostil", attributes: "PV: 12 | CA: 13 | Iniciativa: 2", level: 1, cardKind: "monster"})),
      {name: "Goblin Xama", tags: "goblin, elite, hostil", attributes: "PV: 28 | CA: 14 | Iniciativa: 1", level: 2, cardKind: "elite", abilities: "Pulso sombrio; Cura tribal"}
    ];
    encounter.forEach((preset, index) => setTimeout(() => {
      const item = saveQuickLibraryItem({...preset, type: "Monstros", biome: "Floresta", description: "Inimigo gerado para encontro rapido.", visibility: "Disponivel na mesa", image: generatedPortrait(preset.name, "Monstros")});
      const source = sources.creatures.find(entry => entry.id === item.id);
      if (source) addSourceToMap(source);
    }, index * 320));
    addEvent("Encontro gerado", "3 Goblins Batedores e 1 Goblin Xama foram posicionados na mesa.", "Um novo encontro surgiu no mapa.");
    setMapStatus("Encontro sendo invocado no mapa...", true);
  }

  function consumePendingResource() {
    if (isPlayerMode) return;
    const pending = readStore(KEYS.pendingResource, {});
    if (!pending.id || (pending.campaignId && pending.campaignId !== campaign.id)) return;
    localStorage.removeItem(KEYS.pendingResource);
    if (pending.kind === "map") {
      const map = sources.maps.find(item => item.id === pending.id);
      if (map) useResource({...map, kind: "map"});
      return;
    }
    const source = sources.creatures.find(item => item.id === pending.id);
    if (source) addSourceToMap(source, true);
  }

  function openResources(tab = "maps") {
    resourceTab = tab;
    renderResources();
    elements.resourceDialog.showModal();
  }

  function renderResources() {
    $$('[data-resource-tab]').forEach(button => button.classList.toggle("active", button.dataset.resourceTab === resourceTab));
    elements.resourceGrid.replaceChildren();
    let items = [];
    if (resourceTab === "maps") items = sources.maps.map(item => ({...item, kind: "map"}));
    if (resourceTab === "heroes") items = sources.heroes.map(item => ({...item, kind: "token"}));
    if (resourceTab === "creatures") items = sources.creatures.map(item => ({...item, kind: "token"}));
    if (resourceTab === "library") items = sources.library.filter(item => !["Mapas", "Monstros", "NPCs"].includes(item.type)).map(item => ({...item, kind: "library"}));
    if (!items.length) {
      elements.resourceGrid.innerHTML = `<div class="vtt-resource-empty"><svg><use href="#vtt-book"></use></svg><b>Nenhum conteúdo nesta categoria</b><span>Prepare recursos nas áreas de Biblioteca e Fichas.</span></div>`;
      return;
    }
    items.forEach(item => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "vtt-resource-card";
      button.innerHTML = `<div class="vtt-resource-art"></div><div><h3></h3><p></p><b></b></div>`;
      const art = button.querySelector(".vtt-resource-art");
      avatarContent(art, item);
      if (!art.querySelector("img")) art.innerHTML = `<svg><use href="#${item.kind === "map" ? "vtt-image" : item.kind === "token" ? "vtt-users" : "vtt-book"}"></use></svg>`;
      button.querySelector("h3").textContent = item.name;
      button.querySelector("p").textContent = item.description || item.className || item.type || "Recurso da campanha";
      button.querySelector("b").textContent = item.kind === "map" ? "Usar como cena" : item.kind === "token" ? (state.tokens.some(token => token.sourceId === item.id && token.sourceOrigin === item.origin) ? "Já está no mapa" : "Adicionar ao mapa") : "Levar para notas";
      button.addEventListener("click", () => useResource(item));
      elements.resourceGrid.append(button);
    });
  }

  function useResource(item) {
    if (item.kind === "map") {
      state.scene = {id: item.id, name: item.name, image: item.image};
      state.view = {panX: 0, panY: 0, zoom: 1};
      addEvent("Cena alterada", `${item.name} foi aberta na mesa.`);
      $("[data-scene-name]").textContent = item.name;
      renderMap();
    }
    if (item.kind === "token") addSourceToMap(item);
    if (item.kind === "library") {
      const snippet = `[${item.type}] ${item.name}\n${item.description || "Sem descrição."}`;
      state.notes.private = [state.notes.private, snippet].filter(Boolean).join("\n\n");
      addEvent("Recurso consultado", `${item.name} foi adicionado às notas privadas.`);
      renderNotes();
    }
    saveState();
    elements.resourceDialog.close();
  }

  function prepareUploadedMap(file) {
    return new Promise((resolve, reject) => {
      if (!file?.type.startsWith("image/")) return reject(new Error("Arquivo inválido"));
      if (file.size > 10 * 1024 * 1024) return reject(new Error("Imagem maior que 10 MB"));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Falha ao ler a imagem"));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("Imagem inválida"));
        image.onload = () => {
          const scale = Math.min(1, 1800 / image.width, 1200 / image.height);
          const canvas = document.createElement("canvas");
          canvas.width = Math.max(1, Math.round(image.width * scale));
          canvas.height = Math.max(1, Math.round(image.height * scale));
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/webp", .78));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function uploadMap(file) {
    if (!file) return;
    setMapStatus("Preparando novo mapa...", true);
    try {
      const image = await prepareUploadedMap(file);
      const scene = {id: uid("scene"), name: file.name.replace(/\.[^.]+$/, ""), image, description: "Mapa enviado para esta sessão", origin: "upload"};
      state.scenes.unshift(scene);
      state.scenes = state.scenes.slice(0, 4);
      buildSources();
      useResource({...scene, kind: "map"});
      setMapStatus("Novo mapa carregado", true);
    } catch (error) {
      setMapStatus(error.message || "Não foi possível carregar", false);
    }
  }

  function bindEvents() {
    elements.campaignSelect.addEventListener("change", () => selectCampaign(elements.campaignSelect.value));
    $$('[data-toggle-panel]').forEach(button => button.addEventListener("click", () => togglePanel(button.dataset.togglePanel)));
    $$('[data-roster-tab]').forEach(button => button.addEventListener("click", () => activateRosterTab(button.dataset.rosterTab)));
    $$('[data-session-tab]').forEach(button => button.addEventListener("click", () => activateSessionTab(button.dataset.sessionTab)));
    $$('[data-tool]').forEach(button => button.addEventListener("click", () => setTool(button.dataset.tool)));
    $$('[data-roll]').forEach(button => button.addEventListener("click", () => rollDice(button.dataset.roll)));
    $$('[data-zoom]').forEach(button => button.addEventListener("click", () => setZoom(state.view.zoom + Number(button.dataset.zoom))));

    $("[data-grid-toggle]").addEventListener("click", () => { state.grid = !state.grid; renderMap(); saveState(); });
    $("[data-snap-toggle]").addEventListener("click", () => {
      if (isPlayerMode) return blockPlayerAction("Encaixe de tokens e controlado pelo Mestre.");
      state.snap = !state.snap; renderMap(); saveState();
    });
    $("[data-fog-toggle]").addEventListener("click", () => {
      if (isPlayerMode) return blockPlayerAction("A neblina da cena e controlada pelo Mestre.");
      state.fog = !state.fog; renderMap(); addEvent("Neblina ajustada", state.fog ? "A visão da cena foi reduzida." : "A cena completa foi revelada."); saveState();
    });
    $("[data-zoom-preset]")?.addEventListener("change", event => setZoom(Number(event.target.value || 1)));
    $("[data-session-toggle]").addEventListener("click", () => {
      if (isPlayerMode) return blockPlayerAction("A sessao e iniciada pelo Mestre.");
      state.live = !state.live; addEvent(state.live ? "Sessão iniciada" : "Sessão encerrada", state.live ? "A mesa está ao vivo para o grupo." : "O registro da sessão foi pausado."); renderSessionButton(); saveState();
    });
    $("[data-open-library]").addEventListener("click", () => isPlayerMode ? blockPlayerAction("Biblioteca completa e ferramenta do Mestre.") : openResources());
    $("[data-card-settings]")?.addEventListener("click", openCardSettings);
    $("[data-fullscreen]").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.());
    $("[data-roll-form]").addEventListener("submit", event => { event.preventDefault(); rollDice(event.currentTarget.elements.formula.value); event.currentTarget.elements.formula.select(); });
    $("[data-chat-form]").addEventListener("submit", sendChat);
    $("[data-start-combat]")?.addEventListener("click", startCombat);
    $("[data-end-combat]")?.addEventListener("click", endCombat);
    $("[data-next-turn]").addEventListener("click", nextTurn);
    $("[data-clear-rolls]").addEventListener("click", () => { state.rolls = []; renderRolls(); saveState(); });
    $("[data-clear-events]").addEventListener("click", () => { state.events = []; renderEvents(); saveState(); });
    $("[data-share-note]").addEventListener("click", sharePublicNote);
    $$('[data-table-note]').forEach(area => area.addEventListener("input", () => saveNote(area)));

    elements.mapStage.addEventListener("pointerdown", beginPointer);
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", endPointer);
    elements.mapStage.addEventListener("wheel", event => {
      event.preventDefault();
      setZoom(state.view.zoom + (event.deltaY > 0 ? -.1 : .1), event);
    }, {passive: false});

    elements.tokenForm.addEventListener("submit", saveTokenChanges);
    $("[data-close-token]").addEventListener("click", () => elements.tokenDialog.close());
    $("[data-remove-token]").addEventListener("click", () => {
      const id = elements.tokenForm.elements.tokenId.value;
      elements.tokenDialog.close();
      removeToken(id);
    });
    elements.tokenDialog.addEventListener("click", event => { if (event.target === elements.tokenDialog) elements.tokenDialog.close(); });
    elements.settingsForm?.addEventListener("submit", saveCardSettings);
    $$('[data-close-card-settings]').forEach(button => button.addEventListener("click", () => elements.settingsDialog.close()));
    elements.settingsDialog?.addEventListener("click", event => { if (event.target === elements.settingsDialog) elements.settingsDialog.close(); });
    elements.healthForm?.addEventListener("submit", applyQuickHealth);
    $$('[data-health-mode]').forEach(button => button.addEventListener("click", () => setHealthMode(button.dataset.healthMode)));
    $$('[data-close-quick-health]').forEach(button => button.addEventListener("click", () => elements.healthDialog.close()));
    elements.healthDialog?.addEventListener("click", event => { if (event.target === elements.healthDialog) elements.healthDialog.close(); });
    elements.createForm?.addEventListener("submit", submitQuickCreate);
    $$('[data-close-quick-create]').forEach(button => button.addEventListener("click", () => elements.createDialog.close()));
    elements.createDialog?.addEventListener("click", event => { if (event.target === elements.createDialog) elements.createDialog.close(); });
    $$('[data-quick-create]').forEach(button => button.addEventListener("click", () => openQuickCreate(button.dataset.quickCreate)));
    $("[data-generate-npc]")?.addEventListener("click", generateRandomNpc);
    $("[data-generate-encounter]")?.addEventListener("click", generateRandomEncounter);
    $("[data-dock-toggle]")?.addEventListener("click", () => body.classList.toggle("master-dock-collapsed"));
    $$('[data-layer-toggle]').forEach(input => input.addEventListener("change", () => { state.layers[input.dataset.layerToggle] = input.checked; renderMap(); saveState(); }));
    $$('[data-marker-type]').forEach(button => button.addEventListener("click", () => {
      markerType = button.dataset.markerType;
      $$('[data-marker-type]').forEach(item => item.classList.toggle("active", item === button));
      setTool("marker");
    }));

    $("[data-close-dialog]").addEventListener("click", () => elements.resourceDialog.close());
    elements.resourceDialog.addEventListener("click", event => { if (event.target === elements.resourceDialog) elements.resourceDialog.close(); });
    $$('[data-resource-tab]').forEach(button => button.addEventListener("click", () => { resourceTab = button.dataset.resourceTab; renderResources(); }));
    $("[data-map-upload]").addEventListener("change", event => {
      if (isPlayerMode) blockPlayerAction("Upload de mapas e exclusivo do Mestre.");
      else uploadMap(event.target.files?.[0]);
      event.target.value = "";
    });

    window.addEventListener("keydown", event => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === "Space") { spacePressed = true; event.preventDefault(); }
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "m") setTool("measure");
      if (event.key.toLowerCase() === "p") setTool("ping");
      if (event.key.toLowerCase() === "g") { state.grid = !state.grid; renderMap(); saveState(); }
      if (event.key === "+" || event.key === "=") setZoom(state.view.zoom + .1);
      if (event.key === "-") setZoom(state.view.zoom - .1);
      if (event.key === "Escape") { selectedTokenId = ""; selectedTokenIds.clear(); elements.measureLayer.replaceChildren(); renderTokens(); }
    });
    window.addEventListener("keyup", event => { if (event.code === "Space") spacePressed = false; });
  }

  function initialize() {
    if (isPlayerMode) body.classList.add("player-table-mode");
    if (window.innerWidth <= 900) body.classList.add("roster-collapsed", "session-collapsed");
    if (!populateCampaigns()) return;
    bindEvents();
    consumePendingResource();
  }

  initialize();
})();
