import { getSql, clientIp, tooManyRequests, isAdmin, readJsonBody } from '../_db.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');

  if (!process.env.INBOX_PASSWORD) {
    return res.status(503).json({
      error: 'INBOX_PASSWORD is not configured yet. Add it in Vercel Project Settings → Environment Variables.'
    });
  }

  if (tooManyRequests(`admin:${clientIp(req)}`, 60, 60 * 1000)) {
    return res.status(429).json({ error: 'Too many attempts. Please wait a minute and try again.' });
  }

  if (!isAdmin(req)) {
    return res.status(401).json({ error: 'Incorrect password.' });
  }

  let sql;
  try {
    sql = await getSql();
    if (!sql) {
      return res.status(503).json({
        error: 'Database is not connected yet. Add Neon Postgres in Vercel Storage and redeploy.'
      });
    }
  } catch (err) {
    console.error('Database connection failed:', err);
    return res.status(500).json({ error: 'Database connection error.' });
  }

  if (req.method === 'GET') {
    const rows = await sql`
      SELECT
        id,
        kind,
        inquiry_type AS "inquiryType",
        name,
        email,
        phone,
        city,
        message,
        preferred_date AS "preferredDate",
        preferred_time AS "preferredTime",
        handled,
        created_at AS "createdAt"
      FROM leads
      ORDER BY created_at DESC
      LIMIT 500
    `;
    return res.status(200).json({ leads: rows });
  }

  if (req.method === 'PATCH') {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      return res.status(400).json({ error: 'Invalid JSON body.' });
    }
    const urlId = new URL(req.url || '/', 'http://localhost').searchParams.get('id');
    const id = Number(body.id ?? req.query?.id ?? urlId);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid lead id.' });
    }
    const handled = Boolean(body.handled);
    const rows = await sql`
      UPDATE leads
      SET handled = ${handled}
      WHERE id = ${id}
      RETURNING
        id,
        kind,
        inquiry_type AS "inquiryType",
        name,
        email,
        phone,
        city,
        message,
        preferred_date AS "preferredDate",
        preferred_time AS "preferredTime",
        handled,
        created_at AS "createdAt"
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    return res.status(200).json({ lead: rows[0] });
  }

  if (req.method === 'DELETE') {
    let body = {};
    try {
      body = await readJsonBody(req);
    } catch {
      body = {};
    }
    const urlId = new URL(req.url || '/', 'http://localhost').searchParams.get('id');
    const id = Number(req.query?.id ?? urlId ?? body.id);
    if (!Number.isInteger(id) || id <= 0) {
      return res.status(400).json({ error: 'Invalid lead id.' });
    }
    const rows = await sql`
      DELETE FROM leads
      WHERE id = ${id}
      RETURNING id
    `;
    if (!rows.length) {
      return res.status(404).json({ error: 'Lead not found.' });
    }
    return res.status(200).json({ ok: true, id });
  }

  res.setHeader('Allow', 'GET, PATCH, DELETE');
  return res.status(405).json({ error: 'Method not allowed.' });
}
