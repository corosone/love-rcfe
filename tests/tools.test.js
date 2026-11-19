// Tests for the developer console's Tools tab and what feeds it: network and device details
// saved with enquiries, the follow-up alarm, the duplicate finder, the holiday switch, the IP
// address check (with the VPN check), the visitor journey and the care-home licence lookup.
// Outside services (the internet registry, the Tor list, the State of California) are stand-ins.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { startServer } = require('./helpers/server.js');

const INBOX_PASSWORD = 'staff password for tools tests';
const DEV_LOGIN = { email: 'owner@example.com', password: 'developer password for tools tests', turnstile_token: 't' };
let site;
let dev = ''; // developer session cookie
let staff = ''; // staff session cookie

before(async () => {
  site = await startServer({
    TURNSTILE_SECRET: 'test-turnstile-secret',
    REQUIRE_TURNSTILE: 'true',
    INBOX_PASSWORD,
    SESSION_SECRET: 'tools-test-session-secret-0123456789abcdef',
    DEV_EMAIL: DEV_LOGIN.email,
    DEV_PASSWORD: DEV_LOGIN.password,
    RESEND_API_KEY: 're_test_key',
  });
  // Developer sign-in (email + password, then the emailed code)
  const step1 = await site.api('/api/dev/login', { method: 'POST', body: DEV_LOGIN, ip: '203.0.113.250' });
  assert.equal(step1.status, 200);
  const challenge = step1.headers.getSetCookie()[0].split(';')[0];
  const mail = site.outside.filter((c) => c.url === 'https://api.resend.com/emails').at(-1);
  const code = /code is: (\d{6})/.exec(JSON.parse(mail.body).text)[1];
  const step2 = await site.api('/api/dev/verify', { method: 'POST', body: { code }, headers: { cookie: challenge }, ip: '203.0.113.250' });
  assert.equal(step2.status, 200);
  dev = step2.headers.getSetCookie().find((c) => c.startsWith('lovercfe_dev=')).split(';')[0];
  const s = await site.api('/api/admin/session', { method: 'POST', body: { password: INBOX_PASSWORD, turnstile_token: 't' }, ip: '203.0.113.251' });
  staff = s.headers.getSetCookie()[0].split(';')[0];
});

after(async () => {
  await site.close();
});

const tool = async (params) => {
  const res = await site.api('/api/dev/tools?' + new URLSearchParams(params), { headers: { cookie: dev }, ip: '203.0.113.250' });
  return { status: res.status, data: await res.json() };
};
const action = async (name, options) => {
  const res = await site.api('/api/dev/action', { method: 'POST', body: { action: name, options }, headers: { cookie: dev }, ip: '203.0.113.250' });
  return { status: res.status, data: await res.json() };
};
const enquiry = (extra = {}) => ({
  kind: 'enquiry', name: 'Rosa Martinez', email: 'rosa@example.com', phone: '(818) 555-0142', city: 'Burbank',
  inquiry_type: 'Family Care Placement', message: 'Looking for a small home for my father.', turnstile_token: 't', ...extra,
});
const DEVICE_A = 'a1'.repeat(32);
const DEVICE_B = 'b2'.repeat(32);
const row = (id) => site.db._rows('SELECT * FROM leads WHERE id = ?', id)[0];
const lastLead = () => site.db._rows('SELECT * FROM leads ORDER BY id DESC LIMIT 1')[0];
const iso = (hoursAgo) => new Date(Date.now() - hoursAgo * 3600000).toISOString();
function addLead(fields) {
  const f = { kind: 'enquiry', inquiry_type: 'x', name: 'Test', email: 't@example.com', phone: '8185550100', city: '', message: 'm', created_at: iso(1), handled: 0, stage: 'new', ip: '', isp: '', asn: '', device: '', first_response_at: '', ...fields };
  const cols = Object.keys(f);
  site.db._run(`INSERT INTO leads (${cols.join(', ')}) VALUES (${cols.map(() => '?').join(', ')})`, ...cols.map((c) => f[c]));
  return site.db._rows('SELECT MAX(id) AS id FROM leads')[0].id;
}

// Sends an enquiry the way Cloudflare would, including Cloudflare's network details for the sender.
async function postWithNetwork(body, { ip = '203.0.113.60', asn = 7922, org = 'Comcast Cable Communications, LLC' } = {}) {
  const { onRequestPost } = await import('../functions/api/leads.js');
  const request = new Request(site.origin + '/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: site.origin, 'x-forwarded-for': ip },
    body: JSON.stringify(body),
  });
  Object.defineProperty(request, 'cf', { value: { asn, asOrganization: org, city: 'Burbank', country: 'US' } });
  const background = [];
  const res = await onRequestPost({ request, env: site.env, waitUntil: (p) => background.push(p) });
  await Promise.all(background);
  return res;
}

// ---------- What is saved with an enquiry ----------

test('an enquiry saves the sender\'s network (from Cloudflare) and a valid device check code', async () => {
  const res = await postWithNetwork(enquiry({ device: DEVICE_A }));
  assert.equal(res.status, 201);
  const l = lastLead();
  assert.equal(l.isp, 'Comcast Cable Communications, LLC');
  assert.equal(l.asn, '7922');
  assert.equal(l.device, DEVICE_A);
  for (const bad of ['not-a-code', 'A1'.repeat(32), 'a1'.repeat(31), 12345]) {
    assert.equal((await postWithNetwork(enquiry({ device: bad, email: `bad${String(bad).length}@example.com` }), { ip: '203.0.113.61' })).status, 201);
    assert.equal(lastLead().device, '', `${bad} is not stored`);
  }
});

