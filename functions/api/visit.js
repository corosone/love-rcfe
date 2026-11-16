// POST /api/visit — a page sends this once when it opens (see public/visit.js), so page visits
// appear in the developer console's request log with the visitor's IP address.
// It stores only the page address; it never sets cookies and never returns data.
import { jsonResponse, verifySameOrigin, readJsonBody } from '../../lib/db.js';
import { logRequest } from '../../lib/requestlog.js';

const PATH_RE = /^\/[A-Za-z0-9._~\-\/%]{0,150}$/;
const VIEW_RE = /^[a-z0-9-]{1,40}$/;

export async function onRequestPost(context) {
  const { request, env } = context;
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const parsed = await readJsonBody(request, 1024);
  if (!parsed.ok) return parsed.response;
  const path = typeof parsed.data.path === 'string' ? parsed.data.path : '';
  const view = typeof parsed.data.view === 'string' ? parsed.data.view.toLowerCase() : '';
  if (!PATH_RE.test(path) || (view && !VIEW_RE.test(view))) {
    return jsonResponse({ error: 'Invalid page address.' }, 400);
  }
  const status = parsed.data.status === 404 ? 404 : 200;

  context.waitUntil(logRequest(env, request, {
    kind: 'view',
    method: 'GET',
    path: view ? `${path}#${view}` : path,
    status,
  }));
  return new Response(null, {
    status: 204,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow' },
  });
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
