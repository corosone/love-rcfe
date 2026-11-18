// Request log for the developer console: every page visit (see functions/api/visit.js and
// public/visit.js), with IP address, approximate location and browser. Requests to the site's
// server (forms, sign-ins) are not recorded.
//
// Cloudflare's free plan allows 100,000 database row writes per day for the whole site, and
// enquiries and sign-ins stop working if that runs out. So this log is strictly capped:
//   - each sender (an IPv4 address, or one IPv6 home network): at most 60 logged requests per
//     10 minutes (one note row marks the rest)
//   - each Cloudflare server instance: at most 200 per minute and 8,000 per day
//   - only the newest 5,000 rows (and nothing older than 30 days) are kept
// It can also be paused from the console. Logging never delays or breaks the real request.

import { ensureSchema, clientIp, senderKey } from './db.js';
import { shortUA, cfLocation } from './reqinfo.js';
import { cfNetwork } from './netinfo.js';

const PER_IP_LIMIT = 60;
const PER_IP_WINDOW_MS = 10 * 60 * 1000;
const PER_MINUTE_LIMIT = 200;
const PER_DAY_LIMIT = 8000;
export const KEEP_ROWS = 5000;
export const KEEP_DAYS = 30;
const PAUSE_NAME = 'request_log_paused';

const ipWindows = new Map(); // ip -> { start, n }
const minute = { start: 0, n: 0 };
const day = { key: -1, n: 0 };
const pauseCache = { value: false, at: 0 };

// 'log' | 'note' (first request over the per-IP cap: write one marker) | 'skip'
function budget(ip) {
  const now = Date.now();
  const dayKey = Math.floor(now / 86400000); // resets at midnight UTC, like Cloudflare's own limits
  if (day.key !== dayKey) { day.key = dayKey; day.n = 0; }
  if (now - minute.start >= 60000) { minute.start = now; minute.n = 0; }
  if (day.n >= PER_DAY_LIMIT || minute.n >= PER_MINUTE_LIMIT) return 'skip';

  let w = ipWindows.get(ip);
  if (!w || now - w.start >= PER_IP_WINDOW_MS) {
    w = { start: now, n: 0 };
    ipWindows.delete(ip);
    ipWindows.set(ip, w);
  }
  w.n++;
  if (ipWindows.size > 5000) {
    for (const [k, v] of ipWindows) {
      if (now - v.start >= PER_IP_WINDOW_MS) ipWindows.delete(k);
    }
    while (ipWindows.size > 5000) ipWindows.delete(ipWindows.keys().next().value);
  }
  if (w.n > PER_IP_LIMIT + 1) return 'skip';
  day.n++;
  minute.n++;
  return w.n === PER_IP_LIMIT + 1 ? 'note' : 'log';
}

// Whether logging is paused (from the console). Cached for a minute per server instance;
// fresh=true reads the database directly (used by the console itself).
export async function requestLogPaused(env, { fresh = false } = {}) {
  if (!env?.DB) return false;
  if (!fresh && pauseCache.at && Date.now() - pauseCache.at < 60000) return pauseCache.value;
  try {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(PAUSE_NAME).first();
    pauseCache.value = row?.value === '1';
  } catch (err) {
    console.warn('Could not read request log setting:', err?.message);
  }
  pauseCache.at = Date.now();
  return pauseCache.value;
}

export async function setRequestLogPaused(env, paused) {
  if (paused) {
    await env.DB
      .prepare("INSERT INTO app_secrets (name, value) VALUES (?, '1') ON CONFLICT(name) DO UPDATE SET value = '1'")
      .bind(PAUSE_NAME)
      .run();
  } else {
    await env.DB.prepare('DELETE FROM app_secrets WHERE name = ?').bind(PAUSE_NAME).run();
  }
  pauseCache.value = Boolean(paused);
  pauseCache.at = Date.now();
}

const cleanText = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]/g, '').slice(0, max);

// Writes one row. Never throws.
export async function logRequest(env, request, { kind = 'api', method = '', path = '', status = 0 } = {}) {
  if (!env?.DB) return;
  try {
    const ip = clientIp(request).slice(0, 64);
    if (await requestLogPaused(env)) return;
    // The per-sender cap counts a whole home or phone network as one sender (see lib/ipnet.js).
    const decision = budget(senderKey(request));
    if (decision === 'skip') return;
    await ensureSchema(env.DB);
    const now = Math.floor(Date.now() / 1000);
    const note = decision === 'note';
    const net = cfNetwork(request);
    await env.DB
      .prepare('INSERT INTO request_log (at, kind, method, path, status, ip, place, device, asn, isp) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)')
      .bind(
        now,
        note ? 'note' : 'view',
        note ? '' : cleanText(method, 10).toUpperCase(),
        note ? 'More requests from this address in the next few minutes were not recorded (limit reached).' : cleanText(path, 200),
        note ? 0 : (Number.isInteger(status) ? status : 0),
        ip,
        cleanText(cfLocation(request), 80),
        cleanText(shortUA(request), 60),
        net.asn,
        cleanText(net.isp, 100)
      )
      .run();
    if (Math.random() < 0.02) await trimRequestLog(env.DB);
  } catch (err) {
    console.warn('Could not write request log:', err?.message);
  }
}

export async function trimRequestLog(db) {
  const cutoff = Math.floor(Date.now() / 1000) - KEEP_DAYS * 86400;
  const res = await db
    // kind = 'api': server requests recorded by an earlier version of the site (no longer kept)
    .prepare("DELETE FROM request_log WHERE at < ? OR kind = 'api' OR id <= (SELECT id FROM request_log ORDER BY id DESC LIMIT 1 OFFSET ?)")
    .bind(cutoff, KEEP_ROWS)
    .run();
  return Number(res?.meta?.changes || 0);
}

// For tests only.
export function _resetRequestLogLimits() {
  ipWindows.clear();
  minute.start = 0; minute.n = 0;
  day.key = -1; day.n = 0;
  pauseCache.value = false; pauseCache.at = 0;
}
