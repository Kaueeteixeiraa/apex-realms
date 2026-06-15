// Central session state. Replace localStorage persistence with Realtime events later.
const defaultSessionState = {
  mode: "master",
  mapState: { panX: 0, panY: 0, zoom: 1, snapToGrid: false, gridVisible: true, lockedForPlayers: true, scale: 1.5 },
  activeMap: "ruinas",
  maps: [
    { id: "ruinas", name: "Ruínas do Portal Astral", src: "assets/ruins-map.jpg", active: true },
    { id: "camara", name: "Câmara sob o Portal", src: "assets/ruins-map.jpg", active: false }
  ],
  tokens: [
    { id: "kael", name: "Kael Ardent", kind: "player", x: 37, y: 68, hp: 32, maxHp: 38, ac: 17, initiative: 19, speed: "9m", owner: true },
    { id: "lyra", name: "Lyra Voss", kind: "player", x: 50, y: 69, hp: 21, maxHp: 30, ac: 14, initiative: 11, speed: "9m" },
    { id: "sentinela", name: "Sentinela Vazia", kind: "monster", x: 64, y: 39, hp: 48, maxHp: 86, ac: 18, initiative: 14, speed: "7,5m" }
  ],
  players: [{ id: "kael", name: "Kael Ardent" }, { id: "lyra", name: "Lyra Voss" }],
  monsters: [],
  chatMessages: [],
  diceRolls: [],
  measurements: [],
  permissions: {
    moveTokens: true,
    ruler: true,
    editSheet: true,
    monsterHp: false,
    monsterNames: true,
    chat: true,
    dice: true,
    fullMap: false,
    otherSheets: false
  }
};

const savedSessionState = JSON.parse(localStorage.getItem("apex-realms-session-state") || "null");
window.sessionState = Object.assign(structuredClone(defaultSessionState), savedSessionState || {});

window.saveSessionState = function saveSessionState() {
  localStorage.setItem("apex-realms-session-state", JSON.stringify(window.sessionState));
  window.dispatchEvent(new CustomEvent("apex:state", { detail: window.sessionState }));
};

window.updateSessionState = function updateSessionState(key, value) {
  window.sessionState[key] = value;
  window.saveSessionState();
};
