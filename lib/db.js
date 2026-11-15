let schemaPromise = null;

// Columns added after the first launch (older databases get them via ALTER TABLE below)
const EXTRA_COLUMNS = [
  ['stage', "TEXT NOT NULL DEFAULT 'new'"],
  ['notes', "TEXT NOT NULL DEFAULT ''"],
  ['source', "TEXT NOT NULL DEFAULT ''"],
];

/**
 * Ensures the D1 tables exist and are up to date before queries run.
 * Runs idempotently once per isolate warm-up; resets if an error occurs.
 */
export async function ensureSchema(db) {
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await db
        .prepare(`
          CREATE TABLE IF NOT EXISTS leads (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            kind TEXT NOT NULL DEFAULT 'enquiry',
            inquiry_type TEXT NOT NULL,
            name TEXT NOT NULL,
            email TEXT NOT NULL,
            phone TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT '',
            message TEXT NOT NULL,
            preferred_date TEXT,
            preferred_time TEXT,
            handled INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
            stage TEXT NOT NULL DEFAULT 'new',
            notes TEXT NOT NULL DEFAULT '',
            source TEXT NOT NULL DEFAULT ''
          )
        `)
        .run();

      await db
        .prepare('CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC)')
        .run();

      // Add any missing columns to a table created before these features existed
      const info = await db.prepare('PRAGMA table_info(leads)').all();
      const have = new Set((info?.results || []).map((r) => r.name));
      for (const [name, def] of EXTRA_COLUMNS) {
        if (!have.has(name)) {
          try {
            await db.prepare(`ALTER TABLE leads ADD COLUMN ${name} ${def}`).run();
          } catch (err) {
            // Another request may have added it at the same moment; that's fine.
            console.warn(`Column ${name} not added:`, err?.message);
          }
        }
      }

      // Wrong-password tracking for the staff login
      await db
        .prepare(`
          CREATE TABLE IF NOT EXISTS auth_attempts (
            key TEXT PRIMARY KEY,
            fails INTEGER NOT NULL DEFAULT 0,
            first_fail INTEGER NOT NULL,
            locked_until INTEGER NOT NULL DEFAULT 0
          )
        `)
        .run();
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }

  return schemaPromise;
}

export function jsonResponse(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
      ...extraHeaders,
    },
  });
}

export function clean(value, max) {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').trim().slice(0, max)
    : '';
}

export function clientIp(request) {
  const cfIp = request.headers.get('cf-connecting-ip');
  if (cfIp) return cfIp.trim();
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return 'unknown';
}

const recentHits = new Map();

export function tooManyRequests(key, limit, windowMs) {
  const now = Date.now();
  const hits = (recentHits.get(key) || []).filter((t) => now - t < windowMs);
  hits.push(now);
  // Refresh insertion order so active keys stay hot.
  recentHits.delete(key);
  recentHits.set(key, hits);

  if (recentHits.size > 5000) {
    for (const [k, timestamps] of recentHits) {
      const fresh = timestamps.filter((t) => now - t < windowMs);
      if (!fresh.length) recentHits.delete(k);
    }
    while (recentHits.size > 5000) {
      const oldestKey = recentHits.keys().next().value;
      if (oldestKey === undefined) break;
      recentHits.delete(oldestKey);
    }
  }
  return hits.length > limit;
}

/**
 * Constant-time password verification using Web Crypto SHA-256 digests.
 */
export async function verifyPassword(given, expected) {
  if (!expected || typeof given !== 'string' || !given) {
    return false;
  }
  const enc = new TextEncoder();
  const [aBuf, bBuf] = await Promise.all([
    crypto.subtle.digest('SHA-256', enc.encode(given)),
    crypto.subtle.digest('SHA-256', enc.encode(expected)),
  ]);
  const a = new Uint8Array(aBuf);
  const b = new Uint8Array(bBuf);
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a[i] ^ b[i];
  }
  return diff === 0;
}

/**
 * Constant-time bearer password verification using Web Crypto SHA-256.
 */
export async function isAdmin(request, env) {
  const expected = env?.INBOX_PASSWORD;
  const authHeader = request.headers.get('authorization');
  if (!expected || !authHeader) {
    return false;
  }
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return false;
  return verifyPassword(match[1], expected);
}

// ---------- Signed HttpOnly staff session cookies ----------
const nowSec = () => Math.floor(Date.now() / 1000);

export const SESSION_COOKIE = 'lovercfe_admin';
export const SESSION_TTL_SEC = 12 * 60 * 60;

function toBase64Url(bytes) {
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(str) {
  const pad = str.length % 4 ? '='.repeat(4 - (str.length % 4)) : '';
  const bin = atob(str.replace(/-/g, '+').replace(/_/g, '/') + pad);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return bytes;
}

async function importSessionKey(secret) {
  const material = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(`love-rcfe-session-v1|${secret}`)
  );
  return crypto.subtle.importKey(
    'raw',
    material,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify']
  );
}

export function getCookie(request, name) {
  const header = request.headers.get('cookie');
  if (!header) return '';
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq === -1) continue;
    if (part.slice(0, eq).trim() === name) {
      try {
        return decodeURIComponent(part.slice(eq + 1).trim());
      } catch {
        return '';
      }
    }
  }
  return '';
}

