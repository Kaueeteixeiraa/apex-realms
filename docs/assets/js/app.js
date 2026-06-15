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
  showPrototypeToast("Pronto. A ação foi simulada no protótipo.");
}));

document.querySelectorAll("[data-demo-action]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Recurso adicionado à cena de demonstração.");
}));

document.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Alterações salvas localmente.");
}));

// Lightweight session helper used by the GitHub Pages demo.
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

function roleLabel(role) {
  return APEX_ROLE_LABELS[role] || "Jogador";
}

function getStaticUser() {
  try {
    const user = JSON.parse(localStorage.getItem(APEX_STATIC_USER_KEY) || "null");
    return user && typeof user === "object" ? {...APEX_STATIC_DEFAULT_USER, ...user} : APEX_STATIC_DEFAULT_USER;
  } catch {
    localStorage.removeItem(APEX_STATIC_USER_KEY);
    return APEX_STATIC_DEFAULT_USER;
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
    if (roleElement) roleElement.textContent = `${label} · Sessão demo`;
    if (user.avatar && portrait) {
      portrait.classList.add("custom-avatar");
      portrait.style.backgroundImage = `url("${user.avatar}")`;
    }
    if (button && !button.dataset.authKeep) {
      button.textContent = "Sair";
      button.title = "Sair da demonstração";
      button.dataset.logout = "true";
    }
  });

  document.querySelectorAll("[data-admin-only]").forEach(element => {
    element.hidden = user.role !== "admin";
  });
}

document.addEventListener("click", event => {
  const logoutButton = event.target.closest("[data-logout]");
  if (!logoutButton) return;
  clearStaticUser();
  showPrototypeToast("Sessão encerrada. Voltando para o login.");
  setTimeout(() => {
    window.location.href = "login.html";
  }, 550);
});

window.ApexStaticAuth = {
  applyUser: applyStaticUser,
  clearUser: clearStaticUser,
  getUser: getStaticUser,
  roleLabel,
  saveUser: saveStaticUser
};

applyStaticUser();
