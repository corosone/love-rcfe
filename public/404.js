(function () {
  'use strict';

  try {
    var isDark = localStorage.getItem('lovercfe_theme') === 'dark';
    if (isDark) document.documentElement.classList.add('dark');
    var m = document.querySelector('meta[name="theme-color"]');
    if (m) m.setAttribute('content', isDark ? '#121915' : '#315d48');
  } catch (e) {}

  function loadTwFallback() {
    if (document.getElementById('tw-cdn-fallback')) return;
    var s = document.createElement('script');
    s.id = 'tw-cdn-fallback';
    s.src = 'https://cdn.tailwindcss.com/3.4.17';
    s.crossOrigin = 'anonymous';
    s.referrerPolicy = 'no-referrer';
    s.onload = function () {
      if (window.tailwind) {
        window.tailwind.config = {
          darkMode: 'class',
          theme: {
            extend: {
              colors: {
                brand: {
                  ink: '#26382f', muted: '#59685f', cream: '#f8f5ee', creamLight: '#fcfbfa',
                  sage: '#dce7d9', sageLight: '#edf2e9', green: '#315d48', greenDark: '#203d30',
                  accent: '#a96b46', accentLight: '#f5eee5', line: '#d9ded4'
                }
              },
              fontFamily: {
                sans: ['"DM Sans"', 'sans-serif'],
                display: ['"Fraunces"', 'serif']
              }
            }
          }
        };
      }
    };
    document.head.appendChild(s);
  }

  var twLink = document.getElementById('tw-css');
  if (twLink) {
    twLink.addEventListener('error', loadTwFallback);
  }

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

  function init404() {
    var btn = document.getElementById('theme-btn');
    if (btn) btn.addEventListener('click', toggleTheme);
    var yearEl = document.getElementById('current-year');
    if (yearEl) yearEl.textContent = new Date().getFullYear();
    if (window.LoveI18n) {
      window.LoveI18n.init();
      window.LoveI18n.onChange(function () {
        syncThemeBtn(document.documentElement.classList.contains('dark'));
      });
    }
    syncThemeBtn(document.documentElement.classList.contains('dark'));
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init404);
  } else {
    init404();
  }
})();
