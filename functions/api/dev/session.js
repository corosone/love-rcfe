// DELETE /api/dev/session — sign out of the developer console. The browser only sends the staff
// inbox cookie to /api/admin, so the console signs out through DELETE /api/admin/session first
// (same code, and it also ends the staff session on the server), then calls this one.
import { jsonResponse } from '../../../lib/db.js';
import { signOutEverywhere } from '../../../lib/dev.js';

export function onRequestDelete({ request, env }) {
  return signOutEverywhere(request, env);
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'DELETE' });
}
