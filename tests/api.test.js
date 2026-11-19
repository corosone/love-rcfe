// Tests for the server code in /functions and /lib (enquiries, staff sign-in and inbox actions,
// developer sign-in with an emailed code, blocking, the weekly summary). They run the real code
// against an in-memory database; nothing is sent to the live site, and outside services
// (Turnstile, Resend, Formspree) are stand-ins.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server.js');

const INBOX_PASSWORD = 'correct horse battery staple';

let site;

before(async () => {
  site = await startServer({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    REQUIRE_TURNSTILE: 'true',
    INBOX_PASSWORD,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
    DEV_EMAIL: 'owner@example.com',
    DEV_PASSWORD: 'developer password for tests',
    RESEND_API_KEY: 're_test_key',
    FORMSPREE_ENDPOINT: 'https://formspree.io/f/testform',
  });
  // The weekly summary is only sent on Mondays; these tests run on any day.
  (await import('../functions/api/cron/weekly-summary.js')).sendDay.allowed = () => true;
});

after(async () => {
  await site.close();
});

const enquiry = (extra = {}) => ({
  kind: 'enquiry',
  name: 'Test Person',
  email: 'test@example.com',
  phone: '(818) 555-0100',
  city: 'Pasadena',
  inquiry_type: 'Family Placement',
  message: 'Looking for a care home for my mother.',
  turnstile_token: 'token',
  ...extra,
});

const leadCount = () => site.db._rows('SELECT COUNT(*) AS n FROM leads')[0].n;

// ---------- Enquiry form ----------

test('a valid enquiry is saved and staff are notified by email', async () => {
  site.outside.length = 0;
  const res = await site.api('/api/leads', { method: 'POST', body: enquiry(), ip: '203.0.113.10' });
  assert.equal(res.status, 201);
  assert.deepEqual(await res.json(), { ok: true });
  await site.settle();

  const rows = site.db._rows('SELECT * FROM leads');
  assert.equal(rows.length, 1);
  assert.equal(rows[0].name, 'Test Person');
  assert.equal(rows[0].stage, 'new');
  assert.equal(rows[0].handled, 0);
  assert.equal(rows[0].ip, '203.0.113.10');

  assert.ok(site.outside.some((c) => c.url.includes('challenges.cloudflare.com/turnstile')), 'the spam check was verified with Cloudflare');
  assert.ok(site.outside.some((c) => c.url === 'https://formspree.io/f/testform'), 'the notification went to Formspree');
});

test('an enquiry is refused when the spam check fails', async () => {
  const before = leadCount();
  site.setTurnstilePasses(false);
  const res = await site.api('/api/leads', { method: 'POST', body: enquiry() });
  site.setTurnstilePasses(true);
  assert.equal(res.status, 422);
  assert.match((await res.json()).error, /security check/i);
  assert.equal(leadCount(), before);
});

test('an enquiry without a spam-check token is refused', async () => {
  const before = leadCount();
  const res = await site.api('/api/leads', { method: 'POST', body: enquiry({ turnstile_token: '' }) });
  assert.equal(res.status, 422);
  assert.equal(leadCount(), before);
});

for (const [label, change, field] of [
  ['a missing name', { name: '' }, 'name'],
  ['a bad email address', { email: 'not-an-email' }, 'email'],
  ['a phone number that is too short', { phone: '123' }, 'phone'],
  ['an empty message', { message: '' }, 'message'],
  ['a Social Security number in the message', { message: 'My SSN is 123-45-6789, please help.' }, 'message'],
]) {
  test(`an enquiry with ${label} is refused with a clear message`, async () => {
    const before = leadCount();
    const res = await site.api('/api/leads', { method: 'POST', body: enquiry(change) });
    assert.equal(res.status, 422);
    const data = await res.json();
    assert.ok(data.fields && data.fields[field], `the reply names the "${field}" field`);
    assert.equal(leadCount(), before);
  });
}

test('a call request needs a valid future date that is not a Sunday', async () => {
  const base = { kind: 'call_request', message: '', preferred_time: '' };
  const past = await site.api('/api/leads', { method: 'POST', body: enquiry({ ...base, preferred_date: '2020-01-06' }), ip: '203.0.113.11' });
  assert.equal(past.status, 422);
  const none = await site.api('/api/leads', { method: 'POST', body: enquiry({ ...base, preferred_date: '' }), ip: '203.0.113.11' });
  assert.equal(none.status, 422);

  // Next Monday and next Sunday, counted from today
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7 || 7) + 7);
  const monday = d.toISOString().slice(0, 10);
  d.setUTCDate(d.getUTCDate() + 6);
  const sunday = d.toISOString().slice(0, 10);

  const onSunday = await site.api('/api/leads', { method: 'POST', body: enquiry({ ...base, preferred_date: sunday }), ip: '203.0.113.11' });
  assert.equal(onSunday.status, 422);
  const ok = await site.api('/api/leads', { method: 'POST', body: enquiry({ ...base, preferred_date: monday }), ip: '203.0.113.11' });
  assert.equal(ok.status, 201);
  const row = site.db._rows("SELECT * FROM leads WHERE kind = 'call_request'")[0];
  assert.equal(row.preferred_date, monday);
});

