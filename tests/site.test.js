// Browser tests for the public site. A real (headless) Chrome opens the pages from a local
// stand-in for Cloudflare Pages and checks what visitors would see and do.
// Nothing leaves this computer: requests to other websites are blocked or replaced by
// stand-ins, and enquiries go into an in-memory database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers/server.js');

const LANGS = ['en', 'es', 'zh', 'zh-hant', 'tl', 'vi', 'ko', 'hy', 'ru', 'ar', 'fa', 'hi', 'pa', 'ja', 'uk', 'he', 'km', 'th', 'fr', 'pt'];
const RTL = ['ar', 'fa', 'he']; // written from right to left

// Stand-in for Cloudflare's Turnstile script
const TURNSTILE_STUB = `window.turnstile={_n:0,render:function(el,o){var d=document.createElement('div');d.className='stub-ts';d.textContent='check';el.appendChild(d);return 'w'+(this._n++);},getResponse:function(id){return 'tok-'+id;},reset:function(){window.__resets=(window.__resets||0)+1;}};window.initTurnstile&&window.initTurnstile();`;
// Used in place of the Pexels backup picture, so the tests need no outside website
const BACKUP_PICTURE = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'apple-touch-icon.png'));

let site;
let browser;

// Starts the test browser. On GitHub the browser that matches this Playwright version is
// downloaded first (see .github/workflows/tests.yml). Claude's cloud computers come with one
// browser already installed and cannot download another, so when the matching one is missing,
// the installed one is used instead (it only needs to be a recent Chrome).
const INSTALLED_CHROMIUM = '/opt/pw-browsers/chromium';
async function launchBrowser() {
  try {
    return await chromium.launch();
  } catch (err) {
    if (/Executable doesn't exist/.test(String(err?.message)) && require('node:fs').existsSync(INSTALLED_CHROMIUM)) {
      console.log(`The matching test browser is not installed here; using ${INSTALLED_CHROMIUM} instead.`);
      return chromium.launch({ executablePath: INSTALLED_CHROMIUM });
    }
    throw err;
  }
}
const STAFF_PASSWORD = 'staff password for site tests';
const DEV_PASSWORD = 'developer password for site tests';

before(async () => {
  site = await startServer({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    REQUIRE_TURNSTILE: 'true',
    // For the staff inbox and developer console tests at the end of this file
    INBOX_PASSWORD: STAFF_PASSWORD,
    SESSION_SECRET: 'site-test-session-secret-0123456789abcdef0123',
    DEV_EMAIL: 'owner@example.com',
    DEV_PASSWORD: DEV_PASSWORD,
    RESEND_API_KEY: 're_test_key',
  });
  browser = await launchBrowser();
});

after(async () => {
  await browser.close();
  await site.close();
});

// Opens a page with outside requests under control. "turnstile" is 'stub' (default),
// 'block', or a function that decides per request.
async function open(pathAndQuery, { width = 1280, height = 900, scale = 1, turnstile = 'stub', dark = false, setup, wait = 'networkidle' } = {}) {
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale, colorScheme: dark ? 'dark' : 'light' });
  const page = await context.newPage();
  const seen = { requests: [], errors: [] };
  page.on('request', (r) => seen.requests.push(r.url()));
  page.on('console', (m) => { if (m.type() === 'error') seen.errors.push(m.text()); });
  page.on('pageerror', (e) => seen.errors.push('page error: ' + e.message));
  await context.route('**/*', (route) => {
    const url = route.request().url();
    if (url.startsWith(site.origin)) return route.continue();
    if (url.startsWith('https://challenges.cloudflare.com/')) {
      const mode = typeof turnstile === 'function' ? turnstile() : turnstile;
      if (mode === 'stub') return route.fulfill({ contentType: 'application/javascript', body: TURNSTILE_STUB });
      return route.abort();
    }
    if (url.startsWith('https://images.pexels.com/')) return route.fulfill({ contentType: 'image/png', body: BACKUP_PICTURE });
    // The address-lookup services used by /device-report.js once someone uses a form
    if (/^https:\/\/(ipv4\.icanhazip\.com|api\.ipify\.org)\//.test(url)) return route.fulfill({ contentType: 'text/plain', body: '73.15.20.1' });
    if (/^https:\/\/(ipv6\.icanhazip\.com|api6\.ipify\.org)\//.test(url)) return route.fulfill({ contentType: 'text/plain', body: '2603:8001:9a00:1cc6::42' });
    return route.abort();
  });
  if (setup) await setup(page, context);
  await page.goto(site.origin + pathAndQuery, { waitUntil: wait });
  return { page, context, seen };
}

const turnstileRequests = (seen) => seen.requests.filter((u) => u.includes('challenges.cloudflare.com'));
const go = async (page, view) => { await page.evaluate((v) => { location.hash = v; }, view); await page.waitForTimeout(250); };

// ---------- Loading ----------

test('home page: fonts come from this site, and nothing is loaded that is not needed', async () => {
  const { page, context, seen } = await open('/');
  await page.evaluate(() => document.fonts.ready);
  assert.ok(!seen.requests.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), 'no request to Google Fonts');
  assert.equal(turnstileRequests(seen).length, 0, 'the spam check is not downloaded on the home page');
  const fonts = seen.requests.filter((u) => u.includes('/fonts/')).map((u) => u.split('/').pop()).sort();
  assert.deepEqual(fonts, ['dm-sans-v17-italic-14px-latin.woff2', 'dm-sans-v17-w400-900-latin.woff2', 'fraunces-v38-italic-latin.woff2', 'fraunces-v38-latin.woff2']);
  assert.ok(await page.evaluate(() => document.fonts.check('500 40px Fraunces') && document.fonts.check('italic 400 40px Fraunces') && document.fonts.check('700 16px "DM Sans"') && document.fonts.check('italic 400 14px "DM Sans"')), 'the fonts cover the styles the page uses');
  assert.deepEqual(seen.errors, [], 'no errors in the browser console (this includes security-policy blocks)');
  await context.close();
});

test('home page: search and link-preview tags are in place', async () => {
  const { page, context } = await open('/');
  const tags = await page.evaluate(() => ({
    title: document.title,
    description: document.querySelector('meta[name="description"]')?.content || '',
    canonical: document.querySelector('link[rel="canonical"]')?.href || '',
    ogImage: document.querySelector('meta[property="og:image"]')?.content || '',
    twitterImage: document.querySelector('meta[name="twitter:image"]')?.content || '',
    robots: document.querySelector('meta[name="robots"]')?.content || '',
    ld: document.querySelector('script[type="application/ld+json"]')?.textContent || '',
  }));
  assert.match(tags.title, /Love RCFE/);
  assert.ok(tags.description.length > 50);
  assert.equal(tags.canonical, 'https://love-rcfe.pages.dev/');
  assert.equal(tags.ogImage, 'https://love-rcfe.pages.dev/og-image.jpg');
  assert.equal(tags.twitterImage, tags.ogImage);
  assert.doesNotMatch(tags.robots, /noindex/);
  assert.equal(JSON.parse(tags.ld)['@type'], 'ProfessionalService');
  const image = await page.request.get(site.origin + '/og-image.jpg');
  assert.equal(image.headers()['content-type'], 'image/jpeg');
  assert.deepEqual([...(await image.body()).subarray(0, 3)], [0xff, 0xd8, 0xff], 'the preview picture is a real JPEG');
  await context.close();
});

test('private pages are hidden from search engines and never cached', async () => {
  for (const path of ['/staff', '/corosone']) {
    const res = await fetch(site.origin + path);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('x-robots-tag') || '', /noindex/, `${path} has X-Robots-Tag noindex`);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.match(await res.text(), /<meta name="robots" content="[^"]*noindex/, `${path} has a noindex tag`);
  }
  const robots = await (await fetch(site.origin + '/robots.txt')).text();
  assert.match(robots, /Disallow: \/staff/);
  assert.doesNotMatch(robots, /corosone/, 'robots.txt must not advertise the developer console');
});

