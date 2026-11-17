// Weekly summary email for the owner.
//
// Pages Functions cannot run on a timer, so a scheduled GitHub Action
// (.github/workflows/weekly-summary.yml) calls this address once a week:
//
//   POST /api/cron/weekly-summary
//   Authorization: Bearer <CRON_SECRET>
//
// CRON_SECRET is a long random value stored in two places: Cloudflare (Pages > Settings >
// Variables and Secrets) and the GitHub repository's Actions secrets. Without it this
// address does nothing.
//
// The email goes to the developer address (DEV_EMAIL) through the same sender as the
// 6-digit sign-in codes. It holds numbers only: no names, messages, phone numbers or IP
// addresses of families. The reply to the caller says only whether the email was sent,
// because GitHub Action logs of a public repository can be read by anyone.
import { ensureSchema, jsonResponse, clientIp, verifyPassword, tooManyRequestsD1 } from '../../../lib/db.js';
import { sendDevEmail } from '../../../lib/dev.js';

const MIN_SECRET_LENGTH = 32;
const DAYS = 7;

const n = (row, key = 'n') => Number(row?.[key]) || 0;

// All the numbers for the email, for the 7 days before "nowMs".
export async function buildWeeklySummary(db, nowMs = Date.now()) {
  const sinceSec = Math.floor(nowMs / 1000) - DAYS * 24 * 60 * 60;
  const sinceIso = new Date(sinceSec * 1000).toISOString();
  const nowSec = Math.floor(nowMs / 1000);

  const [byKind, byStage, handledNew, openAll, visits, audit, blocksActive, blocksNew, blockHits, lockedNow] = await Promise.all([
    db.prepare('SELECT kind, COUNT(*) AS n FROM leads WHERE created_at >= ? GROUP BY kind').bind(sinceIso).all(),
    db.prepare('SELECT stage, COUNT(*) AS n FROM leads WHERE created_at >= ? GROUP BY stage').bind(sinceIso).all(),
    db.prepare('SELECT COUNT(*) AS n FROM leads WHERE created_at >= ? AND handled = 1').bind(sinceIso).first(),
    db.prepare('SELECT COUNT(*) AS n, MIN(created_at) AS oldest FROM leads WHERE handled = 0').first(),
    db.prepare("SELECT COUNT(*) AS n, COUNT(DISTINCT ip) AS people FROM request_log WHERE kind = 'view' AND at >= ?").bind(sinceSec).first(),
    db.prepare('SELECT event, COUNT(*) AS n FROM dev_audit WHERE at >= ? GROUP BY event').bind(sinceSec).all(),
    db.prepare('SELECT COUNT(*) AS n FROM blocked_ips WHERE expires_at = 0 OR expires_at > ?').bind(nowSec).first(),
    db.prepare('SELECT COUNT(*) AS n FROM blocked_ips WHERE created_at >= ?').bind(sinceSec).first(),
    db.prepare('SELECT COUNT(*) AS n FROM blocked_ips WHERE last_hit >= ?').bind(sinceSec).first(),
    db.prepare('SELECT COUNT(*) AS n FROM auth_attempts WHERE locked_until > ?').bind(nowSec).first(),
  ]);

  const kinds = Object.fromEntries((byKind?.results || []).map((r) => [r.kind, n(r)]));
  const stages = Object.fromEntries((byStage?.results || []).map((r) => [r.stage, n(r)]));
  const events = Object.fromEntries((audit?.results || []).map((r) => [r.event, n(r)]));
  const newTotal = Object.values(kinds).reduce((a, b) => a + b, 0);

  return {
    from: sinceIso,
    to: new Date(nowMs).toISOString(),
    enquiries: {
      total: newTotal,
      messages: kinds.enquiry || 0,
      callRequests: kinds.call_request || 0,
      stages: { new: stages.new || 0, called: stages.called || 0, tour: stages.tour || 0, waiting: stages.waiting || 0 },
      handled: n(handledNew),
      notHandledAllTime: n(openAll),
      oldestNotHandled: openAll?.oldest || '',
    },
    visits: { views: n(visits), people: n(visits, 'people') },
    staff: {
      signIns: events.staff_signed_in || 0,
      wrongPasswords: events.staff_wrong_password || 0,
      lockouts: events.staff_locked_out || 0,
      markedSpam: events.staff_marked_spam || 0,
    },
    developer: {
      signIns: events.signed_in || 0,
      wrongPasswords: events.wrong_password || 0,
      wrongCodes: events.wrong_code || 0,
      codeLimits: events.code_limit || 0,
      emailFailures: events.email_failed || 0,
      blockedWhileLocked: events.blocked_locked || 0,
      exports: (events.export_leads || 0) + (events.backup_download || 0),
      restores: events.restore_leads || 0,
    },
    blocks: { active: n(blocksActive), added: n(blocksNew), triedAgain: n(blockHits) },
    lockedNow: n(lockedNow),
  };
}

