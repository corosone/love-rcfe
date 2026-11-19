// Tells search engines which pages of the site are new or changed, through IndexNow
// (https://www.indexnow.org). IndexNow passes the list on to Bing, Yahoo (which uses Bing),
// Naver, Yandex, Seznam and others, so they visit the new version sooner. Google does not use
// IndexNow; it reads public/sitemap.xml through Google Search Console instead.
//
// Runs on GitHub's computers after each change to the site's pages
// (.github/workflows/indexnow.yml), never on Cloudflare and never in a visitor's browser. It:
//   1. works out which addresses changed (see addressesToSend below),
//   2. waits until Cloudflare has published the new version: the build writes the version's
//      commit fingerprint to /version.txt (writeVersionFile below), and this waits until the live
//      site shows it, for at most 10 minutes,
//   3. checks that the key file is on the live site, and
//   4. sends the list to IndexNow.
//
// The key below is meant to be public. Search engines compare it with the key file
// public/<key>.txt, to make sure the list really comes from whoever runs this site. Changing the
// key means renaming that file and changing what is in it (a test checks they match).
//
// Nothing here needs a password or secret.
'use strict';

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SITE = 'https://love-rcfe.pages.dev';
const HOST = new URL(SITE).host;
const KEY = '4d3b8d9e267abef1bc73a279d2d1e664';
const KEY_LOCATION = `${SITE}/${KEY}.txt`;
const ENDPOINT = 'https://api.indexnow.org/indexnow';
const ROOT = path.join(__dirname, '..');

// A change to one of these files can change every page: the language pages are built from the
// home page with the translator, the guides are built from the home page's header and footer,
// and the sitemap lists every address.
const EVERY_PAGE_FILES = ['public/index.html', 'public/i18n.js', 'public/sitemap.xml', 'scripts/build-pages.js'];
// The files the workflow watches. Its "paths" list must be the same (a test checks).
const WATCHED_PATHS = [...EVERY_PAGE_FILES, 'public/i18n/**', 'src/guides/**'];

const WAIT_FOR_LIVE_MS = 10 * 60 * 1000; // give up if the new version is not live after 10 minutes
const CHECK_EVERY_MS = 20 * 1000;
const TRIES = 3; // tries when IndexNow is busy or does not answer
const RETRY_WAIT_MS = 60 * 1000; // 1 minute after the first try, 2 after the second

// What each IndexNow answer means (from the IndexNow documentation)
const MEANING = {
  200: 'OK, the addresses were received',
  202: 'accepted; the key is still being checked, which is normal the first few times',
  400: 'bad request: the list was not in the right format',
  403: 'key not valid: the key file was not found on the site, or does not hold the key',
  422: 'some addresses do not belong to this site, or the key file is in the wrong place',
  429: 'too many requests: IndexNow asked us to slow down',
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isCommit = (text) => /^[0-9a-f]{40}$/.test(text || '');

// Called by scripts/build-pages.js. Cloudflare tells its build which commit it is building
// (CF_PAGES_COMMIT_SHA); writing it to /version.txt lets this job see when the new version is
// live. Builds elsewhere (a computer, the GitHub tests) have no such commit and write nothing.
function writeVersionFile(publicDir, env = process.env) {
  const commit = env.CF_PAGES_COMMIT_SHA;
  if (!isCommit(commit)) return false;
  fs.writeFileSync(path.join(publicDir, 'version.txt'), commit + '\n');
  return true;
}

// The addresses listed in a sitemap.xml, in order
function sitemapAddresses(xml) {
  return [...new Set([...String(xml).matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)].map((m) => m[1]))];
}

