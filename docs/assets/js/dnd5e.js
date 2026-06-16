const abilityModifier = score => Math.floor((Number(score) - 10) / 2);
const proficiencyBonus = level => Math.ceil(Number(level) / 4) + 1;
const formatModifier = value => `${value >= 0 ? "+" : ""}${value}`;
const randomDie = sides => Math.floor(Math.random() * sides) + 1;
const sheetKey = "apex-realms-dnd5e-current";
let rollMode = "normal";

function rollD20(modifier = 0) {
  const rolls = rollMode === "normal" ? [randomDie(20)] : [randomDie(20), randomDie(20)];
  const die = rollMode === "advantage" ? Math.max(...rolls) : rollMode === "disadvantage" ? Math.min(...rolls) : rolls[0];
  return { total: die + Number(modifier), die, rolls, modifier: Number(modifier) };
}

function parseFormula(formula) {
  const match = String(formula).replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const dice = Array.from({ length: Number(match[1]) }, () => randomDie(Number(match[2])));
  const modifier = Number(match[3] || 0);
  return { dice, modifier, total: dice.reduce((sum, die) => sum + die, 0) + modifier };
}

function presentRoll(label, total, detail) {
  const toast = document.querySelector("#roll-toast");
  if (!toast) return;
  toast.querySelector("b").textContent = label;
  toast.querySelector("strong").textContent = total;
  toast.querySelector("span").textContent = detail;
  toast.classList.add("show");
  clearTimeout(presentRoll.timer);
  presentRoll.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function getSheetData() {
  const data = {};
  document.querySelectorAll("[id^='field-'],#current-hp,#temp-hp,[data-ability-input]").forEach(input => {
    const key = input.dataset.abilityInput ? `ability-${input.dataset.abilityInput}` : input.id;
    data[key] = input.type === "checkbox" ? input.checked : input.value;
  });
  return data;
}

function renderSheetCalculations() {
  const level = Number(document.querySelector("#field-level")?.value || 5);
  const proficiency = proficiencyBonus(level);
  const dexterity = Number(document.querySelector("[data-ability-input='dex']")?.value || 18);
  const currentHp = Number(document.querySelector("#current-hp")?.value || 0);
  const maxHp = Math.max(1, Number(document.querySelector("#field-max-hp")?.value || 38));
  document.querySelector("#proficiency-value")?.replaceChildren(document.createTextNode(formatModifier(proficiency)));
  document.querySelector("#initiative-value")?.replaceChildren(document.createTextNode(formatModifier(abilityModifier(dexterity))));
  document.querySelector("#level-label")?.replaceChildren(document.createTextNode(`Nível ${level}`));
  document.querySelector("#max-hp-label")?.replaceChildren(document.createTextNode(maxHp));
  document.querySelector("#armor-class-label")?.replaceChildren(document.createTextNode(document.querySelector("#field-ac")?.value || 17));
  const progress = document.querySelector("#hp-progress");
  if (progress) progress.style.width = `${Math.min(100, Math.max(0, currentHp / maxHp * 100))}%`;
  const name = document.querySelector("#field-name")?.value || "Novo personagem";
  const race = document.querySelector("#field-race")?.value || "Humano";
  const characterClass = document.querySelector("#field-class")?.value || "Patrulheiro";
  const background = document.querySelector("#field-background")?.value || "Forasteiro";
  const alignment = document.querySelector("#field-alignment")?.value || "Neutro e Bom";
  document.querySelector("#character-title")?.replaceChildren(document.createTextNode(name));
  document.querySelector("#character-subtitle")?.replaceChildren(document.createTextNode(`${race} · ${characterClass} ${level} · ${background} · ${alignment}`));
  document.querySelector("#language-summary")?.replaceChildren(document.createTextNode(document.querySelector("#field-languages")?.value || "Comum"));
  document.querySelectorAll(".ability-card").forEach(card => {
    const input = document.querySelector(`[data-ability-input="${card.dataset.ability}"]`);
    const score = Number(input?.value || card.dataset.score);
    card.dataset.score = score;
    card.querySelector("b").textContent = score;
    card.querySelector("strong").textContent = formatModifier(abilityModifier(score));
  });
  document.querySelectorAll("[data-save-ability]").forEach(button => {
    const score = Number(document.querySelector(`[data-ability-input="${button.dataset.saveAbility}"]`)?.value || 10);
    const modifier = abilityModifier(score) + proficiency;
    button.dataset.mod = modifier;
    button.querySelector("b").textContent = formatModifier(modifier);
  });
}

document.querySelectorAll(".ability-card").forEach(card => card.addEventListener("click", () => {
  const result = rollD20(abilityModifier(card.dataset.score));
  presentRoll(card.querySelector("small").textContent, result.total, `${result.rolls.join(" / ")} ${formatModifier(abilityModifier(card.dataset.score))}`);
}));

document.querySelectorAll("[data-roll-mode]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-roll-mode]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  rollMode = button.dataset.rollMode;
}));

document.querySelectorAll("[data-skill],[data-save-roll]").forEach(button => button.addEventListener("click", () => {
  const modifier = Number(button.dataset.mod || 0);
  const result = rollD20(modifier);
  presentRoll(button.dataset.skill || `Salvaguarda de ${button.dataset.saveRoll}`, result.total, `${result.rolls.join(" / ")} ${formatModifier(modifier)}`);
}));

document.querySelectorAll("[data-attack]").forEach(button => button.addEventListener("click", () => {
  const attack = rollD20(Number(button.dataset.bonus));
  const damage = parseFormula(button.dataset.damage);
  presentRoll(button.dataset.attack, attack.total, `Ataque ${attack.die} ${formatModifier(button.dataset.bonus)} · Dano ${damage.total}`);
}));

document.querySelectorAll("[data-custom-roll]").forEach(button => button.addEventListener("click", () => {
  const result = parseFormula(button.dataset.customRoll);
  presentRoll(button.textContent.trim(), result.total, `${button.dataset.customRoll} · [${result.dice.join(", ")}]`);
}));

document.querySelectorAll("[data-roll='initiative']").forEach(button => button.addEventListener("click", () => {
  const modifier = abilityModifier(document.querySelector("[data-ability-input='dex']")?.value || 18);
  const result = rollD20(modifier);
  presentRoll("Iniciativa", result.total, `${result.die} ${formatModifier(modifier)}`);
}));

const savedSheet = JSON.parse(localStorage.getItem(sheetKey) || "{}");
document.querySelectorAll("[id^='field-'],#current-hp,#temp-hp,[data-ability-input]").forEach(input => {
  const key = input.dataset.abilityInput ? `ability-${input.dataset.abilityInput}` : input.id;
  if (Object.hasOwn(savedSheet, key)) input.type === "checkbox" ? input.checked = savedSheet[key] : input.value = savedSheet[key];
  input.addEventListener("input", () => {
    renderSheetCalculations();
    localStorage.setItem(sheetKey, JSON.stringify(getSheetData()));
  });
});

renderSheetCalculations();

if (document.body.classList.contains("detailed-sheet-page") && window.sessionState?.mode !== "master" && window.sessionState?.permissions.editSheet === false) {
  document.querySelectorAll("[id^='field-'],#current-hp,#temp-hp,[data-ability-input]").forEach(input => { input.disabled = true; });
  document.querySelectorAll(".detailed-sheet-page [data-attack],.detailed-sheet-page [data-custom-roll],.detailed-sheet-page [data-save-roll],.detailed-sheet-page [data-skill]").forEach(button => { button.disabled = true; });
  showPrototypeToast("A edição desta ficha foi bloqueada pelo Mestre.");
}
