const characterPhotoKey = "apex-realms-character-photo";
const characterPhotoPreview = document.querySelector("#character-photo-preview");
const characterPhotoInput = document.querySelector("#character-photo-input");

function setCharacterPhoto(source) {
  if (!characterPhotoPreview) return;
  characterPhotoPreview.classList.toggle("portrait", !source);
  characterPhotoPreview.classList.toggle("kael", !source);
  characterPhotoPreview.style.backgroundImage = source ? `url("${source}")` : "";
  characterPhotoPreview.style.backgroundSize = source ? "cover" : "";
  characterPhotoPreview.style.backgroundPosition = "center";
}

characterPhotoInput?.addEventListener("change", () => {
  const file = characterPhotoInput.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    showPrototypeToast("Use uma imagem JPG, PNG ou WEBP.");
    characterPhotoInput.value = "";
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => {
    localStorage.setItem(characterPhotoKey, reader.result);
    setCharacterPhoto(reader.result);
    showPrototypeToast("Foto do personagem atualizada.");
  });
  reader.readAsDataURL(file);
});

document.querySelector("#remove-character-photo")?.addEventListener("click", () => {
  localStorage.removeItem(characterPhotoKey);
  characterPhotoInput.value = "";
  setCharacterPhoto(null);
  showPrototypeToast("Foto removida. Avatar padrão restaurado.");
});

setCharacterPhoto(localStorage.getItem(characterPhotoKey));
