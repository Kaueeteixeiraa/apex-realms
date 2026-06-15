// Shared interactions for the landing page and product prototype.
const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add("visible");
  revealObserver.unobserve(entry.target);
}), {threshold: .12});

document.querySelectorAll(".reveal").forEach(element => revealObserver.observe(element));

const siteHeader = document.querySelector(".site-header");
if (siteHeader) {
  window.addEventListener("scroll", () => siteHeader.classList.toggle("scrolled", window.scrollY > 24));
}

const particleField = document.querySelector("#particles");
if (particleField) {
  for (let index = 0; index < 42; index += 1) {
    const particle = document.createElement("i");
    particle.className = "particle";
    particle.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 95}%;--speed:${4 + Math.random() * 8}s;--opacity:${.2 + Math.random() * .65};--x:${-40 + Math.random() * 80}px;--y:${-60 - Math.random() * 100}px`;
    particleField.append(particle);
  }
}

document.querySelectorAll("[data-modal]").forEach(button => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.modal}`)?.classList.add("open");
}));

document.querySelectorAll(".modal-close,.modal-backdrop").forEach(element => element.addEventListener("click", event => {
  if (event.target === element || element.classList.contains("modal-close")) element.closest(".modal-backdrop")?.classList.remove("open");
}));

document.querySelectorAll("[data-tabs]").forEach(group => group.querySelectorAll("[data-tab-target]").forEach(button => {
  button.addEventListener("click", () => {
    group.querySelectorAll("[data-tab-target]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const panels = document.querySelectorAll("[data-tab-panel]");
    if (panels.length) {
      panels.forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === button.dataset.tabTarget));
    }
  });
}));

function showPrototypeToast(message) {
  let toast = document.querySelector(".prototype-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "prototype-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showPrototypeToast.timer);
  showPrototypeToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-demo-form]").forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  form.closest(".modal-backdrop")?.classList.remove("open");
  showPrototypeToast("Pronto. A ação foi processada.");
}));

document.querySelectorAll("[data-demo-action]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Recurso adicionado à cena.");
}));

document.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Alterações salvas localmente.");
}));

// Lightweight session helper used by the GitHub Pages build.
// The hosted Flask app will replace this with real server-side authentication.
const APEX_STATIC_USER_KEY = "apex-realms-static-user";
const APEX_STATIC_DEFAULT_USER = {
  name: "Kaue Teixeira",
  nickname: "Kaue",
  email: "mestre@apexrealms.com",
  role: "master"
};
const APEX_ROLE_LABELS = {
  player: "Jogador",
  master: "Mestre",
  admin: "Administrador"
};
const APEX_PUBLIC_ROUTES = new Set(["", "index.html", "login.html", "cadastro.html"]);
const APEX_MASTER_ROUTES = new Set([
  "biblioteca.html",
  "configuracoes.html",
  "criar-campanha.html",
  "fichas-jogadores.html",
  "mestre.html",
  "monstros.html"
]);

function roleLabel(role) {
  return APEX_ROLE_LABELS[role] || "Visitante";
}

function normalizeStaticRoute(value) {
  if (!value || value.startsWith("#") || value.startsWith("mailto:")) return "";
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return "";
    return (url.pathname.split("/").pop() || "index.html").toLowerCase();
  } catch {
    return value.split("#")[0].split("?")[0].split("/").pop().toLowerCase();
  }
}

function currentStaticRoute() {
  return normalizeStaticRoute(window.location.href);
}

function canAccessStaticRoute(user, route) {
  const cleanRoute = normalizeStaticRoute(route);
  if (APEX_PUBLIC_ROUTES.has(cleanRoute)) return true;
  if (!user) return false;
  if (APEX_MASTER_ROUTES.has(cleanRoute)) return user.role === "master";
  return true;
}

function redirectWithNotice(target, message) {
  sessionStorage.setItem("apex-realms-notice", message);
  window.location.replace(target);
}

function enforceStaticRoute(user) {
  const route = currentStaticRoute();
  if (APEX_PUBLIC_ROUTES.has(route)) return true;
  if (!user) {
    redirectWithNotice(`login.html?next=${encodeURIComponent(route)}`, "Entre na sua conta para acessar a plataforma.");
    return false;
  }
  if (APEX_MASTER_ROUTES.has(route) && user.role !== "master") {
    redirectWithNotice("dashboard.html", "Apenas contas de Mestre podem criar campanhas e acessar ferramentas de mestre.");
    return false;
  }
  return true;
}

function getStaticUser() {
  try {
    const user = JSON.parse(localStorage.getItem(APEX_STATIC_USER_KEY) || "null");
    return user && typeof user === "object" ? {...APEX_STATIC_DEFAULT_USER, ...user} : null;
  } catch {
    localStorage.removeItem(APEX_STATIC_USER_KEY);
    return null;
  }
}

function saveStaticUser(user) {
  localStorage.setItem(APEX_STATIC_USER_KEY, JSON.stringify({...APEX_STATIC_DEFAULT_USER, ...user}));
}

function clearStaticUser() {
  localStorage.removeItem(APEX_STATIC_USER_KEY);
}

