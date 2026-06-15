const campaignForm = document.querySelector("#campaign-form");
const campaignName = document.querySelector("#campaign-name");
const campaignDescription = document.querySelector("#campaign-description");
const campaignSystem = document.querySelector("#campaign-system");
const campaignLimit = document.querySelector("#campaign-limit");
const campaignVisibility = document.querySelector("#campaign-visibility");
const codeCard = document.querySelector("#private-code-card");
const publicNote = document.querySelector("#public-access-note");
const codeValue = document.querySelector("#campaign-code");
const imageInput = document.querySelector("#campaign-image");
const imagePreview = document.querySelector("#campaign-upload-preview");
const imageStatus = document.querySelector("#campaign-image-status");
const draftKey = "apex-realms-campaign-draft";

function createInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return `REALM-${Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("")}`;
}

function syncSummary() {
  document.querySelector("#summary-name").textContent = campaignName.value || "Campanha sem nome";
  document.querySelector("#preview-name").textContent = campaignName.value || "Campanha sem nome";
  document.querySelector("#summary-description").textContent = campaignDescription.value || "Sem descrição.";
  document.querySelector("#summary-system").textContent = campaignSystem.value;
  document.querySelector("#summary-limit").textContent = `Até ${Math.max(1, Number(campaignLimit.value) || 1)}`;
  const isPrivate = campaignVisibility.value === "private";
  document.querySelector("#summary-visibility").textContent = isPrivate ? "Privada" : "Pública";
  codeCard.hidden = !isPrivate;
  publicNote.hidden = isPrivate;
  if (isPrivate && !codeValue.textContent.includes("REALM-")) codeValue.textContent = createInviteCode();
  const draft = {
    name: campaignName.value, description: campaignDescription.value, system: campaignSystem.value,
    limit: Math.max(1, Number(campaignLimit.value) || 1), visibility: campaignVisibility.value,
    code: isPrivate ? codeValue.textContent : null, notes: document.querySelector("#campaign-notes").value
  };
  localStorage.setItem(draftKey, JSON.stringify(draft));
}

document.querySelectorAll("#campaign-form input,#campaign-form select,#campaign-form textarea").forEach(field => field.addEventListener("input", syncSummary));
document.querySelector("#new-campaign-code").addEventListener("click", () => { codeValue.textContent = createInviteCode(); syncSummary(); });
document.querySelector("#copy-campaign-code").addEventListener("click", async () => {
  await navigator.clipboard?.writeText(codeValue.textContent);
  showPrototypeToast("Código privado copiado.");
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    imageInput.value = "";
    imageStatus.textContent = "Formato inválido. Use JPG, PNG ou WEBP.";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    imagePreview.classList.remove("ruins-cover");
    imagePreview.style.backgroundImage = `url("${reader.result}")`;
    localStorage.setItem("apex-realms-campaign-image", reader.result);
    imageStatus.textContent = `${file.name} pronto para uso.`;
  });
  reader.readAsDataURL(file);
});

document.querySelector("#remove-campaign-image").addEventListener("click", () => {
  imageInput.value = "";
  imagePreview.style.backgroundImage = "";
  imagePreview.classList.add("ruins-cover");
  localStorage.removeItem("apex-realms-campaign-image");
  imageStatus.textContent = "Imagem padrão selecionada.";
});

campaignForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!campaignForm.reportValidity()) return;
  const permissions = {};
  document.querySelectorAll("[data-campaign-permission]").forEach(input => { permissions[input.dataset.campaignPermission] = input.checked; });
  if (Object.hasOwn(permissions, "chatDice")) {
    permissions.chat = permissions.chatDice;
    permissions.dice = permissions.chatDice;
    delete permissions.chatDice;
  }
  sessionState.permissions = { ...sessionState.permissions, ...permissions };
  saveSessionState();
  localStorage.setItem("apex-realms-last-campaign", localStorage.getItem(draftKey));
  window.location.href = "campanhas.html";
});

codeValue.textContent = createInviteCode();
syncSummary();