// Things worth a second look, in plain words. An empty list means a quiet week.
export function unusualItems(s) {
  const out = [];
  if (s.staff.lockouts) out.push(`The staff sign-in was locked ${s.staff.lockouts} time(s) after repeated wrong passwords.`);
  else if (s.staff.wrongPasswords >= 5) out.push(`${s.staff.wrongPasswords} wrong staff passwords were entered.`);
  if (s.developer.wrongPasswords) out.push(`${s.developer.wrongPasswords} wrong developer password(s) were entered.`);
  if (s.developer.wrongCodes) out.push(`${s.developer.wrongCodes} wrong 6-digit code(s) were entered.`);
  if (s.developer.codeLimits) out.push(`The limit on 6-digit code emails was reached ${s.developer.codeLimits} time(s).`);
  if (s.developer.blockedWhileLocked) out.push(`${s.developer.blockedWhileLocked} developer sign-in attempt(s) were refused while the console was locked.`);
  if (s.developer.emailFailures) out.push(`${s.developer.emailFailures} code email(s) could not be sent.`);
  if (s.developer.restores) out.push(`A backup was restored ${s.developer.restores} time(s).`);
  if (s.developer.exports) out.push(`Enquiries were exported or backed up ${s.developer.exports} time(s).`);
  if (s.blocks.triedAgain) out.push(`${s.blocks.triedAgain} blocked address(es) tried to reach the site again.`);
  if (s.lockedNow) out.push(`${s.lockedNow} sign-in lock(s) are active right now.`);
  if (s.enquiries.notHandledAllTime >= 10) out.push(`${s.enquiries.notHandledAllTime} enquiries are waiting to be marked as handled.`);
  return out;
}

const day = (iso) => String(iso || '').slice(0, 10);

export function summaryEmail(s, origin) {
  const e = s.enquiries;
  const unusual = unusualItems(s);
  const lines = [
    `Love RCFE weekly summary: ${day(s.from)} to ${day(s.to)} (UTC)`,
    '',
    'ENQUIRIES',
    `New this week: ${e.total} (${e.messages} messages, ${e.callRequests} call requests)`,
    `Where this week's enquiries stand: ${e.stages.new} new, ${e.stages.called} called, ${e.stages.tour} tour, ${e.stages.waiting} waiting`,
    `Marked as handled: ${e.handled} of ${e.total}`,
    `Not yet handled, all time: ${e.notHandledAllTime}` + (e.oldestNotHandled ? ` (oldest from ${day(e.oldestNotHandled)})` : ''),
    '',
    'VISITORS',
    `Page views: ${s.visits.views}, from about ${s.visits.people} different addresses`,
    '',
    'SIGN-INS',
    `Staff inbox: ${s.staff.signIns} sign-ins, ${s.staff.wrongPasswords} wrong passwords`,
    `Developer console: ${s.developer.signIns} sign-ins, ${s.developer.wrongPasswords} wrong passwords, ${s.developer.wrongCodes} wrong codes`,
    '',
    'BLOCKED ADDRESSES',
    `Active blocks: ${s.blocks.active} (${s.blocks.added} added this week)`,
    '',
    'ANYTHING UNUSUAL',
    ...(unusual.length ? unusual.map((u) => `- ${u}`) : ['Nothing unusual this week.']),
    '',
    `Staff inbox: ${origin}/staff`,
    '',
    'This email holds numbers only. Names and messages stay in the staff inbox.',
  ];
  const subject = `Love RCFE weekly summary: ${e.total} new enquir${e.total === 1 ? 'y' : 'ies'}` + (unusual.length ? `, ${unusual.length} thing${unusual.length === 1 ? '' : 's'} to check` : '');
  return { subject, text: lines.join('\n') };
}

export async function onRequestPost(context) {
  const { request, env } = context;

  const secret = typeof env?.CRON_SECRET === 'string' ? env.CRON_SECRET.trim() : '';
  if (secret.length < MIN_SECRET_LENGTH) {
    return jsonResponse({ error: 'The weekly summary is not set up.' }, 503);
  }
  if (!env?.DB) {
    return jsonResponse({ error: 'Database is not bound yet.' }, 503);
  }

  const header = request.headers.get('authorization') || '';
  const given = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!(await verifyPassword(given, secret))) {
    // Slow down guessing: after 10 wrong tries from one address, refuse for 10 minutes.
    const limited = await tooManyRequestsD1(env.DB, `cron:${clientIp(request)}`, 10, 10 * 60);
    return jsonResponse({ error: limited ? 'Too many attempts.' : 'Not allowed.' }, limited ? 429 : 401);
  }

  try {
    await ensureSchema(env.DB);
    const summary = await buildWeeklySummary(env.DB);
    const { subject, text } = summaryEmail(summary, new URL(request.url).origin);
    const result = await sendDevEmail(env, request, subject, text);
    if (!result.ok) {
      return jsonResponse({ ok: false, sent: false, error: 'The summary email could not be sent.' }, 502);
    }
    return jsonResponse({ ok: true, sent: true });
  } catch (err) {
    console.error('Weekly summary failed:', err);
    return jsonResponse({ error: 'The weekly summary could not be built.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