test('an enquiry sent from another website is refused', async () => {
  const before = leadCount();
  const res = await site.api('/api/leads', { method: 'POST', body: enquiry(), headers: { origin: 'https://evil.example' } });
  assert.equal(res.status, 403);
  assert.equal(leadCount(), before);
});

test('the enquiry address only accepts POST', async () => {
  const res = await site.api('/api/leads');
  assert.equal(res.status, 405);
});

test('one address cannot send more than 8 enquiries in 10 minutes', async () => {
  let last;
  for (let i = 0; i < 9; i++) {
    last = await site.api('/api/leads', { method: 'POST', body: enquiry({ name: `Flood ${i}` }), ip: '203.0.113.50' });
  }
  assert.equal(last.status, 429);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM leads WHERE name LIKE 'Flood %'")[0].n, 8);
});

// ---------- Page visits ----------

test('a page visit is recorded in the request log', async () => {
  const res = await site.api('/api/visit', { method: 'POST', body: { path: '/', view: 'home' }, ip: '203.0.113.20' });
  assert.equal(res.status, 204);
  await site.settle();
  const rows = site.db._rows("SELECT * FROM request_log WHERE kind = 'view' AND ip = '203.0.113.20'");
  assert.equal(rows.length, 1);
  assert.equal(rows[0].path, '/#home');
});

test('a page visit with a strange address is refused', async () => {
  const res = await site.api('/api/visit', { method: 'POST', body: { path: 'javascript:alert(1)' } });
  assert.equal(res.status, 400);
});

// ---------- Staff inbox ----------

test('the staff inbox cannot be read without signing in', async () => {
  const res = await site.api('/api/admin/leads');
  assert.ok([401, 403].includes(res.status), `status ${res.status}`);
});

test('a wrong staff password is refused and written to the activity log', async () => {
  const res = await site.api('/api/admin/session', { method: 'POST', body: { password: 'wrong password', turnstile_token: 't' }, ip: '203.0.113.30' });
  assert.equal(res.status, 401);
  assert.equal(res.headers.get('set-cookie'), null);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM dev_audit WHERE event = 'staff_wrong_password'")[0].n, 1);
});

test('the right staff password signs in, and the inbox then shows the enquiries', async () => {
  const res = await site.api('/api/admin/session', { method: 'POST', body: { password: INBOX_PASSWORD, turnstile_token: 't' }, ip: '203.0.113.31' });
  assert.equal(res.status, 200);
  const cookie = res.headers.get('set-cookie');
  assert.match(cookie, /lovercfe_admin=/);
  assert.match(cookie, /HttpOnly/i);
  assert.match(cookie, /SameSite=Strict/i);

  const inbox = await site.api('/api/admin/leads', { headers: { cookie: cookie.split(';')[0] } });
  assert.equal(inbox.status, 200);
  const text = await inbox.text();
  assert.match(text, /Test Person/);
});

test('repeated wrong staff passwords lock the sign-in', async () => {
  const statuses = [];
  for (let i = 0; i < 8; i++) {
    const res = await site.api('/api/admin/session', { method: 'POST', body: { password: `guess ${i}`, turnstile_token: 't' }, ip: '203.0.113.40' });
    statuses.push(res.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401, 401, 401, 401]);
  const lock = site.db._rows('SELECT MAX(locked_until) AS until FROM auth_attempts')[0].until;
  assert.ok(lock > Date.now() / 1000, 'the 8th wrong password stores a lock in the database');
  // Even the right password is refused from that address while it is locked
  const locked = await site.api('/api/admin/session', { method: 'POST', body: { password: INBOX_PASSWORD, turnstile_token: 't' }, ip: '203.0.113.40' });
  assert.ok(locked.status === 423 || locked.status === 429, `status ${locked.status}`);
  assert.equal(locked.headers.get('set-cookie'), null);
});

// ---------- Developer console ----------

test('developer console data cannot be read without signing in', async () => {
  for (const path of ['/api/dev/overview', '/api/dev/requests', '/api/dev/leads', '/api/dev/database', '/api/dev/leads-export', '/api/dev/backup']) {
    const res = await site.api(path);
    assert.ok([401, 403, 404].includes(res.status), `${path} answered ${res.status}`);
    const body = await res.text();
    assert.doesNotMatch(body, /Test Person/, `${path} must not leak enquiries`);
  }
});

test('developer tools cannot be used without signing in', async () => {
  const res = await site.api('/api/dev/action', { method: 'POST', body: { action: 'delete_leads', ids: [1] } });
  assert.ok([401, 403, 404].includes(res.status), `status ${res.status}`);
  assert.ok(leadCount() > 0);
});

// ---------- Blocked addresses ----------

