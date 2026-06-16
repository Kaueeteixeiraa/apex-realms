// Central session state. Replace localStorage persistence with Realtime events later.
const defaultSessionState = {
  mode: "master",
  mapState: { panX: 0, panY: 0, zoom: 1, snapToGrid: false, gridVisible: true, lockedForPlayers: true, scale: 1.5 },
  activeMap: null,
  maps: [],
  tokens: [],
  players: [],
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

let savedSessionState = null;
try {
  savedSessionState = JSON.parse(localStorage.getItem("apex-realms-session-state") || "null");
} catch {
  localStorage.removeItem("apex-realms-session-state");
}
window.sessionState = Object.assign(structuredClone(defaultSessionState), savedSessionState || {});

const activeAccount = window.ApexStaticAuth?.getUser?.();
if (activeAccount?.role !== "master") {
  window.sessionState.mode = "player";
}

window.saveSessionState = function saveSessionState() {
  localStorage.setItem("apex-realms-session-state", JSON.stringify(window.sessionState));
  window.dispatchEvent(new CustomEvent("apex:state", { detail: window.sessionState }));
};

window.updateSessionState = function updateSessionState(key, value) {
  window.sessionState[key] = value;
  window.saveSessionState();
};
