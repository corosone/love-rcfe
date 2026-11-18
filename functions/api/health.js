// GET /api/health: is the site's server working, and can it reach its database?
//
// Used by the daily site check (.github/workflows/site-check.yml), which emails the owner
// through GitHub when something is wrong. Anyone may call it: the reply holds no personal or
// configuration details, only "ok" or "not ok". It only reads from the database (one tiny
// query), so it never uses up the free plan's daily database writes.
import { ensureSchema, jsonResponse, senderKey, tooManyRequests } from '../../lib/db.js';

export async function onRequestGet({ request, env }) {
  // In memory only: 30 a minute from one sender is far more than any check needs.
  if (tooManyRequests(`health:${senderKey(request)}`, 30, 60 * 1000)) {
    return jsonResponse({ ok: false, error: 'Too many requests.' }, 429);
  }
  if (!env?.DB) {
    return jsonResponse({ ok: false, database: 'not connected' }, 503);
  }
  try {
    await ensureSchema(env.DB);
    await env.DB.prepare('SELECT 1 FROM leads LIMIT 1').all();
    return jsonResponse({ ok: true, database: 'ok' }, 200);
  } catch (err) {
    console.error('Health check: database error:', err);
    return jsonResponse({ ok: false, database: 'error' }, 503);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
