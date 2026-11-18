// Tests for the security fixes and the features added with them: IPv6 home networks counting as
// one sender, trusted devices getting past the site-wide sign-in lockouts, the contact form's
// separate limits for senders that look automated, the weekly-summary address refusing calls
// without writing to the database, request bodies being cut off at their size limit, the
// booking time check, individual staff accounts (sign-in, own password, new password, removal,
// turning the shared password off, "last changed by"), Recently Deleted (put back, delete for
// good, empty, removed after 30 days), backups, the spreadsheet formula guard and the console's
// warning about a short staff password. Everything runs against an in-memory database.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server.js');

const INBOX_PASSWORD = 'shared staff password for security tests';
const DEV_LOGIN = { email: 'owner@example.com', password: 'developer password for security tests', turnstile_token: 't' };
let site;

before(async () => {
  site = await startServer({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    REQUIRE_TURNSTILE: 'true',
    INBOX_PASSWORD,
    SESSION_SECRET: 'security-test-session-secret-0123456789abcdef',
    DEV_EMAIL: DEV_LOGIN.email,
    DEV_PASSWORD: DEV_LOGIN.password,
    RESEND_API_KEY: 're_test_key',
  });
  // Create the tables now (the site creates them on first use), so tests can reset limits.
  const { ensureSchema } = await import('../lib/db.js');
  await ensureSchema(site.env.DB);
});

after(async () => {
  await site.close();
});

// ---------- Helpers ----------
function cookiesOf(res) {
  const out = {};
  for (const line of res.headers.getSetCookie()) {
    const [pair] = line.split(';');
    const i = pair.indexOf('=');
    out[pair.slice(0, i).trim()] = decodeURIComponent(pair.slice(i + 1).trim());
  }
  return out;
}
const setCookieLine = (res, name) => res.headers.getSetCookie().find((c) => c.startsWith(name + '='));
const jar = (obj) => Object.entries(obj).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('; ');
const clearLimits = () => site.db._run('DELETE FROM rate_limits');
const clearLockouts = () => site.db._run('DELETE FROM auth_attempts');
const json = async (res) => ({ status: res.status, data: await res.json().catch(() => ({})) });

const staffLogin = (body, { ip = '203.0.113.10', cookie = '' } = {}) =>
  site.api('/api/admin/session', { method: 'POST', body: { turnstile_token: 't', ...body }, ip, headers: cookie ? { cookie } : {} });

const codeMails = () => site.outside.filter((c) => c.url === 'https://api.resend.com/emails' && /sign-in code/.test(JSON.parse(c.body).subject));

// A full developer sign-in from one address. Returns { dev, trust } cookie values.
async function devSignIn(ip, cookie = '') {
  clearLimits();
  const step1 = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip, headers: cookie ? { cookie } : {} });
  assert.equal(step1.status, 200, await step1.clone().text());
  const challenge = cookiesOf(step1).lovercfe_dev_step;
  const code = /code is: (\d{6})/.exec(JSON.parse(codeMails().at(-1).body).text)[1];
  const step2 = await site.api('/api/dev/verify', { method: 'POST', body: { code }, headers: { cookie: `lovercfe_dev_step=${challenge}` }, ip });
  assert.equal(step2.status, 200);
  const c = cookiesOf(step2);
  return { dev: c.lovercfe_dev, trust: c.lovercfe_dev_trust, res: step2 };
}

let DEV = ''; // developer session cookie value for actions
const DEV_IP = '203.0.113.250';
const action = async (name, options) => json(await site.api('/api/dev/action', { method: 'POST', body: { action: name, options }, headers: { cookie: `lovercfe_dev=${DEV}` }, ip: DEV_IP }));
const tool = async (params) => json(await site.api('/api/dev/tools?' + new URLSearchParams(params), { headers: { cookie: `lovercfe_dev=${DEV}` }, ip: DEV_IP }));
const overview = async () => (await json(await site.api('/api/dev/overview', { headers: { cookie: `lovercfe_dev=${DEV}` }, ip: DEV_IP }))).data;

function addLead(fields = {}) {
  const f = { kind: 'enquiry', inquiry_type: 'Family Placement', name: 'Ana Ruiz', email: 'ana@example.com', phone: '8185550101', message: 'Looking for a home for my father.', created_at: new Date().toISOString(), handled: 0, ip: '198.51.100.20', ip_place: 'Burbank, US', ...fields };
  const cols = Object.keys(f);
  site.db._run(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => f[c]));
  return site.db._rows('SELECT MAX(id) AS id FROM leads')[0].id;
}

