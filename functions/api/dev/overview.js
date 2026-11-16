// GET /api/dev/overview — everything the developer console shows (developer session required)
import { jsonResponse, clientIp } from '../../../lib/db.js';
import { authorizeDev, devConfigSummary, devLockState, retentionDays } from '../../../lib/dev.js';
import { placeFromDetail } from '../../../lib/reqinfo.js';
import { requestLogPaused } from '../../../lib/requestlog.js';
import { listBlocks, normalizeIp } from '../../../lib/blocklist.js';

// Events that count as failed or blocked sign-ins in the security summary.
const FAIL_EVENTS = ['wrong_password', 'wrong_code', 'blocked_locked', 'code_limit', 'staff_wrong_password', 'staff_locked_out'];
const FAIL_IN = FAIL_EVENTS.map(() => '?').join(', ');

export async function onRequestGet({ request, env }) {
  const { denied, session } = await authorizeDev(request, env);
  if (denied) return denied;

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const weekAgo = now - 7 * 86400;
  const keepDays = retentionDays(env);
  try {
    const [leads, staffSessions, devSessions, lockouts, audit, failCounts, failSources, lock, oldLeads, paused, blocks] = await Promise.all([
      env.DB.prepare(`
        SELECT
          COUNT(*) AS total,
          COALESCE(SUM(CASE WHEN handled = 0 THEN 1 ELSE 0 END), 0) AS open,
          COALESCE(SUM(CASE WHEN created_at >= strftime('%Y-%m-%dT%H:%M:%fZ', 'now', '-7 days') THEN 1 ELSE 0 END), 0) AS lastWeek,
          MIN(created_at) AS oldest,
          MAX(created_at) AS newest
        FROM leads
      `).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM admin_sessions WHERE expires_at > ?').bind(now).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM dev_sessions WHERE expires_at > ?').bind(now).first(),
      env.DB.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE locked_until > ?').bind(now).first(),
      env.DB.prepare('SELECT at, event, ip, detail FROM dev_audit ORDER BY id DESC LIMIT 100').all(),
      env.DB.prepare(`
        SELECT event, COALESCE(SUM(CASE WHEN at >= ? THEN 1 ELSE 0 END), 0) AS day, COUNT(*) AS week
        FROM dev_audit WHERE at >= ? AND event IN (${FAIL_IN}) GROUP BY event
      `).bind(dayAgo, weekAgo, ...FAIL_EVENTS).all(),
      env.DB.prepare(`
        SELECT ip, COUNT(*) AS n, MAX(at) AS last, MAX(id) AS lastId
        FROM dev_audit WHERE at >= ? AND event IN (${FAIL_IN}) GROUP BY ip ORDER BY n DESC, last DESC LIMIT 5
      `).bind(weekAgo, ...FAIL_EVENTS).all(),
      devLockState(env),
      keepDays
        ? env.DB.prepare("SELECT COUNT(*) AS n FROM leads WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)").bind(`-${keepDays} days`).first()
        : Promise.resolve(null),
      requestLogPaused(env, { fresh: true }),
      listBlocks(env.DB),
    ]);

    // The place for each top source comes from its most recent failed event.
    const sources = failSources?.results || [];
    const placeById = new Map();
    if (sources.length) {
      const ids = sources.map((s) => Number(s.lastId));
      const rows = await env.DB
        .prepare(`SELECT id, detail FROM dev_audit WHERE id IN (${ids.map(() => '?').join(', ')})`)
        .bind(...ids)
        .all();
      for (const r of rows?.results || []) placeById.set(Number(r.id), placeFromDetail(r.detail));
    }

    const counts = Object.fromEntries(FAIL_EVENTS.map((e) => [e, { day: 0, week: 0 }]));
    for (const r of failCounts?.results || []) {
      if (counts[r.event]) counts[r.event] = { day: Number(r.day || 0), week: Number(r.week || 0) };
    }

    return jsonResponse({
      ok: true,
      session: { expiresAt: session.exp },
      leads: {
        total: Number(leads?.total || 0),
        open: Number(leads?.open || 0),
        lastWeek: Number(leads?.lastWeek || 0),
        oldest: leads?.oldest || null,
        newest: leads?.newest || null,
        retentionDays: keepDays,
        olderThanRetention: oldLeads ? Number(oldLeads.n || 0) : 0,
      },
      security: {
        staffSessions: Number(staffSessions?.n || 0),
        developerSessions: Number(devSessions?.n || 0),
        activeLockouts: Number(lockouts?.n || 0),
        devLocked: Boolean(lock?.locked),
        devLockedSince: lock?.since || null,
        failures: counts,
        failureSources: sources.map((s) => ({
          ip: s.ip,
          count: Number(s.n || 0),
          last: Number(s.last || 0),
          place: placeById.get(Number(s.lastId)) || '',
        })),
      },
      requestLog: { paused: Boolean(paused) },
      blocks,
      // Lets the console warn before you block the address you are using yourself.
      yourIp: normalizeIp(clientIp(request)) || clientIp(request),
      config: devConfigSummary(env),
      activity: (audit?.results || []).map((r) => ({ at: r.at, event: r.event, ip: r.ip, detail: r.detail })),
    });
  } catch (err) {
    console.error('Developer overview failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
