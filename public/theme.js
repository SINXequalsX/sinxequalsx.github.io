(function () {
  var root = document.documentElement;
  var saved = localStorage.getItem('peter-theme');
  var dark = saved ? saved === 'dark' : window.matchMedia('(prefers-color-scheme: dark)').matches;
  root.dataset.theme = dark ? 'dark' : 'light';

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[data-theme-toggle]');
    if (!button) return;
    var next = root.dataset.theme === 'dark' ? 'light' : 'dark';
    root.dataset.theme = next;
    localStorage.setItem('peter-theme', next);
  });
})();
