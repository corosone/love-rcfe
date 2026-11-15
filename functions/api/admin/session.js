import {
  ensureSchema, jsonResponse, verifySameOrigin, readJsonBody,
  checkAdminPrereqs, checkPasswordWithLockout, getCookie, getSessionSecret,
  createSessionToken, revokeSessionToken, sessionCookieHeader,
  SESSION_COOKIE, SESSION_TTL_SEC,
} from '../../../lib/db.js';

export async function onRequestPost({ request, env }) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  const parsed = await readJsonBody(request, 4096);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  if (typeof body.password !== 'string' || !body.password) {
    return jsonResponse({ error: 'Please enter the staff password.' }, 400);
  }
  if (body.password.length > 256) {
    return jsonResponse({ error: 'Incorrect password.' }, 401);
  }

  const denied = await checkPasswordWithLockout(request, env, body.password);
  if (denied) return denied;

  try {
    const secret = await getSessionSecret(env);
    const token = await createSessionToken(secret, SESSION_TTL_SEC, env.DB);
    return jsonResponse({ ok: true }, 200, {
      'Set-Cookie': sessionCookieHeader(request, token, SESSION_TTL_SEC),
    });
  } catch (err) {
    console.error('Could not create session:', err);
    return jsonResponse({ error: 'Could not start session.' }, 500);
  }
}

export async function onRequestDelete({ request, env }) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const token = getCookie(request, SESSION_COOKIE);
  if (token && env?.DB) {
    try {
      await ensureSchema(env.DB);
      const secret = await getSessionSecret(env);
      if (secret) {
        await revokeSessionToken(token, secret, env.DB);
      }
    } catch (err) {
      console.warn('Session revocation skipped:', err?.message);
    }
  }

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': sessionCookieHeader(request, '', 0),
  });
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST, DELETE' });
}