test('a blocked address is turned away from the enquiry form but not recorded as a new enquiry', async () => {
  const { addBlock, _resetBlockCache } = await import('../lib/blocklist.js');
  const fake = new Request(site.origin + '/api/dev/action', { headers: { 'x-forwarded-for': '198.51.100.1' } });
  const added = await addBlock(site.env, fake, { ip: '203.0.113.99', reason: 'test', days: 1 });
  assert.ok(added && added.ok !== false, JSON.stringify(added));
  _resetBlockCache();

  const before = leadCount();
  const res = await site.api('/api/leads', { method: 'POST', body: enquiry(), ip: '203.0.113.99' });
  assert.ok(res.status === 403 || res.status === 429, `status ${res.status}`);
  assert.equal(leadCount(), before);

  // Other addresses are not affected
  const other = await site.api('/api/visit', { method: 'POST', body: { path: '/' }, ip: '203.0.113.98' });
  assert.equal(other.status, 204);
});

// ---------- Weekly summary ----------

const lastSent = () => Number(site.db._rows("SELECT value FROM app_secrets WHERE name = 'weekly_summary_last_sent'")[0]?.value) || 0;
const setLastSent = (sec) => site.db._run("INSERT INTO app_secrets (name, value) VALUES ('weekly_summary_last_sent', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", String(sec));
const summaryMails = () => site.outside.filter((c) => c.url === 'https://api.resend.com/emails');

test('the weekly summary address only accepts POST', async () => {
  site.outside.length = 0;
  const res = await site.api('/api/cron/weekly-summary', { ip: '203.0.113.60' });
  assert.equal(res.status, 405);
  assert.equal(summaryMails().length, 0);
});

test('the weekly summary emails numbers only, and tells the caller nothing else', async () => {
  site.outside.length = 0;
  const res = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '203.0.113.62' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, sent: true });

  assert.equal(summaryMails().length, 1, 'one email was sent through Resend');
  const sent = JSON.parse(summaryMails()[0].body);
  assert.deepEqual(sent.to, ['owner@example.com'], 'it only goes to the owner');
  assert.match(sent.subject, /weekly summary: \d+ new enquir/);

  const total = leadCount();
  assert.match(sent.text, new RegExp(`New this week: ${total} \\(`));
  if (process.env.SHOW_EMAIL) console.log(sent.subject + '\n' + sent.text);
  assert.match(sent.text, /Staff inbox: 1 sign-ins, 9 wrong passwords\n/);
  assert.match(sent.text, /sign-in lock\(s\) are active right now/);
  assert.match(sent.text, /Active blocks: 1 \(1 added this week\)/);
  assert.match(sent.text, /Page views: \d+/);
  // No backup has been downloaded in these tests yet, so the email says so and reminds the owner
  assert.match(sent.text, /BACKUPS\nNo full backup has been downloaded yet\.\n/);
  assert.match(sent.text, /- No full backup has been downloaded yet\. Download one in the developer console \(Site & Database > Backups > Download Full Backup\)/);

  // No personal details of families
  for (const secret of ['Test Person', 'test@example.com', '555-0100', 'Looking for a care home', '203.0.113.']) {
    assert.ok(!sent.text.includes(secret), `the email must not contain "${secret}"`);
    assert.ok(!sent.subject.includes(secret));
  }
});

test('the weekly summary is sent at most once every 5 days, however often it is asked for', async () => {
  site.outside.length = 0;
  for (let i = 0; i < 3; i++) {
    const res = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: `203.0.113.${70 + i}` });
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.sent, false);
  }
  assert.equal(summaryMails().length, 0, 'no second email');

  // 4 days and 23 hours later: still too soon
  const now = Math.floor(Date.now() / 1000);
  setLastSent(now - (5 * 24 * 60 * 60 - 3600));
  const early = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '203.0.113.73' });
  assert.equal((await early.json()).sent, false);

  // 5 days later: sent again, and the time is recorded
  setLastSent(now - 5 * 24 * 60 * 60 - 60);
  const later = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '203.0.113.74' });
  assert.deepEqual(await later.json(), { ok: true, sent: true });
  assert.equal(summaryMails().length, 1);
  assert.ok(lastSent() >= now);
});

test('two requests at the same moment send only one email', async () => {
  site.outside.length = 0;
  setLastSent(1);
  const results = await Promise.all([1, 2, 3, 4].map((i) => site.api('/api/cron/weekly-summary', { method: 'POST', ip: `203.0.113.${80 + i}` }).then((r) => r.json())));
  assert.equal(results.filter((r) => r.sent).length, 1);
  assert.equal(summaryMails().length, 1);
});

