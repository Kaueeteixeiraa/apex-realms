const stage = document.querySelector("#stage");
const board = document.querySelector("#board");
const gridLayer = document.querySelector("#grid-layer");
const effects = document.querySelector("#effects");
const messages = document.querySelector("#messages");
const rollFeed = document.querySelector("#roll-feed");
const diceAnimation = document.querySelector("#dice-animation");
let activeTool = "select";
let measureStart = null;
let panStart = null;
let pendingMonster = JSON.parse(localStorage.getItem("apex-realms-pending-monster") || "null");

function persist() { saveSessionState(); }
function parseDice(formula) {
  const match = String(formula).replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const dice = Array.from({ length: Number(match[1]) }, () => Math.ceil(Math.random() * Number(match[2])));
  return { dice, total: dice.reduce((sum, die) => sum + die, 0) + Number(match[3] || 0), sides: Number(match[2]) };
}
function animateDie(sides, total, callback) {
  diceAnimation.querySelector("i").textContent = `d${sides}`;
  diceAnimation.querySelector("b").textContent = total;
  diceAnimation.classList.remove("rolling");
  void diceAnimation.offsetWidth;
  diceAnimation.classList.add("rolling");
  setTimeout(callback, 650);
}
function addChat(author, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";
  wrapper.innerHTML = `<i class="portrait kael"></i><div><span><b></b><small>agora</small></span><p></p></div>`;
  wrapper.querySelector("b").textContent = author;
  wrapper.querySelector("p").textContent = text;
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
  sessionState.chatMessages.push({ author, text, at: Date.now() });
  persist();
}
function addRoll(label, formula, result) {
  const critical = result.sides === 20 && result.dice[0] === 20;
  const failure = result.sides === 20 && result.dice[0] === 1;
  const wrapper = document.createElement("div");
  wrapper.className = `roll-message${critical ? " critical-roll" : ""}${failure ? " damage-roll" : ""}`;
  wrapper.innerHTML = `<span><small></small><b></b></span><strong></strong><em></em>`;
  wrapper.querySelector("small").textContent = label;
  wrapper.querySelector("b").textContent = formula;
  wrapper.querySelector("strong").textContent = result.total;
  wrapper.querySelector("em").textContent = critical ? "Crítico!" : failure ? "Falha crítica" : `Dados: ${result.dice.join(", ")}`;
  rollFeed.prepend(wrapper);
  sessionState.diceRolls.unshift({ label, formula, result, at: Date.now() });
  persist();
}
function rollFormula(formula, label = "ROLAGEM · KAEL") {
  if (sessionState.mode !== "master" && !sessionState.permissions.dice) {
    showPrototypeToast("Rolagens foram desativadas pelo Mestre.");
    return false;
  }
  const result = parseDice(formula);
  if (!result) return false;
  animateDie(result.sides, result.total, () => addRoll(label, formula, result));
  document.querySelector('[data-tab="rolls"]')?.click();
  return true;
}

document.querySelectorAll("[data-drawer]").forEach(button => button.addEventListener("click", event => {
  if (event.target.closest("a")) return;
  const target = document.querySelector(`#${button.dataset.drawer}`);
  const opening = target?.classList.contains("collapsed");
  document.querySelectorAll(".table-drawer").forEach(drawer => drawer.classList.add("collapsed"));
  if (opening) target.classList.remove("collapsed");
}));
document.querySelectorAll("[data-close-drawer]").forEach(button => button.addEventListener("click", () => document.querySelector(`#${button.dataset.closeDrawer}`)?.classList.add("collapsed")));
document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tab],.right-pane").forEach(element => element.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#${button.dataset.tab}`)?.classList.add("active");
}));

const diceTray = document.querySelector(".dice");
[20, 12, 10, 8, 6, 4, 100].forEach(sides => {
  const button = document.createElement("button");
  button.textContent = `d${sides}`;
  button.addEventListener("click", () => rollFormula(`1d${sides}`, `D${sides} · KAEL`));
  diceTray?.append(button);
});
document.querySelector("#custom-roll")?.addEventListener("submit", event => {
  event.preventDefault();
  const input = event.currentTarget.querySelector("input");
  if (rollFormula(input.value, "ROLAGEM PERSONALIZADA · KAEL")) input.value = "";
});
document.querySelector("#chat-form")?.addEventListener("submit", event => {
  event.preventDefault();
  if (sessionState.mode !== "master" && !sessionState.permissions.chat) {
    showPrototypeToast("O chat foi desativado pelo Mestre.");
    return;
  }
  const input = document.querySelector("#chat-input");
  const value = input.value.trim();
  if (!value) return;
  const command = value.match(/^\/(?:roll|r)\s+(.+)$/i);
  if (command) rollFormula(command[1], "COMANDO DE DADOS · KAEL");
  else if (!rollFormula(value)) addChat("Você · Kael", value);
  input.value = "";
});

