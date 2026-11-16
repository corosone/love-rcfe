// Blocked IP addresses, managed from the developer console (Security tab).
//
// A blocked address can still open the website's pages, but every request it makes to the
// site's server is refused: enquiry and call-request forms, and the staff inbox sign-in.
// The developer console (/api/dev/...) is never blocked, so the owner can always sign in
// and unblock; it has its own protections (security check, password, emailed code, lock).
//
// Checking costs almost nothing: each Cloudflare server instance reads the (small) list at
// most once a minute and keeps it in memory. If the database cannot be read, nothing is
// blocked: a database hiccup must never take the enquiry form down.

import { ensureSchema, clientIp, jsonResponse } from './db.js';

export const MAX_BLOCKS = 500;
export const BLOCK_DAYS = [1, 7, 30, 0]; // 0 = permanently
const CACHE_MS = 60 * 1000;
const HIT_FLUSH_MS = 60 * 1000;

const cache = { at: 0, map: new Map() }; // ip -> expires_at
const pendingHits = new Map(); // ip -> { n, flushedAt }

const nowSec = () => Math.floor(Date.now() / 1000);

// Returns the address in one standard form, or '' if it is not a valid IPv4 or IPv6 address.
export function normalizeIp(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s || s.length > 45) return '';
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n, i) => n > 255 || (v4[i + 1].length > 1 && v4[i + 1][0] === '0'))) return '';
    return parts.join('.');
  }
  if (!s.includes(':') || !/^[0-9a-f:.]+$/.test(s)) return '';
  try {
    // The URL parser checks IPv6 strictly and writes it in its shortest standard form.
    const host = new URL(`http://[${s}]/`).hostname;
    return host.slice(1, -1);
  } catch {
    return '';
  }
}

function isActive(expiresAt, now = nowSec()) {
  return Number(expiresAt) === 0 || Number(expiresAt) > now;
}

async function loadBlocks(env) {
  if (Date.now() - cache.at < CACHE_MS) return cache.map;
  try {
    await ensureSchema(env.DB);
    const res = await env.DB
      .prepare('SELECT ip, expires_at FROM blocked_ips WHERE expires_at = 0 OR expires_at > ?')
      .bind(nowSec())
      .all();
    cache.map = new Map((res?.results || []).map((r) => [r.ip, Number(r.expires_at)]));
  } catch (err) {
    console.warn('Could not read blocked addresses (nothing is blocked until it can):', err?.message);
    cache.map = new Map();
  }
  cache.at = Date.now();
  return cache.map;
}

// Used after a block or unblock so this server instance applies the change at once
// (others pick it up within a minute).
export function invalidateBlockCache() {
  cache.at = 0;
}

export async function isBlocked(env, request) {
  if (!env?.DB) return false;
  const ip = normalizeIp(clientIp(request));
  if (!ip) return false;
  const map = await loadBlocks(env);
  return map.has(ip) && isActive(map.get(ip));
}

// Counts refused requests per blocked address. Written at most once a minute per address,
// so a blocked address hammering the site cannot use up the database allowance.
export async function recordBlockedHit(env, request) {
  const ip = normalizeIp(clientIp(request));
  if (!ip || !env?.DB) return;
  const now = Date.now();
  const p = pendingHits.get(ip) || { n: 0, flushedAt: 0 };
  p.n++;
  pendingHits.set(ip, p);
  if (pendingHits.size > 2000) {
    for (const key of pendingHits.keys()) {
      if (pendingHits.size <= 1000) break;
      pendingHits.delete(key);
    }
  }
  if (now - p.flushedAt < HIT_FLUSH_MS) return;
  const n = p.n;
  p.n = 0;
  p.flushedAt = now;
  try {
    await env.DB
      .prepare('UPDATE blocked_ips SET hits = hits + ?, last_hit = ? WHERE ip = ?')
      .bind(n, nowSec(), ip)
      .run();
  } catch (err) {
    console.warn('Could not count a blocked request:', err?.message);
  }
}