test('a page visit saves the sender\'s network too', async () => {
  const { onRequestPost } = await import('../functions/api/visit.js');
  const request = new Request(site.origin + '/api/visit', {
    method: 'POST', headers: { 'content-type': 'application/json', origin: site.origin, 'x-forwarded-for': '203.0.113.62' }, body: JSON.stringify({ path: '/', view: 'services' }),
  });
  Object.defineProperty(request, 'cf', { value: { asn: 60068, asOrganization: 'Datacamp Limited' } });
  const background = [];
  assert.equal((await onRequestPost({ request, env: site.env, waitUntil: (p) => background.push(p) })).status, 204);
  await Promise.all(background);
  const v = site.db._rows("SELECT asn, isp, path FROM request_log WHERE ip = '203.0.113.62'")[0];
  assert.deepEqual([v.asn, v.isp, v.path], ['60068', 'Datacamp Limited', '/#services']);
});

test('a blocked device cannot send enquiries from any address; other devices can', async () => {
  const blocked = await action('block_ip', { ip: `device:${DEVICE_B}`, reason: 'spam', days: 7 });
  assert.equal(blocked.status, 200, blocked.data.message);
  assert.match(blocked.data.message, /device b2b2b2b2/);
  assert.match(blocked.data.message, /Someone determined can get around a device block/, 'the message is honest about its limits');
  const { _resetBlockCache } = await import('../lib/blocklist.js');
  _resetBlockCache();
  const before = site.db._rows('SELECT COUNT(*) AS n FROM leads')[0].n;
  for (const ip of ['203.0.113.63', '198.51.100.64']) {
    const res = await site.api('/api/leads', { method: 'POST', body: enquiry({ device: DEVICE_B }), ip });
    assert.equal(res.status, 403, `refused from ${ip}`);
  }
  assert.equal(site.db._rows('SELECT COUNT(*) AS n FROM leads')[0].n, before);
  assert.equal((await site.api('/api/leads', { method: 'POST', body: enquiry({ device: DEVICE_A, email: 'other@example.com' }), ip: '203.0.113.65' })).status, 201);
  const unblocked = await action('unblock_ip', { ip: `device:${DEVICE_B}` });
  assert.equal(unblocked.status, 200);
  _resetBlockCache();
  assert.equal((await site.api('/api/leads', { method: 'POST', body: enquiry({ device: DEVICE_B, email: 'later@example.com' }), ip: '203.0.113.66' })).status, 201);
});

// ---------- Follow-up alarm ----------

test('staff actions record the first reply and when an enquiry was handled', async () => {
  const id = addLead({ name: 'Reply Timing' });
  const patch = (body) => site.api('/api/admin/leads', { method: 'PATCH', body: { id, ...body }, headers: { cookie: staff }, ip: '203.0.113.251' });
  await patch({ notes: 'left a voicemail' });
  assert.equal(row(id).first_response_at, '', 'a note alone is not a reply');
  await patch({ stage: 'called' });
  const first = row(id).first_response_at;
  assert.match(first, /^\d{4}-\d{2}-\d{2}T/);
  await patch({ stage: 'new' });
  await patch({ handled: true });
  assert.equal(row(id).first_response_at, first, 'the first reply time never changes');
  assert.match(row(id).handled_at, /^\d{4}-\d{2}-\d{2}T/);
  await patch({ handled: false });
  assert.equal(row(id).handled_at, '', 'reopening clears it');
  const listed = await (await site.api('/api/admin/leads', { headers: { cookie: staff }, ip: '203.0.113.251' })).json();
  assert.equal(listed.leads.find((l) => l.id === id).firstResponseAt, first);
});

test('follow-up alarm: lists enquiries waiting more than a day, oldest first, and reply times', async () => {
  const old = addLead({ name: 'Waiting Three Days', created_at: iso(72) });
  const older = addLead({ name: 'Waiting Five Days', created_at: iso(120) });
  addLead({ name: 'Fresh', created_at: iso(3) });
  addLead({ name: 'Already Called', created_at: iso(90), stage: 'called', first_response_at: iso(80) });
  addLead({ name: 'Already Handled', created_at: iso(90), handled: 1, first_response_at: iso(89) });
  addLead({ name: 'Marked Duplicate', created_at: iso(90), duplicate_of: old });
  const { status, data } = await tool({ tool: 'followup' });
  assert.equal(status, 200);
  const names = data.waiting.map((w) => w.name);
  assert.deepEqual(names.slice(0, 2), ['Waiting Five Days', 'Waiting Three Days']);
  for (const n of ['Fresh', 'Already Called', 'Already Handled', 'Marked Duplicate']) assert.ok(!names.includes(n), n);
  assert.equal(data.waiting[0].hoursWaiting, 120);
  assert.equal(data.waitingCount, data.waiting.length);
  assert.ok(data.last30Days.answered >= 2);
  assert.ok(data.last30Days.answeredWithinDay >= 2);
  assert.equal(typeof data.last30Days.medianHours, 'number');
  assert.ok(older > 0);
});