// Sends an enquiry the way Cloudflare would, with Cloudflare's network details for the sender.
async function postEnquiry(body, { ip, asn = 7922, org = 'Comcast Cable Communications, LLC' }) {
  const { onRequestPost } = await import('../functions/api/leads.js');
  const request = new Request(site.origin + '/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: site.origin, 'x-forwarded-for': ip },
    body: JSON.stringify({ kind: 'enquiry', name: 'Real Family', email: 'family@example.com', phone: '8185550100', message: 'We need help finding care.', turnstile_token: 't', ...body }),
  });
  Object.defineProperty(request, 'cf', { value: { asn, asOrganization: org, city: 'Burbank', country: 'US' } });
  return onRequestPost({ request, env: site.env, waitUntil: () => {} });
}

test('set-up: the developer signs in', async () => {
  DEV = (await devSignIn(DEV_IP)).dev;
  assert.ok(DEV);
});

// ---------- 1. IPv6 home networks count as one sender ----------

test('IPv6: moving to the next address in the same home network does not reset the wrong-password lockout', async () => {
  clearLimits(); clearLockouts();
  for (let i = 1; i <= 8; i++) {
    assert.equal((await staffLogin({ password: 'wrong ' + i }, { ip: `2001:db8:1:2::${i}` })).status, 401);
    clearLimits(); // only the lockout is being tested here, not the per-minute limit
  }
  const { adminAttemptKey } = await import('../lib/db.js');
  const keyFor = (ip) => adminAttemptKey(new Request('http://localhost/', { headers: { 'x-forwarded-for': ip } }));
  const lock = site.db._rows('SELECT locked_until FROM auth_attempts WHERE key = ?', await keyFor('2001:db8:1:2::99'))[0];
  assert.ok(lock && lock.locked_until > Date.now() / 1000, 'the whole home network is locked, not just the addresses used');
  const neighbour = await staffLogin({ password: 'wrong 9' }, { ip: '2001:db8:1:2::99' });
  assert.ok([423, 429].includes(neighbour.status), `the neighbouring address is refused too (got ${neighbour.status})`);
  const otherHome = await staffLogin({ password: 'wrong 10' }, { ip: '2001:db8:1:3::1' });
  assert.equal(otherHome.status, 401, 'a different home network is not affected');
  clearLockouts();
});

test('IPv6: the per-minute sign-in limit also counts the whole home network', async () => {
  clearLimits(); clearLockouts();
  const statuses = [];
  for (let i = 1; i <= 10; i++) statuses.push((await staffLogin({ password: 'nope' }, { ip: `2001:db8:aa:bb::${i}` })).status);
  assert.ok(statuses.includes(429), `got ${statuses.join(', ')}`);
  clearLockouts(); clearLimits();
});

test('IPv6: the contact form\'s per-sender limit counts the whole home network', async () => {
  clearLimits();
  const statuses = [];
  for (let i = 1; i <= 10; i++) statuses.push((await postEnquiry({ email: `six${i}@example.com` }, { ip: `2001:db8:cafe:1::${i}` })).status);
  assert.deepEqual(statuses.slice(0, 8), Array(8).fill(201));
  assert.deepEqual(statuses.slice(8), [429, 429], 'the 9th and 10th from the same home are refused, whatever the address');
  clearLimits();
});

test('IPv6: an IPv4 address written the long way (::ffff:a.b.c.d) is the same sender as the short one', async () => {
  const { networkKey } = await import('../lib/ipnet.js');
  assert.equal(networkKey('::ffff:198.51.100.7'), '198.51.100.7');
  assert.equal(networkKey('2001:DB8:1:2:aaaa:bbbb:cccc:dddd'), '2001:db8:1:2::/64');
  assert.equal(networkKey('2001:db8:1:2::/64'), '2001:db8:1:2::/64');
  assert.equal(networkKey('not an address'), '');
  const { blockKey, normalizeIp } = await import('../lib/blocklist.js');
  assert.equal(blockKey('2001:db8:1:2::5'), '2001:db8:1:2::/64', 'the block list still blocks whole home networks');
  assert.equal(normalizeIp('198.51.100.07'), '', 'still exported from the block list, and still strict');
});

// ---------- 2. Trusted devices get past the site-wide lockout ----------