function applyBoardTransform() {
  const { panX, panY, zoom } = sessionState.mapState;
  board.style.transform = `translate(${panX}px,${panY}px) scale(${zoom})`;
  document.querySelector("#zoom").textContent = `${Math.round(zoom * 100)}%`;
}
function selectTool(tool) {
  activeTool = tool;
  measureStart = null;
  document.querySelectorAll("[data-tool]").forEach(button => button.classList.toggle("active", button.dataset.tool === tool));
  stage.dataset.tool = tool;
}
document.querySelectorAll("[data-tool]").forEach(button => button.addEventListener("click", () => selectTool(button.dataset.tool)));
document.querySelector("#grid")?.addEventListener("click", event => {
  sessionState.mapState.gridVisible = !sessionState.mapState.gridVisible;
  gridLayer.classList.toggle("hidden", !sessionState.mapState.gridVisible);
  event.currentTarget.classList.toggle("active", sessionState.mapState.gridVisible);
  document.querySelector("#map-grid-toggle").checked = sessionState.mapState.gridVisible;
  persist();
});
document.querySelector("#snap")?.addEventListener("click", event => {
  sessionState.mapState.snapToGrid = !sessionState.mapState.snapToGrid;
  event.currentTarget.classList.toggle("active", sessionState.mapState.snapToGrid);
  showPrototypeToast(sessionState.mapState.snapToGrid ? "Snap to grid ativado." : "Movimento livre ativado.");
  persist();
});
document.querySelector("#plus")?.addEventListener("click", () => { sessionState.mapState.zoom = Math.min(1.8, sessionState.mapState.zoom + .1); applyBoardTransform(); persist(); });
document.querySelector("#minus")?.addEventListener("click", () => { sessionState.mapState.zoom = Math.max(.5, sessionState.mapState.zoom - .1); applyBoardTransform(); persist(); });
document.querySelector("#center")?.addEventListener("click", () => { sessionState.mapState.panX = 0; sessionState.mapState.panY = 0; sessionState.mapState.zoom = 1; applyBoardTransform(); persist(); });
stage.addEventListener("wheel", event => {
  if (activeTool !== "pan") return;
  if (sessionState.mode !== "master" && sessionState.mapState.lockedForPlayers) return;
  event.preventDefault();
  sessionState.mapState.zoom = Math.max(.5, Math.min(1.8, sessionState.mapState.zoom + (event.deltaY < 0 ? .1 : -.1)));
  applyBoardTransform(); persist();
}, { passive:false });
stage.addEventListener("pointerdown", event => {
  if (activeTool !== "pan" || event.target.closest(".token-card,.floating-tools,.master-toolbar")) return;
  if (sessionState.mode !== "master" && sessionState.mapState.lockedForPlayers) {
    showPrototypeToast("O mapa está travado pelo Mestre.");
    return;
  }
  panStart = { x:event.clientX, y:event.clientY, panX:sessionState.mapState.panX, panY:sessionState.mapState.panY };
  stage.setPointerCapture(event.pointerId);
});
stage.addEventListener("pointermove", event => {
  if (!panStart) return;
  sessionState.mapState.panX = panStart.panX + event.clientX - panStart.x;
  sessionState.mapState.panY = panStart.panY + event.clientY - panStart.y;
  applyBoardTransform();
});
stage.addEventListener("pointerup", () => { if (panStart) persist(); panStart = null; });

