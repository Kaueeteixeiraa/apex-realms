// Basic D&D 5e calculations and rolls used by the static character sheet.
const abilityModifier = score => Math.floor((Number(score) - 10) / 2);
const proficiencyBonus = level => Math.ceil(Number(level) / 4) + 1;
let rollMode = "normal";

const formatModifier = value => `${value >= 0 ? "+" : ""}${value}`;
const randomDie = sides => Math.floor(Math.random() * sides) + 1;

function rollD20(modifier = 0) {
  const rolls = rollMode === "normal" ? [randomDie(20)] : [randomDie(20), randomDie(20)];
  const die = rollMode === "advantage" ? Math.max(...rolls) : rollMode === "disadvantage" ? Math.min(...rolls) : rolls[0];
  return {total: die + Number(modifier), die, rolls, modifier:Number(modifier)};
}

function parseFormula(formula) {
  const match = String(formula).replace(/\s/g, "").match(/^(\d+)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;
  const dice = Array.from({length:Number(match[1])}, () => randomDie(Number(match[2])));
  const modifier = Number(match[3] || 0);
  return {dice, modifier, total:dice.reduce((sum, die) => sum + die, 0) + modifier};
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

document.querySelectorAll(".ability-card").forEach(card => {
  const modifier = abilityModifier(card.dataset.score);
  card.querySelector("strong").textContent = formatModifier(modifier);
  card.addEventListener("click", () => {
    const result = rollD20(modifier);
    presentRoll(card.querySelector("small").textContent, result.total, `${result.rolls.join(" / ")} ${formatModifier(modifier)}`);
  });
});

document.querySelector("#proficiency-value")?.replaceChildren(document.createTextNode(formatModifier(proficiencyBonus(5))));

document.querySelectorAll("[data-roll-mode]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-roll-mode]").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  rollMode = button.dataset.rollMode;
}));

document.querySelectorAll("[data-skill],[data-save-roll]").forEach(button => button.addEventListener("click", () => {
  const modifier = Number(button.dataset.mod);
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
  const result = rollD20(4);
  presentRoll("Iniciativa de Kael", result.total, `${result.die} +4`);
}));
