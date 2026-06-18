// Campaign members, join requests and per-player permissions.
(() => {
  if (!document.body.matches("[data-master-page='players']")) return;

  const PLAYERS_KEY = "apex_players";
  const LEGACY_PLAYERS_KEY = "apex-realms-master-players";
  const SHEETS_KEY = "apex_character_sheets";
  const LEGACY_SHEETS_KEY = "apex-realms-master-sheets";
  const REGISTRY_KEY = "apex-realms-player-campaigns";
  const ACCOUNTS_KEY = "apex-realms-static-accounts";
  const statuses = ["Pendente", "Aprovado", "Bloqueado", "Removido"];
  const masterSettings = readStore("apex-realms-master-settings", {});
  const defaultPermissions = {
    editSheet: true,
    submitSheet: true,
    viewLibrary: masterSettings.defaultViewLibrary !== false,
    rollDice: masterSettings.defaultRollDice !== false,
    moveToken: masterSettings.defaultMoveToken !== false,
    useChat: masterSettings.defaultUseChat !== false,
    uploadFiles: false,
    viewNotes: true
  };
  const campaigns = readCampaigns().filter(campaign => !campaign.archived);
  const primarySheets = readStore(SHEETS_KEY, []);
  const sheets = primarySheets.length ? primarySheets : readStore(LEGACY_SHEETS_KEY, []);
  const campaignFilter = document.querySelector("[data-player-campaign-filter]");
  const statusFilter = document.querySelector("[data-player-status-filter]");
  const sheetFilter = document.querySelector("[data-player-sheet-filter]");
  const searchInput = document.querySelector("[data-player-search]");
  const pendingList = document.querySelector("[data-pending-players]");
  const managedList = document.querySelector("[data-managed-players]");
  const summary = document.querySelector("[data-players-summary]");
  const inviteDialog = document.querySelector("[data-invite-dialog]");
  const addDialog = document.querySelector("[data-add-player-dialog]");
  const permissionsDialog = document.querySelector("[data-permissions-dialog]");
  const profileDialog = document.querySelector("[data-player-profile-dialog]");
  const addForm = document.querySelector("[data-add-player-form]");
  const permissionsForm = document.querySelector("[data-permissions-form]");

  const normalizeEmail = value => String(value || "").trim().toLowerCase();
  const campaignById = id => campaigns.find(campaign => campaign.id === id);
  const sheetById = id => sheets.find(sheet => sheet.id === id);
  const playerKey = player => `${player.campaignId}|${normalizeEmail(player.email)}`;
  const normalizePlayer = (raw = {}) => {
    const statusMap = {Ativo: "Aprovado", Aguardando: "Pendente", Aprovada: "Aprovado", Bloqueada: "Bloqueado"};
    const createdAt = raw.createdAt || raw.joinedAt || new Date().toISOString();
    return {
      id: raw.id || `player-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(raw.name || raw.nickname || "Jogador Apex"),
      nickname: String(raw.nickname || ""),
      email: normalizeEmail(raw.email),
      avatar: String(raw.avatar || "").startsWith("data:image/") ? raw.avatar : "",
      campaignId: raw.campaignId || "",
      inviteCode: raw.inviteCode || "",
      sheetId: raw.sheetId || "",
      status: statuses.includes(raw.status) ? raw.status : (statusMap[raw.status] || "Pendente"),
      permissions: {...defaultPermissions, ...(raw.permissions || {})},
      joinedAt: raw.joinedAt || createdAt,
      lastAccess: raw.lastAccess || raw.joinedAt || "",
      createdAt,
      updatedAt: raw.updatedAt || createdAt
    };
  };
  const savePlayers = players => writeStore(PLAYERS_KEY, players.map(normalizePlayer));
  const readPlayers = () => {
    const primary = readStore(PLAYERS_KEY, []);
    const stored = (primary.length ? primary : readStore(LEGACY_PLAYERS_KEY, [])).map(normalizePlayer);
    const byKey = new Map(stored.map(player => [playerKey(player), player]));
    const accounts = readStore(ACCOUNTS_KEY, []);
    const registry = readStore(REGISTRY_KEY, {});
    campaigns.forEach(campaign => (campaign.players || []).forEach(raw => {
      const email = normalizeEmail(raw.email);
      const key = `${campaign.id}|${email}`;
      if (byKey.has(key)) return;
      const account = accounts.find(item => normalizeEmail(item.email) === email);
      byKey.set(key, normalizePlayer({...raw, ...account, id: `request-${campaign.id}-${email.replace(/[^a-z0-9]/g, "-")}`, campaignId: campaign.id, inviteCode: campaign.inviteCode, status: "Pendente"}));
    }));
    Object.entries(registry).forEach(([email, entries]) => (Array.isArray(entries) ? entries : []).forEach(entry => {
      const campaign = campaignById(entry.campaignId);
      const normalizedEmail = normalizeEmail(email);
      const key = `${entry.campaignId}|${normalizedEmail}`;
      if (!campaign || byKey.has(key)) return;
      const account = accounts.find(item => normalizeEmail(item.email) === normalizedEmail);
      byKey.set(key, normalizePlayer({...account, email: normalizedEmail, id: `request-${entry.campaignId}-${normalizedEmail.replace(/[^a-z0-9]/g, "-")}`, campaignId: entry.campaignId, inviteCode: entry.inviteCode || campaign.inviteCode, joinedAt: entry.joinedAt, status: "Pendente"}));
    }));
    const players = [...byKey.values()];
    if (players.length !== stored.length) savePlayers(players);
    return players;
  };
  const syncExternalStatus = player => {
    saveCampaigns(readCampaigns().map(campaign => {
      if (campaign.id !== player.campaignId) return campaign;
      return {...campaign, players: (campaign.players || []).map(saved => normalizeEmail(saved.email) === player.email ? {...saved, status: player.status, name: player.name, nickname: player.nickname} : saved)};
    }));
    const registry = readStore(REGISTRY_KEY, {});
    if (Array.isArray(registry[player.email])) {
      registry[player.email] = registry[player.email].map(entry => entry.campaignId === player.campaignId ? {...entry, status: player.status} : entry);
      writeStore(REGISTRY_KEY, registry);
    }
  };
  const saveStatus = (id, status) => {
    const players = readPlayers();
    const next = players.map(player => player.id === id ? {...player, status, updatedAt: new Date().toISOString()} : player);
    savePlayers(next);
    const changed = next.find(player => player.id === id);
    if (changed) syncExternalStatus(changed);
  };
  const addOption = (select, label, value) => select.add(new Option(label, value));
  const populateControls = () => {
    campaignFilter.replaceChildren();
    addOption(campaignFilter, "Todas as campanhas", "all");
    campaigns.forEach(campaign => addOption(campaignFilter, campaign.name, campaign.id));
    statusFilter.replaceChildren();
    addOption(statusFilter, "Todos os status", "all");
    statuses.forEach(status => addOption(statusFilter, status, status));
    sheetFilter.replaceChildren();
    addOption(sheetFilter, "Todas as fichas", "all");
    addOption(sheetFilter, "Com ficha vinculada", "linked");
    addOption(sheetFilter, "Sem ficha vinculada", "unlinked");
    sheets.forEach(sheet => addOption(sheetFilter, sheet.name, sheet.id));
    const addCampaign = document.querySelector("[data-add-player-campaign]");
    const addSheet = document.querySelector("[data-add-player-sheet]");
    const inviteCampaign = document.querySelector("[data-player-invite-campaign]");
    addCampaign.replaceChildren();
    addSheet.replaceChildren();
    inviteCampaign.replaceChildren();
    campaigns.forEach(campaign => {
      addOption(addCampaign, campaign.name, campaign.id);
      addOption(inviteCampaign, campaign.name, campaign.id);
    });
    addOption(addSheet, "Sem ficha vinculada", "");
    sheets.forEach(sheet => addOption(addSheet, sheet.name, sheet.id));
  };
  const matchesFilters = player => {
    if (campaignFilter.value !== "all" && player.campaignId !== campaignFilter.value) return false;
    if (statusFilter.value !== "all" && player.status !== statusFilter.value) return false;
    if (sheetFilter.value === "linked" && !player.sheetId) return false;
    if (sheetFilter.value === "unlinked" && player.sheetId) return false;
    if (!["all", "linked", "unlinked"].includes(sheetFilter.value) && player.sheetId !== sheetFilter.value) return false;
    const term = searchInput.value.trim().toLocaleLowerCase("pt-BR");
    return !term || [player.name, player.nickname, player.email].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
  };
  const formatDate = value => {
    if (!value) return "Nao registrado";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? "Nao registrado" : date.toLocaleDateString("pt-BR", {day: "2-digit", month: "short", year: "numeric"});
  };
  const createAvatar = (container, player) => {
    if (player.avatar) {
      const image = document.createElement("img");
      image.src = player.avatar;
      image.alt = `Avatar de ${player.name}`;
      container.append(image);
    } else container.textContent = player.name.trim().charAt(0).toUpperCase() || "J";
  };
  const renderSummary = players => {
    const scoped = players.filter(player => campaignFilter.value === "all" || player.campaignId === campaignFilter.value);
    const cards = [
      {label: "Jogadores", value: "all", icon: "dash-icon-group", count: scoped.filter(player => player.status !== "Removido").length},
      {label: "Pendentes", value: "Pendente", icon: "players-icon-clock"},
      {label: "Aprovados", value: "Aprovado", icon: "players-icon-check"},
      {label: "Bloqueados", value: "Bloqueado", icon: "players-icon-lock"}
    ];
    summary.replaceChildren();
    cards.forEach(card => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = statusFilter.value === card.value ? "active" : "";
      const count = card.count ?? scoped.filter(player => player.status === card.value).length;
      button.innerHTML = `<i><svg><use href="#${card.icon}"></use></svg></i><span><small>${card.label}</small><b>${count}</b></span>`;
      button.addEventListener("click", () => {
        statusFilter.value = statusFilter.value === card.value ? "all" : card.value;
        renderPlayers();
      });
      summary.append(button);
    });
  };
  const pendingCard = player => {
    const campaign = campaignById(player.campaignId);
    const article = document.createElement("article");
    article.className = "pending-player-card";
    article.dataset.playerId = player.id;
    article.innerHTML = `<header><i></i><div><h3></h3><p></p></div><span>Pendente</span></header><dl><div><dt>Campanha</dt><dd data-campaign></dd></div><div><dt>Codigo usado</dt><dd data-code></dd></div><div><dt>Solicitado em</dt><dd data-date></dd></div></dl><footer><button type="button" data-player-action="approve">Aprovar</button><button type="button" data-player-action="reject">Recusar</button></footer>`;
    createAvatar(article.querySelector("header i"), player);
    article.querySelector("h3").textContent = player.name;
    article.querySelector("header p").textContent = player.email;
    article.querySelector("[data-campaign]").textContent = campaign?.name || "Campanha removida";
    article.querySelector("[data-code]").textContent = player.inviteCode || campaign?.inviteCode || "Convite direto";
    article.querySelector("[data-date]").textContent = formatDate(player.joinedAt);
    return article;
  };
  const managedCard = player => {
    const campaign = campaignById(player.campaignId);
    const sheet = sheetById(player.sheetId);
    const article = document.createElement("article");
    article.className = `managed-player-card ${player.status.toLowerCase()}`;
    article.dataset.playerId = player.id;
    article.innerHTML = `<header><i></i><div><h3></h3><p></p></div><mark></mark></header><div class="managed-player-details"><span><small>Campanha</small><b data-campaign></b></span><span><small>Ficha</small><b data-sheet></b></span><span><small>Ultimo acesso</small><b data-access></b></span></div><footer><button type="button" data-player-action="profile">Ver perfil</button><button type="button" data-player-action="sheet">Ver ficha</button><button type="button" data-player-action="permissions">Permissoes</button><button type="button" data-player-action="block"></button><button class="danger" type="button" data-player-action="remove">Remover</button></footer>`;
    createAvatar(article.querySelector("header i"), player);
    article.querySelector("h3").textContent = player.name;
    article.querySelector("header p").textContent = player.email;
    article.querySelector("mark").textContent = player.status;
    article.querySelector("[data-campaign]").textContent = campaign?.name || "Sem campanha";
    article.querySelector("[data-sheet]").textContent = sheet?.name || "Nao vinculada";
    article.querySelector("[data-access]").textContent = formatDate(player.lastAccess);
    article.querySelector("[data-player-action='sheet']").disabled = !sheet;
    article.querySelector("[data-player-action='block']").textContent = player.status === "Bloqueado" ? "Desbloquear" : "Bloquear";
    if (player.status === "Removido") article.querySelector("[data-player-action='remove']").textContent = "Restaurar";
    return article;
  };
  const renderPlayers = () => {
    const players = readPlayers();
    renderSummary(players);
    const filtered = players.filter(matchesFilters).sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    const pending = filtered.filter(player => player.status === "Pendente");
    const managed = filtered.filter(player => player.status !== "Pendente");
    pendingList.replaceChildren();
    managedList.replaceChildren();
    document.querySelector("[data-pending-count]").textContent = pending.length;
    document.querySelector("[data-managed-count]").textContent = managed.length;
    if (!pending.length) pendingList.innerHTML = `<div class="players-empty"><b>Nenhuma solicitacao pendente</b><span>Novos pedidos por convite aparecerao aqui.</span></div>`;
    else pending.forEach(player => pendingList.append(pendingCard(player)));
    if (!managed.length) managedList.innerHTML = `<div class="players-empty"><b>Nenhum jogador neste filtro</b><span>Aprove uma solicitacao ou adicione um jogador manualmente.</span></div>`;
    else managed.forEach(player => managedList.append(managedCard(player)));
  };
  const renderInvite = () => {
    const selectedId = document.querySelector("[data-player-invite-campaign]").value;
    const campaign = campaignById(selectedId) || campaigns[0];
    document.querySelector("[data-player-invite-code]").value = campaign?.inviteCode || "";
    document.querySelector("[data-player-invite-link]").value = campaign ? campaignInviteLink(campaign.inviteCode) : "";
  };
  const openPermissions = player => {
    permissionsForm.elements.playerId.value = player.id;
    document.querySelector("[data-permissions-player]").textContent = player.name;
    Object.keys(defaultPermissions).forEach(name => { permissionsForm.elements[name].checked = player.permissions[name]; });
    permissionsDialog.showModal();
  };
  const openProfile = player => {
    document.querySelector("[data-profile-player-name]").textContent = player.name;
    document.querySelector("[data-profile-player-email]").textContent = player.email;
    const rows = [["Status", player.status], ["Campanha", campaignById(player.campaignId)?.name || "Sem campanha"], ["Ficha", sheetById(player.sheetId)?.name || "Nao vinculada"], ["Entrada", formatDate(player.joinedAt)], ["Ultimo acesso", formatDate(player.lastAccess)]];
    const details = document.querySelector("[data-player-profile-details]");
    details.replaceChildren(...rows.map(([label, value]) => {
      const span = document.createElement("span");
      const small = document.createElement("small");
      const strong = document.createElement("b");
      small.textContent = label;
      strong.textContent = value;
      span.append(small, strong);
      return span;
    }));
    profileDialog.showModal();
  };

  document.querySelector("[data-players-invites]").addEventListener("click", () => { renderInvite(); inviteDialog.showModal(); });
  document.querySelector("[data-player-add]").addEventListener("click", () => { addForm.reset(); addDialog.showModal(); });
  document.querySelectorAll("[data-player-dialog-close]").forEach(button => button.addEventListener("click", () => button.closest("dialog")?.close()));
  document.querySelectorAll(".players-dialog").forEach(current => current.addEventListener("click", event => { if (event.target === current) current.close(); }));
  document.querySelector("[data-player-invite-campaign]").addEventListener("change", renderInvite);
  document.querySelector("[data-copy-player-code]").addEventListener("click", async () => navigator.clipboard?.writeText(document.querySelector("[data-player-invite-code]").value));
  document.querySelector("[data-copy-player-link]").addEventListener("click", async () => navigator.clipboard?.writeText(document.querySelector("[data-player-invite-link]").value));
  document.querySelector("[data-regenerate-player-code]").addEventListener("click", () => {
    const id = document.querySelector("[data-player-invite-campaign]").value;
    const allCampaigns = readCampaigns();
    saveCampaigns(allCampaigns.map(campaign => campaign.id === id ? {...campaign, inviteCode: createInviteCode(allCampaigns), updatedAt: new Date().toISOString()} : campaign));
    const updated = readCampaigns().find(campaign => campaign.id === id);
    const cached = campaigns.find(campaign => campaign.id === id);
    if (cached && updated) Object.assign(cached, updated);
    renderInvite();
  });
  addForm.addEventListener("submit", event => {
    event.preventDefault();
    if (!addForm.reportValidity()) return;
    const data = Object.fromEntries(new FormData(addForm).entries());
    const players = readPlayers();
    const player = normalizePlayer({...data, id: undefined, joinedAt: new Date().toISOString(), permissions: defaultPermissions});
    savePlayers([player, ...players.filter(saved => playerKey(saved) !== playerKey(player))]);
    syncExternalStatus(player);
    addDialog.close();
    renderPlayers();
  });
  permissionsForm.addEventListener("submit", event => {
    event.preventDefault();
    const players = readPlayers();
    const id = permissionsForm.elements.playerId.value;
    const permissions = Object.fromEntries(Object.keys(defaultPermissions).map(name => [name, permissionsForm.elements[name].checked]));
    savePlayers(players.map(player => player.id === id ? {...player, permissions, updatedAt: new Date().toISOString()} : player));
    permissionsDialog.close();
    renderPlayers();
  });
  document.querySelector(".players-workspace").addEventListener("click", event => {
    const button = event.target.closest("[data-player-action]");
    const card = event.target.closest("[data-player-id]");
    if (!button || !card) return;
    const player = readPlayers().find(saved => saved.id === card.dataset.playerId);
    if (!player) return;
    const action = button.dataset.playerAction;
    if (action === "approve") saveStatus(player.id, "Aprovado");
    if (action === "reject") saveStatus(player.id, "Removido");
    if (action === "block") saveStatus(player.id, player.status === "Bloqueado" ? "Aprovado" : "Bloqueado");
    if (action === "remove") saveStatus(player.id, player.status === "Removido" ? "Aprovado" : "Removido");
    if (action === "permissions") openPermissions(player);
    if (action === "profile") openProfile(player);
    if (action === "sheet" && player.sheetId) window.location.href = `sheets.html?sheet=${encodeURIComponent(player.sheetId)}`;
    if (["approve", "reject", "block", "remove"].includes(action)) renderPlayers();
  });
  [campaignFilter, statusFilter, sheetFilter].forEach(control => control.addEventListener("change", renderPlayers));
  searchInput.addEventListener("input", renderPlayers);
  document.querySelector("[data-player-clear-filters]").addEventListener("click", () => {
    campaignFilter.value = "all";
    statusFilter.value = "all";
    sheetFilter.value = "all";
    searchInput.value = "";
    renderPlayers();
  });

  populateControls();
  renderPlayers();
})();