// Which addresses to tell search engines about, from the list of files a change touched:
//   public/index.html, public/i18n.js, public/sitemap.xml, scripts/build-pages.js: every page
//   src/guides/<name>.html: that guide, in every language
//   public/i18n/<code>.js: every page in that language (its home page and its guides)
//   anything else (styles, scripts, server code, tests): nothing
// Only addresses in the sitemap are ever sent, so private pages (/staff and the like) never are.
// The one exception is an address that this change removed from the sitemap: search engines are
// told about that too, so they notice the page has gone.
function addressesToSend(changedFiles, sitemapXml, oldSitemapXml = sitemapXml) {
  const current = sitemapAddresses(sitemapXml);
  const removed = sitemapAddresses(oldSitemapXml).filter((a) => !current.includes(a));
  const pathOf = (address) => new URL(address).pathname;
  const wanted = new Set(removed);
  for (const file of changedFiles) {
    let match;
    if (EVERY_PAGE_FILES.includes(file)) {
      current.forEach((a) => wanted.add(a));
    } else if ((match = /^src\/guides\/([a-z0-9-]+)\.html$/.exec(file))) {
      const guide = new RegExp(`^(/[a-z]{2}(-[a-z]{4})?)?/guides/${match[1]}/$`);
      current.filter((a) => guide.test(pathOf(a))).forEach((a) => wanted.add(a));
    } else if ((match = /^public\/i18n\/([a-z]{2}(?:-[a-z]{4})?)\.js$/.exec(file))) {
      current.filter((a) => pathOf(a).startsWith(`/${match[1]}/`)).forEach((a) => wanted.add(a));
    }
  }
  return [...current, ...removed].filter((a) => wanted.has(a) && new URL(a).host === HOST);
}

async function getText(url, fetchImpl) {
  try {
    const res = await fetchImpl(url, { headers: { 'cache-control': 'no-cache' }, signal: AbortSignal.timeout(30000) });
    return { status: res.status, text: await res.text() };
  } catch (err) {
    return { status: 0, text: String((err && err.message) || err) };
  }
}

const describe = (status, reply) => (status
  ? `answer ${status}${MEANING[status] ? ` (${MEANING[status]})` : ''}${reply ? `: ${reply}` : ''}`
  : `no answer (${reply})`);

// Waits until the live site shows this commit, or a later one that includes it.
async function waitForLive(commit, deps) {
  const giveUpAt = deps.now() + WAIT_FOR_LIVE_MS;
  for (;;) {
    const answer = await getText(`${SITE}/version.txt`, deps.fetch);
    const live = answer.status === 200 && isCommit(answer.text.trim()) ? answer.text.trim() : '';
    if (live && (live === commit || deps.includes(live, commit))) return { ok: true, live };
    if (deps.now() >= giveUpAt) return { ok: false, live };
    await deps.sleep(CHECK_EVERY_MS);
  }
}

// Waits for the live site, checks the key file, sends the list. The answer's "result" is
//   'sent':     IndexNow took the list;
//   'not sent': IndexNow was busy or did not answer, 3 times (a passing problem on their side);
//   'failed':   a problem on our side that needs looking at.
async function tellSearchEngines(addresses, commit, deps) {
  const shown = await waitForLive(commit, deps);
  if (!shown.ok) {
    return {
      result: 'failed',
      message: `The new version (${commit.slice(0, 7)}) did not appear on the live site within 10 minutes `
        + `(the live site shows ${shown.live ? shown.live.slice(0, 7) : 'no version number'}), so search engines were not told. `
        + 'Check the deploy in Cloudflare. Once the site is live, open this run on GitHub and press "Re-run jobs".',
    };
  }
  deps.log(`The new version is live (${shown.live.slice(0, 7)}).`);

  const keyFile = await getText(KEY_LOCATION, deps.fetch);
  if (keyFile.status !== 200 || keyFile.text.trim() !== KEY) {
    return {
      result: 'failed',
      message: `The key file ${KEY_LOCATION} is not on the live site (${describe(keyFile.status, '')}), `
        + 'so IndexNow would refuse the list. It must stay in public/ and hold only the key.',
    };
  }

  const body = JSON.stringify({ host: HOST, key: KEY, keyLocation: KEY_LOCATION, urlList: addresses });
  let last = '';
  for (let attempt = 1; attempt <= TRIES; attempt++) {
    let status = 0;
    let reply = '';
    try {
      const res = await deps.fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body,
        signal: AbortSignal.timeout(60000),
      });
      status = res.status;
      reply = (await res.text()).trim().slice(0, 300);
    } catch (err) {
      reply = String((err && err.message) || err);
    }
    last = describe(status, reply);
    if (status === 200 || status === 202) {
      return { result: 'sent', status, message: `IndexNow took the list of ${addresses.length} addresses: ${last}.` };
    }
    if (status >= 400 && status < 500 && status !== 429) {
      return { result: 'failed', status, message: `IndexNow refused the list: ${last}.` };
    }
    if (attempt < TRIES) {
      deps.log(`Try ${attempt} of ${TRIES}: ${last}. Trying again in ${attempt} minute${attempt > 1 ? 's' : ''}.`);
      await deps.sleep(RETRY_WAIT_MS * attempt);
    }
  }
  return {
    result: 'not sent',
    message: `IndexNow did not take the list after ${TRIES} tries (last: ${last}). This is usually a passing `
      + 'problem on their side. Search engines will still find the changes through the sitemap, and the next '
      + 'change will be sent as usual.',
  };
}

