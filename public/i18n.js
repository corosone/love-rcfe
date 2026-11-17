(function () {
  'use strict';

  // Love RCFE language switcher (core).
  // English is the page itself. Each other language lives in its own file, /i18n/<code>.js,
  // which is downloaded only when a visitor uses that language. To change a translation,
  // edit the matching file in /public/i18n/.

  var STORAGE_KEY = 'lovercfe_lang';
  var LOAD_TIMEOUT_MS = 8000;

  var LANGUAGES = {
    en: { code: 'EN', name: 'English', intl: 'en-US' },
    es: { code: 'ES', name: 'Español', intl: 'es-US' },
    zh: { code: 'ZH', name: '中文', intl: 'zh-CN' },
    tl: { code: 'TL', name: 'Tagalog', intl: 'fil-PH' },
    vi: { code: 'VI', name: 'Tiếng Việt', intl: 'vi-VN' },
    ko: { code: 'KO', name: '한국어', intl: 'ko-KR' },
    hy: { code: 'ARM', name: 'Հայերեն', intl: 'hy-AM' },
    ru: { code: 'RU', name: 'Русский', intl: 'ru-RU' },
    ar: { code: 'AR', name: 'العربية', intl: 'ar-US' },
    fa: { code: 'FA', name: 'فارسی', intl: 'fa-IR' },
    hi: { code: 'HI', name: 'हिन्दी', intl: 'hi-IN' },
    pa: { code: 'PA', name: 'ਪੰਜਾਬੀ', intl: 'pa-IN' },
    ja: { code: 'JA', name: '日本語', intl: 'ja-JP' },
    uk: { code: 'UK', name: 'Українська', intl: 'uk-UA' },
    he: { code: 'HE', name: 'עברית', intl: 'he-IL' },
    km: { code: 'KM', name: 'ខ្មែរ', intl: 'km-KH' },
    fr: { code: 'FR', name: 'Français', intl: 'fr-FR' },
    pt: { code: 'PT', name: 'Português', intl: 'pt-BR' }
  };

  // English versions of HTML blocks that scripts insert themselves (not present in the page).
  var EN_BLOCKS = {
    modal_urgent_p: 'With an immediate 1–7 day timeframe, call our intake hotline at <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> for emergency openings and priority tour booking.'
  };

  // Language files register themselves here: window.LoveI18nData[code] = { dict: {...}, blocks: {...} }
  var DATA = window.LoveI18nData = window.LoveI18nData || {};

  var origTextMap = new WeakMap();
  var origAttrMap = new WeakMap();
  var origBlockMap = new WeakMap();
  var changeListeners = [];
  var initialized = false;
  var switchToken = 0;

  function syncDocumentLangAttrs(code) {
    try {
      var html = document.documentElement;
      if (!html) return;
      html.lang = code;
      if (code && code !== 'en') {
        html.setAttribute('translate', 'no');
        html.classList.add('notranslate');
      } else {
        html.setAttribute('translate', 'yes');
        html.classList.remove('notranslate');
      }
    } catch (e) {}
  }

  // Own-property lookups only. A plain obj[key] lookup would also find built-in
  // properties such as "constructor" or "toString", so ?lang=constructor used to
  // replace every piece of text on the page with "function Object() { [native code] }".
  function own(obj, key) {
    return obj != null && typeof key === 'string' && Object.prototype.hasOwnProperty.call(obj, key);
  }
  function pick(obj, key) {
    return own(obj, key) ? obj[key] : undefined;
  }

  function dataFor(lang) {
    var d = pick(DATA, lang);
    return d && typeof d === 'object' ? d : null;
  }
  function translationOf(part, key, lang) {
    var d = dataFor(lang);
    var value = d ? pick(d[part], key) : undefined;
    return typeof value === 'string' && value ? value : undefined;
  }
  // True when key is translatable text in any loaded language (all languages share the same English keys).
  function isKnownText(key) {
    for (var code in DATA) {
      if (own(DATA, code) && DATA[code] && own(DATA[code].dict, key)) return true;
    }
    return false;
  }

  // ---------- Loading language files ----------
  // While the visitor's language is downloading, the page is kept invisible (max a few seconds)
  // so English text does not flash before the translation appears.
  function setPending(on) {
    try {
      var html = document.documentElement;
      if (on) {
        if (!document.getElementById('i18n-pending-style')) {
          var style = document.createElement('style');
          style.id = 'i18n-pending-style';
          style.textContent = 'html.i18n-pending body{visibility:hidden}';
          (document.head || html).appendChild(style);
        }
        html.classList.add('i18n-pending');
        // Never keep the page hidden for long, even on a very slow connection.
        setTimeout(function () { html.classList.remove('i18n-pending'); }, 3000);
      } else {
        html.classList.remove('i18n-pending');
      }
    } catch (e) {}
  }

  // Calls done(true) once the language's file has loaded (immediately if already loaded or English),
  // or done(false) if it fails to load. Never calls done more than once.
  function loadLang(lang, done) {
    if (lang === 'en' || dataFor(lang)) {
      done(true);
      return;
    }
    var finished = false;
    function finish(ok) {
      if (finished) return;
      finished = true;
      done(ok && !!dataFor(lang));
    }
    var id = 'i18n-data-' + lang;
    var script = document.getElementById(id);
    if (script && script.getAttribute('data-failed') === '1') {
      // An earlier attempt failed (for example a brief network drop): try again with a fresh request.
      script.parentNode.removeChild(script);
      script = null;
    }
    if (!script) {
      script = document.createElement('script');
      script.id = id;
      script.src = '/i18n/' + lang + '.js';
      script.async = true;
      (document.head || document.documentElement).appendChild(script);
    }
    script.addEventListener('load', function () { finish(true); });
    script.addEventListener('error', function () {
      script.setAttribute('data-failed', '1');
      finish(false);
    });
    setTimeout(function () { finish(false); }, LOAD_TIMEOUT_MS);
  }

  var currentLang = getSavedLang();
  syncDocumentLangAttrs(currentLang);
  // Start downloading the visitor's language immediately (theme-init.js may already have started it).
  if (currentLang !== 'en' && !dataFor(currentLang)) {
    loadLang(currentLang, function () {});
  }

  // Each language also has its own address, /es/, /zh/ and so on: a copy of the home page
  // that is already translated (built by scripts/build-pages.js, so search engines can read
  // it). On those addresses the address decides the language.
  function pathLang() {
    try {
      var m = /^\/([a-z]{2})(?:\/|$)/.exec(window.location.pathname);
      return m && m[1] !== 'en' && own(LANGUAGES, m[1]) ? m[1] : '';
    } catch (e) {
      return '';
    }
  }
  // True on a home page address: "/" or a language address such as "/es/"
  function onHomeAddress() {
    try {
      var p = window.location.pathname;
      return p === '/' || p === '/index.html' || (!!pathLang() && /^\/[a-z]{2}\/?(?:index\.html)?$/.test(p));
    } catch (e) {
      return false;
    }
  }
  function homeAddressFor(code) {
    return code === 'en' ? '/' : '/' + code + '/';
  }
  // True when this page arrived already translated into the current language
  function isPrerendered() {
    var html = document.documentElement;
    return !!html && currentLang !== 'en' && html.getAttribute('data-prerendered') === currentLang;
  }

  function getSavedLang() {
    var fromPath = pathLang();
    if (fromPath) return fromPath;
    try {
      var q = typeof URLSearchParams !== 'undefined' ? new URLSearchParams(window.location.search).get('lang') : '';
      if (q && own(LANGUAGES, q)) return q;
      var saved = localStorage.getItem(STORAGE_KEY);
      if (saved && own(LANGUAGES, saved)) return saved;
    } catch (e) {}
    return 'en';
  }

  function saveLang(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (e) {}
  }

  function t(text, vars) {
    var raw = String(text || '');
    var out = raw;
    var tr = currentLang !== 'en' ? translationOf('dict', raw, currentLang) : undefined;
    if (tr) {
      out = tr;
    }
    if (vars && typeof vars === 'object') {
      Object.keys(vars).forEach(function (k) {
        out = out.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return out;
  }

  // HTML for a block that scripts insert themselves, in the current language (English fallback).
  function getBlock(key) {
    return (currentLang !== 'en' && translationOf('blocks', key, currentLang)) || pick(EN_BLOCKS, key) || '';
  }

  function shouldSkipNode(node) {
    var parent = node.parentElement;
    if (!parent) return true;
    var tag = parent.tagName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' || tag === 'SVG') return true;
    if (parent.closest && (parent.closest('svg') || parent.closest('.lang-option') || parent.closest('[data-i18n-block]') || parent.closest('[data-i18n-skip]'))) {
      return true;
    }
    return false;
  }

  function applyDom(root) {
    var container = root || document;
    if (!document.body) return;

    // 1. Mixed-HTML blocks tagged with data-i18n-block
    var blocks = container.querySelectorAll ? container.querySelectorAll('[data-i18n-block]') : [];
    blocks.forEach(function (el) {
      if (!origBlockMap.has(el)) {
        origBlockMap.set(el, el.innerHTML);
      }
      var key = el.getAttribute('data-i18n-block');
      if (currentLang === 'en') {
        el.innerHTML = origBlockMap.get(el);
      } else if (translationOf('blocks', key, currentLang)) {
        el.innerHTML = translationOf('blocks', key, currentLang);
      }
    });

    // 2. Attributes: placeholder, title, aria-label
    var attrNames = ['placeholder', 'title', 'aria-label', 'alt'];
    var withAttrs = container.querySelectorAll ? container.querySelectorAll('[placeholder],[title],[aria-label],[alt]') : [];
    withAttrs.forEach(function (el) {
      if (el.closest && el.closest('.lang-option')) return;
      var saved = origAttrMap.get(el);
      if (!saved) {
        saved = {};
        attrNames.forEach(function (attr) {
          if (el.hasAttribute(attr)) {
            saved[attr] = el.getAttribute(attr);
          }
        });
        origAttrMap.set(el, saved);
      }
      Object.keys(saved).forEach(function (attr) {
        var origVal = saved[attr];
        var norm = String(origVal || '').replace(/\s+/g, ' ').trim();
        if (currentLang === 'en') {
          el.setAttribute(attr, origVal);
        } else if (translationOf('dict', norm, currentLang)) {
          el.setAttribute(attr, translationOf('dict', norm, currentLang));
        }
      });
    });

    // 3. Text nodes (preserves sibling Lucide SVG icons & surrounding spacing)
    var scanRoot = container === document ? document.body : container;
    if (scanRoot && document.createTreeWalker) {
      var walker = document.createTreeWalker(scanRoot, NodeFilter.SHOW_TEXT, null);
      var textNode;
      while ((textNode = walker.nextNode())) {
        if (shouldSkipNode(textNode)) continue;
        if (!origTextMap.has(textNode)) {
          origTextMap.set(textNode, textNode.nodeValue);
        }
        var orig = origTextMap.get(textNode);
        var trimmed = orig.replace(/\s+/g, ' ').trim();
        if (!trimmed || !isKnownText(trimmed)) continue;
        var leadMatch = orig.match(/^\s*/);
        var trailMatch = orig.match(/\s*$/);
        var lead = leadMatch ? leadMatch[0] : '';
        var trail = trailMatch ? trailMatch[0] : '';
        var translated = currentLang === 'en' ? trimmed : (translationOf('dict', trimmed, currentLang) || trimmed);
        var nextVal = lead + translated + trail;
        if (textNode.nodeValue !== nextVal) {
          textNode.nodeValue = nextVal;
        }
      }
    }

    // 4. Refresh Lucide icons inside replaced blocks
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function notifyChange(code) {
    changeListeners.forEach(function (fn) {
      try { fn(code); } catch (e) {}
    });
  }

  function updateHeaderControls() {
    var meta = pick(LANGUAGES, currentLang) || LANGUAGES.en;
    syncDocumentLangAttrs(currentLang);

    document.querySelectorAll('.lang-current-code').forEach(function (el) {
      el.textContent = meta.code;
    });

    document.querySelectorAll('.lang-option[data-lang]').forEach(function (btn) {
      var active = btn.getAttribute('data-lang') === currentLang;
      btn.setAttribute('aria-checked', active ? 'true' : 'false');
      var check = btn.querySelector('.lang-check');
      if (check) {
        if (active) check.classList.remove('hidden');
        else check.classList.add('hidden');
      }
    });
  }

  function syncMenuScrollShadow(menu) {
    if (!menu || menu.classList.contains('hidden')) return;
    var overflow = menu.scrollHeight - menu.clientHeight;
    var hasMoreBelow = overflow > 4 && (menu.scrollTop + menu.clientHeight < menu.scrollHeight - 4);
    if (hasMoreBelow) {
      menu.classList.add('has-scroll-bottom');
    } else {
      menu.classList.remove('has-scroll-bottom');
    }
  }

  function bindMenuScrollListeners() {
    var menus = document.querySelectorAll('.lang-dropdown');
    menus.forEach(function (menu) {
      if (menu.getAttribute('data-scroll-shadow-bound') === '1') return;
      menu.setAttribute('data-scroll-shadow-bound', '1');
      menu.addEventListener('scroll', function () {
        syncMenuScrollShadow(menu);
      }, { passive: true });
    });
  }

  function closeMenus() {
    var pairs = [
      ['lang-dropdown', 'lang-toggle-btn'],
      ['lang-dropdown-mobile', 'lang-toggle-btn-mobile']
    ];
    pairs.forEach(function (pair) {
      var menu = document.getElementById(pair[0]);
      var btn = document.getElementById(pair[1]);
      if (menu) menu.classList.add('hidden');
      if (btn) btn.setAttribute('aria-expanded', 'false');
    });
  }

  function toggleMenu(which) {
    var isMobile = which === 'mobile';
    var menuId = isMobile ? 'lang-dropdown-mobile' : 'lang-dropdown';
    var btnId = isMobile ? 'lang-toggle-btn-mobile' : 'lang-toggle-btn';
    var otherMenuId = isMobile ? 'lang-dropdown' : 'lang-dropdown-mobile';
    var otherBtnId = isMobile ? 'lang-toggle-btn' : 'lang-toggle-btn-mobile';

    var otherMenu = document.getElementById(otherMenuId);
    var otherBtn = document.getElementById(otherBtnId);
    if (otherMenu) otherMenu.classList.add('hidden');
    if (otherBtn) otherBtn.setAttribute('aria-expanded', 'false');

    var menu = document.getElementById(menuId);
    var btn = document.getElementById(btnId);
    if (!menu || !btn) return;

    var willOpen = menu.classList.contains('hidden');
    if (willOpen) {
      bindMenuScrollListeners();
      menu.classList.remove('hidden');
      btn.setAttribute('aria-expanded', 'true');
      var checked = menu.querySelector('.lang-option[aria-checked="true"]') || menu.querySelector('.lang-option');
      if (checked) {
        try { checked.focus(); } catch (e) {}
      }
      syncMenuScrollShadow(menu);
      if (typeof window.requestAnimationFrame === 'function') {
        window.requestAnimationFrame(function () {
          syncMenuScrollShadow(menu);
        });
      }
    } else {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  }

  // Switch language from the menu. Downloads the language file first if needed; if that fails,
  // the page stays in its current language.
  function setLang(code) {
    var next = own(LANGUAGES, code) ? code : 'en';
    // On the home page, changing language means going to that language's own address.
    if (onHomeAddress()) {
      var here = window.location.pathname.replace(/index\.html$/, '');
      if (here !== homeAddressFor(next) && here + '/' !== homeAddressFor(next)) {
        saveLang(next);
        closeMenus();
        window.location.assign(homeAddressFor(next) + window.location.hash);
        return;
      }
      if (isPrerendered() && next === currentLang) {
        closeMenus();
        return;
      }
    }
    var token = ++switchToken;
    closeMenus();
    var root = document.documentElement;
    if (root) root.style.cursor = 'progress';
    loadLang(next, function (ok) {
      if (root) root.style.cursor = '';
      if (token !== switchToken) return; // a newer choice was made meanwhile
      if (!ok) return;
      currentLang = next;
      saveLang(next);
      updateHeaderControls();
      applyDom(document);
      closeMenus();
      notifyChange(next);
    });
  }

  function init() {
    currentLang = getSavedLang();
    initialized = true;
    bindMenuScrollListeners();
    updateHeaderControls();
    if (currentLang === 'en' || (dataFor(currentLang) && !isPrerendered())) {
      applyDom(document);
      setPending(false);
      return;
    }
    var target = currentLang;
    var token = switchToken;
    if (isPrerendered()) {
      // The page text is already in this language. Only the words that scripts insert later
      // (calculator, quiz, form messages) need the language file.
      setPending(false);
      loadLang(target, function (ok) {
        if (ok && token === switchToken && currentLang === target) notifyChange(target);
      });
      return;
    }
    // The language file is still downloading: keep the page hidden briefly, then translate.
    setPending(true);
    loadLang(target, function (ok) {
      setPending(false);
      if (token !== switchToken || currentLang !== target) return;
      if (!ok) {
        // Could not load the translation: show the page in English rather than a broken mix.
        currentLang = 'en';
        updateHeaderControls();
        return;
      }
      applyDom(document);
      notifyChange(target); // lets page scripts re-translate text they inserted themselves
    });
  }

  function bindGlobalMenuEvents() {
    bindMenuScrollListeners();

    window.addEventListener('resize', function () {
      var menus = document.querySelectorAll('.lang-dropdown:not(.hidden)');
      menus.forEach(function (menu) {
        syncMenuScrollShadow(menu);
      });
    }, { passive: true });

    document.addEventListener('click', function (e) {
      var toggleBtn = e.target && e.target.closest ? e.target.closest('[data-lang-toggle]') : null;
      if (toggleBtn) {
        e.preventDefault();
        e.stopPropagation();
        toggleMenu(toggleBtn.getAttribute('data-lang-toggle'));
        return;
      }

      var langBtn = e.target && e.target.closest ? e.target.closest('.lang-option[data-lang]') : null;
      if (langBtn) {
        e.preventDefault();
        setLang(langBtn.getAttribute('data-lang'));
        return;
      }

      if (!e.target || !e.target.closest || !e.target.closest('#lang-menu-wrap, #lang-menu-wrap-mobile')) {
        closeMenus();
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') {
        closeMenus();
        return;
      }
      if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target && e.target.closest) {
        var menu = e.target.closest('.lang-dropdown');
        if (menu && !menu.classList.contains('hidden')) {
          var items = Array.prototype.slice.call(menu.querySelectorAll('.lang-option'));
          var idx = items.indexOf(e.target.closest('.lang-option'));
          if (idx !== -1 && items.length) {
            e.preventDefault();
            var nextIdx = e.key === 'ArrowDown' ? (idx + 1) % items.length : (idx - 1 + items.length) % items.length;
            items[nextIdx].focus();
          }
        }
      }
    });
  }

  bindGlobalMenuEvents();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      if (!initialized) init();
    });
  } else {
    init();
  }
  if (document.body && !initialized) {
    init();
  }

  window.LoveI18n = {
    init: init,
    setLang: setLang,
    getLang: function () { return currentLang; },
    getIntlLocale: function () { var m = pick(LANGUAGES, currentLang); return (m && m.intl) || 'en-US'; },
    t: t,
    getBlock: getBlock,
    applyDom: applyDom,
    toggleMenu: toggleMenu,
    closeMenus: closeMenus,
    onChange: function (fn) {
      if (typeof fn === 'function') changeListeners.push(fn);
    },
    LANGUAGES: LANGUAGES
  };
})();
