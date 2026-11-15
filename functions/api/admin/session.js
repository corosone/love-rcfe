import {
  jsonResponse, checkAdminPrereqs, checkPasswordWithLockout,
  createSessionToken, sessionCookieHeader, SESSION_TTL_SEC,
} from '../../../lib/db.js';

export async function onRequestPost({ request, env }) {
  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  let body;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid JSON body.' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'Invalid JSON body.' }, 400);
  }

  if (typeof body.password !== 'string' || !body.password) {
    return jsonResponse({ error: 'Please enter the staff password.' }, 400);
  }

  const denied = await checkPasswordWithLockout(request, env, body.password);
  if (denied) return denied;

  const token = await createSessionToken(env.INBOX_PASSWORD);
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': sessionCookieHeader(request, token, SESSION_TTL_SEC),
  });
}

export function onRequestDelete({ request }) {
  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': sessionCookieHeader(request, '', 0),
  });
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST, DELETE' });
}
