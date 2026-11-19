// The developer console's Tools tab (see functions/api/dev/tools.js and public/corosone.js).
// Everything here only reads, except where noted; changes go through /api/dev/action.

import { normalizeIp, blockKey, isDeviceKey } from './blocklist.js';
import { networkLikePatterns } from './ipnet.js';
import { classifyNetwork, isTorExit, rdapLookup } from './netinfo.js';
import { infoFromJson, deviceAddresses, deviceSections } from './deviceinfo.js';

const HOUR = 60 * 60 * 1000;
const iso = (ms) => new Date(ms).toISOString();
const hoursBetween = (a, b) => (Date.parse(b) - Date.parse(a)) / HOUR;

// ---------- Follow-up alarm ----------
// Enquiries nobody has acted on yet (still "new", not handled, not a duplicate) that arrived
// more than a day ago, oldest first, plus how quickly enquiries were answered in the last 30 days.
// "Answered" = staff first moved it to another stage or marked it handled (first_response_at).
export async function followUp(db, nowMs = Date.now()) {
  const dayAgo = iso(nowMs - 24 * HOUR);
  const monthAgo = iso(nowMs - 30 * 24 * HOUR);
  const waitingSql = "handled = 0 AND first_response_at = '' AND stage = 'new' AND duplicate_of = 0";
  const [waiting, waitingCount, recent] = await Promise.all([
    db.prepare(`
      SELECT id, kind, inquiry_type AS inquiryType, name, phone, email, created_at AS createdAt
      FROM leads WHERE ${waitingSql} AND created_at < ? ORDER BY created_at ASC, id ASC LIMIT 200
    `).bind(dayAgo).all(),
    db.prepare(`SELECT COUNT(*) AS n FROM leads WHERE ${waitingSql} AND created_at < ?`).bind(dayAgo).first(),
    db.prepare(`
      SELECT created_at AS createdAt, first_response_at AS firstResponseAt FROM leads
      WHERE created_at >= ? AND duplicate_of = 0 ORDER BY created_at DESC LIMIT 5000
    `).bind(monthAgo).all(),
  ]);
  const rows = recent?.results || [];
  const times = rows
    .filter((r) => r.firstResponseAt)
    .map((r) => hoursBetween(r.createdAt, r.firstResponseAt))
    .filter((h) => Number.isFinite(h) && h >= 0)
    .sort((a, b) => a - b);
  const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2] : (times[times.length / 2 - 1] + times[times.length / 2]) / 2) : null;
  const round1 = (h) => (h === null ? null : Math.round(h * 10) / 10);
  return {
    ok: true,
    waitingCount: Number(waitingCount?.n || 0),
    waiting: (waiting?.results || []).map((r) => ({
      id: Number(r.id),
      kind: r.kind,
      inquiryType: r.inquiryType,
      name: r.name,
      phone: r.phone,
      email: r.email,
      createdAt: r.createdAt,
      hoursWaiting: Math.floor(hoursBetween(r.createdAt, iso(nowMs))),
    })),
    last30Days: {
      received: rows.length,
      answered: times.length,
      answeredWithinDay: times.filter((h) => h <= 24).length,
      medianHours: round1(median),
      averageHours: round1(times.length ? times.reduce((a, b) => a + b, 0) / times.length : null),
    },
  };
}

