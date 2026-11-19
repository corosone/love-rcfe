// POST /api/dev/action — developer-only tools (developer session required)
// Body: { "action": "<name>", "options": { ... } }. Every use is written to the activity log.
import { jsonResponse, readJsonBody, sessionRowId, tooManyRequestsD1 } from '../../../lib/db.js';
import {
  authorizeDev, devAudit, FORMSPREE_URL_RE, setDevLock, sendTestCodeEmail, retentionDays,
} from '../../../lib/dev.js';
import { setRequestLogPaused } from '../../../lib/requestlog.js';
import { addBlock, removeBlock } from '../../../lib/blocklist.js';
import { setHoliday, clearHoliday } from '../../../lib/settings.js';
import { forgetTrustedDevices } from '../../../lib/trust.js';
import {
  moveLeadsToBin, restoreDeletedLeads, deleteForever, emptyBin, purgeDeletedLeads, cleanIds, RESTORE_BATCH, KEEP_DELETED_DAYS,
} from '../../../lib/deletedleads.js';
import {
  createStaffAccount, resetStaffPassword, removeStaffAccount, setSharedPassword,
} from '../../../lib/staff.js';

const MAX_DELETE_IDS = 50; // Cloudflare D1 allows at most 100 values per query; stay well under it

// Also forgets every other trusted developer device (lib/trust.js); this one stays trusted.
async function signOutOtherDevelopers(env, session, request) {
  const mine = await sessionRowId(session);
  const res = await env.DB.prepare('DELETE FROM dev_sessions WHERE jti != ?').bind(mine).run();
  await forgetTrustedDevices(env, 'dev', request);
  return Number(res?.meta?.changes || 0);
}

