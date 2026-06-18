// Static player workspace. It keeps the GitHub Pages build useful until the backend is connected.
(() => {
  const page = document.body.dataset.playerPage;
  if (!page) return;
  if (window.ApexStaticAuth?.getUser?.()?.role !== "player") return;

  const KEYS = {
    campaigns: "apex-realms-campaigns",
    players: "apex_players",
    sheets: "apex-realms-master-sheets",
    sheetsAlias: "apex_character_sheets",
    profile: "apex_player_profile"
  };

  const user = () => window.ApexStaticAuth?.getUser?.() || {};
  const now = () => new Date().toISOString();
  const uid = prefix => `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  const normalizeEmail = value => String(value || "").trim().toLowerCase();
  const userKey = () => normalizeEmail(user().email || "guest");
  const sheetKey = () => `apex_player_sheet:${userKey()}`;

  function readStore(key, fallback) {
    try {
      const data = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
      if (Array.isArray(fallback)) return Array.isArray(data) ? data : fallback;
      return data && typeof data === "object" ? data : fallback;
    } catch {
      localStorage.removeItem(key);
      return fallback;
    }
  }

  function writeStore(key, value) {
    localStorage.setItem(key, JSON.stringify(value));
  }

  function toast(message) {
    if (typeof showPrototypeToast === "function") showPrototypeToast(message);
  }

  function formatDate(value) {
    const date = new Date(value || "");
    return Number.isNaN(date.getTime()) ? "A definir" : date.toLocaleDateString("pt-BR", {day: "2-digit", month: "short", year: "numeric"});
  }

  function allCampaigns() {
    const campaigns = window.ApexInvites?.readCampaigns?.() || readStore(KEYS.campaigns, []);
    return campaigns.filter(campaign => !campaign.archived);
  }

  function joinedCampaigns() {
    const account = user();
    const joined = window.ApexInvites?.readJoinedCampaigns?.(account) || [];
    const byId = new Map(joined.map(campaign => [campaign.id, campaign]));
    allCampaigns().forEach(campaign => {
      const players = Array.isArray(campaign.players) ? campaign.players : [];
      const linked = players.find(player => normalizeEmail(player.email) === normalizeEmail(account.email));
      if (linked && !byId.has(campaign.id)) byId.set(campaign.id, {...campaign, joinStatus: linked.status || "Aprovado", joinedAt: linked.joinedAt});
    });
    return [...byId.values()];
  }

  function activeCampaign() {
    return joinedCampaigns()[0] || null;
  }

  function getProfile() {
    const account = user();
    return {
      displayName: account.name || "Jogador Apex",
      nickname: account.nickname || "Aventureiro",
      bio: "",
      favoriteSystem: "D&D 5e",
      playStyle: "Exploracao, combate tatico e historia em grupo.",
      avatar: account.avatar || "",
      ...readStore(KEYS.profile, {})
    };
  }

  function saveProfile(profile) {
    writeStore(KEYS.profile, profile);
    const current = window.ApexStaticAuth?.getUser?.();
    if (current) {
      window.ApexStaticAuth.saveUser({...current, name: profile.displayName, nickname: profile.nickname, avatar: profile.avatar || current.avatar});
      window.ApexStaticAuth.applyUser();
    }
  }

  function defaultSheet() {
    const profile = getProfile();
    const campaign = activeCampaign();
    return {
      id: `sheet-${userKey() || "player"}`,
      ownerEmail: userKey(),
      campaignId: campaign?.id || "",
      name: profile.nickname || "Personagem Apex",
      type: "Personagem",
      race: "Humano",
      className: "Aventureiro",
      level: 1,
      hpCurrent: 12,
      hpMax: 12,
      armorClass: 10,
      initiative: 0,
      resourceCurrent: 0,
      resourceMax: 0,
      attributes: "FOR 10, DES 10, CON 10, INT 10, SAB 10, CAR 10",
      skills: "Percepcao, Atletismo, Investigacao",
      inventory: "Mochila, corda, racoes, arma favorita",
      spells: "",
      story: "Um aventureiro pronto para entrar no Apex Realms.",
      custom: "",
      portrait: "",
      updatedAt: now()
    };
  }

  function getSheet() {
    const saved = readStore(sheetKey(), null);
    const sheet = saved && typeof saved === "object" ? {...defaultSheet(), ...saved} : defaultSheet();
    const campaign = activeCampaign();
    if (campaign && !sheet.campaignId) sheet.campaignId = campaign.id;
    return sheet;
  }

  function saveSharedSheets(sheet) {
    const primary = readStore(KEYS.sheets, []);
    const sheets = primary.filter(item => item.id !== sheet.id && item.ownerEmail !== sheet.ownerEmail);
    const next = [{...sheet, updatedAt: now()}, ...sheets];
    writeStore(KEYS.sheets, next);
    writeStore(KEYS.sheetsAlias, next);
  }

  function ensurePlayerRecord(sheet) {
    const campaign = allCampaigns().find(item => item.id === sheet.campaignId) || activeCampaign();
    if (!campaign || !userKey()) return;
    const players = readStore(KEYS.players, []);
    const existing = players.find(player => player.campaignId === campaign.id && normalizeEmail(player.email) === userKey());
    const record = {
      id: existing?.id || `player-${userKey().replace(/[^a-z0-9]/g, "-")}`,
      campaignId: campaign.id,
      name: getProfile().displayName,
      nickname: getProfile().nickname,
      email: userKey(),
      sheetId: sheet.id,
      status: existing?.status || "Aprovado",
      avatar: getProfile().avatar || "",
      permissions: {
        viewLibrary: true,
        rollDice: true,
        moveToken: true,
        useChat: true,
        ...(existing?.permissions || {})
      },
      joinedAt: existing?.joinedAt || now(),
      lastAccess: now(),
      updatedAt: now()
    };
    writeStore(KEYS.players, [record, ...players.filter(player => {
      const sameId = player.id === record.id;
      const sameSeat = player.campaignId === record.campaignId && normalizeEmail(player.email) === record.email;
      return !sameId && !sameSeat;
    })]);
  }

  function saveSheet(sheet) {
    const normalized = {...defaultSheet(), ...sheet, ownerEmail: userKey(), type: "Personagem", updatedAt: now()};
    writeStore(sheetKey(), normalized);
    saveSharedSheets(normalized);
    ensurePlayerRecord(normalized);
    return normalized;
  }

  function ensureSheetForTable() {
    const campaign = activeCampaign();
    const sheet = getSheet();
    if (campaign && !sheet.campaignId) sheet.campaignId = campaign.id;
    saveSheet(sheet);
  }

  function renderUserChrome() {
    const profile = getProfile();
    document.querySelectorAll("[data-player-name]").forEach(element => { element.textContent = profile.displayName; });
    document.querySelectorAll("[data-player-nickname]").forEach(element => { element.textContent = profile.nickname; });
    document.querySelectorAll("[data-player-initial]").forEach(element => { element.textContent = (profile.displayName || "J").trim().charAt(0).toUpperCase(); });
    document.querySelectorAll("[data-player-avatar]").forEach(element => {
      if (!profile.avatar) return;
      element.innerHTML = "";
      const image = document.createElement("img");
      image.src = profile.avatar;
      image.alt = "";
      element.append(image);
    });
  }

  function recentRolls() {
    return joinedCampaigns().flatMap(campaign => {
      const state = readStore(`apex-realms-vtt:${campaign.id}`, {});
      return Array.isArray(state.rolls) ? state.rolls.map(roll => ({...roll, campaignName: campaign.name})) : [];
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, 5);
  }

  function bindJoinForm(form) {
    if (!form) return;
    form.addEventListener("submit", event => {
      event.preventDefault();
      const code = String(new FormData(form).get("inviteCode") || "").trim();
      if (!code) return;
      const result = window.ApexInvites?.joinByCode?.(code, user());
      toast(result?.message || "Convite processado.");
      if (result?.ok) {
        const sheet = getSheet();
        sheet.campaignId = result.campaign.id;
        saveSheet(sheet);
        setTimeout(() => window.location.reload(), 450);
      }
    });
  }

  function campaignCard(campaign) {
    const article = document.createElement("article");
    article.className = "player-list-item";
    const status = campaign.joinStatus || "Aprovado";
    article.innerHTML = `<div><h3></h3><p></p></div><span class="player-pill"></span>`;
    article.querySelector("h3").textContent = campaign.name || "Campanha sem nome";
    article.querySelector("p").textContent = `${campaign.system || "Sistema proprio"} - ${campaign.description || "Mesa pronta para a aventura."}`;
    article.querySelector(".player-pill").textContent = status;
    return article;
  }

  function renderDashboard() {
    if (page !== "dashboard") return;
    const campaigns = joinedCampaigns();
    const sheet = getSheet();
    const rolls = recentRolls();
    document.querySelector("[data-player-campaign-count]").textContent = campaigns.length;
    document.querySelector("[data-player-character-name]").textContent = sheet.name;
    document.querySelector("[data-player-hp]").textContent = `${sheet.hpCurrent}/${sheet.hpMax}`;
    document.querySelector("[data-player-level]").textContent = `Nv. ${sheet.level}`;

    const active = document.querySelector("[data-player-active-campaign]");
    active.replaceChildren();
    if (!campaigns.length) {
      active.innerHTML = `<div class="player-empty"><b>Nenhuma campanha vinculada</b><p>Use um codigo de convite do Mestre para entrar em uma mesa.</p></div>`;
    } else {
      campaigns.slice(0, 3).forEach(campaign => active.append(campaignCard(campaign)));
    }

    const rollList = document.querySelector("[data-player-recent-rolls]");
    rollList.replaceChildren();
    if (!rolls.length) {
      rollList.innerHTML = `<div class="player-empty">Suas rolagens aparecerao aqui quando voce usar a mesa.</div>`;
    } else {
      rolls.forEach(roll => {
        const item = document.createElement("article");
        item.className = "player-list-item";
        item.innerHTML = `<div><h3></h3><p></p></div><span class="player-pill"></span>`;
        item.querySelector("h3").textContent = `${roll.formula} = ${roll.total}`;
        item.querySelector("p").textContent = roll.campaignName || "Mesa";
        item.querySelector(".player-pill").textContent = new Date(roll.createdAt).toLocaleTimeString("pt-BR", {hour: "2-digit", minute: "2-digit"});
        rollList.append(item);
      });
    }
    bindJoinForm(document.querySelector("[data-player-join-form]"));
  }

  function renderCampaigns() {
    if (page !== "campaigns") return;
    const list = document.querySelector("[data-player-campaign-list]");
    const available = document.querySelector("[data-player-available-list]");
    const joined = joinedCampaigns();
    list.replaceChildren();
    available.replaceChildren();
    if (!joined.length) list.innerHTML = `<div class="player-empty">Voce ainda nao entrou em nenhuma campanha.</div>`;
    else joined.forEach(campaign => list.append(campaignCard(campaign)));

    const joinedIds = new Set(joined.map(campaign => campaign.id));
    const visible = allCampaigns().filter(campaign => !joinedIds.has(campaign.id)).slice(0, 5);
    if (!visible.length) available.innerHTML = `<div class="player-empty">Nenhuma campanha publica ou pendente encontrada neste navegador.</div>`;
    else visible.forEach(campaign => {
      const card = campaignCard({...campaign, joinStatus: campaign.inviteCode || "Convite"});
      available.append(card);
    });
    bindJoinForm(document.querySelector("[data-player-join-form]"));
  }

  function renderSheet() {
    if (page !== "sheet") return;
    const form = document.querySelector("[data-player-sheet-form]");
    const sheet = getSheet();
    Object.entries(sheet).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value ?? "";
    });
    const campaignSelect = form.elements.campaignId;
    if (campaignSelect) {
      campaignSelect.replaceChildren();
      campaignSelect.add(new Option("Sem campanha", ""));
      joinedCampaigns().forEach(campaign => campaignSelect.add(new Option(campaign.name, campaign.id)));
      campaignSelect.value = sheet.campaignId || "";
    }
    updateSheetPreview(sheet);
    form.addEventListener("submit", event => {
      event.preventDefault();
      const data = Object.fromEntries(new FormData(form).entries());
      const next = saveSheet({
        ...sheet,
        ...data,
        level: Number(data.level || 1),
        hpCurrent: Number(data.hpCurrent || 0),
        hpMax: Number(data.hpMax || 0),
        armorClass: Number(data.armorClass || 10),
        initiative: Number(data.initiative || 0),
        resourceCurrent: Number(data.resourceCurrent || 0),
        resourceMax: Number(data.resourceMax || 0)
      });
      updateSheetPreview(next);
      toast("Ficha do jogador salva e sincronizada com a mesa.");
    });
  }

  function updateSheetPreview(sheet) {
    const preview = document.querySelector("[data-player-sheet-preview]");
    if (!preview) return;
    const percent = sheet.hpMax ? Math.max(0, Math.min(100, Math.round(sheet.hpCurrent / sheet.hpMax * 100))) : 0;
    preview.innerHTML = `<small>${sheet.race} - ${sheet.className}</small><h3>${sheet.name}</h3><p>Nivel ${sheet.level} - Defesa ${sheet.armorClass} - Iniciativa ${sheet.initiative}</p><div class="player-hp-bar"><i style="width:${percent}%"></i></div><p>${sheet.hpCurrent}/${sheet.hpMax} PV</p>`;
  }

  function renderProfile() {
    if (page !== "profile") return;
    const form = document.querySelector("[data-player-profile-form]");
    const profile = getProfile();
    Object.entries(profile).forEach(([key, value]) => {
      if (form.elements[key]) form.elements[key].value = value ?? "";
    });
    form.querySelector("[data-avatar-upload]")?.addEventListener("change", event => {
      const file = event.target.files?.[0];
      if (!file) return;
      if (!file.type.startsWith("image/") || file.size > 3 * 1024 * 1024) {
        toast("Use uma imagem de ate 3 MB.");
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        form.elements.avatar.value = String(reader.result || "");
        toast("Avatar preparado. Clique em salvar perfil.");
      };
      reader.readAsDataURL(file);
    });
    form.addEventListener("submit", event => {
      event.preventDefault();
      const next = {...profile, ...Object.fromEntries(new FormData(form).entries())};
      saveProfile(next);
      const sheet = getSheet();
      saveSheet(sheet);
      renderUserChrome();
      toast("Perfil do jogador salvo.");
    });
  }

  renderUserChrome();
  ensureSheetForTable();
  renderDashboard();
  renderCampaigns();
  renderSheet();
  renderProfile();
})();
