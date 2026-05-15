const menuToggle = document.querySelector("#menu-toggle");
const trainingMenu = document.querySelector("#training-menu");
const modeCards = document.querySelectorAll(".mode-card");

menuToggle.addEventListener("click", () => {
  const isOpen = trainingMenu.classList.toggle("is-open");
  menuToggle.setAttribute("aria-expanded", String(isOpen));
});

modeCards.forEach((card) => {
  card.addEventListener("click", () => {
    modeCards.forEach((item) => item.classList.remove("is-active"));
    card.classList.add("is-active");
  });
});
