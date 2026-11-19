// Full backup and restore for the developer console.
//
// The backup file holds everything worth keeping: enquiries, Recently Deleted enquiries, the
// activity log, the page-visit log, the blocked-address list and the staff account names
// (never their password fingerprints). It deliberately leaves out sign-in sessions, pending
// sign-in codes, lockouts, rate-limit counters and the site's internal secrets: those are
// temporary security records that the site recreates by itself, and a copy of them in a
// downloaded file would only be a risk. Staff passwords are left out too: after a restore into a
// new database, give each person a new password from the console.
//
// Restore puts enquiries back from a backup file. It only ADDS enquiries that are missing
// (same date, email and message = already there); it never changes or deletes anything.

import { clean } from './db.js';
import { normalizeIp } from './blocklist.js';
import { cleanStoredInfo } from './deviceinfo.js';

export const BACKUP_FORMAT = 'love-rcfe-backup';
export const BACKUP_VERSION = 1;
export const RESTORE_BATCH = 25; // Cloudflare's free plan allows 50 database queries per request
const MAX_LEADS = 50000;

const LEAD_FIELDS = [
  'id', 'created_at', 'kind', 'inquiry_type', 'name', 'email', 'phone', 'city', 'message',
  'preferred_date', 'preferred_time', 'handled', 'stage', 'notes', 'source', 'ip', 'ip_place',
  'first_response_at', 'handled_at', 'isp', 'asn', 'device', 'duplicate_of', 'device_type', 'device_info',
  'updated_by', 'updated_at',
];
const STAGES = ['new', 'called', 'tour', 'waiting'];
const KINDS = ['enquiry', 'call_request'];
const ISO_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?Z$/;

// When the last full backup was downloaded, so the Monday summary email can remind the owner
// to download a new one (Cloudflare's free plan only keeps 7 days of database history, so a
// copy on the owner's own computer is the one that survives a serious accident). Kept in
// app_secrets, not only in the activity log, because the activity log can be cleared.
const LAST_BACKUP_NAME = 'last_backup_download';

export async function noteBackupDownloaded(db, nowSec = Math.floor(Date.now() / 1000)) {
  await db
    .prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .bind(LAST_BACKUP_NAME, String(nowSec))
    .run();
}

// Seconds since 1970 of the last full backup download, or 0 if there has never been one.
// Also looks at the activity log, for backups downloaded before this was recorded separately.
export async function lastBackupAt(db) {
  const row = await db
    .prepare(`
      SELECT MAX(
        COALESCE((SELECT CAST(value AS INTEGER) FROM app_secrets WHERE name = ?), 0),
        COALESCE((SELECT MAX(at) FROM dev_audit WHERE event = 'backup_download'), 0)
      ) AS at
    `)
    .bind(LAST_BACKUP_NAME)
    .first();
  return Number(row?.at) || 0;
}

export async function buildBackup(db, origin) {
  const [leads, activity, visits, blocks, deleted, staff] = await Promise.all([
    db.prepare(`SELECT ${LEAD_FIELDS.join(', ')} FROM leads ORDER BY id LIMIT ?`).bind(MAX_LEADS).all(),
    db.prepare('SELECT at, event, ip, detail FROM dev_audit ORDER BY id').all(),
    db.prepare("SELECT at, path, status, ip, place, device, asn, isp FROM request_log WHERE kind = 'view' ORDER BY id").all(),
    db.prepare('SELECT ip, reason, created_at, expires_at, hits, last_hit FROM blocked_ips ORDER BY created_at').all(),
    db.prepare('SELECT id, deleted_at, deleted_by, reason, lead FROM deleted_leads ORDER BY deleted_at').all(),
    db.prepare('SELECT name, created_at, last_sign_in FROM staff_accounts ORDER BY name').all(),
  ]);
  const tables = {
    leads: leads?.results || [],
    recentlyDeleted: deleted?.results || [],
    activity: activity?.results || [],
    pageVisits: visits?.results || [],
    blockedIps: blocks?.results || [],
    staffAccounts: staff?.results || [],
  };
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    createdAt: new Date().toISOString(),
    site: origin,
    counts: Object.fromEntries(Object.entries(tables).map(([name, rows]) => [name, rows.length])),
    notIncluded: 'Sign-in sessions, trusted devices, pending sign-in codes, lockouts, rate-limit counters, staff passwords and internal secrets are left out on purpose. The site recreates them by itself; staff get new passwords from the console.',
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
    updated_by: clean(raw.updated_by, 60),
    updated_at: optionalIso(raw.updated_at),
    // Re-checked field by field rather than copied (a backup file may have been edited or damaged).
    device_info: cleanStoredInfo(raw.device_info),
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
          first_response_at, handled_at, isp, asn, device, device_type, device_info, updated_by, updated_at
        )
        SELECT ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        WHERE NOT EXISTS (SELECT 1 FROM leads WHERE created_at = ? AND email = ? AND message = ?)
      `)
      .bind(
        l.kind, l.inquiry_type, l.name, l.email, l.phone, l.city, l.message, l.preferred_date, l.preferred_time,
        l.handled, l.created_at, l.stage, l.notes, l.source, l.ip, l.ip_place,
        l.first_response_at, l.handled_at, l.isp, l.asn, l.device, l.device_type, l.device_info, l.updated_by, l.updated_at,
        l.created_at, l.email, l.message
      )
      .run();
    if (Number(res?.meta?.changes || 0) > 0) added++;
    else skipped++;
  }
  return { added, skipped, invalid };
}