function bindToken(token) {
  token.addEventListener("click", event => {
    if (event.target.closest("[data-token-action]")) return;
    event.stopPropagation();
    token.classList.toggle("expanded");
  });
  token.addEventListener("pointerdown", event => {
    if (activeTool !== "select" || event.target.closest("[data-token-action]")) return;
    const tokenState = sessionState.tokens.find(item => item.id === token.id);
    const canMove = sessionState.mode === "master" || (sessionState.permissions.moveTokens && tokenState?.owner);
    if (!canMove) { showPrototypeToast("Você não tem permissão para mover este token."); return; }
    event.stopPropagation();
    token.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const rect = stage.getBoundingClientRect();
      let x = (moveEvent.clientX - rect.left - sessionState.mapState.panX) / sessionState.mapState.zoom;
      let y = (moveEvent.clientY - rect.top - sessionState.mapState.panY) / sessionState.mapState.zoom;
      if (sessionState.mapState.snapToGrid) { x = Math.round(x / 52) * 52; y = Math.round(y / 52) * 52; }
      const percentX = Math.max(2, Math.min(98, x / rect.width * 100));
      const percentY = Math.max(2, Math.min(98, y / rect.height * 100));
      token.style.left = `${percentX}%`; token.style.top = `${percentY}%`;
      if (tokenState) { tokenState.x = percentX; tokenState.y = percentY; }
    };
    token.addEventListener("pointermove", move);
    token.addEventListener("pointerup", () => { token.removeEventListener("pointermove", move); persist(); }, { once:true });
  });
}
document.querySelectorAll(".token-card").forEach(bindToken);

function clearMeasurements() {
  effects.querySelectorAll(".measure-line").forEach(line => line.remove());
  sessionState.measurements = []; measureStart = null; persist();
}
document.querySelector("#clear-measurements")?.addEventListener("click", clearMeasurements);
document.addEventListener("keydown", event => {
  if (event.key === "Escape") { measureStart = null; selectTool("select"); }
  if (event.key === "Delete" && activeTool === "measure") clearMeasurements();
});
stage.addEventListener("click", event => {
  if (event.target.closest(".token-card,.floating-tools,.master-toolbar,.table-dock,.chat-dice-button")) return;
  if (pendingMonster) { addMonsterAtPoint(pendingMonster, event); pendingMonster = null; localStorage.removeItem("apex-realms-pending-monster"); return; }
  const rect = stage.getBoundingClientRect();
  const x = (event.clientX - rect.left - sessionState.mapState.panX) / sessionState.mapState.zoom;
  const y = (event.clientY - rect.top - sessionState.mapState.panY) / sessionState.mapState.zoom;
  if (activeTool === "ping") {
    const ping = document.createElement("i"); ping.className = "demo-ping"; ping.style.cssText = `left:${x}px;top:${y}px`; effects.append(ping); setTimeout(() => ping.remove(), 1600);
  }
  if (activeTool === "measure") {
    if (!sessionState.permissions.ruler && sessionState.mode !== "master") return showPrototypeToast("A régua foi desativada pelo Mestre.");
    if (!measureStart) { measureStart = { x, y }; return; }
    const dx = x - measureStart.x; const dy = y - measureStart.y;
    const distance = `${Math.round(Math.hypot(dx, dy) / 52) * sessionState.mapState.scale} metros`;
    const line = document.createElement("i"); line.className = "measure-line"; line.style.cssText = `left:${measureStart.x}px;top:${measureStart.y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`; line.dataset.distance = distance; effects.append(line);
    sessionState.measurements.push({ ...measureStart, dx, dy, distance }); measureStart = null; persist();
  }
});

function addMonsterAtPoint(monster, event) {
  if (sessionState.mode !== "master") {
    showPrototypeToast("Somente o Mestre pode adicionar criaturas.");
    return;
  }
  const rect = stage.getBoundingClientRect();
  const x = Math.max(2, Math.min(98, (event.clientX - rect.left) / rect.width * 100));
  const y = Math.max(2, Math.min(98, (event.clientY - rect.top) / rect.height * 100));
  const id = `${monster.id}-${Date.now()}`;
  const state = { ...monster, id, kind:"monster", x, y, maxHp:monster.hp, initiative:0 };
  sessionState.tokens.push(state); sessionState.monsters.push(state);
  const token = document.createElement("article");
  token.className = "map-token token-card enemy-card dynamic-monster"; token.id = id; token.style.cssText = `left:${x}%;top:${y}%;--token:#ff657f`;
  token.innerHTML = `<span class="token-summary"><i class="monster-orb"></i><b>${monster.name}</b><em>${monster.hp}/${monster.hp}</em></span><div class="token-details"><small>MONSTRO · ${monster.type.toUpperCase()}</small><h3>${monster.name}</h3><div><span><b>${monster.hp}/${monster.hp}</b><small>PV</small></span><span><b>${monster.ac}</b><small>CA</small></span><span><b>+0</b><small>INI</small></span><span><b>${monster.speed}</b><small>DESL.</small></span></div><p>${monster.attacks}</p><footer><button data-token-action="initiative">Iniciativa</button><button data-token-action="attack">Atacar</button><button data-token-action="damage">Dano</button><button data-token-action="reveal">Revelar</button></footer></div>`;
  if (monster.image) token.querySelector(".monster-orb").style.backgroundImage = `url("${monster.image}")`;
  board.append(token); bindToken(token); persist(); showPrototypeToast(`${monster.name} adicionado à cena.`);
}