test('if the email service refuses, the attempt is not counted, so the next call can try again', async () => {
  const { onRequestPost } = await import('../functions/api/cron/weekly-summary.js');
  const before = Math.floor(Date.now() / 1000) - 6 * 24 * 60 * 60;
  setLastSent(before);
  // No email service configured at all
  const res = await onRequestPost({
    request: new Request(site.origin + '/api/cron/weekly-summary', { method: 'POST', headers: { 'x-forwarded-for': '203.0.113.90' } }),
    env: { ...site.env, RESEND_API_KEY: '', DEV_CODE_FORMSPREE_ENDPOINT: '' },
  });
  assert.equal(res.status, 502);
  assert.equal(lastSent(), before, 'the last-sent time is put back');
});

test('the weekly summary address cannot be hammered', async () => {
  let res;
  for (let i = 0; i < 8; i++) {
    res = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '203.0.113.95' });
  }
  assert.equal(res.status, 429);
});

test('the weekly summary only counts the last 7 days', async () => {
  const { buildWeeklySummary } = await import('../functions/api/cron/weekly-summary.js');
  const old = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  site.db._run(
    "INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Old Lead', 'old@example.com', '8185550199', 'old message', ?, 0)",
    old
  );
  const summary = await buildWeeklySummary(site.db);
  assert.equal(summary.enquiries.total, leadCount() - 1);
  assert.equal(summary.enquiries.notHandledAllTime, leadCount());
  assert.equal(summary.enquiries.oldestNotHandled.slice(0, 10), old.slice(0, 10));

  const future = await buildWeeklySummary(site.db, Date.now() + 30 * 24 * 60 * 60 * 1000);
  assert.equal(future.enquiries.total, 0);
  assert.equal(future.visits.views, 0);
});

test('the weekly summary shows the last backup and reminds the owner after 30 days', async () => {
  const { buildWeeklySummary, summaryEmail, unusualItems, BACKUP_REMINDER_DAYS } = await import('../functions/api/cron/weekly-summary.js');
  assert.equal(BACKUP_REMINDER_DAYS, 30);
  const DAY = 24 * 60 * 60;
  const now = Math.floor(Date.now() / 1000);
  const setBackup = (sec) => site.db._run("INSERT INTO app_secrets (name, value) VALUES ('last_backup_download', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", String(sec));
  const reminders = (s) => unusualItems(s).filter((u) => /backup was downloaded|No full backup/.test(u));
  try {
    // 3 days ago: shown, no reminder
    setBackup(now - 3 * DAY - 60);
    let s = await buildWeeklySummary(site.db);
    assert.equal(s.backup.daysAgo, 3);
    assert.match(summaryEmail(s, site.origin).text, new RegExp(`BACKUPS\\nLast full backup downloaded: ${new Date((now - 3 * DAY - 60) * 1000).toISOString().slice(0, 10)} \\(3 days ago\\)\\n`));
    assert.deepEqual(reminders(s), []);

    // Exactly 30 days: still fine. 31 days: reminder
    setBackup(now - 30 * DAY - 60);
    assert.deepEqual(reminders(await buildWeeklySummary(site.db)), []);
    setBackup(now - 31 * DAY - 60);
    s = await buildWeeklySummary(site.db);
    assert.deepEqual(reminders(s), ['The last full backup was downloaded 31 days ago. Download a new one in the developer console (Site & Database > Backups > Download Full Backup) and keep it somewhere safe, like your computer.']);
    assert.match(summaryEmail(s, site.origin).subject, /things? to check/);

    // Today
    setBackup(now - 60);
    assert.match(summaryEmail(await buildWeeklySummary(site.db), site.origin).text, /\(today\)\n/);

    // Backups from before this was recorded separately are found in the activity log
    site.db._run("DELETE FROM app_secrets WHERE name = 'last_backup_download'");
    site.db._run("INSERT INTO dev_audit (at, event, detail) VALUES (?, 'backup_download', 'test')", now - 10 * DAY - 60);
    assert.equal((await buildWeeklySummary(site.db)).backup.daysAgo, 10);
  } finally {
    site.db._run("DELETE FROM app_secrets WHERE name = 'last_backup_download'");
    site.db._run("DELETE FROM dev_audit WHERE event = 'backup_download' AND detail = 'test'");
  }
  // Never: reminder
  assert.equal((await buildWeeklySummary(site.db)).backup.lastAt, '');
});

// ---------- Health check (used by the daily site check on GitHub) ----------

test('the health check says ok when the server and database work, and nothing else', async () => {
  const before = site.db._rows('SELECT COUNT(*) AS n FROM rate_limits')[0].n;
  const res = await site.api('/api/health', { ip: '203.0.113.150' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, database: 'ok' });
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.match(res.headers.get('x-robots-tag'), /noindex/);
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM rate_limits')[0].n, before, 'it writes nothing to the database');

  const post = await site.api('/api/health', { method: 'POST', ip: '203.0.113.150' });
  assert.equal(post.status, 405);
});

