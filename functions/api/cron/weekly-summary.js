// Weekly summary email for the owner.
//
// Pages Functions cannot run on a timer, so a scheduled GitHub Action
// (.github/workflows/weekly-summary.yml) calls this address once a week:
//
//   POST /api/cron/weekly-summary
//
// No password or secret is needed, so there is nothing to set up. Instead the address is
// made harmless for anyone else who finds it:
//   - it sends at most one email every 5 days, however often it is called;
//   - the email only ever goes to the owner (DEV_EMAIL), through the same sender as the
//     6-digit sign-in codes;
//   - the email holds numbers only: no names, messages, phone numbers or IP addresses;
//   - the reply to the caller says only whether an email was sent.
// The worst a stranger can do is make one week's email arrive early.
//
// Refusing a call never writes to the database (the free plan allows 100,000 writes a day for
// the whole site, and enquiries stop saving if that runs out): calls are first limited in each
// Cloudflare server's memory, then "was one sent in the last 5 days?" is only read. The
// database-wide limits below are counted only for calls that could actually send an email.
//
// 5 days (not 7) so that an email sent by hand mid-week does not block the next Monday's.
import { ensureSchema, jsonResponse, senderKey, tooManyRequests, tooManyRequestsD1 } from '../../../lib/db.js';
import { sendDevEmail } from '../../../lib/dev.js';
import { lastBackupAt } from '../../../lib/backup.js';

const DAYS = 7;
const MIN_GAP_SEC = 5 * 24 * 60 * 60;
const LAST_SENT_NAME = 'weekly_summary_last_sent';
// The email reminds the owner to download a full backup when the last one is older than this.
export const BACKUP_REMINDER_DAYS = 30;

const n = (row, key = 'n') => Number(row?.[key]) || 0;

// All the numbers for the email, for the 7 days before "nowMs".
export async function buildWeeklySummary(db, nowMs = Date.now()) {
  const sinceSec = Math.floor(nowMs / 1000) - DAYS * 24 * 60 * 60;
  const sinceIso = new Date(sinceSec * 1000).toISOString();
  const nowSec = Math.floor(nowMs / 1000);

  const twoDaysAgoIso = new Date(nowMs - 2 * 24 * 60 * 60 * 1000).toISOString();
  const [byKind, byStage, handledNew, openAll, visits, audit, blocksActive, blocksNew, blockHits, lockedNow, waitingLong, backupAt] = await Promise.all([
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
    // Follow-up alarm: still "new", nobody has acted on it, and more than 2 days old
    db.prepare("SELECT COUNT(*) AS n FROM leads WHERE handled = 0 AND first_response_at = '' AND stage = 'new' AND duplicate_of = 0 AND created_at < ?").bind(twoDaysAgoIso).first(),
    lastBackupAt(db),
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
      waitingOverTwoDays: n(waitingLong),
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
    // When the last full backup was downloaded (0 = never), and how many whole days ago
    backup: backupAt
      ? { lastAt: new Date(backupAt * 1000).toISOString(), daysAgo: Math.max(0, Math.floor((nowSec - backupAt) / 86400)) }
      : { lastAt: '', daysAgo: null },
  };
}

const BACKUP_WHERE = 'in the developer console (Site & Database > Backups > Download Full Backup) and keep it somewhere safe, like your computer.';

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
  if (s.enquiries.waitingOverTwoDays) out.push(`${s.enquiries.waitingOverTwoDays} enquir${s.enquiries.waitingOverTwoDays === 1 ? 'y has' : 'ies have'} waited more than 2 days with no reply (see Tools > Follow-up alarm in the developer console).`);
  if (s.enquiries.notHandledAllTime >= 10) out.push(`${s.enquiries.notHandledAllTime} enquiries are waiting to be marked as handled.`);
  if (!s.backup?.lastAt) out.push(`No full backup has been downloaded yet. Download one ${BACKUP_WHERE}`);
  else if (s.backup.daysAgo > BACKUP_REMINDER_DAYS) out.push(`The last full backup was downloaded ${s.backup.daysAgo} days ago. Download a new one ${BACKUP_WHERE}`);
  return out;
}