test('security headers are sent with every page', async () => {
  const res = await fetch(site.origin + '/');
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  const csp = res.headers.get('content-security-policy') || '';
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /script-src 'self'( 'sha256-[A-Za-z0-9+\/]{43}=')* https:\/\/challenges\.cloudflare\.com https:\/\/static\.cloudflareinsights\.com;/, "scripts only from this site, Cloudflare, and the home page's two fingerprinted inline scripts");
  assert.equal((csp.match(/'sha256-/g) || []).length, 2, 'exactly two inline scripts are allowed');
  assert.doesNotMatch(csp, /unsafe-inline'[^;]*;\s*style-src/, "no 'unsafe-inline' for scripts");
  assert.doesNotMatch(csp, /fonts\.(googleapis|gstatic)\.com/, 'Google Fonts is no longer allowed: every page uses /fonts/');
  assert.match(csp, /frame-ancestors 'none'/);
  const font = await fetch(site.origin + '/fonts/dm-sans-v17-w400-900-latin.woff2');
  assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

test('home page: the two inline scripts run (their fingerprints match the security policy)', async () => {
  const { page, context, seen } = await open('/', { width: 1024 });
  const state = await page.evaluate(() => ({ fit: typeof window.fitHeaderNav, theme: document.querySelector('meta[name="theme-color"]').content }));
  assert.equal(state.fit, 'function', 'the top-bar script ran');
  assert.equal(state.theme, '#315d48', 'the theme set-up script ran');
  assert.deepEqual(seen.errors, [], 'no script was blocked by the security policy');
  assert.ok(!seen.requests.some((u) => /\/(theme-init|nav-fit)\.js/.test(u)), 'no separate download for them');
  await context.close();
});

test('home page: no fade-in on first load, fade-in when moving between pages', async () => {
  const { page, context } = await open('/');
  const first = await page.evaluate(() => [document.documentElement.classList.contains('view-anim'), getComputedStyle(document.getElementById('home')).animationName]);
  assert.deepEqual(first, [false, 'none'], 'the opening text is drawn at once');
  await go(page, 'services');
  const later = await page.evaluate(() => [document.documentElement.classList.contains('view-anim'), getComputedStyle(document.getElementById('services')).animationName]);
  assert.deepEqual(later, [true, 'viewFadeIn']);
  await context.close();
});

for (const path of ['/staff', '/corosone', '/no-such-page']) {
  test(`${path}: fonts come from this site, and headings keep their weight`, async () => {
    const { page, context, seen } = await open(path, { wait: 'load' });
    await page.evaluate(() => document.fonts.ready);
    assert.ok(!seen.requests.some((u) => /fonts\.(googleapis|gstatic)\.com/.test(u)), 'no request to Google Fonts');
    assert.ok(seen.requests.some((u) => u.includes('/fonts/dm-sans-v17-w400-900-latin.woff2')), 'DM Sans from /fonts/');
    const ok = await page.evaluate((p) => {
      const loaded = [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, '') + ' ' + f.weight);
      return { loaded, boldFraunces: p === '/no-such-page' || loaded.includes('Fraunces 300 900') };
    }, path);
    assert.ok(ok.boldFraunces, 'bold and semibold headings use real Fraunces weights: ' + ok.loaded.join(', '));
    assert.deepEqual(seen.errors.filter((e) => /Refused to|page error/.test(e)), [], 'nothing blocked by the security policy, and no script errors');
    await context.close();
  });
}

// ---------- Hero picture ----------

for (const [width, scale, want] of [[412, 1.75, 'hero-640.avif'], [390, 3, 'hero-960.avif'], [1350, 1, 'hero-640.avif'], [1440, 2, 'hero-960.avif'], [768, 3, 'hero.jpg']]) {
  test(`hero picture: a ${width}px wide screen at ${scale}x gets ${want}`, async () => {
    const { page, context } = await open('/', { width, scale, wait: 'load' });
    const got = await page.evaluate(async () => {
      const img = document.querySelector('img[data-fallback-src]');
      await img.decode().catch(() => {});
      return [img.currentSrc.split('/').pop(), img.naturalWidth > 0];
    });
    assert.deepEqual(got, [want, true]);
    await context.close();
  });
}

test('hero picture: if the picture files fail, the backup picture is shown', async () => {
  const { page, context } = await open('/', {
    width: 412, scale: 2,
    setup: (p) => p.route(/\/hero(-\d+)?\.(avif|jpg)$/, (r) => r.abort()),
  });
  await page.waitForFunction(() => { const i = document.querySelector('img[data-fallback-src]'); return i.complete && i.naturalWidth > 0; }, null, { timeout: 10000 });
  const img = await page.evaluate(() => { const i = document.querySelector('img[data-fallback-src]'); return [i.currentSrc.slice(0, 26), i.hasAttribute('srcset')]; });
  assert.deepEqual(img, ['https://images.pexels.com/', false]);
  await context.close();
});

// ---------- Enquiry forms and the spam check ----------

test('spam check: downloaded only when a form is shown, and only once', async () => {
  const { page, context, seen } = await open('/');
  for (const view of ['services', 'tools', 'approach', 'support', 'terms', 'privacy']) await go(page, view);
  assert.equal(turnstileRequests(seen).length, 0, 'not downloaded on pages without a form');

  await go(page, 'contact');
  await page.waitForSelector('#ts-contact .stub-ts');
  assert.equal(turnstileRequests(seen).length, 1);
  assert.match(turnstileRequests(seen)[0], /render=explicit&onload=initTurnstile/);
  assert.equal(await page.locator('#ts-booking .stub-ts').count(), 0, 'the hidden booking popup has no check yet');
  const script = await page.evaluate(() => { const s = document.querySelector('script[src*="turnstile"]'); return [s.crossOrigin, s.referrerPolicy, s.async]; });
  assert.deepEqual(script, ['anonymous', 'no-referrer', true]);

  await go(page, 'home');
  await page.locator('[data-click="openBookingModal()"]').first().click();
  await page.waitForSelector('#ts-booking .stub-ts');
  assert.equal(turnstileRequests(seen).length, 1, 'not downloaded a second time');
  assert.deepEqual(seen.errors, []);
  await context.close();
});

test('spam check: opening the site directly on the Contact page loads it', async () => {
  const { page, context } = await open('/#contact', { width: 412 });
  await page.waitForSelector('#ts-contact .stub-ts');
  await context.close();
});

test('spam check: if it is blocked, a message appears, and coming back tries again', async () => {
  let mode = 'block';
  const { page, context } = await open('/#contact', { turnstile: () => mode });
  await page.waitForSelector('#ts-contact p');
  assert.match(await page.locator('#ts-contact p').first().textContent(), /security check could not load/);
  mode = 'stub';
  await go(page, 'home');
  await go(page, 'contact');
  await page.waitForSelector('#ts-contact .stub-ts');
  assert.equal(await page.locator('#ts-contact p').count(), 0, 'the message is replaced by the check');
  await context.close();
});

test('contact form: a visitor can send an enquiry, and it reaches the database', async () => {
  const before = site.db._rows('SELECT COUNT(*) AS n FROM leads')[0].n;
  const { page, context, seen } = await open('/#contact');
  await page.waitForSelector('#ts-contact .stub-ts');
  await page.fill('#contact [name="name"]', 'Browser Test');
  await page.fill('#contact [name="email"]', 'browser@example.com');
  await page.fill('#contact [name="phone"]', '8185550123');
  await page.fill('#contact [name="message"]', 'Sent by the automated browser test.');
  for (const box of await page.locator('#contact form input[type="checkbox"][required]').all()) await box.check();
  await page.locator('#contact form [type="submit"]').click();
  await page.waitForFunction(() => /Thank you, Browser Test/.test(document.querySelector('#contact form').parentElement.textContent), null, { timeout: 10000 });
  await site.settle();

  const rows = site.db._rows("SELECT * FROM leads WHERE email = 'browser@example.com'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].kind, 'enquiry');
  assert.equal(rows[0].source, 'contact');
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM leads')[0].n, before + 1);
  const check = site.outside.find((c) => c.url.includes('turnstile') && String(c.body?.response ?? c.body).includes('tok-w0'));
  assert.ok(check, 'the token from the check was sent to Cloudflare for verification');
  assert.equal(await page.evaluate(() => window.__resets), 1, 'the check resets after sending');
  assert.deepEqual(seen.errors, []);
  await context.close();
});

test('contact form: the server\'s refusal is shown to the visitor', async () => {
  site.setTurnstilePasses(false);
  const { page, context } = await open('/#contact');
  await page.waitForSelector('#ts-contact .stub-ts');
  await page.fill('#contact [name="name"]', 'Refused Test');
  await page.fill('#contact [name="email"]', 'refused@example.com');
  await page.fill('#contact [name="phone"]', '8185550124');
  await page.fill('#contact [name="message"]', 'This one should be refused.');
  for (const box of await page.locator('#contact form input[type="checkbox"][required]').all()) await box.check();
  await page.locator('#contact form [type="submit"]').click();
  await page.waitForFunction(() => /security check/i.test(document.querySelector('#contact form').parentElement.textContent), null, { timeout: 10000 });
  site.setTurnstilePasses(true);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE email = 'refused@example.com'")[0].n, 0);
  await context.close();
});

test('each page view is reported once to the request log', async () => {
  const { page, context } = await open('/', { setup: (p, c) => c.setExtraHTTPHeaders({ 'x-forwarded-for': '203.0.113.77' }) });
  await page.waitForTimeout(500);
  await site.settle();
  const rows = site.db._rows("SELECT path FROM request_log WHERE ip = '203.0.113.77'");
  assert.equal(rows.length, 1);
  assert.match(rows[0].path, /^\//);
  await context.close();
});

// ---------- Languages ----------

test('names for voice control and screen readers match the visible text (English and Spanish)', async () => {
  for (const [lang, want] of [
    ['en', { logo: 'Love RCFE. Care & Consulting Home', lang: 'EN Change language', call: 'Call Us' }],
    ['es', { logo: 'Love RCFE. Cuidado y Consultoría Inicio', lang: 'ES Cambiar idioma', call: 'Llámenos' }],
  ]) {
    const { page, context } = await open(lang === 'en' ? '/' : `/?lang=${lang}`);
    await page.waitForFunction((code) => document.querySelector('#lang-toggle-btn .lang-current-code').textContent === code, lang.toUpperCase());
    await page.waitForTimeout(200);
    const names = await page.evaluate(() => {
      const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
      const logo = document.querySelector('header a[data-view-link="home"]');
      const call = document.querySelector('a[data-call].fixed');
      return {
        logo: text(logo), lang: text(document.getElementById('lang-toggle-btn')), langMobile: text(document.getElementById('lang-toggle-btn-mobile')), call: text(call),
        labels: [logo, document.getElementById('lang-toggle-btn'), document.getElementById('lang-toggle-btn-mobile'), call].map((el) => el.getAttribute('aria-label')),
      };
    });
    assert.equal(names.logo, want.logo);
    assert.equal(names.lang, want.lang);
    assert.equal(names.langMobile, want.lang);
    assert.equal(names.call, want.call);
    assert.deepEqual(names.labels, [null, null, null, null], 'no separate spoken label that could differ from the text');
    await context.close();
  }
});

test('"page not found" page: names for voice control and screen readers match the visible text', async () => {
  const { page, context } = await open('/no-such-page', { wait: 'load' });
  const names = await page.evaluate(() => {
    const text = (el) => el.textContent.replace(/\s+/g, ' ').trim();
    const logo = document.querySelector('header a[href="/#home"]');
    const lang = document.getElementById('lang-toggle-btn');
    return { logo: text(logo), lang: text(lang), labels: [logo.getAttribute('aria-label'), lang.getAttribute('aria-label')] };
  });
  assert.equal(names.logo, 'Love RCFE. Care & Consulting');
  assert.equal(names.lang, 'EN Change language');
  assert.deepEqual(names.labels, [null, null], 'no separate spoken label that could differ from the text');
  await context.close();
});

test('headings go down one level at a time in every section (screen readers use them to find their way)', async () => {
  const { page, context } = await open('/');
  const problems = await page.evaluate(() => {
    const out = [];
    document.querySelectorAll('section.view').forEach((view) => {
      let last = 0;
      view.querySelectorAll('h1, h2, h3, h4, h5, h6').forEach((h) => {
        const level = Number(h.tagName[1]);
        if (level > last + 1) out.push(`#${view.id}: <${h.tagName.toLowerCase()}> "${h.textContent.trim().slice(0, 40)}" comes after <h${last}>`);
        last = level;
      });
    });
    return out;
  });
  assert.deepEqual(problems, []);
  await context.close();
});

test('switching language from the menu goes to that language\'s own address and remembers the choice', async () => {
  const { page, context, seen } = await open('/#services');
  await page.click('#lang-toggle-btn');
  assert.ok(await page.evaluate(() => !document.getElementById('lang-dropdown').classList.contains('hidden')), 'the language menu opens');
  await page.click('#lang-dropdown [data-lang="vi"]');
  await page.waitForURL(site.origin + '/vi/#services');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'vi');
  assert.equal(await page.locator('#lang-toggle-btn .lang-current-code').textContent(), 'VI');
  assert.equal(await page.evaluate(() => localStorage.getItem('lovercfe_lang')), 'vi');
  assert.ok(await page.evaluate(() => !document.getElementById('services').hidden), 'the visitor stays on the same section');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const fonts = seen.requests.filter((u) => u.includes('/fonts/')).map((u) => u.split('/').pop());
  assert.ok(fonts.some((f) => f.includes('vietnamese')) && fonts.some((f) => f.includes('latin-ext')), 'Vietnamese letters use the extra font files from this site');

  // From one language to another, and back to English
  // (whichever language button the top bar is showing: French uses the compact bar at this width)
  await page.locator('[data-lang-toggle]:visible').first().click();
  await page.locator('.lang-dropdown:not(.hidden) [data-lang="fr"]').click();
  await page.waitForURL(site.origin + '/fr/#services');
  await page.waitForLoadState('networkidle');
  await page.locator('[data-lang-toggle]:visible').first().click();
  await page.locator('.lang-dropdown:not(.hidden) [data-lang="en"]').click();
  await page.waitForURL(site.origin + '/#services');
  await page.waitForLoadState('networkidle');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'en');
  assert.equal(await page.locator('#hero-title').textContent().then((t) => t.replace(/\s+/g, ' ').trim()), 'A little more clarity. A lot more care.');
  assert.deepEqual(seen.errors, []);
  await context.close();
});

test('every language has its own ready-translated page that search engines can read', async () => {
  const englishHtml = await (await fetch(site.origin + '/')).text();
  const englishTitle = englishHtml.match(/<title>([^<]*)<\/title>/)[1];
  assert.equal((englishHtml.match(/<link rel="alternate" hreflang=/g) || []).length, LANGS.length + 1, 'every language, plus the default');
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const res = await fetch(`${site.origin}/${lang}/`);
    assert.equal(res.status, 200, `/${lang}/ exists`);
    const html = await res.text(); // the page exactly as a search engine receives it, before any script runs
    assert.match(html, new RegExp(`<html lang="${lang}"[^>]* data-prerendered="${lang}"`), `${lang}: marked with its language`);
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    assert.ok(title.startsWith('Love RCFE | ') && title !== englishTitle, `${lang}: translated title`);
    assert.ok(html.includes(`<link rel="canonical" href="https://love-rcfe.pages.dev/${lang}/">`), `${lang}: canonical address`);
    assert.ok(html.includes(`<meta property="og:url" content="https://love-rcfe.pages.dev/${lang}/">`));
    assert.equal((html.match(/<link rel="alternate" hreflang=/g) || []).length, LANGS.length + 1, `${lang}: lists all language addresses`);
    assert.ok(!html.includes('A little more clarity.'), `${lang}: the main heading is not English`);
    assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html), `${lang}: may be listed`);
    const description = html.match(/<meta name="description" content="([^"]*)"/)[1];
    assert.ok(description.length > 40 && !description.startsWith('Personalized placement guidance'), `${lang}: translated description`);
  }
  const sitemap = await (await fetch(site.origin + '/sitemap.xml')).text();
  assert.equal((sitemap.match(/<loc>/g) || []).length, 2 * LANGS.length, 'a home page and a copy of the family guide in every language');
  for (const lang of LANGS.filter((l) => l !== 'en')) assert.ok(sitemap.includes(`<loc>https://love-rcfe.pages.dev/${lang}/</loc>`));
});