document.addEventListener("click", event => {
  const action = event.target.closest("[data-token-action]");
  if (!action) return;
  event.stopPropagation();
  const card = action.closest(".token-card"); const name = card.querySelector(".token-summary b").textContent;
  if (action.dataset.tokenAction === "initiative") rollFormula("1d20+2", `INICIATIVA · ${name.toUpperCase()}`);
  if (action.dataset.tokenAction === "attack") rollFormula("1d20+4", `ATAQUE · ${name.toUpperCase()}`);
  if (action.dataset.tokenAction === "damage") rollFormula("1d8+2", `DANO · ${name.toUpperCase()}`);
  if (action.dataset.tokenAction === "heal") rollFormula("1d8+3", `CURA · ${name.toUpperCase()}`);
  if (action.dataset.tokenAction === "reveal") action.textContent = action.textContent === "Revelar" ? "Ocultar" : "Revelar";
});

function applyMode(mode) {
  if (mode === "master" && window.ApexStaticAuth?.getUser?.()?.role !== "master") {
    mode = "player";
    showPrototypeToast("Apenas contas de Mestre podem usar o modo Mestre.");
  }
  sessionState.mode = mode;
  document.body.dataset.sessionMode = mode;
  document.body.dataset.canSeeMonsterHp = sessionState.permissions.monsterHp;
  document.body.dataset.canSeeMonsterNames = sessionState.permissions.monsterNames;
  document.querySelectorAll("[data-session-mode]").forEach(button => button.classList.toggle("active", button.dataset.sessionMode === mode));
  if (mode === "focus") document.querySelectorAll(".table-drawer").forEach(drawer => drawer.classList.add("collapsed"));
  persist();
}
document.querySelectorAll("[data-session-mode]").forEach(button => button.addEventListener("click", () => applyMode(button.dataset.sessionMode)));

function renderMaps() {
  const list = document.querySelector("#map-library-list"); list.innerHTML = "";
  sessionState.maps.forEach(map => {
    const item = document.createElement("article"); item.className = map.id === sessionState.activeMap ? "active" : "";
    item.innerHTML = `<div style="background-image:url('${map.src}')"></div><span><input value="${map.name}" aria-label="Nome do mapa"><small>${map.id === sessionState.activeMap ? "MAPA ATIVO" : "PRONTO"}</small></span><button data-map-active="${map.id}">Ativar</button><button data-map-remove="${map.id}">×</button>`;
    item.querySelector("input").addEventListener("change", event => { map.name = event.target.value; persist(); renderMaps(); });
    list.append(item);
  });
  const active = sessionState.maps.find(map => map.id === sessionState.activeMap) || sessionState.maps[0];
  if (active) document.querySelector(".map-image").style.backgroundImage = `url("${active.src}")`;
}
document.querySelector("#map-library-list")?.addEventListener("click", event => {
  const active = event.target.closest("[data-map-active]"); const remove = event.target.closest("[data-map-remove]");
  if (active) { sessionState.activeMap = active.dataset.mapActive; persist(); renderMaps(); }
  if (remove && sessionState.maps.length > 1) { sessionState.maps = sessionState.maps.filter(map => map.id !== remove.dataset.mapRemove); if (!sessionState.maps.some(map => map.id === sessionState.activeMap)) sessionState.activeMap = sessionState.maps[0].id; persist(); renderMaps(); }
});
document.querySelector("#map-upload-input")?.addEventListener("change", event => {
  const file = event.target.files[0]; if (!file || !["image/jpeg","image/png","image/webp"].includes(file.type)) return showPrototypeToast("Use JPG, PNG ou WEBP.");
  const reader = new FileReader(); reader.addEventListener("load", () => { const id = `map-${Date.now()}`; sessionState.maps.push({ id, name:file.name.replace(/\.[^.]+$/, ""), src:reader.result }); sessionState.activeMap = id; persist(); renderMaps(); }); reader.readAsDataURL(file);
});
document.querySelector("#map-scale")?.addEventListener("input", event => { sessionState.mapState.scale = Math.max(.1, Number(event.target.value) || 1.5); persist(); });
document.querySelector("#map-lock")?.addEventListener("change", event => { sessionState.mapState.lockedForPlayers = event.target.checked; persist(); });
document.querySelector("#map-grid-toggle")?.addEventListener("change", event => { sessionState.mapState.gridVisible = event.target.checked; gridLayer.classList.toggle("hidden", !event.target.checked); persist(); });
document.querySelector("#toggle-map-lock")?.addEventListener("click", () => { sessionState.mapState.lockedForPlayers = !sessionState.mapState.lockedForPlayers; document.querySelector("#map-lock").checked = sessionState.mapState.lockedForPlayers; showPrototypeToast(sessionState.mapState.lockedForPlayers ? "Mapa travado para jogadores." : "Mapa liberado para jogadores."); persist(); });

