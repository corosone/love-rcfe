// Full backup and restore for the developer console.
//
// The backup file holds everything worth keeping: enquiries, the activity log, the page-visit
// log and the blocked-address list. It deliberately leaves out sign-in sessions, pending
// sign-in codes, lockouts, rate-limit counters and the site's internal secrets: those are
// temporary security records that the site recreates by itself, and a copy of them in a
// downloaded file would only be a risk.
//
// Restore puts enquiries back from a backup file. It only ADDS enquiries that are missing
// (same date, email and message = already there); it never changes or deletes anything.

import { clean } from './db.js';
import { normalizeIp } from './blocklist.js';
import { infoFromJson, infoToJson } from './deviceinfo.js';

export const BACKUP_FORMAT = 'love-rcfe-backup';
export const BACKUP_VERSION = 1;
export const RESTORE_BATCH = 25; // Cloudflare's free plan allows 50 database queries per request
const MAX_LEADS = 50000;

const LEAD_FIELDS = [
  'id', 'created_at', 'kind', 'inquiry_type', 'name', 'email', 'phone', 'city', 'message',
  'preferred_date', 'preferred_time', 'handled', 'stage', 'notes', 'source', 'ip', 'ip_place',
  'first_response_at', 'handled_at', 'isp', 'asn', 'device', 'duplicate_of', 'device_type', 'device_info',
];
const STAGES = ['new', 'called', 'tour', 'waiting'];
const KINDS = ['enquiry', 'call_request'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

export async function buildBackup(db, origin) {
  const [leads, activity, visits, blocks] = await Promise.all([
    db.prepare(`SELECT ${LEAD_FIELDS.join(', ')} FROM leads ORDER BY id LIMIT ?`).bind(MAX_LEADS).all(),
    db.prepare('SELECT at, event, ip, detail FROM dev_audit ORDER BY id').all(),
    db.prepare("SELECT at, path, status, ip, place, device, asn, isp FROM request_log WHERE kind = 'view' ORDER BY id").all(),
    db.prepare('SELECT ip, reason, created_at, expires_at, hits, last_hit FROM blocked_ips ORDER BY created_at').all(),
  ]);
  const tables = {
    leads: leads?.results || [],
    activity: activity?.results || [],
    pageVisits: visits?.results || [],
    blockedIps: blocks?.results || [],
  };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    site: origin,
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    notIncluded: 'Sign-in sessions, pending sign-in codes, lockouts, rate-limit counters and internal secrets are left out on purpose. The site recreates them by itself.',
    tables,
  };
}

const optionalIso = (v) => {
  const s = typeof v === 'string' ? v.trim() : '';
  return ISO_RE.test(s) && !Number.isNaN(Date.parse(s)) ? s : '';
};

// Cleans one enquiry from a backup file. Returns the values to store, or null if it is not usable.
export function cleanBackupLead(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const createdAt = typeof raw.created_at === 'string' ? raw.created_at.trim() : '';
  if (!ISO_RE.test(createdAt) || Number.isNaN(Date.parse(createdAt))) return null;
  const name = clean(raw.name, 120);
  const email = clean(raw.email, 254);
  const message = clean(raw.message, 3000);
  if (!name || !email || !message) return null;
  const optional = (v, max) => { const s = clean(v, max); return s || null; };
  const ip = raw.ip === 'unknown' ? 'unknown' : normalizeIp(raw.ip);
  return {
    kind: KINDS.includes(raw.kind) ? raw.kind : 'enquiry',
    inquiry_type: clean(raw.inquiry_type, 80) || 'General Inquiry',
    name,
    email,
    phone: clean(raw.phone, 40),
    city: clean(raw.city, 100),
    message,
    preferred_date: optional(raw.preferred_date, 80),
    preferred_time: optional(raw.preferred_time, 80),
    handled: raw.handled === 1 || raw.handled === true || raw.handled === '1' ? 1 : 0,
    created_at: createdAt,
    stage: STAGES.includes(raw.stage) ? raw.stage : 'new',
    notes: typeof raw.notes === 'string' ? raw.notes.replace(/\u0000/g, '').slice(0, 2000) : '',
    source: clean(raw.source, 40),
    ip,
    ip_place: ip ? clean(raw.ip_place, 80) : '',
    // Kept when they are in the file (backups made before these existed simply leave them empty).
    // duplicate_of is not restored: enquiry numbers change when they are added back.
    first_response_at: optionalIso(raw.first_response_at),
    handled_at: optionalIso(raw.handled_at),
    isp: ip ? clean(raw.isp, 100) : '',
    asn: /^\d{1,10}$/.test(String(raw.asn ?? '')) ? String(raw.asn) : '',
    device: typeof raw.device === 'string' && /^[0-9a-f]{64}$/.test(raw.device) ? raw.device : '',
    device_type: ['phone', 'tablet', 'computer'].includes(raw.device_type) ? raw.device_type : '',
    // Re-checked rather than copied: only a report in the expected shape is put back.
    device_info: (() => { const info = infoFromJson(raw.device_info); return info ? infoToJson(info) : ''; })(),
  };
}

// Adds the enquiries that are not in the database yet. Returns { added, skipped, invalid }.
export async function restoreLeads(db, rows) {
  let added = 0;
  let skipped = 0;
  let invalid = 0;
  for (const raw of rows) {
    const l = cleanBackupLead(raw);
    if (!l) { invalid++; continue; }
    const res = await db
      .prepare(`
        INSERT INTO leads (
          kind, inquiry_type, name, email, phone, city, message, preferred_date, preferred_time,
          handled, created_at, stage, notes, source, ip, ip_place,
          first_response_at, handled_at, isp, asn, device, device_type, device_info
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM leads WHERE created_at = ? AND email = ? AND message = ?)
      `)
      .bind(
        l.kind, l.inquiry_type, l.name, l.email, l.phone, l.city, l.message, l.preferred_date, l.preferred_time,
        l.handled, l.created_at, l.stage, l.notes, l.source, l.ip, l.ip_place,
        l.first_response_at, l.handled_at, l.isp, l.asn, l.device, l.device_type, l.device_info,
        l.created_at, l.email, l.message
      )
      .run();
    if (Number(res?.meta?.changes || 0) > 0) added++;
    else skipped++;
  }
  return { added, skipped, invalid };
}
