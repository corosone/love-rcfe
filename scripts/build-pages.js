// Builds one ready-translated copy of the home page per language:
//   public/es/index.html, public/zh/index.html, ... (17 languages)
//
// Why: the translations are normally swapped in by the visitor's browser, so search engines
// only ever saw the English page. These copies arrive already translated, each at its own
// address (https://love-rcfe.pages.dev/es/ and so on), so they can be listed in search
// results for people searching in that language.
//
// How: it opens public/index.html in a stand-in browser (jsdom) and runs the site's own
// translation script (public/i18n.js) with the language file (public/i18n/<code>.js), so
// the result is exactly what a visitor's browser would produce. Nothing is translated here;
// to change wording, edit the language file as before.
//
// Runs on Cloudflare at deploy time. It is started twice on purpose (see package.json):
// by "postinstall", which Cloudflare always runs when it installs the packages, and by
// "npm run build". That way the pages are built whatever build command is saved in the
// Cloudflare project settings. Running it twice is harmless.
// The generated folders are not stored in the repository (see .gitignore).
'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const SITE = 'https://love-rcfe.pages.dev';
const PUBLIC = path.join(__dirname, '..', 'public');
const LANGS = ['es', 'zh', 'tl', 'vi', 'ko', 'hy', 'ru', 'ar', 'fa', 'hi', 'pa', 'ja', 'uk', 'he', 'km', 'fr', 'pt'];

const sourceHtml = fs.readFileSync(path.join(PUBLIC, 'index.html'), 'utf8');
const i18nSource = fs.readFileSync(path.join(PUBLIC, 'i18n.js'), 'utf8');

function fail(message) {
  console.error('build-pages: ' + message);
  process.exit(1);
}

function setContent(document, selector, value) {
  const el = document.querySelector(selector);
  if (!el) fail(`index.html has no ${selector}`);
  el.setAttribute('content', value);
}

// The English page must list every language address, so search engines can pair them up.
const alternates = (sourceHtml.match(/<link rel="alternate" hreflang="[^"]+" href="[^"]+">/g) || []).length;
if (alternates !== LANGS.length + 2) {
  fail(`index.html should have ${LANGS.length + 2} hreflang links (17 languages, English, x-default) but has ${alternates}`);
}

// The home page has two small scripts written into the page itself (theme set-up, and the top-bar
// check), so the first paint does not wait for extra downloads. The Content-Security-Policy only
// lets such a script run if its exact sha256 fingerprint is listed in _headers, so any change to
// one of them must come with its new fingerprint. Stop the build rather than publish a page whose
// scripts the browser would refuse to run.
function inlineScriptHashes(document) {
  return Array.from(document.querySelectorAll('script:not([src])'))
    .filter((s) => !s.type || /javascript/i.test(s.type))
    .map((s) => "'sha256-" + crypto.createHash('sha256').update(s.textContent, 'utf8').digest('base64') + "'");
}
const headersFile = fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8');
const siteCsp = (/^\/\*\r?\n(?:[ \t]+.*\r?\n)*?[ \t]+Content-Security-Policy:(.*)$/m.exec(headersFile) || [])[1] || '';
if (!siteCsp) fail('could not find the site-wide Content-Security-Policy ("/*" block) in public/_headers');
for (const hash of inlineScriptHashes(new JSDOM(sourceHtml).window.document)) {
  if (!siteCsp.includes(hash)) {
    fail(`an inline <script> in index.html changed. Add ${hash} to script-src in the "/*" Content-Security-Policy in public/_headers (and remove the old one)`);
  }
}

const english = new JSDOM(sourceHtml).window.document;
const englishTitle = english.title;
const englishIntro = (english.getElementById('hero-intro') || {}).textContent;
if (!englishTitle || !englishIntro) fail('index.html needs a <title> and an element with id="hero-intro"');
const introKey = englishIntro.replace(/\s+/g, ' ').trim();

