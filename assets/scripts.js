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
