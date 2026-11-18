// Trusted devices: browsers that have signed in successfully before.
//
// Both sign-ins have a site-wide lockout: after many wrong passwords from anywhere, nobody can
// sign in for a while. That stops guessing from many addresses at once, but on its own it would
// also let a stranger keep the owner and staff out just by typing wrong passwords.
//
// So a browser that has signed in successfully gets a "trusted device" cookie, and the site-wide
// lockout and the site-wide sign-in rate limit do not apply to it. Everything else still does: the
// password (and for developers the emailed code), the lockout for its own network, the emergency
// lock. A trusted device can never sign in without the password.
//
// The cookie is a long random value; only a one-way fingerprint of it is stored. It is HttpOnly,
// SameSite=Strict, Secure, and only sent to that sign-in's own part of the site.
//   staff:     lovercfe_staff_trust  (Path=/api/admin), 90 days, renewed on each sign-in
//   developer: lovercfe_dev_trust    (Path=/api/dev),   90 days, renewed on each sign-in
// "Sign out all staff" forgets every trusted staff device; "Sign out my other developer devices"
// and the emergency lock forget every trusted developer device except the one in use.

import { getCookie, cookieHeader } from './db.js';

export const TRUST_TTL_SEC = 90 * 24 * 60 * 60;
const KINDS = {
  staff: { cookie: 'lovercfe_staff_trust', path: '/api/admin', keep: 200 },
  dev: { cookie: 'lovercfe_dev_trust', path: '/api/dev', keep: 10 },
};
const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;
const nowSec = () => Math.floor(Date.now() / 1000);

function kindOf(kind) {
  if (!Object.prototype.hasOwnProperty.call(KINDS, kind)) throw new Error('Unknown trusted-device kind.');
  return KINDS[kind];
}

async function fingerprint(kind, token) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`trust-v1|${kind}|${token}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken() {
  let bin = '';
  for (const b of crypto.getRandomValues(new Uint8Array(32))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function tokenFrom(request, kind) {
  const token = getCookie(request, kindOf(kind).cookie);
  return TOKEN_RE.test(token) ? token : '';
}

// True when this browser is a trusted device of that kind. Read-only; false on any error.
export async function isTrusted(request, env, kind) {
  const token = tokenFrom(request, kind);
  if (!token || !env?.DB) return false;
  try {
    const row = await env.DB
      .prepare('SELECT 1 AS yes FROM trusted_devices WHERE id = ? AND kind = ? AND expires_at > ?')
      .bind(await fingerprint(kind, token), kind, nowSec())
      .first();
    return Boolean(row?.yes);
  } catch (err) {
    console.warn('Trusted-device check failed:', err?.message);
    return false;
  }
}

// After a successful sign-in: remembers this browser (a fresh value each time, replacing the
// old one) and returns the Set-Cookie header to send. Returns '' if it could not be stored.
export async function trustThisDevice(request, env, kind) {
  const cfg = kindOf(kind);
  const now = nowSec();
  try {
    const old = tokenFrom(request, kind);
    if (old) await env.DB.prepare('DELETE FROM trusted_devices WHERE id = ?').bind(await fingerprint(kind, old)).run();
    const token = newToken();
    await env.DB
      .prepare('INSERT INTO trusted_devices (id, kind, created_at, expires_at) VALUES (?, ?, ?, ?)')
      .bind(await fingerprint(kind, token), kind, now, now + TRUST_TTL_SEC)
      .run();
    // Keep the list small: drop ended ones, and the oldest beyond the limit.
    await env.DB
      .prepare(`
        DELETE FROM trusted_devices WHERE kind = ? AND (expires_at <= ? OR id NOT IN (
          SELECT id FROM trusted_devices WHERE kind = ? ORDER BY created_at DESC, rowid DESC LIMIT ${cfg.keep}
        ))
      `)
      .bind(kind, now, kind)
      .run();
    return cookieHeader(request, cfg.cookie, token, TRUST_TTL_SEC, cfg.path);
  } catch (err) {
    console.warn('Could not remember this device:', err?.message);
    return '';
  }
}

// Forgets every trusted device of that kind, except the browser making this request when
// keepRequest is given. Returns how many were forgotten.
export async function forgetTrustedDevices(env, kind, keepRequest = null) {
  kindOf(kind);
  const keep = keepRequest ? tokenFrom(keepRequest, kind) : '';
  const res = keep
    ? await env.DB.prepare('DELETE FROM trusted_devices WHERE kind = ? AND id != ?').bind(kind, await fingerprint(kind, keep)).run()
    : await env.DB.prepare('DELETE FROM trusted_devices WHERE kind = ?').bind(kind).run();
  return Number(res?.meta?.changes || 0);
}
