const joinRoomModal = document.querySelector("#join-room");
const joinRoomForm = document.querySelector("#join-room-form");
const roomCodeInput = document.querySelector("#room-code");
const roomCodeFeedback = document.querySelector("#join-room-feedback");
const campaignGrid = document.querySelector("#dashboard-campaign-grid");
const campaignCount = document.querySelector("#dashboard-campaign-count");

function renderSavedCampaigns() {
  let savedCampaigns = [];
  try {
    savedCampaigns = JSON.parse(localStorage.getItem("apex-realms-campaigns") || "[]");
    if (!Array.isArray(savedCampaigns)) savedCampaigns = [];
  } catch {
    localStorage.removeItem("apex-realms-campaigns");
  }
  campaignCount.textContent = 2 + savedCampaigns.length;
  savedCampaigns.slice(0, 2).reverse().forEach(campaign => {
    const card = document.createElement("article");
    card.className = "room-card saved-campaign-card";
    card.innerHTML = `<div class="room-cover"><span>PREPARAÇÃO</span><b></b></div><div class="room-body"><small>MESTRE · KAUE</small><h3></h3><p></p><div class="room-players"><span></span><a href="salas.html">Ver sala →</a></div></div>`;
    card.querySelector(".room-cover b").textContent = campaign.system || "Sistema próprio";
    card.querySelector(".room-body h3").textContent = campaign.name;
    card.querySelector(".room-body p").textContent = campaign.description;
    card.querySelector(".room-players span").textContent = `0 / ${campaign.limit} jogadores · ${campaign.visibility === "private" ? "Privada" : "Pública"}`;
    if (campaign.image) card.querySelector(".room-cover").style.backgroundImage = `url("${campaign.image}")`;
    else card.querySelector(".room-cover").classList.add("void-cover");
    campaignGrid.prepend(card);
  });
}

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
  roomCodeFeedback.textContent = "Código validado. Abrindo a sala...";
  roomCodeFeedback.classList.add("success");
  setTimeout(() => { window.location.href = "demo.html"; }, 550);
});

renderSavedCampaigns();