// ---------- Family guide (src/guides/choosing-a-care-home.html, built by scripts/build-pages.js) ----------

const GUIDE = '/guides/choosing-a-care-home/';
const GUIDE_TITLE = 'How to Choose the Right Care Home for Your Parent | Love RCFE';
const guideAddress = (lang) => (lang === 'en' ? '' : `/${lang}`) + GUIDE;

test('family guide: its own ready-translated page in every language, listed for search engines', async () => {
  for (const lang of LANGS) {
    const res = await fetch(site.origin + guideAddress(lang));
    assert.equal(res.status, 200, `${lang}: the guide exists`);
    const html = await res.text(); // as a search engine receives it, before any script runs
    const title = html.match(/<title>([^<]*)<\/title>/)[1];
    if (lang === 'en') assert.equal(title, GUIDE_TITLE);
    else {
      assert.match(html, new RegExp(`<html lang="${lang}"[^>]* dir="${RTL.includes(lang) ? 'rtl' : 'ltr'}"[^>]* data-prerendered="${lang}"`), `${lang}: language and direction`);
      assert.ok(title !== GUIDE_TITLE && title.endsWith('| Love RCFE'), `${lang}: translated title`);
      assert.ok(!html.includes('How to Choose the Right Care Home for Your Parent<'), `${lang}: the heading is not English`);
    }
    assert.ok(html.includes(`<link rel="canonical" href="https://love-rcfe.pages.dev${guideAddress(lang)}">`), `${lang}: its own address`);
    const others = html.match(/<link rel="alternate" hreflang="[^"]+" href="([^"]+)">/g) || [];
    assert.equal(others.length, LANGS.length + 1, `${lang}: lists the guide in every language`);
    assert.ok(others.every((l) => l.includes(GUIDE)), `${lang}: those addresses are the guide's, not the home page's`);
    assert.match(html, /"@type":"Article"/, `${lang}: described to search engines as an article`);
    assert.ok(html.includes('<main id="main-content" class="flex-1" data-guide="choosing-a-care-home">'), `${lang}: marked as a guide page`);
    assert.ok(!/<meta name="robots" content="[^"]*noindex/.test(html), `${lang}: may be listed`);
    // Facts that must survive every translation
    for (const fact of ['1-800-231-4024', 'Care Facility Search', 'https://www.ccld.dss.ca.gov/carefacilitysearch/', 'Medi-Cal']) {
      assert.ok(html.includes(fact), `${lang}: keeps "${fact}"`);
    }
    assert.ok(lang === 'fa' ? html.includes('۹۰') : /\b90\b/.test(html), `${lang}: keeps the 90-day notice`);
  }
  const sitemap = await (await fetch(site.origin + '/sitemap.xml')).text();
  for (const lang of LANGS) assert.ok(sitemap.includes(`<loc>https://love-rcfe.pages.dev${guideAddress(lang)}</loc>`), `${lang}: in the sitemap`);
  // The home page links to the guide in the same language
  assert.match(await (await fetch(site.origin + '/')).text(), /<a data-guide-link href="\/guides\/choosing-a-care-home\/"/);
  assert.match(await (await fetch(site.origin + '/es/')).text(), /<a data-guide-link="" href="\/es\/guides\/choosing-a-care-home\/"/);
});

test('family guide: menus and links lead back to the site in the same language, and the language menu keeps you on the guide', async () => {
  let { page, context, seen } = await open(GUIDE, { width: 1280, height: 900 });
  assert.deepEqual(seen.errors, [], 'no errors in the browser console');
  assert.equal(await page.title(), GUIDE_TITLE, 'the tab shows the guide, not the home page');
  // "Schedule a Call" in the article opens the booking pop-up
  await page.click('main [data-click="openBookingModal()"]');
  assert.equal(await page.isVisible('#booking-modal'), true);
  await page.keyboard.press('Escape');
  // The ombudsman's CRISISline number dials directly (the site's own call card must not take over)
  const dialled = await page.evaluate(() => new Promise((resolve) => {
    const link = document.querySelector('main a[href="tel:+18002314024"]');
    window.addEventListener('click', (e) => { resolve(!e.defaultPrevented); e.preventDefault(); }, { once: true });
    link.click();
  }));
  assert.equal(dialled, true, 'the CRISISline link is left to the phone');
  assert.equal(await page.isVisible('#call-modal'), false);
  // A menu link opens that section on the home page
  await Promise.all([page.waitForURL(site.origin + '/#services'), page.click('#desktop-nav [data-view-link="services"]')]);
  assert.equal(await page.isVisible('#services'), true);
  await context.close();

  // In Spanish: the article's links go to the Spanish home page
  ({ page, context, seen } = await open('/es' + GUIDE, { width: 1280, height: 900 }));
  assert.notEqual(await page.title(), GUIDE_TITLE, 'the tab shows the Spanish title');
  await Promise.all([page.waitForURL(site.origin + '/es/#tools'), page.click('main a[data-view-link="tools"] >> nth=0')]);
  assert.equal(await page.isVisible('#tools'), true);
  // The language menu goes to the same guide in the other language
  await page.goto(site.origin + '/es' + GUIDE);
  await page.click('#lang-toggle-btn');
  await Promise.all([page.waitForURL(site.origin + '/fr' + GUIDE), page.click('#lang-dropdown [data-lang="fr"]')]);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'fr');
  assert.deepEqual(seen.errors, [], 'no errors in the browser console');
  await context.close();
});

test('family guide: a call booked from the guide reaches the inbox, marked as coming from the guide', async () => {
  const { page, context, seen } = await open('/es' + GUIDE, { width: 1280, height: 900 });
  await page.click('main [data-click="openBookingModal()"]');
  await page.waitForSelector('#ts-booking .stub-ts');
  await page.fill('#book-name', 'Guía Prueba');
  await page.fill('#book-phone', '8185550142');
  await page.fill('#book-email', 'guia@example.com');
  const date = await page.evaluate(() => document.getElementById('book-date').min);
  await page.fill('#book-date', date);
  await page.selectOption('#book-time', { index: 1 });
  for (const box of await page.locator('#booking-form input[type="checkbox"][required]').all()) await box.check();
  await page.locator('#booking-form [type="submit"]').click();
  for (let i = 0; i < 50 && !site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE email = 'guia@example.com'")[0].n; i++) await page.waitForTimeout(100);
  await site.settle();
  const rows = site.db._rows("SELECT kind, source FROM leads WHERE email = 'guia@example.com'");
  assert.deepEqual(rows, [{ kind: 'call_request', source: 'guide' }]);
  assert.deepEqual(seen.errors.filter((e) => /page error/.test(e)), [], 'no script errors');
  await context.close();
});

test('family guide: never slides sideways, and reads right to left in Arabic, Persian and Hebrew', async () => {
  const problems = [];
  for (const lang of LANGS) {
    const { page, context } = await open(guideAddress(lang), { width: 320, height: 800 });
    for (const width of [320, 390, 768, 1280]) {
      await page.setViewportSize({ width, height: 800 });
      await page.waitForTimeout(60);
      const r = await page.evaluate(() => ({
        over: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        dir: document.documentElement.dir,
        h1: getComputedStyle(document.querySelector('main h1')).direction,
      }));
      if (r.over > 0) problems.push(`${lang} ${width}px: ${r.over}px too wide`);
      const want = RTL.includes(lang) ? 'rtl' : 'ltr';
      if (r.dir !== want || r.h1 !== want) problems.push(`${lang}: reads ${r.h1}, expected ${want}`);
    }
    await context.close();
  }
  assert.deepEqual(problems, []);
});

test('a language page shows its language from the first moment and its tools are translated too', async () => {
  const { page, context, seen } = await open('/es/', {
    // Slow the language file down: the page text must already be Spanish without it
    setup: (p) => p.route('**/i18n/es.js', async (route) => { await new Promise((r) => setTimeout(r, 800)); route.continue(); }),
    wait: 'domcontentloaded',
  });
  const early = await page.evaluate(() => ({
    hidden: document.documentElement.classList.contains('i18n-pending'),
    heading: document.getElementById('hero-title').textContent.replace(/\s+/g, ' ').trim(),
    code: document.querySelector('#lang-toggle-btn .lang-current-code').textContent,
  }));
  assert.equal(early.hidden, false, 'the page is not hidden while the language file loads');
  assert.notEqual(early.heading, 'A little more clarity. A lot more care.');
  assert.equal(early.code, 'ES');

  await page.waitForLoadState('networkidle');
  assert.match(await page.title(), /Asesoría/, 'the tab title is Spanish');
  await page.evaluate(() => { location.hash = 'tools'; });
  await page.waitForTimeout(400);
  const toolsText = await page.locator('#tools').textContent();
  assert.doesNotMatch(toolsText, /Estimated Monthly|Monthly Total|Select a /, 'text built by scripts is translated as well');
  assert.equal(seen.requests.filter((u) => u.endsWith('/i18n/es.js')).length, 1, 'the language file is downloaded once');
  assert.deepEqual(seen.errors, []);
  await context.close();
});

test('the address decides the language, and the old ways of choosing one still work', async () => {
  // A visitor whose saved language is French opens the Spanish address: Spanish wins
  const a = await open('/es/', { setup: (p) => p.addInitScript(() => { try { localStorage.setItem('lovercfe_lang', 'fr'); } catch (e) {} }) });
  assert.equal(await a.page.evaluate(() => document.documentElement.lang), 'es');
  assert.equal(await a.page.locator('#lang-toggle-btn .lang-current-code').textContent(), 'ES');
  await a.context.close();

  // The plain address with a saved language translates in place, as before
  const b = await open('/', { setup: (p) => p.addInitScript(() => { try { localStorage.setItem('lovercfe_lang', 'fr'); } catch (e) {} }) });
  await b.page.waitForFunction(() => document.querySelector('#lang-toggle-btn .lang-current-code').textContent === 'FR');
  assert.notEqual((await b.page.locator('#hero-title').textContent()).replace(/\s+/g, ' ').trim(), 'A little more clarity. A lot more care.');
  await b.context.close();

  // Old links with ?lang= still work, and the choice is remembered on the next page
  const c = await open('/?lang=ko');
  await c.page.waitForFunction(() => document.documentElement.lang === 'ko');
  await c.page.goto(site.origin + '/guides/choosing-a-care-home/', { waitUntil: 'load' });
  await c.page.waitForFunction(() => document.documentElement.lang === 'ko');
  await c.context.close();
});

test('an enquiry can be sent from a language page', async () => {
  const { page, context } = await open('/es/#contact');
  await page.waitForSelector('#ts-contact .stub-ts');
  await page.fill('#contact [name="name"]', 'Prueba Navegador');
  await page.fill('#contact [name="email"]', 'prueba@example.com');
  await page.fill('#contact [name="phone"]', '8185550125');
  await page.fill('#contact [name="message"]', 'Enviado por la prueba automática.');
  for (const box of await page.locator('#contact form input[type="checkbox"][required]').all()) await box.check();
  await page.locator('#contact form [type="submit"]').click();
  await page.waitForFunction(() => /Prueba Navegador/.test(document.querySelector('#contact form').parentElement.textContent), null, { timeout: 10000 });
  await site.settle();
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE email = 'prueba@example.com'")[0].n, 1);
  await context.close();
});

test('every language file loads and translates the main heading', async () => {
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    const { page, context, seen } = await open(`/?lang=${lang}`, { wait: 'load' });
    await page.waitForFunction(() => document.querySelector('#hero-title').textContent.replace(/\s+/g, ' ').trim() !== 'A little more clarity. A lot more care.', null, { timeout: 10000 }).catch(() => {});
    const heading = (await page.locator('#hero-title').textContent()).replace(/\s+/g, ' ').trim();
    assert.notEqual(heading, 'A little more clarity. A lot more care.', `${lang}: the heading is translated`);
    assert.equal(await page.evaluate(() => document.documentElement.lang), lang);
    assert.deepEqual(seen.errors, [], `${lang}: no errors`);
    await context.close();
  }
});

