let schemaPromise = null;

/**
 * Ensures the D1 leads table and index exist before queries run.
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
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
          )
        `)
        .run();

      await db
        .prepare('CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC)')
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
