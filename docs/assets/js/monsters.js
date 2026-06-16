const monsterLibraryKey = "apex-realms-monster-library";
const defaultMonsters = [];
let monsters = JSON.parse(localStorage.getItem(monsterLibraryKey) || "null") || defaultMonsters;
const monsterGrid = document.querySelector("#managed-monster-grid");
const monsterForm = document.querySelector("#monster-form");
let editingMonsterId = null;
let currentMonsterImage = null;

function setMonsterImage(source) {
  currentMonsterImage = source || null;
  const preview = document.querySelector("#monster-image-preview");
  if (!preview) return;
  preview.style.backgroundImage = source ? `url("${source}")` : "";
  preview.style.backgroundSize = source ? "cover" : "";
  preview.style.backgroundPosition = "center";
}

function saveMonsters() {
  localStorage.setItem(monsterLibraryKey, JSON.stringify(monsters));
  const counter = document.querySelector("#monster-count");
  if (counter) counter.textContent = monsters.length;
}

function renderMonsters() {
  if (!monsterGrid) return;
  const query = document.querySelector("#monster-search")?.value.toLowerCase() || "";
  const type = document.querySelector("#monster-type-filter")?.value || "all";
  const cr = document.querySelector("#monster-cr-filter")?.value || "all";
  monsterGrid.innerHTML = "";
  const visibleMonsters = monsters.filter(monster => monster.name.toLowerCase().includes(query) && (type === "all" || monster.type === type) && (cr === "all" || monster.cr === cr));
  if (!visibleMonsters.length) {
    monsterGrid.innerHTML = `<article class="monster-card create-monster"><button type="button" id="create-empty-monster"><i>+</i><b>Criar primeiro monstro</b><span>Nenhuma criatura cadastrada ainda.</span></button></article>`;
    return;
  }
  visibleMonsters.forEach(monster => {
    const card = document.createElement("article");
    card.className = "managed-monster-card";
    card.innerHTML = `<header><i class="monster-orb"></i><span><small>${monster.type.toUpperCase()} - ND ${monster.cr}</small><h2>${monster.name}</h2><p>${monster.description}</p></span><mark class="${monster.visibility === "visible" ? "group-badge" : "private-badge"}">${monster.visibility === "visible" ? "VISIVEL" : "OCULTO"}</mark></header><div><span><small>PV</small><b>${monster.hp}</b></span><span><small>CA</small><b>${monster.ac}</b></span><span><small>DESL.</small><b>${monster.speed}</b></span><span><small>XP</small><b>${monster.xp}</b></span></div><p><b>Ataques:</b> ${monster.attacks}</p><footer><button data-add="${monster.id}" class="btn btn-primary">Adicionar a mesa</button><button data-edit="${monster.id}" class="quiet-button">Editar</button><button data-remove="${monster.id}" class="quiet-button">Remover</button></footer>`;
    if (monster.image) card.querySelector(".monster-orb").style.backgroundImage = `url("${monster.image}")`;
    monsterGrid.append(card);
  });
}

function openMonsterEditor() {
  if (!monsterForm) return;
  editingMonsterId = null;
  monsterForm.reset();
  setMonsterImage(null);
  document.querySelector("#monster-form-title").textContent = "Criar monstro";
  document.querySelector("#monster-editor").classList.add("open");
}

document.querySelectorAll("#monster-search,#monster-type-filter,#monster-cr-filter").forEach(field => field.addEventListener("input", renderMonsters));
document.querySelector("#create-monster")?.addEventListener("click", openMonsterEditor);
monsterGrid?.addEventListener("click", event => {
  if (event.target.closest("#create-empty-monster")) openMonsterEditor();
});

saveMonsters();
renderMonsters();
