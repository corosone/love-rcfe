// GET /api/dev/requests — the request log (developer session required)
//   ?q=      text to look for in the IP address, page/API address, location or browser
//   ?type=   all | view | api | errors
//   ?before= show rows older than this row number (for "Load older")
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev } from '../../../lib/dev.js';
import { requestLogPaused, KEEP_ROWS, KEEP_DAYS } from '../../../lib/requestlog.js';

const PAGE_SIZE = 100;
const TYPES = new Set(['all', 'view', 'api', 'errors']);
const likeEscape = (s) => s.replace(/[\\%_]/g, (c) => `\\${c}`);

export async function onRequestGet({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  const params = new URL(request.url).searchParams;
  const q = (params.get('q') || '').trim().slice(0, 100);
  const type = TYPES.has(params.get('type')) ? params.get('type') : 'all';
  const beforeRaw = Number(params.get('before'));
  const before = Number.isInteger(beforeRaw) && beforeRaw > 0 ? beforeRaw : 0;

  const where = [];
  const binds = [];
  if (type === 'view') where.push("kind = 'view'");
  else if (type === 'api') where.push("kind = 'api'");
  else if (type === 'errors') where.push('status >= 400');
  if (q) {
    const like = `%${likeEscape(q)}%`;
    where.push("(ip = ? OR ip LIKE ? ESCAPE '\\' OR path LIKE ? ESCAPE '\\' OR place LIKE ? ESCAPE '\\' OR device LIKE ? ESCAPE '\\')");
    binds.push(q, like, like, like, like);
  }
  if (before) {
    where.push('id < ?');
    binds.push(before);
  }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const dayAgo = Math.floor(Date.now() / 1000) - 86400;

  try {
    const [rows, summary, top, paused] = await Promise.all([
      env.DB
        .prepare(`SELECT id, at, kind, method, path, status, ip, place, device FROM request_log ${whereSql} ORDER BY id DESC LIMIT ?`)
        .bind(...binds, PAGE_SIZE + 1)
        .all(),
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN kind = 'view' THEN 1 ELSE 0 END), 0) AS views,
          COALESCE(SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS errors,
          COUNT(DISTINCT ip) AS ips
        FROM request_log WHERE at >= ? AND kind != 'note'
      `).bind(dayAgo).first(),
      env.DB.prepare(`
        SELECT ip, COUNT(*) AS n, MAX(at) AS last, MAX(id) AS lastId,
          COALESCE(SUM(CASE WHEN status >= 400 THEN 1 ELSE 0 END), 0) AS errors
        FROM request_log WHERE at >= ? AND kind != 'note'
        GROUP BY ip ORDER BY n DESC, last DESC LIMIT 10
      `).bind(dayAgo).all(),
      requestLogPaused(env, { fresh: true }),
    ]);

    const topRows = top?.results || [];
    const placeById = new Map();
    if (topRows.length) {
      const ids = topRows.map((r) => Number(r.lastId));
      const places = await env.DB
        .prepare(`SELECT id, place, device FROM request_log WHERE id IN (${ids.map(() => '?').join(', ')})`)
        .bind(...ids)
        .all();
      for (const r of places?.results || []) placeById.set(Number(r.id), { place: r.place, device: r.device });
    }

    const list = rows?.results || [];
    const hasMore = list.length > PAGE_SIZE;
    return jsonResponse({
      ok: true,
      paused: Boolean(paused),
      keep: { rows: KEEP_ROWS, days: KEEP_DAYS },
      last24h: {
        total: Number(summary?.total || 0),
        views: Number(summary?.views || 0),
        errors: Number(summary?.errors || 0),
        uniqueIps: Number(summary?.ips || 0),
      },
      topIps: topRows.map((r) => ({
        ip: r.ip,
        count: Number(r.n || 0),
        errors: Number(r.errors || 0),
        last: Number(r.last || 0),
        place: placeById.get(Number(r.lastId))?.place || '',
        device: placeById.get(Number(r.lastId))?.device || '',
      })),
      requests: list.slice(0, PAGE_SIZE).map((r) => ({
        id: Number(r.id),
        at: Number(r.at),
        kind: r.kind,
        method: r.method,
        path: r.path,
        status: Number(r.status || 0),
        ip: r.ip,
        place: r.place,
        device: r.device,
      })),
      hasMore,
    });
  } catch (err) {
    console.error('Request log read failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