test('the weekly summary mentions enquiries waiting more than 2 days', async () => {
  const { buildWeeklySummary, unusualItems } = await import('../functions/api/cron/weekly-summary.js');
  const s = await buildWeeklySummary(site.db);
  assert.ok(s.enquiries.waitingOverTwoDays >= 2);
  assert.ok(unusualItems(s).some((u) => /waited more than 2 days with no reply/.test(u)));
});

// ---------- Duplicate finder ----------

test('duplicate finder: groups the same person by email, phone, name and city, or device', async () => {
  const a = addLead({ name: 'Grace Kim', email: 'grace@example.com', phone: '(213) 555-0177', city: 'Koreatown', created_at: iso(50) });
  const b = addLead({ name: 'Grace  KIM', email: ' GRACE@example.com', phone: '213.555.0177', city: 'koreatown', created_at: iso(20) });
  const c = addLead({ name: 'G. Kim', email: 'other-grace@example.com', phone: '+1 213 555 0177', created_at: iso(10) });
  const d1 = addLead({ name: 'Device One', email: 'd1@example.com', phone: '7145550001', device: 'c3'.repeat(32), created_at: iso(30) });
  const d2 = addLead({ name: 'Device Two', email: 'd2@example.com', phone: '9495550002', device: 'c3'.repeat(32), created_at: iso(5) });
  addLead({ name: 'Nobody Else', email: 'unique@example.com', phone: '5105550003', created_at: iso(5) });
  const { status, data } = await tool({ tool: 'duplicates' });
  assert.equal(status, 200);
  const grace = data.groups.find((g) => g.members.some((m) => m.id === a));
  assert.deepEqual(grace.members.map((m) => m.id), [a, b, c], 'oldest first');
  assert.equal(grace.originalId, a);
  assert.deepEqual(grace.reasons, ['Same email', 'Same name and city', 'Same phone']);
  const devices = data.groups.find((g) => g.members.some((m) => m.id === d1));
  assert.deepEqual(devices.members.map((m) => m.id), [d1, d2]);
  assert.deepEqual(devices.reasons, ['Same device']);
  assert.ok(!data.groups.some((g) => g.members.some((m) => m.name === 'Nobody Else')));

  // Marking: moves it to Handled with a note, points at the original, never deletes
  const marked = await action('mark_duplicate', { id: b, of: a });
  assert.equal(marked.status, 200, marked.data.message);
  assert.deepEqual([row(b).duplicate_of, row(b).handled], [a, 1]);
  assert.match(row(b).notes, new RegExp(`Duplicate of #${a}`));
  // Pointing at a duplicate points at its original instead (no chains)
  await action('mark_duplicate', { id: c, of: b });
  assert.equal(row(c).duplicate_of, a);
  const after = await tool({ tool: 'duplicates' });
  assert.ok(!after.data.groups.some((g) => g.originalId === a), 'a fully sorted group disappears');
  // Undo
  assert.equal((await action('unmark_duplicate', { id: c })).status, 200);
  assert.equal(row(c).duplicate_of, 0);
  assert.ok((await tool({ tool: 'duplicates' })).data.groups.some((g) => g.originalId === a), 'the group is back');
  // Refusals
  assert.equal((await action('mark_duplicate', { id: a, of: a })).status, 400);
  assert.equal((await action('mark_duplicate', { id: a, of: 999999 })).status, 404);
  assert.equal((await action('mark_duplicate', { id: a, of: c })).status, 200, 'any two different enquiries may be marked');
});

// ---------- Holiday switch ----------

test('holiday switch: refuses bad dates, pauses call bookings on those days only, then opens again', async () => {
  const { pacificToday, addDays, _resetSettingsCache } = await import('../lib/settings.js');
  const today = pacificToday();
  const empty = await (await site.api('/api/settings')).json();
  assert.deepEqual(empty, { holiday: null });

  for (const [opts, re] of [
    [{ from: addDays(today, 5), to: addDays(today, 2) }, /on or after/],
    [{ from: addDays(today, -10), to: addDays(today, -3) }, /already passed/],
    [{ from: addDays(today, 1), to: addDays(today, 200) }, /at most 120 days/],
    [{ from: 'soon', to: '' }, /first and last day/],
  ]) {
    const r = await action('set_holiday', opts);
    assert.equal(r.status, 400);
    assert.match(r.data.message, re);
  }

  // A break starting on a Tuesday: the Monday before it, and the Wednesday inside it, are both call days
  let from = addDays(today, 10);
  while (new Date(from + 'T00:00:00Z').getUTCDay() !== 2) from = addDays(from, 1);
  const to = addDays(from, 4);
  const set = await action('set_holiday', { from, to });
  assert.equal(set.status, 200, set.data.message);
  const settings = await site.api('/api/settings');
  assert.match(settings.headers.get('cache-control'), /max-age=60/);
  assert.deepEqual(await settings.json(), { holiday: { from, to } });
  assert.deepEqual((await tool({ tool: 'holiday' })).data.holiday, { from, to });

  const call = (date, ip) => site.api('/api/leads', { method: 'POST', body: enquiry({ kind: 'call_request', preferred_date: date, preferred_time: 'Morning (9am - 12pm)', email: `call${ip}@example.com` }), ip });
  const inBreak = addDays(from, 1);
  const refused = await call(inBreak, '203.0.113.70');
  assert.equal(refused.status, 422);
  assert.equal((await refused.json()).error, 'We are away on that date. Please pick another date.');
  assert.equal((await call(addDays(from, -1), '203.0.113.71')).status, 201, 'the day before the break is fine');
  assert.equal((await site.api('/api/leads', { method: 'POST', body: enquiry({ email: 'msg@example.com' }), ip: '203.0.113.72' })).status, 201, 'messages still arrive during a break');

  // A break that has ended is no longer shown
  site.db._run("UPDATE app_secrets SET value = ? WHERE name = 'holiday'", JSON.stringify({ from: addDays(today, -9), to: addDays(today, -2) }));
  _resetSettingsCache();
  assert.deepEqual(await (await site.api('/api/settings')).json(), { holiday: null });

  await action('set_holiday', { from, to });
  assert.equal((await action('clear_holiday')).status, 200);
  assert.deepEqual(await (await site.api('/api/settings')).json(), { holiday: null });
  assert.equal((await call(inBreak, '203.0.113.73')).status, 201, 'bookings work again');
});