// ---------- Run on GitHub ----------

function git(...args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
}
function gitWorks(...args) {
  try {
    git(...args);
    return true;
  } catch {
    return false;
  }
}

// Is "commit" part of "live" (the same commit, or an earlier one that "live" builds on)?
function liveIncludes(live, commit) {
  if (!gitWorks('cat-file', '-e', `${live}^{commit}`)) gitWorks('fetch', '--quiet', '--no-tags', 'origin', 'main');
  return gitWorks('merge-base', '--is-ancestor', commit, live);
}

async function main() {
  const env = process.env;
  const commit = env.GITHUB_SHA;
  const before = env.BEFORE || '';
  const summaryLines = [];
  const summary = (line) => summaryLines.push(line);
  if (!isCommit(commit)) throw new Error('GITHUB_SHA is missing: this runs on GitHub (.github/workflows/indexnow.yml)');

  const sitemap = fs.readFileSync(path.join(ROOT, 'public', 'sitemap.xml'), 'utf8');
  let addresses;
  if (env.GITHUB_EVENT_NAME === 'push' && isCommit(before) && !/^0+$/.test(before) && gitWorks('cat-file', '-e', `${before}^{commit}`)) {
    const files = git('diff', '--name-only', '--no-renames', before, commit).split('\n').filter(Boolean);
    let oldSitemap = sitemap;
    try {
      oldSitemap = git('show', `${before}:public/sitemap.xml`);
    } catch { /* no sitemap before: nothing was removed */ }
    addresses = addressesToSend(files, sitemap, oldSitemap);
    console.log(`This change touched ${files.length} file(s):\n  ${files.join('\n  ')}`);
  } else {
    addresses = sitemapAddresses(sitemap).filter((a) => new URL(a).host === HOST);
    console.log('Started by hand (or the earlier version is unknown): sending every address in the sitemap.');
  }

  summary('### Tell search engines about changes (IndexNow)');
  summary('');
  if (!addresses.length) {
    console.log('None of the changed files changes what a page says, so there is nothing to send.');
    summary('Nothing to send: this change does not change what any page says.');
    return finish(summaryLines, 0);
  }
  console.log(`Addresses to send (${addresses.length}):\n  ${addresses.join('\n  ')}`);

  const outcome = await tellSearchEngines(addresses, commit, {
    fetch: globalThis.fetch, sleep, now: Date.now, includes: liveIncludes, log: (line) => console.log(line),
  });
  const label = { sent: 'Sent', 'not sent': 'Not sent (a passing problem; no action needed)', failed: '**Failed**' }[outcome.result];
  summary(`| Result | ${label} |`);
  summary('|---|---|');
  summary(`| Details | ${outcome.message} |`);
  summary('');
  summary(`<details><summary>The ${addresses.length} addresses</summary>\n\n${addresses.map((a) => `- ${a}`).join('\n')}\n\n</details>`);
  if (outcome.result === 'sent') console.log(outcome.message);
  if (outcome.result === 'not sent') console.log(`::warning::${outcome.message}`);
  if (outcome.result === 'failed') console.log(`::error::${outcome.message}`);
  return finish(summaryLines, outcome.result === 'failed' ? 1 : 0);
}

function finish(summaryLines, exitCode) {
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summaryLines.join('\n') + '\n');
  process.exitCode = exitCode;
}

if (require.main === module) {
  main().catch((err) => {
    console.log(`::error::${err.message}`);
    process.exitCode = 1;
  });
}

module.exports = {
  SITE, HOST, KEY, KEY_LOCATION, ENDPOINT, EVERY_PAGE_FILES, WATCHED_PATHS, MEANING,
  writeVersionFile, sitemapAddresses, addressesToSend, tellSearchEngines,
};