test('every language file has every piece of text; Traditional Chinese uses traditional characters and Thai is written in Thai', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const box = { window: {} };
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    new Function('window', fs.readFileSync(path.join(__dirname, '..', 'public', 'i18n', `${lang}.js`), 'utf8'))(box.window);
  }
  const data = box.window.LoveI18nData;
  const ref = data.es;
  for (const lang of LANGS.filter((l) => l !== 'en')) {
    assert.deepEqual(Object.keys(data[lang].dict).sort(), Object.keys(ref.dict).sort(), `${lang}: the same texts as every other language`);
    assert.deepEqual(Object.keys(data[lang].blocks).sort(), Object.keys(ref.blocks).sort(), `${lang}: the same paragraphs as every other language`);
  }
  // Characters only used in simplified Chinese (each has a different traditional form)
  const SIMPLIFIED = /[们这为来时说对会发过还现学实点问长门开关见东车钱让给经结题间业务员电话码语书写读听买卖级际难预约护疗医药机构费双岁亲爱乐欢设计规则场乡络视频软讯择应该报据号单园区县网标选两状检录证记忆认识验总统转换环变运动负担损坏帮协调节组织类龄伤险补贴账银从众与专个产权处办归带领导觉简讲谈论诉诊断续饮饭馆汤热风灵况态势头须虑围劳线终丰义厅厨厕卫阳龙凤鸟马驾驶锁钥键谁请谢议词译训练红绿紧纸细继营编缓响项额顾领频鸡黄齐龟么师历无仅价适]/;
  const values = (lang) => [...Object.values(data[lang].dict), ...Object.values(data[lang].blocks)].map((v) => v.replace(/<[^>]*>/g, ''));
  assert.ok(values('zh').some((v) => SIMPLIFIED.test(v)), 'the check itself works: it finds the simplified characters in the other Chinese file');
  const simplified = values('zh-hant').filter((v) => SIMPLIFIED.test(v));
  assert.deepEqual(simplified, [], 'no simplified characters in Traditional Chinese');
  const notThai = Object.entries(data.th.dict).filter(([en, v]) => !/[\u0E00-\u0E7F]/.test(v) && v !== en);
  assert.deepEqual(notThai, [], 'every Thai text is written in Thai (or kept as it is, like the phone number)');
});

test('the language menu offers both Chinese scripts and Thai, each at its own address', async () => {
  const { page, context, seen } = await open('/zh/', { width: 1280, height: 900 });
  await page.click('#lang-toggle-btn');
  const options = await page.$$eval('#lang-dropdown .lang-option', (els) => els.map((e) => e.textContent.replace(/\s+/g, ' ').trim()));
  assert.ok(options.includes('简体中文 Chinese (Simplified)') && options.includes('繁體中文 Chinese (Traditional)') && options.includes('ไทย Thai'), options.join(' | '));
  await Promise.all([page.waitForURL(site.origin + '/zh-hant/'), page.click('#lang-dropdown [data-lang="zh-hant"]')]);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'zh-hant');
  assert.equal((await page.textContent('#lang-toggle-btn .lang-current-code')).trim(), '繁中');
  assert.match(await page.textContent('#hero-title'), /多一份清晰指引/);
  await page.click('#lang-toggle-btn');
  await Promise.all([page.waitForURL(site.origin + '/th/'), page.click('#lang-dropdown [data-lang="th"]')]);
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'th');
  assert.equal((await page.textContent('#lang-toggle-btn .lang-current-code')).trim(), 'TH');
  // The guide in Traditional Chinese, from the home page link
  await page.goto(site.origin + '/zh-hant/', { waitUntil: 'load' });
  await Promise.all([page.waitForURL(site.origin + '/zh-hant' + GUIDE), page.click('footer a[data-guide-link]')]);
  assert.match(await page.title(), /^如何為父母選擇合適的照護之家/);
  assert.deepEqual(seen.errors, [], 'no errors in the browser console');
  await context.close();
});

// ---------- Layout ----------

test('the page never slides sideways: every language on phones, tablets and laptops', async () => {
  const problems = [];
  for (const lang of LANGS) {
    const { page, context } = await open(lang === 'en' ? '/' : `/${lang}/`, { width: 320, height: 800 });
    await page.waitForTimeout(200);
    for (const width of [320, 390, 768, 1024]) {
      await page.setViewportSize({ width, height: 800 });
      for (const view of ['home', 'tools', 'contact']) {
        await page.evaluate((v) => { location.hash = v; }, view);
        await page.waitForTimeout(80);
        const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        if (over > 0) problems.push(`${lang} ${width}px ${view}: ${over}px too wide`);
      }
    }
    await context.close();
  }
  assert.deepEqual(problems, []);
});

test('Arabic, Persian and Hebrew pages read right to left; every other language left to right', async () => {
  for (const lang of LANGS) {
    const path = lang === 'en' ? '/' : `/${lang}/`;
    const want = RTL.includes(lang) ? 'rtl' : 'ltr';
    // In the ready-made page itself (so the very first picture on screen is the right way round)
    if (lang !== 'en') {
      const html = await (await fetch(site.origin + path)).text();
      assert.match(html, new RegExp(`<html[^>]* dir="${want}"`), `${lang}: ready-made page`);
    }
    // And once the page has loaded
    const { page, context } = await open(path, { width: 390, height: 800 });
    assert.equal(await page.evaluate(() => document.documentElement.dir), want, `${lang}: after loading`);
    await context.close();
  }
});

test('right-to-left pages are a mirror image: menu, text, arrows, logo, phone numbers, floating buttons, language menu, pop-ups', async () => {
  for (const lang of RTL) {
    // Computer: logo and the first menu item on the right, text starting on the right, arrows flipped
    let { page, context } = await open(`/${lang}/`, { width: 1280, height: 900 });
    const desk = await page.evaluate(() => {
      const W = innerWidth;
      const box = (el) => el.getBoundingClientRect();
      const logo = document.querySelector('header a[href="#home"], header [data-view-link="home"]') ;
      const links = [...document.querySelectorAll('#desktop-nav a[data-view-link]')];
      const h1 = document.querySelector('#home h1');
      const arrows = [...document.querySelectorAll('#home svg.lucide-arrow-right')];
      const name = document.querySelector('header span[dir="ltr"]');
      const dot = name && name.querySelector('span');
      return {
        logoRight: box(logo).left > W / 2,
        firstLinkRightOfLast: box(links[0]).left > box(links[links.length - 1]).left,
        h1Direction: getComputedStyle(h1).direction,
        h1Align: getComputedStyle(h1).textAlign,
        arrowsFlipped: arrows.length > 0 && arrows.every((a) => getComputedStyle(a).scale === '-1 1'),
        nameText: name && name.textContent,
        dotAtEnd: !!dot && box(dot).left > box(name).left + box(name).width / 2,
        phoneReadsLeftToRight: [...document.querySelectorAll('a[href^="tel:"]:not(.fixed)')].every((a) => getComputedStyle(a).direction === 'ltr'),
      };
    });
    assert.deepEqual(desk, {
      logoRight: true, firstLinkRightOfLast: true, h1Direction: 'rtl', h1Align: 'start', arrowsFlipped: true,
      nameText: 'Love RCFE.', dotAtEnd: true, phoneReadsLeftToRight: true,
    }, `${lang} on a computer`);
    // Pop-ups: the close button is in the top left corner
    for (const fn of ['openCallModal', 'openBookingModal', 'openCareQuizModal']) {
      await page.evaluate((f) => window[f](), fn);
      await page.waitForTimeout(150);
      const leftCorner = await page.evaluate(() => {
        const m = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.classList.contains('hidden'));
        const card = m.firstElementChild.getBoundingClientRect();
        const x = m.querySelector('button[data-click^="close"]').getBoundingClientRect();
        return x.left - card.left < card.right - x.right;
      });
      assert.ok(leftCorner, `${lang} ${fn}: close button in the left corner`);
      await page.keyboard.press('Escape');
    }
    await context.close();

    // Phone: "Call Us" on the right, "Back to top" on the left, not overlapping; language menu on screen
    ({ page, context } = await open(`/${lang}/`, { width: 320, height: 640 }));
    await page.evaluate(() => scrollTo(0, document.body.scrollHeight));
    await page.waitForTimeout(400);
    const phone = await page.evaluate(() => {
      const W = innerWidth;
      const c = document.querySelector('a[data-call].fixed').getBoundingClientRect();
      const t = document.getElementById('back-to-top').getBoundingClientRect();
      return { callOnRight: W - c.right < c.left, topOnLeft: t.left < W - t.right, overlap: c.left < t.right && t.left < c.right && c.top < t.bottom && t.top < c.bottom };
    });
    assert.deepEqual(phone, { callOnRight: true, topOnLeft: true, overlap: false }, `${lang} floating buttons`);
    await page.evaluate(() => scrollTo(0, 0));
    await page.click('#lang-toggle-btn-mobile');
    await page.waitForTimeout(200);
    const menu = await page.evaluate(() => { const r = document.getElementById('lang-dropdown-mobile').getBoundingClientRect(); return { left: r.left, right: r.right, W: innerWidth }; });
    assert.ok(menu.left >= 0 && menu.right <= menu.W, `${lang}: language menu stays on screen (${Math.round(menu.left)}..${Math.round(menu.right)} of ${menu.W})`);
    await context.close();
  }

  // English is unchanged: left to right, arrows not flipped
  const { page, context } = await open('/', { width: 1280, height: 900 });
  assert.deepEqual(await page.evaluate(() => ({
    dir: document.documentElement.dir,
    arrows: [...document.querySelectorAll('#home svg.lucide-arrow-right')].map((a) => getComputedStyle(a).scale),
  })), { dir: 'ltr', arrows: ['none'] });
  await context.close();
});

