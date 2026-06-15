// Editable and collapsible sections for the standalone character sheet.
const editablePanels = [...document.querySelectorAll(".sheet-panel,.full-sheet-panel")];
const collapsedKey = "apex-realms-collapsed-sheet-sections";
const collapsedSections = new Set(JSON.parse(localStorage.getItem(collapsedKey) || "[]"));

editablePanels.forEach((panel, index) => {
  const title = panel.querySelector("h2,h3")?.textContent.trim() || `Seção ${index + 1}`;
  panel.dataset.sectionName = title;
  if (collapsedSections.has(title)) panel.classList.add("section-collapsed");
  const button = document.createElement("button");
  button.type = "button";
  button.className = "section-collapse";
  button.textContent = panel.classList.contains("section-collapsed") ? "Expandir" : "Recolher";
  button.addEventListener("click", event => {
    event.stopPropagation();
    panel.classList.toggle("section-collapsed");
    button.textContent = panel.classList.contains("section-collapsed") ? "Expandir" : "Recolher";
    const collapsed = editablePanels.filter(item => item.classList.contains("section-collapsed")).map(item => item.dataset.sectionName);
    localStorage.setItem(collapsedKey, JSON.stringify(collapsed));
  });
  panel.append(button);
});

document.querySelector("#organize-sections")?.addEventListener("click", event => {
  document.querySelector(".sheet-page").classList.toggle("organizing-sections");
  event.currentTarget.classList.toggle("active");
  event.currentTarget.textContent = event.currentTarget.classList.contains("active") ? "Concluir organização" : "Organizar seções";
  if (typeof showPrototypeToast === "function") showPrototypeToast(event.currentTarget.classList.contains("active") ? "Modo de organização ativo. Seções recolhíveis foram destacadas." : "Ordem e estado das seções salvos.");
});
