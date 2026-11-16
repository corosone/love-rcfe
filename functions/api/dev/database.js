// GET /api/dev/database — row counts for every table and the database size, compared with
// Cloudflare's free-plan limits. Developer session required. Only counts are returned.
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev } from '../../../lib/dev.js';

// Fixed list (never built from user input).
const TABLES = [
  ['leads', 'Enquiries'],
  ['dev_audit', 'Activity log'],
  ['request_log', 'Request log'],
  ['rate_limits', 'Rate-limit counters'],
  ['auth_attempts', 'Wrong-password records'],
  ['admin_sessions', 'Staff sessions'],
  ['dev_sessions', 'Developer sessions'],
  ['dev_challenges', 'Pending sign-in codes'],
  ['app_secrets', 'Site settings and secrets'],
];
const FREE_DB_SIZE_BYTES = 500 * 1024 * 1024; // 500 MB per database on the free plan

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  try {
    const results = await Promise.all(
      TABLES.map(([table]) => env.DB.prepare(`SELECT COUNT(*) AS n FROM ${table}`).all())
    );
    // D1 reports the database size after each query in meta.size_after.
    let sizeBytes = null;
    for (const r of results) {
      const s = Number(r?.meta?.size_after);
      if (Number.isFinite(s) && s > 0) sizeBytes = Math.max(sizeBytes || 0, s);
    }
    return jsonResponse({
      ok: true,
      tables: TABLES.map(([table, label], i) => ({ table, label, rows: Number(results[i]?.results?.[0]?.n || 0) })),
      sizeBytes,
      limits: { sizeBytes: FREE_DB_SIZE_BYTES, rowsReadPerDay: 5000000, rowsWrittenPerDay: 100000 },
    });
  } catch (err) {
    console.error('Database check failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
