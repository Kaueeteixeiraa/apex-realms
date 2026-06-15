// Interactive map simulation for GitHub Pages.
const stage = document.querySelector("#stage");
const board = document.querySelector("#board");
const gridLayer = document.querySelector("#grid-layer");
const fogLayer = document.querySelector("#fog-layer");
const effects = document.querySelector("#effects");
const messages = document.querySelector("#messages");
const rollFeed = document.querySelector("#roll-feed");
let zoom = 1;
let tool = "select";
let snap = true;
let measureStart = null;

function addChat(author, text) {
  const wrapper = document.createElement("div");
  wrapper.className = "chat-message";
  wrapper.innerHTML = `<i class="portrait kael"></i><div><span><b>${author}</b><small>agora</small></span><p></p></div>`;
  wrapper.querySelector("p").textContent = text;
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

function addRoll(label, formula, total, result = "Resultado registrado") {
  const wrapper = document.createElement("div");
  wrapper.className = "roll-message";
  wrapper.innerHTML = `<span><small></small><b></b></span><strong></strong><em></em>`;
  wrapper.querySelector("small").textContent = label;
  wrapper.querySelector("b").textContent = formula;
  wrapper.querySelector("strong").textContent = total;
  wrapper.querySelector("em").textContent = result;
  rollFeed.prepend(wrapper);
}

const parseRoll = formula => {
  const match = formula.replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const rolls = Array.from({length:Number(match[1])}, () => Math.ceil(Math.random() * Number(match[2])));
  return rolls.reduce((sum, roll) => sum + roll, 0) + Number(match[3] || 0);
};

document.querySelector("#chat-form")?.addEventListener("submit", event => {
  event.preventDefault();
  const input = document.querySelector("#chat-input");
  const value = input.value.trim();
  if (!value) return;
  const total = parseRoll(value);
  if (total !== null) {
    addRoll("ROLAGEM PERSONALIZADA · KAEL", value, total);
    document.querySelector('[data-tab="rolls"]').click();
  } else addChat("Você · Kael", value);
  input.value = "";
});

const diceTray = document.querySelector(".dice");
[20, 12, 10, 8, 6, 4].forEach(sides => {
  const button = document.createElement("button");
  button.textContent = `d${sides}`;
  button.addEventListener("click", () => addRoll(`D${sides} · KAEL`, `1d${sides}`, Math.ceil(Math.random() * sides)));
  diceTray?.append(button);
});

document.querySelector("#custom-roll")?.addEventListener("submit", event => {
  event.preventDefault();
  const input = event.currentTarget.querySelector("input");
  const total = parseRoll(input.value);
  if (total === null) return;
  addRoll("ROLAGEM PERSONALIZADA · KAEL", input.value, total);
  input.value = "";
});

document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tab],.right-pane").forEach(element => element.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#${button.dataset.tab}`)?.classList.add("active");
}));

document.querySelectorAll("[data-drawer]").forEach(button => button.addEventListener("click", event => {
  if (event.target.closest("a")) return;
  const target = document.querySelector(`#${button.dataset.drawer}`);
  const willOpen = target?.classList.contains("collapsed");
  document.querySelectorAll(".table-drawer").forEach(drawer => drawer.classList.add("collapsed"));
  if (willOpen) target.classList.remove("collapsed");
}));

document.querySelectorAll("[data-close-drawer]").forEach(button => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.closeDrawer}`)?.classList.add("collapsed");
}));

document.querySelector("#grid")?.addEventListener("click", event => {
  event.currentTarget.classList.toggle("active");
  gridLayer.classList.toggle("hidden");
});
document.querySelector("#fog")?.addEventListener("click", event => {
  event.currentTarget.classList.toggle("active");
  fogLayer.classList.toggle("hidden");
});
document.querySelector("#snap")?.addEventListener("click", event => {
  snap = !snap;
  event.currentTarget.classList.toggle("active", snap);
});
document.querySelector(".scene-alert button")?.addEventListener("click", event => event.currentTarget.closest(".scene-alert").remove());

function applyZoom() {
  board.style.transform = `scale(${zoom})`;
  document.querySelector("#zoom").textContent = `${Math.round(zoom * 100)}%`;
}
document.querySelector("#plus")?.addEventListener("click", () => { zoom = Math.min(1.8, zoom + .1); applyZoom(); });
document.querySelector("#minus")?.addEventListener("click", () => { zoom = Math.max(.5, zoom - .1); applyZoom(); });
document.querySelector("#center")?.addEventListener("click", () => { zoom = 1; applyZoom(); });
stage.addEventListener("wheel", event => {
  event.preventDefault();
  zoom = Math.max(.5, Math.min(1.8, zoom + (event.deltaY < 0 ? .1 : -.1)));
  applyZoom();
}, {passive:false});

document.querySelectorAll("[data-tool]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tool]").forEach(item => item.classList.remove("active"));
  document.querySelectorAll(`[data-tool="${button.dataset.tool}"]`).forEach(item => item.classList.add("active"));
  tool = button.dataset.tool;
}));

document.querySelectorAll("[data-focus]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".party-card,.token-card").forEach(item => item.classList.remove("active","selected","expanded"));
  button.classList.add("active");
  document.querySelector(`#${button.dataset.focus}`)?.classList.add("selected","expanded");
}));

