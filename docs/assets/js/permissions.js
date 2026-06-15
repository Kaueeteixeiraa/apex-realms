// Room permission switches persist locally to make the prototype feel stateful.
const permissionKey = "apex-realms-room-permissions";
const storedPermissions = { ...(window.sessionState?.permissions || {}), ...JSON.parse(localStorage.getItem(permissionKey) || "{}") };

document.querySelectorAll("[data-permission]").forEach(input => {
  if (Object.hasOwn(storedPermissions, input.dataset.permission)) input.checked = storedPermissions[input.dataset.permission];
  input.addEventListener("change", () => {
    storedPermissions[input.dataset.permission] = input.checked;
    localStorage.setItem(permissionKey, JSON.stringify(storedPermissions));
    if (window.sessionState) {
      window.sessionState.permissions = { ...window.sessionState.permissions, ...storedPermissions };
      window.saveSessionState();
    }
  });
});
