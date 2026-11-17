// GET /api/settings — public settings the website reads (no personal information):
//   { holiday: { from: "YYYY-MM-DD", to: "YYYY-MM-DD" } | null }
// Set from the developer console's Tools tab. See lib/settings.js.
import { jsonResponse } from '../../lib/db.js';
import { getHoliday } from '../../lib/settings.js';

export async function onRequestGet({ env }) {
  const holiday = await getHoliday(env);
  // A minute of browser caching keeps this cheap; a change shows up within a minute.
  return jsonResponse({ holiday: holiday || null }, 200, { 'Cache-Control': 'public, max-age=60' });
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'GET' });
}
