// Browser tests for the public site. A real (headless) Chrome opens the pages from a local
// stand-in for Cloudflare Pages and checks what visitors would see and do.
// Nothing leaves this computer: requests to other websites are blocked or replaced by
// stand-ins, and enquiries go into an in-memory database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const { startServer } = require('./helpers/server.js');

const LANGS = ['en', 'es', 'zh', 'tl', 'vi', 'ko', 'hy', 'ru', 'ar', 'fa', 'hi', 'pa', 'ja', 'uk', 'he', 'km', 'fr', 'pt'];

// Stand-in for Cloudflare's Turnstile script
const TURNSTILE_STUB = `window.turnstile={_n:0,render:function(el,o){var d=document.createElement('div');d.className='stub-ts';d.textContent='check';el.appendChild(d);return 'w'+(this._n++);},getResponse:function(id){return 'tok-'+id;},reset:function(){window.__resets=(window.__resets||0)+1;}};window.initTurnstile&&window.initTurnstile();`;
// Used in place of the Pexels backup picture, so the tests need no outside website
const BACKUP_PICTURE = require('node:fs').readFileSync(require('node:path').join(__dirname, '..', 'public', 'apple-touch-icon.png'));

let site;
let browser;

before(async () => {
  site = await startServer({ TURNSTILE_SECRET: 'test-turnstile-secret', REQUIRE_TURNSTILE: 'true' });
  browser = await chromium.launch();
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
  assert.deepEqual(fonts, ['dm-sans-v17-italic-latin.woff2', 'dm-sans-v17-latin.woff2', 'fraunces-v38-italic-latin.woff2', 'fraunces-v38-latin.woff2']);
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
  assert.match(csp, /script-src 'self' https:\/\/challenges\.cloudflare\.com https:\/\/static\.cloudflareinsights\.com;/, "scripts only from this site and Cloudflare (no 'unsafe-inline')");
  assert.match(csp, /frame-ancestors 'none'/);
  const font = await fetch(site.origin + '/fonts/dm-sans-v17-latin.woff2');
  assert.equal(font.headers.get('cache-control'), 'public, max-age=31536000, immutable');
});

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
    ['en', { logo: 'Love RCFE. Care & Consulting Home', lang: 'EN Change language', call: 'Call us' }],
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

test('switching language from the menu translates the page and remembers the choice', async () => {
  const { page, context, seen } = await open('/');
  await page.click('#lang-toggle-btn');
  assert.ok(await page.evaluate(() => !document.getElementById('lang-dropdown').classList.contains('hidden')), 'the language menu opens');
  await page.click('#lang-dropdown [data-lang="vi"]');
  await page.waitForFunction(() => document.querySelector('#lang-toggle-btn .lang-current-code').textContent === 'VI');
  assert.equal(await page.evaluate(() => document.documentElement.lang), 'vi');
  assert.notEqual(await page.locator('#hero-title').textContent(), 'A little more clarity. A lot more care.');
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  const fonts = seen.requests.filter((u) => u.includes('/fonts/')).map((u) => u.split('/').pop());
  assert.ok(fonts.some((f) => f.includes('vietnamese')) && fonts.some((f) => f.includes('latin-ext')), 'Vietnamese letters use the extra font files from this site');
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => document.querySelector('#lang-toggle-btn .lang-current-code').textContent === 'VI');
  assert.deepEqual(seen.errors, []);
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

// ---------- Layout ----------

test('the page never slides sideways: every language on phones, tablets and laptops', async () => {
  const problems = [];
  for (const lang of LANGS) {
    const { page, context } = await open(lang === 'en' ? '/' : `/?lang=${lang}`, { width: 320, height: 800 });
    if (lang !== 'en') await page.waitForFunction((code) => document.documentElement.lang === code, lang);
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

  for (const [path, width, fullMenu] of [['/', 390, false], ['/', 900, false], ['/', 1280, true], ['/', 1920, true], ['/?lang=zh', 1024, true], ['/?lang=hy', 1440, false]]) {
    const { context, result } = await state(path, width);
    assert.deepEqual(result, { menu: fullMenu, button: !fullMenu, over: 0 }, `${path} at ${width}px`);
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