test('holiday switch: after a long break that ends beyond the usual 3 months, the first days back can still be booked', async () => {
  const { pacificToday, addDays } = await import('../lib/settings.js');
  const today = pacificToday();
  const to = addDays(today, 110);
  assert.equal((await action('set_holiday', { from: addDays(today, 1), to })).status, 200);
  const notSunday = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() === 0 ? addDays(d, 1) : d);
  const call = (date, ip) => site.api('/api/leads', { method: 'POST', body: enquiry({ kind: 'call_request', preferred_date: date, preferred_time: 'Morning (9am - 12pm)', email: `long${ip.split('.').pop()}@example.com` }), ip });
  try {
    const back = notSunday(addDays(to, 1));
    assert.equal((await call(back, '203.0.113.76')).status, 201, `the first day back (${back}) can be booked`);
    const later = await call(notSunday(addDays(to, 10)), '203.0.113.77');
    assert.equal(later.status, 422, 'but not weeks after it');
    assert.match((await later.json()).error, /within the next 3 months/);
  } finally {
    assert.equal((await action('clear_holiday')).status, 200);
  }
  assert.equal((await call(notSunday(addDays(today, 101)), '203.0.113.78')).status, 422, 'without a break, the usual limit applies');
});

test('holiday switch: a break set far ahead does not let calls be booked beyond the usual 3 months', async () => {
  const { pacificToday, addDays } = await import('../lib/settings.js');
  const today = pacificToday();
  const notSunday = (d) => (new Date(d + 'T00:00:00Z').getUTCDay() === 0 ? addDays(d, 1) : d);
  const call = (date, ip) => site.api('/api/leads', { method: 'POST', body: enquiry({ kind: 'call_request', preferred_date: date, preferred_time: 'Morning (9am - 12pm)', email: `far${ip.split('.').pop()}@example.com` }), ip });
  // One week off, 200 days from now
  assert.equal((await action('set_holiday', { from: addDays(today, 200), to: addDays(today, 206) })).status, 200);
  try {
    const far = await call(notSunday(addDays(today, 150)), '203.0.113.81');
    assert.equal(far.status, 422, 'a call 150 days ahead is still refused');
    assert.match((await far.json()).error, /within the next 3 months/);
    assert.equal((await call(notSunday(addDays(today, 30)), '203.0.113.82')).status, 201, 'the usual dates work as always');
    // A break that starts within the usual dates and runs past them: the limit moves to just after it
    const to = addDays(today, 110);
    assert.equal((await action('set_holiday', { from: addDays(today, 95), to })).status, 200);
    assert.equal((await call(notSunday(addDays(to, 1)), '203.0.113.83')).status, 201, 'the first day back can be booked');
    assert.equal((await call(notSunday(addDays(today, 90)), '203.0.113.84')).status, 201, 'so can a day before the break');
    assert.equal((await call(notSunday(addDays(to, 10)), '203.0.113.85')).status, 422, 'but not weeks after it');
  } finally {
    assert.equal((await action('clear_holiday')).status, 200);
  }
});

// ---------- VPN check ----------

test('network check: tells VPNs, data centres, relays, mobile and home connections apart', async () => {
  const { classifyNetwork } = await import('../lib/netinfo.js');
  const kind = (o) => classifyNetwork(o).kind;
  assert.equal(kind({ tor: true, asn: '7922' }), 'tor');
  assert.equal(kind({ asn: '36183', isp: 'Akamai Technologies, Inc.' }), 'relay');
  assert.equal(kind({ asn: '13335' }), 'relay');
  assert.equal(kind({ asn: '39351' }), 'vpn');
  assert.equal(kind({ isp: 'Proton AG' }), 'vpn');
  assert.equal(kind({ owner: 'NordVPN S.A.' }), 'vpn');
  assert.equal(kind({ asn: '16509', isp: 'Amazon.com, Inc.' }), 'hosting');
  assert.equal(kind({ isp: 'DigitalOcean, LLC' }), 'hosting');
  assert.equal(kind({ asn: '21928', isp: 'T-Mobile USA, Inc.' }), 'mobile');
  assert.equal(kind({ asn: '7922', isp: 'Comcast Cable Communications, LLC' }), 'home');
  assert.equal(kind({ asn: '5650', isp: 'Frontier Communications of America, Inc.' }), 'home');
  assert.equal(kind({}), 'unknown');
  for (const k of ['tor', 'relay', 'vpn', 'hosting']) assert.equal(classifyNetwork({ tor: k === 'tor', asn: { relay: '36183', vpn: '39351', hosting: '16509' }[k] }).hidden, true);
});