const ACTIONS = {
  // ----- Security -----

  // Signs every staff device out of the inbox (they sign in again with their password), and
  // forgets every trusted staff device (lib/trust.js).
  async signout_staff(request, env) {
    const res = await env.DB.prepare('DELETE FROM admin_sessions').run();
    await forgetTrustedDevices(env, 'staff');
    const n = Number(res?.meta?.changes || 0);
    return { message: `Signed out ${n} staff session(s).`, detail: `${n} session(s)` };
  },

  // ----- Staff accounts (lib/staff.js) -----
  // The made-up password is in the reply once, to hand to the person. It is never stored.
  async add_staff_account(request, env, session, options) {
    const r = await createStaffAccount(env.DB, options?.name);
    if (!r.ok) return r;
    return { message: `Account created for ${r.name}.`, detail: r.name, extra: { account: { id: r.id, name: r.name }, password: r.password } };
  },

  async reset_staff_password(request, env, session, options) {
    const r = await resetStaffPassword(env.DB, options?.id);
    if (!r.ok) return r;
    return { message: `${r.name} has a new password and was signed out everywhere.`, detail: r.name, extra: { account: { id: r.id, name: r.name }, password: r.password } };
  },

  async remove_staff_account(request, env, session, options) {
    const r = await removeStaffAccount(env.DB, options?.id);
    if (!r.ok) return r;
    return { message: `${r.name}'s account was removed and they were signed out everywhere.`, detail: r.name };
  },

  // options.allowed: true lets the shared staff password (INBOX_PASSWORD) sign in; false turns it off.
  async shared_staff_password(request, env, session, options) {
    const allowed = options?.allowed === true;
    const r = await setSharedPassword(env, allowed);
    if (!r.ok) return r;
    return allowed
      ? { message: 'The shared staff password works again.', detail: 'allowed' }
      : { message: `The shared staff password is turned off. Staff now sign in with their own name and password.${r.signedOut ? ` ${r.signedOut} session(s) that used it were signed out.` : ''}`, detail: 'turned off' };
  },

  // Removes "too many wrong passwords" lockouts and sign-in rate limits, e.g. after staff lock themselves out.
  async clear_lockouts(request, env) {
    const locks = await env.DB.prepare('DELETE FROM auth_attempts').run();
    await env.DB
      .prepare("DELETE FROM rate_limits WHERE key LIKE 'login:%' OR key LIKE 'admin:%' OR key LIKE 'devlogin:%' OR key LIKE 'devsend:%'")
      .run();
    const n = Number(locks?.meta?.changes || 0);
    return { message: `Cleared ${n} lockout record(s), the sign-in rate limits and the limit on sign-in code emails. Anyone who tried many times in the last minute may need to wait one more minute.`, detail: `${n} record(s)` };
  },

  // Ends every developer session except the one making this request.
  async signout_other_devs(request, env, session) {
    const n = await signOutOtherDevelopers(env, session, request);
    return { message: n ? `Signed out ${n} other developer session(s). This device stays signed in.` : 'No other developer sessions were signed in.', detail: `${n} session(s)` };
  },

  // Emergency switch: blocks new developer sign-ins and signs out other developer sessions.
  async lock_dev(request, env, session) {
    if (!(await setDevLock(env, true))) return { ok: false, status: 500, message: 'Could not lock the developer sign-in.' };
    const n = await signOutOtherDevelopers(env, session, request);
    return {
      message: `Developer sign-in is now locked${n ? ` and ${n} other developer session(s) were signed out` : ''}. This device stays signed in so you can unlock it. Changing DEV_PASSWORD in Cloudflare also unlocks it.`,
      detail: `${n} other session(s) ended`,
    };
  },

  async unlock_dev(request, env) {
    await setDevLock(env, false);
    return { message: 'Developer sign-in is unlocked.' };
  },

  // Blocks an IP address from the enquiry forms and the staff inbox (options: ip, reason, days).
  async block_ip(request, env, session, options) {
    const r = await addBlock(env, request, options);
    return r.ok ? { message: r.message, detail: `${r.ip} · ${r.length}` } : r;
  },

  async unblock_ip(request, env, session, options) {
    const r = await removeBlock(env, options?.ip);
    return r.ok ? { message: r.message, detail: r.ip } : r;
  },

  // ----- Email checks -----

  // Sends a test message through the lead-notification email (FORMSPREE_ENDPOINT) and reports the result.
  async test_lead_email(request, env) {
    const endpoint = typeof env?.FORMSPREE_ENDPOINT === 'string' ? env.FORMSPREE_ENDPOINT.trim() : '';
    if (!endpoint) return { ok: false, message: 'FORMSPREE_ENDPOINT is not set in Cloudflare, so no lead emails are being sent.' };
    if (!FORMSPREE_URL_RE.test(endpoint)) {
      return { ok: false, message: 'FORMSPREE_ENDPOINT is set but is not a Formspree form address (expected https://formspree.io/f/<form id>).' };
    }
    const origin = new URL(request.url).origin;
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin, Referer: `${origin}/` },
        body: JSON.stringify({
          kind: 'test',
          name: 'Developer console test',
          message: 'This is a test of the Love RCFE lead notification email. No action is needed.',
        }),
      });
      return res.ok
        ? { message: 'Test sent. It should arrive in the lead notification inbox within a minute.' }
        : { ok: false, message: `Formspree rejected the test (HTTP ${res.status}). Check the form's settings on formspree.io.`, detail: `status ${res.status}` };
    } catch (err) {
      return { ok: false, message: 'Formspree could not be reached. Please try again.' };
    }
  },

  // Sends a test email (with no code) to the address that receives sign-in codes.
  async test_code_email(request, env, session, options) {
    if (await tooManyRequestsD1(env.DB, 'devtestmail', 5, 3600, { failClosed: true })) {
      return { ok: false, status: 429, message: 'You can send at most 5 test emails per hour. Please try again later.' };
    }
    // options.client: what the console reported about this browser, so the test email shows the
    // same device details as a real sign-in email (checked field by field in lib/deviceinfo.js).
    const sent = await sendTestCodeEmail(env, request, options?.client && typeof options.client === 'object' ? options.client : null);
    return sent.ok
      ? { message: 'Test email sent to your verification address. It should arrive within a minute (check spam too).' }
      : { ok: false, message: `The test email could not be sent (${sent.provider}, HTTP ${sent.status}). Check RESEND_API_KEY and DEV_CODE_EMAIL in Cloudflare.`, detail: `${sent.provider} status ${sent.status}` };
  },

  // ----- Enquiries -----

  // Deletes the chosen enquiries (up to 50 at a time; the console sends bigger selections in
  // batches). They go to Recently Deleted for 30 days first (lib/deletedleads.js).
  async delete_leads(request, env, session, options) {
    const ids = Array.isArray(options?.ids) ? cleanIds(options.ids) : null;
    if (!ids || ids.length > MAX_DELETE_IDS) {
      return { ok: false, status: 400, message: `Choose between 1 and ${MAX_DELETE_IDS} enquiries to delete.` };
    }
    const n = (await moveLeadsToBin(env.DB, ids, { by: 'Developer' })).length;
    return { message: `Deleted ${n} enquir${n === 1 ? 'y' : 'ies'}. ${n === 1 ? 'It stays' : 'They stay'} in Recently Deleted for ${KEEP_DELETED_DAYS} days in case you need ${n === 1 ? 'it' : 'them'} back.`, detail: `deleted ${n}` };
  },

  // ----- Recently Deleted (lib/deletedleads.js) -----
  async restore_deleted(request, env, session, options) {
    const ids = Array.isArray(options?.ids) ? cleanIds(options.ids) : null;
    if (!ids || ids.length > RESTORE_BATCH) return { ok: false, status: 400, message: `Choose between 1 and ${RESTORE_BATCH} enquiries to put back.` };
    const r = await restoreDeletedLeads(env.DB, ids);
    if (!r.restored) return { ok: false, status: 404, message: 'Nothing was put back: those enquiries are no longer in Recently Deleted.' };
    return { message: `Put back ${r.restored} enquir${r.restored === 1 ? 'y' : 'ies'}.${r.missing ? ` ${r.missing} could not be put back.` : ''}`, detail: `restored ${r.restored}` };
  },

  async delete_forever(request, env, session, options) {
    const ids = Array.isArray(options?.ids) ? cleanIds(options.ids) : null;
    if (!ids) return { ok: false, status: 400, message: 'Choose between 1 and 50 enquiries.' };
    const n = await deleteForever(env.DB, ids);
    return { message: `Deleted ${n} enquir${n === 1 ? 'y' : 'ies'} for good.`, detail: `${n}` };
  },

  async empty_bin(request, env) {
    const n = await emptyBin(env.DB);
    return { message: n ? `Emptied Recently Deleted (${n} enquir${n === 1 ? 'y' : 'ies'} deleted for good).` : 'Recently Deleted was already empty.', detail: `${n}` };
  },

  // Runs the LEAD_RETENTION_DAYS clean-up now instead of waiting for it to happen on its own.
  async purge_old_leads(request, env) {
    const days = retentionDays(env);
    if (!days) {
      return { ok: false, status: 400, message: 'LEAD_RETENTION_DAYS is not set (or is under 30) in Cloudflare, so nothing counts as "old". Set it first.' };
    }
    const res = await env.DB
      .prepare("DELETE FROM leads WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
      .bind(`-${days} days`)
      .run();
    const n = Number(res?.meta?.changes || 0);
    return { message: n ? `Deleted ${n} enquir${n === 1 ? 'y' : 'ies'} older than ${days} days.` : `No enquiries are older than ${days} days.`, detail: `deleted ${n}` };
  },

  // Marks an enquiry as a repeat of an earlier one (options: id, of). It is marked handled, with
  // a note "Duplicate of #<of>", so it leaves the open list. Nothing is deleted.
  async mark_duplicate(request, env, session, options) {
    const id = Number(options?.id);
    const of = Number(options?.of);
    if (!Number.isInteger(id) || id <= 0 || !Number.isInteger(of) || of <= 0 || id === of) {
      return { ok: false, status: 400, message: 'Choose two different enquiries.' };
    }
    const [lead, original] = await Promise.all([
      env.DB.prepare('SELECT id, notes, duplicate_of AS duplicateOf FROM leads WHERE id = ?').bind(id).first(),
      env.DB.prepare('SELECT id, duplicate_of AS duplicateOf FROM leads WHERE id = ?').bind(of).first(),
    ]);
    if (!lead || !original) return { ok: false, status: 404, message: 'One of those enquiries no longer exists.' };
    // Always point at the first enquiry, never at another duplicate (no chains).
    const target = Number(original.duplicateOf) || of;
    if (target === id) return { ok: false, status: 400, message: 'That enquiry is the original of this group.' };
    const line = `Duplicate of #${target}`;
    const notes = String(lead.notes || '');
    const newNotes = notes.includes(line) ? notes : (notes ? `${notes}\n${line}` : line).slice(0, 2000);
    await env.DB
      .prepare(`
        UPDATE leads SET duplicate_of = ?, handled = 1, notes = ?,
          handled_at = CASE WHEN handled_at = '' THEN strftime('%Y-%m-%dT%H:%M:%fZ', 'now') ELSE handled_at END
        WHERE id = ?
      `)
      .bind(target, newNotes, id)
      .run();
    return { message: `Enquiry #${id} is marked as a duplicate of #${target} and moved to Handled.`, detail: `#${id} of #${target}` };
  },

  async unmark_duplicate(request, env, session, options) {
    const id = Number(options?.id);
    if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, message: 'Unknown enquiry.' };
    const res = await env.DB.prepare('UPDATE leads SET duplicate_of = 0 WHERE id = ? AND duplicate_of != 0').bind(id).run();
    return Number(res?.meta?.changes || 0)
      ? { message: `Enquiry #${id} is no longer marked as a duplicate. It stays in Handled; reopen it in the staff inbox if it needs a reply.`, detail: `#${id}` }
      : { ok: false, status: 404, message: 'That enquiry was not marked as a duplicate.' };
  },

  // ----- Holiday switch -----
  // Pauses call bookings for a range of days (options: from, to as YYYY-MM-DD). See lib/settings.js.
  async set_holiday(request, env, session, options) {
    const r = await setHoliday(env, options);
    if (!r.ok) return r;
    return { message: `Call bookings are paused from ${r.holiday.from} to ${r.holiday.to}. The website shows the note within a minute. Messages through the contact form still arrive as usual.`, detail: `${r.holiday.from} to ${r.holiday.to}` };
  },

  async clear_holiday(request, env) {
    const removed = await clearHoliday(env);
    return removed
      ? { message: 'Call bookings are open again. The website updates within a minute.' }
      : { message: 'No break was set, so nothing changed.' };
  },

  // ----- Maintenance -----

  // mode "older30": remove activity older than 30 days; mode "all": empty the activity log.
  async clear_activity(request, env, session, options) {
    const mode = options?.mode;
    if (mode !== 'older30' && mode !== 'all') return { ok: false, status: 400, message: 'Unknown clean-up choice.' };
    const res = mode === 'all'
      ? await env.DB.prepare('DELETE FROM dev_audit').run()
      : await env.DB.prepare('DELETE FROM dev_audit WHERE at < ?').bind(Math.floor(Date.now() / 1000) - 30 * 86400).run();
    const n = Number(res?.meta?.changes || 0);
    return { message: `Removed ${n} activity entr${n === 1 ? 'y' : 'ies'}.`, detail: `${mode === 'all' ? 'all' : 'older than 30 days'}: ${n}` };
  },

  // Removes records that are no longer needed: expired sessions and codes, finished lockouts,
  // and rate-limit counters older than two days (the longest limit is one day).
  async cleanup_records(request, env) {
    const now = Math.floor(Date.now() / 1000);
    const runs = await Promise.all([
      env.DB.prepare('DELETE FROM rate_limits WHERE window_start < ?').bind(now - 2 * 86400).run(),
      env.DB.prepare('DELETE FROM auth_attempts WHERE locked_until < ? AND first_fail < ?').bind(now, now - 15 * 60).run(),
      env.DB.prepare('DELETE FROM admin_sessions WHERE expires_at <= ?').bind(now).run(),
      env.DB.prepare('DELETE FROM dev_sessions WHERE expires_at <= ?').bind(now).run(),
      env.DB.prepare('DELETE FROM dev_challenges WHERE expires_at <= ?').bind(now).run(),
      env.DB.prepare('DELETE FROM blocked_ips WHERE expires_at != 0 AND expires_at <= ?').bind(now).run(),
      env.DB.prepare("DELETE FROM request_log WHERE kind = 'api'").run(),
      env.DB.prepare('DELETE FROM trusted_devices WHERE expires_at <= ?').bind(now).run(),
    ]);
    const [limits, attempts, staff, devs, codes, blocks, oldServer, trusted] = runs.map((r) => Number(r?.meta?.changes || 0));
    const binned = await purgeDeletedLeads(env.DB);
    const total = limits + attempts + staff + devs + codes + blocks + oldServer + trusted + binned;
    return {
      message: `Removed ${total} old record(s): ${limits} rate-limit counter(s), ${attempts} finished lockout(s), ${staff + devs} expired session(s), ${codes} expired code(s), ${blocks} ended block(s), ${oldServer} old server-request record(s), ${trusted} expired trusted device(s), ${binned} enquir${binned === 1 ? 'y' : 'ies'} deleted over ${KEEP_DELETED_DAYS} days ago.`,
      detail: `${total} record(s)`,
    };
  },

  async clear_requests(request, env) {
    const res = await env.DB.prepare('DELETE FROM request_log').run();
    const n = Number(res?.meta?.changes || 0);
    return { message: `Cleared ${n} request log entr${n === 1 ? 'y' : 'ies'}.`, detail: `${n} entries` };
  },

  async pause_requests(request, env) {
    await setRequestLogPaused(env, true);
    return { message: 'Request logging is paused. Nothing new will be recorded until you resume it.' };
  },

  async resume_requests(request, env) {
    await setRequestLogPaused(env, false);
    return { message: 'Request logging is on again. It can take up to a minute to restart everywhere.' };
  },
};

export async function onRequestPost({ request, env }) {
  const { denied, session } = await authorizeDev(request, env);
  if (denied) return denied;

  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.response;
  const name = typeof parsed.data.action === 'string' ? parsed.data.action : '';
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, name)) {
    return jsonResponse({ error: 'Unknown action.' }, 400);
  }
  const options = parsed.data.options && typeof parsed.data.options === 'object' && !Array.isArray(parsed.data.options)
    ? parsed.data.options
    : {};

  try {
    const result = await ACTIONS[name](request, env, session, options);
    const ok = result.ok !== false;
    await devAudit(env, request, name, result.detail || (ok ? 'ok' : 'failed'));
    return jsonResponse({ ok, message: result.message, ...(ok && result.extra ? result.extra : {}) }, ok ? 200 : (result.status || 502));
  } catch (err) {
    console.error(`Developer action ${name} failed:`, err);
    return jsonResponse({ error: 'That action failed. Please try again.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
