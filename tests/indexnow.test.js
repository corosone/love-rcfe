// Tests for telling search engines about new and changed pages (IndexNow; scripts/indexnow.js and
// .github/workflows/indexnow.yml): the key file, which addresses are sent for which change,
// waiting until the new version is live, and what each IndexNow answer leads to. Nothing is sent
// anywhere: the live site and IndexNow are stand-ins.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { startServer } = require('./helpers/server.js');
const indexnow = require('../scripts/indexnow.js');

const { SITE, HOST, KEY, KEY_LOCATION, ENDPOINT } = indexnow;
const ROOT = path.resolve(__dirname, '..');
const SITEMAP = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
const ALL = indexnow.sitemapAddresses(SITEMAP);
const LANGUAGES = 20;
const GUIDES = fs.readdirSync(path.join(ROOT, 'src', 'guides')).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5));
const send = (files, oldSitemap) => indexnow.addressesToSend(files, SITEMAP, oldSitemap);
const pathOf = (address) => new URL(address).pathname;

// ---------- The key ----------

test('search engine key: a valid key, and public/<key>.txt holds exactly that key', () => {
  assert.match(KEY, /^[A-Za-z0-9-]{8,128}$/, 'IndexNow keys are 8 to 128 letters, numbers or dashes');
  assert.equal(KEY_LOCATION, `${SITE}/${KEY}.txt`);
  const file = path.join(ROOT, 'public', `${KEY}.txt`);
  assert.ok(fs.existsSync(file), `public/${KEY}.txt is missing`);
  assert.equal(fs.readFileSync(file, 'utf8'), KEY, 'the key file must hold only the key');
});

