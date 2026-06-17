// Static master workspace behavior for the docs/ build.
const MASTER_CAMPAIGNS_KEY = "apex-realms-campaigns";
const MASTER_LIBRARY_KEY = "apex-realms-master-library";
const MASTER_SHEETS_KEY = "apex-realms-master-sheets";
const MASTER_PLAYERS_KEY = "apex-realms-master-players";
const MASTER_SETTINGS_KEY = "apex-realms-master-settings";
const MASTER_NOTES_KEY = "apex-realms-master-notes";

const masterSystems = ["D&D 5e", "Tormenta 20", "Pathfinder", "Ordem Paranormal", "Sistema Proprio", "Outro"];
const masterStatuses = ["Preparacao", "Em andamento", "Pausada", "Finalizada"];
const libraryTypes = ["Mapas", "Tokens", "NPCs", "Monstros", "Itens", "Imagens", "Documentos", "Sons", "Anotacoes", "Handouts"];

function readStore(key, fallback = []) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return Array.isArray(fallback) ? (Array.isArray(data) ? data : fallback) : (data && typeof data === "object" ? data : fallback);
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function writeStore(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

function masterToast(message) {
  if (typeof showPrototypeToast === "function") showPrototypeToast(message);
}

function createInviteCode(prefix = "AR") {
  return `${prefix}-${Math.random().toString(36).slice(2, 6).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
}

function normalizeCampaign(raw = {}) {
  return {
    id: raw.id || `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: raw.name || "Campanha sem nome",
    system: raw.system || "D&D 5e",
    description: raw.description || "",
    banner: raw.banner || raw.image || "",
    initialLevel: Number(raw.initialLevel || raw.level || 1),
    maxPlayers: Number(raw.maxPlayers || raw.limit || 4),
    status: raw.status || "Preparacao",
    inviteCode: raw.inviteCode || raw.code || createInviteCode("AR"),
    archived: Boolean(raw.archived),
    private: true,
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
}

function readCampaigns() {
  return readStore(MASTER_CAMPAIGNS_KEY, []).map(normalizeCampaign);
}

function saveCampaigns(campaigns) {
  writeStore(MASTER_CAMPAIGNS_KEY, campaigns.map(normalizeCampaign));
}

function campaignInviteLink(code) {
  return `${window.location.origin}${window.location.pathname.replace(/\/master\/[^/]*$/, "/")}cadastro.html?invite=${encodeURIComponent(code)}`;
}

function activeCampaign() {
  return readCampaigns().find(campaign => !campaign.archived) || readCampaigns()[0] || null;
}

function setText(selector, value) {
  document.querySelectorAll(selector).forEach(element => {
    element.textContent = value;
  });
}

function renderMasterShell() {
  const user = window.ApexStaticAuth?.getUser?.();
  if (user?.role !== "master") return;
  document.querySelectorAll("[data-master-name]").forEach(element => {
    element.textContent = user.name || user.nickname || "Mestre Apex";
  });
}

function renderDashboard() {
  if (!document.body.matches("[data-master-page='dashboard']")) return;
  const campaigns = readCampaigns();
  const active = campaigns.filter(campaign => !campaign.archived);
  const campaign = active[0];
  setText("[data-master-campaign-count]", active.length);
  setText("[data-master-invite-code]", campaign?.inviteCode || "Sem campanha");
  setText("[data-master-next-session]", campaign ? "A definir" : "Aguardando");
  const recent = document.querySelector("[data-master-recent-campaigns]");
  if (recent) {
    recent.innerHTML = "";
    if (!active.length) {
      recent.innerHTML = `<div class="master-empty"><b>Nenhuma campanha criada</b><span>Use o card Criar campanha para iniciar o primeiro mundo.</span></div>`;
    } else {
      active.slice(0, 3).forEach(item => {
        const article = document.createElement("article");
        article.className = "master-list-item";
        article.innerHTML = `<header><div><h3></h3><div class="master-list-meta"><span class="master-pill"></span><span class="master-status warn"></span></div></div><a class="master-ghost" href="campaigns.html">Gerenciar</a></header><p></p>`;
        article.querySelector("h3").textContent = item.name;
        article.querySelector(".master-pill").textContent = item.system;
        article.querySelector(".master-status").textContent = item.status;
        article.querySelector("p").textContent = item.description || "Sem descricao cadastrada.";
        recent.append(article);
      });
    }
  }
}

function bindCampaignForm() {
  const form = document.querySelector("[data-master-campaign-form]");
  if (!form) return;
  const preview = document.querySelector("[data-campaign-banner-preview]");
  const imageInput = form.querySelector("[name='banner']");
  const editingId = document.querySelector("[data-editing-campaign-id]");

  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      imageInput.value = "";
      masterToast("Envie uma imagem valida para o banner.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      form.dataset.bannerData = String(reader.result || "");
      if (preview) preview.style.backgroundImage = `linear-gradient(transparent,#07070de8), url("${form.dataset.bannerData}")`;
    };
    reader.readAsDataURL(file);
  });

  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const campaigns = readCampaigns();
    const id = editingId?.value || "";
    const existing = campaigns.find(campaign => campaign.id === id);
    const campaign = normalizeCampaign({
      ...existing,
      id: id || undefined,
      name: data.get("name"),
      system: data.get("system"),
      description: data.get("description"),
      initialLevel: data.get("initialLevel"),
      maxPlayers: data.get("maxPlayers"),
      status: data.get("status"),
      banner: form.dataset.bannerData || existing?.banner || "",
      inviteCode: existing?.inviteCode || createInviteCode("AR")
    });
    const nextCampaigns = existing ? campaigns.map(item => item.id === id ? campaign : item) : [campaign, ...campaigns];
    saveCampaigns(nextCampaigns);
    form.reset();
    form.dataset.bannerData = "";
    if (editingId) editingId.value = "";
    if (preview) preview.removeAttribute("style");
    masterToast(existing ? "Campanha atualizada." : "Campanha criada com convite privado.");
    renderCampaignsPage();
    renderDashboard();
  });
}