test('right-to-left pages: English-only names and labels keep their punctuation where it belongs ("Elena K.", not ".Elena K")', async () => {
  const atRisk = [];
  for (const lang of RTL) {
    const { page, context } = await open(`/${lang}/`, { width: 1280, height: 900 });
    for (const view of ['home', 'services', 'tools', 'approach', 'support', 'contact', 'terms', 'privacy']) {
      await go(page, view);
      const found = await page.evaluate(() => {
        // Text with no Arabic/Hebrew letters, standing alone in its box, with punctuation at an edge,
        // is shown in the wrong order on a right-to-left page unless it is marked left to right.
        const RTL_CHARS = /[֐-ࣿיִ-﷿ﹰ-﻿]/;
        const EDGE = /^[.,:;!?()\[\]"'“”‘’\/\-–—+%#&*]|[.,:;!?()\[\]"'“”‘’\/\-–—+%#&*]$/;
        const out = [];
        const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
        for (let n = walker.nextNode(); n; n = walker.nextNode()) {
          const el = n.parentElement;
          const t = n.textContent.trim();
          if (!el || !t || RTL_CHARS.test(t) || !/[A-Za-z]/.test(t)) continue;
          const box = el.closest('p, h1, h2, h3, h4, li, label, button, a, span, div, td') || el;
          if (RTL_CHARS.test(box.textContent) || !EDGE.test(box.textContent.trim())) continue;
          if (el.closest('[dir="ltr"], .lang-dropdown, #neon-calculator-widget, script, style, svg, .sr-only, [hidden]')) continue;
          if (getComputedStyle(el).direction === 'ltr' || !el.getBoundingClientRect().width) continue;
          out.push(`"${t.slice(0, 40)}"`);
        }
        return out;
      });
      for (const f of found) atRisk.push(`${lang} #${view}: ${f}`);
    }
    await context.close();
  }
  assert.deepEqual(atRisk, []);
});

test('pop-ups: the close button never covers the title, in every language on a small phone', async () => {
  const covered = [];
  for (const lang of LANGS) {
    const { page, context } = await open(lang === 'en' ? '/' : `/${lang}/`, { width: 320, height: 700 });
    for (const fn of ['openCallModal', 'openBookingModal', 'openCareQuizModal']) {
      await page.evaluate((f) => window[f](), fn);
      await page.waitForTimeout(100);
      const hit = await page.evaluate(() => {
        const m = [...document.querySelectorAll('[role="dialog"]')].find((d) => !d.classList.contains('hidden'));
        const x = m.querySelector('button[data-click^="close"]').getBoundingClientRect();
        const range = document.createRange();
        range.selectNodeContents(m.querySelector('h2, h3'));
        return [...range.getClientRects()].some((r) => r.width > 0 && r.left < x.right && x.left < r.right && r.top < x.bottom && x.top < r.bottom);
      });
      if (hit) covered.push(`${lang} ${fn}`);
      await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
    }
    await context.close();
  }
  assert.deepEqual(covered, []);
});

test('top bar: shows the full menu when it fits and the menu button when it does not', async () => {
  const state = async (path, width) => {
    const { page, context } = await open(path, { width, height: 800 });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(400);
    const result = await page.evaluate(() => {
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      return { menu: shown('desktop-nav'), button: shown('mobile-controls'), over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    return { page, context, result };
  };

  for (const [path, width, fullMenu] of [['/', 390, false], ['/', 900, false], ['/', 1024, true], ['/', 1280, true], ['/', 1920, true], ['/zh/', 1024, true], ['/hy/', 1280, true], ['/hy/', 1024, false]]) {
    const { page, context, result } = await state(path, width);
    assert.deepEqual(result, { menu: fullMenu, button: !fullMenu, over: 0 }, `${path} at ${width}px`);
    if (fullMenu) {
      assert.ok(await page.evaluate(() => getComputedStyle(document.querySelector('#desktop-nav .nav-new')).display !== 'none'), `${path} at ${width}px: the "New" badge shows next to Care Tools`);
    }
    await context.close();
  }

  // On a tablet the menu button opens the menu, a link works, and widening the window brings the full menu back
  const { page, context } = await state('/', 900);
  await page.click('#mobile-menu-btn');
  assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('mobile-menu')).display !== 'none'), 'the menu opens');
  await page.click('#mobile-menu a[data-view-link="services"]');
  await page.waitForTimeout(300);
  assert.equal(await page.evaluate(() => location.hash), '#services');
  await page.setViewportSize({ width: 1300, height: 800 });
  await page.waitForTimeout(300);
  assert.ok(await page.evaluate(() => getComputedStyle(document.getElementById('desktop-nav')).display !== 'none'), 'the full menu returns on a wide window');
  await context.close();
});

test('top bar: every language keeps the full menu on a computer, with its "New" badge, without overlaps or words split in the middle', async () => {
  const problems = [];
  const { page, context } = await open('/', { width: 1280, height: 800 });
  for (const lang of LANGS) {
    await page.goto(site.origin + (lang === 'en' ? '/' : `/${lang}/`), { waitUntil: 'load' });
    await page.evaluate(() => document.fonts.ready);
    await page.waitForTimeout(150);
    const r = await page.evaluate(() => {
      const shown = (id) => getComputedStyle(document.getElementById(id)).display !== 'none';
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      const box = (el) => el.getBoundingClientRect();
      const logo = box(document.querySelector('header a[data-view-link="home"]'));
      const items = [...document.querySelectorAll('#desktop-nav > *')].map(box);
      // In reading order, each item starts after the one before it ends (and the menu after the logo)
      const edges = [logo, ...items];
      let overlap = false;
      for (let i = 1; i < edges.length; i++) {
        if (rtl ? edges[i].right > edges[i - 1].left + 1 : edges[i].left < edges[i - 1].right - 1) overlap = true;
      }
      // A one-word item never takes two lines (that would mean the word was split)
      const split = [...document.querySelectorAll('#desktop-nav a[data-view-link]')].filter((a) => {
        const words = a.textContent.trim().split(/\s+/).filter(Boolean);
        const lineHeight = parseFloat(getComputedStyle(a).lineHeight) || 20;
        const text = [...a.querySelectorAll('span')].find((s) => s.textContent.trim() === a.textContent.trim().split(/\s{2,}/)[0]) || a;
        return words.length === 1 && box(text).height > lineHeight * 1.5;
      }).map((a) => a.textContent.trim());
      const badge = document.querySelector('#desktop-nav .nav-new');
      const badgeShown = getComputedStyle(badge).display !== 'none' && box(badge).width > 0;
      return { menu: shown('desktop-nav'), button: shown('mobile-controls'), badge: badgeShown, overlap, split, over: document.documentElement.scrollWidth - document.documentElement.clientWidth };
    });
    if (!r.menu || r.button || !r.badge || r.overlap || r.split.length || r.over > 0) problems.push(`${lang}: ${JSON.stringify(r)}`);
  }
  await context.close();
  assert.deepEqual(problems, []);
});

test('the small footnote under the testimonials is readable in light and dark mode', async () => {
  for (const dark of [false, true]) {
    const { page, context } = await open('/', { width: 412, dark });
    const result = await page.evaluate(() => {
      const p = [...document.querySelectorAll('p')].find((x) => /Representative composite/.test(x.textContent));
      const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      let bg = null;
      for (let el = p; el && !bg; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (c && !/rgba\(0, 0, 0, 0\)|transparent/.test(c)) bg = c; }
      const a = lum(getComputedStyle(p).color), b = lum(bg);
      return { opacity: getComputedStyle(p).opacity, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
    });
    assert.equal(result.opacity, '1');
    assert.ok(result.ratio >= 4.5, `${dark ? 'dark' : 'light'} mode contrast is ${result.ratio.toFixed(2)}, needs 4.5`);
    await context.close();
  }
});

test('white text on the terracotta buttons and badges is readable in light and dark mode', async () => {
  for (const dark of [false, true]) {
    const { page, context } = await open('/', { dark });
    const result = await page.evaluate(() => {
      const lum = (c) => { const v = c.match(/[\d.]+/g).slice(0, 3).map((x) => { x /= 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); }); return 0.2126 * v[0] + 0.7152 * v[1] + 0.0722 * v[2]; };
      const els = [...document.querySelectorAll('.bg-brand-accent.text-white')];
      const ratios = els.map((el) => { const a = lum(getComputedStyle(el).color), b = lum(getComputedStyle(el).backgroundColor); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); });
      return { count: els.length, worst: Math.min(...ratios) };
    });
    assert.ok(result.count >= 5, 'found the terracotta buttons and badges');
    assert.ok(result.worst >= 4.5, `${dark ? 'dark' : 'light'} mode contrast is ${result.worst.toFixed(2)}, needs 4.5`);
    await context.close();
  }
});

// ---------- Visit log ----------

test('visit log: each section opened from the menu is reported once', async () => {
  const ip = '203.0.113.78';
  const { page, context } = await open('/', { width: 1400, setup: (p, c) => c.setExtraHTTPHeaders({ 'x-forwarded-for': ip }) });
  for (const view of ['services', 'contact', 'contact']) {
    await page.click(`#desktop-nav [data-view-link="${view}"]`);
    await page.waitForTimeout(150);
  }
  await page.goBack(); // the Back button is reported too
  await page.waitForTimeout(300);
  await site.settle();
  const paths = site.db._rows('SELECT path FROM request_log WHERE ip = ? ORDER BY id', ip).map((r) => r.path);
  assert.deepEqual(paths, ['/', '/#services', '/#contact', '/#services']);
  await context.close();
});

