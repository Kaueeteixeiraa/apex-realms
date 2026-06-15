// Lightweight client-side simulation for the static GitHub Pages demo.
const stage = document.querySelector("#stage");
const board = document.querySelector("#board");
const gridLayer = document.querySelector("#grid-layer");
const fogLayer = document.querySelector("#fog-layer");
const effects = document.querySelector("#effects");
const messages = document.querySelector("#messages");
let zoom = 1;
let tool = "select";
let snap = true;
let measureStart = null;

function addMessage(author, text, type = "chat") {
  const wrapper = document.createElement("div");
  if (type === "roll") {
    wrapper.className = "roll-message";
    const label = document.createElement("span");
    const content = document.createElement("div");
    const formula = document.createElement("b");
    const total = document.createElement("strong");
    label.textContent = `ROLAGEM DE ${author.toUpperCase()}`;
    const parts = text.split("=");
    formula.textContent = parts[0];
    total.textContent = parts[1];
    content.append(formula, total);
    wrapper.append(label, content);
  } else {
    wrapper.className = "chat-message";
    const avatar = document.createElement("i");
    const body = document.createElement("div");
    const meta = document.createElement("span");
    const name = document.createElement("b");
    const time = document.createElement("small");
    const message = document.createElement("p");
    avatar.textContent = author[0];
    name.textContent = author;
    time.textContent = "agora";
    message.textContent = text;
    meta.append(name, time);
    body.append(meta, message);
    wrapper.append(avatar, body);
  }
  messages.append(wrapper);
  messages.scrollTop = messages.scrollHeight;
}

const diceTray = document.querySelector(".dice");
[4, 6, 8, 10, 12, 20, 100].forEach(sides => {
  const button = document.createElement("button");
  button.textContent = `d${sides}`;
  button.addEventListener("click", () => addMessage("Kael", `1d${sides} = ${Math.ceil(Math.random() * sides)}`, "roll"));
  diceTray.append(button);
});

document.querySelector("#chat-form").addEventListener("submit", event => {
  event.preventDefault();
  const input = document.querySelector("#chat-input");
  const value = input.value.trim();
  if (!value) return;
  const formula = value.match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (formula) {
    let total = Number(formula[3] || 0);
    for (let roll = 0; roll < Number(formula[1]); roll += 1) total += Math.ceil(Math.random() * Number(formula[2]));
    addMessage("Kael", `${value} = ${total}`, "roll");
  } else {
    addMessage("Você", value);
  }
  input.value = "";
});

document.querySelectorAll("[data-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-tab],.session-pane").forEach(element => element.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#${button.dataset.tab}`).classList.add("active");
}));

document.querySelector("#grid").addEventListener("click", event => {
  event.currentTarget.classList.toggle("active");
  gridLayer.classList.toggle("hidden");
});
document.querySelector("#fog").addEventListener("click", event => {
  event.currentTarget.classList.toggle("active");
  fogLayer.classList.toggle("hidden");
});
document.querySelector("#snap").addEventListener("click", event => {
  snap = !snap;
  event.currentTarget.classList.toggle("active", snap);
});
document.querySelector("#combat").addEventListener("click", event => {
  event.currentTarget.classList.toggle("active");
  const active = event.currentTarget.classList.contains("active");
  event.currentTarget.querySelector("span").textContent = active ? "Encerrar combate" : "Iniciar combate";
  const indicator = document.querySelector("#combat-indicator");
  indicator.classList.toggle("active", active);
  indicator.querySelector("b").textContent = active ? "Rodada 1" : "Inativo";
  addMessage("Apex Realms", active ? "Combate iniciado. Rolem iniciativa." : "Combate encerrado.");
});

function applyZoom() {
  board.style.transform = `scale(${zoom})`;
  document.querySelector("#zoom").textContent = `${Math.round(zoom * 100)}%`;
}
document.querySelector("#plus").addEventListener("click", () => { zoom = Math.min(1.8, zoom + .1); applyZoom(); });
document.querySelector("#minus").addEventListener("click", () => { zoom = Math.max(.5, zoom - .1); applyZoom(); });
document.querySelector("#center").addEventListener("click", () => { zoom = 1; applyZoom(); });
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

const characterData = {
  kael:{name:"Kael Ardent",className:"Patrulheiro · Nível 5",hp:"32 / 38",token:"#54d8ff"},
  lyra:{name:"Lyra Voss",className:"Arcanista · Nível 4",hp:"21 / 30",token:"#a98cff"},
  sentinela:{name:"Sentinela Vazia",className:"Constructo · Elite",hp:"48 / 86",token:"#ff657f"}
};
function focusToken(id) {
  document.querySelectorAll(".map-token,.character-card").forEach(item => item.classList.remove("selected","active"));
  const token = document.querySelector(`#${id}`);
  token.classList.add("selected");
  document.querySelector(`[data-focus="${id}"]`)?.classList.add("active");
  const data = characterData[id];
  document.querySelector("#inspect-avatar").textContent = data.name[0];
  document.querySelector("#inspect-avatar").style.setProperty("--token",data.token);
  document.querySelector("#inspect-name").textContent = data.name;
  document.querySelector("#inspect-class").textContent = data.className;
  document.querySelector("#inspect-hp").textContent = data.hp;
}
document.querySelectorAll("[data-focus]").forEach(button => button.addEventListener("click", () => focusToken(button.dataset.focus)));

document.querySelectorAll(".map-token").forEach(token => {
  token.addEventListener("click", event => { event.stopPropagation(); focusToken(token.id); });
  token.addEventListener("pointerdown", event => {
    if (tool !== "select") return;
    token.setPointerCapture(event.pointerId);
    const move = moveEvent => {
      const rect = stage.getBoundingClientRect();
      let x = (moveEvent.clientX - rect.left) / zoom;
      let y = (moveEvent.clientY - rect.top) / zoom;
      if (snap) { x = Math.round(x / 52) * 52; y = Math.round(y / 52) * 52; }
      token.style.left = `${Math.max(2, Math.min(98, x / rect.width * 100))}%`;
      token.style.top = `${Math.max(2, Math.min(98, y / rect.height * 100))}%`;
    };
    token.addEventListener("pointermove", move);
    token.addEventListener("pointerup", () => token.removeEventListener("pointermove", move), {once:true});
  });
});

stage.addEventListener("click", event => {
  if (event.target.closest(".map-token,.floating-tools,.zoom-controls")) return;
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
    line.dataset.distance = `${Math.round(Math.hypot(dx,dy) / 52)} quadrados`;
    effects.append(line);
    measureStart = null;
  }
});

document.querySelector("#next").addEventListener("click", () => {
  const turns = [...document.querySelectorAll(".turn")];
  const current = turns.findIndex(turn => turn.classList.contains("active"));
  turns[current].classList.remove("active");
  turns[current].querySelector("em")?.remove();
  const next = turns[(current + 1) % turns.length];
  next.classList.add("active");
  const label = document.createElement("em");
  label.textContent = "ATUAL";
  next.append(label);
  if (current === turns.length - 1) {
    const round = document.querySelector("#round");
    round.textContent = `RODADA ${Number(round.textContent.split(" ")[1]) + 1}`;
  }
});