function renderCampaignsPage() {
  if (!document.body.matches("[data-master-page='campaigns']")) return;
  const list = document.querySelector("[data-master-campaign-list]");
  const total = document.querySelector("[data-master-total-campaigns]");
  const campaigns = readCampaigns();
  if (total) total.textContent = campaigns.length;
  if (!list) return;
  list.innerHTML = "";
  if (!campaigns.length) {
    list.innerHTML = `<div class="master-empty"><b>Nenhuma campanha cadastrada</b><span>Preencha o formulario para criar uma campanha privada com codigo unico.</span></div>`;
    return;
  }
  campaigns.forEach(campaign => {
    const article = document.createElement("article");
    article.className = "master-list-item";
    article.dataset.campaignId = campaign.id;
    article.innerHTML = `
      <header>
        <div>
          <h3></h3>
          <div class="master-list-meta">
            <span class="master-pill" data-system></span>
            <span class="master-status warn" data-status></span>
            <span class="master-pill" data-code></span>
          </div>
        </div>
        <div class="master-card-actions">
          <button class="master-ghost" type="button" data-campaign-action="copy">Copiar convite</button>
          <button class="master-ghost" type="button" data-campaign-action="edit">Editar</button>
          <button class="master-ghost" type="button" data-campaign-action="duplicate">Duplicar</button>
          <button class="master-ghost" type="button" data-campaign-action="archive">Arquivar</button>
          <button class="master-danger" type="button" data-campaign-action="delete">Excluir</button>
        </div>
      </header>
      <p></p>`;
    article.querySelector("h3").textContent = campaign.name;
    article.querySelector("p").textContent = campaign.description || "Sem descricao cadastrada.";
    article.querySelector("[data-system]").textContent = campaign.system;
    article.querySelector("[data-status]").textContent = campaign.archived ? "Arquivada" : campaign.status;
    article.querySelector("[data-code]").textContent = campaign.inviteCode;
    list.append(article);
  });
}

