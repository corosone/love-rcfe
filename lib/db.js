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

      // Wrong-password tracking for the staff login (per-IP and global throttle)
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

      // Revocable server-side staff sessions (invalidated immediately on Sign Out)
      await db
        .prepare(`
          CREATE TABLE IF NOT EXISTS admin_sessions (
            jti TEXT PRIMARY KEY,
            created_at INTEGER NOT NULL,
            expires_at INTEGER NOT NULL
          )
        `)
        .run();

      // Cross-isolate rate limiting stored in D1
      await db
        .prepare(`
          CREATE TABLE IF NOT EXISTS rate_limits (
            key TEXT PRIMARY KEY,
            hits INTEGER NOT NULL DEFAULT 0,
            window_start INTEGER NOT NULL
          )
        `)
        .run();

      // Auto-generated server secrets (keeps session signing independent of INBOX_PASSWORD)
      await db
        .prepare(`
          CREATE TABLE IF NOT EXISTS app_secrets (
            name TEXT PRIMARY KEY,
            value TEXT NOT NULL
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
      'X-Content-Type-Options': 'nosniff',
      'X-Frame-Options': 'DENY',
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
  try {
    const host = new URL(request.url).hostname;
    if (host === 'localhost' || host === '127.0.0.1') {
      const forwarded = request.headers.get('x-forwarded-for');
      if (forwarded) return forwarded.split(',')[0].trim();
      return 'local';
    }
  } catch {
    // Ignore malformed URLs
  }
  return 'unknown';
}

/**
 * Verifies that state-changing requests originate from the exact same origin
 * (blocks cross-site and preview-subdomain same-site CSRF attacks).
 */
export function verifySameOrigin(request) {
  let expectedOrigin;
  try {
    expectedOrigin = new URL(request.url).origin;
  } catch {
    return jsonResponse({ error: 'Invalid request URL.' }, 400);
  }

  const origin = request.headers.get('origin');
  if (!origin || origin !== expectedOrigin) {
    return jsonResponse({ error: 'Cross-origin request blocked.' }, 403);
  }

  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return jsonResponse({ error: 'Cross-origin request blocked.' }, 403);
  }

  return null;
}

/**
 * Verifies Sec-Fetch-Site (and Origin if present) on read-only admin GET/HEAD requests.
 */
export function verifySameSiteRead(request) {
  const fetchSite = request.headers.get('sec-fetch-site');
  if (fetchSite && fetchSite !== 'same-origin' && fetchSite !== 'none') {
    return jsonResponse({ error: 'Cross-origin request blocked.' }, 403);
  }

  const origin = request.headers.get('origin');
  if (origin) {
    try {
      if (origin !== new URL(request.url).origin) {
        return jsonResponse({ error: 'Cross-origin request blocked.' }, 403);
      }
    } catch {
      return jsonResponse({ error: 'Invalid request URL.' }, 400);
    }
  }

  return null;
}

/**
 * Safely reads and parses a JSON object request body with Content-Type and byte-length enforcement.
 */
export async function readJsonBody(request, maxBytes = 16384, { allowEmpty = false } = {}) {
  const contentLength = Number(request.headers.get('content-length') || 0);
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Request payload is too large.' }, 413),
    };
  }

  let raw = '';
  try {
    raw = await request.text();
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid request body.' }, 400),
    };
  }

  if (!raw.trim()) {
    if (allowEmpty) return { ok: true, data: {} };
    return {
      ok: false,
      response: jsonResponse({ error: 'Request body is required.' }, 400),
    };
  }

  if (new TextEncoder().encode(raw).byteLength > maxBytes) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Request payload is too large.' }, 413),
    };
  }

  const contentType = request.headers.get('content-type') || '';
  if (!/^\s*application\/json\b/i.test(contentType)) {
    return {
      ok: false,
      response: jsonResponse({ error: 'Content-Type must be application/json.' }, 415),
    };
  }

  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        ok: false,
        response: jsonResponse({ error: 'Invalid JSON body.' }, 400),
      };
    }
    return { ok: true, data: parsed };
  } catch {
    return {
      ok: false,
      response: jsonResponse({ error: 'Invalid JSON body.' }, 400),
    };
  }
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
 * Distributed rate limiter backed by D1 so limits hold across Cloudflare edge isolates/PoPs.
 */
export async function tooManyRequestsD1(db, key, limit, windowSec) {
  if (!db) return false;
  const now = Math.floor(Date.now() / 1000);
  try {
    if (Math.random() < 0.05) {
      await db
        .prepare('DELETE FROM rate_limits WHERE window_start < ?')
        .bind(now - Math.max(windowSec * 2, 3600))
        .run();
    }
    const row = await db
      .prepare(`
        INSERT INTO rate_limits (key, hits, window_start)
        VALUES (?, 1, ?)
        ON CONFLICT(key) DO UPDATE SET
          hits = CASE
            WHEN ? - rate_limits.window_start >= ? THEN 1
            ELSE rate_limits.hits + 1
          END,
          window_start = CASE
            WHEN ? - rate_limits.window_start >= ? THEN ?
            ELSE rate_limits.window_start
          END
        RETURNING hits
      `)
      .bind(key, now, now, windowSec, now, windowSec, now)
      .first();
    return Number(row?.hits || 0) > limit;
  } catch (err) {
    console.warn('D1 rate-limit check failed:', err?.message);
    return false;
  }
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

// ---------- Signed & revocable HttpOnly staff session cookies ----------
const nowSec = () => Math.floor(Date.now() / 1000);

export const SESSION_COOKIE = 'lovercfe_admin';
export const SESSION_TTL_SEC = 12 * 60 * 60;

let cachedDbCookieSecret = null;

/**
 * Returns a dedicated signing secret independent of INBOX_PASSWORD so session cookies
 * can never be used to brute-force or dictionary-crack INBOX_PASSWORD offline.
 */
export async function getSessionSecret(env) {
  if (env?.SESSION_SECRET && env.SESSION_SECRET !== env?.INBOX_PASSWORD) {
    return env.SESSION_SECRET;
  }
  if (cachedDbCookieSecret) return cachedDbCookieSecret;
  if (env?.DB) {
    try {
      await ensureSchema(env.DB);
      const generated = toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
      await env.DB
        .prepare('INSERT OR IGNORE INTO app_secrets (name, value) VALUES (?, ?)')
        .bind('cookie_hmac_v1', generated)
        .run();
      const row = await env.DB
        .prepare('SELECT value FROM app_secrets WHERE name = ?')
        .bind('cookie_hmac_v1')
        .first();
      if (row?.value) {
        cachedDbCookieSecret = row.value;
        return cachedDbCookieSecret;
      }
    } catch (err) {
      console.error('Could not load cookie secret from D1:', err);
    }
  }
  return env?.SESSION_SECRET || '';
}

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

async function hashJti(jti) {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`jti-v1|${jti}`));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
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

export async function createSessionToken(secret, ttlSec = SESSION_TTL_SEC, db = null) {
  if (!secret) throw new Error('Session secret is unavailable.');
  const now = nowSec();
  const exp = now + ttlSec;
  const jti = toBase64Url(crypto.getRandomValues(new Uint8Array(24)));
  const payload = JSON.stringify({ exp, n: jti });
  const payloadB64 = toBase64Url(new TextEncoder().encode(payload));
  const key = await importSessionKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));

  if (db) {
    const jtiHash = await hashJti(jti);
    await db
      .prepare('DELETE FROM admin_sessions WHERE expires_at <= ?')
      .bind(now)
      .run();
    await db
      .prepare('INSERT INTO admin_sessions (jti, created_at, expires_at) VALUES (?, ?, ?)')
      .bind(jtiHash, now, exp)
      .run();
    // Cap concurrent stored sessions to 50 most recent
    await db
      .prepare(`
        DELETE FROM admin_sessions
        WHERE jti NOT IN (
          SELECT jti FROM admin_sessions ORDER BY created_at DESC LIMIT 50
        )
      `)
      .run();
  }

  return `${payloadB64}.${toBase64Url(new Uint8Array(sig))}`;
}

async function parseVerifiedPayload(token, secret) {
  if (!token || !secret || typeof token !== 'string' || token.length > 512) return null;
  const dot = token.indexOf('.');
  if (dot <= 0) return null;
  const payloadB64 = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);
  if (!sigB64) return null;
  try {
    const key = await importSessionKey(secret);
    const ok = await crypto.subtle.verify(
      'HMAC',
      key,
      fromBase64Url(sigB64),
      new TextEncoder().encode(payloadB64)
    );
    if (!ok) return null;
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(payloadB64)));
    if (typeof payload?.exp !== 'number' || typeof payload?.n !== 'string' || !payload.n) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function verifySessionToken(token, secret, db = null) {
  const payload = await parseVerifiedPayload(token, secret);
  const now = nowSec();
  if (!payload || payload.exp <= now) return false;
  if (!db) return true;
  try {
    const jtiHash = await hashJti(payload.n);
    const row = await db
      .prepare('SELECT 1 AS active FROM admin_sessions WHERE jti = ? AND expires_at > ?')
      .bind(jtiHash, now)
      .first();
    return Boolean(row?.active);
  } catch (err) {
    console.error('Session lookup failed:', err);
    return false;
  }
}

export async function revokeSessionToken(token, secret, db) {
  if (!db || !token || !secret) return;
  const payload = await parseVerifiedPayload(token, secret);
  if (!payload?.n) return;
  try {
    const jtiHash = await hashJti(payload.n);
    await db
      .prepare('DELETE FROM admin_sessions WHERE jti = ? OR expires_at <= ?')
      .bind(jtiHash, nowSec())
      .run();
  } catch (err) {
    console.warn('Could not revoke session token:', err?.message);
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

// ---------- Staff login lockout (per-IP + global D1 protection) ----------
const MAX_FAILS = 8;               // wrong passwords allowed per IP...
const FAIL_WINDOW = 15 * 60;       // ...within 15 minutes
const LOCK_SECONDS = 15 * 60;

const GLOBAL_ADMIN_KEY = 'admin|__global__';
const GLOBAL_MAX_FAILS = 20;       // wrong passwords allowed across all IPs...
const GLOBAL_FAIL_WINDOW = 5 * 60; // ...within 5 minutes
const GLOBAL_LOCK_SECONDS = 60;    // ...triggering a 60s global cooldown against botnets

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
export async function recordAdminFail(
  db,
  key,
  failWindow = FAIL_WINDOW,
  maxFails = MAX_FAILS,
  lockSeconds = LOCK_SECONDS
) {
  const now = nowSec();
  if (Math.random() < 0.1) {
    const staleBefore = now - Math.max(FAIL_WINDOW, LOCK_SECONDS);
    await db
      .prepare('DELETE FROM auth_attempts WHERE first_fail < ? AND locked_until < ?')
      .bind(staleBefore, now)
      .run();
  }
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
      now, failWindow,
      now, failWindow, now,
      now, failWindow, maxFails, now, lockSeconds
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

  const ipKey = `admin:${clientIp(request)}`;
  if (tooManyRequests(ipKey, 60, 60 * 1000)) {
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

  if (await tooManyRequestsD1(env.DB, ipKey, 60, 60)) {
    return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  return null;
}

export async function checkPasswordWithLockout(request, env, candidate) {
  const ip = clientIp(request);
  const loginIpKey = `login:${ip}`;
  if (tooManyRequests(loginIpKey, 8, 60 * 1000)) {
    return jsonResponse({ error: 'Too many login attempts. Please wait a minute and try again.' }, 429);
  }

  let key, attempts, globalAttempts;
  try {
    // Serialize concurrent login bursts in D1 before reading lockout state
    const [ipBurst, globalBurst] = await Promise.all([
      tooManyRequestsD1(env.DB, loginIpKey, 8, 60),
      tooManyRequestsD1(env.DB, 'login:__global__', 20, 60),
    ]);
    if (ipBurst || globalBurst) {
      return jsonResponse({ error: 'Too many login attempts. Please wait a minute and try again.' }, 429);
    }

    key = await adminAttemptKey(request);
    [attempts, globalAttempts] = await Promise.all([
      getAdminAttempts(env.DB, key),
      getAdminAttempts(env.DB, GLOBAL_ADMIN_KEY),
    ]);
  } catch (err) {
    console.error('Lockout check failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  const wait = Math.max(lockWaitSeconds(attempts), lockWaitSeconds(globalAttempts));
  if (wait > 0) {
    return jsonResponse(
      { error: `Too many wrong passwords. Please try again in ${Math.ceil(wait / 60)} minute(s).` },
      423,
      { 'Retry-After': String(wait) }
    );
  }

  if (typeof candidate !== 'string' || candidate.length > 256 || !(await verifyPassword(candidate, env.INBOX_PASSWORD))) {
    try {
      await Promise.all([
        recordAdminFail(env.DB, key, FAIL_WINDOW, MAX_FAILS, LOCK_SECONDS),
        recordAdminFail(env.DB, GLOBAL_ADMIN_KEY, GLOBAL_FAIL_WINDOW, GLOBAL_MAX_FAILS, GLOBAL_LOCK_SECONDS),
      ]);
    } catch (err) {
      console.error('Could not record failed login:', err);
    }
    return jsonResponse({ error: 'Incorrect password.' }, 401);
  }

  // Re-check lockout state after password verification so an in-flight burst race cannot bypass a new lock
  try {
    const [postIp, postGlobal] = await Promise.all([
      getAdminAttempts(env.DB, key),
      getAdminAttempts(env.DB, GLOBAL_ADMIN_KEY),
    ]);
    const postWait = Math.max(lockWaitSeconds(postIp), lockWaitSeconds(postGlobal));
    if (postWait > 0) {
      return jsonResponse(
        { error: `Too many wrong passwords. Please try again in ${Math.ceil(postWait / 60)} minute(s).` },
        423,
        { 'Retry-After': String(postWait) }
      );
    }
    await clearAdminAttempts(env.DB, key);
  } catch (err) {
    console.error('Post-login lockout verification failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  return null;
}

export async function authorizeAdmin(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const readOriginErr = verifySameSiteRead(request);
    if (readOriginErr) return readOriginErr;
  } else {
    const originErr = verifySameOrigin(request);
    if (originErr) return originErr;
  }

  const prereqError = await checkAdminPrereqs(request, env);
  if (prereqError) return prereqError;

  const cookieToken = getCookie(request, SESSION_COOKIE);
  if (cookieToken) {
    const secret = await getSessionSecret(env);
    if (secret && (await verifySessionToken(cookieToken, secret, env.DB))) {
      return null;
    }
  }

  return jsonResponse({ error: 'Authentication required.' }, 401);
}
