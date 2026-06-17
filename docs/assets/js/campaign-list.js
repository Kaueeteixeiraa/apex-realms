const managementGrid = document.querySelector("#campaign-management-grid");
const campaignsTotal = document.querySelector("#campaigns-total");
const managementCampaignsKey = "apex-realms-campaigns";

function readManagementCampaigns() {
  try {
    const campaigns = window.ApexInvites?.readCampaigns?.() || JSON.parse(localStorage.getItem(managementCampaignsKey) || "[]");
    return Array.isArray(campaigns) ? campaigns : [];
  } catch {
    localStorage.removeItem(managementCampaignsKey);
    return [];
  }
}

function saveManagementCampaigns(campaigns) {
  if (window.ApexInvites?.saveCampaigns) window.ApexInvites.saveCampaigns(campaigns);
  else localStorage.setItem(managementCampaignsKey, JSON.stringify(campaigns));
}

function renderManagementCampaigns() {
  if (!managementGrid) return;
  const campaigns = readManagementCampaigns();
  if (campaignsTotal) campaignsTotal.textContent = campaigns.length;
  managementGrid.innerHTML = "";
  if (!campaigns.length) {
    managementGrid.innerHTML = `<a class="campaign-create-card" href="criar-campanha.html"><i>+</i><small>NOVA HISTORIA</small><h2>Criar campanha</h2><p>Configure sistema, jogadores, privacidade e recursos antes da primeira sessao.</p><b>Comecar configuracao -></b></a>`;
    return;
  }
  campaigns.forEach(campaign => {
    const card = document.createElement("article");
    card.className = "campaign-card";
    card.dataset.campaignId = campaign.id;
    card.innerHTML = `<div class="campaign-cover"><span class="paused-status">PREPARACAO</span><em></em><div><small>CAMPANHA</small><h2></h2><p></p></div></div><div class="campaign-card-body"><dl><span><dt>CONVITE</dt><dd></dd></span><span><dt>GRUPO</dt><dd></dd></span><span><dt>ACESSO</dt><dd></dd></span></dl><footer><a href="salas.html">Gerenciar sala</a><button type="button" class="campaign-delete-button" data-delete-campaign>Excluir campanha</button></footer></div>`;
    card.querySelector(".campaign-cover em").textContent = campaign.system || "Sistema proprio";
    card.querySelector(".campaign-cover h2").textContent = campaign.name || "Campanha sem nome";
    card.querySelector(".campaign-cover p").textContent = campaign.description || "Sem descricao cadastrada.";
    card.querySelectorAll("dd")[0].textContent = campaign.inviteCode || campaign.code || "AR-XXXX-XXXX";
    card.querySelectorAll("dd")[1].textContent = `${Array.isArray(campaign.players) ? campaign.players.length : 0} / ${campaign.maxPlayers || campaign.limit || 1} jogadores`;
    card.querySelectorAll("dd")[2].textContent = campaign.visibility === "private" ? "Privada" : "Publica";
    if (campaign.image) card.querySelector(".campaign-cover").style.backgroundImage = `url("${campaign.image}")`;
    else card.querySelector(".campaign-cover").classList.add("void-cover");
    managementGrid.append(card);
  });
}

managementGrid?.addEventListener("click", event => {
  const button = event.target.closest("[data-delete-campaign]");
  if (!button) return;
  const card = button.closest("[data-campaign-id]");
  if (!card) return;
  if (!confirm("Excluir esta campanha? Esta acao nao pode ser desfeita.")) return;
  saveManagementCampaigns(readManagementCampaigns().filter(campaign => campaign.id !== card.dataset.campaignId));
  renderManagementCampaigns();
  showPrototypeToast?.("Campanha excluida.");
});

renderManagementCampaigns();