const day = (iso) => String(iso || '').slice(0, 10);
const daysAgoText = (d) => (d === 0 ? 'today' : d === 1 ? '1 day ago' : `${d} days ago`);

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
    'BACKUPS',
    s.backup?.lastAt
      ? `Last full backup downloaded: ${day(s.backup.lastAt)} (${daysAgoText(s.backup.daysAgo)})`
      : 'No full backup has been downloaded yet.',
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

// True when a summary went out less than 5 days ago (a read; writes nothing).
async function sentRecently(db, nowSec) {
  const row = await db.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(LAST_SENT_NAME).first();
  return Number(row?.value) > nowSec - MIN_GAP_SEC;
}

// Marks "an email is being sent now", but only if the last one was at least 5 days ago.
// One database statement, so two calls at the same moment cannot both get through.
// Returns the earlier time (so it can be put back if sending fails), or null when it is too soon.
async function claimSend(db, nowSec) {
  const before = await db.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(LAST_SENT_NAME).first();
  const previous = Number(before?.value) || 0;
  const result = await db
    .prepare(`
      INSERT INTO app_secrets (name, value) VALUES (?, ?)
      ON CONFLICT(name) DO UPDATE SET value = excluded.value
      WHERE CAST(app_secrets.value AS INTEGER) <= ?
    `)
    .bind(LAST_SENT_NAME, String(nowSec), nowSec - MIN_GAP_SEC)
    .run();
  return result?.meta?.changes ? { previous } : null;
}

async function releaseSend(db, previous) {
  if (previous) {
    await db.prepare('UPDATE app_secrets SET value = ? WHERE name = ?').bind(String(previous), LAST_SENT_NAME).run();
  } else {
    await db.prepare('DELETE FROM app_secrets WHERE name = ?').bind(LAST_SENT_NAME).run();
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env?.DB) {
    return jsonResponse({ error: 'Database is not bound yet.' }, 503);
  }

  // In memory only (no database work): 6 an hour from one sender, 30 an hour in all.
  const sender = senderKey(request);
  if (tooManyRequests(`cron:${sender}`, 6, 60 * 60 * 1000) || tooManyRequests('cron:__all__', 30, 60 * 60 * 1000)) {
    return jsonResponse({ error: 'Too many requests.' }, 429);
  }

  try {
    await ensureSchema(env.DB);

    // Read only: most calls stop here.
    const nowSec = Math.floor(Date.now() / 1000);
    if (await sentRecently(env.DB, nowSec)) {
      return jsonResponse({ ok: true, sent: false, reason: 'A summary was already sent in the last 5 days.' });
    }

    // Across all of Cloudflare's servers: 6 an hour from one sender, 20 an hour in all.
    const [ipLimited, allLimited] = await Promise.all([
      tooManyRequestsD1(env.DB, `cron:${sender}`, 6, 60 * 60),
      tooManyRequestsD1(env.DB, 'cron:__global__', 20, 60 * 60),
    ]);
    if (ipLimited || allLimited) {
      return jsonResponse({ error: 'Too many requests.' }, 429);
    }

    const claim = await claimSend(env.DB, nowSec);
    if (!claim) {
      return jsonResponse({ ok: true, sent: false, reason: 'A summary was already sent in the last 5 days.' });
    }

    let result;
    try {
      const summary = await buildWeeklySummary(env.DB);
      const { subject, text } = summaryEmail(summary, new URL(request.url).origin);
      result = await sendDevEmail(env, request, subject, text);
    } catch (err) {
      await releaseSend(env.DB, claim.previous);
      throw err;
    }
    if (!result.ok) {
      // Nothing went out, so do not count it: the next call may try again.
      await releaseSend(env.DB, claim.previous);
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
