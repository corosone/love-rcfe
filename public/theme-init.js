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
    var qLang = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : '';
    var sLang = qLang || localStorage.getItem('lovercfe_lang') || 'en';
    if (/^(en|es|zh|tl|vi|ko|hy|ru)$/.test(sLang) && sLang !== 'en') {
      document.documentElement.lang = sLang;
      document.documentElement.setAttribute('translate', 'no');
      document.documentElement.classList.add('notranslate');
    }
  } catch (e) {}

  function loadTwFallback() {
    if (document.getElementById('tw-cdn-fallback')) return;
    var script = document.createElement('script');
    script.id = 'tw-cdn-fallback';
    script.src = 'https://cdn.tailwindcss.com/3.4.17';
    script.crossOrigin = 'anonymous';
    script.referrerPolicy = 'no-referrer';
    script.onload = function () {
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
    document.head.appendChild(script);
  }

  var twLink = document.getElementById('tw-css');
  if (twLink) {
    twLink.addEventListener('error', loadTwFallback);
  }
})();