const monsterLibrary = JSON.parse(localStorage.getItem("apex-realms-monster-library") || "null") || [
  { id:"goblin", name:"Goblin", type:"Humanoide", ac:15, hp:7, speed:"9m", attacks:"Cimitarra +4 · 1d6+2" },
  { id:"orc", name:"Orc", type:"Humanoide", ac:13, hp:15, speed:"9m", attacks:"Machado grande +5 · 1d12+3" },
  { id:"lobo", name:"Lobo", type:"Fera", ac:13, hp:11, speed:"12m", attacks:"Mordida +4 · 2d4+2" },
  { id:"esqueleto", name:"Esqueleto", type:"Morto-vivo", ac:13, hp:13, speed:"9m", attacks:"Espada curta +4 · 1d6+2" },
  { id:"cultista", name:"Cultista", type:"Humanoide", ac:12, hp:9, speed:"9m", attacks:"Cimitarra +3 · 1d6+1" }
];
function renderTableMonsters() {
  const query = document.querySelector("#table-monster-search")?.value.toLowerCase() || ""; const list = document.querySelector("#table-monster-list"); if (!list) return; list.innerHTML = "";
  monsterLibrary.filter(monster => monster.name.toLowerCase().includes(query)).forEach(monster => {
    const button = document.createElement("button"); button.innerHTML = `<i class="monster-orb"></i><span><b>${monster.name}</b><small>${monster.type} · PV ${monster.hp} · CA ${monster.ac}</small></span><em>Adicionar</em>`;
    if (monster.image) button.querySelector(".monster-orb").style.backgroundImage = `url("${monster.image}")`;
    button.addEventListener("click", () => { pendingMonster = monster; document.querySelector("#monsters-drawer").classList.add("collapsed"); showPrototypeToast(`Clique no mapa para posicionar ${monster.name}.`); });
    list.append(button);
  });
}
document.querySelector("#table-monster-search")?.addEventListener("input", renderTableMonsters);
document.querySelector("#next")?.addEventListener("click", () => {
  const turns = [...document.querySelectorAll(".initiative-row")]; const current = turns.findIndex(turn => turn.classList.contains("active")); turns[current].classList.remove("active"); turns[current].querySelector("em")?.remove(); const next = turns[(current + 1) % turns.length]; next.classList.add("active"); const label = document.createElement("em"); label.textContent = "ATUAL"; next.append(label); if (current === turns.length - 1) document.querySelector("#round-number").textContent = Number(document.querySelector("#round-number").textContent) + 1;
});

sessionState.tokens.forEach(token => { const element = document.querySelector(`#${CSS.escape(token.id)}`); if (element) { element.style.left = `${token.x}%`; element.style.top = `${token.y}%`; } });
document.querySelector("#snap")?.classList.toggle("active", sessionState.mapState.snapToGrid);
gridLayer.classList.toggle("hidden", !sessionState.mapState.gridVisible);
document.querySelector("#map-grid-toggle").checked = sessionState.mapState.gridVisible;
document.querySelector("#map-lock").checked = sessionState.mapState.lockedForPlayers;
document.querySelector("#map-scale").value = sessionState.mapState.scale;
applyBoardTransform(); applyMode(sessionState.mode || "master"); renderMaps(); renderTableMonsters();