let built = 0;
for (const lang of LANGS) {
  const langFile = path.join(PUBLIC, 'i18n', lang + '.js');
  if (!fs.existsSync(langFile)) fail(`missing language file public/i18n/${lang}.js`);

  const address = `${SITE}/${lang}/`;
  const dom = new JSDOM(sourceHtml, { url: address, runScripts: 'outside-only' });
  const { window } = dom;
  const { document } = window;

  // The site's own scripts: first the words, then the translator (which translates at once)
  window.eval(fs.readFileSync(langFile, 'utf8'));
  window.eval(i18nSource);
  const i18n = window.LoveI18n;
  if (!i18n || i18n.getLang() !== lang) fail(`the translator did not switch to "${lang}"`);

  const title = i18n.t(englishTitle);
  const intro = i18n.t(introKey);
  if (title === englishTitle) fail(`public/i18n/${lang}.js has no translation for the page title`);
  if (intro === introKey) fail(`public/i18n/${lang}.js has no translation for the opening paragraph`);
  const heading = document.getElementById('hero-title').textContent.replace(/\s+/g, ' ').trim();
  if (heading === english.getElementById('hero-title').textContent.replace(/\s+/g, ' ').trim()) {
    fail(`the main heading was not translated for "${lang}"`);
  }

  // Search and link-preview details for this language's address
  document.title = title;
  setContent(document, 'meta[name="description"]', intro);
  setContent(document, 'meta[property="og:title"]', title);
  setContent(document, 'meta[property="og:description"]', intro);
  setContent(document, 'meta[property="og:url"]', address);
  setContent(document, 'meta[name="twitter:title"]', title);
  setContent(document, 'meta[name="twitter:description"]', intro);
  document.querySelector('link[rel="canonical"]').setAttribute('href', address);

  // Tells the site's scripts that this page arrived already translated
  document.documentElement.setAttribute('data-prerendered', lang);

  // Links to the guides go to this language's copy of each guide
  for (const a of document.querySelectorAll('a[data-guide-link]')) {
    a.setAttribute('href', `/${lang}${a.getAttribute('href')}`);
  }

  const outDir = path.join(PUBLIC, lang);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), dom.serialize());
  window.close();
  built++;
}

console.log(`build-pages: wrote ${built} language pages (public/<code>/index.html)`);

// ---------- Guides ----------
// Each article in src/guides/<name>.html gets its own address, so search engines can list it on
// its own: /guides/<name>/ in English and /<code>/guides/<name>/ in every other language. The
// page is a copy of the home page (same header, footer, pop-ups and scripts) with the article in
// place of the home page's sections; the section links in the menu and footer go to the home
// page in the same language (app.js knows these pages by <main data-guide>).
//
// The build stops if any piece of an article is not translated, so a half-English guide can never
// go live. Translations live in public/i18n/<code>.js with the rest of the site.
const GUIDES = path.join(__dirname, '..', 'src', 'guides');
const guideNames = fs.existsSync(GUIDES)
  ? fs.readdirSync(GUIDES).filter((f) => /^[a-z0-9-]+\.html$/.test(f)).map((f) => f.slice(0, -5)).sort()
  : [];
const GUIDE_DATE = '2026-11-19'; // last checked; also shown in each article ("Last updated ...")
const textOf = (el) => el.textContent.replace(/\s+/g, ' ').trim();

// Pieces of text that are the same in every language (names, numbers, addresses)
const SAME_IN_EVERY_LANGUAGE = new Set(['/', '1-800-231-4024', 'Love RCFE']);

