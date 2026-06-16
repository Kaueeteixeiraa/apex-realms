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
    const campaigns = JSON.parse(localStorage.getItem(campaignsKey) || "[]");
    return Array.isArray(campaigns) ? campaigns : [];
  } catch {
    localStorage.removeItem(campaignsKey);
    return [];
  }
}

function saveCampaigns(campaigns) {
  localStorage.setItem(campaignsKey, JSON.stringify(campaigns));
}

function updateCampaignCounters(total) {
  if (campaignCount) campaignCount.textContent = total;
  if (summaryCampaignCount) summaryCampaignCount.textContent = total;
}

function renderEmptyCampaigns() {
  campaignGrid.innerHTML = `<div class="empty-dashboard-card"><b>Nenhuma campanha criada ainda</b><span>Quando um mestre criar uma campanha, ela aparecera aqui com opcoes de sala e exclusao.</span><a class="btn btn-primary" href="criar-campanha.html">Criar campanha</a></div>`;
}

function renderSavedCampaigns() {
  if (!campaignGrid) return;
  const savedCampaigns = readSavedCampaigns();
  updateCampaignCounters(savedCampaigns.length);
  campaignGrid.innerHTML = "";
  if (!savedCampaigns.length) {
    renderEmptyCampaigns();
    return;
  }
  savedCampaigns.forEach(campaign => {
    const card = document.createElement("article");
    card.className = "room-card saved-campaign-card";
    card.dataset.campaignId = campaign.id;
    card.innerHTML = `<div class="room-cover"><span>PREPARACAO</span><b></b></div><div class="room-body"><small>CAMPANHA CRIADA</small><h3></h3><p></p><div class="room-players"><span></span></div><div class="room-actions"><a href="salas.html">Ver sala</a><button type="button" class="campaign-delete-button" data-delete-campaign>Excluir</button></div></div>`;
    card.querySelector(".room-cover b").textContent = campaign.system || "Sistema proprio";
    card.querySelector(".room-body h3").textContent = campaign.name || "Campanha sem nome";
    card.querySelector(".room-body p").textContent = campaign.description || "Sem descricao cadastrada.";
    card.querySelector(".room-players span").textContent = `0 / ${campaign.limit || 1} jogadores - ${campaign.visibility === "private" ? "Privada" : "Publica"}`;
    if (campaign.image) card.querySelector(".room-cover").style.backgroundImage = `url("${campaign.image}")`;
    else card.querySelector(".room-cover").classList.add("void-cover");
    campaignGrid.append(card);
  });
}

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
  roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
  roomCodeFeedback.textContent = "";
});

joinRoomForm?.addEventListener("submit", event => {
  event.preventDefault();
  if (!joinRoomForm.reportValidity()) return;
  roomCodeFeedback.textContent = "Codigo recebido. A sala sera aberta quando existir uma campanha vinculada.";
  roomCodeFeedback.classList.add("success");
});

renderSavedCampaigns();