// What a blocked address sees. It gives real people (whose address may be shared) a way
// to reach the business, and says nothing about how the block works.
export function blockedResponse() {
  return jsonResponse(
    { error: 'Sorry, this cannot be sent from your current network. Please call (818) 217-5755 or email loveRCFE@gmail.com.' },
    403
  );
}

// ---------- Used by the developer console ----------

export async function listBlocks(db) {
  const res = await db
    .prepare(`
      SELECT ip, reason, created_at AS createdAt, expires_at AS expiresAt, hits, last_hit AS lastHit
      FROM blocked_ips WHERE expires_at = 0 OR expires_at > ?
      ORDER BY created_at DESC LIMIT ?
    `)
    .bind(nowSec(), MAX_BLOCKS)
    .all();
  return (res?.results || []).map((r) => ({
    ip: r.ip,
    reason: r.reason || '',
    createdAt: Number(r.createdAt),
    expiresAt: Number(r.expiresAt),
    hits: Number(r.hits || 0),
    lastHit: Number(r.lastHit || 0),
  }));
}

// Returns { ok, message, status } for the console.
export async function addBlock(env, request, { ip: rawIp, reason: rawReason, days: rawDays } = {}) {
  const ip = normalizeIp(rawIp);
  if (!ip) return { ok: false, status: 400, message: 'That is not a valid IP address (for example 203.0.113.7).' };
  if (ip === normalizeIp(clientIp(request))) {
    return { ok: false, status: 400, message: 'That is the address you are using right now, so it was not blocked (it would block you too).' };
  }
  const days = Number(rawDays);
  if (!BLOCK_DAYS.includes(days)) return { ok: false, status: 400, message: 'Choose how long to block it for.' };
  const reason = typeof rawReason === 'string' ? rawReason.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : '';
  const now = nowSec();

  await env.DB.prepare('DELETE FROM blocked_ips WHERE expires_at != 0 AND expires_at <= ?').bind(now).run();
  const existing = await env.DB.prepare('SELECT 1 AS yes FROM blocked_ips WHERE ip = ?').bind(ip).first();
  if (!existing) {
    const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM blocked_ips').first();
    if (Number(count?.n || 0) >= MAX_BLOCKS) {
      return { ok: false, status: 400, message: `You can block up to ${MAX_BLOCKS} addresses. Unblock some first.` };
    }
  }
  const expiresAt = days === 0 ? 0 : now + days * 86400;
  // Blocking an address again updates the reason and length, and keeps its attempt count.
  await env.DB
    .prepare(`
      INSERT INTO blocked_ips (ip, reason, created_at, expires_at) VALUES (?, ?, ?, ?)
      ON CONFLICT(ip) DO UPDATE SET reason = excluded.reason, created_at = excluded.created_at, expires_at = excluded.expires_at
    `)
    .bind(ip, reason, now, expiresAt)
    .run();
  invalidateBlockCache();
  const length = days === 0 ? 'permanently' : `for ${days} day${days === 1 ? '' : 's'}`;
  return {
    ok: true,
    ip,
    length,
    message: `Blocked ${ip} ${length}. It can still open the website, but it can no longer send enquiries or sign in to the staff inbox. Other Cloudflare servers apply it within a minute.`,
  };
}

export async function removeBlock(env, rawIp) {
  const ip = normalizeIp(rawIp);
  if (!ip) return { ok: false, status: 400, message: 'That is not a valid IP address.' };
  const res = await env.DB.prepare('DELETE FROM blocked_ips WHERE ip = ?').bind(ip).run();
  invalidateBlockCache();
  pendingHits.delete(ip);
  return Number(res?.meta?.changes || 0)
    ? { ok: true, ip, message: `Unblocked ${ip}. Other Cloudflare servers apply it within a minute.` }
    : { ok: false, status: 404, message: `${ip} was not blocked.` };
}

// For tests only.
export function _resetBlockCache() {
  cache.at = 0;
  cache.map = new Map();
  pendingHits.clear();
}