// ---------- IP address check ----------

const RDAP_8 = {
  name: 'GOGL', handle: 'NET-8-8-8-0-2', startAddress: '8.8.8.0', endAddress: '8.8.8.255', port43: 'whois.arin.net',
  entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Google LLC']]],
    entities: [{ roles: ['abuse'], vcardArray: ['vcard', [['fn', {}, 'text', 'Abuse'], ['email', {}, 'text', 'network-abuse@google.com']]] }] }],
};

test('IP address check: owner from the registry, VPN guess, Tor, and everything the address did here', async () => {
  const { _resetNetCaches } = await import('../lib/netinfo.js');
  _resetNetCaches();
  site.setOutsideAnswer((url) => {
    if (url.startsWith('https://rdap.org/ip/')) return Response.json(RDAP_8);
    if (url === 'https://check.torproject.org/torbulkexitlist') return new Response('185.220.101.1\n171.25.193.25\n');
  });
  const ip = '8.8.8.8';
  site.db._run("INSERT INTO request_log (at, kind, method, path, status, ip, place, device, asn, isp) VALUES (?, 'view', 'GET', '/#services', 200, ?, 'Mountain View, US', 'Chrome on Linux', '15169', 'Google LLC')", Math.floor(Date.now() / 1000), ip);
  const leadId = addLead({ name: 'From Google', ip });
  const { status, data } = await tool({ tool: 'ip', ip });
  assert.equal(status, 200);
  assert.equal(data.registry.owner, 'Google LLC');
  assert.equal(data.registry.abuseEmail, 'network-abuse@google.com');
  assert.equal(data.registry.registry, 'ARIN (North America)');
  assert.equal(data.registry.range, '8.8.8.0 - 8.8.8.255');
  assert.equal(data.network.kind, 'hosting');
  assert.equal(data.network.isp, 'Google LLC');
  assert.equal(data.visits.count, 1);
  assert.deepEqual(data.leads.map((l) => l.id), [leadId]);
  const rdapCall = site.outside.filter((c) => c.url.startsWith('https://rdap.org/ip/')).at(-1);
  assert.equal(rdapCall.url, 'https://rdap.org/ip/8.8.8.8');
  assert.match(rdapCall.headers['User-Agent'], /LoveRCFE/, 'rdap.org refuses requests without a program name');
  assert.ok(site.db._rows("SELECT COUNT(*) AS n FROM dev_audit WHERE event = 'ip_lookup' AND detail = '8.8.8.8'")[0].n >= 1, 'the lookup is in the activity log');

  const tor = await tool({ tool: 'ip', ip: '185.220.101.1' });
  assert.equal(tor.data.network.kind, 'tor');

  // A long address is checked as its whole home or phone network
  addLead({ name: 'Phone A', ip: '2603:8001:9a00:1cc6::1' });
  addLead({ name: 'Phone B', ip: '2603:8001:9a00:1cc6:abcd::9' });
  addLead({ name: 'Elsewhere', ip: '2603:8001:9a00:ffff::1' });
  const v6 = await tool({ tool: 'ip', ip: '2603:8001:9a00:1cc6::5' });
  assert.equal(v6.data.blockKey, '2603:8001:9a00:1cc6::/64');
  assert.deepEqual(v6.data.leads.map((l) => l.name).sort(), ['Phone A', 'Phone B']);

  // The registry being down is reported, not a crash
  _resetNetCaches();
  site.setOutsideAnswer((url) => (url.startsWith('https://rdap.org/') ? new Response('busy', { status: 503 }) : undefined));
  const down = await tool({ tool: 'ip', ip: '9.9.9.9' });
  assert.equal(down.status, 200);
  assert.equal(down.data.registry.ok, false);
  assert.match(down.data.registry.error, /could not be reached/);
  assert.equal((await tool({ tool: 'ip', ip: 'not an address' })).status, 400);
  site.setOutsideAnswer(null);
});

// ---------- Visitor journey ----------

test('visitor journey: the pages an enquirer viewed before writing in, and their other enquiries', async () => {
  const ip = '203.0.113.90';
  const now = Math.floor(Date.now() / 1000);
  const visit = (agoSec, path) => site.db._run("INSERT INTO request_log (at, kind, method, path, status, ip, place, device) VALUES (?, 'view', 'GET', ?, 200, ?, 'Burbank, US', 'Safari on iOS')", now - agoSec, path, ip);
  visit(40 * 86400, '/#terms'); // too long before
  visit(3 * 86400, '/');
  visit(2 * 86400, '/#tools');
  visit(3600, '/es/#contact');
  visit(-7200, '/#privacy'); // two hours after the enquiry
  const earlier = addLead({ name: 'Same Device Earlier', ip: '198.51.100.91', device: 'd4'.repeat(32), created_at: iso(200) });
  const id = addLead({ name: 'Journey Person', ip, device: 'd4'.repeat(32), isp: 'Charter Communications', asn: '20115', created_at: new Date(now * 1000).toISOString() });
  const { status, data } = await tool({ tool: 'journey', id });
  assert.equal(status, 200);
  assert.deepEqual(data.visits.map((v) => v.path), ['/', '/#tools', '/es/#contact']);
  assert.equal(data.network.kind, 'home');
  assert.deepEqual(data.others.map((o) => [o.id, o.sameBy]), [[earlier, 'device']]);
  assert.equal((await tool({ tool: 'journey', id: 999999 })).status, 404);
});

