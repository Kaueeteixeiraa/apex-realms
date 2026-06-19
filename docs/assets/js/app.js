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
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
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
const APEX_STATIC_ACCOUNTS_KEY = "apex-realms-static-accounts";
const APEX_STATIC_RESET_KEY = "apex-realms-launch-reset-v1";
const APEX_STATIC_CAMPAIGNS_KEY = "apex-realms-campaigns";
const APEX_STATIC_PLAYER_CAMPAIGNS_KEY = "apex-realms-player-campaigns";
const APEX_INVITE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
const APEX_STATIC_DEFAULT_USER = {
  name: "Admin Apex",
  nickname: "Admin",
  email: "admin@apexrealms.com",
  role: "admin"
};
const APEX_STATIC_ADMIN_ACCOUNT = {
  ...APEX_STATIC_DEFAULT_USER,
  password: "apex123"
};
const APEX_ROLE_LABELS = {
  player: "Jogador",
  master: "Mestre",
  admin: "Administrador"
};
const APEX_PUBLIC_ROUTES = new Set(["", "index.html", "login.html", "cadastro.html"]);
const APEX_MASTER_ROUTES = new Set([
  "biblioteca.html",
  "campanhas.html",
  "configuracoes.html",
  "criar-campanha.html",
  "fichas-jogadores.html",
  "master/campaigns.html",
  "master/dashboard.html",
  "master/invites.html",
  "master/library.html",
  "master/players.html",
  "master/profile.html",
  "master/settings.html",
  "master/sheets.html",
  "master/table.html",
  "mestre.html",
  "monstros.html"
]);
const APEX_PLAYER_ROUTES = new Set([
  "player/campaigns.html",
  "player/dashboard.html",
  "player/profile.html",
  "player/sheet.html",
  "player/table.html"
]);

function canonicalStaticRoute(route) {
  const rawRoute = String(route || "")
    .split("#")[0]
    .split("?")[0]
    .replace(/\\/g, "/")
    .trim()
    .toLowerCase();
  let path = rawRoute.replace(/^https?:\/\/[^/]+/i, "").replace(/^\/+/, "");
  const parts = path.split("/").filter(Boolean);
  const repoIndex = parts.lastIndexOf("apex-realms");
  const cleanParts = repoIndex >= 0 ? parts.slice(repoIndex + 1) : parts;
  let cleanRoute = cleanParts.join("/") || "index.html";

  if (cleanRoute === "." || cleanRoute === "..") return "index.html";
  if (cleanRoute.endsWith("/")) cleanRoute = `${cleanRoute}index.html`;
  const fileName = cleanRoute.split("/").pop() || "";
  if (!fileName.includes(".")) return `${cleanRoute}.html`;
  return cleanRoute;
}

function roleLabel(role) {
  return APEX_ROLE_LABELS[role] || "Visitante";
}

function roleHomeRoute(user) {
  if (user?.role === "master") return "master/dashboard.html";
  if (user?.role === "player") return "player/dashboard.html";
  return "dashboard.html";
}

function normalizeStaticRoute(value) {
  if (!value || value.startsWith("#") || value.startsWith("mailto:")) return "";
  try {
    const url = new URL(value, window.location.href);
    if (url.origin !== window.location.origin) return "";
    return canonicalStaticRoute(url.pathname);
  } catch {
    return canonicalStaticRoute(value);
  }
}

function currentStaticRoute() {
  return normalizeStaticRoute(window.location.href);
}

function rootRelativeTarget(route) {
  return /^(master|player)\//.test(currentStaticRoute()) ? `../${route}` : route;
}

