document.querySelectorAll("[data-copy]").forEach(button => {
  button.addEventListener("click", async () => {
    await navigator.clipboard.writeText(button.dataset.copy);
    const original = button.textContent;
    button.textContent = "Código copiado!";
    setTimeout(() => button.textContent = original, 1500);
  });
});

document.querySelectorAll("[data-open-modal]").forEach(button => {
  button.addEventListener("click", () => document.querySelector(`#${button.dataset.openModal}`)?.showModal());
});
document.querySelectorAll(".modal-close").forEach(button => button.addEventListener("click", () => button.closest("dialog").close()));
document.querySelectorAll(".modal").forEach(modal => modal.addEventListener("click", event => {
  if (event.target === modal) modal.close();
}));

document.querySelectorAll("[data-content-tab]").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll("[data-content-tab],.content-pane").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelector(`#content-${button.dataset.contentTab}`).classList.add("active");
}));

document.querySelectorAll(".campaign-tabs button").forEach(button => button.addEventListener("click", () => {
  document.querySelectorAll(".campaign-tabs button").forEach(item => item.classList.remove("active"));
  button.classList.add("active");
  document.querySelectorAll(".campaign-card").forEach(card => {
    card.hidden = button.dataset.filter !== "all" && card.dataset.role !== button.dataset.filter;
  });
}));
