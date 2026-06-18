// Static master workspace behavior for the docs/ build.
const MASTER_CAMPAIGNS_KEY = "apex-realms-campaigns";
const MASTER_LIBRARY_KEY = "apex-realms-master-library";
const MASTER_SHEETS_KEY = "apex-realms-master-sheets";
const MASTER_PLAYERS_KEY = "apex-realms-master-players";
const MASTER_SETTINGS_KEY = "apex-realms-master-settings";
const MASTER_NOTES_KEY = "apex-realms-master-notes";

const masterSystems = ["D&D 5e", "Tormenta 20", "Pathfinder", "Ordem Paranormal", "Sistema Proprio", "Outro"];
const masterStatuses = ["Preparacao", "Em andamento", "Pausada", "Finalizada"];
const libraryTypes = ["Monstros", "NPCs", "Itens", "Mapas", "Anotacoes", "Magias", "Armadilhas", "Locais", "Encontros", "Recompensas", "Documentos/lore"];
const MASTER_BANNER_MAX_FILE_BYTES = 8 * 1024 * 1024;
const MASTER_BANNER_MAX_DATA_CHARS = 900000;

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

function createInviteCode(existingCodes = readStore(MASTER_CAMPAIGNS_KEY, [])) {
  if (window.ApexInvites?.generateCode) return window.ApexInvites.generateCode(existingCodes);
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (length = 4) => Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `AR-${part()}-${part()}`;
}