function applyStaticUser() {
  const user = getStaticUser();
  if (!enforceStaticRoute(user)) return;
  const isMaster = user?.role === "master";
  const isPlayer = user?.role === "player";
  const isAdmin = user?.role === "admin";
  document.body.dataset.accountRole = user?.role || "guest";
  applyRoleVisibility(user);
  applyQueuedNotice();
  if (!user) return;
  const displayName = user.name || user.nickname || "Aventureiro Apex";
  const label = roleLabel(user.role);

  document.querySelectorAll("[data-user-name]").forEach(element => { element.textContent = displayName; });
  document.querySelectorAll("[data-user-role]").forEach(element => { element.textContent = label; });
  document.querySelectorAll("[data-user-email]").forEach(element => { element.textContent = user.email || ""; });
  document.querySelectorAll("[data-user-initial]").forEach(element => { element.textContent = displayName.trim().charAt(0).toUpperCase() || "A"; });

  document.querySelectorAll(".sidebar-profile").forEach(profile => {
    const nameElement = profile.querySelector("span b");
    const roleElement = profile.querySelector("span small");
    const portrait = profile.querySelector(".portrait");
    const button = profile.querySelector("button");

    if (nameElement) nameElement.textContent = displayName;
    if (roleElement) roleElement.textContent = `${label} · Conta ativa`;
    if (user.avatar && portrait) {
      portrait.classList.add("custom-avatar");
      portrait.style.backgroundImage = `url("${user.avatar}")`;
    }
    if (button && !button.dataset.authKeep) {
      button.textContent = "Sair";
      button.title = "Sair da conta";
      button.dataset.logout = "true";
    }
  });

  document.querySelectorAll("[data-admin-only]").forEach(element => {
    element.hidden = !isAdmin;
  });
  document.querySelectorAll("[data-master-only]").forEach(element => {
    element.hidden = !isMaster;
  });
  document.querySelectorAll("[data-player-only]").forEach(element => {
    element.hidden = !isPlayer;
  });
  updateRoleSpecificCopy(user);
}

function applyRoleVisibility(user) {
  const isMaster = user?.role === "master";
  document.querySelectorAll("#create-room,.create-room-panel,a[href='#create-room']").forEach(element => {
    element.hidden = !isMaster;
  });
  document.querySelectorAll('[data-session-mode="master"],.master-toolbar,[data-master-only]').forEach(element => {
    element.hidden = !isMaster;
  });
  document.querySelectorAll(".app-nav small").forEach(label => {
    if (label.textContent.trim().toUpperCase().includes("MESTRE")) label.hidden = !isMaster;
  });
  document.querySelectorAll("a[href]").forEach(link => {
    const route = normalizeStaticRoute(link.getAttribute("href"));
    if (!APEX_MASTER_ROUTES.has(route)) return;
    link.hidden = !isMaster;
    link.setAttribute("aria-hidden", String(!isMaster));
  });
}

function applyQueuedNotice() {
  const message = sessionStorage.getItem("apex-realms-notice");
  if (!message) return;
  sessionStorage.removeItem("apex-realms-notice");
  setTimeout(() => showPrototypeToast(message), 120);
}

function updateRoleSpecificCopy(user) {
  const dashboardSummaryTitle = document.querySelector(".dashboard-summary-panel h2");
  const dashboardSummaryText = document.querySelector(".dashboard-summary-panel > p");
  if (dashboardSummaryTitle && dashboardSummaryText && user.role === "player") {
    dashboardSummaryTitle.textContent = "Área do jogador";
    dashboardSummaryText.textContent = "Você pode entrar por convite, abrir suas fichas, acompanhar a mesa e controlar apenas seus próprios personagens.";
  }
  if (dashboardSummaryTitle && dashboardSummaryText && user.role === "admin") {
    dashboardSummaryTitle.textContent = "Área administrativa";
    dashboardSummaryText.textContent = "Administradores acompanham o sistema e usuários. Criação de campanhas fica restrita às contas de Mestre.";
  }
  const campaignIntroTitle = document.querySelector(".management-intro h2");
  const campaignIntroText = document.querySelector(".management-intro p");
  if (campaignIntroTitle && campaignIntroText && user.role === "player") {
    campaignIntroTitle.innerHTML = "Acompanhe suas aventuras,<br>sem ferramentas de mestre.";
    campaignIntroText.textContent = "Jogadores entram por convite, acessam fichas, veem salas liberadas e participam da mesa dentro das permissões do mestre.";
  }
}

document.addEventListener("click", event => {
  const restrictedLink = event.target.closest("a[href]");
  if (restrictedLink) {
    const route = normalizeStaticRoute(restrictedLink.getAttribute("href"));
    if (APEX_MASTER_ROUTES.has(route) && getStaticUser()?.role !== "master") {
      event.preventDefault();
      showPrototypeToast("Apenas contas de Mestre podem acessar essa área.");
      return;
    }
  }
  const logoutButton = event.target.closest("[data-logout]");
  if (!logoutButton) return;
  clearStaticUser();
  showPrototypeToast("Conta encerrada. Voltando para o login.");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 550);
});

window.ApexStaticAuth = {
  applyUser: applyStaticUser,
  clearUser: clearStaticUser,
  canAccessRoute: canAccessStaticRoute,
  getUser: getStaticUser,
  roleLabel,
  saveUser: saveStaticUser
};

applyStaticUser();
