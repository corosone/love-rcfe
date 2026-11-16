// GET /api/dev/overview — everything the developer console shows (developer session required)
import { jsonResponse } from '../../../lib/db.js';
import { authorizeDev, devConfigSummary } from '../../../lib/dev.js';

export async function onRequestGet({ request, env }) {
  const { denied, session } = await authorizeDev(request, env);
  if (denied) return denied;

  const now = Math.floor(Date.now() / 1000);
  try {
    const [leads, staffSessions, devSessions, lockouts, audit] = await Promise.all([
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
      env.DB.prepare('SELECT at, event, ip, detail FROM dev_audit ORDER BY id DESC LIMIT 30').all(),
    ]);

    return jsonResponse({
      ok: true,
      session: { expiresAt: session.exp },
      leads: {
        total: Number(leads?.total || 0),
        open: Number(leads?.open || 0),
        lastWeek: Number(leads?.lastWeek || 0),
        oldest: leads?.oldest || null,
        newest: leads?.newest || null,
      },
      security: {
        staffSessions: Number(staffSessions?.n || 0),
        developerSessions: Number(devSessions?.n || 0),
        activeLockouts: Number(lockouts?.n || 0),
      },
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