function bindCampaignActions() {
  document.querySelector("[data-master-campaign-list]")?.addEventListener("click", async event => {
    const button = event.target.closest("[data-campaign-action]");
    if (!button) return;
    const card = button.closest("[data-campaign-id]");
    const id = card?.dataset.campaignId;
    const campaigns = readCampaigns();
    const campaign = campaigns.find(item => item.id === id);
    if (!campaign) return;
    const action = button.dataset.campaignAction;

    if (action === "copy") {
      await navigator.clipboard?.writeText(campaignInviteLink(campaign.inviteCode));
      masterToast("Link de convite copiado.");
    }
    if (action === "edit") {
      const form = document.querySelector("[data-master-campaign-form]");
      document.querySelector("[data-editing-campaign-id]").value = campaign.id;
      form.name.value = campaign.name;
      form.system.value = campaign.system;
      form.description.value = campaign.description;
      form.initialLevel.value = campaign.initialLevel;
      form.maxPlayers.value = campaign.maxPlayers;
      form.status.value = campaign.status;
      form.dataset.bannerData = campaign.banner || "";
      document.querySelector("[data-campaign-banner-preview]")?.scrollIntoView({behavior: "smooth", block: "center"});
      masterToast("Campanha carregada para edicao.");
    }
    if (action === "duplicate") {
      saveCampaigns([{...campaign, id: undefined, name: `${campaign.name} (copia)`, inviteCode: createInviteCode("AR")}, ...campaigns]);
      masterToast("Campanha duplicada com novo convite.");
    }
    if (action === "archive") {
      saveCampaigns(campaigns.map(item => item.id === id ? {...item, archived: !item.archived} : item));
      masterToast(campaign.archived ? "Campanha reativada." : "Campanha arquivada.");
    }
    if (action === "delete") {
      if (!confirm("Excluir esta campanha?")) return;
      saveCampaigns(campaigns.filter(item => item.id !== id));
      masterToast("Campanha excluida.");
    }
    renderCampaignsPage();
    renderDashboard();
    renderInvitesPage();
  });
}

