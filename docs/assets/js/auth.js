// Static authentication flow for GitHub Pages.
// The Flask backend has the real /login and /register routes; this keeps the public demo usable.
const authForms = document.querySelectorAll("[data-auth-form]");
const demoLoginButtons = document.querySelectorAll("[data-demo-login]");
const avatarInput = document.querySelector('input[name="avatar"]');
const avatarPreview = document.querySelector("[data-avatar-preview]");
const roleSelect = document.querySelector('select[name="role"]');
const adminCodeField = document.querySelector("[data-admin-code-field]");

const demoNamesByEmail = {
  "mestre@apexrealms.com": {name: "Kaue Teixeira", nickname: "Kaue", role: "master"},
  "jogador@apexrealms.com": {name: "Lyra Voss", nickname: "Lyra", role: "player"},
  "admin@apexrealms.com": {name: "Admin Apex", nickname: "Admin", role: "admin"}
};

function setAuthStatus(form, message, type = "info") {
  const status = form.querySelector("[data-auth-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.status = type;
}

function redirectAfterAuth() {
  setTimeout(() => {
    window.location.href = "dashboard.html";
  }, 520);
}

function signInDemoUser(user) {
  window.ApexStaticAuth?.saveUser(user);
  window.ApexStaticAuth?.applyUser();
  showPrototypeToast?.(`Entrando como ${window.ApexStaticAuth?.roleLabel(user.role) || "usuário"}...`);
  redirectAfterAuth();
}

function readAvatarFile(file, callback) {
  if (!file) {
    callback("");
    return;
  }
  if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) {
    callback("");
    return;
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => callback(reader.result));
  reader.readAsDataURL(file);
}

function syncAdminField() {
  if (!roleSelect || !adminCodeField) return;
  adminCodeField.classList.toggle("visible", roleSelect.value === "admin");
}

avatarInput?.addEventListener("change", () => {
  const [file] = avatarInput.files;
  readAvatarFile(file, dataUrl => {
    if (!dataUrl || !avatarPreview) return;
    avatarPreview.classList.add("custom-avatar");
    avatarPreview.style.backgroundImage = `url("${dataUrl}")`;
  });
});

roleSelect?.addEventListener("change", syncAdminField);
syncAdminField();

demoLoginButtons.forEach(button => button.addEventListener("click", () => {
  signInDemoUser({
    name: button.dataset.name,
    nickname: button.dataset.nickname,
    email: button.dataset.email,
    role: button.dataset.role
  });
}));

authForms.forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const mode = form.dataset.authMode;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const selectedRole = String(formData.get("role") || "player");
  const demoAccount = demoNamesByEmail[email] || {};

  if (mode === "register" && selectedRole === "admin" && String(formData.get("admin_code") || "").trim() !== "APEX-ADMIN-2026") {
    setAuthStatus(form, "Código de administrador inválido. Use APEX-ADMIN-2026 na demo.", "error");
    return;
  }

  setAuthStatus(form, "Sessão criada. Abrindo dashboard...", "success");
  readAvatarFile(formData.get("avatar"), avatar => {
    signInDemoUser({
      name: String(formData.get("name") || demoAccount.name || "Aventureiro Apex").trim(),
      nickname: String(formData.get("nickname") || demoAccount.nickname || "Aventureiro").trim(),
      email,
      role: selectedRole || demoAccount.role || "player",
      avatar
    });
  });
}));
