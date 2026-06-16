// Static authentication flow for GitHub Pages.
// The Flask backend has the real /login and /register routes for production hosting.
const authForms = document.querySelectorAll("[data-auth-form]");
const avatarInput = document.querySelector('input[name="avatar"]');
const avatarPreview = document.querySelector("[data-avatar-preview]");
const roleSelect = document.querySelector('select[name="role"]');
const adminCodeField = document.querySelector("[data-admin-code-field]");

function setAuthStatus(form, message, type = "info") {
  const status = form.querySelector("[data-auth-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.status = type;
}

function redirectAfterAuth() {
  const user = window.ApexStaticAuth?.getUser();
  const next = new URLSearchParams(window.location.search).get("next");
  const target = next && window.ApexStaticAuth?.canAccessRoute(user, next) ? next : "dashboard.html";
  setTimeout(() => {
    window.location.href = target;
  }, 520);
}

function signInStaticUser(user) {
  window.ApexStaticAuth?.saveUser(user);
  window.ApexStaticAuth?.applyUser();
  showPrototypeToast?.(`Entrando como ${window.ApexStaticAuth?.roleLabel(user.role) || "usuario"}...`);
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

authForms.forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  if (!form.reportValidity()) return;

  const formData = new FormData(form);
  const mode = form.dataset.authMode;
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const password = String(formData.get("password") || "");
  const selectedRole = String(formData.get("role") || "player");
  const publicRole = selectedRole === "master" ? "master" : "player";

  if (mode === "login") {
    const account = window.ApexStaticAuth?.findAccount(email);
    if (!account) {
      setAuthStatus(form, "Conta nao encontrada. Crie uma conta para acessar a plataforma.", "error");
      return;
    }
    if (account.password !== password) {
      setAuthStatus(form, "Senha invalida.", "error");
      return;
    }
    setAuthStatus(form, "Sessao validada. Abrindo dashboard...", "success");
    signInStaticUser(account);
    return;
  }

  if (window.ApexStaticAuth?.findAccount(email)) {
    setAuthStatus(form, "Este e-mail ja possui uma conta.", "error");
    return;
  }
  setAuthStatus(form, "Conta criada. Abrindo dashboard...", "success");
  readAvatarFile(formData.get("avatar"), avatar => {
    const account = window.ApexStaticAuth?.upsertAccount({
      name: String(formData.get("name") || "Aventureiro Apex").trim(),
      nickname: String(formData.get("nickname") || "Aventureiro").trim(),
      email,
      password,
      role: publicRole,
      avatar
    });
    signInStaticUser(account);
  });
}));
