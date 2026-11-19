(function () {
  'use strict';

  try {
    var isDark = localStorage.getItem('lovercfe_theme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', isDark ? '#121915' : '#315d48');
  } catch (e) {}

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function syncThemeBtn(dark) {
    var btn = document.getElementById('theme-btn');
    if (btn) {
      var label = dark ? 'Switch to light mode' : 'Switch to dark mode';
      if (window.LoveI18n && typeof window.LoveI18n.t === 'function') {
        label = window.LoveI18n.t(label);
      }
      btn.setAttribute('aria-label', label);
      btn.innerHTML = dark ? '<i data-lucide="sun" class="w-4 h-4"></i>' : '<i data-lucide="moon" class="w-4 h-4"></i>';
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', dark ? '#121915' : '#315d48');
    refreshIcons();
  }

  function toggleTheme() {
    var dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('lovercfe_theme', dark ? 'dark' : 'light'); } catch (e) {}
    syncThemeBtn(dark);
  }

  // The tab title in the page's language (the text on the page is translated by i18n.js).
  function translateTitle() {
    if (window.LoveI18n && typeof window.LoveI18n.t === 'function') {
      document.title = window.LoveI18n.t('Page Not Found | Love RCFE');
    }
  }

  // A missing page under a language address (/es/..., /zh-hant/...) is shown in that language,
  // so its links to the home page go to that language's home page (/es/#contact), not the
  // English one. Done once: only links that still start with "/#" are changed.
  function keepLanguageInLinks() {
    if (!window.LoveI18n || typeof window.LoveI18n.getLang !== 'function') return;
    var lang = window.LoveI18n.getLang();
    var m = /^\/([a-z]{2}(?:-[a-z]{4})?)\//.exec(window.location.pathname);
    if (!m || m[1] !== lang || lang === 'en') return;
    document.querySelectorAll('a[href^="/#"]').forEach(function (a) {
      a.setAttribute('href', '/' + lang + '/' + a.getAttribute('href').slice(1));
    });
  }

  function init404() {
    var btn = document.getElementById('theme-btn');
    if (btn) btn.addEventListener('click', toggleTheme);
    var yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    if (window.LoveI18n) {
      window.LoveI18n.init();
      window.LoveI18n.onChange(function () {
        syncThemeBtn(document.documentElement.classList.contains('dark'));
        translateTitle();
      });
      keepLanguageInLinks();
      translateTitle();
    }
    syncThemeBtn(document.documentElement.classList.contains('dark'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init404);
  } else {
    init404();
  }
})();
