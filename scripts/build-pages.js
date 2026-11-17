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
// Runs on Cloudflare at deploy time as part of "npm run build". The generated folders are
// not stored in the repository (see .gitignore).
'use strict';

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

  const outDir = path.join(PUBLIC, lang);
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, 'index.html'), dom.serialize());
  window.close();
  built++;
}

console.log(`build-pages: wrote ${built} language pages (public/<code>/index.html)`);