// ---------- Duplicate finder ----------
const normEmail = (v) => String(v || '').trim().toLowerCase();
const normPhone = (v) => {
  const digits = String(v || '').replace(/\D/g, '');
  return digits.length >= 7 ? digits.slice(-10) : '';
};
const normWords = (v) => String(v || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

// Groups of enquiries that look like the same person writing more than once: same email,
// same phone number, same name and city, or the same device. Checks the newest 3,000.
// Groups whose extra copies are all already marked as duplicates are left out.
export async function findDuplicates(db) {
  const res = await db.prepare(`
    SELECT id, kind, name, email, phone, city, created_at AS createdAt, handled, stage, duplicate_of AS duplicateOf, device
    FROM leads ORDER BY created_at DESC, id DESC LIMIT 3000
  `).all();
  const leads = (res?.results || []).map((r) => ({ ...r, id: Number(r.id), duplicateOf: Number(r.duplicateOf || 0), handled: Boolean(r.handled) }));

  // Union-find over the lead ids, joining any two that share a key.
  const parent = new Map(leads.map((l) => [l.id, l.id]));
  const find = (x) => { while (parent.get(x) !== x) { parent.set(x, parent.get(parent.get(x))); x = parent.get(x); } return x; };
  const reasonsByPair = new Map(); // root -> Set of reasons
  const seen = new Map(); // key -> first lead id
  const join = (a, b, reason) => {
    const ra = find(a);
    const rb = find(b);
    const merged = new Set([...(reasonsByPair.get(ra) || []), ...(reasonsByPair.get(rb) || []), reason]);
    if (ra !== rb) parent.set(rb, ra);
    reasonsByPair.set(find(a), merged);
  };
  for (const l of leads) {
    const keys = [];
    const email = normEmail(l.email);
    if (email) keys.push([`e:${email}`, 'Same email']);
    const phone = normPhone(l.phone);
    if (phone) keys.push([`p:${phone}`, 'Same phone']);
    const name = normWords(l.name);
    const city = normWords(l.city);
    if (name.length >= 3 && city) keys.push([`n:${name}|${city}`, 'Same name and city']);
    if (/^[0-9a-f]{64}$/.test(l.device || '')) keys.push([`d:${l.device}`, 'Same device']);
    for (const [key, reason] of keys) {
      if (seen.has(key)) join(seen.get(key), l.id, reason);
      else seen.set(key, l.id);
    }
  }

  const groups = new Map();
  for (const l of leads) {
    const root = find(l.id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root).push(l);
  }
  const out = [];
  for (const [root, members] of groups) {
    if (members.length < 2) continue;
    members.sort((a, b) => (a.createdAt < b.createdAt ? -1 : a.createdAt > b.createdAt ? 1 : a.id - b.id));
    const original = members[0];
    const unresolved = members.slice(1).filter((m) => !m.duplicateOf);
    if (!unresolved.length) continue;
    out.push({
      originalId: original.id,
      reasons: [...(reasonsByPair.get(root) || [])].sort(),
      newest: members[members.length - 1].createdAt,
      members: members.map((m) => ({
        id: m.id, kind: m.kind, name: m.name, email: m.email, phone: m.phone, city: m.city,
        createdAt: m.createdAt, handled: m.handled, stage: m.stage || 'new', duplicateOf: m.duplicateOf,
        device: m.device ? m.device.slice(0, 8) : '',
      })),
    });
  }
  out.sort((a, b) => (a.newest < b.newest ? 1 : -1));
  return { ok: true, checked: leads.length, groups: out.slice(0, 100), more: out.length > 100 };
}

// ---------- Visitor journey ----------
// What an enquirer looked at on the site before writing in: page visits from the same address
// in the 30 days before the enquiry (and the hour after). The visit log keeps the newest 5,000
// visits for up to 30 days, so older journeys may be incomplete.
export async function journey(db, id) {
  const lead = await db.prepare(`
    SELECT id, name, ip, ip_place AS ipPlace, isp, asn, device, created_at AS createdAt FROM leads WHERE id = ?
  `).bind(id).first();
  if (!lead) return { ok: false, status: 404, error: 'That enquiry no longer exists.' };
  const created = Date.parse(lead.createdAt);
  const network = classifyNetwork({ asn: lead.asn, isp: lead.isp });
  if (!lead.ip || !Number.isFinite(created)) {
    return { ok: true, lead: publicLead(lead), network, visits: [], others: [], note: 'No address was recorded for this enquiry, so its visits cannot be matched.' };
  }
  const fromSec = Math.floor(created / 1000) - 30 * 86400;
  const toSec = Math.floor(created / 1000) + 3600;
  const [visits, others] = await Promise.all([
    db.prepare(`
      SELECT at, path, status, place, device FROM request_log
      WHERE kind = 'view' AND ip = ? AND at BETWEEN ? AND ? ORDER BY id ASC LIMIT 200
    `).bind(lead.ip, fromSec, toSec).all(),
    db.prepare(`
      SELECT id, name, created_at AS createdAt, CASE WHEN device != '' AND device = ? THEN 'device' ELSE 'address' END AS sameBy
      FROM leads WHERE id != ? AND (ip = ? OR (device != '' AND device = ?)) ORDER BY created_at DESC LIMIT 20
    `).bind(lead.device || '', lead.id, lead.ip, lead.device || '').all(),
  ]);
  return {
    ok: true,
    lead: publicLead(lead),
    network,
    visits: (visits?.results || []).map((v) => ({ at: Number(v.at), path: v.path, status: Number(v.status || 0), place: v.place, browser: v.device })),
    others: (others?.results || []).map((o) => ({ id: Number(o.id), name: o.name, createdAt: o.createdAt, sameBy: o.sameBy })),
  };
}

function publicLead(l) {
  return { id: Number(l.id), name: l.name, ip: l.ip || '', ipPlace: l.ipPlace || '', isp: l.isp || '', createdAt: l.createdAt, device: l.device ? l.device.slice(0, 8) : '' };
}

// ---------- One enquiry's full device report ----------
// The same report as in the developer's sign-in email: both addresses and everything known
// about the device that sent it. Developer console only.
export async function leadDevice(db, id) {
  const row = await db.prepare('SELECT id, name, created_at AS createdAt, device_type AS deviceType, device_info AS deviceInfo FROM leads WHERE id = ?').bind(id).first();
  if (!row) return { ok: false, status: 404, error: 'That enquiry no longer exists.' };
  const info = infoFromJson(row.deviceInfo);
  const addr = info ? deviceAddresses(info) : { long: null, short: null };
  return {
    ok: true,
    id: Number(row.id),
    name: row.name,
    deviceType: row.deviceType || '',
    addresses: [
      addr.long ? { kind: 'long', ip: addr.long.ip, source: addr.long.source } : null,
      addr.short ? { kind: 'short', ip: addr.short.ip, source: addr.short.source } : null,
    ].filter(Boolean),
    sections: info ? deviceSections(info) : [],
  };
}

// ---------- Everything about one IP address ----------
export async function ipReport(db, rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return { ok: false, status: 400, error: 'That is not a valid IP address (for example 203.0.113.7).' };
  const key = blockKey(ip);
  const isLong = ip.includes(':');
  // A long address is blocked as its whole home or phone network (/64), so its records are
  // gathered for the whole network. The search looks for that network only (so records of other
  // networks at the same provider can never crowd them out of the limit); each result is then
  // checked here. A long address that is really a short one (::ffff:1.2.3.4) is looked up as both.
  const sameNet = (other) => (isLong ? blockKey(other) === key : other === ip);
  const patterns = isLong ? networkLikePatterns(ip) : [];
  const exact = patterns.length ? [] : [...new Set([ip, key])];
  const where = [...exact.map(() => 'ip = ?'), ...patterns.map(() => 'ip LIKE ?')].join(' OR ');
  const params = [...exact, ...patterns];
  const [visits, leads, activity, block] = await Promise.all([
    db.prepare(`SELECT id, at, path, status, ip, place, device, asn, isp FROM request_log WHERE kind = 'view' AND (${where}) ORDER BY id DESC LIMIT 2000`).bind(...params).all(),
    db.prepare(`SELECT id, name, kind, ip, created_at AS createdAt, handled, asn, isp FROM leads WHERE (${where}) ORDER BY created_at DESC LIMIT 500`).bind(...params).all(),
    db.prepare(`SELECT id, at, event, ip, info FROM dev_audit WHERE (${where}) ORDER BY id DESC LIMIT 500`).bind(...params).all(),
    // Only a block that is still in force (an ended one stays in the table until it is tidied away)
    db.prepare('SELECT ip, reason, created_at AS createdAt, expires_at AS expiresAt, hits FROM blocked_ips WHERE (ip = ? OR ip = ?) AND (expires_at = 0 OR expires_at > ?)').bind(key, ip, Math.floor(Date.now() / 1000)).first(),
  ]);
  const v = (visits?.results || []).filter((r) => sameNet(r.ip));
  const l = (leads?.results || []).filter((r) => sameNet(r.ip));
  const a = (activity?.results || []).filter((r) => sameNet(r.ip));

  // The network number and owner Cloudflare reported for this address, from the newest record.
  let asn = '';
  let isp = '';
  for (const r of [...v, ...l]) { if (r.asn || r.isp) { asn = r.asn || ''; isp = r.isp || ''; break; } }
  if (!asn && !isp) {
    for (const r of a) {
      const info = infoFromJson(r.info);
      if (info?.seen?.asn || info?.seen?.isp) { asn = String(info.seen.asn || ''); isp = String(info.seen.isp || ''); break; }
    }
  }

  const [registry, tor] = await Promise.all([rdapLookup(ip), isTorExit(ip)]);
  const network = classifyNetwork({ asn, isp, owner: registry.ok ? [registry.owner, registry.network].filter(Boolean).join(' ') : '', tor: tor === true });
  return {
    ok: true,
    ip,
    blockKey: key,
    network: { ...network, asn, isp, torChecked: tor !== null },
    registry,
    blocked: block ? { key: block.ip, reason: block.reason || '', createdAt: Number(block.createdAt), expiresAt: Number(block.expiresAt), hits: Number(block.hits || 0) } : null,
    visits: {
      count: v.length,
      first: v.length ? Number(v[v.length - 1].at) : null,
      last: v.length ? Number(v[0].at) : null,
      recent: v.slice(0, 25).map((r) => ({ at: Number(r.at), path: r.path, status: Number(r.status || 0), ip: r.ip, place: r.place, browser: r.device })),
    },
    leads: l.slice(0, 50).map((r) => ({ id: Number(r.id), name: r.name, kind: r.kind, ip: r.ip, createdAt: r.createdAt, handled: Boolean(r.handled) })),
    activity: { count: a.length, recent: a.slice(0, 15).map((r) => ({ id: Number(r.id), at: Number(r.at), event: r.event, ip: r.ip })) },
  };
}

// The network label for a table row (no outside lookups).
export function rowNetwork(asn, isp) {
  const n = classifyNetwork({ asn, isp });
  return { kind: n.kind, label: n.label, hidden: n.hidden, isp: isp || '' };
}

export { isDeviceKey };