test('staff: after strangers trigger the site-wide lockout, a trusted browser can still sign in; others must wait', async () => {
  clearLimits(); clearLockouts();
  const first = await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.20' });
  assert.equal(first.status, 200);
  const trustLine = setCookieLine(first, 'lovercfe_staff_trust');
  assert.ok(trustLine, 'a trusted-device cookie is set on success');
  assert.match(trustLine, /HttpOnly/);
  assert.match(trustLine, /SameSite=Strict/);
  assert.match(trustLine, /Path=\/api\/admin/);
  assert.match(trustLine, /Max-Age=7776000/, '90 days');
  const trust = cookiesOf(first).lovercfe_staff_trust;
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM trusted_devices WHERE id = ?', trust)[0].n, 0, 'only a fingerprint is stored, never the cookie itself');

  // (The per-minute limit is reset halfway, as if the guesses were spread over two minutes.)
  for (let i = 1; i <= 20; i++) {
    if (i === 10) clearLimits();
    assert.equal((await staffLogin({ password: 'guess ' + i }, { ip: `198.51.100.${i}` })).status, 401);
  }
  clearLimits();
  assert.equal((await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.21' })).status, 423, 'an untrusted browser waits');
  assert.equal((await staffLogin({ password: 'wrong' }, { ip: '203.0.113.22', cookie: `lovercfe_staff_trust=${trust}` })).status, 401, 'a trusted browser still needs the right password');
  const again = await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.23', cookie: `lovercfe_staff_trust=${trust}` });
  assert.equal(again.status, 200, 'the trusted browser gets in');
  const renewed = cookiesOf(again).lovercfe_staff_trust;
  assert.ok(renewed && renewed !== trust, 'the cookie is renewed with a new value');
  assert.equal((await staffLogin({ password: 'wrong' }, { ip: '203.0.113.24', cookie: `lovercfe_staff_trust=${trust}` })).status, 423, 'the old value no longer counts as trusted');
  const fake = await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.25', cookie: `lovercfe_staff_trust=${'A'.repeat(43)}` });
  assert.equal(fake.status, 423, 'a made-up cookie does not help');
  clearLockouts(); clearLimits();
});

test('staff: a trusted browser is still held by its own network\'s lockout', async () => {
  clearLimits(); clearLockouts();
  const ok = await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.30' });
  const trust = cookiesOf(ok).lovercfe_staff_trust;
  for (let i = 1; i <= 8; i++) { await staffLogin({ password: 'bad ' + i }, { ip: '203.0.113.31' }); clearLimits(); }
  const same = await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.31', cookie: `lovercfe_staff_trust=${trust}` });
  assert.ok([423, 429].includes(same.status), `refused (got ${same.status})`);
  assert.ok(site.db._rows('SELECT COUNT(*) AS n FROM auth_attempts WHERE locked_until > ?', Math.floor(Date.now() / 1000))[0].n >= 1);
  clearLockouts(); clearLimits();
});

test('developer: after strangers trigger the site-wide lockout, a trusted browser can still sign in (with the code)', async () => {
  clearLimits(); clearLockouts();
  const { trust, res } = await devSignIn('203.0.113.40');
  const line = setCookieLine(res, 'lovercfe_dev_trust');
  assert.match(line, /Path=\/api\/dev/);
  assert.match(line, /HttpOnly/);
  for (let i = 1; i <= 15; i++) {
    if (i === 8) clearLimits();
    const r = await site.api('/api/dev/login', { method: 'POST', body: { ...DEV_LOGIN, password: 'guess ' + i }, ip: `198.51.100.${100 + i}` });
    assert.equal(r.status, 401);
  }
  clearLimits();
  const blocked = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip: '203.0.113.41' });
  assert.equal(blocked.status, 423, 'an untrusted browser waits');
  const before = codeMails().length;
  const trusted = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip: '203.0.113.42', headers: { cookie: `lovercfe_dev_trust=${trust}` } });
  assert.equal(trusted.status, 200, 'the trusted browser gets to the code step');
  assert.equal(codeMails().length, before + 1, 'and still has to enter the emailed code');
  const wrong = await site.api('/api/dev/login', { method: 'POST', body: { ...DEV_LOGIN, password: 'wrong' }, ip: '203.0.113.43', headers: { cookie: `lovercfe_dev_trust=${trust}` } });
  assert.equal(wrong.status, 401, 'a trusted browser still needs the right password');
  clearLockouts(); clearLimits();
});

test('developer: the emergency lock still applies to trusted browsers', async () => {
  clearLimits(); clearLockouts();
  const me = await devSignIn('203.0.113.50');
  const other = await devSignIn('203.0.113.51');
  // Lock from "me": the other device is signed out and forgotten; "me" stays trusted.
  const lock = await json(await site.api('/api/dev/action', { method: 'POST', body: { action: 'lock_dev' }, headers: { cookie: jar({ lovercfe_dev: me.dev, lovercfe_dev_trust: me.trust }) }, ip: '203.0.113.50' }));
  assert.equal(lock.status, 200);
  clearLimits();
  const tryOther = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip: '203.0.113.51', headers: { cookie: `lovercfe_dev_trust=${other.trust}` } });
  assert.equal(tryOther.status, 423, 'locked for everyone');
  const fps = site.db._rows("SELECT COUNT(*) AS n FROM trusted_devices WHERE kind = 'dev'")[0].n;
  assert.equal(fps, 1, 'only the device that locked it is still trusted');
  await site.api('/api/dev/action', { method: 'POST', body: { action: 'unlock_dev' }, headers: { cookie: `lovercfe_dev=${me.dev}` }, ip: '203.0.113.50' });
  DEV = (await devSignIn(DEV_IP)).dev; // the lock signed the main test session out
});

