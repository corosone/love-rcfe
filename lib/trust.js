// Trusted devices: browsers that have signed in successfully before.
//
// Both sign-ins have a site-wide lockout: after many wrong passwords from anywhere, nobody can
// sign in for a while. That stops guessing from many addresses at once, but on its own it would
// also let a stranger keep the owner and staff out just by typing wrong passwords.
//
// So a browser that has signed in successfully gets a "trusted device" cookie, and the site-wide
// lockout and the site-wide sign-in rate limit do not apply to it (for staff, only when it signs in
// to the same account again, or with the shared password if that is what it used). Everything
// else still does: the password (and for developers the emailed code), the lockout for its own
// network, the emergency lock. A trusted device can never sign in without the password.
//
// The cookie is a long random value; only a one-way fingerprint of it is stored. It is HttpOnly,
// SameSite=Strict, Secure, and only sent to that sign-in's own part of the site.
//   staff:     lovercfe_staff_trust  (Path=/api/admin), 90 days, renewed on each sign-in
//   developer: lovercfe_dev_trust    (Path=/api/dev),   90 days, renewed on each sign-in
// "Sign out all staff" forgets every trusted staff device; removing a staff account or giving it a
// new password forgets that person's, and turning the shared staff password off forgets the ones
// it made trusted. "Sign out my other developer devices" and the emergency lock forget every
// trusted developer device except the one in use.

import { getCookie, cookieHeader } from './db.js';

export const TRUST_TTL_SEC = 90 * 24 * 60 * 60;
// keep: the most trusted devices kept in all. Staff devices are also limited per staff account
// (perAccount; the shared staff password gets perShared, the old overall limit), so one account
// signing in over and over can only push out its own older devices, never anyone else's (who
// would then lose their protection from the site-wide lockout). 50 accounts x 20 + 200 = 1200.
const KINDS = {
  staff: { cookie: 'lovercfe_staff_trust', path: '/api/admin', keep: 1200, perAccount: 20, perShared: 200 },
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
// accountId (staff): only trusted for signing in to that same account (0 = the shared staff
// password), so a browser trusted for one person does not skip the site-wide lockout when trying
// someone else's account. It may be a function that finds the account; it is only called when the
// browser has a trust cookie at all.
export async function isTrusted(request, env, kind, { accountId } = {}) {
  const token = tokenFrom(request, kind);
  if (!token || !env?.DB) return false;
  try {
    const account = typeof accountId === 'function' ? await accountId() : accountId;
    const forAccount = account === undefined ? '' : ' AND account_id = ?';
    const row = await env.DB
      .prepare(`SELECT 1 AS yes FROM trusted_devices WHERE id = ? AND kind = ? AND expires_at > ?${forAccount}`)
      .bind(await fingerprint(kind, token), kind, nowSec(), ...(account === undefined ? [] : [Number(account)]))
      .first();
    return Boolean(row?.yes);
  } catch (err) {
    console.warn('Trusted-device check failed:', err?.message);
    return false;
  }
}

// After a successful sign-in: remembers this browser (a fresh value each time, replacing the
// old one) and returns the Set-Cookie header to send. Returns '' if it could not be stored.
// accountId: the staff account that signed in (0 = the shared staff password; always 0 for developers).
export async function trustThisDevice(request, env, kind, { accountId = 0 } = {}) {
  const cfg = kindOf(kind);
  const now = nowSec();
  try {
    const old = tokenFrom(request, kind);
    if (old) await env.DB.prepare('DELETE FROM trusted_devices WHERE id = ?').bind(await fingerprint(kind, old)).run();
    const token = newToken();
    const account = cfg.perAccount ? Number(accountId) || 0 : 0;
    await env.DB
      .prepare('INSERT INTO trusted_devices (id, kind, created_at, expires_at, account_id) VALUES (?, ?, ?, ?, ?)')
      .bind(await fingerprint(kind, token), kind, now, now + TRUST_TTL_SEC, account)
      .run();
    if (cfg.perAccount) {
      // This account's own limit
      await env.DB
        .prepare(`
          DELETE FROM trusted_devices WHERE kind = ? AND account_id = ? AND id NOT IN (
            SELECT id FROM trusted_devices WHERE kind = ? AND account_id = ? ORDER BY created_at DESC, rowid DESC LIMIT ${account ? cfg.perAccount : cfg.perShared}
          )
        `)
        .bind(kind, account, kind, account)
        .run();
    }
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

// Forgets the trusted staff browsers of one staff account (when the person is removed, gets a new
// password, or changes their own), except the browser making this request when keepRequest is
// given. Returns how many were forgotten.
export async function forgetAccountDevices(env, accountId, keepRequest = null) {
  const id = Number(accountId);
  if (!Number.isInteger(id) || id <= 0) return 0;
  const keep = keepRequest ? tokenFrom(keepRequest, 'staff') : '';
  const res = await env.DB
    .prepare("DELETE FROM trusted_devices WHERE kind = 'staff' AND account_id = ? AND id != ?")
    .bind(id, keep ? await fingerprint('staff', keep) : '')
    .run();
  return Number(res?.meta?.changes || 0);
}

// Forgets the browsers trusted after signing in with the shared staff password (when it is
// turned off). Returns how many were forgotten.
export async function forgetSharedPasswordDevices(env) {
  const res = await env.DB.prepare("DELETE FROM trusted_devices WHERE kind = 'staff' AND account_id = 0").run();
  return Number(res?.meta?.changes || 0);
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
