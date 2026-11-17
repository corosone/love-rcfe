import { jsonResponse, clean, readJsonBody, authorizeAdmin, readDevSession } from '../../../lib/db.js';
import { devAudit } from '../../../lib/dev.js';

const STAGES = ['new', 'called', 'tour', 'waiting'];
const DEFAULT_LIMIT = 500;
const MAX_OFFSET = 50000;

const LEAD_COLUMNS = `
  id,
  kind,
  inquiry_type AS inquiryType,
  name,
  email,
  phone,
  city,
  message,
  preferred_date AS preferredDate,
  preferred_time AS preferredTime,
  handled,
  stage,
  notes,
  source,
  ip,
  ip_place AS ipPlace,
  created_at AS createdAt
`;

function mapLead(row) {
  if (!row) return null;
  return {
    id: row.id,
    kind: row.kind,
    inquiryType: row.inquiryType,
    name: row.name,
    email: row.email,
    phone: row.phone,
    city: row.city,
    message: row.message,
    preferredDate: row.preferredDate,
    preferredTime: row.preferredTime,
    handled: Boolean(row.handled),
    stage: row.stage || 'new',
    notes: row.notes || '',
    source: row.source || '',
    ip: row.ip || '',
    ipPlace: row.ipPlace || '',
    createdAt: row.createdAt,
  };
}

export async function onRequestGet({ request, env }) {
  const denied = await authorizeAdmin(request, env);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;

  // ?summary=1: just the counts, for the number in the browser tab title while the inbox
  // tab is in the background (much lighter than loading every message).
  if (params.get('summary') === '1') {
    try {
      const row = await env.DB
        .prepare('SELECT COUNT(*) AS total, COALESCE(SUM(CASE WHEN handled = 0 THEN 1 ELSE 0 END), 0) AS open FROM leads')
        .first();
      return jsonResponse({ ok: true, open: Number(row?.open || 0), total: Number(row?.total || 0) });
    } catch (err) {
      console.error('Failed to count leads:', err);
      return jsonResponse({ error: 'Database read error.' }, 500);
    }
  }

  const rawLimit = Number(params.get('limit') || DEFAULT_LIMIT);
  const rawOffset = Number(params.get('offset') || 0);
  const limit = Number.isInteger(rawLimit) && rawLimit > 0 ? Math.min(rawLimit, DEFAULT_LIMIT) : DEFAULT_LIMIT;
  const offset = Number.isInteger(rawOffset) && rawOffset >= 0 ? Math.min(rawOffset, MAX_OFFSET) : 0;

  try {
    const [countRow, listRes] = await Promise.all([
      env.DB.prepare('SELECT COUNT(*) AS total FROM leads').first(),
      env.DB
        .prepare(`SELECT ${LEAD_COLUMNS} FROM leads ORDER BY created_at DESC LIMIT ? OFFSET ?`)
        .bind(limit, offset)
        .all(),
    ]);

    const rows = listRes?.results || [];
    const total = Number(countRow?.total ?? rows.length);
    // Lets the inbox show a link back to the developer console for a signed-in developer.
    const developer = Boolean(await readDevSession(request, env).catch(() => null));
    return jsonResponse({
      leads: rows.map(mapLead),
      total,
      hasMore: offset + rows.length < total,
      ...(developer ? { developer: true } : {}),
    });
  } catch (err) {
    console.error('Failed to load leads:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export async function onRequestPatch({ request, env }) {
  const denied = await authorizeAdmin(request, env);
  if (denied) return denied;

  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const urlId = new URL(request.url).searchParams.get('id');
  const rawId = body.id !== undefined && body.id !== null ? body.id : urlId;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Invalid lead id.' }, 400);
  }

  // Only update the fields that were actually sent as own properties.
  const sets = [];
  const values = [];
  if (Object.hasOwn(body, 'handled')) {
    sets.push('handled = ?');
    values.push(body.handled === true || body.handled === 1 ? 1 : 0);
  }
  if (Object.hasOwn(body, 'stage')) {
    if (!STAGES.includes(body.stage)) {
      return jsonResponse({ error: 'Invalid stage.' }, 400);
    }
    sets.push('stage = ?');
    values.push(body.stage);
  }
  if (Object.hasOwn(body, 'notes')) {
    sets.push('notes = ?');
    values.push(clean(body.notes, 2000));
  }
  if (!sets.length) {
    return jsonResponse({ error: 'Nothing to update.' }, 400);
  }

  try {
    await env.DB
      .prepare(`UPDATE leads SET ${sets.join(', ')} WHERE id = ?`)
      .bind(...values, id)
      .run();

    const updated = await env.DB
      .prepare(`SELECT ${LEAD_COLUMNS} FROM leads WHERE id = ?`)
      .bind(id)
      .first();

    if (!updated) {
      return jsonResponse({ error: 'Lead not found.' }, 404);
    }

    return jsonResponse({ lead: mapLead(updated) });
  } catch (err) {
    console.error('Failed to update lead:', err);
    return jsonResponse({ error: 'Database update error.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const denied = await authorizeAdmin(request, env);
  if (denied) return denied;

  const parsed = await readJsonBody(request, 2048, { allowEmpty: true });
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  const urlParams = new URL(request.url).searchParams;
  const urlId = urlParams.get('id');
  // "Mark as spam" deletes the message like Delete does, and also notes the sender's address
  // in the developer's activity log so the owner can decide whether to block it.
  const spam = urlParams.get('spam') === '1' || body?.spam === true;
  const rawId = urlId && urlId.trim() ? urlId : body?.id;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Invalid lead id.' }, 400);
  }

  try {
    const removed = await env.DB
      .prepare('DELETE FROM leads WHERE id = ? RETURNING ip, ip_place')
      .bind(id)
      .first();

    if (!removed) {
      return jsonResponse({ error: 'Lead not found.' }, 404);
    }

    if (spam) {
      const sender = String(removed.ip || '').trim();
      const place = String(removed.ip_place || '').trim();
      await devAudit(env, request, 'staff_marked_spam', sender ? `${sender}${place ? ` · ${place}` : ''}` : 'sender address not recorded');
    }
    return jsonResponse({ ok: true, id });
  } catch (err) {
    console.error('Failed to delete lead:', err);
    return jsonResponse({ error: 'Database delete error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PATCH, DELETE' });
}
