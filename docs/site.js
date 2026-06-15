// Reveal content when it enters the viewport, keeping the page calm and lightweight.
const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (entry.isIntersecting) {
    entry.target.classList.add("visible");
    observer.unobserve(entry.target);
  }
}), {threshold: .12});
document.querySelectorAll(".reveal").forEach(element => observer.observe(element));

// Give the header a solid background after the hero begins to scroll.
const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 24));
