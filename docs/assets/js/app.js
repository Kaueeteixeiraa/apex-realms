// Shared interactions for the landing page and product prototype.
const revealObserver = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add("visible");
  revealObserver.unobserve(entry.target);
}), {threshold: .12});

document.querySelectorAll(".reveal").forEach(element => revealObserver.observe(element));

const siteHeader = document.querySelector(".site-header");
if (siteHeader) {
  window.addEventListener("scroll", () => siteHeader.classList.toggle("scrolled", window.scrollY > 24));
}

const particleField = document.querySelector("#particles");
if (particleField) {
  for (let index = 0; index < 42; index += 1) {
    const particle = document.createElement("i");
    particle.className = "particle";
    particle.style.cssText = `left:${Math.random() * 100}%;top:${Math.random() * 95}%;--speed:${4 + Math.random() * 8}s;--opacity:${.2 + Math.random() * .65};--x:${-40 + Math.random() * 80}px;--y:${-60 - Math.random() * 100}px`;
    particleField.append(particle);
  }
}

document.querySelectorAll("[data-modal]").forEach(button => button.addEventListener("click", () => {
  document.querySelector(`#${button.dataset.modal}`)?.classList.add("open");
}));

document.querySelectorAll(".modal-close,.modal-backdrop").forEach(element => element.addEventListener("click", event => {
  if (event.target === element || element.classList.contains("modal-close")) element.closest(".modal-backdrop")?.classList.remove("open");
}));

document.querySelectorAll("[data-tabs]").forEach(group => group.querySelectorAll("[data-tab-target]").forEach(button => {
  button.addEventListener("click", () => {
    group.querySelectorAll("[data-tab-target]").forEach(item => item.classList.remove("active"));
    button.classList.add("active");
    const panels = document.querySelectorAll("[data-tab-panel]");
    if (panels.length) {
      panels.forEach(panel => panel.classList.toggle("active", panel.dataset.tabPanel === button.dataset.tabTarget));
    }
  });
}));

function showPrototypeToast(message) {
  let toast = document.querySelector(".prototype-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "prototype-toast";
    document.body.append(toast);
  }
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showPrototypeToast.timer);
  showPrototypeToast.timer = setTimeout(() => toast.classList.remove("show"), 2600);
}

document.querySelectorAll("[data-demo-form]").forEach(form => form.addEventListener("submit", event => {
  event.preventDefault();
  form.closest(".modal-backdrop")?.classList.remove("open");
  showPrototypeToast("Pronto. A ação foi simulada no protótipo.");
}));

document.querySelectorAll("[data-demo-action]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Recurso adicionado à cena de demonstração.");
}));

document.querySelectorAll("[data-save]").forEach(button => button.addEventListener("click", () => {
  showPrototypeToast("Alterações salvas localmente.");
}));
