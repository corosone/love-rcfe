import {
  jsonResponse, verifySameOrigin, readJsonBody, clientIp, tooManyRequests,
  checkAdminConfig, checkAdminPrereqs, checkPasswordWithLockout, enforceTurnstile,
  getSessionSigningMaterial, createSessionToken, sessionCookieHeader, SESSION_TTL_SEC,
} from '../../../lib/db.js';
import { signOutEverywhere, devAudit } from '../../../lib/dev.js';

// Staff sign-in. Order matters: cheap checks first, then the Turnstile spam check,
// and only then anything that writes to the database (rate limits, lockout, session).
export async function onRequestPost({ request, env }) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const configError = checkAdminConfig(env);
  if (configError) return configError;

  if (tooManyRequests(`signin:${clientIp(request)}`, 20, 60 * 1000)) {
    return jsonResponse({ error: 'Too many login attempts. Please wait a minute and try again.' }, 429);
  }

  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (typeof body.password !== 'string' || !body.password) {
    return jsonResponse({ error: 'Please enter the staff password.' }, 400);
  }

  const turnstileError = await enforceTurnstile(
    request,
    env,
    body.turnstile_token,
    'Please complete the security check, then try again.'
  );
  if (turnstileError) return turnstileError;

  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  const denied = await checkPasswordWithLockout(request, env, body.password);
  if (denied) {
    // Staff sign-in history for the developer console (wrong passwords and lockout blocks).
    if (denied.status === 401) await devAudit(env, request, 'staff_wrong_password');
    else if (denied.status === 423) await devAudit(env, request, 'staff_locked_out');
    return denied;
  }

  try {
    const material = await getSessionSigningMaterial(env);
    const token = await createSessionToken(material, SESSION_TTL_SEC, env.DB);
    await devAudit(env, request, 'staff_signed_in');
    return jsonResponse({ ok: true }, 200, {
      'Set-Cookie': sessionCookieHeader(request, token, SESSION_TTL_SEC),
    });
  } catch (err) {
    console.error('Could not create session:', err);
    return jsonResponse({ error: 'Could not start session.' }, 500);
  }
}

// Sign out: revoke this browser's sessions on the server and clear its cookies.
export function onRequestDelete({ request, env }) {
  return signOutEverywhere(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST, DELETE' });
}
