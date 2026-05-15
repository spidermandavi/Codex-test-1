const historyControls = document.querySelectorAll('[data-history]');

historyControls.forEach((control) => {
  control.addEventListener('click', () => {
    if (control.dataset.history === 'back') {
      window.history.back();
      return;
    }

    window.history.forward();
  });
});
