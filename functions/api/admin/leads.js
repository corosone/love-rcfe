import { ensureSchema, jsonResponse, clientIp, tooManyRequests, isAdmin } from '../../../lib/db.js';

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
    createdAt: row.createdAt,
  };
}

async function authorize(request, env) {
  if (!env?.INBOX_PASSWORD) {
    return jsonResponse(
      { error: 'INBOX_PASSWORD is not configured yet. Add it in Cloudflare Pages → Settings → Variables and Secrets.' },
      503
    );
  }

  if (tooManyRequests(`admin:${clientIp(request)}`, 60, 60 * 1000)) {
    return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  if (!(await isAdmin(request, env))) {
    return jsonResponse({ error: 'Incorrect password.' }, 401);
  }

  if (!env?.DB) {
    return jsonResponse(
      { error: 'D1 database is not bound yet. Bind your D1 database as "DB" in Cloudflare Pages → Settings → Bindings.' },
      503
    );
  }

  try {
    await ensureSchema(env.DB);
  } catch (err) {
    console.error('Database initialization failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  return null;
}

export async function onRequestGet({ request, env }) {
  const denied = await authorize(request, env);
  if (denied) return denied;

  const { results } = await env.DB
    .prepare(`
      SELECT
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
        created_at AS createdAt
      FROM leads
      ORDER BY created_at DESC
      LIMIT 500
    `)
    .all();

  return jsonResponse({ leads: (results || []).map(mapLead) });
}

export async function onRequestPatch({ request, env }) {
  const denied = await authorize(request, env);
  if (denied) return denied;

  let body = {};
  try {
    body = await request.json();
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  const urlId = new URL(request.url).searchParams.get('id');
  const id = Number(body?.id ?? urlId);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Invalid lead id.' }, 400);
  }

  const handledVal = body?.handled ? 1 : 0;
  const update = await env.DB
    .prepare('UPDATE leads SET handled = ? WHERE id = ?')
    .bind(handledVal, id)
    .run();

  if (!update?.meta?.changes) {
    return jsonResponse({ error: 'Lead not found.' }, 404);
  }

  const updated = await env.DB
    .prepare(`
      SELECT
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
        created_at AS createdAt
      FROM leads
      WHERE id = ?
    `)
    .bind(id)
    .first();

  return jsonResponse({ lead: mapLead(updated) });
}

export async function onRequestDelete({ request, env }) {
  const denied = await authorize(request, env);
  if (denied) return denied;

  let body = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const urlId = new URL(request.url).searchParams.get('id');
  const id = Number(urlId ?? body?.id);
  if (!Number.isInteger(id) || id <= 0) {
    return jsonResponse({ error: 'Invalid lead id.' }, 400);
  }

  const result = await env.DB
    .prepare('DELETE FROM leads WHERE id = ?')
    .bind(id)
    .run();

  if (!result?.meta?.changes) {
    return jsonResponse({ error: 'Lead not found.' }, 404);
  }

  return jsonResponse({ ok: true, id });
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, PATCH, DELETE' });
}
