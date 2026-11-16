// POST /api/dev/login — step 1 of the developer sign-in (email + password → emails a 6-digit code)
import { jsonResponse } from '../../../lib/db.js';
import { handleDevLogin } from '../../../lib/dev.js';

export function onRequestPost({ request, env }) {
  return handleDevLogin(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
