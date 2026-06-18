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
    activeCampaign: "apex-realms-table-campaign"
  };
  const WORLD = {width: 1600, height: 1000, grid: 50};
  const body = document.body;
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
    const primary = readStore(KEYS.campaigns, []);
    const values = primary.length ? primary : readStore(KEYS.campaignsAlias, []);
    return values.filter(campaign => !campaign.archived).map(campaign => ({
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
      version: 2,
      live: false,
      scene: {id: "ruins", name: "Ruinas arcanas", image: "../assets/ruins-map.jpg"},
      scenes: [],
      view: {panX: 0, panY: 0, zoom: 1},
      tool: "select",
      grid: true,
      snap: false,
      fog: false,
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
  let pointer = null;
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
      initiative: {...fallback.initiative, ...(saved.initiative || {})},
      notes: {...fallback.notes, ...(saved.notes || {})},
      tokens: Array.isArray(saved.tokens) ? saved.tokens : [],
      chat: Array.isArray(saved.chat) ? saved.chat : [],
      rolls: Array.isArray(saved.rolls) ? saved.rolls : [],
      events: Array.isArray(saved.events) ? saved.events : fallback.events,
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
    const profile = readStore(KEYS.profile, {});
    return {
      name: profile.displayName || account.name || account.nickname || "Mestre",
      avatar: String(profile.avatar || account.avatar || "").startsWith("data:image/") ? (profile.avatar || account.avatar) : ""
    };
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
    const allPlayers = readStore(KEYS.players, []);
    const sheets = readSheets();
    const library = readStore(KEYS.library, []);
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
    return {
      id: raw.id || uid("source"),
      origin,
      playerId: raw.playerId || "",
      name: raw.name || "Sem nome",
      type: raw.type || "NPC",
      owner: raw.owner || "Mestre",
      portrait: raw.portrait || raw.avatar || raw.image || "",
      className: raw.className || raw.race || raw.type || "Aventureiro",
      level: Number(raw.level || 1),
      hpCurrent: Number(raw.hpCurrent ?? raw.hp ?? 0),
      hpMax: Number(raw.hpMax ?? raw.hp ?? 0),
      resourceCurrent: Number(raw.resourceCurrent ?? raw.manaCurrent ?? 0),
      resourceMax: Number(raw.resourceMax ?? raw.manaMax ?? 0),
      armorClass: Number(raw.armorClass || 10),
      initiative: Number(raw.initiative || 0),
      status: raw.status || "Pronto",
      connected: Boolean(raw.connected),
      permissions: raw.permissions || {},
      description: raw.description || raw.concept || ""
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
      return {...token, name: source.name, portrait: source.portrait, className: source.className, sourceType: source.type};
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
    button.querySelector("span").textContent = state.live ? "Encerrar sessao" : "Iniciar sessao";
    setMapStatus(state.live ? "Sessao ao vivo" : "Cena pronta", true);
  }

  function applyView() {
    elements.mapWorld.style.transform = `translate(-50%, -50%) translate(${state.view.panX}px, ${state.view.panY}px) scale(${state.view.zoom})`;
    $("[data-zoom-label]").textContent = `${Math.round(state.view.zoom * 100)}%`;
  }

  function renderMap() {
    const image = state.scene.image || "../assets/ruins-map.jpg";
    elements.mapImage.style.backgroundImage = `url("${image}")`;
    elements.mapArea.classList.toggle("grid-off", !state.grid);
    elements.mapArea.classList.toggle("fog-on", state.fog);
    $("[data-grid-toggle]").classList.toggle("active", state.grid);
    $("[data-snap-toggle]").classList.toggle("active", state.snap);
    $("[data-fog-toggle]").classList.toggle("active", state.fog);
    $$('[data-tool]').forEach(button => button.classList.toggle("active", button.dataset.tool === state.tool));
    elements.mapStage.className = `vtt-map-stage tool-${state.tool}`;
    applyView();
  }

  function rosterCard(source) {
    const article = document.createElement("article");
    article.className = "vtt-roster-card";
    const token = state.tokens.find(item => item.sourceId === source.id && item.sourceOrigin === source.origin);
    const hpMax = Math.max(0, source.hpMax);
    const hpCurrent = clamp(source.hpCurrent, 0, hpMax || source.hpCurrent || 0);
    const hpPercent = hpMax ? Math.round(hpCurrent / hpMax * 100) : 0;
    const resourceMax = Math.max(0, source.resourceMax);
    const resourcePercent = resourceMax ? Math.round(source.resourceCurrent / resourceMax * 100) : 0;
    article.innerHTML = `<span class="vtt-roster-avatar"><i></i></span><div class="vtt-roster-main"><header><h3></h3><span></span></header><p></p><div class="vtt-vital-row"><span>PV</span><span class="vtt-vital-track"><i></i></span><b></b></div>${resourceMax ? '<div class="vtt-vital-row mana"><span>RE</span><span class="vtt-vital-track"><i></i></span><b></b></div>' : ""}</div><button class="vtt-roster-add" type="button" aria-label="Adicionar ao mapa"><svg><use href="#vtt-plus"></use></svg></button>`;
    avatarContent(article.querySelector(".vtt-roster-avatar"), source);
    const online = document.createElement("i");
    if (source.connected) article.querySelector(".vtt-roster-avatar").append(online);
    article.querySelector("h3").textContent = source.name;
    article.querySelector("header span").textContent = source.type === "Personagem" ? `Nv. ${source.level}` : source.type;
    article.querySelector("p").textContent = [source.className, source.owner !== "Mestre" ? source.owner : ""].filter(Boolean).join(" · ") || source.type;
    article.querySelector(".vtt-vital-row i").style.width = `${hpPercent}%`;
    article.querySelector(".vtt-vital-row b").textContent = hpMax ? `${hpCurrent}/${hpMax}` : "--";
    if (resourceMax) {
      article.querySelector(".vtt-vital-row.mana i").style.width = `${resourcePercent}%`;
      article.querySelector(".vtt-vital-row.mana b").textContent = `${source.resourceCurrent}/${resourceMax}`;
    }
    const add = article.querySelector(".vtt-roster-add");
    add.classList.toggle("on-map", Boolean(token));
    add.setAttribute("aria-label", token ? "Remover do mapa" : "Adicionar ao mapa");
    add.querySelector("use").setAttribute("href", token ? "#vtt-minus" : "#vtt-plus");
    add.addEventListener("click", () => token ? removeToken(token.id) : addSourceToMap(source));
    article.addEventListener("dblclick", () => {
      if (token) openTokenDialog(token.id);
      else addSourceToMap(source, true);
    });
    return article;
  }

  function renderRoster() {
    const list = state.rosterTab === "creatures" ? sources.creatures : sources.heroes;
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
      name: source.name,
      portrait: source.portrait,
      className: source.className,
      x: 650 + (count % 6) * 60,
      y: 430 + Math.floor(count / 6) * 70,
      hpCurrent: source.hpCurrent,
      hpMax: source.hpMax,
      initiative: source.initiative,
      status: source.type === "Monstro" ? "Hostil" : "Pronto"
    };
    state.tokens.push(token);
    addEvent("Token adicionado", `${source.name} entrou no mapa.`);
    syncInitiative();
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
    if (openAfter) openTokenDialog(token.id);
  }

  function removeToken(tokenId) {
    const token = state.tokens.find(item => item.id === tokenId);
    state.tokens = state.tokens.filter(item => item.id !== tokenId);
    selectedTokenId = "";
    syncInitiative();
    if (token) addEvent("Token removido", `${token.name} saiu do mapa.`);
    renderTokens();
    renderRoster();
    renderInitiative();
    saveState();
  }

  function renderTokens() {
    elements.tokenLayer.replaceChildren();
    state.tokens.forEach(token => {
      const button = document.createElement("button");
      button.type = "button";
      const typeClass = token.sourceType === "Monstro" ? "hostile" : token.sourceType === "NPC" ? "npc" : "friendly";
      button.className = `vtt-token ${typeClass}${selectedTokenId === token.id ? " selected" : ""}`;
      button.dataset.tokenId = token.id;
      button.style.left = `${token.x}px`;
      button.style.top = `${token.y}px`;
      button.title = `${token.name} · duplo clique para editar`;
      if (token.portrait) {
        const image = document.createElement("img");
        image.src = token.portrait;
        image.alt = "";
        button.append(image);
      } else {
        const label = document.createElement("b");
        label.textContent = initials(token.name);
        button.append(label);
      }
      const name = document.createElement("span");
      name.className = "vtt-token-name";
      name.textContent = token.name;
      button.append(name);
      if (token.hpMax > 0) {
        const hp = document.createElement("span");
        hp.className = "vtt-token-hp";
        const fill = document.createElement("i");
        fill.style.width = `${clamp(token.hpCurrent / token.hpMax * 100, 0, 100)}%`;
        hp.append(fill);
        button.append(hp);
      }
      elements.tokenLayer.append(button);
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
    const tokenElement = event.target.closest("[data-token-id]");
    const wantsPan = state.tool === "pan" || spacePressed;
    if (tokenElement && state.tool === "select" && !wantsPan) {
      const token = state.tokens.find(item => item.id === tokenElement.dataset.tokenId);
      if (!token) return;
      selectedTokenId = token.id;
      pointer = {type: "token", id: token.id, startX: event.clientX, startY: event.clientY, tokenX: token.x, tokenY: token.y, moved: false};
      renderTokens();
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
    selectedTokenId = "";
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
      const token = state.tokens.find(item => item.id === pointer.id);
      if (!token) return;
      const dx = (event.clientX - pointer.startX) / state.view.zoom;
      const dy = (event.clientY - pointer.startY) / state.view.zoom;
      const point = snapped({x: pointer.tokenX + dx, y: pointer.tokenY + dy});
      token.x = clamp(point.x, 25, WORLD.width - 25);
      token.y = clamp(point.y, 25, WORLD.height - 25);
      pointer.moved ||= Math.abs(dx) + Math.abs(dy) > 3;
      const element = elements.tokenLayer.querySelector(`[data-token-id="${token.id}"]`);
      if (element) {
        element.style.left = `${token.x}px`;
        element.style.top = `${token.y}px`;
      }
    }
    if (pointer.type === "measure") {
      pointer.current = snapped(worldPoint(event));
      drawMeasurement(pointer.start, pointer.current);
    }
  }

  function endPointer() {
    if (!pointer) return;
    if (pointer.type === "token" && pointer.moved) {
      const token = state.tokens.find(item => item.id === pointer.id);
      if (token) addEvent("Movimento no mapa", `${token.name} foi reposicionado.`);
    }
    if (pointer.type === "measure") {
      const distance = measurementDistance(pointer.start, pointer.current);
      setMapStatus(`Distancia: ${distance}`, true);
    }
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
    addEvent("Marcacao do Mestre", "Um ponto de interesse foi destacado no mapa.");
  }

  function setZoom(value, focusEvent = null) {
    const previous = state.view.zoom;
    const next = clamp(value, .45, 2.4);
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
    elements.tokenForm.elements.tokenId.value = token.id;
    elements.tokenForm.elements.hpCurrent.value = token.hpCurrent;
    elements.tokenForm.elements.hpMax.value = token.hpMax;
    elements.tokenForm.elements.status.value = token.status;
    elements.tokenForm.elements.initiative.value = token.initiative;
    $("[data-token-dialog-title]").textContent = token.name;
    const preview = $("[data-token-preview]");
    avatarContent(preview, token);
    elements.tokenDialog.showModal();
  }

  function saveTokenChanges(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(elements.tokenForm).entries());
    const token = state.tokens.find(item => item.id === data.tokenId);
    if (!token) return;
    token.hpCurrent = Math.max(0, Number(data.hpCurrent || 0));
    token.hpMax = Math.max(0, Number(data.hpMax || 0));
    token.status = data.status;
    token.initiative = Number(data.initiative || 0);
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
    saveSheets(sheets.map(sheet => sheet.id === token.sourceId ? {...sheet, hpCurrent: token.hpCurrent, hpMax: token.hpMax, initiative: token.initiative, updatedAt: now()} : sheet));
  }

  function syncInitiative() {
    const currentEntries = Array.isArray(state.initiative.entries) ? state.initiative.entries : [];
    state.initiative.entries = state.tokens.map(token => {
      const saved = currentEntries.find(entry => entry.tokenId === token.id);
      return {tokenId: token.id, value: Number(saved?.value ?? token.initiative ?? 0)};
    }).sort((a, b) => b.value - a.value);
    state.initiative.current = clamp(state.initiative.current, 0, Math.max(0, state.initiative.entries.length - 1));
  }

  function renderInitiative() {
    syncInitiative();
    const entries = state.initiative.entries;
    elements.initiativeList.replaceChildren();
    $("[data-round]").textContent = state.initiative.round;
    const current = entries[state.initiative.current];
    const currentToken = current && state.tokens.find(token => token.id === current.tokenId);
    $("[data-turn-name]").textContent = currentToken?.name || "Nenhum";
    if (!entries.length) {
      elements.initiativeList.innerHTML = emptyFeed("vtt-sword", "Combate ainda não iniciado", "Adicione personagens ao mapa para montar a ordem de iniciativa.");
      return;
    }
    entries.forEach((entry, index) => {
      const token = state.tokens.find(item => item.id === entry.tokenId);
      if (!token) return;
      const article = document.createElement("article");
      article.className = `vtt-initiative-item${index === state.initiative.current ? " active" : ""}`;
      article.innerHTML = `<b>${index + 1}</b><i></i><div><h3></h3><span></span></div><input type="number" aria-label="Iniciativa">`;
      avatarContent(article.querySelector("i"), token);
      article.querySelector("h3").textContent = token.name;
      article.querySelector("span").textContent = token.status;
      const input = article.querySelector("input");
      input.value = entry.value;
      input.addEventListener("change", () => {
        entry.value = Number(input.value || 0);
        token.initiative = entry.value;
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
      elements.initiativeList.append(article);
    });
  }

  function rollInitiative() {
    state.tokens.forEach(token => {
      const source = [...sources.heroes, ...sources.creatures].find(item => item.id === token.sourceId && item.origin === token.sourceOrigin);
      token.initiative = Math.floor(Math.random() * 20) + 1 + Number(source?.initiative || 0);
    });
    state.initiative.entries = state.tokens.map(token => ({tokenId: token.id, value: token.initiative})).sort((a, b) => b.value - a.value);
    state.initiative.current = 0;
    state.initiative.round = 1;
    addEvent("Iniciativa definida", "A ordem da rodada foi calculada para todo o elenco no mapa.");
    renderInitiative();
    saveState();
  }

  function nextTurn() {
    if (!state.initiative.entries.length) return;
    state.initiative.current += 1;
    if (state.initiative.current >= state.initiative.entries.length) {
      state.initiative.current = 0;
      state.initiative.round += 1;
      addEvent(`Rodada ${state.initiative.round}`, "Uma nova rodada de combate começou.");
    }
    renderInitiative();
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
    elements.rollAnimation.hidden = false;
    elements.rollAnimation.querySelector("b").textContent = roll.total;
    elements.rollAnimation.querySelector("span").textContent = `${roll.formula} · ${roll.values.join(" + ")}${roll.modifier ? ` ${roll.modifier > 0 ? "+" : "-"} ${Math.abs(roll.modifier)}` : ""}`;
    elements.rollAnimation.querySelector("svg").style.animation = "none";
    void elements.rollAnimation.offsetWidth;
    elements.rollAnimation.querySelector("svg").style.animation = "";
    clearTimeout(showRollAnimation.timer);
    showRollAnimation.timer = setTimeout(() => { elements.rollAnimation.hidden = true; }, 1350);
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
    if (!state.chat.length) {
      elements.chatList.innerHTML = emptyFeed("vtt-chat", "A mesa está em silêncio", "Mensagens, anúncios e decisões da sessão aparecerão aqui.");
      return;
    }
    state.chat.forEach(message => {
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

  function addEvent(title, detail) {
    state.events.unshift({id: uid("event"), title, detail, createdAt: now()});
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
      article.querySelector("p").textContent = item.detail;
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
    $("[data-snap-toggle]").addEventListener("click", () => { state.snap = !state.snap; renderMap(); saveState(); });
    $("[data-fog-toggle]").addEventListener("click", () => { state.fog = !state.fog; renderMap(); addEvent("Neblina ajustada", state.fog ? "A visão da cena foi reduzida." : "A cena completa foi revelada."); saveState(); });
    $("[data-reset-view]").addEventListener("click", () => { state.view = {panX: 0, panY: 0, zoom: 1}; applyView(); saveState(); });
    $("[data-session-toggle]").addEventListener("click", () => { state.live = !state.live; addEvent(state.live ? "Sessão iniciada" : "Sessão encerrada", state.live ? "A mesa está ao vivo para o grupo." : "O registro da sessão foi pausado."); renderSessionButton(); saveState(); });
    $("[data-open-library]").addEventListener("click", () => openResources());
    $("[data-fullscreen]").addEventListener("click", () => document.fullscreenElement ? document.exitFullscreen?.() : document.documentElement.requestFullscreen?.());
    $("[data-roll-form]").addEventListener("submit", event => { event.preventDefault(); rollDice(event.currentTarget.elements.formula.value); event.currentTarget.elements.formula.select(); });
    $("[data-chat-form]").addEventListener("submit", sendChat);
    $("[data-roll-initiative]").addEventListener("click", rollInitiative);
    $("[data-next-turn]").addEventListener("click", nextTurn);
    $("[data-clear-rolls]").addEventListener("click", () => { state.rolls = []; renderRolls(); saveState(); });
    $("[data-clear-events]").addEventListener("click", () => { state.events = []; renderEvents(); saveState(); });
    $("[data-share-note]").addEventListener("click", sharePublicNote);
    $$('[data-table-note]').forEach(area => area.addEventListener("input", () => saveNote(area)));

    elements.mapStage.addEventListener("pointerdown", beginPointer);
    window.addEventListener("pointermove", movePointer);
    window.addEventListener("pointerup", endPointer);
    elements.mapStage.addEventListener("dblclick", event => {
      const token = event.target.closest("[data-token-id]");
      if (token) openTokenDialog(token.dataset.tokenId);
    });
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

    $("[data-close-dialog]").addEventListener("click", () => elements.resourceDialog.close());
    elements.resourceDialog.addEventListener("click", event => { if (event.target === elements.resourceDialog) elements.resourceDialog.close(); });
    $$('[data-resource-tab]').forEach(button => button.addEventListener("click", () => { resourceTab = button.dataset.resourceTab; renderResources(); }));
    $("[data-map-upload]").addEventListener("change", event => { uploadMap(event.target.files?.[0]); event.target.value = ""; });

    window.addEventListener("keydown", event => {
      if (/INPUT|TEXTAREA|SELECT/.test(event.target.tagName)) return;
      if (event.code === "Space") { spacePressed = true; event.preventDefault(); }
      if (event.key.toLowerCase() === "v") setTool("select");
      if (event.key.toLowerCase() === "m") setTool("measure");
      if (event.key.toLowerCase() === "p") setTool("ping");
      if (event.key.toLowerCase() === "g") { state.grid = !state.grid; renderMap(); saveState(); }
      if (event.key === "+" || event.key === "=") setZoom(state.view.zoom + .1);
      if (event.key === "-") setZoom(state.view.zoom - .1);
      if (event.key === "Escape") { selectedTokenId = ""; elements.measureLayer.replaceChildren(); renderTokens(); }
    });
    window.addEventListener("keyup", event => { if (event.code === "Space") spacePressed = false; });
  }

  function initialize() {
    if (window.innerWidth <= 900) body.classList.add("roster-collapsed", "session-collapsed");
    if (!populateCampaigns()) return;
    bindEvents();
  }

  initialize();
})();
