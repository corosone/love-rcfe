// Individual staff accounts for the staff inbox (/staff).
//
// The developer console (Security tab) creates an account for each person: a name and a
// password the site makes up. Each person then signs in with their own name and password, the
// activity log shows who signed in, and the inbox shows who last changed each enquiry. Removing
// someone, or giving them a new password, signs them out everywhere at once and does not affect
// anyone else. People can change their own password from the inbox.
//
// The shared staff password (INBOX_PASSWORD in Cloudflare) keeps working until the owner turns
// it off in the console, so nothing changes until the accounts are set up. It cannot be turned
// off while there are no accounts. INBOX_PASSWORD must stay set either way: it is also part of
// the key that signs staff sessions.
//
// Passwords are never stored. Only a slow one-way fingerprint (PBKDF2-SHA256 with a random salt
// per account) is kept, so a copy of the database does not reveal them.

import { verifyPassword } from './db.js';
import { forgetAccountDevices, forgetSharedPasswordDevices } from './trust.js';

export const MIN_STAFF_PASSWORD = 12;
export const MAX_ACCOUNTS = 50;
// Cloudflare's free plan gives each request about 10 ms of computing time, so this is kept
// moderate; made-up passwords are long and random, which matters far more.
const ITERATIONS = 20000;
const SHARED_NAME = 'staff_shared_password'; // in app_secrets: 'off' when turned off
const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);

const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
const randomHex = (n) => toHex(crypto.getRandomValues(new Uint8Array(n)));

async function pbkdf2(password, saltHex, iterations) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const salt = new Uint8Array(saltHex.match(/../g).map((h) => parseInt(h, 16)));
  return toHex(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256));
}

export async function hashStaffPassword(password) {
  const salt = randomHex(16);
  return { hash: await pbkdf2(password, salt, ITERATIONS), salt, iterations: ITERATIONS };
}

// A made-up password that is easy to read out loud or type: four groups of four letters and
// digits with no look-alikes (no 0/O, 1/l/I), e.g. "k7rd-m4qx-2hzn-wp9c" (about 80 bits).
export function makeStaffPassword() {
  const alphabet = 'abcdefghjkmnpqrstuvwxyz23456789';
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    while (s.length < 4) {
      const b = crypto.getRandomValues(new Uint8Array(1))[0];
      if (b < 248) s += alphabet[b % alphabet.length]; // 248 = 8 * 31: every letter equally likely
    }
    groups.push(s);
  }
  return groups.join('-');
}

// A person's name as typed: letters (any language), spaces, apostrophes, dots and hyphens,
// 2 to 40 characters. Returns '' when it is not usable.
export function cleanStaffName(value) {
  const s = String(value ?? '').normalize('NFC').replace(/\s+/g, ' ').trim();
  return /^[\p{L}\p{M}][\p{L}\p{M} '’.-]{1,39}$/u.test(s) ? s : '';
}

// What a new password must look like. Returns '' when fine, or what is wrong.
export function staffPasswordProblem(password, { name = '' } = {}) {
  if (typeof password !== 'string' || password.length < MIN_STAFF_PASSWORD) return `Use at least ${MIN_STAFF_PASSWORD} characters.`;
  if (password.length > 128) return 'Use at most 128 characters.';
  if (/^(.)\1+$/.test(password)) return 'That password is too easy to guess.';
  if (name && password.toLowerCase().includes(name.toLowerCase().split(' ')[0])) return 'Do not use your name in your password.';
  return '';
}

// ---------- Shared staff password (INBOX_PASSWORD) on or off ----------
// If the setting cannot be read, the shared password counts as turned off (it fails closed).
export async function sharedPasswordAllowed(env) {
  try {
    const row = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(SHARED_NAME).first();
    return row?.value !== 'off';
  } catch {
    return false;
  }
}

// The account id for a name, or -1 when there is no such account.
export async function staffAccountId(db, rawName) {
  const name = cleanStaffName(rawName);
  if (!name) return -1;
  const row = await db.prepare('SELECT id FROM staff_accounts WHERE name = ? COLLATE NOCASE').bind(name).first();
  return row ? Number(row.id) : -1;
}

// Turning it off signs out everyone who signed in with it, and forgets the browsers it made
// trusted. Needs at least one account.
export async function setSharedPassword(env, allowed) {
  if (allowed) {
    await env.DB.prepare('DELETE FROM app_secrets WHERE name = ?').bind(SHARED_NAME).run();
    return { ok: true, signedOut: 0 };
  }
  const count = await env.DB.prepare('SELECT COUNT(*) AS n FROM staff_accounts').first();
  if (!Number(count?.n)) {
    return { ok: false, status: 400, message: 'Create at least one staff account first, so someone can still sign in.' };
  }
  await env.DB
    .prepare("INSERT INTO app_secrets (name, value) VALUES (?, 'off') ON CONFLICT(name) DO UPDATE SET value = 'off'")
    .bind(SHARED_NAME)
    .run();
  const res = await env.DB.prepare('DELETE FROM admin_sessions WHERE account_id = 0').run();
  await forgetSharedPasswordDevices(env);
  return { ok: true, signedOut: Number(res?.meta?.changes || 0) };
}

// ---------- Accounts ----------
export async function listStaffAccounts(db) {
  const now = nowSec();
  const res = await db
    .prepare(`
      SELECT a.id, a.name, a.created_at AS createdAt, a.last_sign_in AS lastSignIn, a.password_set_at AS passwordSetAt,
        (SELECT COUNT(*) FROM admin_sessions s WHERE s.account_id = a.id AND s.expires_at > ?) AS sessions
      FROM staff_accounts a ORDER BY a.name COLLATE NOCASE
    `)
    .bind(now)
    .all();
  return (res?.results || []).map((r) => ({
    id: Number(r.id),
    name: r.name,
    createdAt: Number(r.createdAt) || 0,
    lastSignIn: Number(r.lastSignIn) || 0,
    passwordSetAt: Number(r.passwordSetAt) || 0,
    sessions: Number(r.sessions) || 0,
  }));
}

export async function createStaffAccount(db, rawName) {
  const name = cleanStaffName(rawName);
  if (!name) return { ok: false, status: 400, message: 'Type the person\'s name (letters only, 2 to 40 characters).' };
  const count = await db.prepare('SELECT COUNT(*) AS n FROM staff_accounts').first();
  if (Number(count?.n) >= MAX_ACCOUNTS) return { ok: false, status: 400, message: `There can be at most ${MAX_ACCOUNTS} staff accounts.` };
  const taken = await db.prepare('SELECT 1 AS yes FROM staff_accounts WHERE name = ? COLLATE NOCASE').bind(name).first();
  if (taken) return { ok: false, status: 409, message: `There is already an account called "${name}".` };
  const password = makeStaffPassword();
  const h = await hashStaffPassword(password);
  const now = nowSec();
  const res = await db
    .prepare('INSERT INTO staff_accounts (name, pass_hash, pass_salt, iterations, created_at, password_set_at) VALUES (?, ?, ?, ?, ?, ?) RETURNING id')
    .bind(name, h.hash, h.salt, h.iterations, now, now)
    .first();
  return { ok: true, id: Number(res?.id), name, password };
}

// A new made-up password; signs that person out everywhere and forgets their trusted browsers.
export async function resetStaffPassword(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, message: 'Unknown staff account.' };
  const account = await db.prepare('SELECT id, name FROM staff_accounts WHERE id = ?').bind(id).first();
  if (!account) return { ok: false, status: 404, message: 'That staff account no longer exists.' };
  const password = makeStaffPassword();
  const h = await hashStaffPassword(password);
  await db
    .prepare('UPDATE staff_accounts SET pass_hash = ?, pass_salt = ?, iterations = ?, password_set_at = ? WHERE id = ?')
    .bind(h.hash, h.salt, h.iterations, nowSec(), id)
    .run();
  await db.prepare('DELETE FROM admin_sessions WHERE account_id = ?').bind(id).run();
  await forgetAccountDevices({ DB: db }, id);
  return { ok: true, id, name: account.name, password };
}