function bindTablePage() {
  if (!document.body.matches("[data-master-page='table']")) return;
  const board = document.querySelector("[data-master-map-board]");
  const zoomLabel = document.querySelector("[data-master-zoom-label]");
  let zoom = 1;
  const updateZoom = () => {
    board?.style.setProperty("--map-zoom", String(zoom));
    if (zoomLabel) zoomLabel.textContent = `${Math.round(zoom * 100)}%`;
  };
  document.querySelectorAll("[data-zoom]").forEach(button => button.addEventListener("click", () => {
    zoom = Math.max(.7, Math.min(1.6, zoom + Number(button.dataset.zoom)));
    updateZoom();
  }));
  document.querySelector("[data-toggle-grid]")?.addEventListener("click", () => {
    board.dataset.grid = board.dataset.grid === "off" ? "on" : "off";
    masterToast(board.dataset.grid === "off" ? "Grid oculto." : "Grid exibido.");
  });
  document.querySelector("[data-session-toggle]")?.addEventListener("click", event => {
    const active = event.currentTarget.dataset.active === "true";
    event.currentTarget.dataset.active = String(!active);
    event.currentTarget.textContent = active ? "Iniciar sessao" : "Encerrar sessao";
    masterToast(active ? "Sessao encerrada." : "Sessao iniciada.");
  });
  document.querySelector("[data-map-upload]")?.addEventListener("change", event => {
    const file = event.target.files?.[0];
    if (!file || !file.type.startsWith("image/")) {
      masterToast("Envie uma imagem de mapa valida.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      board.style.backgroundImage = `linear-gradient(transparent,#07070d88), url("${reader.result}")`;
      masterToast("Mapa carregado na mesa.");
    };
    reader.readAsDataURL(file);
  });
  document.querySelectorAll("[data-table-note]").forEach(textarea => {
    textarea.value = readStore(MASTER_NOTES_KEY, {})[textarea.dataset.tableNote] || "";
    textarea.addEventListener("input", () => {
      writeStore(MASTER_NOTES_KEY, {...readStore(MASTER_NOTES_KEY, {}), [textarea.dataset.tableNote]: textarea.value});
    });
  });
}

function bindLibraryPage() {
  if (!document.body.matches("[data-master-page='library']")) return;
  const categoryButtons = document.querySelector("[data-library-categories]");
  const list = document.querySelector("[data-library-list]");
  const form = document.querySelector("[data-library-form]");
  let activeType = "Mapas";

  const renderCategories = () => {
    const items = readStore(MASTER_LIBRARY_KEY, []);
    categoryButtons.innerHTML = "";
    libraryTypes.forEach(type => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = type === activeType ? "active" : "";
      button.innerHTML = `<span>${type}</span><small class="master-badge-count">${items.filter(item => item.type === type).length} itens</small>`;
      button.addEventListener("click", () => {
        activeType = type;
        renderCategories();
        renderLibrary();
      });
      categoryButtons.append(button);
    });
  };
  const renderLibrary = () => {
    const items = readStore(MASTER_LIBRARY_KEY, []).filter(item => item.type === activeType);
    list.innerHTML = "";
    if (!items.length) {
      list.innerHTML = `<div class="master-empty"><b>Nenhum item em ${activeType}</b><span>Envie arquivos pelo formulario para montar a biblioteca da campanha.</span></div>`;
      return;
    }
    items.forEach(item => {
      const article = document.createElement("article");
      article.className = "master-list-item";
      article.innerHTML = `<header><div><h3></h3><div class="master-list-meta"><span class="master-pill"></span><span class="master-status"></span></div></div><button class="master-danger" type="button">Remover</button></header><p></p>`;
      article.querySelector("h3").textContent = item.name;
      article.querySelector(".master-pill").textContent = item.campaign || "Sem campanha";
      article.querySelector(".master-status").textContent = item.visibility;
      article.querySelector("p").textContent = `${item.description || "Sem descricao."} ${item.tags ? `Tags: ${item.tags}` : ""}`;
      article.querySelector("button").addEventListener("click", () => {
        writeStore(MASTER_LIBRARY_KEY, readStore(MASTER_LIBRARY_KEY, []).filter(saved => saved.id !== item.id));
        renderCategories();
        renderLibrary();
        masterToast("Item removido da biblioteca.");
      });
      list.append(article);
    });
  };
  form?.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const file = form.file.files?.[0];
    const item = {
      id: `lib-${Date.now()}`,
      name: data.get("name"),
      type: data.get("type"),
      campaign: data.get("campaign"),
      description: data.get("description"),
      tags: data.get("tags"),
      visibility: data.get("visibility"),
      fileName: file?.name || "arquivo local"
    };
    writeStore(MASTER_LIBRARY_KEY, [item, ...readStore(MASTER_LIBRARY_KEY, [])]);
    activeType = item.type;
    form.reset();
    renderCategories();
    renderLibrary();
    masterToast("Item adicionado a biblioteca.");
  });
  renderCategories();
  renderLibrary();
}

function renderSimpleCollection(page, key, listSelector, emptyTitle, emptyText) {
  if (!document.body.matches(`[data-master-page='${page}']`)) return;
  const list = document.querySelector(listSelector);
  if (!list) return;
  const items = readStore(key, []);
  list.innerHTML = "";
  if (!items.length) {
    list.innerHTML = `<div class="master-empty"><b>${emptyTitle}</b><span>${emptyText}</span></div>`;
  }
}