// ---------- Care-home licence lookup ----------

const CHHS_RECORD = {
  facility_number: 198603605, facility_name: 'ARARAT GARDENS', licensee: 'ARARAT HOME OF LOS ANGELES, INC.', facility_administrator: 'A. ADMIN',
  facility_telephone_number: '(818) 244-7219', facility_address: '1230 EAST WINDSOR ROAD', facility_city: 'GLENDALE', facility_zip: '91205',
  county_name: 'LOS ANGELES', facility_capacity: 175, facility_status: 'LICENSED', license_first_date: '1/1/2000', closed_date: '', facility_type: 'RESIDENTIAL CARE ELDERLY',
};

test('licence lookup: searches the state\'s list safely and shows a home\'s inspection history', async () => {
  const { _resetLicenceCaches } = await import('../lib/licence.js');
  _resetLicenceCaches();
  site.setOutsideAnswer((url) => {
    if (url.includes('datastore_search_sql')) return Response.json({ success: true, result: { records: [CHHS_RECORD] } });
    if (url.includes('/transparencyapi/api/FacilityDetail/198603605')) {
      return Response.json({
        FacilityDetail: { FACILITYNUMBER: '198603605', FACILITYNAME: 'ARARAT GARDENS', STATUS: 'Licensed', CAPACITY: '175', LASTVISITDATE: '9/23/2026', NBRALLVISITS: '11', NBRINSPVISITS: '5', NBRCMPLTVISITS: '3', NBROTHERVISITS: '3', CMPCOUNT: '3', TOTSUBALG: '1', TOTINCALG: '0', TOTUNSALG: '6', TOTUNFALG: '0', TOTTYPEA: '0', TOTTYPEB: '1', COMMENTS: 'AGE RANGE 60 AND OVER.' },
        TSO: { FacilityNumber: '', CaseClosed: 'False', ActionType: '' },
      });
    }
  });
  const { status, data } = await tool({ tool: 'licence', q: "Ararat Gardens O'Neil" });
  assert.equal(status, 200);
  assert.equal(data.results[0].number, '198603605');
  assert.equal(data.results[0].page, 'https://www.ccld.dss.ca.gov/carefacilitysearch/FacDetail/198603605');
  const lastSql = () => new URL(site.outside.filter((c) => c.url.includes('datastore_search_sql')).at(-1).url).searchParams.get('sql');
  const sql = lastSql();
  assert.match(sql, /ILIKE '%o''neil%'|ILIKE '%O''Neil%'/, 'an apostrophe is written safely');
  assert.match(sql, /facility_status <> 'CLOSED'/);

  // Typed attack text never reaches the query as code
  await tool({ tool: 'licence', q: "x'; DROP TABLE y; -- %_\\" });
  const sql2 = lastSql();
  assert.ok(!sql2.includes(';'), 'no statement separator gets through');
  assert.ok(!sql2.includes('\\'), 'no backslash gets through');
  assert.ok(!/'%[^']*[%_][^']*%'/.test(sql2), 'wildcards typed by the user are dropped');
  assert.ok(!sql2.includes("x'"), 'no unpaired quote gets through');

  // Number and ZIP searches
  await tool({ tool: 'licence', q: '198-603-605' });
  assert.match(lastSql(), /facility_number = 198603605/);
  await tool({ tool: 'licence', q: '91205', closed: '1' });
  const zipSql = lastSql();
  assert.match(zipSql, /LIKE '91205%'/);
  assert.doesNotMatch(zipSql, /CLOSED/, 'closed homes included when asked');
  assert.equal((await tool({ tool: 'licence', q: 'x' })).status, 400);

  const detail = await tool({ tool: 'licence-detail', number: '198603605' });
  assert.equal(detail.status, 200);
  assert.deepEqual(detail.data.complaints, { total: 3, substantiated: 1, inconclusive: 0, unsubstantiated: 6, unfounded: 0 });
  assert.deepEqual(detail.data.citations, { typeA: 0, typeB: 1 });
  assert.equal(detail.data.legalAction, null);
  assert.equal(detail.data.lastVisit, '9/23/2026');

  // The state's service being down is reported with a link to its own search
  _resetLicenceCaches();
  site.setOutsideAnswer((url) => (url.includes('chhs.ca.gov') || url.includes('ccld.dss.ca.gov') ? new Response('down', { status: 500 }) : undefined));
  const down = await tool({ tool: 'licence', q: 'ararat' });
  assert.equal(down.status, 502);
  assert.match(down.data.error, /could not be reached/);
  assert.equal(down.data.searchPage, 'https://www.ccld.dss.ca.gov/carefacilitysearch/');
  site.setOutsideAnswer(null);
});

