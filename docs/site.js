const observer = new IntersectionObserver(entries => entries.forEach(entry => {
  if (!entry.isIntersecting) return;
  entry.target.classList.add("visible");
  observer.unobserve(entry.target);
}), {threshold: .12});

document.querySelectorAll(".reveal").forEach(element => observer.observe(element));

const header = document.querySelector(".site-header");
window.addEventListener("scroll", () => header.classList.toggle("scrolled", window.scrollY > 24));

const particleField = document.querySelector("#particles");
for (let index = 0; index < 42; index += 1) {
  const particle = document.createElement("i");
  particle.className = "particle";
  particle.style.cssText = [
    `left:${Math.random() * 100}%`,
    `top:${Math.random() * 95}%`,
    `--speed:${4 + Math.random() * 8}s`,
    `--opacity:${.2 + Math.random() * .65}`,
    `--x:${-40 + Math.random() * 80}px`,
    `--y:${-60 - Math.random() * 100}px`
  ].join(";");
  particleField.append(particle);
}