test('the health check reports a missing or broken database', async () => {
  const { onRequestGet } = await import('../functions/api/health.js');
  const request = () => new Request(site.origin + '/api/health', { headers: { 'x-forwarded-for': '203.0.113.151' } });
  const none = await onRequestGet({ request: request(), env: {} });
  assert.equal(none.status, 503);
  assert.deepEqual(await none.json(), { ok: false, database: 'not connected' });

  const broken = { prepare() { throw new Error('D1 is down'); } };
  const res = await onRequestGet({ request: request(), env: { DB: broken } });
  assert.equal(res.status, 503);
  const body = await res.json();
  assert.deepEqual(body, { ok: false, database: 'error' });
  assert.ok(!JSON.stringify(body).includes('D1 is down'), 'error details stay in the server log');
});

test('the health check cannot be hammered', async () => {
  let res;
  for (let i = 0; i < 32; i++) res = await site.api('/api/health', { ip: '203.0.113.152' });
  assert.equal(res.status, 429);
});

// ---------- Developer console sign-in (email + password, then a 6-digit code by email) ----------
// These run after the weekly-summary tests, so the numbers checked there are not changed.

const DEV_LOGIN = { email: 'owner@example.com', password: 'developer password for tests', turnstile_token: 't' };
const codeMails = () => site.outside.filter((c) => c.url === 'https://api.resend.com/emails' && /sign-in code/.test(JSON.parse(c.body).subject));
const codeFrom = (mail) => /sign-in code is: (\d{6})/.exec(JSON.parse(mail.body).text)[1];
const auditCount = (event) => site.db._rows('SELECT COUNT(*) AS n FROM dev_audit WHERE event = ?', event)[0].n;

// The cookies a reply sets, as { name: value }. An empty value means "delete this cookie".
function cookiesOf(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}
const cookieHeaderFor = (jar) => Object.entries(jar).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');

// The minute-by-minute limits on sign-in attempts would otherwise trip, because these tests
// make many attempts within seconds. Clearing them is the same as waiting a minute.
const waitAMinute = () => site.db._run('DELETE FROM rate_limits');

// Step 1 with the right email and password: returns the challenge cookie and the emailed code.
async function devStepOne(ip) {
  waitAMinute();
  const before = codeMails().length;
  const res = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip });
  assert.equal(res.status, 200, await res.clone().text());
  assert.equal(codeMails().length, before + 1, 'one code email was sent');
  return { res, jar: cookiesOf(res), code: codeFrom(codeMails().at(-1)) };
}
const verify = (jar, code, ip) => site.api('/api/dev/verify', { method: 'POST', body: { code }, headers: { cookie: cookieHeaderFor(jar) }, ip });

test('developer sign-in: a wrong email or password is refused, and no code is emailed', async () => {
  site.outside.length = 0;
  waitAMinute();
  for (const body of [
    { ...DEV_LOGIN, password: 'not the password at all' },
    { ...DEV_LOGIN, email: 'someone-else@example.com' },
  ]) {
    const res = await site.api('/api/dev/login', { method: 'POST', body, ip: '203.0.113.120' });
    assert.equal(res.status, 401);
    assert.deepEqual(await res.json(), { error: 'Incorrect email or password.' }, 'the reply never says which one was wrong');
    assert.equal(res.headers.getSetCookie().length, 0);
  }
  assert.equal(codeMails().length, 0);
  assert.equal(auditCount('wrong_password'), 2, 'both attempts are in the activity log');
});

test('developer sign-in: the security check and same-site rule are always required', async () => {
  site.outside.length = 0;
  waitAMinute();
  const noToken = await site.api('/api/dev/login', { method: 'POST', body: { ...DEV_LOGIN, turnstile_token: '' }, ip: '203.0.113.121' });
  assert.ok(noToken.status >= 400 && noToken.status < 500, `status ${noToken.status}`);

  site.setTurnstilePasses(false);
  const failed = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip: '203.0.113.121' });
  site.setTurnstilePasses(true);
  assert.ok(failed.status >= 400 && failed.status < 500, `status ${failed.status}`);

  const foreign = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, headers: { origin: 'https://evil.example' }, ip: '203.0.113.121' });
  assert.equal(foreign.status, 403);
  assert.equal(codeMails().length, 0, 'none of these sent a code');
});

test('developer sign-in: the right email and password email a code; the right code signs in', async () => {
  site.outside.length = 0;
  const ip = '203.0.113.122';
  const { res, jar, code } = await devStepOne(ip);
  const data = await res.json();
  assert.equal(data.step, 'code');
  assert.ok(!JSON.stringify(data).includes(code), 'the code is only in the email, never in the reply');
  assert.ok(jar.lovercfe_dev_step, 'a cookie ties the code to this browser');
  assert.match(res.headers.getSetCookie()[0], /HttpOnly/i);
  assert.deepEqual(JSON.parse(codeMails()[0].body).to, ['owner@example.com'], 'the code goes to the owner only');

  // Not signed in yet: the console still refuses
  const early = await site.api('/api/dev/overview', { headers: { cookie: cookieHeaderFor(jar) }, ip });
  assert.equal(early.status, 401);

  const wrong = await verify(jar, code === '000000' ? '111111' : '000000', ip);
  assert.equal(wrong.status, 401);
  assert.match((await wrong.json()).error, /Incorrect code\. 4 tries left/);

  const ok = await verify(jar, code, ip);
  assert.equal(ok.status, 200);
  const signedIn = { ...jar, ...cookiesOf(ok) };
  assert.ok(signedIn.lovercfe_dev, 'a developer session cookie was set');
  assert.equal(signedIn.lovercfe_dev_step, '', 'the code cookie is removed');
  assert.match(ok.headers.getSetCookie().find((c) => c.startsWith('lovercfe_dev=')), /HttpOnly.*SameSite=Strict|SameSite=Strict.*HttpOnly/i);

  const overview = await site.api('/api/dev/overview', { headers: { cookie: cookieHeaderFor(signedIn) }, ip });
  assert.equal(overview.status, 200, 'the console opens');
  assert.equal(auditCount('signed_in'), 1);
  assert.equal(auditCount('wrong_code'), 1);
});

