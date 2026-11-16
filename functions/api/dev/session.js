// DELETE /api/dev/session — sign out (developer session and any staff session in this browser)
import { jsonResponse } from '../../../lib/db.js';
import { signOutEverywhere } from '../../../lib/dev.js';

export function onRequestDelete({ request, env }) {
  return signOutEverywhere(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'DELETE' });
}
