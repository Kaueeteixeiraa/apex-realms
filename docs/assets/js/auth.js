// Access flow for Apex Realms.
const authForms = document.querySelectorAll("[data-auth-form]");
const authQuery = new URLSearchParams(window.location.search);
const pendingInviteCode = window.ApexInvites?.normalizeCode?.(authQuery.get("invite")) || "";

function setAuthStatus(form, message, type = "info") {
  const status = form.querySelector("[data-auth-status]");
  if (!status) return;
  status.textContent = message;
  status.dataset.status = type;
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
  }, 520);
}

function signInStaticUser(user) {
  window.ApexStaticAuth?.saveUser(user);
  window.ApexStaticAuth?.applyUser();
  showPrototypeToast?.(`Entrando como ${window.ApexStaticAuth?.roleLabel(user.role) || "usuario"}...`);
  redirectAfterAuth();
}

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
  const account = window.ApexStaticAuth?.upsertAccount({
    name: String(formData.get("name") || "Aventureiro Apex").trim(),
    nickname: String(formData.get("nickname") || "Aventureiro").trim(),
    email,
    password,
    role: publicRole,
    avatar: ""
  });
  signInStaticUser(account);
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
