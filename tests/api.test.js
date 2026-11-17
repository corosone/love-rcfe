// Tests for the server code in /functions and /lib (enquiries, staff sign-in, blocking,
// the weekly summary). They run the real code against an in-memory database; nothing is
// sent to the live site, and outside services (Turnstile, Resend, Formspree) are stand-ins.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server.js');

const CRON_SECRET = 'test-cron-secret-0123456789abcdef-0123456789';
const INBOX_PASSWORD = 'correct horse battery staple';

let site;

before(async () => {
  site = await startServer({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    REQUIRE_TURNSTILE: 'true',
    INBOX_PASSWORD,
    SESSION_SECRET: 'test-session-secret-0123456789abcdef0123456789abcdef',
    DEV_EMAIL: 'owner@example.com',
    RESEND_API_KEY: 're_test_key',
    FORMSPREE_ENDPOINT: 'https://formspree.io/f/testform',
    CRON_SECRET,
  });
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

test('the weekly summary refuses callers without the secret', async () => {
  site.outside.length = 0;
  const none = await site.api('/api/cron/weekly-summary', { method: 'POST', ip: '203.0.113.60' });
  assert.equal(none.status, 401);
  const wrong = await site.api('/api/cron/weekly-summary', { method: 'POST', headers: { authorization: 'Bearer wrong-secret' }, ip: '203.0.113.60' });
  assert.equal(wrong.status, 401);
  const get = await site.api('/api/cron/weekly-summary', { headers: { authorization: `Bearer ${CRON_SECRET}` } });
  assert.equal(get.status, 405);
  assert.equal(site.outside.length, 0, 'no email was sent');
});

test('guessing the weekly summary secret is slowed down', async () => {
  let res;
  for (let i = 0; i < 12; i++) {
    res = await site.api('/api/cron/weekly-summary', { method: 'POST', headers: { authorization: `Bearer guess-${i}` }, ip: '203.0.113.61' });
  }
  assert.equal(res.status, 429);
});

test('the weekly summary emails numbers only, and tells the caller nothing else', async () => {
  site.outside.length = 0;
  const res = await site.api('/api/cron/weekly-summary', { method: 'POST', headers: { authorization: `Bearer ${CRON_SECRET}` }, ip: '203.0.113.62' });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { ok: true, sent: true });

  const mail = site.outside.find((c) => c.url === 'https://api.resend.com/emails');
  assert.ok(mail, 'an email was sent through Resend');
  const sent = JSON.parse(mail.body);
  assert.deepEqual(sent.to, ['owner@example.com']);
  assert.match(sent.subject, /weekly summary: \d+ new enquir/);

  const total = leadCount();
  assert.match(sent.text, new RegExp(`New this week: ${total} \\(`));
  if (process.env.SHOW_EMAIL) console.log(sent.subject + '\n' + sent.text);
  assert.match(sent.text, /Staff inbox: 1 sign-ins, 9 wrong passwords\n/);
  assert.match(sent.text, /sign-in lock\(s\) are active right now/);
  assert.match(sent.text, /Active blocks: 1 \(1 added this week\)/);
  assert.match(sent.text, /Page views: \d+/);

  // No personal details of families
  for (const secret of ['Test Person', 'test@example.com', '555-0100', 'Looking for a care home', '203.0.113.']) {
    assert.ok(!sent.text.includes(secret), `the email must not contain "${secret}"`);
    assert.ok(!sent.subject.includes(secret));
  }
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

test('the weekly summary does nothing until CRON_SECRET is set', async () => {
  const { onRequestPost } = await import('../functions/api/cron/weekly-summary.js');
  for (const value of [undefined, '', 'too-short']) {
    const res = await onRequestPost({
      request: new Request(site.origin + '/api/cron/weekly-summary', { method: 'POST', headers: { authorization: `Bearer ${value || ''}` } }),
      env: { ...site.env, CRON_SECRET: value },
    });
    assert.equal(res.status, 503);
  }
});
