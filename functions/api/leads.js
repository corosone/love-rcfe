import { ensureSchema, jsonResponse, clean, clientIp, tooManyRequests } from '../../lib/db.js';

const LIMITS = { name: 120, email: 254, phone: 40, city: 100, message: 3000, inquiryType: 80, short: 80 };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export async function onRequestPost({ request, env, waitUntil }) {
  let body;
  try {
    body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return jsonResponse({ error: 'Invalid request body.' }, 400);
    }
  } catch {
    return jsonResponse({ error: 'Invalid request body.' }, 400);
  }

  // Honeypot: real visitors never fill this hidden field. Pretend success so bots move on.
  if (clean(body.hp_notes, 200)) {
    return jsonResponse({ ok: true }, 201);
  }

  if (tooManyRequests(`lead:${clientIp(request)}`, 8, 10 * 60 * 1000)) {
    return jsonResponse(
      { error: 'Too many submissions. Please call (818) 217-5755 or email loveRCFE@gmail.com.' },
      429
    );
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
    return jsonResponse({ error: Object.values(errors)[0], fields: errors }, 422);
  }

  if (!record.message) record.message = '(no message)';

  // Turnstile spam check (only enforced once TURNSTILE_SECRET is set in Cloudflare)
  if (env?.TURNSTILE_SECRET) {
    const token = clean(body.turnstile_token, 4096);
    const ok = token ? await verifyTurnstile(env.TURNSTILE_SECRET, token, clientIp(request)) : false;
    if (!ok) {
      return jsonResponse(
        { error: 'Please complete the security check. If it does not appear, call (818) 217-5755 or email loveRCFE@gmail.com.' },
        422
      );
    }
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database is not bound yet.' }, 503);
  }

  try {
    await ensureSchema(env.DB);
    const result = await env.DB
      .prepare(`
        INSERT INTO leads (
          kind, inquiry_type, name, email, phone, city, message, preferred_date, preferred_time
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .bind(
        record.kind,
        record.inquiryType,
        record.name,
        record.email,
        record.phone,
        record.city,
        record.message,
        record.preferredDate,
        record.preferredTime
      )
      .run();

    // Backup email alert via Resend (only if RESEND_API_KEY is set). Never blocks the response.
    if (env.RESEND_API_KEY && waitUntil) {
      waitUntil(sendAlert(env, record));
    }

    return jsonResponse({ ok: true, id: result?.meta?.last_row_id ?? null }, 201);
  } catch (err) {
    console.error('Failed to save lead:', err);
    return jsonResponse({ error: 'Could not save your message right now.' }, 500);
  }
}

// Returns true when Turnstile approves. If Cloudflare's check can't be reached, let the lead through.
async function verifyTurnstile(secret, token, ip) {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    const data = await res.json();
    return data.success === true;
  } catch (err) {
    console.error('Turnstile verify unreachable:', err);
    return true;
  }
}

const esc = (v) =>
  String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

async function sendAlert(env, r) {
  try {
    const rows = [
      ['Type', r.kind === 'call_request' ? 'Call request' : 'Enquiry'],
      ['Topic', r.inquiryType],
      ['Name', r.name],
      ['Phone', r.phone],
      ['Email', r.email],
      ['City', r.city],
      ['Preferred', [r.preferredDate, r.preferredTime].filter(Boolean).join(' ')],
      ['Message', r.message],
    ].filter(([, v]) => v);
    const html = rows
      .map(([k, v]) => `<p><b>${k}:</b> ${esc(v).replace(/\n/g, '<br>')}</p>`)
      .join('');
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Love RCFE <onboarding@resend.dev>',
        to: [env.NOTIFY_EMAIL || 'lovercfe@gmail.com'],
        reply_to: r.email,
        subject: `[Love RCFE] ${r.kind === 'call_request' ? 'Call request' : 'New enquiry'} from ${r.name}`,
        html,
      }),
    });
  } catch (err) {
    console.error('Backup alert failed:', err);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
