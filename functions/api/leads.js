import {
  ensureSchema, jsonResponse, clean, clientIp,
  verifySameOrigin, readJsonBody, tooManyRequests, tooManyRequestsD1,
} from '../../lib/db.js';

const LIMITS = { name: 120, email: 254, phone: 40, city: 100, message: 3000, inquiryType: 80, short: 80 };
const MAX_DAYS_AHEAD = 100; // the booking form offers 90 days; small slack for time zones
const TIME_RE = /^(morning|afternoon|late afternoon|evening)\b/i;
const SSN_RE = /\b\d{3}-\d{2}-\d{4}\b/;
const ALLOWED_SOURCES = new Set(['home', 'services', 'tools', 'approach', 'support', 'contact', 'terms', 'privacy']);

// "YYYY-MM-DD" -> Date (UTC midnight) if it is a real calendar date, else null
function parseYmd(str) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str || '')) return null;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? date : null;
}

// Today's date in California, as YYYY-MM-DD
function pacificToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

const EMAIL_RE = /^[^\s@<>'"\u0000-\u001f]+@[^\s@<>'"\u0000-\u001f]+\.[^\s@<>'"\u0000-\u001f]{2,}$/;

export async function onRequestPost({ request, env }) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const parsed = await readJsonBody(request, 16384);
  if (!parsed.ok) return parsed.response;
  const body = parsed.data;

  // Honeypot: real visitors never fill these hidden fields. Pretend success so bots move on.
  if (clean(body.hp_notes, 200) || clean(body._gotcha, 200)) {
    return jsonResponse({ ok: true }, 201);
  }

  const ip = clientIp(request);
  if (tooManyRequests(`lead:${ip}`, 8, 10 * 60 * 1000)) {
    return jsonResponse(
      { error: 'Too many submissions. Please call (818) 217-5755 or email loveRCFE@gmail.com.' },
      429
    );
  }

  if (body.kind !== undefined && body.kind !== 'enquiry' && body.kind !== 'call_request') {
    return jsonResponse({ error: 'Invalid request type.' }, 422);
  }
  const kind = body.kind === 'call_request' ? 'call_request' : 'enquiry';
  const rawSource = clean(body.source, 40);
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
    source: ALLOWED_SOURCES.has(rawSource) ? rawSource : (rawSource ? 'other' : ''),
  };

  const errors = {};
  if (record.name.length < 2) errors.name = 'Please enter your name.';
  if (!EMAIL_RE.test(record.email)) errors.email = 'Please enter a valid email address.';
  if (record.phone.replace(/\D/g, '').length < 7) errors.phone = 'Please enter a valid phone number.';
  if (kind === 'enquiry' && record.message.length < 5) {
    errors.message = 'Please tell us a little about how we can help.';
  }
  if (SSN_RE.test(record.message)) {
    errors.message = 'For your privacy, please do not include Social Security numbers in web messages.';
  }
  if (kind === 'call_request') {
    const dateOk = parseYmd(record.preferredDate);
    if (!record.preferredDate) {
      errors.preferred_date = 'Please choose a preferred date.';
    } else if (!dateOk) {
      errors.preferred_date = 'Please choose a valid date.';
    } else {
      const today = pacificToday();
      if (record.preferredDate < today) {
        errors.preferred_date = 'Please choose a future date.';
      } else if (record.preferredDate > addDays(today, MAX_DAYS_AHEAD)) {
        errors.preferred_date = 'Please choose a date within the next 3 months.';
      } else if (dateOk.getUTCDay() === 0) {
        errors.preferred_date = 'We make calls Monday through Saturday. Please pick another date.';
      }
    }
    if (record.preferredTime && !TIME_RE.test(record.preferredTime)) {
      errors.preferred_time = 'Please choose a time from the list.';
    }
  }

  if (Object.keys(errors).length) {
    return jsonResponse({ error: Object.values(errors)[0], fields: errors }, 422);
  }

  if (!record.message) record.message = '(no message)';

  // Turnstile spam check (enforced when TURNSTILE_SECRET is set; fails closed if REQUIRE_TURNSTILE=true)
  if (env?.TURNSTILE_SECRET) {
    const token = clean(body.turnstile_token, 4096);
    const expectedHost = new URL(request.url).hostname;
    const ok = token ? await verifyTurnstile(env.TURNSTILE_SECRET, token, ip, expectedHost) : false;
    if (!ok) {
      return jsonResponse(
        { error: 'Please complete the security check. If it does not appear, call (818) 217-5755 or email loveRCFE@gmail.com.' },
        422
      );
    }
  } else if (env?.REQUIRE_TURNSTILE === 'true') {
    return jsonResponse(
      { error: 'Security verification is temporarily unavailable. Please call (818) 217-5755 or email loveRCFE@gmail.com.' },
      503
    );
  } else {
    console.warn('TURNSTILE_SECRET is not set; relying on origin, payload, and D1 rate-limit protections.');
  }

  if (!env?.DB) {
    return jsonResponse({ error: 'Database is not bound yet.' }, 503);
  }

  try {
    await ensureSchema(env.DB);

    // Cross-isolate D1 rate limits (per-IP and global flood cap)
    const [ipLimited, globalLimited] = await Promise.all([
      tooManyRequestsD1(env.DB, `lead:${ip}`, 8, 10 * 60),
      tooManyRequestsD1(env.DB, 'lead:__global__', 40, 10 * 60),
    ]);
    if (ipLimited || globalLimited) {
      return jsonResponse(
        { error: 'Too many submissions. Please call (818) 217-5755 or email loveRCFE@gmail.com.' },
        429
      );
    }

    const result = await env.DB
      .prepare(`
        INSERT INTO leads (
          kind, inquiry_type, name, email, phone, city, message, preferred_date, preferred_time, source
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
        record.preferredTime,
        record.source
      )
      .run();

    // Optional server-side Formspree forwarding if FORMSPREE_ENDPOINT is set in Cloudflare env
    if (env?.FORMSPREE_ENDPOINT && /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/.test(env.FORMSPREE_ENDPOINT)) {
      fetch(env.FORMSPREE_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          kind: record.kind,
          inquiry_type: record.inquiryType,
          name: record.name,
          email: record.email,
          phone: record.phone,
          city: record.city,
          message: record.message,
          preferred_date: record.preferredDate,
          preferred_time: record.preferredTime,
        }),
      }).catch(() => {});
    }

    return jsonResponse({ ok: true, id: result?.meta?.last_row_id ?? null }, 201);
  } catch (err) {
    console.error('Failed to save lead:', err);
    return jsonResponse({ error: 'Could not save your message right now.' }, 500);
  }
}

// Returns true only when Turnstile verifies the token and hostname (fail-closed on network/API errors).
async function verifyTurnstile(secret, token, ip, expectedHost) {
  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token, remoteip: ip }),
    });
    if (!res.ok) {
      console.error('Turnstile verify HTTP error:', res.status);
      return false;
    }
    const data = await res.json();
    if (data.success !== true) return false;
    if (
      data.hostname &&
      expectedHost &&
      expectedHost !== 'localhost' &&
      expectedHost !== '127.0.0.1' &&
      data.hostname !== expectedHost
    ) {
      console.warn('Turnstile hostname mismatch:', data.hostname, 'vs', expectedHost);
      return false;
    }
    return true;
  } catch (err) {
    console.error('Turnstile verify unreachable:', err);
    return false;
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
