// GET /api/dev/overview — everything the developer console shows (developer session required)
// GET /api/dev/overview?detail=<activity id> — every device detail stored with one activity row
import { jsonResponse, clientIp } from '../../../lib/db.js';
import { authorizeDev, devConfigSummary, devLockState, retentionDays, STAFF_EVENT_SQL } from '../../../lib/dev.js';
import { KEEP_DELETED_DAYS } from '../../../lib/deletedleads.js';
import { placeFromDetail } from '../../../lib/reqinfo.js';
import { requestLogPaused } from '../../../lib/requestlog.js';
import { listBlocks, normalizeIp } from '../../../lib/blocklist.js';
import { infoFromJson, deviceAddresses, deviceSections } from '../../../lib/deviceinfo.js';
import { listStaffAccounts, sharedPasswordAllowed } from '../../../lib/staff.js';

// Events that count as failed or blocked sign-ins in the security summary.
const FAIL_EVENTS = ['wrong_password', 'wrong_code', 'blocked_locked', 'code_limit', 'staff_wrong_password', 'staff_locked_out'];
const FAIL_IN = FAIL_EVENTS.map(() => '?').join(', ');
// The Activity list shows the newest events of each kind: developer events and staff sign-in
// events are read separately, so a flood of wrong staff passwords (which anyone can cause) can
// never push the developer's own sign-ins off the list. The log itself keeps them apart the
// same way (lib/dev.js).
const ACTIVITY_PER_GROUP = 100;
const ACTIVITY_COLUMNS = 'id, at, event, ip, detail, info';

export async function onRequestGet({ request, env }) {
  const { denied, session } = await authorizeDev(request, env);
  if (denied) return denied;

  // One activity row's full device details (the "Details" button on the Activity tab).
  const detailId = new URL(request.url).searchParams.get('detail');
  if (detailId !== null) {
    if (!/^\d{1,12}$/.test(detailId)) return jsonResponse({ error: 'Unknown activity entry.' }, 400);
    try {
      const row = await env.DB.prepare('SELECT id, at, event, ip, info FROM dev_audit WHERE id = ?').bind(Number(detailId)).first();
      if (!row) return jsonResponse({ error: 'That activity entry no longer exists.' }, 404);
      const info = infoFromJson(row.info);
      const addr = info ? deviceAddresses(info) : { long: null, short: null };
      return jsonResponse({
        ok: true,
        id: Number(row.id),
        at: Number(row.at),
        event: row.event,
        addresses: [
          addr.long ? { kind: 'long', ip: addr.long.ip, source: addr.long.source } : null,
          addr.short ? { kind: 'short', ip: addr.short.ip, source: addr.short.source } : null,
        ].filter(Boolean),
        sections: info ? deviceSections(info) : [],
      });
    } catch (err) {
      console.error('Developer activity detail failed:', err);
      return jsonResponse({ error: 'Database read error.' }, 500);
    }
  }

  const now = Math.floor(Date.now() / 1000);
  const dayAgo = now - 86400;
  const weekAgo = now - 7 * 86400;
  const keepDays = retentionDays(env);
  try {
    const [leads, staffSessions, devSessions, lockouts, devActivity, staffActivity, failCounts, failSources, lock, oldLeads, paused, blocks, staffAccounts, sharedAllowed, trusted, deleted] = await Promise.all([
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
      env.DB.prepare(`SELECT ${ACTIVITY_COLUMNS} FROM dev_audit WHERE NOT (${STAFF_EVENT_SQL}) ORDER BY id DESC LIMIT ${ACTIVITY_PER_GROUP}`).all(),
      env.DB.prepare(`SELECT ${ACTIVITY_COLUMNS} FROM dev_audit WHERE ${STAFF_EVENT_SQL} ORDER BY id DESC LIMIT ${ACTIVITY_PER_GROUP}`).all(),
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
      listStaffAccounts(env.DB),
      sharedPasswordAllowed(env),
      env.DB.prepare('SELECT kind, COUNT(*) AS n FROM trusted_devices WHERE expires_at > ? GROUP BY kind').bind(now).all(),
      // Only what Recently Deleted still shows (older ones are removed when it is next opened)
      env.DB.prepare('SELECT COUNT(*) AS n FROM deleted_leads WHERE deleted_at >= ?').bind(now - KEEP_DELETED_DAYS * 86400).first(),
    ]);
    // Newest first, both kinds together
    const audit = [...(devActivity?.results || []), ...(staffActivity?.results || [])].sort((a, b) => Number(b.id) - Number(a.id));
    const trustedCount = (kind) => Number((trusted?.results || []).find((r) => r.kind === kind)?.n || 0);

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
        recentlyDeleted: Number(deleted?.n || 0),
      },
      // Individual staff accounts (lib/staff.js) and whether the shared staff password still works.
      staff: { accounts: staffAccounts, sharedPasswordAllowed: Boolean(sharedAllowed) },
      security: {
        staffSessions: Number(staffSessions?.n || 0),
        developerSessions: Number(devSessions?.n || 0),
        activeLockouts: Number(lockouts?.n || 0),
        devLocked: Boolean(lock?.locked),
        // Browsers that signed in before and so skip the site-wide lockout (lib/trust.js)
        trustedStaffDevices: trustedCount('staff'),
        trustedDeveloperDevices: trustedCount('dev'),
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
      activity: audit.map((r) => {
        const item = { id: Number(r.id), at: r.at, event: r.event, ip: r.ip, detail: r.detail, hasInfo: false };
        const info = infoFromJson(r.info);
        if (info) {
          item.hasInfo = true;
          // The device's other address (the one the site did not see), when the browser reported it.
          const addr = deviceAddresses(info);
          const other = addr.long && addr.long.source === 'reported' ? { kind: 'long', ip: addr.long.ip }
            : addr.short && addr.short.source === 'reported' ? { kind: 'short', ip: addr.short.ip } : null;
          if (other) item.otherIp = other;
        }
        return item;
      }),
    });
  } catch (err) {
    console.error('Developer overview failed:', err);
    return jsonResponse({ error: 'Database read error.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
