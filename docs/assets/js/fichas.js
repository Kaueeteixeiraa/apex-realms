// Real player sheet workflow for the static MVP fallback.
(() => {
  if (!document.body.classList.contains("player-sheets-page")) return;

  const store = window.ApexMvpStore;
  const user = window.ApexStaticAuth?.getUser?.();
  const ownerId = store?.normalizeEmail(user?.email) || "";
  const SHEETS_KEY = store?.keys.sheets || "apex_character_sheets";
  const LEGACY_KEY = store?.keys.sheetsLegacy || "apex-realms-master-sheets";
  const statuses = ["Rascunho", "Enviada", "Aprovada", "Precisa de ajuste"];
  const numericFields = ["level", "str", "dex", "con", "int", "wis", "cha", "hpCurrent", "hpMax", "armorClass", "initiative"];
  const dialog = document.querySelector("[data-player-sheet-dialog]");
  const form = document.querySelector("[data-player-sheet-form]");
  const list = document.querySelector("[data-player-sheets-list]");
  const campaignFilter = document.querySelector("[data-player-sheet-campaign]");
  const statusFilter = document.querySelector("[data-player-sheet-status]");
  const searchInput = document.querySelector("[data-player-sheet-search]");
  const joinedCampaigns = window.ApexInvites?.readJoinedCampaigns?.(user) || [];
  let portraitProcessing = Promise.resolve("");

  const readRawSheets = () => {
    const primary = store?.read(SHEETS_KEY, []) || [];
    return primary.length ? primary : (store?.read(LEGACY_KEY, []) || []);
  };
  const normalizeStatus = value => ({Pendente: "Enviada", Aprovada: "Aprovada", Bloqueada: "Precisa de ajuste"}[value] || (statuses.includes(value) ? value : "Rascunho"));
  const normalizeSheet = (raw = {}) => ({
    name: "Ficha sem nome", type: "Personagem", campaignId: "", system: "D&D 5e", className: "", race: "", level: 1,
    concept: "", str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, skills: "", hpCurrent: 0, hpMax: 0,
    armorClass: 10, initiative: 0, attacks: "", inventory: "", spells: "", notes: "", portrait: "", masterComment: "",
    revision: 1, ...raw,
    id: raw.id || store?.makeId("sheet") || `sheet-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ownerId: raw.ownerId || (raw.ownerRole === "player" ? (store?.normalizeEmail(raw.ownerEmail) || ownerId) : ""),
    ownerEmail: raw.ownerEmail || user?.email || "",
    owner: raw.owner || user?.nickname || user?.name || "Jogador",
    ownerRole: raw.ownerRole || (raw.ownerEmail ? "player" : "master"),
    status: normalizeStatus(raw.status),
    createdAt: raw.createdAt || new Date().toISOString(),
    updatedAt: raw.updatedAt || raw.createdAt || new Date().toISOString()
  });
  const readSheets = () => readRawSheets().map(normalizeSheet).filter(sheet => sheet.ownerRole === "player" && sheet.ownerId === ownerId);
  const saveSheets = ownedSheets => {
    const others = readRawSheets().map(normalizeSheet).filter(sheet => !(sheet.ownerRole === "player" && sheet.ownerId === ownerId));
    const merged = [...ownedSheets.map(normalizeSheet), ...others];
    store?.write(SHEETS_KEY, merged);
    store?.write(LEGACY_KEY, merged);
  };
  const campaignById = id => joinedCampaigns.find(campaign => campaign.id === id);
  const statusClass = status => ({Rascunho: "draft", Enviada: "submitted", Aprovada: "approved", "Precisa de ajuste": "changes"}[status] || "draft");

  function populateCampaigns() {
    joinedCampaigns.forEach(campaign => {
      campaignFilter.add(new Option(campaign.name, campaign.id));
      form.elements.campaignId.add(new Option(campaign.name, campaign.id));
    });
  }

  function createAvatar(container, sheet) {
    container.replaceChildren();
    if (sheet.portrait) {
      const image = document.createElement("img");
      image.src = sheet.portrait;
      image.alt = `Retrato de ${sheet.name}`;
      container.append(image);
    } else {
      const span = document.createElement("span");
      span.textContent = sheet.name.trim().charAt(0).toUpperCase() || "F";
      container.append(span);
    }
  }

  function matchesFilters(sheet) {
    if (campaignFilter.value !== "all" && sheet.campaignId !== campaignFilter.value) return false;
    if (statusFilter.value !== "all" && sheet.status !== statusFilter.value) return false;
    const term = searchInput.value.trim().toLocaleLowerCase("pt-BR");
    return !term || [sheet.name, sheet.className, sheet.race, campaignById(sheet.campaignId)?.name].some(value => String(value || "").toLocaleLowerCase("pt-BR").includes(term));
  }

  function renderSummary(sheets) {
    const summary = document.querySelector("[data-player-sheet-summary]");
    summary.replaceChildren();
    statuses.forEach(status => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `${statusClass(status)}${statusFilter.value === status ? " active" : ""}`;
      button.innerHTML = `<span><small>${status}</small><b>${sheets.filter(sheet => sheet.status === status).length}</b></span>`;
      button.addEventListener("click", () => {
        statusFilter.value = statusFilter.value === status ? "all" : status;
        render();
      });
      summary.append(button);
    });
  }

  function createCard(sheet) {
    const campaign = campaignById(sheet.campaignId);
    const article = document.createElement("article");
    article.className = `player-sheet-card ${statusClass(sheet.status)}`;
    article.dataset.sheetId = sheet.id;
    article.innerHTML = `<div class="player-sheet-card-art"><div></div><mark></mark></div><section><header><div><h3></h3><p></p></div><small></small></header><div class="player-sheet-card-stats"><span><small>Nivel</small><b data-level></b></span><span><small>PV</small><b data-hp></b></span><span><small>CA</small><b data-ac></b></span></div><p class="player-sheet-comment" hidden></p><footer><button type="button" data-sheet-action="edit">Abrir e editar</button><button type="button" data-sheet-action="submit">Enviar ao Mestre</button><button type="button" data-sheet-action="duplicate">Duplicar</button><button class="danger" type="button" data-sheet-action="delete">Excluir</button></footer></section>`;
    createAvatar(article.querySelector(".player-sheet-card-art > div"), sheet);
    article.querySelector("mark").textContent = sheet.status;
    article.querySelector("h3").textContent = sheet.name;
    article.querySelector("header p").textContent = [sheet.race, sheet.className].filter(Boolean).join(" · ") || "Personagem em construcao";
    article.querySelector("header small").textContent = campaign?.name || "Sem campanha";
    article.querySelector("[data-level]").textContent = sheet.level;
    article.querySelector("[data-hp]").textContent = `${sheet.hpCurrent}/${sheet.hpMax}`;
    article.querySelector("[data-ac]").textContent = sheet.armorClass;
    const comment = article.querySelector(".player-sheet-comment");
    if (sheet.masterComment) {
      comment.hidden = false;
      comment.textContent = `Mestre: ${sheet.masterComment}`;
    }
    const submit = article.querySelector("[data-sheet-action='submit']");
    submit.hidden = sheet.status === "Enviada" || sheet.status === "Aprovada" || !sheet.campaignId;
    article.querySelector("[data-sheet-action='delete']").hidden = sheet.status === "Aprovada";
    return article;
  }

  function render() {
    const sheets = readSheets().sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    renderSummary(sheets);
    const filtered = sheets.filter(matchesFilters);
    document.querySelector("[data-player-sheet-count]").textContent = filtered.length;
    list.replaceChildren();
    if (!filtered.length) {
      list.innerHTML = `<div class="player-sheets-empty"><b>Nenhuma ficha encontrada</b><span>Crie um personagem ou ajuste os filtros.</span><button class="btn btn-primary" type="button">Criar primeira ficha</button></div>`;
      list.querySelector("button").addEventListener("click", () => openEditor());
      return;
    }
    filtered.forEach(sheet => list.append(createCard(sheet)));
  }

  function activateTab(name) {
    document.querySelectorAll("[data-player-sheet-tab]").forEach(button => button.classList.toggle("active", button.dataset.playerSheetTab === name));
    document.querySelectorAll("[data-player-sheet-panel]").forEach(panel => panel.classList.toggle("active", panel.dataset.playerSheetPanel === name));
  }

  function openEditor(sheet = null) {
    const value = normalizeSheet(sheet || {name: "", status: "Rascunho", ownerRole: "player", ownerId});
    form.reset();
    Object.entries(value).forEach(([name, fieldValue]) => {
      const input = form.elements.namedItem(name);
      if (input && input.type !== "file") input.value = fieldValue ?? "";
    });
    form.elements.id.value = sheet?.id || "";
    form.dataset.portrait = value.portrait || "";
    createAvatar(document.querySelector("[data-player-sheet-avatar]"), value);
    document.querySelector("[data-player-sheet-kicker]").textContent = sheet ? value.status.toUpperCase() : "NOVA FICHA";
    document.querySelector("[data-player-sheet-title]").textContent = sheet?.name || "Criar personagem";
    document.querySelector("[data-player-sheet-review-state]").textContent = value.status === "Aprovada" ? "Ao salvar uma ficha aprovada, uma nova revisao sera enviada ao Mestre." : "Salve e envie ao Mestre quando estiver pronta.";
    document.querySelector("[data-player-sheet-save-hint]").textContent = `${value.status} · revisao ${value.revision}`;
    const review = document.querySelector("[data-player-sheet-review]");
    review.hidden = !value.masterComment;
    review.querySelector("p").textContent = value.masterComment || "";
    activateTab("identity");
    dialog.showModal();
  }

  function preparePortrait(file) {
    return new Promise((resolve, reject) => {
      if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) return reject(new Error("Use uma imagem JPG, PNG ou WEBP."));
      if (file.size > 5 * 1024 * 1024) return reject(new Error("O retrato deve ter no maximo 5 MB."));
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("Nao foi possivel ler o retrato."));
      reader.onload = () => {
        const image = new Image();
        image.onerror = () => reject(new Error("O arquivo nao e uma imagem valida."));
        image.onload = () => {
          const size = 420;
          const scale = Math.max(size / image.width, size / image.height);
          const width = image.width * scale;
          const height = image.height * scale;
          const canvas = document.createElement("canvas");
          canvas.width = size;
          canvas.height = size;
          canvas.getContext("2d").drawImage(image, (size - width) / 2, (size - height) / 2, width, height);
          resolve(canvas.toDataURL("image/webp", .78));
        };
        image.src = String(reader.result);
      };
      reader.readAsDataURL(file);
    });
  }

  async function saveForm(event) {
    event.preventDefault();
    if (!form.reportValidity()) return;
    await portraitProcessing;
    const data = Object.fromEntries(new FormData(form).entries());
    const sheets = readSheets();
    const existing = sheets.find(sheet => sheet.id === data.id);
    numericFields.forEach(name => { data[name] = Number(data[name] || 0); });
    delete data.portraitFile;
    const approvedEdit = existing?.status === "Aprovada";
    const sheet = normalizeSheet({
      ...existing,
      ...data,
      id: existing?.id || undefined,
      portrait: form.dataset.portrait || "",
      ownerRole: "player",
      ownerId,
      status: approvedEdit ? "Enviada" : (existing?.status || "Rascunho"),
      revision: Number(existing?.revision || 1) + (approvedEdit ? 1 : 0),
      submittedAt: approvedEdit ? new Date().toISOString() : existing?.submittedAt,
      updatedAt: new Date().toISOString()
    });
    saveSheets(existing ? sheets.map(saved => saved.id === sheet.id ? sheet : saved) : [sheet, ...sheets]);
    dialog.close();
    render();
  }

  function submitSheet(sheet) {
    if (!sheet.campaignId) return;
    const sheets = readSheets();
    saveSheets(sheets.map(saved => saved.id === sheet.id ? {...saved, status: "Enviada", submittedAt: new Date().toISOString(), updatedAt: new Date().toISOString()} : saved));
    render();
  }

  document.querySelector("[data-player-sheet-new]").addEventListener("click", () => openEditor());
  document.querySelectorAll("[data-player-sheet-close]").forEach(button => button.addEventListener("click", () => dialog.close()));
  dialog.addEventListener("click", event => { if (event.target === dialog) dialog.close(); });
  document.querySelectorAll("[data-player-sheet-tab]").forEach(button => button.addEventListener("click", () => activateTab(button.dataset.playerSheetTab)));
  form.addEventListener("submit", saveForm);
  form.elements.portraitFile.addEventListener("change", () => {
    const file = form.elements.portraitFile.files?.[0];
    if (!file) return;
    portraitProcessing = preparePortrait(file).then(source => {
      form.dataset.portrait = source;
      createAvatar(document.querySelector("[data-player-sheet-avatar]"), {name: form.elements.name.value || "Ficha", portrait: source});
      return source;
    }).catch(error => {
      form.elements.portraitFile.value = "";
      alert(error.message);
      return form.dataset.portrait || "";
    });
  });
  form.elements.campaignId.addEventListener("change", () => {
    const campaign = campaignById(form.elements.campaignId.value);
    if (campaign) form.elements.system.value = campaign.system || "D&D 5e";
  });
  list.addEventListener("click", event => {
    const button = event.target.closest("[data-sheet-action]");
    const card = event.target.closest("[data-sheet-id]");
    if (!button || !card) return;
    const sheets = readSheets();
    const sheet = sheets.find(item => item.id === card.dataset.sheetId);
    if (!sheet) return;
    const action = button.dataset.sheetAction;
    if (action === "edit") openEditor(sheet);
    if (action === "submit") submitSheet(sheet);
    if (action === "duplicate") {
      saveSheets([{...sheet, id: undefined, name: `${sheet.name} (copia)`, status: "Rascunho", masterComment: "", revision: 1, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString()}, ...sheets]);
      render();
    }
    if (action === "delete" && confirm(`Excluir a ficha ${sheet.name}?`)) {
      saveSheets(sheets.filter(item => item.id !== sheet.id));
      render();
    }
  });
  [campaignFilter, statusFilter].forEach(control => control.addEventListener("change", render));
  searchInput.addEventListener("input", render);
  document.querySelector("[data-player-sheet-clear]").addEventListener("click", () => {
    campaignFilter.value = "all";
    statusFilter.value = "all";
    searchInput.value = "";
    render();
  });

  if (user?.role !== "player") {
    document.querySelector("[data-player-sheet-new]").disabled = true;
    list.innerHTML = `<div class="player-sheets-empty"><b>Area exclusiva do jogador</b><span>Use uma conta de jogador para criar e enviar fichas.</span></div>`;
    return;
  }
  populateCampaigns();
  render();
})();
