const campaignForm = document.querySelector("#campaign-form");
const campaignName = document.querySelector("#campaign-name");
const campaignDescription = document.querySelector("#campaign-description");
const campaignSystem = document.querySelector("#campaign-system");
const campaignLimit = document.querySelector("#campaign-limit");
const campaignVisibility = document.querySelector("#campaign-visibility");
const campaignNotes = document.querySelector("#campaign-notes");
const codeCard = document.querySelector("#private-code-card");
const publicNote = document.querySelector("#public-access-note");
const codeValue = document.querySelector("#campaign-code");
const copyCodeStatus = document.querySelector("#copy-code-status");
const imageInput = document.querySelector("#campaign-image");
const imagePreview = document.querySelector("#campaign-upload-preview");
const summaryCover = document.querySelector("#summary-cover");
const imageStatus = document.querySelector("#campaign-image-status");
const submitStatus = document.querySelector("#campaign-submit-status");
const draftStatus = document.querySelector("#draft-status");
const draftKey = "apex-realms-campaign-draft";
const campaignsKey = "apex-realms-campaigns";
const maxImageSize = 1024 * 1024;
let campaignImage = null;
let saveTimer = null;

function createInviteCode() {
  if (window.ApexInvites?.generateCode) return window.ApexInvites.generateCode(readCampaignsForInvite());
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const part = (length = 4) => Array.from({length}, () => chars[Math.floor(Math.random() * chars.length)]).join("");
  return `AR-${part()}-${part()}`;
}

function readCampaignsForInvite() {
  try {
    const campaigns = JSON.parse(localStorage.getItem(campaignsKey) || "[]");
    return Array.isArray(campaigns) ? campaigns : [];
  } catch {
    return [];
  }
}

function getCampaignDraft() {
  const isPrivate = campaignVisibility.value === "private";
  return {
    name: campaignName.value.trim(),
    description: campaignDescription.value.trim(),
    system: campaignSystem.value,
    limit: Math.max(1, Math.floor(Number(campaignLimit.value) || 1)),
    visibility: campaignVisibility.value,
    code: isPrivate ? codeValue.textContent : null,
    inviteCode: isPrivate ? codeValue.textContent : null,
    notes: campaignNotes.value.trim(),
    image: campaignImage
  };
}

function saveDraft() {
  try {
    localStorage.setItem(draftKey, JSON.stringify(getCampaignDraft()));
    draftStatus.innerHTML = "<i></i> Rascunho salvo localmente";
  } catch {
    draftStatus.textContent = "Não foi possível salvar o banner no rascunho.";
  }
}

function scheduleDraftSave() {
  draftStatus.textContent = "Salvando rascunho...";
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveDraft, 250);
}

function restoreDraft() {
  try {
    const draft = JSON.parse(localStorage.getItem(draftKey) || "null");
    if (!draft) return;
    campaignName.value = draft.name || "";
    campaignDescription.value = draft.description || "";
    campaignSystem.value = draft.system || "";
    campaignLimit.value = Math.max(1, Number(draft.limit) || 1);
    campaignVisibility.value = draft.visibility || "private";
    campaignNotes.value = draft.notes || "";
    if (draft.code) codeValue.textContent = draft.code;
    setCampaignImage(draft.image || null, draft.image ? "Imagem do rascunho restaurada." : "Imagem padrão selecionada.");
  } catch {
    localStorage.removeItem(draftKey);
  }
}

function setCampaignImage(source, status = "Imagem padrão selecionada.") {
  campaignImage = source || null;
  [imagePreview, summaryCover].forEach(element => {
    element.classList.toggle("ruins-cover", !campaignImage);
    element.style.backgroundImage = campaignImage ? `url("${campaignImage}")` : "";
  });
  imageStatus.textContent = status;
}

