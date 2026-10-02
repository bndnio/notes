// Form submit: show spinner. Disable the button after this event so the
// browser still proceeds with navigation (disabling synchronously cancels it).
document.addEventListener('submit', function (e) {
  if (e.defaultPrevented) return;
  var form = e.target;
  var btn = form.querySelector('[type=submit]');
  if (!btn) return;
  var spinner = document.createElement('span');
  spinner.className = 'btn-spinner';
  btn.appendChild(spinner);
  setTimeout(function () { btn.disabled = true; }, 0);
});

// Theme switcher: the server renders <html data-theme> from the `theme`
// cookie (src/lib/theme.ts). A click updates both, so no reload is needed.
// "auto" clears the cookie and hands the choice back to the OS.
(function () {
  var root = document.documentElement;
  var buttons = document.querySelectorAll('[data-theme-choice]');
  function sync() {
    buttons.forEach(function (b) {
      b.setAttribute('aria-pressed', String(b.dataset.themeChoice === root.dataset.theme));
    });
  }
  buttons.forEach(function (b) {
    b.addEventListener('click', function () {
      var choice = b.dataset.themeChoice;
      root.dataset.theme = choice;
      document.cookie = choice === 'auto'
        ? 'theme=; Path=/; Max-Age=0; SameSite=Lax'
        : 'theme=' + choice + '; Path=/; Max-Age=31536000; SameSite=Lax; Secure';
      sync();
    });
  });
  sync();
})();