// ---------- Sign-in pages ----------

const STUB_LATE = TURNSTILE_STUB + 'window.loveTurnstileReady&&window.loveTurnstileReady();';

test('staff sign-in: the security check still works when Cloudflare\'s script arrives after the 7-second warning', async () => {
  const { page, context } = await open('/staff', {
    wait: 'domcontentloaded',
    setup: (p) => p.route('https://challenges.cloudflare.com/**', async (route) => {
      await new Promise((r) => setTimeout(r, 8500));
      route.fulfill({ contentType: 'application/javascript', body: STUB_LATE });
    }),
  });
  await page.waitForFunction(() => /could not load/.test(document.getElementById('ts-login').textContent), null, { timeout: 9000 });
  await page.waitForFunction(() => window.turnstile, null, { timeout: 5000 });
  assert.doesNotMatch(await page.textContent('#ts-login'), /could not load/, 'the warning goes away once the check has started');
  await page.fill('#inbox-password', STAFF_PASSWORD);
  await page.click('#login-submit');
  await page.waitForSelector('#dashboard-view:not(.hidden)', { timeout: 5000 });
  await context.close();
});

test('staff sign-in: if Cloudflare\'s script never arrives, the page says so instead of waiting forever', async () => {
  const { page, context } = await open('/staff', { turnstile: 'block', wait: 'load' });
  await page.waitForFunction(() => /could not load/.test(document.getElementById('ts-login').textContent), null, { timeout: 9000 });
  await page.fill('#inbox-password', STAFF_PASSWORD);
  await page.click('#login-submit');
  await page.waitForFunction(() => document.getElementById('login-error').textContent.length > 0, null, { timeout: 5000 });
  assert.equal(await page.isVisible('#dashboard-view'), false);
  await context.close();
});

async function staffSignIn(page) {
  await page.fill('#inbox-password', STAFF_PASSWORD);
  await page.click('#login-submit');
  await page.waitForSelector('#dashboard-view:not(.hidden)');
}

test('developer console: a code pasted with a space in it is kept whole', async () => {
  const { page, context } = await open('/corosone', { wait: 'load' });
  // Let the page's own "signed in?" check finish first: when it answers "no", the page shows
  // the sign-in step and empties the code box, which could otherwise wipe what is typed below.
  await page.waitForLoadState('networkidle');
  await page.evaluate(() => document.getElementById('code-view').classList.remove('hidden'));
  for (const pasted of [' 123456', '123 456', '123456 ']) {
    await page.fill('#dev-code', '');
    await page.focus('#dev-code');
    await page.keyboard.insertText(pasted); // what pasting does
    assert.equal(await page.inputValue('#dev-code'), '123456', `pasted ${JSON.stringify(pasted)}`);
  }
  await context.close();
});

