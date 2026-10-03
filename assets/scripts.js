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

// Modals: each overlay is `#<name>-overlay` and opens on load when the URL has
// `?modal=<name>`. Closing a modal discards unsaved edits by restoring its
// original markup, so attach listeners for anything inside a modal to `document`.
var modalSnapshots = new Map();
document.querySelectorAll('.modal-overlay').forEach(function (overlay) {
  modalSnapshots.set(overlay, overlay.innerHTML);
});

function resetModal(overlay) {
  var snapshot = modalSnapshots.get(overlay);
  if (snapshot !== undefined) overlay.innerHTML = snapshot;
}

function modalOverlay(name) {
  return document.getElementById(name + '-overlay');
}

// The control that opened each modal, so closing can hand focus back to it.
// Tracked from clicks because Safari doesn't focus buttons when they're clicked.
var modalOpeners = new Map();
var lastClicked = null;
document.addEventListener('click', function (e) {
  lastClicked = e.target.closest ? e.target.closest('button, a') : null;
}, true);

function openModal(name) {
  var overlay = modalOverlay(name);
  if (!overlay) return;
  overlay.classList.add('modal-overlay--visible');
  // If the clicked control was removed (e.g. by closing the modal it was in),
  // fall back to whatever has focus now.
  var opener = lastClicked && lastClicked.isConnected ? lastClicked : document.activeElement;
  modalOpeners.set(overlay, opener);
}

function closeModal(name) {
  var overlay = modalOverlay(name);
  if (overlay) {
    overlay.classList.remove('modal-overlay--visible');
    resetModal(overlay);
    var opener = modalOpeners.get(overlay);
    if (opener && opener.isConnected) opener.focus();
    modalOpeners.delete(overlay);
  }
  var url = new URL(window.location);
  url.searchParams.delete('modal');
  history.replaceState(null, '', url);
}

// Reset on every page show, including back/forward navigation, where the
// browser would otherwise bring back stale input values.
window.addEventListener('pageshow', function () {
  modalSnapshots.forEach(function (_, overlay) { resetModal(overlay); });
});

// A click on the backdrop itself, not on the modal inside it, closes.
document.addEventListener('click', function (e) {
  var overlay = e.target;
  if (overlay.classList && overlay.classList.contains('modal-overlay')) {
    closeModal(overlay.id.replace(/-overlay$/, ''));
  }
});

document.addEventListener('keydown', function (e) {
  if (e.key !== 'Escape') return;
  var open = document.querySelectorAll('.modal-overlay--visible');
  if (open.length) closeModal(open[open.length - 1].id.replace(/-overlay$/, ''));
});

(function () {
  var name = new URLSearchParams(window.location.search).get('modal');
  if (name) openModal(name);
})();
