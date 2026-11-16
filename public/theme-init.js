(function () {
  'use strict';

  if ('scrollRestoration' in history) {
    history.scrollRestoration = 'manual';
  }

  try {
    var s = localStorage.getItem('lovercfe_theme');
    // First-time visitors always default to light mode first
    var isDark = s === 'dark';
    if (isDark) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', isDark ? '#121915' : '#315d48');
  } catch (e) {}

  try {
    var LANG_RE = /^(en|es|zh|tl|vi|ko|hy|ru|ar|fa|hi|pa|ja|uk|he|km|fr|pt)$/;
    var qLang = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : '';
    // Same rule as i18n.js: an unknown ?lang= value falls back to the saved language.
    var sLang = LANG_RE.test(qLang || '') ? qLang : (localStorage.getItem('lovercfe_lang') || 'en');
    if (LANG_RE.test(sLang) && sLang !== 'en') {
      var root = document.documentElement;
      root.lang = sLang;
      root.setAttribute('translate', 'no');
      root.classList.add('notranslate');
      // Start downloading this language's translations now, while the page is still loading,
      // and keep the page invisible until /i18n.js has applied them (at most 3 seconds).
      var style = document.createElement('style');
      style.id = 'i18n-pending-style';
      style.textContent = 'html.i18n-pending body{visibility:hidden}';
      document.head.appendChild(style);
      root.classList.add('i18n-pending');
      var data = document.createElement('script');
      data.id = 'i18n-data-' + sLang;
      data.src = '/i18n/' + sLang + '.js';
      data.async = true;
      data.onerror = function () {
        data.setAttribute('data-failed', '1');
        root.classList.remove('i18n-pending');
      };
      document.head.appendChild(data);
      setTimeout(function () { root.classList.remove('i18n-pending'); }, 3000);
    }
  } catch (e) {}
})();