test('signing out of the developer console also ends the staff inbox session on the server', async () => {
  const { page, context } = await open('/staff', { wait: 'load' });
  await staffSignIn(page);
  const staffCookie = (await context.cookies()).find((c) => c.name === 'lovercfe_admin').value;

  await page.goto(site.origin + '/corosone', { waitUntil: 'load' });
  site.db._run('DELETE FROM rate_limits');
  await page.fill('#dev-email', 'owner@example.com');
  await page.fill('#dev-password', DEV_PASSWORD);
  await page.click('#login-submit');
  await page.waitForSelector('#code-view:not(.hidden)');
  const mail = site.outside.filter((c) => c.url === 'https://api.resend.com/emails').at(-1);
  await page.fill('#dev-code', /code is: (\d{6})/.exec(JSON.parse(mail.body).text)[1]);
  await page.click('#code-submit');
  await page.waitForSelector('#console-view:not(.hidden)');
  const devCookie = (await context.cookies()).find((c) => c.name === 'lovercfe_dev').value;

  await page.click('#signout-btn');
  await page.waitForSelector('#login-view:not(.hidden)');
  const left = await context.cookies();
  assert.deepEqual(left.map((c) => c.name).filter((n) => !/_trust$/.test(n)), [], 'no sign-in cookies are left in the browser');
  // Only the "trusted device" cookies stay: they never sign anyone in, they only let this
  // browser past the site-wide lockout next time (with the right password).
  assert.deepEqual(left.map((c) => c.name).sort(), ['lovercfe_dev_trust', 'lovercfe_staff_trust']);
  assert.ok(left.every((c) => c.httpOnly && c.sameSite === 'Strict'), 'trusted-device cookies cannot be read by scripts or sent from other sites');
  // Even a copy of the old cookies no longer works
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${staffCookie}` } })).status, 401, 'staff session ended');
  assert.equal((await site.api('/api/dev/overview', { headers: { cookie: `lovercfe_dev=${devCookie}` } })).status, 401, 'developer session ended');
  await context.close();
});

// ---------- Device check, holiday switch, privacy lines ----------

// Stand-ins for the two address-lookup services (ipify / icanhazip)
const LOOKUPS = { 'https://ipv4.icanhazip.com/': '73.15.20.1', 'https://api.ipify.org/': '73.15.20.1', 'https://ipv6.icanhazip.com/': '2603:8001:9a00:1cc6::42', 'https://api6.ipify.org/': '2603:8001:9a00:1cc6::42' };
const answerLookups = (p, seen) => p.route(/icanhazip\.com|ipify\.org/, (route) => {
  if (seen) seen.push(route.request().url());
  route.fulfill({ contentType: 'text/plain', body: LOOKUPS[route.request().url()] || '' });
});

test('device details: gathered only once someone uses a form, sent with the message, never with page visits', async () => {
  const bodies = { leads: [], visit: [] };
  const lookups = [];
  const { page, context, seen } = await open('/#contact', {
    wait: 'load',
    setup: async (p, c) => {
      await c.setExtraHTTPHeaders({ 'x-forwarded-for': '73.15.20.1' }); // a visitor the site sees by their short address
      await answerLookups(p, lookups);
      p.on('request', (r) => {
        if (r.url().endsWith('/api/leads')) bodies.leads.push(JSON.parse(r.postData()));
        if (r.url().endsWith('/api/visit')) bodies.visit.push(JSON.parse(r.postData()));
      });
    },
  });
  await page.waitForTimeout(500);
  assert.equal(lookups.length, 0, 'just opening the contact page asks nobody for the address');
  assert.ok(!seen.requests.some((u) => u.endsWith('/device-report.js')), 'and does not even load the device report');
  await page.fill('#name', 'Device Check');
  await page.fill('#phone', '(818) 555-0177');
  await page.fill('#email', 'device-check@example.com');
  await page.fill('#message', 'Checking the device report is attached.');
  await page.click('#submit-button');
  await page.waitForFunction(() => /Thank you/.test(document.getElementById('form-status').textContent));
  assert.equal(bodies.leads.length, 1);
  const sent = bodies.leads[0];
  assert.match(sent.device, /^[0-9a-f]{64}$/, 'the one-way device check code');
  assert.equal(typeof sent.client, 'object', 'the device report');
  assert.equal(sent.client.screenW, await page.evaluate(() => screen.width));
  assert.equal(sent.client.ipv6, '2603:8001:9a00:1cc6::42', 'the other address, from the lookup services');
  assert.ok(lookups.length >= 2, 'both kinds of address were looked up');
  assert.ok(bodies.visit.length >= 1);
  assert.ok(bodies.visit.every((b) => !('device' in b) && !('client' in b)), 'page visits carry no device details');
  const saved = site.db._rows("SELECT device, device_info, device_type FROM leads WHERE email = 'device-check@example.com'")[0];
  assert.equal(saved.device, sent.device);
  assert.equal(saved.device_type, 'computer');
  const info = JSON.parse(saved.device_info);
  assert.equal(info.reported.screenW, sent.client.screenW);
  assert.equal(info.reported.ipv6, '2603:8001:9a00:1cc6::42', 'the site saw the short address, so the long one is kept');
  assert.deepEqual(seen.errors.filter((e) => /Refused to/.test(e)), [], 'the security policy allows the lookups');
  await context.close();
});

test('device details: the staff inbox only shows phone or computer; the console shows the full report', async () => {
  await ensureTables();
  // A message sent from an iPhone
  const phone = await browser.newContext({ ...require('playwright').devices['iPhone 13'], extraHTTPHeaders: { 'x-forwarded-for': '73.15.20.2' } });
  const pp = await phone.newPage();
  await pp.route('https://challenges.cloudflare.com/**', (r) => r.fulfill({ contentType: 'application/javascript', body: TURNSTILE_STUB }));
  await answerLookups(pp);
  await pp.goto(site.origin + '/#contact', { waitUntil: 'load' });
  await pp.fill('#name', 'Phone Sender');
  await pp.fill('#phone', '(818) 555-0199');
  await pp.fill('#email', 'phone-sender@example.com');
  await pp.fill('#message', 'Sent from my phone.');
  await pp.click('#submit-button');
  await pp.waitForFunction(() => /Thank you/.test(document.getElementById('form-status').textContent));
  await phone.close();
  assert.equal(site.db._rows("SELECT device_type FROM leads WHERE email = 'phone-sender@example.com'")[0].device_type, 'phone');

  // Staff: "Sent from a phone", and nothing else about the device reaches the page
  const staffSide = await open('/staff', { wait: 'load' });
  const leadsJson = [];
  staffSide.page.on('response', async (r) => { if (r.url().includes('/api/admin/leads?')) leadsJson.push(await r.text()); });
  await staffSignIn(staffSide.page);
  const card = staffSide.page.locator('#leads-list article', { has: staffSide.page.locator('h3', { hasText: 'Phone Sender' }) });
  assert.match(await card.textContent(), /Sent from a phone/);
  await staffSide.page.click('#refresh-btn');
  await staffSide.page.waitForTimeout(500);
  assert.ok(leadsJson.length && leadsJson.every((t) => !/device_?info|deviceInfo|screenW|ipv6|"device"/.test(t)), 'staff never receive the device report');
  await staffSide.context.close();

  // Console: the Device button shows the same report as the sign-in email
  const { page, context, seen } = await open('/corosone', { wait: 'load' });
  try {
    await devSignIn(page);
    await page.click('#tab-leads');
    await page.fill('#leads-q', 'phone-sender@example.com');
    await page.click('#leads-search button[type="submit"]');
    await page.waitForFunction(() => /^1 match for/.test(document.getElementById('leads-info').textContent) && /Phone Sender/.test(document.getElementById('leads-body').textContent));
    assert.match(await page.textContent('#leads-body'), /Phone/);
    assert.equal(await page.locator('#leads-body .dv-link', { hasText: 'Show Journey' }).count(), 1, 'the Journey button says what it does');
    await page.click('#leads-body .dv-link:text-is("Show Device")');
    assert.equal(await page.locator('#leads-body .dv-link:text-is("Hide Device")').count(), 1, 'and changes to Hide when open');
    await page.waitForFunction(() => /Short address/.test((document.querySelector('.lead-device-row') || {}).textContent || ''));
    const report = await page.textContent('.lead-device-row');
    await page.click('#leads-body .dv-link:text-is("Show Journey")');
    await page.waitForSelector('#leads-body .dv-link:text-is("Hide Journey")');
    await page.click('#leads-body .dv-link:text-is("Hide Journey")');
    await page.waitForSelector('#leads-body .dv-link:text-is("Show Journey")');
    assert.equal(await page.locator('.journey-row').count(), 0, 'hiding closes the panel');
    // Journey first, then Device: the device row then sits between them, and Hide Journey still works
    await page.click('#leads-body .dv-link:text-is("Hide Device")');
    await page.click('#leads-body .dv-link:text-is("Show Journey")');
    await page.waitForSelector('#leads-body .dv-link:text-is("Hide Journey")');
    await page.click('#leads-body .dv-link:text-is("Show Device")');
    await page.waitForSelector('.lead-device-row');
    await page.click('#leads-body .dv-link:text-is("Hide Journey")');
    await page.waitForSelector('#leads-body .dv-link:text-is("Show Journey")');
    assert.equal(await page.locator('.journey-row').count(), 0, 'the journey closes with the device row in between');
    await page.click('#leads-body .dv-link:text-is("Show Journey")');
    await page.waitForSelector('#leads-body .dv-link:text-is("Hide Journey")');
    assert.equal(await page.locator('.journey-row').count(), 1, 'opening it again shows one journey, not two');
    for (const want of ['Long address (IPv6)', '2603:8001:9a00:1cc6::42', 'Reported by the browser', 'Screen size', 'Device (reported by the browser', 'Browser (from what the browser sent']) {
      assert.ok(report.includes(want), `the report shows ${want}`);
    }
    assert.deepEqual(seen.errors.filter((e) => /Refused to|page error/.test(e)), []);
  } finally {
    await context.close();
  }
});

test('privacy policy: all privacy lines are on the privacy page, short (4 words or fewer), and nowhere else', async () => {
  const { page, context } = await open('/#privacy', { wait: 'load' });
  const lines = await page.$$eval('#privacy li', (xs) => xs.map((x) => x.textContent.trim()));
  assert.deepEqual(lines, [
    'Device checks stop spam.', 'Device details improve security.', 'Visit history improves support.', 'Network details prevent abuse.',
    'Messages are sent securely.', 'Every enquiry stays confidential.', 'Only used to respond.',
    'We never send spam.', 'Family records stay confidential.', 'Keep bank details private.',
  ]);
  for (const l of lines) assert.ok(l.split(/\s+/).length <= 4, l);
  assert.match(await page.textContent('#privacy'), /6\. Keeping Your Information Safe/);
  assert.doesNotMatch(await page.textContent('#privacy'), /Google Fonts/, 'fonts come from this site now');
  assert.match(await page.textContent('#privacy'), /ipify \/ icanhazip \(to look up your device's second internet address when you use our forms\)/);
  // No privacy notes anywhere else: other pages, the booking popup, or the message box hint
  const elsewhere = await page.evaluate(() => {
    const out = [];
    const re = /respect your privacy|kept strictly confidential|no spam|social security|omit medical|SSNs?\b/i;
    document.querySelectorAll('body *:not(script):not(style)').forEach((el) => {
      if (el.closest('#privacy')) return;
      for (const n of el.childNodes) if (n.nodeType === 3 && re.test(n.nodeValue)) out.push(n.nodeValue.trim());
      for (const a of ['placeholder', 'title', 'aria-label']) if (re.test(el.getAttribute(a) || '')) out.push(el.getAttribute(a));
    });
    return out;
  });
  assert.deepEqual(elsewhere, []);
  assert.equal((await page.$$eval('p', (ps) => ps.filter((p) => /Representative composite/.test(p.textContent)).map((p) => p.textContent.trim())))[0], '* Representative composite client experiences.');
  await context.close();
  const es = await open('/es/#privacy', { wait: 'load' });
  const esLines = await es.page.$$eval('#privacy li', (xs) => xs.map((x) => x.textContent.trim()));
  assert.equal(esLines.length, 10);
  assert.match(await es.page.textContent('#privacy'), /ipify \/ icanhazip/, 'the address-lookup services are listed');
  assert.ok(esLines.every((l, i) => l && l !== lines[i]), 'translated on the Spanish page: ' + esLines.join(' | '));
  await es.context.close();
});

test('holiday switch: a break that ends after the usual 3 months still offers a day families can book', async () => {
  await (await import('../lib/db.js')).ensureSchema(site.env.DB); // the tables, also when this test runs on its own
  const { setHoliday, clearHoliday, pacificToday, addDays } = await import('../lib/settings.js');
  const today = pacificToday();
  assert.equal((await setHoliday(site.env, { from: today, to: addDays(today, 100) })).ok, true);
  try {
    const { page, context } = await open('/', { wait: 'load' });
    await page.$$eval('[data-click="openBookingModal()"]', (xs) => xs[0].click());
    await page.waitForFunction(() => !document.getElementById('booking-holiday').classList.contains('hidden'));
    await page.waitForFunction((t) => document.getElementById('book-date').value > t, addDays(today, 100));
    const d = await page.$eval('#book-date', (el) => ({ value: el.value, max: el.max, valid: el.checkValidity() }));
    assert.ok(d.value <= d.max && d.valid, `the suggested first day back (${d.value}) can be chosen (latest ${d.max})`);
    await context.close();
  } finally {
    await clearHoliday(site.env);
  }
});

test('holiday switch: the booking popup and contact page say when we are away, in the visitor\'s language', async () => {
  const { setHoliday, clearHoliday, pacificToday, addDays } = await import('../lib/settings.js');
  const today = pacificToday();
  const to = addDays(today, 6);
  assert.equal((await setHoliday(site.env, { from: today, to })).ok, true);
  try {
    const { page, context } = await open('/#contact', { wait: 'load' });
    await page.waitForFunction(() => !document.getElementById('contact-holiday').classList.contains('hidden'));
    assert.match(await page.textContent('#contact-holiday'), /^We are away until .+\. Messages sent now are answered from .+\.$/);
    await page.$$eval('[data-click="openBookingModal()"]', (xs) => xs[0].click());
    await page.waitForFunction(() => !document.getElementById('booking-holiday').classList.contains('hidden'));
    assert.match(await page.textContent('#booking-holiday'), /^We are away from .+ to .+\. Calls can be booked from .+\.$/);
    const suggested = await page.inputValue('#book-date');
    assert.ok(suggested > to, `the suggested date ${suggested} is after the break`);
    // Choosing a day inside the break is refused before anything is sent
    await page.fill('#book-name', 'Holiday Test');
    await page.fill('#book-phone', '8185550188');
    await page.fill('#book-email', 'holiday@example.com');
    let inside = addDays(today, 2);
    if (new Date(inside + 'T00:00:00Z').getUTCDay() === 0) inside = addDays(today, 3);
    await page.$eval('#book-date', (el, v) => { el.min = ''; el.value = v; }, inside);
    await page.$eval('#booking-form button[type="submit"]', (b) => b.click());
    await page.waitForFunction(() => /away on that date/.test(document.getElementById('booking-status').textContent));
    assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE email = 'holiday@example.com'")[0].n, 0);
    await context.close();

    const es = await open('/es/#contact', { wait: 'load' });
    await es.page.waitForFunction(() => !document.getElementById('contact-holiday').classList.contains('hidden'));
    assert.match(await es.page.textContent('#contact-holiday'), /^Estaremos fuera hasta el /);
    await es.context.close();
  } finally {
    await clearHoliday(site.env);
  }
  const { page, context } = await open('/#contact', { wait: 'load' });
  await page.waitForTimeout(400);
  assert.equal(await page.isVisible('#contact-holiday'), false, 'no note once the switch is off');
  await context.close();
});

// Makes sure the database tables exist (they are created on first use), so a test can add rows directly.
async function ensureTables() {
  await site.api('/api/visit', { method: 'POST', body: { path: '/' }, ip: '203.0.113.200' });
  await site.settle();
}

async function devSignIn(page) {
  await page.goto(site.origin + '/corosone', { waitUntil: 'load' });
  site.db._run('DELETE FROM rate_limits');
  await page.fill('#dev-email', 'owner@example.com');
  await page.fill('#dev-password', DEV_PASSWORD);
  await page.click('#login-submit');
  await page.waitForSelector('#code-view:not(.hidden)');
  const mail = site.outside.filter((c) => c.url === 'https://api.resend.com/emails').at(-1);
  const text = JSON.parse(mail.body).text;
  // The sign-in email still carries the full device report (gathered by /device-report.js)
  assert.match(text, /EVERYTHING KNOWN ABOUT THE DEVICE/);
  assert.match(text, /Screen size: \d+ x \d+/);
  await page.fill('#dev-code', /code is: (\d{6})/.exec(text)[1]);
  await page.click('#code-submit');
  await page.waitForSelector('#console-view:not(.hidden)');
}

test('developer console Tools tab: follow-up, duplicates, holiday switch, IP check, licence lookup and translations', async () => {
  await ensureTables();
  const iso = (h) => new Date(Date.now() - h * 3600000).toISOString();
  const add = (name, email, phone, hours) => site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', ?, ?, ?, 'm', ?, 0)", name, email, phone, iso(hours));
  add('Tools Waiting', 'tools-wait@example.com', '7145550101', 60);
  add('Tools Twin', 'tools-twin@example.com', '7145550202', 40);
  add('Tools Twin', 'TOOLS-TWIN@example.com', '714-555-0202', 30);
  site.setOutsideAnswer((url) => {
    if (url.startsWith('https://rdap.org/ip/')) return Response.json({ name: 'TEST-NET', startAddress: '203.0.113.0', endAddress: '203.0.113.255', port43: 'whois.arin.net', entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Example Hosting LLC']]] }] });
    if (url.includes('torbulkexitlist')) return new Response('185.220.101.1\n');
    if (url.includes('datastore_search_sql')) return Response.json({ success: true, result: { records: [{ facility_number: 198603605, facility_name: 'ARARAT GARDENS', facility_city: 'GLENDALE', facility_zip: '91205', facility_capacity: 175, facility_status: 'LICENSED' }] } });
    if (url.includes('FacilityDetail')) return Response.json({ FacilityDetail: { FACILITYNUMBER: '198603605', FACILITYNAME: 'ARARAT GARDENS', LASTVISITDATE: '9/23/2026', CMPCOUNT: '3', TOTSUBALG: '1', TOTTYPEB: '1' }, TSO: {} });
  });
  const { page, context, seen } = await open('/corosone', { wait: 'load' });
  page.on('dialog', (d) => d.accept());
  try {
    await devSignIn(page);
    await page.click('#tab-tools');
    await page.waitForFunction(() => /waited more than a day/.test(document.getElementById('followup-summary').textContent));
    assert.ok((await page.textContent('#followup-body')).includes('Tools Waiting'));

    await page.click('#dupes-btn');
    await page.waitForFunction(() => document.querySelectorAll('#dupes-list .dv-group').length > 0);
    const twinGroup = page.locator('#dupes-list .dv-group', { hasText: 'Tools Twin' });
    await twinGroup.locator('button', { hasText: 'Mark as Duplicate of' }).click();
    await page.waitForFunction(() => /marked as a duplicate/.test(document.getElementById('tool-status').textContent));
    assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE email = 'TOOLS-TWIN@example.com' AND duplicate_of > 0 AND handled = 1")[0].n, 1);

    const { pacificToday, addDays, clearHoliday } = await import('../lib/settings.js');
    await page.fill('#holiday-from', addDays(pacificToday(), 20));
    await page.fill('#holiday-to', addDays(pacificToday(), 25));
    await page.click('#holiday-save');
    await page.waitForFunction(() => /A break is set from/.test(document.getElementById('holiday-state').textContent));
    await page.click('#holiday-clear');
    await page.waitForFunction(() => /No break is set/.test(document.getElementById('holiday-state').textContent));
    await clearHoliday(site.env);

    await page.fill('#iptool-ip', '203.0.113.9');
    await page.click('#iptool-btn');
    await page.waitForFunction(() => /Example Hosting LLC/.test(document.getElementById('iptool-result').textContent));
    assert.match(await page.textContent('#iptool-result'), /Likely VPN or server/);

    await page.fill('#licence-q', 'ararat');
    await page.click('#licence-btn');
    await page.waitForFunction(() => /1 care home found/.test(document.getElementById('licence-info').textContent));
    await page.click('#licence-body button');
    await page.waitForFunction(() => /1 substantiated/.test((document.querySelector('.licence-detail') || {}).textContent || ''));

    await page.click('#i18ncheck-btn');
    await page.waitForFunction(() => /pieces of text/.test(document.getElementById('i18ncheck-summary').textContent), null, { timeout: 15000 });
    assert.match(await page.textContent('#i18ncheck-summary'), /^All \d+ pieces of text are translated in every language that loaded\.$/);
    assert.deepEqual(seen.errors.filter((e) => /Refused to|page error/.test(e)), [], 'nothing blocked by the security policy, no script errors');
  } finally {
    site.setOutsideAnswer(null);
    await context.close();
  }
});

test('staff inbox: "Waiting" and "Possible duplicate" labels', async () => {
  await ensureTables();
  const iso = (h) => new Date(Date.now() - h * 3600000).toISOString();
  site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Label Waiting', 'label-wait@example.com', '6265550303', 'm', ?, 0)", iso(75));
  site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Label Twin A', 'twin-a@example.com', '6265550404', 'm', ?, 0)", iso(2));
  site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Label Twin B', 'twin-b@example.com', '(626) 555-0404', 'm', ?, 0)", iso(1));
  const { page, context } = await open('/staff', { wait: 'load' });
  await staffSignIn(page);
  const card = (name) => page.locator('#leads-list article', { has: page.locator('h3', { hasText: name }) });
  assert.match(await card('Label Waiting').textContent(), /Waiting 3 days/);
  assert.doesNotMatch(await card('Label Twin A').textContent(), /Waiting \d+ day/, 'only 2 hours old');
  assert.match(await card('Label Twin A').textContent(), /Possible duplicate/);
  assert.match(await card('Label Twin B').textContent(), /Possible duplicate/);
  // Moving it on (calling them) clears the alarm
  await card('Label Waiting').locator('select[data-action="stage"]').selectOption('called');
  await page.waitForFunction(() => ![...document.querySelectorAll('#leads-list article')].some((a) => /Label Waiting/.test(a.textContent) && /Waiting 3 days/.test(a.textContent)));
  await context.close();
});

// Last on purpose: it adds 505 messages to the test database.
test('staff inbox: with more than 500 messages, the counts and the "Open" list still include older ones not yet handled', async () => {
  const old = new Date(Date.now() - 40 * 86400000).toISOString();
  for (let i = 0; i < 5; i++) {
    site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES (?, 'x', ?, 'old@example.com', '8185550100', 'm', ?, 0)", i === 0 ? 'call_request' : 'enquiry', `Old Waiting ${i}`, old);
  }
  const recent = new Date().toISOString();
  for (let i = 0; i < 500; i++) {
    site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Recent Handled', 'r@example.com', '8185550100', 'm', ?, 1)", recent);
  }
  const real = site.db._rows("SELECT COUNT(*) AS total, SUM(handled = 0) AS open, SUM(handled = 1) AS handled, SUM(handled = 0 AND kind = 'call_request') AS calls FROM leads")[0];

  const { page, context } = await open('/staff', { wait: 'load' });
  await staffSignIn(page);
  const stats = async () => page.evaluate(() => ['stat-open', 'stat-calls', 'stat-handled', 'stat-total'].map((id) => Number(document.getElementById(id).textContent)));
  assert.deepEqual(await stats(), [real.open, real.calls, real.handled, real.total]);
  assert.equal(await page.title(), `(${real.open}) Staff Inbox | Love RCFE`);
  // The "Open" list (shown first) has every message not yet handled, newest first
  const names = await page.$$eval('#leads-list article h3', (hs) => hs.map((h) => h.textContent));
  assert.equal(names.length, real.open);
  assert.deepEqual(names.filter((n) => n.startsWith('Old Waiting')).length, 5);
  const dates = await page.$$eval('#leads-list article .text-right > span', (xs) => xs.map((x) => Date.parse(x.textContent)));
  assert.deepEqual(dates, [...dates].sort((a, b) => b - a), 'newest first');

  // Marking one handled and deleting one keep the numbers right without a reload
  page.on('dialog', (d) => d.accept());
  await page.click('#leads-list article:has(h3:text-is("Old Waiting 1")) [data-action="toggle-handled"]');
  await page.waitForFunction((n) => document.getElementById('stat-open').textContent === String(n), real.open - 1);
  assert.deepEqual(await stats(), [real.open - 1, real.calls, real.handled + 1, real.total]);
  await page.click('#leads-list article:has(h3:text-is("Old Waiting 0")) [data-action="delete"]');
  await page.waitForFunction((n) => document.getElementById('stat-open').textContent === String(n), real.open - 2);
  assert.deepEqual(await stats(), [real.open - 2, real.calls - 1, real.handled + 1, real.total - 1]);
  await context.close();
});

test('staff accounts and Recently Deleted, end to end: console creates an account, the person signs in, changes their password, and a deleted message is put back', async () => {
  await ensureTables();
  site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Bin Family', 'bin@example.com', '8185550177', 'Please call about my aunt.', ?, 0)", new Date().toISOString());

  // The developer creates an account; the made-up password is shown once
  const dev = await open('/corosone', { wait: 'load' });
  dev.page.on('dialog', (d) => d.accept());
  await devSignIn(dev.page);
  await dev.page.click('#tab-security');
  await dev.page.fill('#staff-add-name', 'Rosa Diaz');
  await dev.page.click('#staff-add-btn');
  await dev.page.waitForSelector('#staff-new-password:not(.hidden)');
  const shown = await dev.page.textContent('#staff-new-password');
  const password = /([a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4})/.exec(shown)[1];
  await dev.page.waitForSelector('#staff-body span:text-is("Rosa Diaz")');
  assert.match(await dev.page.textContent('#shared-state'), /^On:/);
  assert.match(await dev.page.textContent('#trusted-state'), /^Trusted devices: [1-9]\d* developer browsers?/);

  // Rosa signs in with her name, sees who she is, and changes her password
  const staff = await open('/staff', { wait: 'load' });
  staff.page.on('dialog', (d) => d.accept());
  await staff.page.fill('#inbox-name', 'Rosa Diaz');
  await staff.page.fill('#inbox-password', password);
  await staff.page.click('#login-submit');
  await staff.page.waitForSelector('#dashboard-view:not(.hidden)');
  assert.equal(await staff.page.textContent('#whoami'), 'Signed in as Rosa Diaz');
  assert.ok(await staff.page.isVisible('#change-pw-btn'));
  await staff.page.click('#change-pw-btn');
  // A wrong current password is shown in the form; she stays in the inbox
  await staff.page.fill('#change-pw-current', 'not my password');
  await staff.page.fill('#change-pw-new', 'quiet-harbor-lantern-42');
  await staff.page.fill('#change-pw-again', 'quiet-harbor-lantern-42');
  await staff.page.click('#change-pw-save');
  await staff.page.waitForFunction(() => /not right/.test(document.getElementById('change-pw-status').textContent));
  assert.ok(await staff.page.isVisible('#dashboard-view'), 'still in the inbox, not sent back to the sign-in page');
  await staff.page.fill('#change-pw-current', password);
  await staff.page.fill('#change-pw-new', 'quiet-harbor-lantern-42');
  await staff.page.fill('#change-pw-again', 'quiet-harbor-lantern-42');
  await staff.page.click('#change-pw-save');
  await staff.page.waitForFunction(() => /changed/.test(document.getElementById('change-pw-status').textContent));

  // She moves an enquiry on: the inbox says she did it
  await staff.page.selectOption('#leads-list article:has(h3:text-is("Bin Family")) select[data-action="stage"]', 'called');
  await staff.page.waitForSelector('#leads-list article:has(h3:text-is("Bin Family")) :text("Last changed by")');
  assert.match(await staff.page.textContent('#leads-list article:has(h3:text-is("Bin Family"))'), /Last changed by\s+Rosa Diaz/);

  // ...then deletes it
  await staff.page.click('#leads-list article:has(h3:text-is("Bin Family")) [data-action="delete"]');
  await staff.page.waitForFunction(() => ![...document.querySelectorAll('#leads-list article h3')].some((h) => h.textContent === 'Bin Family'));

  // The developer sees it in Recently Deleted and puts it back
  await dev.page.click('#tab-leads');
  await dev.page.click('#deleted-load');
  await dev.page.waitForSelector('#deleted-body td:text-is("Rosa Diaz")');
  const row = dev.page.locator('#deleted-body tr', { hasText: 'Bin Family' });
  await row.locator('button', { hasText: 'Put Back' }).click();
  await dev.page.waitForFunction(() => /Put back 1 enquiry/.test(document.getElementById('tool-status').textContent));
  assert.equal(site.db._rows("SELECT stage, updated_by FROM leads WHERE name = 'Bin Family'")[0].updated_by, 'Rosa Diaz');
  assert.equal(site.db._rows("SELECT stage FROM leads WHERE name = 'Bin Family'")[0].stage, 'called', 'it comes back as it was');

  // The shared password sign-in screen still works with the name left blank
  site.db._run('DELETE FROM rate_limits');
  const shared = await open('/staff', { wait: 'load' });
  await staffSignIn(shared.page);
  assert.equal(await shared.page.textContent('#whoami'), 'Signed in with the shared password');
  assert.ok(!(await shared.page.isVisible('#change-pw-btn')), 'no Change Password button for the shared password');

  for (const s of [dev, staff, shared]) {
    // (A 401 reply is expected: each page first asks whether it is already signed in.)
    const errors = s.seen.errors.filter((e) => !/status of 401/.test(e));
    assert.deepEqual(errors, [], 'no errors in the browser: ' + JSON.stringify(errors));
    await s.context.close();
  }
});
