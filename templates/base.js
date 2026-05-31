// Form submit: disable submit button and show spinner
document.addEventListener('submit', function (e) {
  var form = e.target;
  var btn = form.querySelector('[type=submit]');
  if (!btn) return;
  btn.disabled = true;
  var spinner = document.createElement('span');
  spinner.className = 'btn-spinner';
  btn.appendChild(spinner);
});