test('developer sign-in: a code works only once', async () => {
  const ip = '203.0.113.123';
  const { jar, code } = await devStepOne(ip);
  assert.equal((await verify(jar, code, ip)).status, 200);
  const again = await verify(jar, code, ip);
  assert.equal(again.status, 401);
  const body = await again.json();
  assert.equal(body.restart, true, 'the page is told to start again from email and password');
  assert.equal(cookiesOf(again).lovercfe_dev, undefined, 'no second session');
});

test('developer sign-in: a code only works in the browser that asked for it', async () => {
  const ip = '203.0.113.124';
  const { code } = await devStepOne(ip);
  const noCookie = await verify({}, code, ip);
  assert.equal(noCookie.status, 401);
  assert.equal((await noCookie.json()).restart, true);
  const madeUp = await verify({ lovercfe_dev_step: 'A'.repeat(32) }, code, ip);
  assert.equal(madeUp.status, 401);
  assert.equal(cookiesOf(madeUp).lovercfe_dev, undefined);
});

test('developer sign-in: 5 wrong codes cancel the sign-in, even if the right code comes next', async () => {
  const ip = '203.0.113.125';
  const { jar, code } = await devStepOne(ip);
  const guesses = ['000000', '111111', '222222', '333333', '444444', '555555'].filter((g) => g !== code).slice(0, 5);
  const statuses = [];
  let last;
  for (const g of guesses) {
    last = await verify(jar, g, ip);
    statuses.push(last.status);
  }
  assert.deepEqual(statuses, [401, 401, 401, 401, 401]);
  assert.equal((await last.json()).restart, true, 'the 5th wrong code ends the sign-in');
  const right = await verify(jar, code, ip);
  assert.equal(right.status, 401);
  assert.equal(cookiesOf(right).lovercfe_dev, undefined, 'the right code no longer works');
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM dev_challenges')[0].n, 0);
});

test('developer sign-in: an expired code does not work', async () => {
  const ip = '203.0.113.126';
  const { jar, code } = await devStepOne(ip);
  site.db._run('UPDATE dev_challenges SET expires_at = ?', Math.floor(Date.now() / 1000) - 1);
  const res = await verify(jar, code, ip);
  assert.equal(res.status, 401);
  assert.match((await res.json()).error, /expired/);
});

test('developer sign-in: starting a new sign-in cancels the earlier code', async () => {
  const first = await devStepOne('203.0.113.127');
  const second = await devStepOne('203.0.113.127');
  const old = await verify(first.jar, first.code, '203.0.113.127');
  assert.equal(old.status, 401);
  assert.equal(cookiesOf(old).lovercfe_dev, undefined);
  assert.equal((await verify(second.jar, second.code, '203.0.113.127')).status, 200, 'the newest code still works');
});

test('developer sign-in: at most 5 code emails an hour', async () => {
  waitAMinute();
  site.outside.length = 0;
  const ip = '203.0.113.128';
  const statuses = [];
  for (let i = 0; i < 6; i++) {
    // Only the per-minute limits are cleared between tries; the hourly code-email count stays.
    site.db._run("DELETE FROM rate_limits WHERE key NOT LIKE 'devsend:%'");
    const res = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip });
    statuses.push(res.status);
    if (i === 5) assert.match((await res.json()).error, /Too many verification codes/);
  }
  assert.deepEqual(statuses, [200, 200, 200, 200, 200, 429], 'the password is right every time, but the 6th code is not sent');
  assert.equal(codeMails().length, 5);
  assert.ok(auditCount('code_limit') >= 1, 'written to the activity log');
});

test('developer sign-in: 5 wrong passwords lock that address for 15 minutes, even with the right password', async () => {
  const ip = '203.0.113.129';
  waitAMinute();
  for (let i = 0; i < 5; i++) {
    const res = await site.api('/api/dev/login', { method: 'POST', body: { ...DEV_LOGIN, password: `wrong guess number ${i}` }, ip });
    assert.equal(res.status, 401);
  }
  waitAMinute(); // past the per-minute limit, so only the lock is left
  const locked = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip });
  assert.equal(locked.status, 423);
  assert.match((await locked.json()).error, /Too many wrong sign-in attempts/);
  const wait = Number(locked.headers.get('retry-after'));
  assert.ok(wait > 14 * 60 && wait <= 15 * 60, `Retry-After ${wait}`);
  assert.equal(locked.headers.getSetCookie().length, 0);
});