function canAccessStaticRoute(user, route) {
  const cleanRoute = normalizeStaticRoute(route);
  if (APEX_PUBLIC_ROUTES.has(cleanRoute)) return true;
  if (!user) return false;
  if (APEX_MASTER_ROUTES.has(cleanRoute)) return user.role === "master";
  if (APEX_PLAYER_ROUTES.has(cleanRoute)) return user.role === "player";
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
    redirectWithNotice(`${rootRelativeTarget("login.html")}?next=${encodeURIComponent(route)}`, "Entre na sua conta para acessar a plataforma.");
    return false;
  }
  if (APEX_MASTER_ROUTES.has(route) && user.role !== "master") {
    redirectWithNotice(rootRelativeTarget(roleHomeRoute(user)), "Apenas contas de Mestre podem criar campanhas e acessar ferramentas de mestre.");
    return false;
  }
  if (APEX_PLAYER_ROUTES.has(route) && user.role !== "player") {
    redirectWithNotice(rootRelativeTarget(roleHomeRoute(user)), "Esta area e exclusiva para contas de jogador.");
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
  const sanitizedUser = {...APEX_STATIC_DEFAULT_USER, ...user};
  delete sanitizedUser.password;
  localStorage.setItem(APEX_STATIC_USER_KEY, JSON.stringify(sanitizedUser));
}

function clearStaticUser() {
  localStorage.removeItem(APEX_STATIC_USER_KEY);
}

function normalizeStaticEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function sanitizeStaticAccount(account) {
  return {
    name: String(account?.name || APEX_STATIC_DEFAULT_USER.name).trim(),
    nickname: String(account?.nickname || APEX_STATIC_DEFAULT_USER.nickname).trim(),
    email: normalizeStaticEmail(account?.email || APEX_STATIC_DEFAULT_USER.email),
    role: account?.role || "player",
    avatar: account?.avatar || "",
    password: String(account?.password || "")
  };
}

function getStaticAccounts() {
  try {
    const accounts = JSON.parse(localStorage.getItem(APEX_STATIC_ACCOUNTS_KEY) || "[]");
    return Array.isArray(accounts) ? accounts.map(sanitizeStaticAccount).filter(account => account.email) : [];
  } catch {
    localStorage.removeItem(APEX_STATIC_ACCOUNTS_KEY);
    return [];
  }
}

function saveStaticAccounts(accounts) {
  localStorage.setItem(APEX_STATIC_ACCOUNTS_KEY, JSON.stringify(accounts.map(sanitizeStaticAccount)));
}

function ensureStaticAdminAccount() {
  const accounts = getStaticAccounts().filter(account => account.email !== APEX_STATIC_ADMIN_ACCOUNT.email);
  saveStaticAccounts([APEX_STATIC_ADMIN_ACCOUNT, ...accounts]);
}

function findStaticAccount(email) {
  ensureStaticAdminAccount();
  return getStaticAccounts().find(account => account.email === normalizeStaticEmail(email)) || null;
}

function upsertStaticAccount(account) {
  const normalizedAccount = sanitizeStaticAccount(account);
  const accounts = getStaticAccounts().filter(item => item.email !== normalizedAccount.email);
  saveStaticAccounts([normalizedAccount, ...accounts]);
  return normalizedAccount;
}

function readStaticJsonStore(key, fallback) {
  try {
    const data = JSON.parse(localStorage.getItem(key) || JSON.stringify(fallback));
    return Array.isArray(fallback) ? (Array.isArray(data) ? data : fallback) : (data && typeof data === "object" ? data : fallback);
  } catch {
    localStorage.removeItem(key);
    return fallback;
  }
}

