import { jsonResponse, clean, readJsonBody, authorizeAdmin } from '../../../lib/db.js';

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
    createdAt: row.createdAt,
  };
}

export async function onRequestGet({ request, env }) {
  const denied = await authorizeAdmin(request, env);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
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
    return jsonResponse({
      leads: rows.map(mapLead),
      total,
      hasMore: offset + rows.length < total,
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

  const urlId = new URL(request.url).searchParams.get('id');
  const rawId = urlId && urlId.trim() ? urlId : body?.id;
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Invalid lead id.' }, 400);
  }

  try {
    const result = await env.DB
      .prepare('DELETE FROM leads WHERE id = ?')
      .bind(id)
      .run();

    if (!result?.meta?.changes) {
      return jsonResponse({ error: 'Lead not found.' }, 404);
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