let guidePages = 0;
for (const name of guideNames) {
  const fragment = fs.readFileSync(path.join(GUIDES, `${name}.html`), 'utf8').replace(/<!--[\s\S]*?-->/g, '').trim();
  const englishGuide = new JSDOM(`<main>${fragment}</main>`).window.document;
  const section = englishGuide.querySelector('section[data-guide-title][data-guide-description]');
  if (!section) fail(`src/guides/${name}.html needs a <section> with data-guide-title and data-guide-description`);
  const guideTitle = section.getAttribute('data-guide-title');
  const guideDescription = section.getAttribute('data-guide-description');
  // Every element that holds text of its own (used to check the translation is complete)
  const pieces = (doc) => Array.from(doc.querySelectorAll('main [data-guide-title] *'))
    .filter((el) => !el.closest('[data-i18n-block]') || el.hasAttribute('data-i18n-block'))
    .filter((el) => el.hasAttribute('data-i18n-block') || Array.from(el.childNodes).some((n) => n.nodeType === 3 && n.textContent.trim()))
    .map((el) => textOf(el));
  const englishPieces = pieces(englishGuide);

  for (const lang of ['en', ...LANGS]) {
    const prefix = lang === 'en' ? '' : `/${lang}`;
    const address = `${SITE}${prefix}/guides/${name}/`;
    const dom = new JSDOM(sourceHtml, { url: address, runScripts: 'outside-only' });
    const { window } = dom;
    const { document } = window;

    // The article in place of the home page's sections
    const main = document.getElementById('main-content');
    if (!main) fail('index.html needs <main id="main-content">');
    main.innerHTML = fragment;
    main.setAttribute('data-guide', name);

    let title = guideTitle;
    let description = guideDescription;
    if (lang !== 'en') {
      window.eval(fs.readFileSync(path.join(PUBLIC, 'i18n', lang + '.js'), 'utf8'));
      window.eval(i18nSource);
      const i18n = window.LoveI18n;
      if (!i18n || i18n.getLang() !== lang) fail(`the translator did not switch to "${lang}" on the guide "${name}"`);
      title = i18n.t(guideTitle);
      description = i18n.t(guideDescription);
      if (title === guideTitle) fail(`public/i18n/${lang}.js has no translation for the title of the guide "${name}"`);
      if (description === guideDescription) fail(`public/i18n/${lang}.js has no translation for the description of the guide "${name}"`);
      const translated = pieces(document);
      if (translated.length !== englishPieces.length) fail(`the guide "${name}" in "${lang}" has a different shape than the English one`);
      const missing = englishPieces.filter((text, i) => text && translated[i] === text && !SAME_IN_EVERY_LANGUAGE.has(text));
      if (missing.length) {
        fail(`public/i18n/${lang}.js is missing translations for the guide "${name}":\n  - ${missing.join('\n  - ')}`);
      }
      document.documentElement.setAttribute('data-prerendered', lang);
    }

    // Section links (menu, footer, article) go to the home page in this language. Done after
    // translating, because translated paragraphs with links replace the English ones.
    for (const a of document.querySelectorAll('a[data-view-link]')) {
      const view = a.getAttribute('data-view-link');
      a.setAttribute('href', `${prefix}/${view === 'home' ? '' : '#' + view}`);
    }
    for (const a of document.querySelectorAll('a[data-guide-link]')) {
      a.setAttribute('href', `${prefix}${a.getAttribute('href')}`);
    }

    // Search and link-preview details for this guide's own address
    document.title = title;
    setContent(document, 'meta[name="description"]', description);
    setContent(document, 'meta[property="og:title"]', title);
    setContent(document, 'meta[property="og:description"]', description);
    setContent(document, 'meta[property="og:url"]', address);
    setContent(document, 'meta[property="og:type"]', 'article');
    setContent(document, 'meta[name="twitter:title"]', title);
    setContent(document, 'meta[name="twitter:description"]', description);
    document.querySelector('link[rel="canonical"]').setAttribute('href', address);
    // "This page in other languages": the same guide in each language
    for (const link of document.querySelectorAll('link[rel="alternate"][hreflang]')) {
      link.setAttribute('href', `${link.getAttribute('href').replace(/\/$/, '')}/guides/${name}/`);
    }
    // What the page is, for search engines
    const ld = document.querySelector('script[type="application/ld+json"]');
    if (!ld) fail('index.html needs its <script type="application/ld+json"> block');
    ld.textContent = JSON.stringify({
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: textOf(document.getElementById('guide-title') || document.querySelector('main h1')),
      description,
      inLanguage: lang,
      dateModified: GUIDE_DATE,
      mainEntityOfPage: address,
      author: { '@type': 'Organization', name: 'Love RCFE', url: `${SITE}/` },
      publisher: { '@type': 'Organization', name: 'Love RCFE', url: `${SITE}/` },
    });

    const outDir = path.join(PUBLIC, ...(lang === 'en' ? [] : [lang]), 'guides', name);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'index.html'), dom.serialize());
    window.close();
    guidePages++;
  }
}
if (guideNames.length) {
  console.log(`build-pages: wrote ${guidePages} guide pages (${guideNames.join(', ')}; public/guides/ and public/<code>/guides/)`);
}