test('signing out ends the developer session and any staff session in the same browser', async () => {
  const ip = '203.0.113.130';
  const { jar, code } = await devStepOne(ip);
  const dev = cookiesOf(await verify(jar, code, ip)).lovercfe_dev;
  const staff = cookiesOf(await site.api('/api/admin/session', { method: 'POST', body: { password: INBOX_PASSWORD, turnstile_token: 't' }, ip })).lovercfe_admin;
  assert.ok(dev && staff);
  const both = `lovercfe_dev=${dev}; lovercfe_admin=${staff}`;
  assert.equal((await site.api('/api/dev/overview', { headers: { cookie: both }, ip })).status, 200);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: both }, ip })).status, 200);

  const out = await site.api('/api/dev/session', { method: 'DELETE', headers: { cookie: both }, ip });
  assert.equal(out.status, 200);
  const cleared = cookiesOf(out);
  assert.equal(cleared.lovercfe_dev, '');
  assert.equal(cleared.lovercfe_admin, '');

  // The old cookies no longer work, even if someone kept a copy
  assert.equal((await site.api('/api/dev/overview', { headers: { cookie: `lovercfe_dev=${dev}` }, ip })).status, 401);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${staff}` }, ip })).status, 401);
  assert.ok(auditCount('signed_out') >= 1 && auditCount('staff_signed_out') >= 1);
});

// ---------- Staff inbox actions ----------

let staffCookie = '';
const STAFF_IP = '203.0.113.140';
const inboxCall = (method, query, body, cookie = staffCookie, extraHeaders = {}) =>
  site.api('/api/admin/leads' + query, { method, body, headers: { cookie, ...extraHeaders }, ip: STAFF_IP });
const leadRow = (id) => site.db._rows('SELECT * FROM leads WHERE id = ?', id)[0];

async function newLead(name) {
  site.db._run(
    "INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled, ip, ip_place) VALUES ('enquiry', 'Family Placement', ?, 'x@example.com', '8185550123', 'message', ?, 0, '198.51.100.77', 'Burbank, US')",
    name, new Date().toISOString()
  );
  return site.db._rows('SELECT MAX(id) AS id FROM leads')[0].id;
}

test('staff inbox: sign in for the action tests', async () => {
  const res = await site.api('/api/admin/session', { method: 'POST', body: { password: INBOX_PASSWORD, turnstile_token: 't' }, ip: STAFF_IP });
  assert.equal(res.status, 200);
  staffCookie = `lovercfe_admin=${cookiesOf(res).lovercfe_admin}`;
});

test('staff inbox: moving an enquiry through the stages', async () => {
  const id = await newLead('Stage Test');
  for (const stage of ['called', 'tour', 'waiting', 'new']) {
    const res = await inboxCall('PATCH', '', { id, stage });
    assert.equal(res.status, 200);
    assert.equal((await res.json()).lead.stage, stage);
    assert.equal(leadRow(id).stage, stage, 'saved in the database');
  }
  const bad = await inboxCall('PATCH', '', { id, stage: 'archived' });
  assert.equal(bad.status, 400);
  assert.equal(leadRow(id).stage, 'new', 'an unknown stage changes nothing');
});

test('staff inbox: notes are saved, tidied, and limited to 2,000 characters', async () => {
  const id = await newLead('Notes Test');
  const res = await inboxCall('PATCH', '', { id, notes: '  Called back Tuesday.\u0000  ' });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).lead.notes, 'Called back Tuesday.');
  await inboxCall('PATCH', '', { id, notes: 'x'.repeat(5000) });
  assert.equal(leadRow(id).notes.length, 2000);
  await inboxCall('PATCH', '', { id, notes: '' });
  assert.equal(leadRow(id).notes, '', 'notes can be cleared');
});

test('staff inbox: marking an enquiry handled and not handled, and the open count', async () => {
  const id = await newLead('Handled Test');
  const count = async () => (await (await inboxCall('GET', '?summary=1')).json());
  const before = await count();
  assert.equal((await (await inboxCall('PATCH', '', { id, handled: true })).json()).lead.handled, true);
  assert.equal((await count()).open, before.open - 1);
  assert.equal((await (await inboxCall('PATCH', '?id=' + id, { handled: false })).json()).lead.handled, false, 'the id can also be in the address');
  assert.equal((await count()).open, before.open);
  assert.equal((await count()).total, before.total);
});

test('staff inbox: only the fields sent are changed', async () => {
  const id = await newLead('Partial Test');
  await inboxCall('PATCH', '', { id, stage: 'tour', notes: 'keep me', handled: true });
  await inboxCall('PATCH', '', { id, stage: 'waiting' });
  const row = leadRow(id);
  assert.deepEqual([row.stage, row.notes, row.handled, row.name], ['waiting', 'keep me', 1, 'Partial Test']);
  assert.equal((await inboxCall('PATCH', '', { id })).status, 400, 'nothing to update');
  assert.equal((await inboxCall('PATCH', '', { id, name: 'Changed' })).status, 400, 'other fields cannot be changed');
  assert.equal(leadRow(id).name, 'Partial Test');
});

test('staff inbox: bad or unknown enquiry numbers are refused', async () => {
  for (const id of [0, -1, 1.5, 'abc', null]) {
    assert.equal((await inboxCall('PATCH', '', { id, stage: 'called' })).status, 400, `id ${id}`);
    assert.equal((await inboxCall('DELETE', '', { id })).status, 400, `id ${id}`);
  }
  assert.equal((await inboxCall('PATCH', '', { id: 999999, stage: 'called' })).status, 404);
  assert.equal((await inboxCall('DELETE', '?id=999999')).status, 404);
});

test('staff inbox: delete removes the enquiry', async () => {
  const id = await newLead('Delete Test');
  const before = auditCount('staff_marked_spam');
  const res = await inboxCall('DELETE', '?id=' + id);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, id });
  assert.equal(leadRow(id), undefined);
  assert.equal(auditCount('staff_marked_spam'), before, 'a plain delete is not reported as spam');
  assert.equal((await inboxCall('DELETE', '?id=' + id)).status, 404, 'deleting twice finds nothing');
});

test('staff inbox: "mark as spam" removes the enquiry and notes the sender\'s address for the developer', async () => {
  const id = await newLead('Spam Test');
  const res = await inboxCall('DELETE', '?id=' + id + '&spam=1');
  assert.equal(res.status, 200);
  assert.equal(leadRow(id), undefined);
  const logged = site.db._rows("SELECT detail FROM dev_audit WHERE event = 'staff_marked_spam' ORDER BY id DESC LIMIT 1")[0];
  assert.match(logged.detail, /198\.51\.100\.77 · Burbank, US/);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM blocked_ips WHERE ip LIKE '198.51.100.77%'")[0].n, 0, 'staff cannot block addresses; only the developer decides');
});

test('staff inbox: changes are refused without signing in, or from another website', async () => {
  const id = await newLead('Guarded Test');
  for (const [method, query, body] of [['PATCH', '', { id, stage: 'called' }], ['DELETE', '?id=' + id, undefined]]) {
    const anon = await inboxCall(method, query, body, '');
    assert.equal(anon.status, 401, `${method} without signing in`);
    const fake = await inboxCall(method, query, body, 'lovercfe_admin=' + 'A'.repeat(43) + '.' + 'B'.repeat(43));
    assert.equal(fake.status, 401, `${method} with a made-up cookie`);
    const foreign = await inboxCall(method, query, body, staffCookie, { origin: 'https://evil.example' });
    assert.equal(foreign.status, 403, `${method} from another website`);
  }
  const row = leadRow(id);
  assert.ok(row, 'still there');
  assert.equal(row.stage, 'new', 'unchanged');
});

test('staff inbox: only GET, PATCH and DELETE are accepted', async () => {
  const res = await inboxCall('POST', '', { id: 1 });
  assert.equal(res.status, 405);
});

test('staff inbox: messages not yet handled always come in the first batch, with counts for everything stored', async () => {
  const old = new Date(Date.now() - 60 * 86400000).toISOString();
  site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('call_request', 'x', 'Oldest Waiting', 'w@example.com', '8185550100', 'm', ?, 0)", old);
  for (let i = 0; i < 3; i++) {
    site.db._run("INSERT INTO leads (kind, inquiry_type, name, email, phone, message, created_at, handled) VALUES ('enquiry', 'x', 'Newer Handled', 'h@example.com', '8185550100', 'm', ?, 1)", new Date().toISOString());
  }
  const res = await inboxCall('GET', '?limit=2');
  assert.equal(res.status, 200);
  const data = await res.json();
  const real = site.db._rows("SELECT COUNT(*) AS total, SUM(handled = 0) AS open, SUM(handled = 0 AND kind = 'call_request') AS calls FROM leads")[0];
  assert.deepEqual(data.counts, { open: real.open, handled: real.total - real.open, openCalls: real.calls });
  assert.equal(data.total, real.total);
  assert.ok(data.leads.every((l) => !l.handled) || real.open < 2, 'the first batch is messages not yet handled');
  const all = await (await inboxCall('GET', '?limit=500')).json();
  const firstHandled = all.leads.findIndex((l) => l.handled);
  assert.ok(all.leads.slice(firstHandled).every((l) => l.handled), 'every message not yet handled comes before the handled ones');
  assert.ok(all.leads.some((l) => l.name === 'Oldest Waiting'));
});
