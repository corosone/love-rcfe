// Recently Deleted: enquiries deleted in the staff inbox or the developer console are kept here
// for 30 days, so a deletion (by mistake, or by someone who should not have) can be undone from
// the developer console. After 30 days they are removed for good.
//
// The automatic clean-up of old enquiries (LEAD_RETENTION_DAYS) is different: it removes them
// for good straight away, because that is what it is for.

export const KEEP_DELETED_DAYS = 30;
const MAX_IDS = 50; // Cloudflare D1 allows at most 100 values in one query; stay well under it

// Every column of an enquiry, so one can be put back exactly as it was (same number too).
const COLUMNS = [
  'id', 'kind', 'inquiry_type', 'name', 'email', 'phone', 'city', 'message', 'preferred_date',
  'preferred_time', 'handled', 'created_at', 'stage', 'notes', 'source', 'ip', 'ip_place',
  'first_response_at', 'handled_at', 'isp', 'asn', 'device', 'duplicate_of', 'device_info',
  'device_type', 'updated_by', 'updated_at',
];
const JSON_OBJECT = `json_object(${COLUMNS.map((c) => `'${c}', ${c}`).join(', ')})`;
const nowSec = () => Math.floor(Date.now() / 1000);

export function cleanIds(raw) {
  const list = Array.isArray(raw) ? raw : [raw];
  const ids = [...new Set(list.map(Number))].filter((n) => Number.isInteger(n) && n > 0);
  return ids.length && ids.length === list.length && ids.length <= MAX_IDS ? ids : null;
}

// Removes old entries from the bin. Returns how many were removed.
export async function purgeDeletedLeads(db) {
  const res = await db.prepare('DELETE FROM deleted_leads WHERE deleted_at < ?').bind(nowSec() - KEEP_DELETED_DAYS * 86400).run();
  return Number(res?.meta?.changes || 0);
}

// Moves enquiries into the bin. by: who did it (a staff name, "Shared staff password" or
// "Developer"); reason: 'deleted' or 'spam'. Returns the removed rows' { id, ip, ip_place }.
export async function moveLeadsToBin(db, ids, { by = '', reason = 'deleted' } = {}) {
  const marks = ids.map(() => '?').join(', ');
  await db
    .prepare(`
      INSERT OR REPLACE INTO deleted_leads (id, deleted_at, deleted_by, reason, lead)
      SELECT id, ?, ?, ?, ${JSON_OBJECT} FROM leads WHERE id IN (${marks})
    `)
    .bind(nowSec(), String(by).slice(0, 60), reason === 'spam' ? 'spam' : 'deleted', ...ids)
    .run();
  const removed = await db.prepare(`DELETE FROM leads WHERE id IN (${marks}) RETURNING id, ip, ip_place`).bind(...ids).all();
  if (Math.random() < 0.2) await purgeDeletedLeads(db);
  return removed?.results || [];
}

const text = (v, max) => (v === null || v === undefined ? '' : String(v)).slice(0, max);

// The bin's contents for the console, newest first (no device details).
export async function listDeletedLeads(db, limit = 200) {
  await purgeDeletedLeads(db);
  const res = await db
    .prepare('SELECT id, deleted_at AS deletedAt, deleted_by AS deletedBy, reason, lead FROM deleted_leads ORDER BY deleted_at DESC, id DESC LIMIT ?')
    .bind(limit)
    .all();
  const total = await db.prepare('SELECT COUNT(*) AS n FROM deleted_leads').first();
  return {
    total: Number(total?.n || 0),
    keepDays: KEEP_DELETED_DAYS,
    items: (res?.results || []).map((r) => {
      let l = {};
      try { l = JSON.parse(r.lead) || {}; } catch { l = {}; }
      return {
        id: Number(r.id),
        deletedAt: Number(r.deletedAt) || 0,
        deletedBy: text(r.deletedBy, 60),
        reason: r.reason === 'spam' ? 'spam' : 'deleted',
        kind: l.kind === 'call_request' ? 'call_request' : 'enquiry',
        name: text(l.name, 120),
        email: text(l.email, 254),
        phone: text(l.phone, 40),
        createdAt: text(l.created_at, 40),
        message: text(l.message, 300),
      };
    }),
  };
}

// Puts enquiries back where they were, with the same number. Returns { restored, missing }.
// At most two database queries however many there are (Cloudflare's free plan allows 50 per request).
// An enquiry whose number is somehow taken already is left in the bin, never overwritten.
export const RESTORE_BATCH = 50;
// What a column gets back when the saved copy has no value for it (the table's own defaults).
const DEFAULTS = { kind: "'enquiry'", stage: "'new'", handled: '0', duplicate_of: '0' };
const NULLABLE = new Set(['preferred_date', 'preferred_time']);
const restoreValue = (c) => {
  const v = `json_extract(lead, '$.${c}')`;
  if (c === 'id' || NULLABLE.has(c)) return v;
  if (c === 'created_at') return `COALESCE(${v}, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))`;
  return `COALESCE(${v}, ${DEFAULTS[c] ?? "''"})`;
};
export async function restoreDeletedLeads(db, ids) {
  const marks = ids.map(() => '?').join(', ');
  const res = await db
    .prepare(`
      INSERT OR IGNORE INTO leads (${COLUMNS.join(', ')})
      SELECT ${COLUMNS.map(restoreValue).join(', ')}
      FROM deleted_leads WHERE id IN (${marks}) AND json_valid(lead) AND json_extract(lead, '$.id') = id
      RETURNING id
    `)
    .bind(...ids)
    .all();
  // Out of the bin only the ones really put back now: one whose number was already taken by a
  // different enquiry was skipped above, and stays in the bin.
  const back = (res?.results || []).map((r) => Number(r.id)).filter(Number.isInteger);
  if (back.length) {
    await db
      .prepare(`DELETE FROM deleted_leads WHERE id IN (${back.map(() => '?').join(', ')})`)
      .bind(...back)
      .run();
  }
  return { restored: back.length, missing: ids.length - back.length };
}

export async function deleteForever(db, ids) {
  const res = await db.prepare(`DELETE FROM deleted_leads WHERE id IN (${ids.map(() => '?').join(', ')})`).bind(...ids).run();
  return Number(res?.meta?.changes || 0);
}

export async function emptyBin(db) {
  const res = await db.prepare('DELETE FROM deleted_leads').run();
  return Number(res?.meta?.changes || 0);
}
