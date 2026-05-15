const homeControls = document.querySelectorAll("[data-nav-home]");
const historyControls = document.querySelectorAll("[data-history]");

homeControls.forEach((control) => {
  control.addEventListener("click", (event) => {
    event.preventDefault();
    window.location.assign(control.getAttribute("href") || "index.html");
  });
});

historyControls.forEach((control) => {
  control.addEventListener("click", () => {
    if (control.dataset.history === "back") {
      window.history.back();
      return;
    }

    window.history.forward();
  });
});
