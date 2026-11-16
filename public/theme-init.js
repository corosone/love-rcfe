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
      document.documentElement.lang = sLang;
      document.documentElement.setAttribute('translate', 'no');
      document.documentElement.classList.add('notranslate');
    }
  } catch (e) {}
})();