function syncSummary() {
  campaignLimit.value = Math.max(1, Math.floor(Number(campaignLimit.value) || 1));
  document.querySelector("#summary-name").textContent = campaignName.value.trim() || "Sua nova campanha";
  document.querySelector("#preview-name").textContent = campaignName.value.trim() || "Sua nova campanha";
  document.querySelector("#summary-description").textContent = campaignDescription.value.trim() || "Preencha a descrição para visualizar o resumo.";
  document.querySelector("#summary-system").textContent = campaignSystem.value || "Não selecionado";
  document.querySelector("#summary-limit").textContent = `Até ${campaignLimit.value}`;
  document.querySelector("#description-count").textContent = campaignDescription.value.length;
  const isPrivate = campaignVisibility.value === "private";
  document.querySelector("#summary-visibility").textContent = isPrivate ? "Privada" : "Pública";
  codeCard.hidden = !isPrivate;
  publicNote.hidden = isPrivate;
  if (isPrivate && !codeValue.textContent.startsWith("AR-")) codeValue.textContent = createInviteCode();
  scheduleDraftSave();
}

document.querySelectorAll("#campaign-form input:not([type='file']),#campaign-form select,#campaign-form textarea").forEach(field => {
  field.addEventListener("input", syncSummary);
  field.addEventListener("change", syncSummary);
});

document.querySelector("#new-campaign-code").addEventListener("click", () => {
  codeValue.textContent = createInviteCode();
  copyCodeStatus.textContent = "Novo código gerado.";
  scheduleDraftSave();
});

document.querySelector("#copy-campaign-code").addEventListener("click", async () => {
  try {
    await navigator.clipboard.writeText(codeValue.textContent);
    copyCodeStatus.textContent = "Código copiado.";
  } catch {
    const range = document.createRange();
    range.selectNodeContents(codeValue);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
    copyCodeStatus.textContent = "Código selecionado. Use Ctrl+C para copiar.";
  }
});

imageInput.addEventListener("change", () => {
  const file = imageInput.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    imageInput.value = "";
    imageStatus.textContent = "Formato inválido. Use JPG, PNG ou WEBP.";
    return;
  }
  if (file.size > maxImageSize) {
    imageInput.value = "";
    imageStatus.textContent = "Imagem muito grande. O limite é 1 MB.";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    setCampaignImage(reader.result, `${file.name} pronto para uso.`);
    scheduleDraftSave();
  });
  reader.readAsDataURL(file);
});

document.querySelector("#remove-campaign-image").addEventListener("click", () => {
  imageInput.value = "";
  setCampaignImage(null);
  scheduleDraftSave();
});

campaignForm.addEventListener("submit", event => {
  event.preventDefault();
  if (!campaignForm.reportValidity()) {
    submitStatus.textContent = "Revise os campos obrigatórios destacados.";
    return;
  }
  const campaign = {
    ...getCampaignDraft(),
    id: `campaign-${Date.now()}`,
    createdAt: new Date().toISOString(),
    status: "Preparação"
  };
  try {
    const parsedCampaigns = JSON.parse(localStorage.getItem(campaignsKey) || "[]");
    const campaigns = Array.isArray(parsedCampaigns) ? parsedCampaigns : [];
    const olderCampaigns = campaigns.slice(0, 5).map((item, index) => index === 0 ? item : { ...item, image: null });
    localStorage.removeItem(draftKey);
    if (window.ApexInvites?.saveCampaigns) window.ApexInvites.saveCampaigns([campaign, ...olderCampaigns]);
    else localStorage.setItem(campaignsKey, JSON.stringify([campaign, ...olderCampaigns]));
    localStorage.setItem("apex-realms-last-campaign", JSON.stringify(campaign));
    submitStatus.textContent = "Campanha criada. Abrindo o dashboard...";
    setTimeout(() => { window.location.href = "dashboard.html"; }, 500);
  } catch {
    saveDraft();
    submitStatus.textContent = "Não foi possível salvar. Tente uma imagem menor.";
  }
});

codeValue.textContent = createInviteCode();
setCampaignImage(null);
restoreDraft();
syncSummary();