// ---------- Network and device in the console's lists, backups and spreadsheets ----------

test('the console\'s enquiry and visit lists show the network check; spam guesses use it', async () => {
  const vpn = addLead({ name: 'Through Datacamp', email: 'vpn@example.com', isp: 'Datacamp Limited', asn: '60068', ip: '203.0.113.99' });
  const res = await site.api('/api/dev/leads?q=vpn%40example.com', { headers: { cookie: dev }, ip: '203.0.113.250' });
  const l = (await res.json()).leads.find((x) => x.id === vpn);
  assert.equal(l.network.kind, 'hosting');
  assert.ok(l.flags.includes('Sent through a VPN or data centre'));
  const r = await (await site.api('/api/dev/requests?q=203.0.113.62', { headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  assert.equal(r.requests[0].network.kind, 'hosting');
});

test('backups and the spreadsheet keep the new details, and a restore puts them back', async () => {
  const id = addLead({ name: 'Backup Check', email: 'backup-check@example.com', message: 'unique backup message', isp: 'Comcast', asn: '7922', device: 'e5'.repeat(32), first_response_at: iso(2), handled_at: iso(1), handled: 1, ip: '203.0.113.120' });
  const backup = await (await site.api('/api/dev/backup', { headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  const saved = backup.tables.leads.find((x) => x.id === id);
  assert.equal(saved.device, 'e5'.repeat(32));
  assert.equal(saved.isp, 'Comcast');
  const csv = await (await site.api('/api/dev/leads-export', { headers: { cookie: dev }, ip: '203.0.113.250' })).text();
  assert.match(csv.split("\r\n")[0], /"Network","Sent from","First reply \(UTC\)","Marked handled \(UTC\)","Duplicate of","Device check code"/);
  site.db._run('DELETE FROM leads WHERE id = ?', id);
  const restore = await site.api('/api/dev/backup', { method: 'POST', body: { leads: [saved] }, headers: { cookie: dev }, ip: '203.0.113.250' });
  assert.equal((await restore.json()).added, 1);
  const back = site.db._rows("SELECT * FROM leads WHERE email = 'backup-check@example.com'")[0];
  assert.deepEqual([back.device, back.isp, back.asn, back.first_response_at, back.handled_at], [saved.device, 'Comcast', '7922', saved.first_response_at, saved.handled_at]);
});

test('every tool needs the developer sign-in', async () => {
  for (const t of ['followup', 'duplicates', 'holiday', 'ip&ip=8.8.8.8', 'licence&q=ararat', 'journey&id=1']) {
    const res = await site.api('/api/dev/tools?tool=' + t, { headers: { cookie: staff }, ip: '203.0.113.252' });
    assert.equal(res.status, 401, t);
  }
  const res = await site.api('/api/dev/action', { method: 'POST', body: { action: 'set_holiday', options: { from: '2030-01-01', to: '2030-01-02' } }, headers: { cookie: staff }, ip: '203.0.113.252' });
  assert.equal(res.status, 401);
  assert.equal((await tool({ tool: 'nonsense' })).status, 400);
});

// ---------- Full device report with each enquiry (developer console only) ----------

async function postWithHeaders(body, headers, ip) {
  const { onRequestPost } = await import('../functions/api/leads.js');
  const request = new Request(site.origin + '/api/leads', {
    method: 'POST',
    headers: { 'content-type': 'application/json', origin: site.origin, 'x-forwarded-for': ip, ...headers },
    body: JSON.stringify(body),
  });
  const res = await onRequestPost({ request, env: site.env, waitUntil: () => {} });
  return res;
}
const UA = {
  iphone: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1',
  ipad: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
  androidTablet: 'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  androidPhone: 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36',
  windows: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
  curl: 'curl/8.5.0',
};

test('device report: checked field by field, saved with the enquiry, with phone / tablet / computer', async () => {
  const client = {
    screenW: 1179, screenH: 2556, pixelRatio: 3, timezone: 'America/Los_Angeles', languages: ['en-US', 'es-US'],
    touchPoints: 5, gpu: 'Apple GPU', cores: 6, ipv6: '2603:8001:9a00:1cc6::77', ipv4: '8.8.8.8',
    // things that must be dropped
    evil: '<script>alert(1)</script>', screenW2: 'x'.repeat(9999), memory: 'lots', orientation: 'sideways',
    brands: [{ brand: 'Brave', version: '126.0.0.0' }, { brand: 'Not/A)Brand', version: '8' }],
  };
  const res = await postWithHeaders(enquiry({ email: 'report@example.com', client }), { 'user-agent': UA.iphone }, '203.0.113.130');
  assert.equal(res.status, 201);
  const row = site.db._rows("SELECT device_info, device_type FROM leads WHERE email = 'report@example.com'")[0];
  assert.equal(row.device_type, 'phone');
  const info = JSON.parse(row.device_info);
  assert.equal(info.seen.ip, '203.0.113.130');
  assert.equal(info.reported.screenW, 1179);
  assert.equal(info.reported.ipv6, '2603:8001:9a00:1cc6::77', 'the long address is kept: the site saw the short one');
  assert.equal(info.reported.ipv4, undefined, 'a reported short address is ignored: the site saw that one itself');
  assert.deepEqual(info.reported.brands, [{ brand: 'Brave', version: '126.0.0.0' }]);
  for (const k of ['evil', 'screenW2', 'memory', 'orientation']) assert.equal(info.reported[k], undefined, `${k} is dropped`);

  // Phone, tablet or computer
  const cases = [
    [UA.ipad, { touchPoints: 5 }, 'tablet'], [UA.ipad, { touchPoints: 0 }, 'computer'], [UA.androidTablet, {}, 'tablet'],
    [UA.androidPhone, {}, 'phone'], [UA.windows, {}, 'computer'], [UA.curl, {}, ''],
  ];
  for (const [ua, c, want] of cases) {
    const email = `type-${want || 'none'}-${Math.random().toString(36).slice(2, 7)}@example.com`;
    assert.equal((await postWithHeaders(enquiry({ email, client: c }), { 'user-agent': ua }, '203.0.113.131')).status, 201);
    assert.equal(site.db._rows('SELECT device_type FROM leads WHERE email = ?', email)[0].device_type, want, ua.slice(0, 40));
  }
  // Without any report (browser script blocked), the type still comes from the browser's name
  const bare = 'bare@example.com';
  await postWithHeaders(enquiry({ email: bare }), { 'user-agent': UA.androidPhone }, '203.0.113.132');
  assert.equal(site.db._rows('SELECT device_type FROM leads WHERE email = ?', bare)[0].device_type, 'phone');
});

test('device report: staff only get phone / tablet / computer; the console gets everything', async () => {
  const listed = await (await site.api('/api/admin/leads', { headers: { cookie: staff }, ip: '203.0.113.251' })).json();
  const mine = listed.leads.find((l) => l.email === 'report@example.com');
  assert.equal(mine.deviceType, 'phone');
  for (const k of ['deviceInfo', 'device_info', 'device', 'client']) assert.equal(mine[k], undefined, `staff never get ${k}`);
  assert.doesNotMatch(JSON.stringify(listed), /screenW|Apple GPU|2603:8001:9a00:1cc6::77/);

  const id = site.db._rows("SELECT id FROM leads WHERE email = 'report@example.com'")[0].id;
  const { status, data } = await tool({ tool: 'lead-device', id });
  assert.equal(status, 200);
  assert.equal(data.deviceType, 'phone');
  assert.deepEqual(data.addresses.map((a) => [a.kind, a.ip, a.source]), [['long', '2603:8001:9a00:1cc6::77', 'reported'], ['short', '203.0.113.130', 'seen']]);
  const titles = data.sections.map((s) => s.title);
  assert.ok(titles.includes('Addresses'));
  assert.ok(titles.some((t) => /^Device \(reported by the browser/.test(t)));
  const devRows = Object.fromEntries(data.sections.find((s) => /^Device/.test(s.title)).rows);
  assert.equal(devRows['Screen size'], '1179 x 2556');
  assert.equal(devRows['Exact browser version'], 'Brave 126.0.0.0');

  const search = await (await site.api('/api/dev/leads?q=report%40example.com', { headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  const row = search.leads.find((l) => l.id === id);
  assert.deepEqual([row.deviceType, row.hasInfo, row.otherIp], ['phone', true, { kind: 'long', ip: '2603:8001:9a00:1cc6::77' }]);
  assert.equal((await tool({ tool: 'lead-device', id: 999999 })).status, 404);
  const staffTry = await site.api(`/api/dev/tools?tool=lead-device&id=${id}`, { headers: { cookie: staff }, ip: '203.0.113.252' });
  assert.equal(staffTry.status, 401, 'staff cannot open the report');
});

test('device report: a message sent by automation software is flagged as likely spam', async () => {
  await postWithHeaders(enquiry({ email: 'robot@example.com', message: 'Automated hello there friend', client: { webdriver: true } }), { 'user-agent': UA.windows }, '203.0.113.133');
  const res = await (await site.api('/api/dev/leads?q=robot%40example.com', { headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  assert.ok(res.leads[0].flags.includes('Sent by automation software'));
});

test('device report: backups keep it, and a restore checks it again before putting it back', async () => {
  const backup = await (await site.api('/api/dev/backup', { headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  const saved = backup.tables.leads.find((x) => x.email === 'report@example.com');
  assert.equal(saved.device_type, 'phone');
  assert.match(saved.device_info, /"screenW":1179/);
  site.db._run("DELETE FROM leads WHERE email = 'report@example.com'");
  const tampered = { ...saved, device_info: '{"seen":"not an object"}', device_type: 'spaceship' };
  const restored = await (await site.api('/api/dev/backup', { method: 'POST', body: { leads: [tampered] }, headers: { cookie: dev }, ip: '203.0.113.250' })).json();
  assert.equal(restored.added, 1);
  const back = site.db._rows("SELECT device_info, device_type FROM leads WHERE email = 'report@example.com'")[0];
  assert.deepEqual([back.device_info, back.device_type], ['', ''], 'a report that is not in the expected shape is not restored');
  site.db._run("DELETE FROM leads WHERE email = 'report@example.com'");
  await site.api('/api/dev/backup', { method: 'POST', body: { leads: [saved] }, headers: { cookie: dev }, ip: '203.0.113.250' });
  assert.match(site.db._rows("SELECT device_info FROM leads WHERE email = 'report@example.com'")[0].device_info, /"screenW":1179/);
});