function compactInviteCode(value) {
  return String(value || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function normalizeInviteCode(value) {
  const compact = compactInviteCode(value);
  if (!compact) return "";
  const body = compact.startsWith("AR") ? compact.slice(2) : compact;
  if (!body) return "AR-";
  const safeBody = body.slice(0, 8);
  return `AR-${safeBody.slice(0, 4)}${safeBody.length > 4 ? `-${safeBody.slice(4)}` : ""}`;
}

function generateInviteCode(existingCodes = []) {
  const usedCodes = new Set(existingCodes.map(item => compactInviteCode(typeof item === "string" ? item : item?.inviteCode || item?.code)));
  const part = (length = 4) => Array.from({length}, () => APEX_INVITE_CHARS[Math.floor(Math.random() * APEX_INVITE_CHARS.length)]).join("");
  let code = "";
  do {
    code = `AR-${part()}-${part()}`;
  } while (usedCodes.has(compactInviteCode(code)));
  return code;
}

function withInviteCodes(campaigns) {
  const usedCodes = new Set();
  return campaigns.map(campaign => {
    const visibility = campaign?.visibility === "public" || campaign?.private === false ? "public" : "private";
    if (visibility === "public") {
      return {...campaign, visibility, private: false, inviteCode: "", code: ""};
    }
    const rawInviteCode = normalizeInviteCode(campaign?.inviteCode || campaign?.code);
    const currentCode = rawInviteCode.startsWith("AR-") && !usedCodes.has(compactInviteCode(rawInviteCode)) ? rawInviteCode : "";
    const inviteCode = currentCode || generateInviteCode([...usedCodes]);
    usedCodes.add(compactInviteCode(inviteCode));
    return {...campaign, visibility, private: true, inviteCode, code: inviteCode};
  });
}

function readStaticCampaignsWithInvites() {
  const rawCampaigns = readStaticJsonStore(APEX_STATIC_CAMPAIGNS_KEY, []);
  const campaigns = withInviteCodes(rawCampaigns);
  if (JSON.stringify(rawCampaigns) !== JSON.stringify(campaigns)) {
    localStorage.setItem(APEX_STATIC_CAMPAIGNS_KEY, JSON.stringify(campaigns));
  }
  return campaigns;
}

function saveStaticCampaignsWithInvites(campaigns) {
  const normalizedCampaigns = withInviteCodes(Array.isArray(campaigns) ? campaigns : []);
  localStorage.setItem(APEX_STATIC_CAMPAIGNS_KEY, JSON.stringify(normalizedCampaigns));
  return normalizedCampaigns;
}

function findStaticCampaignByInviteCode(code) {
  const compactCode = compactInviteCode(code);
  if (!compactCode) return null;
  return readStaticCampaignsWithInvites().find(campaign => campaign.visibility !== "public" && !campaign.archived && compactInviteCode(campaign.inviteCode || campaign.code) === compactCode) || null;
}

function readPlayerCampaignRegistry() {
  return readStaticJsonStore(APEX_STATIC_PLAYER_CAMPAIGNS_KEY, {});
}

function savePlayerCampaignRegistry(registry) {
  localStorage.setItem(APEX_STATIC_PLAYER_CAMPAIGNS_KEY, JSON.stringify(registry && typeof registry === "object" ? registry : {}));
}

function playerRegistryKey(user = getStaticUser()) {
  return normalizeStaticEmail(user?.email || "");
}

function readJoinedCampaignEntries(user = getStaticUser()) {
  const key = playerRegistryKey(user);
  if (!key) return [];
  const registry = readPlayerCampaignRegistry();
  return Array.isArray(registry[key]) ? registry[key] : [];
}

function saveJoinedCampaignEntries(user, entries) {
  const key = playerRegistryKey(user);
  if (!key) return;
  const registry = readPlayerCampaignRegistry();
  registry[key] = Array.isArray(entries) ? entries : [];
  savePlayerCampaignRegistry(registry);
}

function readJoinedCampaigns(user = getStaticUser()) {
  const entries = readJoinedCampaignEntries(user);
  const campaigns = readStaticCampaignsWithInvites();
  return entries
    .map(entry => {
      const campaign = campaigns.find(item => item.id === entry.campaignId || compactInviteCode(item.inviteCode || item.code) === compactInviteCode(entry.inviteCode));
      return campaign ? {...campaign, joinedAt: entry.joinedAt, joinStatus: entry.status || "Ativo"} : null;
    })
    .filter(Boolean);
}

function joinCampaignByInviteCode(code, user = getStaticUser()) {
  const normalizedCode = normalizeInviteCode(code);
  if (!user) return {ok: false, reason: "auth", message: "Entre na sua conta para usar o convite."};
  if (user.role !== "player") return {ok: false, reason: "role", message: "Use uma conta de jogador para entrar por convite."};
  const campaign = findStaticCampaignByInviteCode(normalizedCode);
  if (!campaign) return {ok: false, reason: "missing", message: "Convite nao encontrado ou expirado."};
  const masterSettings = readStaticJsonStore("apex-realms-master-settings", {});
  const joinStatus = masterSettings.approvalMode === "automatic" ? "Aprovado" : "Pendente";

  const entries = readJoinedCampaignEntries(user);
  const alreadyJoined = entries.some(entry => entry.campaignId === campaign.id || compactInviteCode(entry.inviteCode) === compactInviteCode(campaign.inviteCode));
  if (!alreadyJoined) {
    saveJoinedCampaignEntries(user, [{
      campaignId: campaign.id,
      campaignName: campaign.name || "Campanha sem nome",
      inviteCode: campaign.inviteCode,
      joinedAt: new Date().toISOString(),
      status: joinStatus
    }, ...entries]);
  }

  const campaigns = readStaticCampaignsWithInvites();
  const player = {
    email: normalizeStaticEmail(user.email),
    name: user.name || user.nickname || "Jogador Apex",
    nickname: user.nickname || "",
    joinedAt: new Date().toISOString(),
    status: joinStatus
  };
  saveStaticCampaignsWithInvites(campaigns.map(item => {
    if (item.id !== campaign.id) return item;
    const players = Array.isArray(item.players) ? item.players.filter(saved => normalizeStaticEmail(saved.email) !== player.email) : [];
    return {...item, players: [player, ...players]};
  }));

  const message = joinStatus === "Aprovado" ? `Voce entrou em ${campaign.name}.` : `Solicitacao enviada para ${campaign.name}. Aguarde a aprovacao do Mestre.`;
  return {ok: true, campaign, alreadyJoined, message: alreadyJoined ? `Seu acesso a ${campaign.name} ja foi registrado.` : message};
}

function inviteLinkForCode(code) {
  const rootPath = window.location.pathname
    .replace(/\/master\/[^/]*$/i, "/")
    .replace(/\/[^/]*$/i, "/");
  return `${window.location.origin}${rootPath}cadastro.html?invite=${encodeURIComponent(normalizeInviteCode(code))}`;
}

function runStaticLaunchReset() {
  if (localStorage.getItem(APEX_STATIC_RESET_KEY)) {
    ensureStaticAdminAccount();
    return;
  }
  [
    APEX_STATIC_USER_KEY,
    APEX_STATIC_CAMPAIGNS_KEY,
    APEX_STATIC_PLAYER_CAMPAIGNS_KEY,
    "apex-realms-campaign-draft",
    "apex-realms-last-campaign",
    "apex-realms-session-state",
    "apex-realms-room-permissions",
    "apex-realms-monster-library",
    "apex-realms-pending-monster",
    "apex-realms-dnd5e-kael",
    "apex-realms-character-photo",
    "apex-realms-collapsed-sheet-sections",
    "apex-realms-favorite-sheets"
  ].forEach(key => localStorage.removeItem(key));
  saveStaticAccounts([APEX_STATIC_ADMIN_ACCOUNT]);
  localStorage.setItem(APEX_STATIC_RESET_KEY, new Date().toISOString());
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
  if (document.body.matches("[data-master-page='dashboard']") && message.includes("Apenas contas de Mestre")) return;
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
      return;
    }
  }
  const logoutButton = event.target.closest("[data-logout]");
  if (!logoutButton) return;
  clearStaticUser();
  showPrototypeToast("Conta encerrada. Voltando para o login.");
  setTimeout(() => {
    window.location.href = rootRelativeTarget("login.html");
  }, 550);
});

window.ApexStaticAuth = {
  applyUser: applyStaticUser,
  clearUser: clearStaticUser,
  canAccessRoute: canAccessStaticRoute,
  findAccount: findStaticAccount,
  getUser: getStaticUser,
  homeRoute: roleHomeRoute,
  roleLabel,
  saveUser: saveStaticUser,
  upsertAccount: upsertStaticAccount
};

window.ApexInvites = {
  compactCode: compactInviteCode,
  findCampaignByCode: findStaticCampaignByInviteCode,
  generateCode: generateInviteCode,
  inviteLink: inviteLinkForCode,
  joinByCode: joinCampaignByInviteCode,
  normalizeCode: normalizeInviteCode,
  readCampaigns: readStaticCampaignsWithInvites,
  readJoinedCampaigns,
  saveCampaigns: saveStaticCampaignsWithInvites
};

runStaticLaunchReset();
applyStaticUser();
