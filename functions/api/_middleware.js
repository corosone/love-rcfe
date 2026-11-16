// Runs in front of every /api request (the enquiry forms, the staff inbox and the developer
// console). It turns away IP addresses blocked in the developer console, and otherwise lets
// the request through unchanged. It does not record anything: the request log only holds
// page visits (see functions/api/visit.js).
//
// Never blocked:
//   /api/dev/...  the developer console, so the owner can always sign in and unblock
//   /api/visit    page-visit records, so you can see whether a blocked address is still visiting
import { isBlocked, recordBlockedHit, blockedResponse } from '../../lib/blocklist.js';

export async function onRequest(context) {
  const { request, env } = context;
  let pathname = '';
  try {
    pathname = new URL(request.url).pathname;
  } catch {
    return context.next();
  }

  if (!pathname.startsWith('/api/dev/') && pathname !== '/api/visit' && (await isBlocked(env, request))) {
    context.waitUntil(recordBlockedHit(env, request));
    return blockedResponse();
  }
  return context.next();
}