test('search engine key: the site serves the key file as plain text, and robots.txt does not block it', async () => {
  const site = await startServer({ INBOX_PASSWORD: 'test-only', SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789' });
  try {
    const res = await fetch(`${site.origin}/${KEY}.txt`);
    assert.equal(res.status, 200);
    assert.match(res.headers.get('content-type') || '', /^text\/plain/);
    assert.doesNotMatch(res.headers.get('x-robots-tag') || '', /noindex|none/);
    assert.equal(await res.text(), KEY);

    const robots = await (await fetch(`${site.origin}/robots.txt`)).text();
    const blocked = robots.split(/\r?\n/).map((line) => /^Disallow:\s*(\S+)/i.exec(line.trim())).filter(Boolean).map((m) => m[1]);
    assert.ok(blocked.length > 0, 'robots.txt still blocks the private pages');
    for (const rule of blocked) assert.ok(!`/${KEY}.txt`.startsWith(rule), `robots.txt "Disallow: ${rule}" would block the key file`);
  } finally {
    await site.close();
  }
});

// ---------- Which addresses are sent ----------

test('search engines: the sitemap lists every page in every language, all on this site', () => {
  assert.equal(ALL.length, LANGUAGES * (1 + GUIDES.length));
  for (const address of ALL) assert.equal(new URL(address).host, HOST, address);
});

test('search engines: a changed guide sends that guide in all 20 languages, and nothing else', () => {
  for (const guide of GUIDES) {
    const list = send([`src/guides/${guide}.html`]);
    assert.equal(list.length, LANGUAGES, guide);
    for (const address of list) assert.ok(pathOf(address).endsWith(`/guides/${guide}/`), address);
    assert.ok(list.includes(`${SITE}/guides/${guide}/`), `${guide}: English`);
    assert.ok(list.includes(`${SITE}/zh-hant/guides/${guide}/`), `${guide}: Traditional Chinese`);
  }
});

test('search engines: a changed language file sends that language\'s home page and guides only', () => {
  for (const [file, lang] of [['public/i18n/fa.js', 'fa'], ['public/i18n/zh.js', 'zh'], ['public/i18n/zh-hant.js', 'zh-hant']]) {
    const list = send([file]);
    assert.equal(list.length, 1 + GUIDES.length, file);
    assert.ok(list.includes(`${SITE}/${lang}/`), `${file}: the home page`);
    for (const address of list) assert.ok(pathOf(address).startsWith(`/${lang}/`), `${file}: ${address}`);
  }
  // Two changes: both languages, no address twice
  const both = send(['public/i18n/es.js', 'public/i18n/ja.js', 'public/i18n/es.js']);
  assert.equal(both.length, 2 * (1 + GUIDES.length));
  assert.equal(new Set(both).size, both.length);
});

test('search engines: a change to the home page, translator, sitemap or page builder sends every address', () => {
  for (const file of indexnow.EVERY_PAGE_FILES) assert.deepEqual(send([file]), ALL, file);
  assert.deepEqual(send(['public/i18n/fr.js', 'public/index.html']), ALL);
});

test('search engines: changes that do not change what a page says send nothing', () => {
  const files = [
    'public/app.js', 'public/staff.html', 'public/staff.js', 'public/corosone.js', 'public/_headers', 'public/404.html',
    'src/input.css', 'functions/api/leads.js', 'lib/db.js', 'tests/site.test.js', 'package.json',
    '.github/workflows/tests.yml', 'public/i18n/notes.txt', `public/${KEY}.txt`,
  ];
  assert.deepEqual(send(files), []);
});

test('search engines: an address removed from the sitemap is sent too; private pages and other sites never are', () => {
  const add = (xml, address) => xml.replace('</urlset>', `  <url>\n    <loc>${address}</loc>\n  </url>\n</urlset>`);
  const gone = `${SITE}/guides/an-old-guide/`;
  let oldSitemap = add(SITEMAP, gone);
  oldSitemap = add(oldSitemap, 'https://example.com/elsewhere/');
  assert.deepEqual(send(['public/sitemap.xml'], oldSitemap), [...ALL, gone]);

  // Whatever changes, only this site's public pages are ever sent
  const everything = send([...indexnow.EVERY_PAGE_FILES, 'public/i18n/es.js', `src/guides/${GUIDES[0]}.html`], oldSitemap);
  for (const address of everything) {
    assert.equal(new URL(address).host, HOST, address);
    assert.doesNotMatch(pathOf(address), /^\/(staff|corosone|api)/, address);
  }
});

// ---------- The workflow and the build ----------

test('search engines: the workflow watches the same files as the script, runs only for main, and needs no secrets', () => {
  const yml = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'indexnow.yml'), 'utf8');
  const block = /\n {4}paths:\n((?: {6}- .*\n|\s*#.*\n)+)/.exec(yml);
  assert.ok(block, 'the workflow has a "paths" list');
  const watched = [...block[1].matchAll(/- '([^']+)'/g)].map((m) => m[1]);
  assert.deepEqual([...watched].sort(), [...indexnow.WATCHED_PATHS].sort());

  assert.match(yml, /\n {2}push:\n {4}branches: \[main\]\n/);
  assert.match(yml, /\n {2}workflow_dispatch:\n/);
  assert.match(yml, /if: github\.ref == 'refs\/heads\/main'/);
  assert.match(yml, /\npermissions:\n {2}contents: read\n/);
  assert.doesNotMatch(yml, /secrets\./);
  assert.match(yml, /run: node scripts\/indexnow\.js/);
  const actions = [...yml.matchAll(/uses: (\S+)(.*)/g)];
  assert.ok(actions.length > 0);
  for (const [, action, comment] of actions) {
    assert.match(action, /@[0-9a-f]{40}$/, `${action} is pinned to an exact commit fingerprint`);
    assert.match(comment, /# v\d/, `${action} has its version in a comment`);
  }
});

test('search engines: the build writes the live version only when Cloudflare gives it a commit', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'love-rcfe-version-'));
  try {
    const file = path.join(dir, 'version.txt');
    assert.equal(indexnow.writeVersionFile(dir, {}), false);
    assert.equal(indexnow.writeVersionFile(dir, { CF_PAGES_COMMIT_SHA: 'not-a-commit' }), false);
    assert.ok(!fs.existsSync(file), 'nothing is written without a commit');
    const commit = '0123456789abcdef0123456789abcdef01234567';
    assert.equal(indexnow.writeVersionFile(dir, { CF_PAGES_COMMIT_SHA: commit }), true);
    assert.equal(fs.readFileSync(file, 'utf8'), commit + '\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
  const build = fs.readFileSync(path.join(ROOT, 'scripts', 'build-pages.js'), 'utf8');
  assert.match(build, /require\('\.\/indexnow\.js'\)\.writeVersionFile\(PUBLIC\)/, 'scripts/build-pages.js writes the version file');
});

// ---------- Waiting for the live site, and IndexNow's answers ----------

const COMMIT = 'a'.repeat(40);
const OLDER = 'c'.repeat(40);
const LATER = 'b'.repeat(40); // a later version that includes COMMIT
const ADDRESSES = [`${SITE}/`, `${SITE}/es/`];

// A stand-in for the live site and for IndexNow. "versions" are what /version.txt shows on each
// check (the last one repeats); "answers" are IndexNow's answers to each try ('no answer' = it
// does not reply at all).
function standIn({ versions = [COMMIT], keyFile = 200, answers = [200] } = {}) {
  const seen = { versionChecks: 0, posts: [], slept: [], order: [] };
  let clock = 0;
  const deps = {
    now: () => clock,
    sleep: async (ms) => { clock += ms; seen.slept.push(ms); },
    includes: (live, commit) => live === LATER && commit === COMMIT,
    log: () => {},
    fetch: async (url, init = {}) => {
      if (url === `${SITE}/version.txt`) {
        const version = versions[Math.min(seen.versionChecks, versions.length - 1)];
        seen.versionChecks++;
        seen.order.push('version');
        return new Response(version + '\n', { status: 200 });
      }
      if (url === KEY_LOCATION) {
        seen.order.push('key');
        return new Response(keyFile === 200 ? KEY : 'Not found', { status: keyFile });
      }
      if (url === ENDPOINT) {
        const answer = answers[Math.min(seen.posts.length, answers.length - 1)];
        seen.posts.push(init);
        seen.order.push('send');
        if (answer === 'no answer') throw new Error('connection reset');
        return new Response('', { status: answer });
      }
      throw new Error(`unexpected address ${url}`);
    },
  };
  return { deps, seen, clock: () => clock };
}

test('search engines: waits until the new version is live, then sends the list as IndexNow asks', async () => {
  const { deps, seen } = standIn({ versions: [OLDER, OLDER, COMMIT], answers: [202] });
  const outcome = await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps);
  assert.equal(outcome.result, 'sent');
  assert.equal(outcome.status, 202);
  assert.deepEqual(seen.order, ['version', 'version', 'version', 'key', 'send']);
  assert.equal(seen.posts.length, 1);
  const post = seen.posts[0];
  assert.equal(post.method, 'POST');
  assert.equal(post.headers['content-type'], 'application/json; charset=utf-8');
  assert.deepEqual(JSON.parse(post.body), { host: 'love-rcfe.pages.dev', key: KEY, keyLocation: KEY_LOCATION, urlList: ADDRESSES });
});

test('search engines: a later live version that includes this change counts as live', async () => {
  const { deps, seen } = standIn({ versions: [LATER] });
  assert.equal((await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps)).result, 'sent');
  assert.equal(seen.posts.length, 1);
});

