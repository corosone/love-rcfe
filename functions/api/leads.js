import {
  ensureSchema, jsonResponse, clean, clientIp, enforceTurnstile,
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

const FORMSPREE_URL_RE = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/;

// Emails the saved lead to staff through Formspree. Runs on the server only, after the
// Turnstile and rate-limit checks, so the form address is never exposed to visitors.
// Never throws: the lead is already stored in D1, so a failed email must not fail the request.
async function forwardToFormspree(endpoint, record, siteOrigin) {
  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        Origin: siteOrigin,
        Referer: `${siteOrigin}/`,
      },
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
    });
    if (!res.ok) {
      console.error('Formspree email notification failed with HTTP status', res.status);
    }
  } catch (err) {
    console.error('Formspree email notification could not be sent:', err?.message);
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
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
  const turnstileError = await enforceTurnstile(
    request,
    env,
    body.turnstile_token,
    'Please complete the security check. If it does not appear, call (818) 217-5755 or email loveRCFE@gmail.com.',
    'Security verification is temporarily unavailable. Please call (818) 217-5755 or email loveRCFE@gmail.com.'
  );
  if (turnstileError) return turnstileError;

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

    await env.DB
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

    // Email notification: set FORMSPREE_ENDPOINT in Cloudflare Pages → Settings → Variables and Secrets.
    // waitUntil keeps the function alive until the email request finishes, without delaying the visitor.
    const formspreeEndpoint = typeof env?.FORMSPREE_ENDPOINT === 'string' ? env.FORMSPREE_ENDPOINT.trim() : '';
    if (!formspreeEndpoint) {
      console.warn('FORMSPREE_ENDPOINT is not set; the lead was saved to the staff inbox but no email was sent.');
    } else if (!FORMSPREE_URL_RE.test(formspreeEndpoint)) {
      console.error('FORMSPREE_ENDPOINT is not a valid Formspree form address (expected https://formspree.io/f/<form id>); no email was sent.');
    } else {
      context.waitUntil(forwardToFormspree(formspreeEndpoint, record, new URL(request.url).origin));
    }

    // Optional automatic clean-up: set LEAD_RETENTION_DAYS (e.g. 365) in Cloudflare to delete
    // leads older than that many days. Runs on roughly 1 in 20 submissions.
    const retentionDays = Number.parseInt(env?.LEAD_RETENTION_DAYS || '', 10);
    if (Number.isInteger(retentionDays) && retentionDays >= 30 && Math.random() < 0.05) {
      context.waitUntil(
        env.DB
          .prepare("DELETE FROM leads WHERE created_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now', ?)")
          .bind(`-${retentionDays} days`)
          .run()
          .catch((err) => console.error('Lead retention clean-up failed:', err?.message))
      );
    }

    // The lead number is not returned: sequential ids would reveal how many enquiries the site receives.
    return jsonResponse({ ok: true }, 201);
  } catch (err) {
    console.error('Failed to save lead:', err);
    return jsonResponse({ error: 'Could not save your message right now.' }, 500);
  }
}

export function onRequest() {
  return jsonResponse({ error: 'Method not allowed.' }, 405, { Allow: 'POST' });
}
