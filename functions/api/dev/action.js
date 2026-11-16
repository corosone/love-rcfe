// POST /api/dev/action — developer-only tools (developer session required)
import { jsonResponse, readJsonBody } from '../../../lib/db.js';
import { authorizeDev, devAudit, FORMSPREE_URL_RE } from '../../../lib/dev.js';

const ACTIONS = {
  // Signs every staff device out of the inbox (they sign in again with the staff password).
  async signout_staff(request, env) {
    const res = await env.DB.prepare('DELETE FROM admin_sessions').run();
    return { message: `Signed out ${Number(res?.meta?.changes || 0)} staff session(s).` };
  },

  // Removes "too many wrong passwords" lockouts and sign-in rate limits, e.g. after staff lock themselves out.
  async clear_lockouts(request, env) {
    const locks = await env.DB.prepare('DELETE FROM auth_attempts').run();
    await env.DB
      .prepare("DELETE FROM rate_limits WHERE key LIKE 'login:%' OR key LIKE 'admin:%' OR key LIKE 'devlogin:%'")
      .run();
    return { message: `Cleared ${Number(locks?.meta?.changes || 0)} lockout record(s) and the sign-in rate limits. Anyone who tried many times in the last minute may need to wait one more minute.` };
  },

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
        : { ok: false, message: `Formspree rejected the test (HTTP ${res.status}). Check the form's settings on formspree.io.` };
    } catch (err) {
      return { ok: false, message: 'Formspree could not be reached. Please try again.' };
    }
  },
};

export async function onRequestPost({ request, env }) {
  const { denied } = await authorizeDev(request, env);
  if (denied) return denied;

  const parsed = await readJsonBody(request, 2048);
  if (!parsed.ok) return parsed.response;
  const name = typeof parsed.data.action === 'string' ? parsed.data.action : '';
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, name)) {
    return jsonResponse({ error: 'Unknown action.' }, 400);
  }

  try {
    const result = await ACTIONS[name](request, env);
    const ok = result.ok !== false;
    await devAudit(env, request, name, ok ? 'ok' : 'failed');
    return jsonResponse({ ok, message: result.message }, ok ? 200 : 502);
  } catch (err) {
    console.error(`Developer action ${name} failed:`, err);
    return jsonResponse({ error: 'That action failed. Please try again.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