function renderInvitesPage() {
  if (!document.body.matches("[data-master-page='invites']")) return;
  const select = document.querySelector("[data-invite-campaign]");
  const code = document.querySelector("[data-invite-code]");
  const link = document.querySelector("[data-invite-link]");
  if (!select) return;
  const selectedId = select.value;
  const campaigns = readCampaigns().filter(campaign => !campaign.archived);
  select.innerHTML = campaigns.length ? campaigns.map(item => `<option value="${item.id}">${item.name}</option>`).join("") : `<option value="">Nenhuma campanha criada</option>`;
  if (selectedId && campaigns.some(item => item.id === selectedId)) select.value = selectedId;
  const campaign = campaigns.find(item => item.id === select.value) || campaigns[0];
  if (code) code.value = campaign?.inviteCode || "";
  if (link) link.value = campaign ? campaignInviteLink(campaign.inviteCode) : "";
  document.querySelectorAll("[data-requires-campaign]").forEach(button => { button.disabled = !campaign; });
}

function bindInvitesPage() {
  if (!document.body.matches("[data-master-page='invites']")) return;
  if (document.body.dataset.invitesBound === "true") {
    renderInvitesPage();
    return;
  }
  document.body.dataset.invitesBound = "true";
  const select = document.querySelector("[data-invite-campaign]");
  select?.addEventListener("change", renderInvitesPage);
  document.querySelector("[data-copy-code]")?.addEventListener("click", async () => {
    const code = document.querySelector("[data-invite-code]");
    await navigator.clipboard?.writeText(code.value);
    masterToast("Codigo copiado.");
  });
  document.querySelector("[data-copy-link]")?.addEventListener("click", async () => {
    const link = document.querySelector("[data-invite-link]");
    await navigator.clipboard?.writeText(link.value);
    masterToast("Link copiado.");
  });
  document.querySelector("[data-new-invite]")?.addEventListener("click", () => {
    const select = document.querySelector("[data-invite-campaign]");
    const id = select.value;
    saveCampaigns(readCampaigns().map(item => item.id === id ? {...item, inviteCode: createInviteCode("AR")} : item));
    masterToast("Novo codigo gerado.");
    renderInvitesPage();
  });
  document.querySelector("[data-revoke-invite]")?.addEventListener("click", () => {
    const select = document.querySelector("[data-invite-campaign]");
    const id = select.value;
    saveCampaigns(readCampaigns().map(item => item.id === id ? {...item, inviteCode: createInviteCode("REV")} : item));
    masterToast("Codigo revogado e substituido.");
    renderInvitesPage();
  });
  renderInvitesPage();
}

function bindSettingsPage() {
  const form = document.querySelector("[data-master-settings-form]");
  if (!form) return;
  const settings = readStore(MASTER_SETTINGS_KEY, {});
  Object.entries(settings).forEach(([name, value]) => {
    if (form.elements[name]) form.elements[name].value = value;
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());
    writeStore(MASTER_SETTINGS_KEY, data);
    masterToast("Configuracoes do mestre salvas.");
  });
}

function bindGenericMasterActions() {
  document.querySelectorAll("[data-master-toast]").forEach(button => button.addEventListener("click", () => {
    masterToast(button.dataset.masterToast || "Acao registrada.");
  }));
}

renderMasterShell();
renderDashboard();
bindCampaignForm();
bindCampaignActions();
renderCampaignsPage();
bindTablePage();
bindLibraryPage();
renderSimpleCollection("sheets", MASTER_SHEETS_KEY, "[data-master-sheets-list]", "Nenhuma ficha enviada", "Quando jogadores enviarem fichas para aprovacao, elas aparecerao aqui.");
renderSimpleCollection("players", MASTER_PLAYERS_KEY, "[data-master-players-list]", "Nenhum jogador aguardando", "Solicitacoes, aprovados e bloqueados ficarao separados nesta area.");
bindInvitesPage();
bindSettingsPage();
bindGenericMasterActions();
