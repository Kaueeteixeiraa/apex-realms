// Sheet library interactions for the static GitHub Pages prototype.
const sheetCards = [...document.querySelectorAll(".my-sheet-card")];
const searchInput = document.querySelector("#sheet-search");
const filters = [...document.querySelectorAll(".sheet-library-toolbar select")];
const emptyState = document.querySelector("#sheet-empty-state");
const favoriteKey = "apex-realms-favorite-sheets";
const storedFavorites = new Set(JSON.parse(localStorage.getItem(favoriteKey) || "[]"));
let currentView = "all";

function showSheetToast(message) {
  if (typeof showPrototypeToast === "function") showPrototypeToast(message);
}

function applyFilters() {
  const query = searchInput.value.trim().toLowerCase();
  let visible = 0;
  sheetCards.forEach(card => {
    const matchesQuery = card.dataset.name.includes(query);
    const matchesFilters = filters.every(filter => filter.value === "all" || card.dataset[filter.id.replace("filter-", "")] === filter.value);
    const matchesView = currentView === "all" || (currentView === "favorites" && card.classList.contains("favorite")) || (currentView === "archived" && card.dataset.status === "archived");
    const show = matchesQuery && matchesFilters && matchesView;
    card.hidden = !show;
    if (show) visible += 1;
  });
  emptyState.classList.toggle("show", visible === 0);
}

storedFavorites.forEach(name => {
  const card = sheetCards.find(item => item.dataset.name === name);
  if (card) {
    card.classList.add("favorite");
    card.querySelector("[data-favorite]").classList.add("active");
    card.querySelector("[data-favorite]").textContent = "★";
  }
});

searchInput.addEventListener("input", applyFilters);
filters.forEach(filter => filter.addEventListener("change", applyFilters));

document.querySelectorAll("[data-sheet-view]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-sheet-view]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  currentView = button.dataset.sheetView;
  applyFilters();
}));

document.querySelectorAll("[data-favorite]").forEach(button => button.addEventListener("click", () => {
  const card = button.closest(".my-sheet-card");
  card.classList.toggle("favorite");
  button.classList.toggle("active");
  button.textContent = card.classList.contains("favorite") ? "★" : "☆";
  const favorites = sheetCards.filter(item => item.classList.contains("favorite")).map(item => item.dataset.name);
  localStorage.setItem(favoriteKey, JSON.stringify(favorites));
  applyFilters();
}));

document.querySelectorAll("[data-sheet-menu]").forEach(button => button.addEventListener("click", event => {
  event.stopPropagation();
  const menu = button.closest(".my-sheet-card").querySelector(".sheet-card-menu");
  document.querySelectorAll(".sheet-card-menu").forEach(item => item.classList.toggle("open", item === menu && !menu.classList.contains("open")));
}));

document.addEventListener("click", () => document.querySelectorAll(".sheet-card-menu").forEach(menu => menu.classList.remove("open")));

document.querySelectorAll("[data-sheet-action]").forEach(button => button.addEventListener("click", event => {
  event.stopPropagation();
  const card = button.closest(".my-sheet-card");
  const actions = {
    duplicate:"Uma cópia da ficha foi criada na biblioteca.",
    link:"Escolha uma campanha ou sala para vincular esta ficha.",
    export:"Exportação será disponibilizada em uma próxima versão.",
    locked:"A ficha está visível, mas o Mestre bloqueou alterações durante a sessão.",
    archive:"Ficha arquivada. Ela continua disponível na aba Arquivadas.",
    restore:"Ficha restaurada para sua biblioteca principal."
  };
  if (button.dataset.sheetAction === "archive") card.dataset.status = "archived";
  if (button.dataset.sheetAction === "restore") card.dataset.status = "active";
  showSheetToast(actions[button.dataset.sheetAction]);
  applyFilters();
}));

document.querySelectorAll("#new-sheet,#new-sheet-card").forEach(button => button.addEventListener("click", () => {
  document.querySelector("#sheet-create-modal").classList.add("open");
}));

applyFilters();