test('"Sign Out All Staff" also forgets every trusted staff browser', async () => {
  clearLimits(); clearLockouts();
  await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.60' });
  assert.ok(site.db._rows("SELECT COUNT(*) AS n FROM trusted_devices WHERE kind = 'staff'")[0].n > 0);
  assert.equal((await action('signout_staff')).status, 200);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM trusted_devices WHERE kind = 'staff'")[0].n, 0);
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM admin_sessions')[0].n, 0);
});

test('the console shows how many browsers are trusted', async () => {
  const o = await overview();
  assert.equal(typeof o.security.trustedStaffDevices, 'number');
  assert.ok(o.security.trustedDeveloperDevices >= 1);
});

// ---------- 3. Contact form: automated-looking senders have their own small allowance ----------

test('contact form: spam through VPNs and data centres fills only its own allowance; families still get through', async () => {
  clearLimits();
  site.db._run("DELETE FROM rate_limits WHERE key LIKE 'lead:%'");
  const statuses = [];
  for (let i = 1; i <= 17; i++) {
    statuses.push((await postEnquiry({ email: `spam${i}@example.com` }, { ip: `192.0.2.${i}`, asn: 60068, org: 'Datacamp Limited' })).status);
  }
  assert.deepEqual(statuses.slice(0, 15), Array(15).fill(201));
  assert.deepEqual(statuses.slice(15), [429, 429], 'the 16th and 17th from data centres are refused');
  const family = await postEnquiry({ email: 'real@example.com' }, { ip: '203.0.113.70' });
  assert.equal(family.status, 201, 'a family on a home connection still gets through');
  const phone = await postEnquiry({ email: 'mobile@example.com' }, { ip: '203.0.113.71', asn: 21928, org: 'T-Mobile USA, Inc.' });
  assert.equal(phone.status, 201, 'and so does one on a phone network');
  clearLimits();
});

test('contact form: everyone together can still send many more than before (120 per 10 minutes)', async () => {
  clearLimits();
  let accepted = 0;
  for (let i = 1; i <= 60; i++) {
    const r = await postEnquiry({ email: `fam${i}@example.com` }, { ip: `203.0.${Math.floor(i / 8) + 100}.${i}` });
    if (r.status === 201) accepted++;
  }
  assert.equal(accepted, 60, 'the old site-wide limit was 40');
  clearLimits();
});

test('contact form: the booking time must be one of the form\'s choices', async () => {
  clearLimits();
  const day = new Date(Date.now() + 3 * 86400000);
  if (day.getUTCDay() === 0) day.setUTCDate(day.getUTCDate() + 1);
  const date = day.toISOString().slice(0, 10);
  const call = (time, n) => postEnquiry({ kind: 'call_request', message: '', preferred_date: date, preferred_time: time, email: `t${n}@example.com` }, { ip: `203.0.113.${80 + n}` });
  assert.equal((await call('Morning (9am - 12pm)', 1)).status, 201);
  assert.equal((await call('Late Afternoon (4pm - 6pm)', 2)).status, 201);
  assert.equal((await call('Morning <a href=x>call me</a>', 3)).status, 422);
  assert.equal((await call('morning, and also please visit my website', 4)).status, 422);
  clearLimits();
});

// ---------- 4. Weekly summary: refused calls write nothing ----------

test('weekly summary: calls refused because one was sent recently write nothing to the database', async () => {
  clearLimits();
  site.db._run("INSERT INTO app_secrets (name, value) VALUES ('weekly_summary_last_sent', ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value", String(Math.floor(Date.now() / 1000) - 3600));
  const statuses = [];
  for (let i = 0; i < 10; i++) statuses.push((await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '198.51.100.200' })).status);
  assert.deepEqual(statuses.slice(0, 6), Array(6).fill(200));
  assert.deepEqual(statuses.slice(6), Array(4).fill(429), 'more than 6 an hour from one sender are refused straight away');
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM rate_limits WHERE key LIKE 'cron:%'")[0].n, 0, 'no rate-limit rows were written');
});

// ---------- 5. Request bodies are cut off at their limit ----------