document.querySelectorAll(".token-card").forEach(token => {
  token.addEventListener("click", event => {
    if (event.target.closest("[data-token-action]")) return;
    event.stopPropagation();
    token.classList.toggle("expanded");
  });
  token.addEventListener("pointerdown", event => {
    if (tool !== "select" || token.classList.contains("expanded") || event.target.closest("[data-token-action]")) return;
    token.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const rect = stage.getBoundingClientRect();
      let x = (moveEvent.clientX - rect.left) / zoom;
      let y = (moveEvent.clientY - rect.top) / zoom;
      if (snap) { x = Math.round(x / 52) * 52; y = Math.round(y / 52) * 52; }
      token.style.left = `${Math.max(3, Math.min(97, x / rect.width * 100))}%`;
      token.style.top = `${Math.max(3, Math.min(97, y / rect.height * 100))}%`;
    };
    token.addEventListener("pointermove", move);
    token.addEventListener("pointerup", () => token.removeEventListener("pointermove", move), {once:true});
  });
});

document.querySelectorAll("[data-token-action]").forEach(button => button.addEventListener("click", event => {
  event.stopPropagation();
  const action = button.dataset.tokenAction;
  const card = button.closest(".token-card");
  const name = card.querySelector(".token-summary b").textContent;
  if (action === "initiative") addRoll(`INICIATIVA · ${name.toUpperCase()}`, "1d20 + 4", Math.ceil(Math.random() * 20) + 4);
  if (action === "attack") addRoll(`ATAQUE · ${name.toUpperCase()}`, "1d20 + 7", Math.ceil(Math.random() * 20) + 7, "Ataque registrado");
  if (action === "damage") addRoll(`DANO APLICADO · ${name.toUpperCase()}`, "1d8 + 4", Math.ceil(Math.random() * 8) + 4, "Pontos de vida alterados");
  if (action === "heal") addRoll(`CURA · ${name.toUpperCase()}`, "1d8 + 3", Math.ceil(Math.random() * 8) + 3, "Pontos de vida recuperados");
  if (action === "reveal") button.textContent = button.textContent === "Revelar" ? "Ocultar" : "Revelar";
  document.querySelector('[data-tab="rolls"]').click();
}));

stage.addEventListener("click", event => {
  if (event.target.closest(".token-card,.floating-tools,.master-toolbar,.zoom-controls")) return;
  document.querySelectorAll(".token-card").forEach(card => card.classList.remove("expanded"));
  const rect = stage.getBoundingClientRect();
  const x = (event.clientX - rect.left) / zoom;
  const y = (event.clientY - rect.top) / zoom;
  if (tool === "ping") {
    const ping = document.createElement("i");
    ping.className = "demo-ping";
    ping.style.cssText = `left:${x}px;top:${y}px`;
    effects.append(ping);
    setTimeout(() => ping.remove(), 1600);
  }
  if (tool === "measure") {
    if (!measureStart) { measureStart = {x,y}; return; }
    const dx = x - measureStart.x;
    const dy = y - measureStart.y;
    const line = document.createElement("i");
    line.className = "measure-line";
    line.style.cssText = `left:${measureStart.x}px;top:${measureStart.y}px;width:${Math.hypot(dx,dy)}px;transform:rotate(${Math.atan2(dy,dx)}rad)`;
    line.dataset.distance = `${Math.round(Math.hypot(dx,dy) / 52) * 1.5} metros`;
    effects.append(line);
    measureStart = null;
  }
});

document.querySelector("#next")?.addEventListener("click", () => {
  const turns = [...document.querySelectorAll(".initiative-row")];
  const current = turns.findIndex(turn => turn.classList.contains("active"));
  turns[current].classList.remove("active");
  turns[current].querySelector("em")?.remove();
  const next = turns[(current + 1) % turns.length];
  next.classList.add("active");
  const label = document.createElement("em");
  label.textContent = "ATUAL";
  next.append(label);
  const turnFloat = document.querySelector(".turn-float");
  if (turnFloat) {
    turnFloat.querySelector("i").className = next.querySelector("i").className;
    turnFloat.querySelector("b").textContent = next.querySelector("b").textContent;
    turnFloat.querySelector("em").textContent = next.querySelector("small").textContent;
  }
  if (current === turns.length - 1) document.querySelector("#round-number").textContent = Number(document.querySelector("#round-number").textContent) + 1;
});
