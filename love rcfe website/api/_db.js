import { neon } from '@neondatabase/serverless';
import { createHash, timingSafeEqual } from 'node:crypto';

let schemaPromise = null;

/**
 * Returns a Neon SQL client initialized with the leads table, or null if no DB URL is configured.
 */
export async function getSql() {
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) return null;

  const sql = neon(url);
  if (!schemaPromise) {
    schemaPromise = (async () => {
      await sql`
        CREATE TABLE IF NOT EXISTS leads (
          id SERIAL PRIMARY KEY,
          kind TEXT NOT NULL DEFAULT 'enquiry',
          inquiry_type TEXT NOT NULL,
          name TEXT NOT NULL,
          email TEXT NOT NULL,
          phone TEXT NOT NULL,
          city TEXT NOT NULL DEFAULT '',
          message TEXT NOT NULL,
          preferred_date TEXT,
          preferred_time TEXT,
          handled BOOLEAN NOT NULL DEFAULT FALSE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
      `;
      await sql`CREATE INDEX IF NOT EXISTS leads_created_at_idx ON leads (created_at DESC)`;
    })().catch((err) => {
      schemaPromise = null;
      throw err;
    });
  }

  await schemaPromise;
  return sql;
}

export function clean(value, max) {
  return typeof value === 'string'
    ? value.replace(/\u0000/g, '').trim().slice(0, max)
    : '';
}

export function clientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.length > 0) {
    return forwarded.split(',')[0].trim();
  }
  const realIp = req.headers['x-real-ip'];
  return typeof realIp === 'string' && realIp.length > 0 ? realIp.trim() : 'unknown';
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

export function isAdmin(req) {
  const expected = process.env.INBOX_PASSWORD;
  const authHeader = req.headers.authorization;
  if (!expected || typeof authHeader !== 'string' || !authHeader.startsWith('Bearer ')) {
    return false;
  }
  const given = authHeader.slice(7);
  const a = createHash('sha256').update(given).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export async function readJsonBody(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object') return req.body;
    if (typeof req.body === 'string') return JSON.parse(req.body);
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 65536) throw new Error('Payload too large');
    chunks.push(chunk);
  }
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
}