export async function createSessionToken(secret, ttlSec = SESSION_TTL_SEC) {
  const payload = JSON.stringify({
    exp: nowSec() + ttlSec,
    n: toBase64Url(crypto.getRandomValues(new Uint8Array(12))),
  });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await importSessionKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

export async function verifySessionToken(token, secret) {
  if (!token || !secret || typeof token !== 'string') return false;
  const dot = token.indexOf('.');
  if (dot <= 0) return false;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!sigB64) return false;
  try {
    const key = await importSessionKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!ok) return false;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    return typeof payload?.exp === 'number' && payload.exp > nowSec();
  } catch {
    return false;
  }
}

export function sessionCookieHeader(request, value, maxAge) {
  const isHttps = new URL(request.url).protocol === 'https:';
  const parts = [
    `${SESSION_COOKIE}=${encodeURIComponent(value)}`,
    'Path=/api/admin',
    'HttpOnly',
    'SameSite=Strict',
    `Max-Age=${maxAge}`,
  ];
  if (isHttps) parts.push('Secure');
  return parts.join('; ');
}

// ---------- Staff login lockout (stored in D1 so it holds across servers) ----------
const MAX_FAILS = 8;        // wrong passwords allowed...
const FAIL_WINDOW = 15 * 60; // ...within 15 minutes
const LOCK_SECONDS = 15 * 60;

export async function adminAttemptKey(request) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode('admin|' + clientIp(request)));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getAdminAttempts(db, key) {
  return db
    .prepare('SELECT fails, first_fail, locked_until FROM auth_attempts WHERE key = ?')
    .bind(key)
    .first();
}

export function lockWaitSeconds(row) {
  const now = nowSec();
  return row && row.locked_until > now ? row.locked_until - now : 0;
}

/**
 * Atomically records a failed admin login attempt to prevent concurrent brute-force races.
 */
export async function recordAdminFail(db, key) {
  const now = nowSec();
  await db
    .prepare(`
      INSERT INTO auth_attempts (key, fails, first_fail, locked_until)
      VALUES (?, 1, ?, 0)
      ON CONFLICT(key) DO UPDATE SET
        fails = CASE
          WHEN ? - auth_attempts.first_fail > ? THEN 1
          ELSE auth_attempts.fails + 1
        END,
        first_fail = CASE
          WHEN ? - auth_attempts.first_fail > ? THEN ?
          ELSE auth_attempts.first_fail
        END,
        locked_until = CASE
          WHEN ? - auth_attempts.first_fail > ? THEN 0
          WHEN auth_attempts.fails + 1 >= ? THEN ? + ?
          ELSE auth_attempts.locked_until
        END
    `)
    .bind(
      key, now,
      now, FAIL_WINDOW,
      now, FAIL_WINDOW, now,
      now, FAIL_WINDOW, MAX_FAILS, now, LOCK_SECONDS
    )
    .run();
}

export async function clearAdminAttempts(db, key) {
  const staleBefore = nowSec() - Math.max(FAIL_WINDOW, LOCK_SECONDS);
  await db
    .prepare('DELETE FROM auth_attempts WHERE key = ? OR (first_fail < ? AND locked_until < ?)')
    .bind(key, staleBefore, nowSec())
    .run();
}

export async function checkAdminPrereqs(request, env) {
  if (!env?.INBOX_PASSWORD) {
    return jsonResponse(
      { error: 'INBOX_PASSWORD is not configured yet. Add it in Cloudflare Pages → Settings → Variables and Secrets.' },
      503
    );
  }

  if (tooManyRequests(`admin:${clientIp(request)}`, 60, 60 * 1000)) {
    return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  if (!env?.DB) {
    return jsonResponse(
      { error: 'D1 database is not bound yet. Bind your D1 database as "DB" in Cloudflare Pages → Settings → Bindings.' },
      503
    );
  }

  try {
    await ensureSchema(env.DB);
  } catch (err) {
    console.error('Database initialization failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  return null;
}

export async function checkPasswordWithLockout(request, env, candidate) {
  let key, attempts;
  try {
    key = await adminAttemptKey(request);
    attempts = await getAdminAttempts(env.DB, key);
  } catch (err) {
    console.error('Lockout check failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  const wait = lockWaitSeconds(attempts);
  if (wait > 0) {
    return jsonResponse(
      { error: `Too many wrong passwords. Please try again in ${Math.ceil(wait / 60)} minute(s).` },
      423,
      { 'Retry-After': String(wait) }
    );
  }

  if (!(await verifyPassword(candidate, env.INBOX_PASSWORD))) {
    try {
      await recordAdminFail(env.DB, key);
    } catch (err) {
      console.error('Could not record failed login:', err);
    }
    return jsonResponse({ error: 'Incorrect password.' }, 401);
  }

  if (attempts) {
    try {
      await clearAdminAttempts(env.DB, key);
    } catch (err) {
      console.error('Could not clear failed logins:', err);
    }
  }

  return null;
}

export async function authorizeAdmin(request, env) {
  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  const cookieToken = getCookie(request, SESSION_COOKIE);
  if (cookieToken && (await verifySessionToken(cookieToken, env.INBOX_PASSWORD))) {
    return null;
  }

  const authHeader = request.headers.get('authorization');
  const bearerMatch = authHeader ? authHeader.match(/^Bearer\s+(.+)$/i) : null;
  if (!bearerMatch) {
    return jsonResponse({ error: 'Authentication required.' }, 401);
  }

  return checkPasswordWithLockout(request, env, bearerMatch[1]);
}
