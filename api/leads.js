import { getSql, clean, clientIp, tooManyRequests, readJsonBody } from './_db.js';

const LIMITS = { name: 120, email: 254, phone: 40, city: 100, message: 3000, inquiryType: 80, short: 80 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed.' });
  }

  let body;
  try {
    body = await readJsonBody(req);
  } catch {
    return res.status(400).json({ error: 'Invalid request body.' });
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success so bots move on.
  if (clean(body.hp_notes, 200)) {
    return res.status(201).json({ ok: true });
  }

  if (tooManyRequests(`lead:${clientIp(req)}`, 8, 10 * 60 * 1000)) {
    return res.status(429).json({ error: 'Too many submissions. Please call (818) 217-5755 or email loveRCFE@gmail.com.' });
  }

  const kind = body.kind === 'call_request' ? 'call_request' : 'enquiry';
  const record = {
    kind,
    inquiryType: clean(body.inquiry_type, LIMITS.inquiryType) || 'General Inquiry',
    name: clean(body.name, LIMITS.name),
    email: clean(body.email, LIMITS.email),
    phone: clean(body.phone, LIMITS.phone),
    city: clean(body.city, LIMITS.city),
    message: clean(body.message, LIMITS.message),
    preferredDate: clean(body.preferred_date, LIMITS.short) || null,
    preferredTime: clean(body.preferred_time, LIMITS.short) || null,
  };

  const errors = {};
  if (record.name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(record.email)) errors.email = 'Please enter a valid email address.';
  if (record.phone.replace(/\D/g, '').length < 7) errors.phone = 'Please enter a valid phone number.';
  if (kind === 'enquiry' && record.message.length < 5) {
    errors.message = 'Please tell us a little about how we can help.';
  }
  if (kind === 'call_request') {
    if (!record.preferredDate) {
      errors.preferred_date = 'Please choose a preferred date.';
    } else if (/^\d{4}-\d{2}-\d{2}$/.test(record.preferredDate)) {
      const [y, m, d] = record.preferredDate.split('-').map(Number);
      if (new Date(y, m - 1, d).getDay() === 0) {
        errors.preferred_date = 'We make calls Monday through Saturday. Please pick another date.';
      }
    }
  }

  if (Object.keys(errors).length) {
    const firstError = Object.values(errors)[0];
    return res.status(422).json({ error: firstError, fields: errors });
  }

  if (!record.message) record.message = '(no message)';

  try {
    const sql = await getSql();
    if (!sql) {
      return res.status(503).json({ error: 'Database is not connected yet.' });
    }

    const rows = await sql`
      INSERT INTO leads (
        kind, inquiry_type, name, email, phone, city, message, preferred_date, preferred_time
      ) VALUES (
        ${record.kind},
        ${record.inquiryType},
        ${record.name},
        ${record.email},
        ${record.phone},
        ${record.city},
        ${record.message},
        ${record.preferredDate},
        ${record.preferredTime}
      )
      RETURNING id, created_at
    `;

    return res.status(201).json({ ok: true, id: rows[0]?.id });
  } catch (err) {
    console.error('Failed to save lead:', err);
    return res.status(500).json({ error: 'Could not save your message right now.' });
  }
}
