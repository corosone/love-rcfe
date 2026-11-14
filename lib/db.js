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
  recentHits.set(key, hits);
  if (recentHits.size > 5000) recentHits.clear();
  return hits.length > limit;
}

/**
 * Constant-time bearer password verification using Web Crypto SHA-256.
 */
export async function isAdmin(request, env) {
  const expected = env?.INBOX_PASSWORD;
  const authHeader = request.headers.get('authorization');
  if (!expected || !authHeader || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const given = authHeader.slice(7);
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

// ---------- Staff login lockout (stored in D1 so it holds across servers) ----------
const MAX_FAILS = 8;        // wrong passwords allowed...
const FAIL_WINDOW = 15 * 60; // ...within 15 minutes
const LOCK_SECONDS = 15 * 60;

const nowSec = () => Math.floor(Date.now() / 1000);

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

export async function recordAdminFail(db, key, row) {
  const now = nowSec();
  if (!row || now - row.first_fail > FAIL_WINDOW) {
    await db
      .prepare('INSERT OR REPLACE INTO auth_attempts (key, fails, first_fail, locked_until) VALUES (?, 1, ?, 0)')
      .bind(key, now)
      .run();
    return;
  }
  const fails = row.fails + 1;
  const lockedUntil = fails >= MAX_FAILS ? now + LOCK_SECONDS : 0;
  await db
    .prepare('UPDATE auth_attempts SET fails = ?, locked_until = ? WHERE key = ?')
    .bind(fails, lockedUntil, key)
    .run();
}

export async function clearAdminAttempts(db, key) {
  await db.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(key).run();
}