function normalizeCampaign(raw = {}) {
  const createdAt = raw.createdAt || new Date().toISOString();
  const normalizedInviteCode = window.ApexInvites?.normalizeCode?.(raw.inviteCode || raw.code) || "";
  const inviteCode = normalizedInviteCode.startsWith("AR-") ? normalizedInviteCode : createInviteCode();
  const maxPlayers = Number(raw.maxPlayers || raw.limit || 4);
  return {
    id: raw.id || `cmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    name: raw.name || "Campanha sem nome",
    system: raw.system || "D&D 5e",
    description: raw.description || "",
    banner: raw.banner || raw.image || "",
    initialLevel: Number(raw.initialLevel || raw.level || 1),
    maxPlayers,
    limit: maxPlayers,
    status: raw.status || "Preparacao",
    inviteCode,
    code: inviteCode,
    archived: Boolean(raw.archived),
    private: raw.private !== false,
    visibility: raw.visibility || (raw.private === false ? "public" : "private"),
    image: raw.image || raw.banner || "",
    players: Array.isArray(raw.players) ? raw.players : [],
    createdAt,
    updatedAt: raw.updatedAt || createdAt
  };
}

function readCampaigns() {
  const campaigns = window.ApexInvites?.readCampaigns?.() || readStore(MASTER_CAMPAIGNS_KEY, []);
  return campaigns.map(normalizeCampaign);
}

function saveCampaigns(campaigns) {
  const normalizedCampaigns = campaigns.map(normalizeCampaign);
  if (window.ApexInvites?.saveCampaigns) {
    window.ApexInvites.saveCampaigns(normalizedCampaigns);
    return;
  }
  writeStore(MASTER_CAMPAIGNS_KEY, normalizedCampaigns);
}

function campaignInviteLink(code) {
  if (window.ApexInvites?.inviteLink) return window.ApexInvites.inviteLink(code);
  return `${window.location.origin}${window.location.pathname.replace(/\/master\/[^/]*$/, "/")}cadastro.html?invite=${encodeURIComponent(code)}`;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Nao foi possivel ler a imagem."));
    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(source) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel preparar esta imagem."));
    image.src = source;
  });
}

async function prepareCampaignBanner(file) {
  if (!file.type.startsWith("image/")) throw new Error("Envie uma imagem valida para o banner.");
  if (file.size > MASTER_BANNER_MAX_FILE_BYTES) throw new Error("Imagem muito grande. Use um banner com ate 8 MB.");

  const originalSource = await readFileAsDataUrl(file);
  try {
    const image = await loadImageFromDataUrl(originalSource);
    const maxWidth = 1280;
    const maxHeight = 720;
    const scale = Math.min(1, maxWidth / image.width, maxHeight / image.height);
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.width * scale));
    canvas.height = Math.max(1, Math.round(image.height * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);

    let compressed = "";
    for (const quality of [.82, .72, .62, .52]) {
      compressed = canvas.toDataURL("image/webp", quality);
      if (compressed.length <= MASTER_BANNER_MAX_DATA_CHARS) return compressed;
    }
    if (compressed.length <= MASTER_BANNER_MAX_DATA_CHARS * 1.5) return compressed;
  } catch {
    if (originalSource.length <= MASTER_BANNER_MAX_DATA_CHARS) return originalSource;
  }
  throw new Error("O banner ficou pesado demais para salvar neste navegador. Tente uma imagem menor.");
}

function applyCampaignBannerPreview(preview, source) {
  if (!preview) return;
  if (source) {
    preview.style.background = `linear-gradient(180deg, #08071022 0%, #07070df2 100%), url("${source}") center / cover`;
    preview.classList.add("has-banner");
    return;
  }
  preview.removeAttribute("style");
  preview.classList.remove("has-banner");
}

function applyCampaignCardBanner(card, campaign) {
  const source = campaign?.banner || campaign?.image || "";
  if (!card || !source) return;
  card.classList.add("has-campaign-banner");
  card.style.background = `
    linear-gradient(90deg, #0c0a13f2 0%, #0c0a13d8 46%, #0c0a1390 100%),
    url("${source}") center / cover
  `;
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

function renderDashboardInvites(campaigns) {
  const select = document.querySelector("[data-master-invite-select]");
  const copyButton = document.querySelector("[data-master-copy-invite]");
  const count = document.querySelector("[data-master-invite-count]");
  if (!select || !copyButton || !count) return;

  count.textContent = `${campaigns.length} ${campaigns.length === 1 ? "ativo" : "ativos"}`;
  select.replaceChildren();

  if (!campaigns.length) {
    select.add(new Option("Sem campanha", ""));
    select.disabled = true;
    copyButton.disabled = true;
    return;
  }

  campaigns.forEach(campaign => {
    select.add(new Option(`${campaign.name} - ${campaign.inviteCode}`, campaign.id));
  });

  const savedCampaignId = localStorage.getItem("apex-realms-dashboard-invite");
  if (campaigns.some(campaign => campaign.id === savedCampaignId)) select.value = savedCampaignId;
  select.disabled = false;
  copyButton.disabled = false;

  if (select.dataset.bound !== "true") {
    select.dataset.bound = "true";
    select.addEventListener("change", () => {
      localStorage.setItem("apex-realms-dashboard-invite", select.value);
    });
    copyButton.addEventListener("click", async () => {
      const campaign = readCampaigns().find(item => !item.archived && item.id === select.value);
      if (!campaign) return;
      await navigator.clipboard?.writeText(campaign.inviteCode);
      masterToast(`Codigo de ${campaign.name} copiado.`);
    });
  }
}

function renderDashboard() {
  if (!document.body.matches("[data-master-page='dashboard']")) return;
  const campaigns = readCampaigns();
  const active = campaigns.filter(campaign => !campaign.archived);
  const campaign = active[0];
  document.body.classList.toggle("dashboard-empty-state", !active.length);
  setText("[data-master-campaign-count]", active.length);
  renderDashboardInvites(active);
  setText("[data-master-next-session]", campaign ? "A definir" : "Aguardando");
  const recent = document.querySelector("[data-master-recent-campaigns]");
  if (recent) {
    recent.innerHTML = "";
    if (!active.length) {
      recent.innerHTML = `
        <div class="dashboard-empty-campaign">
          <span class="dashboard-empty-icon"><svg><use href="#dash-icon-scroll"></use></svg></span>
          <div><b>Nenhuma campanha criada</b><p>Crie seu primeiro mundo para liberar convites, fichas e mesa.</p></div>
          <a class="master-btn" href="campaigns.html#new-campaign">Criar primeira campanha</a>
        </div>`;
    } else {
      active.slice(0, 3).forEach(item => {
        const article = document.createElement("article");
        article.className = "master-list-item dashboard-campaign-card";
        article.innerHTML = `<header><div><h3></h3><div class="master-list-meta"><span class="master-pill"></span><span class="master-status warn"></span></div></div><a class="master-ghost" href="campaigns.html">Gerenciar</a></header><p></p>`;
        applyCampaignCardBanner(article, item);
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
  let bannerProcessing = Promise.resolve("");

  imageInput?.addEventListener("change", () => {
    const file = imageInput.files?.[0];
    if (!file) return;
    form.dataset.bannerPending = "true";
    masterToast("Preparando banner...");
    bannerProcessing = prepareCampaignBanner(file)
      .then(source => {
        form.dataset.bannerData = source;
        applyCampaignBannerPreview(preview, source);
        masterToast("Banner pronto para salvar.");
        return source;
      })
      .catch(error => {
        imageInput.value = "";
        form.dataset.bannerData = "";
        applyCampaignBannerPreview(preview, "");
        masterToast(error.message || "Nao foi possivel preparar o banner.");
        return "";
      })
      .finally(() => {
        delete form.dataset.bannerPending;
      });
  });

  form.addEventListener("reset", () => {
    form.dataset.bannerData = "";
    if (editingId) editingId.value = "";
    applyCampaignBannerPreview(preview, "");
  });

  form.addEventListener("submit", async event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    if (form.dataset.bannerPending === "true") {
      masterToast("Aguarde o banner terminar de carregar.");
      await bannerProcessing;
    }
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
      inviteCode: existing?.inviteCode || existing?.code || createInviteCode(campaigns),
      updatedAt: new Date().toISOString()
    });
    const nextCampaigns = existing ? campaigns.map(item => item.id === id ? campaign : item) : [campaign, ...campaigns];
    try {
      saveCampaigns(nextCampaigns);
    } catch {
      masterToast("Nao foi possivel salvar. Tente remover ou trocar o banner.");
      return;
    }
    form.reset();
    form.dataset.bannerData = "";
    if (editingId) editingId.value = "";
    applyCampaignBannerPreview(preview, "");
    masterToast(existing ? "Campanha atualizada." : "Campanha criada com convite.");
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
    list.innerHTML = `<div class="master-empty"><b>Nenhuma campanha cadastrada</b><span>Preencha o formulario para criar uma campanha com codigo unico.</span></div>`;
    return;
  }
  campaigns.forEach(campaign => {
    const article = document.createElement("article");
    article.className = "master-list-item campaigns-campaign-card";
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
    applyCampaignCardBanner(article, campaign);
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
      applyCampaignBannerPreview(document.querySelector("[data-campaign-banner-preview]"), campaign.banner || "");
      if (!document.body.classList.contains("campaigns-page")) {
        document.querySelector("[data-campaign-banner-preview]")?.scrollIntoView({behavior: "smooth", block: "center"});
      }
    }
    if (action === "duplicate") {
      saveCampaigns([{
        ...campaign,
        id: undefined,
        name: `${campaign.name} (copia)`,
        inviteCode: createInviteCode(campaigns),
        code: undefined,
        players: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }, ...campaigns]);
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
  const dialog = document.querySelector("[data-library-dialog]");
  const list = document.querySelector("[data-library-list]");
  const form = document.querySelector("[data-library-form]");
  const campaignFilter = document.querySelector("[data-library-campaign-filter]");
  const typeFilter = document.querySelector("[data-library-type-filter]");
  const systemFilter = document.querySelector("[data-library-system-filter]");
  const searchInput = document.querySelector("[data-library-search]");
  const summary = document.querySelector("[data-library-summary]");
  const campaigns = readCampaigns().filter(campaign => !campaign.archived);
  const summaryTypes = ["Monstros", "NPCs", "Itens", "Mapas", "Magias", "Anotacoes"];
  const typeIcons = {
    Monstros: "lib-icon-monster",
    NPCs: "dash-icon-group",
    Itens: "lib-icon-item",
    Mapas: "lib-icon-map",
    Anotacoes: "lib-icon-note",
    Magias: "lib-icon-magic",
    Armadilhas: "lib-icon-trap",
    Locais: "lib-icon-location",
    Encontros: "dash-icon-d20",
    Recompensas: "lib-icon-reward",
    "Documentos/lore": "dash-icon-book"
  };
  const legacyTypes = {
    Documentos: "Documentos/lore",
    Handouts: "Documentos/lore",
    Imagens: "Documentos/lore",
    Sons: "Documentos/lore",
    Tokens: "NPCs"
  };

  const campaignById = id => campaigns.find(campaign => campaign.id === id);
  const normalizeLibraryItem = (raw = {}) => {
    const matchedCampaign = campaignById(raw.campaignId) || campaigns.find(campaign => campaign.name === raw.campaign);
    const createdAt = raw.createdAt || new Date().toISOString();
    return {
      id: raw.id || `lib-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(raw.name || "Recurso sem nome"),
      type: libraryTypes.includes(raw.type) ? raw.type : (legacyTypes[raw.type] || "Documentos/lore"),
      campaignId: matchedCampaign?.id || "",
      system: raw.system || matchedCampaign?.system || "Todos os sistemas",
      description: String(raw.description || ""),
      tags: String(raw.tags || ""),
      visibility: raw.visibility || "Privado do Mestre",
      fileName: String(raw.fileName || ""),
      favorite: Boolean(raw.favorite),
      createdAt,
      updatedAt: raw.updatedAt || createdAt
    };
  };
  const readLibrary = () => readStore(MASTER_LIBRARY_KEY, []).map(normalizeLibraryItem);
  const saveLibrary = items => writeStore(MASTER_LIBRARY_KEY, items.map(normalizeLibraryItem));
  const addOption = (select, label, value) => select.add(new Option(label, value));

  const populateControls = () => {
    campaignFilter.replaceChildren();
    addOption(campaignFilter, "Todas as campanhas", "all");
    addOption(campaignFilter, "Recursos globais", "global");
    campaigns.forEach(campaign => addOption(campaignFilter, `Campanha: ${campaign.name}`, campaign.id));

    typeFilter.replaceChildren();
    addOption(typeFilter, "Todos os recursos", "all");
    libraryTypes.forEach(type => addOption(typeFilter, type, type));

    systemFilter.replaceChildren();
    addOption(systemFilter, "Todos os sistemas", "all");
    masterSystems.forEach(system => addOption(systemFilter, system, system));

    form.elements.type.replaceChildren();
    libraryTypes.forEach(type => addOption(form.elements.type, type, type));
    form.elements.campaignId.replaceChildren();
    addOption(form.elements.campaignId, "Global - todas as campanhas", "");
    campaigns.forEach(campaign => addOption(form.elements.campaignId, campaign.name, campaign.id));
    form.elements.system.replaceChildren();
    addOption(form.elements.system, "Todos os sistemas", "Todos os sistemas");
    masterSystems.forEach(system => addOption(form.elements.system, system, system));
  };

  const matchesScope = item => {
    if (campaignFilter.value === "global") return !item.campaignId;
    if (campaignFilter.value !== "all") return !item.campaignId || item.campaignId === campaignFilter.value;
    return true;
  };
  const matchesSystem = item => systemFilter.value === "all" || item.system === "Todos os sistemas" || item.system === systemFilter.value;
  const matchesSearch = item => {
    const term = searchInput.value.trim().toLocaleLowerCase("pt-BR");
    if (!term) return true;
    return [item.name, item.description, item.tags, item.type, campaignById(item.campaignId)?.name].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
  };
  const visibleWithoutType = items => items.filter(item => matchesScope(item) && matchesSystem(item) && matchesSearch(item));

  const renderSummary = items => {
    const scopedItems = visibleWithoutType(items);
    summary.replaceChildren();
    summaryTypes.forEach(type => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = typeFilter.value === type ? "active" : "";
      button.innerHTML = `<i><svg><use href="#${typeIcons[type]}"></use></svg></i><span><small>${type}</small><b>${scopedItems.filter(item => item.type === type).length}</b></span>`;
      button.addEventListener("click", () => {
        typeFilter.value = typeFilter.value === type ? "all" : type;
        renderLibrary();
      });
      summary.append(button);
    });
  };

  const scopeTitle = () => {
    if (campaignFilter.value === "global") return "Recursos globais";
    if (campaignFilter.value !== "all") return `Campanha: ${campaignById(campaignFilter.value)?.name || "Campanha"}`;
    return "Toda a biblioteca";
  };

  const createResourceCard = item => {
    const campaign = campaignById(item.campaignId);
    const article = document.createElement("article");
    article.className = `library-resource-card${item.favorite ? " favorite" : ""}`;
    article.dataset.libraryId = item.id;
    article.innerHTML = `
      <header>
        <i class="library-resource-icon"><svg><use href="#${typeIcons[item.type] || "dash-icon-book"}"></use></svg></i>
        <div><small data-type></small><h3></h3></div>
        <button class="library-favorite-toggle" type="button" data-library-action="favorite" aria-label="Favoritar recurso" title="Favoritar">&#9733;</button>
      </header>
      <div class="library-card-badges"><span data-scope></span><span data-system></span><span data-visibility></span></div>
      <p></p>
      <div class="library-card-tags" data-tags></div>
      <footer>
        <button type="button" data-library-action="use">Levar a mesa</button>
        <button type="button" data-library-action="edit">Editar</button>
        <button type="button" data-library-action="duplicate">Duplicar</button>
        <button class="danger" type="button" data-library-action="delete">Excluir</button>
      </footer>`;
    article.querySelector("[data-type]").textContent = item.type;
    article.querySelector("h3").textContent = item.name;
    article.querySelector("[data-scope]").textContent = campaign ? campaign.name : "Global";
    article.querySelector("[data-system]").textContent = item.system;
    article.querySelector("[data-visibility]").textContent = item.visibility;
    article.querySelector("p").textContent = item.description || "Sem descricao cadastrada.";
    const tags = article.querySelector("[data-tags]");
    const tagList = item.tags.split(",").map(tag => tag.trim()).filter(Boolean).slice(0, 4);
    tags.replaceChildren(...tagList.map(tag => {
      const span = document.createElement("span");
      span.textContent = `#${tag}`;
      return span;
    }));
    if (item.fileName) {
      const file = document.createElement("span");
      file.className = "library-file-tag";
      file.textContent = item.fileName;
      tags.append(file);
    }
    return article;
  };

  const renderLibrary = () => {
    const items = readLibrary();
    renderSummary(items);
    const filtered = visibleWithoutType(items)
      .filter(item => typeFilter.value === "all" || item.type === typeFilter.value)
      .sort((a, b) => Number(b.favorite) - Number(a.favorite) || new Date(b.updatedAt) - new Date(a.updatedAt));
    list.replaceChildren();
    document.querySelector("[data-library-result-count]").textContent = filtered.length;
    document.querySelector("[data-library-result-title]").textContent = typeFilter.value === "all" ? scopeTitle() : `${typeFilter.value} - ${scopeTitle()}`;
    if (!filtered.length) {
      const empty = document.createElement("div");
      empty.className = "library-empty";
      empty.innerHTML = `<i><svg><use href="#dash-icon-book"></use></svg></i><div><b>Nenhum recurso encontrado</b><span>Crie um recurso ou ajuste os filtros para explorar a biblioteca.</span></div><button class="master-btn" type="button">Novo recurso</button>`;
      empty.querySelector("button").addEventListener("click", () => openResourceDialog());
      list.append(empty);
      return;
    }
    filtered.forEach(item => list.append(createResourceCard(item)));
  };

  const openResourceDialog = (item = null) => {
    form.reset();
    form.elements.id.value = item?.id || "";
    form.elements.name.value = item?.name || "";
    form.elements.type.value = item?.type || (typeFilter.value !== "all" ? typeFilter.value : "Monstros");
    form.elements.campaignId.value = item?.campaignId || (campaignFilter.value !== "all" && campaignFilter.value !== "global" ? campaignFilter.value : "");
    form.elements.system.value = item?.system || campaignById(form.elements.campaignId.value)?.system || "Todos os sistemas";
    form.elements.visibility.value = item?.visibility || "Privado do Mestre";
    form.elements.description.value = item?.description || "";
    form.elements.tags.value = item?.tags || "";
    form.elements.favorite.checked = Boolean(item?.favorite);
    form.dataset.fileName = item?.fileName || "";
    document.querySelector("[data-library-current-file]").textContent = item?.fileName || "Nenhum arquivo selecionado.";
    document.querySelector("[data-library-upload]")?.classList.toggle("has-file", Boolean(item?.fileName));
    document.querySelector("[data-library-form-kicker]").textContent = item ? "Editar recurso" : "Novo recurso";
    document.querySelector("[data-library-form-title]").textContent = item ? item.name : "Adicionar a biblioteca";
    dialog.showModal();
  };

  document.querySelector("[data-library-new]")?.addEventListener("click", () => openResourceDialog());
  document.querySelectorAll("[data-library-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
  form.elements.campaignId.addEventListener("change", () => {
    const campaign = campaignById(form.elements.campaignId.value);
    if (campaign && form.elements.system.value === "Todos os sistemas") form.elements.system.value = campaign.system;
  });
  form.elements.file.addEventListener("change", () => {
    const file = form.elements.file.files?.[0];
    document.querySelector("[data-library-current-file]").textContent = file?.name || form.dataset.fileName || "Nenhum arquivo selecionado.";
    document.querySelector("[data-library-upload]")?.classList.toggle("has-file", Boolean(file?.name || form.dataset.fileName));
  });
  form.addEventListener("submit", event => {
    event.preventDefault();
    if (!form.reportValidity()) return;
    const data = new FormData(form);
    const items = readLibrary();
    const existing = items.find(item => item.id === data.get("id"));
    const file = form.elements.file.files?.[0];
    const item = {
      ...existing,
      id: existing?.id || `lib-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: String(data.get("name") || "").trim(),
      type: data.get("type"),
      campaignId: data.get("campaignId"),
      system: data.get("system"),
      description: String(data.get("description") || "").trim(),
      tags: String(data.get("tags") || "").trim(),
      visibility: data.get("visibility"),
      fileName: file?.name || form.dataset.fileName || "",
      favorite: data.get("favorite") === "on",
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    saveLibrary(existing ? items.map(saved => saved.id === item.id ? item : saved) : [item, ...items]);
    typeFilter.value = item.type;
    dialog.close();
    renderLibrary();
    masterToast(existing ? "Recurso atualizado." : "Recurso adicionado a biblioteca.");
  });

  list.addEventListener("click", event => {
    const button = event.target.closest("[data-library-action]");
    const card = event.target.closest("[data-library-id]");
    if (!button || !card) return;
    const items = readLibrary();
    const item = items.find(saved => saved.id === card.dataset.libraryId);
    if (!item) return;
    const action = button.dataset.libraryAction;
    if (action === "favorite") {
      saveLibrary(items.map(saved => saved.id === item.id ? {...saved, favorite: !saved.favorite, updatedAt: new Date().toISOString()} : saved));
      renderLibrary();
    }
    if (action === "edit") openResourceDialog(item);
    if (action === "duplicate") {
      saveLibrary([{...item, id: `lib-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, name: `${item.name} (copia)`, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}, ...items]);
      renderLibrary();
      masterToast("Recurso duplicado.");
    }
    if (action === "use") {
      const notes = readStore(MASTER_NOTES_KEY, {});
      const snippet = `[${item.type}] ${item.name}\n${item.description || "Sem descricao."}`;
      writeStore(MASTER_NOTES_KEY, {...notes, private: [notes.private, snippet].filter(Boolean).join("\n\n")});
      masterToast("Recurso adicionado as notas privadas da mesa.");
    }
    if (action === "delete") {
      if (!confirm(`Excluir ${item.name} da biblioteca?`)) return;
      saveLibrary(items.filter(saved => saved.id !== item.id));
      renderLibrary();
      masterToast("Recurso excluido.");
    }
  });

  [campaignFilter, typeFilter, systemFilter].forEach(control => control.addEventListener("change", renderLibrary));
  searchInput.addEventListener("input", renderLibrary);
  document.querySelector("[data-library-clear-filters]")?.addEventListener("click", () => {
    campaignFilter.value = "all";
    typeFilter.value = "all";
    systemFilter.value = "all";
    searchInput.value = "";
    renderLibrary();
  });

  document.querySelector("[data-library-export]")?.addEventListener("click", () => {
    const payload = JSON.stringify({version: 1, exportedAt: new Date().toISOString(), resources: readLibrary()}, null, 2);
    const link = document.createElement("a");
    link.href = URL.createObjectURL(new Blob([payload], {type: "application/json"}));
    link.download = `apex-realms-biblioteca-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(link.href);
    masterToast("Biblioteca exportada.");
  });
  document.querySelector("[data-library-import]")?.addEventListener("change", async event => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const imported = Array.isArray(parsed) ? parsed : parsed.resources;
      if (!Array.isArray(imported)) throw new Error("Formato invalido");
      const existing = readLibrary();
      const existingIds = new Set(existing.map(item => item.id));
      const normalized = imported.filter(item => item && item.name).map(item => normalizeLibraryItem({...item, id: existingIds.has(item.id) ? undefined : item.id}));
      saveLibrary([...normalized, ...existing]);
      renderLibrary();
      masterToast(`${normalized.length} recursos importados.`);
    } catch {
      masterToast("Arquivo de biblioteca invalido.");
    } finally {
      event.target.value = "";
    }
  });

  populateControls();
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
    const campaigns = readCampaigns();
    saveCampaigns(campaigns.map(item => item.id === id ? {...item, inviteCode: createInviteCode(campaigns), code: undefined, updatedAt: new Date().toISOString()} : item));
    masterToast("Novo codigo gerado.");
    renderInvitesPage();
  });
  document.querySelector("[data-revoke-invite]")?.addEventListener("click", () => {
    const select = document.querySelector("[data-invite-campaign]");
    const id = select.value;
    const campaigns = readCampaigns();
    saveCampaigns(campaigns.map(item => item.id === id ? {...item, inviteCode: createInviteCode(campaigns), code: undefined, updatedAt: new Date().toISOString()} : item));
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
