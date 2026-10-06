// Language switch for the Swaplight site: ?lang=hu / #hu, then the saved choice, then the browser.
(function () {
  var root = document.documentElement;
  function pick() {
    var q = new URLSearchParams(location.search).get('lang');
    if (q === 'en' || q === 'hu') return q;
    if (location.hash === '#hu' || location.hash === '#en') return location.hash.slice(1);
    try {
      var saved = localStorage.getItem('swaplight-site-lang');
      if (saved === 'en' || saved === 'hu') return saved;
    } catch {
      /* storage unavailable */
    }
    var nav = (navigator.languages && navigator.languages[0]) || navigator.language || 'en';
    return nav.toLowerCase().indexOf('hu') === 0 ? 'hu' : 'en';
  }
  function apply(lang) {
    root.setAttribute('data-lang', lang);
    root.setAttribute('lang', lang);
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].setAttribute(
        'aria-pressed',
        buttons[i].getAttribute('data-set-lang') === lang ? 'true' : 'false',
      );
    }
    var title = document.querySelector('meta[name="title-' + lang + '"]');
    if (title) document.title = title.getAttribute('content');
  }
  apply(pick());
  document.addEventListener('DOMContentLoaded', function () {
    apply(root.getAttribute('data-lang'));
    var buttons = document.querySelectorAll('[data-set-lang]');
    for (var i = 0; i < buttons.length; i++) {
      buttons[i].addEventListener('click', function (e) {
        var lang = e.currentTarget.getAttribute('data-set-lang');
        try {
          localStorage.setItem('swaplight-site-lang', lang);
        } catch {
          /* ignore */
        }
        apply(lang);
      });
    }
  });
})();
