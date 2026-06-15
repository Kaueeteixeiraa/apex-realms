const monsterLibraryKey = "apex-realms-monster-library";
const defaultMonsters = [
  { id:"goblin", name:"Goblin", type:"Humanoide", ac:15, hp:7, speed:"9m", cr:"1/4", xp:50, str:8, dex:14, con:10, int:10, wis:8, cha:8, attacks:"Cimitarra +4 · 1d6+2", abilities:"Ação ardilosa", description:"Astuto e oportunista, ataca de emboscada.", visibility:"hidden" },
  { id:"orc", name:"Orc", type:"Humanoide", ac:13, hp:15, speed:"9m", cr:"1/2", xp:100, str:16, dex:12, con:16, int:7, wis:11, cha:10, attacks:"Machado grande +5 · 1d12+3", abilities:"Agressivo", description:"Guerreiro feroz que avança sem hesitar.", visibility:"hidden" },
  { id:"lobo", name:"Lobo", type:"Fera", ac:13, hp:11, speed:"12m", cr:"1/4", xp:50, str:12, dex:15, con:12, int:3, wis:12, cha:6, attacks:"Mordida +4 · 2d4+2", abilities:"Táticas de matilha", description:"Caçador com faro aguçado.", visibility:"visible" },
  { id:"esqueleto", name:"Esqueleto", type:"Morto-vivo", ac:13, hp:13, speed:"9m", cr:"1/4", xp:50, str:10, dex:14, con:15, int:6, wis:8, cha:5, attacks:"Espada curta +4 · 1d6+2", abilities:"Vulnerável a concussão", description:"Restos animados por magia profana.", visibility:"hidden" },
  { id:"cultista", name:"Cultista", type:"Humanoide", ac:12, hp:9, speed:"9m", cr:"1/8", xp:25, str:11, dex:12, con:10, int:10, wis:11, cha:10, attacks:"Cimitarra +3 · 1d6+1", abilities:"Devoção sombria", description:"Devoto de uma entidade além do portal.", visibility:"hidden" }
];
let monsters = JSON.parse(localStorage.getItem(monsterLibraryKey) || "null") || defaultMonsters;
const monsterGrid = document.querySelector("#managed-monster-grid");
const monsterForm = document.querySelector("#monster-form");
let editingMonsterId = null;
let currentMonsterImage = null;

function setMonsterImage(source) {
  currentMonsterImage = source || null;
  const preview = document.querySelector("#monster-image-preview");
  preview.style.backgroundImage = source ? `url("${source}")` : "";
  preview.style.backgroundSize = source ? "cover" : "";
  preview.style.backgroundPosition = "center";
}

function saveMonsters() {
  localStorage.setItem(monsterLibraryKey, JSON.stringify(monsters));
  document.querySelector("#monster-count").textContent = monsters.length;
}

function renderMonsters() {
  const query = document.querySelector("#monster-search").value.toLowerCase();
  const type = document.querySelector("#monster-type-filter").value;
  const cr = document.querySelector("#monster-cr-filter").value;
  monsterGrid.innerHTML = "";
  monsters.filter(monster => monster.name.toLowerCase().includes(query) && (type === "all" || monster.type === type) && (cr === "all" || monster.cr === cr)).forEach(monster => {
    const card = document.createElement("article");
    card.className = "managed-monster-card";
    card.innerHTML = `<header><i class="monster-orb"></i><span><small>${monster.type.toUpperCase()} · ND ${monster.cr}</small><h2>${monster.name}</h2><p>${monster.description}</p></span><mark class="${monster.visibility === "visible" ? "group-badge" : "private-badge"}">${monster.visibility === "visible" ? "VISÍVEL" : "OCULTO"}</mark></header><div><span><small>PV</small><b>${monster.hp}</b></span><span><small>CA</small><b>${monster.ac}</b></span><span><small>DESL.</small><b>${monster.speed}</b></span><span><small>XP</small><b>${monster.xp}</b></span></div><p><b>Ataques:</b> ${monster.attacks}</p><footer><button data-add="${monster.id}" class="btn btn-primary">Adicionar à mesa</button><button data-edit="${monster.id}" class="quiet-button">Editar</button><button data-remove="${monster.id}" class="quiet-button">Remover</button></footer>`;
    if (monster.image) card.querySelector(".monster-orb").style.backgroundImage = `url("${monster.image}")`;
    monsterGrid.append(card);
  });
}

document.querySelectorAll("#monster-search,#monster-type-filter,#monster-cr-filter").forEach(field => field.addEventListener("input", renderMonsters));
document.querySelector("#create-monster").addEventListener("click", () => {
  editingMonsterId = null; monsterForm.reset(); setMonsterImage(null); document.querySelector("#monster-form-title").textContent = "Criar monstro"; document.querySelector("#monster-editor").classList.add("open");
});
document.querySelector("#monster-image-upload").addEventListener("change", event => {
  const file = event.target.files[0];
  if (!file) return;
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    event.target.value = "";
    return showPrototypeToast("Use uma imagem JPG, PNG ou WEBP.");
  }
  const reader = new FileReader();
  reader.addEventListener("load", () => setMonsterImage(reader.result));
  reader.readAsDataURL(file);
});
document.querySelector("#remove-monster-image").addEventListener("click", () => {
  document.querySelector("#monster-image-upload").value = "";
  setMonsterImage(null);
});
monsterGrid.addEventListener("click", event => {
  const add = event.target.closest("[data-add]");
  const edit = event.target.closest("[data-edit]");
  const remove = event.target.closest("[data-remove]");
  if (add) {
    const monster = monsters.find(item => item.id === add.dataset.add);
    localStorage.setItem("apex-realms-pending-monster", JSON.stringify(monster));
    showPrototypeToast(`${monster.name} selecionado. Clique no mapa para posicionar.`);
    return;
  }
  if (edit) {
    const monster = monsters.find(item => item.id === edit.dataset.edit);
    editingMonsterId = monster.id; document.querySelector("#monster-form-title").textContent = `Editar ${monster.name}`; setMonsterImage(monster.image);
    Object.entries(monster).forEach(([key, value]) => { if (monsterForm.elements[key]) monsterForm.elements[key].value = value; });
    document.querySelector("#monster-editor").classList.add("open");
  }
  if (remove) { monsters = monsters.filter(item => item.id !== remove.dataset.remove); saveMonsters(); renderMonsters(); }
});
monsterForm.addEventListener("submit", event => {
  event.preventDefault();
  const data = Object.fromEntries(new FormData(monsterForm));
  ["ac", "hp", "xp", "str", "dex", "con", "int", "wis", "cha"].forEach(key => { data[key] = Number(data[key]); });
  data.image = currentMonsterImage; data.id = editingMonsterId || `${data.name.toLowerCase().replace(/\W+/g, "-")}-${Date.now()}`;
  monsters = editingMonsterId ? monsters.map(item => item.id === editingMonsterId ? data : item) : [...monsters, data];
  saveMonsters(); renderMonsters(); document.querySelector("#monster-editor").classList.remove("open");
});
saveMonsters(); renderMonsters();
