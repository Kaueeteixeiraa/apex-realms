// Multi-step campaign creation prototype.
const steps = [...document.querySelectorAll("[data-create-step]")];
const panels = [...document.querySelectorAll("[data-create-panel]")];
const nextButton = document.querySelector("#wizard-next");
const backButton = document.querySelector("#wizard-back");
const progress = document.querySelector(".wizard-actions span i");
const titles = {
  identity:"Dê vida ao seu próximo mundo.",
  system:"Defina as regras da aventura.",
  players:"Reúna o seu grupo.",
  permissions:"Escolha como todos podem interagir.",
  review:"Revise e abra o portal."
};
let currentStep = 0;

function renderStep() {
  steps.forEach((step,index) => step.classList.toggle("active", index === currentStep));
  panels.forEach((panel,index) => panel.classList.toggle("active", index === currentStep));
  document.querySelector("#step-number").textContent = currentStep + 1;
  document.querySelector("#step-title").textContent = titles[steps[currentStep].dataset.createStep];
  progress.style.width = `${(currentStep + 1) / steps.length * 100}%`;
  backButton.disabled = currentStep === 0;
  nextButton.textContent = currentStep === steps.length - 1 ? "Criar campanha →" : "Continuar →";
}

steps.forEach((step,index) => step.addEventListener("click", () => { currentStep = index; renderStep(); }));
nextButton.addEventListener("click", () => {
  if (currentStep < steps.length - 1) { currentStep += 1; renderStep(); return; }
  window.location.href = "campanhas.html";
});
backButton.addEventListener("click", () => { if (currentStep > 0) { currentStep -= 1; renderStep(); } });
renderStep();
