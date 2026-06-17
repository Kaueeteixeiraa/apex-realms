const joinRoomModal = document.querySelector("#join-room");
const joinRoomForm = document.querySelector("#join-room-form");
const roomCodeInput = document.querySelector("#room-code");
const roomCodeFeedback = document.querySelector("#join-room-feedback");
const campaignGrid = document.querySelector("#dashboard-campaign-grid");
const campaignCount = document.querySelector("#dashboard-campaign-count");
const summaryCampaignCount = document.querySelector("#dashboard-summary-campaigns");
const campaignsKey = "apex-realms-campaigns";

function readSavedCampaigns() {
  try {
    const campaigns = window.ApexInvites?.readCampaigns?.() || JSON.parse(localStorage.getItem(campaignsKey) || "[]");
    return Array.isArray(campaigns) ? campaigns : [];
  } catch {
    localStorage.removeItem(campaignsKey);
    return [];
  }
}

function saveCampaigns(campaigns) {
  if (window.ApexInvites?.saveCampaigns) window.ApexInvites.saveCampaigns(campaigns);
  else localStorage.setItem(campaignsKey, JSON.stringify(campaigns));
}

function currentDashboardUser() {
  return window.ApexStaticAuth?.getUser?.() || null;
}

function visibleDashboardCampaigns() {
  const user = currentDashboardUser();
  if (user?.role === "player" && window.ApexInvites?.readJoinedCampaigns) return window.ApexInvites.readJoinedCampaigns(user);
  return readSavedCampaigns();
}

function updateCampaignCounters(total) {
  if (campaignCount) campaignCount.textContent = total;
  if (summaryCampaignCount) summaryCampaignCount.textContent = total;
}

function renderEmptyCampaigns() {
  const user = currentDashboardUser();
  const isPlayer = user?.role === "player";
  campaignGrid.innerHTML = isPlayer
    ? `<div class="empty-dashboard-card"><b>Nenhuma campanha vinculada</b><span>Use o codigo AR compartilhado pelo mestre para entrar em uma campanha.</span><button class="btn btn-primary" type="button" data-open-join-room>Entrar por convite</button></div>`
    : `<div class="empty-dashboard-card"><b>Nenhuma campanha criada ainda</b><span>Quando um mestre criar uma campanha, ela aparecera aqui com opcoes de sala e exclusao.</span><a class="btn btn-primary" href="criar-campanha.html">Criar campanha</a></div>`;
}

function renderSavedCampaigns() {
  if (!campaignGrid) return;
  const user = currentDashboardUser();
  const savedCampaigns = visibleDashboardCampaigns();
  updateCampaignCounters(savedCampaigns.length);
  campaignGrid.innerHTML = "";
  if (!savedCampaigns.length) {
    renderEmptyCampaigns();
    return;
  }
  savedCampaigns.forEach(campaign => {
    const playerCount = Array.isArray(campaign.players) ? campaign.players.length : 0;
    const playerLimit = campaign.maxPlayers || campaign.limit || 1;
    const inviteCode = campaign.inviteCode || campaign.code || "";
    const isPlayer = user?.role === "player";
    const card = document.createElement("article");
    card.className = "room-card saved-campaign-card";
    card.dataset.campaignId = campaign.id;
    card.innerHTML = `<div class="room-cover"><span></span><b></b></div><div class="room-body"><small></small><h3></h3><p></p><div class="room-players"><span></span></div><div class="room-actions"><a href="salas.html">Ver sala</a>${isPlayer ? "" : `<button type="button" class="campaign-delete-button" data-delete-campaign>Excluir</button>`}</div></div>`;
    card.querySelector(".room-cover span").textContent = campaign.status || "PREPARACAO";
    card.querySelector(".room-cover b").textContent = campaign.system || "Sistema proprio";
    card.querySelector(".room-body small").textContent = isPlayer ? `CONVITE ${inviteCode}` : `CODIGO ${inviteCode}`;
    card.querySelector(".room-body h3").textContent = campaign.name || "Campanha sem nome";
    card.querySelector(".room-body p").textContent = campaign.description || "Sem descricao cadastrada.";
    card.querySelector(".room-players span").textContent = `${playerCount} / ${playerLimit} jogadores - ${campaign.visibility === "private" || campaign.private !== false ? "Privada" : "Publica"}`;
    if (campaign.image || campaign.banner) card.querySelector(".room-cover").style.backgroundImage = `url("${campaign.image || campaign.banner}")`;
    else card.querySelector(".room-cover").classList.add("void-cover");
    campaignGrid.append(card);
  });
}

document.addEventListener("click", event => {
  const openJoinButton = event.target.closest("[data-open-join-room]");
  if (openJoinButton) joinRoomModal?.classList.add("open");
});

campaignGrid?.addEventListener("click", event => {
  const deleteButton = event.target.closest("[data-delete-campaign]");
  if (!deleteButton) return;
  const card = deleteButton.closest("[data-campaign-id]");
  if (!card) return;
  if (!confirm("Excluir esta campanha? Esta acao nao pode ser desfeita.")) return;
  const remainingCampaigns = readSavedCampaigns().filter(campaign => campaign.id !== card.dataset.campaignId);
  saveCampaigns(remainingCampaigns);
  renderSavedCampaigns();
  showPrototypeToast?.("Campanha excluida.");
});

document.addEventListener("keydown", event => {
  if (event.key === "Escape") joinRoomModal?.classList.remove("open");
});

roomCodeInput?.addEventListener("input", () => {
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "").slice(0, 12);
  roomCodeFeedback.textContent = "";
  roomCodeFeedback.classList.remove("success");
});

joinRoomForm?.addEventListener("submit", event => {
  event.preventDefault();
  if (!joinRoomForm.reportValidity()) return;
  const normalizedCode = window.ApexInvites?.normalizeCode?.(roomCodeInput.value) || roomCodeInput.value;
  roomCodeInput.value = normalizedCode;
  const result = window.ApexInvites?.joinByCode?.(normalizedCode);
  roomCodeFeedback.classList.toggle("success", Boolean(result?.ok));
  roomCodeFeedback.textContent = result?.message || "Nao foi possivel validar este convite.";
  if (result?.ok) {
    renderSavedCampaigns();
    setTimeout(() => joinRoomModal?.classList.remove("open"), 850);
  }
});

renderSavedCampaigns();
