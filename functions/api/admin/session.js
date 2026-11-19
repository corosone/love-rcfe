import {
  jsonResponse, verifySameOrigin, readJsonBody, senderKey, tooManyRequests,
  checkAdminConfig, checkAdminPrereqs, checkPasswordWithLockout, enforceTurnstile,
  getSessionSigningMaterial, createSessionToken, sessionCookieHeader, SESSION_TTL_SEC,
  authorizeStaff, getAdminAttempts, lockWaitSeconds, recordAdminFail, clearAdminAttempts,
} from '../../../lib/db.js';
import { signOutEverywhere, devAudit } from '../../../lib/dev.js';
import { isTrusted, trustThisDevice, forgetAccountDevices } from '../../../lib/trust.js';
import {
  checkStaffAccount, cleanStaffName, sharedPasswordAllowed, noteStaffSignIn, changeOwnStaffPassword,
} from '../../../lib/staff.js';

// Staff sign-in. Order matters: cheap checks first, then the Turnstile spam check,
// and only then anything that writes to the database (rate limits, lockout, session).
//
// Body: { name, password, turnstile_token }. With a name, it is that person's own staff account
// (lib/staff.js). Without one, it is the shared staff password (INBOX_PASSWORD), unless the
// owner has turned that off in the developer console.
export async function onRequestPost({ request, env }) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const configError = checkAdminConfig(env);
  if (configError) return configError;

  if (tooManyRequests(`signin:${senderKey(request)}`, 20, 60 * 1000)) {
    return jsonResponse({ error: 'Too many login attempts. Please wait a minute and try again.' }, 429);
  }

  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (typeof body.password !== 'string' || !body.password) {
    return jsonResponse({ error: 'Please enter your password.' }, 400);
  }
  const rawName = typeof body.name === 'string' ? body.name.trim().slice(0, 80) : '';

  const turnstileError = await enforceTurnstile(
    request,
    env,
    body.turnstile_token,
    'Please complete the security check, then try again.'
  );
  if (turnstileError) return turnstileError;

  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  if (!rawName && !(await sharedPasswordAllowed(env))) {
    return jsonResponse({ error: 'Please enter your name and your own password. The shared staff password has been turned off.', field: 'name' }, 400);
  }

  // A browser that has signed in here before is not held up by the site-wide lockout (lib/trust.js).
  const trusted = await isTrusted(request, env, 'staff');
  let account = null;
  const denied = await checkPasswordWithLockout(request, env, body.password, rawName
    ? {
      trusted,
      wrongMessage: 'Incorrect name or password.',
      verify: async (pw) => {
        account = await checkStaffAccount(env.DB, rawName, pw);
        return account.ok;
      },
    }
    : { trusted });
  if (denied) {
    // Staff sign-in history for the developer console (wrong passwords and lockout blocks).
    const tried = rawName ? `as "${cleanStaffName(rawName) || rawName.replace(/[^\p{L}\p{N} .'-]/gu, '').slice(0, 40)}"` : '';
    if (denied.status === 401) await devAudit(env, request, 'staff_wrong_password', tried, { withContext: Boolean(tried) });
    else if (denied.status === 423) await devAudit(env, request, 'staff_locked_out', tried, { withContext: Boolean(tried) });
    return denied;
  }

  try {
    const material = await getSessionSigningMaterial(env);
    const accountId = account?.ok ? account.id : 0;
    const token = await createSessionToken(material, SESSION_TTL_SEC, env.DB, 'staff', { accountId });
    if (accountId) await noteStaffSignIn(env.DB, accountId);
    await devAudit(env, request, 'staff_signed_in', accountId ? `as "${account.name}"` : 'with the shared staff password', { withContext: true });
    const cookies = [sessionCookieHeader(request, token, SESSION_TTL_SEC)];
    const trust = await trustThisDevice(request, env, 'staff', { accountId });
    if (trust) cookies.push(trust);
    return jsonResponse({ ok: true, name: accountId ? account.name : '' }, 200, { 'Set-Cookie': cookies });
  } catch (err) {
    console.error('Could not create session:', err);
    return jsonResponse({ error: 'Could not start session.' }, 500);
  }
}

// Who is signed in: { name, kind } (kind: 'account', 'shared' or 'developer').
export async function onRequestGet({ request, env }) {
  const { denied, who } = await authorizeStaff(request, env);
  if (denied) return denied;
  return jsonResponse({ ok: true, name: who.name, kind: who.kind });
}

// Wrong current passwords when changing your own: at most 5 in 15 minutes for each account (from
// anywhere), then password changes for that account wait 15 minutes. Signing in is not affected.
// These replies carry field: 'current' or status 429, so the inbox shows them in the form instead
// of treating them as being signed out.
const PW_CHANGE_MAX_FAILS = 5;
const PW_CHANGE_WINDOW = 15 * 60;
const PW_CHANGE_LOCK_SECONDS = 15 * 60;

// Change your own password (staff accounts only): { current, password }.
// Signs your other devices out (and forgets them as trusted browsers); this one stays signed in.
export async function onRequestPatch({ request, env }) {
  const { denied, who } = await authorizeStaff(request, env);
  if (denied) return denied;
  if (who.kind !== 'account') {
    return jsonResponse({ error: 'Only people with their own staff account can change a password here.' }, 400);
  }
  if (tooManyRequests(`staffpw:${senderKey(request)}`, 5, 10 * 60 * 1000)) {
    return jsonResponse({ error: 'Too many tries. Please wait a few minutes and try again.' }, 429);
  }
  const parsed = await readJsonBody(request, 4096);
  if (!parsed.ok) return parsed.response;
  try {
    // Read only: refused while locked, without writing anything.
    const lockKey = `staffpw|${who.accountId}`;
    const wait = lockWaitSeconds(await getAdminAttempts(env.DB, lockKey));
    if (wait > 0) {
      return jsonResponse(
        { error: `Too many wrong passwords. Please try again in ${Math.ceil(wait / 60)} minute(s).` },
        429,
        { 'Retry-After': String(wait) }
      );
    }
    const r = await changeOwnStaffPassword(env.DB, who.accountId, parsed.data.current, parsed.data.password, who.jti);
    if (!r.ok) {
      if (r.status === 401) {
        // A wrong current password: counted for this account, and shown in the activity log.
        await recordAdminFail(env.DB, lockKey, PW_CHANGE_WINDOW, PW_CHANGE_MAX_FAILS, PW_CHANGE_LOCK_SECONDS)
          .catch((err) => console.error('Could not record wrong current password:', err));
        await devAudit(env, request, 'staff_wrong_password', `"${who.name}", changing their password`, { withContext: true });
        return jsonResponse({ error: r.message, field: 'current' }, 401);
      }
      return jsonResponse({ error: r.message }, r.status || 400);
    }
    await clearAdminAttempts(env.DB, lockKey);
    await forgetAccountDevices(env, who.accountId, request);
    await devAudit(env, request, 'staff_changed_password', `"${who.name}"`, { withContext: true });
    return jsonResponse({ ok: true, signedOut: r.signedOut });
  } catch (err) {
    console.error('Could not change staff password:', err);
    return jsonResponse({ error: 'Could not change your password. Please try again.' }, 500);
  }
}

// Sign out: revoke this browser's sessions on the server and clear its cookies.
export function onRequestDelete({ request, env }) {
  return signOutEverywhere(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET, POST, PATCH, DELETE' });
}