test('a huge request body sent without a size header is refused without reading it all', async () => {
  const { readJsonBody } = await import('../lib/db.js');
  let pulled = 0;
  const stream = new ReadableStream({
    pull(controller) {
      pulled++;
      if (pulled > 1000) { controller.close(); return; }
      controller.enqueue(new Uint8Array(64 * 1024).fill(32));
    },
  });
  const request = new Request('http://localhost/api/leads', { method: 'POST', headers: { 'content-type': 'application/json' }, body: stream, duplex: 'half' });
  const r = await readJsonBody(request, 32768);
  assert.equal(r.ok, false);
  assert.equal(r.response.status, 413);
  assert.ok(pulled < 5, `stopped after ${pulled} pieces instead of reading 64 MB`);
  const small = await readJsonBody(new Request('http://localhost/x', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{"a":1}' }), 100);
  assert.deepEqual(small, { ok: true, data: { a: 1 } });
});

// ---------- 6. Staff accounts ----------

let maria = { id: 0, password: '' };

test('staff accounts: the console creates one with a made-up password, shown once and never stored', async () => {
  const r = await action('add_staff_account', { name: '  Maria   López ' });
  assert.equal(r.status, 200, JSON.stringify(r.data));
  assert.equal(r.data.account.name, 'Maria López');
  assert.match(r.data.password, /^[a-hjkmnp-z2-9]{4}(-[a-hjkmnp-z2-9]{4}){3}$/);
  maria = { id: r.data.account.id, password: r.data.password };
  const row = site.db._rows('SELECT * FROM staff_accounts WHERE id = ?', maria.id)[0];
  assert.ok(!JSON.stringify(row).includes(maria.password), 'the password itself is not in the database');
  assert.match(row.pass_hash, /^[0-9a-f]{64}$/);
  assert.equal((await action('add_staff_account', { name: 'maria lópez' })).status, 409, 'names are unique, ignoring capital letters');
  for (const bad of ['', 'x', '<script>', 'Robert"); DROP TABLE', 'a'.repeat(41)]) {
    assert.equal((await action('add_staff_account', { name: bad })).status, 400, `"${bad}" is refused`);
  }
  const o = await overview();
  assert.deepEqual(o.staff.accounts.map((a) => a.name), ['Maria López']);
  assert.equal(o.staff.sharedPasswordAllowed, true);
});

let mariaCookie = '';

test('staff accounts: sign in with name and password; a wrong one gets a reply that does not say which part was wrong', async () => {
  clearLimits(); clearLockouts();
  for (const body of [{ name: 'Maria López', password: 'wrong password here' }, { name: 'Nobody Here', password: maria.password }]) {
    const r = await json(await staffLogin(body, { ip: '203.0.113.90' }));
    assert.equal(r.status, 401);
    assert.equal(r.data.error, 'Incorrect name or password.');
  }
  const ok = await staffLogin({ name: 'maria lópez', password: maria.password }, { ip: '203.0.113.90' });
  assert.equal(ok.status, 200);
  assert.equal((await ok.json()).name, 'Maria López');
  mariaCookie = cookiesOf(ok).lovercfe_admin;
  const who = await json(await site.api('/api/admin/session', { headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.deepEqual(who.data, { ok: true, name: 'Maria López', kind: 'account' });
  const log = site.db._rows("SELECT detail FROM dev_audit WHERE event = 'staff_signed_in' ORDER BY id DESC LIMIT 1")[0].detail;
  assert.match(log, /as "Maria López"/, 'the activity log says who signed in');
  const wrongLog = site.db._rows("SELECT detail FROM dev_audit WHERE event = 'staff_wrong_password' ORDER BY id DESC LIMIT 1")[0].detail;
  assert.match(wrongLog, /as "Nobody Here"/, 'and which name a wrong attempt used');
  assert.ok(site.db._rows('SELECT last_sign_in FROM staff_accounts WHERE id = ?', maria.id)[0].last_sign_in > 0);
  clearLockouts();
});

test('staff accounts: the inbox records who last changed an enquiry', async () => {
  const id = addLead({ name: 'Changed By Test' });
  const res = await json(await site.api('/api/admin/leads', { method: 'PATCH', body: { id, stage: 'called' }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.equal(res.status, 200);
  assert.equal(res.data.lead.updatedBy, 'Maria López');
  assert.match(res.data.lead.updatedAt, /^\d{4}-\d{2}-\d{2}T/);
  const list = await json(await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.deepEqual(list.data.me, { name: 'Maria López', kind: 'account' });
  assert.equal(list.data.leads.find((l) => l.id === id).updatedBy, 'Maria López');
  // The shared password and the developer are named as such
  clearLimits();
  const shared = cookiesOf(await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.91' })).lovercfe_admin;
  const r2 = await json(await site.api('/api/admin/leads', { method: 'PATCH', body: { id, notes: 'called back' }, headers: { cookie: `lovercfe_admin=${shared}` }, ip: '203.0.113.91' }));
  assert.equal(r2.data.lead.updatedBy, 'Shared staff password');
  const r3 = await json(await site.api('/api/admin/leads', { method: 'PATCH', body: { id, handled: true }, headers: { cookie: `lovercfe_dev=${DEV}` }, ip: DEV_IP }));
  assert.equal(r3.data.lead.updatedBy, 'Developer');
});

test('staff accounts: people can change their own password; other devices are signed out', async () => {
  clearLimits();
  const second = cookiesOf(await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.92' })).lovercfe_admin;
  const wrongCurrent = await json(await site.api('/api/admin/session', { method: 'PATCH', body: { current: 'not it', password: 'a brand new password' }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.equal(wrongCurrent.status, 401);
  const tooShort = await json(await site.api('/api/admin/session', { method: 'PATCH', body: { current: maria.password, password: 'short' }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.equal(tooShort.status, 400);
  const withName = await json(await site.api('/api/admin/session', { method: 'PATCH', body: { current: maria.password, password: 'maria is the best 123' }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.equal(withName.status, 400, 'a password containing your own name is refused');
  const ok = await json(await site.api('/api/admin/session', { method: 'PATCH', body: { current: maria.password, password: 'garden-lamp-river-77' }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' }));
  assert.equal(ok.status, 200, JSON.stringify(ok.data));
  assert.equal(ok.data.signedOut, 1);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' })).status, 200, 'this device stays signed in');
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${second}` }, ip: '203.0.113.92' })).status, 401, 'the other device is signed out');
  clearLimits();
  assert.equal((await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.93' })).status, 401, 'the old password stops working');
  assert.equal((await staffLogin({ name: 'Maria López', password: 'garden-lamp-river-77' }, { ip: '203.0.113.93' })).status, 200);
  maria.password = 'garden-lamp-river-77';
  // The shared password and the developer cannot use this
  clearLimits();
  const shared = cookiesOf(await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.94' })).lovercfe_admin;
  assert.equal((await site.api('/api/admin/session', { method: 'PATCH', body: { current: INBOX_PASSWORD, password: 'another long password' }, headers: { cookie: `lovercfe_admin=${shared}` }, ip: '203.0.113.94' })).status, 400);
  assert.ok(site.db._rows("SELECT COUNT(*) AS n FROM dev_audit WHERE event = 'staff_changed_password'")[0].n >= 1);
  clearLockouts();
});

test('staff accounts: a new password from the console signs the person out and replaces the old one', async () => {
  clearLimits();
  const cookie = cookiesOf(await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.95' })).lovercfe_admin;
  const r = await action('reset_staff_password', { id: maria.id });
  assert.equal(r.status, 200);
  assert.notEqual(r.data.password, maria.password);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${cookie}` }, ip: '203.0.113.95' })).status, 401);
  clearLimits();
  assert.equal((await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.95' })).status, 401);
  assert.equal((await staffLogin({ name: 'Maria López', password: r.data.password }, { ip: '203.0.113.95' })).status, 200);
  maria.password = r.data.password;
  clearLockouts();
});

test('staff accounts: the shared password can be turned off only once accounts exist; it signs its sessions out', async () => {
  clearLimits();
  const sharedCookie = cookiesOf(await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.96' })).lovercfe_admin;
  // Pretend there are no accounts: refused
  site.db._run('CREATE TEMP TABLE keep_accounts AS SELECT * FROM staff_accounts');
  site.db._run('DELETE FROM staff_accounts');
  assert.equal((await action('shared_staff_password', { allowed: false })).status, 400);
  site.db._run('INSERT INTO staff_accounts SELECT * FROM keep_accounts');
  site.db._run('DROP TABLE keep_accounts');

  const off = await action('shared_staff_password', { allowed: false });
  assert.equal(off.status, 200);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${sharedCookie}` }, ip: '203.0.113.96' })).status, 401, 'shared sessions end at once');
  clearLimits();
  const blank = await json(await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.97' }));
  assert.equal(blank.status, 400);
  assert.match(blank.data.error, /name/);
  assert.equal((await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.97' })).status, 200, 'accounts still work');
  assert.equal((await overview()).staff.sharedPasswordAllowed, false);
  assert.equal((await action('shared_staff_password', { allowed: true })).status, 200);
  clearLimits();
  assert.equal((await staffLogin({ password: INBOX_PASSWORD }, { ip: '203.0.113.98' })).status, 200, 'and it can be allowed again');
});

test('staff accounts: removing one signs that person out everywhere; other people are not affected', async () => {
  clearLimits();
  const other = await action('add_staff_account', { name: 'Ken Ito' });
  const kenCookie = cookiesOf(await staffLogin({ name: 'Ken Ito', password: other.data.password }, { ip: '203.0.113.99' })).lovercfe_admin;
  const mariaNow = cookiesOf(await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.99' })).lovercfe_admin;
  assert.equal((await action('remove_staff_account', { id: other.data.account.id })).status, 200);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${kenCookie}` }, ip: '203.0.113.99' })).status, 401);
  assert.equal((await site.api('/api/admin/leads', { headers: { cookie: `lovercfe_admin=${mariaNow}` }, ip: '203.0.113.99' })).status, 200);
  clearLimits();
  assert.equal((await staffLogin({ name: 'Ken Ito', password: other.data.password }, { ip: '203.0.113.99' })).status, 401);
  assert.equal((await action('remove_staff_account', { id: other.data.account.id })).status, 404);
  clearLockouts();
});

test('staff accounts: only the developer can manage them', async () => {
  const res = await site.api('/api/dev/action', { method: 'POST', body: { action: 'add_staff_account', options: { name: 'Sneaky Person' } }, headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' });
  assert.equal(res.status, 401);
  assert.equal(site.db._rows("SELECT COUNT(*) AS n FROM staff_accounts WHERE name = 'Sneaky Person'")[0].n, 0);
});

test('staff accounts: checking a name that does not exist takes about as long as a real one', async () => {
  const { checkStaffAccount } = await import('../lib/staff.js');
  const time = async (name) => {
    const t = process.hrtime.bigint();
    for (let i = 0; i < 5; i++) await checkStaffAccount(site.env.DB, name, 'some wrong password');
    return Number(process.hrtime.bigint() - t) / 5e6;
  };
  await time('Maria López'); // warm up
  const real = await time('Maria López');
  const missing = await time('No Such Person');
  assert.ok(missing > real * 0.5 && missing < real * 2, `real ${real.toFixed(1)} ms, missing ${missing.toFixed(1)} ms`);
});

// ---------- 7. Recently Deleted ----------

test('set-up: Maria signs in again (her earlier sessions ended when she got a new password)', async () => {
  clearLimits();
  const r = await staffLogin({ name: 'Maria López', password: maria.password }, { ip: '203.0.113.90' });
  assert.equal(r.status, 200);
  mariaCookie = cookiesOf(r).lovercfe_admin;
});

test('Recently Deleted: a staff delete can be put back with the same number, stage and notes', async () => {
  clearLimits();
  const id = addLead({ name: 'Bin Test', stage: 'tour', notes: 'tour on Friday', device_info: '' });
  const del = await site.api('/api/admin/leads?id=' + id, { method: 'DELETE', headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' });
  assert.equal(del.status, 200);
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM leads WHERE id = ?', id)[0].n, 0, 'gone from the inbox');
  const bin = await tool({ tool: 'deleted' });
  const item = bin.data.items.find((d) => d.id === id);
  assert.ok(item);
  assert.equal(item.deletedBy, 'Maria López');
  assert.equal(item.reason, 'deleted');
  assert.equal(item.name, 'Bin Test');
  assert.ok(site.db._rows("SELECT COUNT(*) AS n FROM dev_audit WHERE event = 'staff_deleted' AND detail LIKE ?", `#${id} by Maria López%`)[0].n >= 1);
  assert.equal((await overview()).leads.recentlyDeleted >= 1, true);

  const back = await action('restore_deleted', { ids: [id] });
  assert.equal(back.status, 200, JSON.stringify(back.data));
  const row = site.db._rows('SELECT * FROM leads WHERE id = ?', id)[0];
  assert.equal(row.name, 'Bin Test');
  assert.equal(row.stage, 'tour');
  assert.equal(row.notes, 'tour on Friday');
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM deleted_leads WHERE id = ?', id)[0].n, 0, 'no longer in the bin');
  assert.equal((await action('restore_deleted', { ids: [id] })).status, 404, 'putting back twice does nothing');
});

test('Recently Deleted: spam, console deletes, delete for good, empty, and removal after 30 days', async () => {
  const a = addLead({ name: 'Spam One' });
  const b = addLead({ name: 'Console Delete' });
  const c = addLead({ name: 'Old One' });
  assert.equal((await site.api(`/api/admin/leads?id=${a}&spam=1`, { method: 'DELETE', headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' })).status, 200);
  const spamLog = site.db._rows("SELECT detail FROM dev_audit WHERE event = 'staff_marked_spam' ORDER BY id DESC LIMIT 1")[0].detail;
  assert.match(spamLog, /^198\.51\.100\.20 · Burbank, US · #\d+ by Maria López$/, 'the address still comes first, so the console can offer to block it');
  const del = await action('delete_leads', { ids: [b, c] });
  assert.equal(del.status, 200);
  assert.match(del.data.message, /Recently Deleted/);
  const items = (await tool({ tool: 'deleted' })).data.items;
  assert.equal(items.find((d) => d.id === a).reason, 'spam');
  assert.equal(items.find((d) => d.id === b).deletedBy, 'Developer');

  assert.equal((await action('delete_forever', { ids: [b] })).status, 200);
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM deleted_leads WHERE id = ?', b)[0].n, 0);
  site.db._run('UPDATE deleted_leads SET deleted_at = ? WHERE id = ?', Math.floor(Date.now() / 1000) - 31 * 86400, c);
  const after = (await tool({ tool: 'deleted' })).data;
  assert.ok(!after.items.some((d) => d.id === c), 'removed for good after 30 days');
  assert.equal((await action('empty_bin')).status, 200);
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM deleted_leads')[0].n, 0);
  for (const bad of [[], ['x'], [1.5], [-1], Array(51).fill(0).map((_, i) => i + 1)]) {
    assert.equal((await action('restore_deleted', { ids: bad })).status, 400, `${JSON.stringify(bad)} is refused`);
  }
});

test('Recently Deleted: several can be put back at once, exactly as they were', async () => {
  const a = addLead({ name: 'Multi One', kind: 'call_request', preferred_date: '2030-01-07', preferred_time: 'Morning (9am - 12pm)', handled: 1, duplicate_of: 0, device_info: '{"v":1}', isp: 'Comcast' });
  const b = addLead({ name: 'Multi Two', notes: 'line one\nline two' });
  const before = site.db._rows('SELECT * FROM leads WHERE id IN (?, ?) ORDER BY id', a, b);
  await action('delete_leads', { ids: [a, b] });
  const r = await action('restore_deleted', { ids: [a, b, 999999] });
  assert.equal(r.status, 200);
  assert.match(r.data.message, /Put back 2 enquiries\. 1 could not be put back\./);
  assert.deepEqual(site.db._rows('SELECT * FROM leads WHERE id IN (?, ?) ORDER BY id', a, b), before, 'every field is back as it was');
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM deleted_leads WHERE id IN (?, ?)', a, b)[0].n, 0);
});

test('Recently Deleted: staff cannot see or use it', async () => {
  const res = await site.api('/api/dev/tools?tool=deleted', { headers: { cookie: `lovercfe_admin=${mariaCookie}` }, ip: '203.0.113.90' });
  assert.equal(res.status, 401);
});

// ---------- 8. Backups, spreadsheet, settings check ----------

test('backups include Recently Deleted and staff names, never password fingerprints or trusted devices', async () => {
  const id = addLead({ name: 'Backup Bin' });
  await action('delete_leads', { ids: [id] });
  const res = await site.api('/api/dev/backup', { headers: { cookie: `lovercfe_dev=${DEV}` }, ip: DEV_IP });
  assert.equal(res.status, 200);
  const text = await res.text();
  const backup = JSON.parse(text);
  assert.ok(backup.tables.recentlyDeleted.some((d) => d.id === id));
  assert.deepEqual(backup.tables.staffAccounts.map((s) => s.name), ['Maria López']);
  const hash = site.db._rows('SELECT pass_hash FROM staff_accounts LIMIT 1')[0].pass_hash;
  assert.ok(!text.includes(hash), 'no password fingerprints');
  assert.ok(!/pass_salt|trusted_devices/.test(text));
  assert.match(backup.notIncluded, /staff passwords/);
  // "Last changed by" survives a backup and restore
  const { cleanBackupLead } = await import('../lib/backup.js');
  const cleaned = cleanBackupLead({ created_at: '2026-01-02T03:04:05.000Z', name: 'A B', email: 'a@b.co', message: 'hello', updated_by: 'Maria López', updated_at: '2026-01-03T00:00:00.000Z' });
  assert.equal(cleaned.updated_by, 'Maria López');
  assert.equal(cleaned.updated_at, '2026-01-03T00:00:00.000Z');
});

test('the spreadsheet download guards against formulas hidden behind spaces or line breaks', async () => {
  const { csvCell, CSV_COLUMNS } = await import('../lib/leadtools.js');
  assert.equal(csvCell('=HYPERLINK("x")'), '"\'=HYPERLINK(""x"")"');
  assert.equal(csvCell('  =1+1'), '"\'  =1+1"');
  assert.equal(csvCell('\n+cmd'), '"\'\n+cmd"');
  assert.equal(csvCell('|calc'), '"\'|calc"');
  assert.equal(csvCell('Hello'), '"Hello"');
  assert.ok(CSV_COLUMNS.some(([k]) => k === 'updated_by'), 'the spreadsheet says who last changed each enquiry');
});

test('the console warns when the shared staff password is short, without ever showing it or its length', async () => {
  const { devConfigSummary } = await import('../lib/dev.js');
  assert.equal(devConfigSummary({ INBOX_PASSWORD: 'short' }).staffPasswordShort, true);
  assert.equal(devConfigSummary({ INBOX_PASSWORD: 'a long enough password' }).staffPasswordShort, false);
  const o = await overview();
  assert.equal(o.config.staffPasswordShort, false);
  assert.ok(!JSON.stringify(o).includes(INBOX_PASSWORD));
});
