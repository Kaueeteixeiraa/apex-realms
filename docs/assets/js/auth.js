// Access flow for Apex Realms.
const authForms = document.querySelectorAll("[data-auth-form]");
const authQuery = new URLSearchParams(window.location.search);
const pendingInviteCode = window.ApexInvites?.normalizeCode?.(authQuery.get("invite")) || "";
const AUTH_REDIRECT_DELAY = 1350;

function createAuthTransition() {
  let overlay = document.querySelector("[data-auth-transition]");
  if (overlay) return overlay;
  overlay = document.createElement("div");
  overlay.className = "auth-transition";
  overlay.dataset.authTransition = "true";
  overlay.setAttribute("role", "status");
  overlay.setAttribute("aria-live", "polite");
  overlay.innerHTML = `
    <div class="auth-transition-panel">
      <div class="auth-transition-orbit" aria-hidden="true">
        <i></i><i></i><i></i>
        <span class="auth-transition-die die-one">20</span>
        <span class="auth-transition-die die-two">12</span>
        <span class="auth-transition-die die-three">8</span>
        <div class="auth-transition-mark"><img src="assets/apex-mini-logo.svg" alt=""></div>
      </div>
      <small>APEX REALMS</small>
      <h2 data-auth-transition-title>Abrindo o portal</h2>
      <p data-auth-transition-message>Preparando sua mesa...</p>
      <div class="auth-transition-progress" aria-hidden="true"><span></span></div>
    </div>
  `;
  document.body.append(overlay);
  return overlay;
}

function setAuthStatus(form, message, type = "info") {
  const status = form.querySelector("[data-auth-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.status = type;
}

function startAuthTransition(form, mode) {
  const overlay = createAuthTransition();
  const isRegister = mode === "register";
  const title = overlay.querySelector("[data-auth-transition-title]");
  const message = overlay.querySelector("[data-auth-transition-message]");
  const submit = form.querySelector("button[type='submit']");
  const card = form.closest(".login-home-card, .register-home-card, .auth-card");

  if (title) title.textContent = isRegister ? "Criando seu acesso" : "Abrindo o portal";
  if (message) message.textContent = isRegister ? "Forjando seu perfil no Apex Realms..." : "Validando acesso e preparando sua mesa...";

  if (submit) {
    submit.disabled = true;
    submit.setAttribute("aria-busy", "true");
    submit.dataset.originalText = submit.dataset.originalText || submit.textContent.trim();
    submit.innerHTML = `<span>${isRegister ? "Criando acesso" : "Entrando"}</span><i aria-hidden="true"></i>`;
  }

  document.body.classList.add("auth-is-entering");
  card?.classList.add("is-entering");
  requestAnimationFrame(() => overlay.classList.add("active"));
}

function joinPendingInvite(user) {
  if (!pendingInviteCode || !window.ApexInvites?.joinByCode) return null;
  const result = window.ApexInvites.joinByCode(pendingInviteCode, user);
  sessionStorage.setItem("apex-realms-notice", result.message || "Convite processado.");
  return result;
}

function redirectAfterAuth() {
  const user = window.ApexStaticAuth?.getUser();
  const next = new URLSearchParams(window.location.search).get("next");
  const inviteResult = joinPendingInvite(user);
  const homeRoute = window.ApexStaticAuth?.homeRoute?.(user) || (user?.role === "master" ? "master/dashboard.html" : "player/dashboard.html");
  const target = inviteResult ? (user?.role === "player" ? "player/dashboard.html" : homeRoute) : (next && window.ApexStaticAuth?.canAccessRoute(user, next) ? next : homeRoute);
  setTimeout(() => {
    window.location.href = target;
  }, AUTH_REDIRECT_DELAY);
}

function signInStaticUser(user, form, mode) {
  window.ApexStaticAuth?.saveUser(user);
  window.ApexStaticAuth?.applyUser();
  startAuthTransition(form, mode);
  redirectAfterAuth();
}

authForms.forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  if (form.dataset.authBusy === "true") return;
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
    form.dataset.authBusy = "true";
    setAuthStatus(form, "Sessao validada. Abrindo dashboard...", "success");
    signInStaticUser(account, form, mode);
    return;
  }

  if (window.ApexStaticAuth?.findAccount(email)) {
    setAuthStatus(form, "Este e-mail ja possui uma conta.", "error");
    return;
  }
  form.dataset.authBusy = "true";
  setAuthStatus(form, "Conta criada. Abrindo dashboard...", "success");
  const account = window.ApexStaticAuth?.upsertAccount({
    name: String(formData.get("name") || "Aventureiro Apex").trim(),
    nickname: String(formData.get("nickname") || "Aventureiro").trim(),
    email,
    password,
    role: publicRole,
    avatar: ""
  });
  signInStaticUser(account, form, mode);
}));

if (pendingInviteCode) {
  document.querySelectorAll('a[href="login.html"],a[href="cadastro.html"]').forEach(link => {
    const target = link.getAttribute("href");
    link.setAttribute("href", `${target}?invite=${encodeURIComponent(pendingInviteCode)}`);
  });
  authForms.forEach(form => {
    const roleSelect = form.querySelector("select[name='role']");
    if (roleSelect) roleSelect.value = "player";
    setAuthStatus(form, `Convite ${pendingInviteCode} detectado. Entre como jogador para vincular a campanha.`, "info");
  });
}