test('search engines: if the new version is not live after 10 minutes, nothing is sent and the run fails', async () => {
  const { deps, seen, clock } = standIn({ versions: [OLDER] });
  const outcome = await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps);
  assert.equal(outcome.result, 'failed');
  assert.match(outcome.message, /did not appear on the live site within 10 minutes/);
  assert.equal(seen.posts.length, 0);
  assert.ok(clock() >= 10 * 60 * 1000 && clock() <= 11 * 60 * 1000, `waited ${clock() / 1000} seconds`);
});

test('search engines: if the key file is not on the live site, nothing is sent and the run fails', async () => {
  const { deps, seen } = standIn({ keyFile: 404 });
  const outcome = await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps);
  assert.equal(outcome.result, 'failed');
  assert.match(outcome.message, /key file/);
  assert.equal(seen.posts.length, 0);
});

test('search engines: IndexNow refusing the key or the list (400, 403, 422) fails the run at once', async () => {
  for (const status of [400, 403, 422]) {
    const { deps, seen } = standIn({ answers: [status] });
    const outcome = await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps);
    assert.equal(outcome.result, 'failed', String(status));
    assert.match(outcome.message, new RegExp(`answer ${status}`));
    assert.equal(seen.posts.length, 1, `${status}: not tried again`);
  }
});

test('search engines: IndexNow busy or not answering is tried 3 times, then only a warning', async () => {
  const { deps, seen } = standIn({ answers: [429, 503, 'no answer'] });
  const outcome = await indexnow.tellSearchEngines(ADDRESSES, COMMIT, deps);
  assert.equal(outcome.result, 'not sent');
  assert.equal(seen.posts.length, 3);
  assert.deepEqual(seen.slept, [60 * 1000, 120 * 1000]);
  assert.match(outcome.message, /passing problem/);

  const busyOnce = standIn({ answers: [429, 200] });
  assert.equal((await indexnow.tellSearchEngines(ADDRESSES, COMMIT, busyOnce.deps)).result, 'sent');
  assert.equal(busyOnce.seen.posts.length, 2);
});
