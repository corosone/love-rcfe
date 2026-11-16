// POST /api/dev/verify — step 2 of the developer sign-in (the emailed 6-digit code → session)
import { jsonResponse } from '../../../lib/db.js';
import { handleDevVerify } from '../../../lib/dev.js';

export function onRequestPost({ request, env }) {
  return handleDevVerify(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
