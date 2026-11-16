// Runs around every /api request: lets the request through unchanged, then records it in the
// developer console's request log after the response has been sent (context.waitUntil), so it
// never slows anything down. Logging errors are swallowed inside logRequest.
import { logRequest, shouldLogApiRequest } from '../../lib/requestlog.js';

export async function onRequest(context) {
  const { request, env } = context;
  let pathname = '';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return context.next();
  }
  let response;
  try {
    response = await context.next();
  } catch (err) {
    if (shouldLogApiRequest(request.method, pathname, 500)) {
      context.waitUntil(logRequest(env, request, { kind: 'api', method: request.method, path: pathname, status: 500 }));
    }
    throw err;
  }
  if (shouldLogApiRequest(request.method, pathname, response.status)) context.waitUntil(logRequest(env, request, { kind: 'api', method: request.method, path: pathname, status: response.status }));
  return response;
}