// Removes the account, signs that person out everywhere and forgets their trusted browsers.
export async function removeStaffAccount(db, rawId) {
  const id = Number(rawId);
  if (!Number.isInteger(id) || id <= 0) return { ok: false, status: 400, message: 'Unknown staff account.' };
  const account = await db.prepare('SELECT name FROM staff_accounts WHERE id = ?').bind(id).first();
  if (!account) return { ok: false, status: 404, message: 'That staff account no longer exists.' };
  await db.prepare('DELETE FROM admin_sessions WHERE account_id = ?').bind(id).run();
  await forgetAccountDevices({ DB: db }, id);
  await db.prepare('DELETE FROM staff_accounts WHERE id = ?').bind(id).run();
  return { ok: true, id, name: account.name };
}

// Checks a name and password. Always does the same amount of work, whether or not the name
// exists, so the time it takes does not reveal which names have accounts.
// Returns { ok: true, id, name } or { ok: false }.
export async function checkStaffAccount(db, rawName, password) {
  const name = cleanStaffName(rawName);
  const row = name
    ? await db.prepare('SELECT id, name, pass_hash, pass_salt, iterations FROM staff_accounts WHERE name = ? COLLATE NOCASE').bind(name).first()
    : null;
  const salt = row?.pass_salt || '00'.repeat(16);
  const iterations = Number(row?.iterations) || ITERATIONS;
  const given = typeof password === 'string' && password.length <= 256 ? password : '';
  const hash = await pbkdf2(given || '-', salt, iterations);
  const ok = Boolean(row && given) && (await verifyPassword(hash, row.pass_hash));
  return ok ? { ok: true, id: Number(row.id), name: row.name } : { ok: false };
}

export async function noteStaffSignIn(db, id) {
  await db.prepare('UPDATE staff_accounts SET last_sign_in = ? WHERE id = ?').bind(nowSec(), id).run();
}

// The person's own password change from the inbox: needs their current password. Signs out
// their other devices (keepJti: the database id of the session making the change).
export async function changeOwnStaffPassword(db, id, current, next, keepJti) {
  const row = await db.prepare('SELECT name, pass_hash, pass_salt, iterations FROM staff_accounts WHERE id = ?').bind(id).first();
  if (!row) return { ok: false, status: 404, message: 'Your account no longer exists.' };
  const given = typeof current === 'string' && current.length <= 256 ? current : '';
  const currentOk = given && (await verifyPassword(await pbkdf2(given, row.pass_salt, Number(row.iterations) || ITERATIONS), row.pass_hash));
  if (!currentOk) return { ok: false, status: 401, message: 'Your current password is not right.' };
  const problem = staffPasswordProblem(next, { name: row.name });
  if (problem) return { ok: false, status: 400, message: problem };
  if (next === given) return { ok: false, status: 400, message: 'Choose a password different from your current one.' };
  const h = await hashStaffPassword(next);
  await db
    .prepare('UPDATE staff_accounts SET pass_hash = ?, pass_salt = ?, iterations = ?, password_set_at = ? WHERE id = ?')
    .bind(h.hash, h.salt, h.iterations, nowSec(), id)
    .run();
  const res = await db.prepare('DELETE FROM admin_sessions WHERE account_id = ? AND jti != ?').bind(id, keepJti || '').run();
  return { ok: true, signedOut: Number(res?.meta?.changes || 0) };
}
