// Developer console sign-in (/corosone): email + password, then a 6-digit code sent by email.
//
// Cloudflare settings used (Pages → Settings → Variables and Secrets, all as "Secret"):
//   DEV_EMAIL        the email typed on the sign-in form
//   DEV_PASSWORD     the password typed on the sign-in form (12+ characters, not the staff password)
//   DEV_CODE_EMAIL   where the 6-digit codes are emailed (defaults to DEV_EMAIL)
//   RESEND_API_KEY   API key from resend.com, used to send the code email
//   DEV_CODE_FROM    optional sender, default "Love RCFE Security <onboarding@resend.dev>"
//   DEV_CODE_FORMSPREE_ENDPOINT  optional alternative to Resend: a Formspree form whose
//                    notification email is the address that should receive the codes
// TURNSTILE_SECRET must also be set: the developer sign-in always requires the security check.

import {
  ensureSchema, jsonResponse, clientIp, verifySameOrigin, verifySameSiteRead, readJsonBody,
  tooManyRequests, tooManyRequestsD1, verifyPassword, enforceTurnstile, getCookie, cookieHeader,
  getSessionSigningMaterial, getDevSigningMaterial, devCredentialProblems, normalizeEmail,
  createSessionToken, revokeSessionToken, readDevSession, looksLikeSessionToken,
  getAdminAttempts, lockWaitSeconds, recordAdminFail,
  sessionCookieHeader, devSessionCookieHeader,
  SESSION_COOKIE, DEV_SESSION_COOKIE, DEV_SESSION_TTL_SEC,
} from './db.js';

export const DEV_CHALLENGE_COOKIE = 'lovercfe_dev_step';
const CHALLENGE_PATH = '/api/dev';
const CODE_TTL_SEC = 10 * 60;      // a code works for 10 minutes...
const CODE_MAX_ATTEMPTS = 5;       // ...and for at most 5 guesses
const CODES_PER_HOUR = 5;          // at most 5 code emails per hour...
const CODES_PER_DAY = 15;          // ...and 15 per day

// Wrong email/password lockouts (stricter than the staff login)
const DEV_MAX_FAILS = 5;                 // per IP...
const DEV_FAIL_WINDOW = 15 * 60;         // ...within 15 minutes
const DEV_LOCK_SECONDS = 15 * 60;
const DEV_GLOBAL_KEY = 'dev|__global__';
const DEV_GLOBAL_MAX_FAILS = 15;         // across all IPs...
const DEV_GLOBAL_FAIL_WINDOW = 10 * 60;  // ...within 10 minutes
const DEV_GLOBAL_LOCK_SECONDS = 5 * 60;

const FORMSPREE_URL_RE = /^https:\/\/formspree\.io\/f\/[A-Za-z0-9]+$/;
const FAIL_CLOSED = { failClosed: true };
const enc = new TextEncoder();
const nowSec = () => Math.floor(Date.now() / 1000);
const toHex = (buf) => [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');

async function sha256Hex(text) {
  return toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));
}

async function hmacHex(keyMaterial, message) {
  const keyBytes = await crypto.subtle.digest('SHA-256', enc.encode(keyMaterial));
  const key = await crypto.subtle.importKey('raw', keyBytes, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toHex(await crypto.subtle.sign('HMAC', key, enc.encode(message)));
}

function randomToken(bytes = 24) {
  let bin = '';
  for (const b of crypto.getRandomValues(new Uint8Array(bytes))) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// Uniformly random 6-digit code ("000000" to "999999") from the cryptographic generator.
export function randomCode() {
  const buf = new Uint32Array(1);
  let n;
  do {
    crypto.getRandomValues(buf);
    n = buf[0];
  } while (n >= 4294000000); // reject the top sliver so every code is equally likely
  return String(n % 1000000).padStart(6, '0');
}

// Only a keyed hash of the code is stored. The key includes DEV_PASSWORD (which is not in the
// database), so the code cannot be worked out from the database alone.
const codeHashFor = (material, challengeId, code) => hmacHex(`dev-code-v1|${material}`, `${challengeId}|${code}`);
const challengeKeyFor = (challengeId) => sha256Hex(`dev-step-v1|${challengeId}`);
const looksLikeChallengeId = (value) => typeof value === 'string' && /^[A-Za-z0-9_-]{32}$/.test(value);
const challengeCookie = (request, value, maxAge) => cookieHeader(request, DEV_CHALLENGE_COOKIE, value, maxAge, CHALLENGE_PATH);

function codeEmailProvider(env) {
  if (typeof env?.RESEND_API_KEY === 'string' && env.RESEND_API_KEY.trim()) return 'resend';
  if (typeof env?.DEV_CODE_FORMSPREE_ENDPOINT === 'string' && FORMSPREE_URL_RE.test(env.DEV_CODE_FORMSPREE_ENDPOINT.trim())) return 'formspree';
  return '';
}

function codeRecipient(env) {
  return normalizeEmail(env?.DEV_CODE_EMAIL) || normalizeEmail(env?.DEV_EMAIL);
}

// Everything that must be set up before the developer sign-in can be used (empty list = ready).
export function devSetupProblems(env) {
  const problems = devCredentialProblems(env);
  if (!env?.DB) problems.push('the D1 database is not bound as "DB"');
  if (!env?.TURNSTILE_SECRET) problems.push('TURNSTILE_SECRET is missing');
  if (!codeEmailProvider(env)) problems.push('RESEND_API_KEY is missing (needed to email the 6-digit code)');
  return problems;
}

function devSetupError(env) {
  const problems = devSetupProblems(env);
  if (!problems.length) return null;
  return jsonResponse(
    { error: `Developer sign-in is not set up yet: ${problems.join('; ')}. Add these in Cloudflare Pages → Settings → Variables and Secrets, then redeploy.` },
    503
  );
}

// ---------- Activity log ----------
export async function devAudit(env, request, event, detail = '') {
  try {
    await env.DB
      .prepare('INSERT INTO dev_audit (at, event, ip, detail) VALUES (?, ?, ?, ?)')
      .bind(nowSec(), String(event).slice(0, 40), clientIp(request).slice(0, 64), String(detail).slice(0, 200))
      .run();
    if (Math.random() < 0.1) {
      await env.DB
        .prepare('DELETE FROM dev_audit WHERE id NOT IN (SELECT id FROM dev_audit ORDER BY id DESC LIMIT 300)')
        .run();
    }
  } catch (err) {
    console.warn('Could not write developer activity log:', err?.message);
  }
}

// ---------- Sending the code ----------
async function sendCodeEmail(env, request, code) {
  const provider = codeEmailProvider(env);
  const when = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Los_Angeles', dateStyle: 'medium', timeStyle: 'short',
  }).format(new Date());
  const subject = 'Your Love RCFE developer sign-in code';
  const text = [
    `Your Love RCFE developer sign-in code is: ${code}`,
    '',
    `It expires in ${CODE_TTL_SEC / 60} minutes and only works in the browser that asked for it.`,
    `Requested ${when} (Pacific Time) from IP address ${clientIp(request)}.`,
    '',
    'If you did not just try to sign in, someone knows your developer email and password.',
    'Change DEV_PASSWORD in Cloudflare right away. Never share this code with anyone.',
  ].join('\n');

  try {
    let res;
    if (provider === 'resend') {
      res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: (typeof env.DEV_CODE_FROM === 'string' && env.DEV_CODE_FROM.trim()) || 'Love RCFE Security <onboarding@resend.dev>',
          to: [codeRecipient(env)],
          subject,
          text,
        }),
      });
    } else if (provider === 'formspree') {
      const origin = new URL(request.url).origin;
      res = await fetch(env.DEV_CODE_FORMSPREE_ENDPOINT.trim(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json', Origin: origin, Referer: `${origin}/` },
        body: JSON.stringify({ _subject: subject, message: text }),
      });
    } else {
      return { ok: false, provider: 'none', status: 0 };
    }
    if (!res.ok) {
      // Log the provider's explanation (never the code) to help with setup problems.
      const why = await res.text().catch(() => '');
      console.error(`Developer code email failed (${provider}) with HTTP status ${res.status}: ${why.slice(0, 300)}`);
    }
    return { ok: res.ok, provider, status: res.status };
  } catch (err) {
    console.error(`Developer code email could not be sent (${provider}):`, err?.message);
    return { ok: false, provider, status: 0 };
  }
}

// ---------- Step 1: email + password ----------
export async function handleDevLogin(request, env) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const setupErr = devSetupError(env);
  if (setupErr) return setupErr;

  const ip = clientIp(request);
  if (tooManyRequests(`devlogin:${ip}`, 10, 60 * 1000)) {
    return jsonResponse({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }, 429);
  }

  const parsed = await readJsonBody(request, 8192);
  if (!parsed.ok) return parsed.response;
  const email = typeof parsed.data.email === 'string' ? parsed.data.email : '';
  const password = typeof parsed.data.password === 'string' ? parsed.data.password : '';
  if (!email.trim() || !password) {
    return jsonResponse({ error: 'Please enter your email and password.' }, 400);
  }

  // The security check is always required here, whatever REQUIRE_TURNSTILE is set to.
  const turnstileErr = await enforceTurnstile(
    request,
    { ...env, REQUIRE_TURNSTILE: 'true' },
    parsed.data.turnstile_token,
    'Please complete the security check, then try again.'
  );
  if (turnstileErr) return turnstileErr;

  let ipKey;
  try {
    await ensureSchema(env.DB);

    const [ipBurst, globalBurst] = await Promise.all([
      tooManyRequestsD1(env.DB, `devlogin:${ip}`, 5, 60, FAIL_CLOSED),
      tooManyRequestsD1(env.DB, 'devlogin:__global__', 15, 60, FAIL_CLOSED),
    ]);
    if (ipBurst || globalBurst) {
      return jsonResponse({ error: 'Too many sign-in attempts. Please wait a minute and try again.' }, 429);
    }

    ipKey = await sha256Hex(`dev|${ip}`);
    const [attempts, globalAttempts] = await Promise.all([
      getAdminAttempts(env.DB, ipKey),
      getAdminAttempts(env.DB, DEV_GLOBAL_KEY),
    ]);
    const wait = Math.max(lockWaitSeconds(attempts), lockWaitSeconds(globalAttempts));
    if (wait > 0) {
      return jsonResponse(
        { error: `Too many wrong sign-in attempts. Please try again in ${Math.ceil(wait / 60)} minute(s).` },
        423,
        { 'Retry-After': String(wait) }
      );
    }
  } catch (err) {
    console.error('Developer sign-in checks failed:', err);
    return jsonResponse({ error: 'Database connection error.' }, 500);
  }

  // Both comparisons always run, and the reply never says which one was wrong.
  const tooLong = email.length > 254 || password.length > 256;
  const emailOk = await verifyPassword(normalizeEmail(email).slice(0, 254), normalizeEmail(env.DEV_EMAIL));
  const passwordOk = await verifyPassword(password.slice(0, 256), env.DEV_PASSWORD);
  if (tooLong || !emailOk || !passwordOk) {
    try {
      await Promise.all([
        recordAdminFail(env.DB, ipKey, DEV_FAIL_WINDOW, DEV_MAX_FAILS, DEV_LOCK_SECONDS),
        recordAdminFail(env.DB, DEV_GLOBAL_KEY, DEV_GLOBAL_FAIL_WINDOW, DEV_GLOBAL_MAX_FAILS, DEV_GLOBAL_LOCK_SECONDS),
      ]);
    } catch (err) {
      console.error('Could not record failed developer sign-in:', err);
    }
    await devAudit(env, request, 'wrong_password');
    return jsonResponse({ error: 'Incorrect email or password.' }, 401);
  }

  try {
    // Re-check the lockout so a burst of parallel guesses cannot slip past a lock that just started.
    const [postIp, postGlobal] = await Promise.all([
      getAdminAttempts(env.DB, ipKey),
      getAdminAttempts(env.DB, DEV_GLOBAL_KEY),
    ]);
    const postWait = Math.max(lockWaitSeconds(postIp), lockWaitSeconds(postGlobal));
    if (postWait > 0) {
      return jsonResponse(
        { error: `Too many wrong sign-in attempts. Please try again in ${Math.ceil(postWait / 60)} minute(s).` },
        423,
        { 'Retry-After': String(postWait) }
      );
    }

    const material = await getDevSigningMaterial(env);
    if (!material) return jsonResponse({ error: 'Could not start sign-in.' }, 500);

    // Cap how many codes can be emailed. The cap is tied to the current password, so
    // changing DEV_PASSWORD after an attack also resets it.
    const tag = (await hmacHex(`dev-send-v1|${material}`, 'limit')).slice(0, 16);
    const [hourly, daily] = await Promise.all([
      tooManyRequestsD1(env.DB, `devsend:${tag}:hour`, CODES_PER_HOUR, 3600, FAIL_CLOSED),
      tooManyRequestsD1(env.DB, `devsend:${tag}:day`, CODES_PER_DAY, 86400, FAIL_CLOSED),
    ]);
    if (hourly || daily) {
      await devAudit(env, request, 'code_limit');
      return jsonResponse({ error: 'Too many verification codes were requested. Please try again later.' }, 429);
    }

    const challengeId = randomToken(24);
    const code = randomCode();
    const now = nowSec();
    // Only one sign-in can be in progress at a time: starting a new one cancels any earlier code.
    await env.DB.prepare('DELETE FROM dev_challenges').run();
    await env.DB
      .prepare('INSERT INTO dev_challenges (id, code_hash, attempts, created_at, expires_at) VALUES (?, ?, 0, ?, ?)')
      .bind(await challengeKeyFor(challengeId), await codeHashFor(material, challengeId, code), now, now + CODE_TTL_SEC)
      .run();

    const sent = await sendCodeEmail(env, request, code);
    if (!sent.ok) {
      await env.DB.prepare('DELETE FROM dev_challenges').run();
      await devAudit(env, request, 'email_failed', `${sent.provider} status ${sent.status}`);
      return jsonResponse(
        { error: 'Your email and password are correct, but the verification code could not be emailed. Check RESEND_API_KEY and DEV_CODE_EMAIL in Cloudflare.' },
        502
      );
    }

    await env.DB.prepare('DELETE FROM auth_attempts WHERE key = ?').bind(ipKey).run();
    await devAudit(env, request, 'code_sent');
    return jsonResponse({ ok: true, step: 'code', expiresIn: CODE_TTL_SEC }, 200, {
      'Set-Cookie': challengeCookie(request, challengeId, CODE_TTL_SEC),
    });
  } catch (err) {
    console.error('Developer sign-in failed:', err);
    return jsonResponse({ error: 'Could not start sign-in.' }, 500);
  }
}

// ---------- Step 2: the emailed code ----------
export async function handleDevVerify(request, env) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  const setupErr = devSetupError(env);
  if (setupErr) return setupErr;

  if (tooManyRequests(`devverify:${clientIp(request)}`, 20, 60 * 1000)) {
    return jsonResponse({ error: 'Too many attempts. Please wait a minute and try again.' }, 429);
  }

  const parsed = await readJsonBody(request, 2048);
  if (!parsed.ok) return parsed.response;
  const code = typeof parsed.data.code === 'string' ? parsed.data.code.replace(/\s+/g, '') : '';
  if (!/^\d{6}$/.test(code)) {
    return jsonResponse({ error: 'Enter the 6-digit code from the email.' }, 400);
  }

  const restart = (message, status = 401) => jsonResponse({ error: message, restart: true }, status, {
    'Set-Cookie': challengeCookie(request, '', 0),
  });

  const challengeId = getCookie(request, DEV_CHALLENGE_COOKIE);
  if (!looksLikeChallengeId(challengeId)) {
    return restart('Your sign-in has expired. Please enter your email and password again.');
  }

  try {
    await ensureSchema(env.DB);
    const key = await challengeKeyFor(challengeId);
    const now = nowSec();

    // Count the guess first, in one atomic step, so parallel requests cannot get extra guesses.
    const row = await env.DB
      .prepare('UPDATE dev_challenges SET attempts = attempts + 1 WHERE id = ? AND expires_at > ? AND attempts < ? RETURNING code_hash, attempts')
      .bind(key, now, CODE_MAX_ATTEMPTS)
      .first();
    if (!row) {
      await env.DB.prepare('DELETE FROM dev_challenges WHERE id = ? OR expires_at <= ?').bind(key, now).run();
      return restart('That code has expired or was already used. Please enter your email and password again.');
    }

    const material = await getDevSigningMaterial(env, { create: false });
    const matches = material
      ? await verifyPassword(await codeHashFor(material, challengeId, code), row.code_hash)
      : false;
    if (!matches) {
      const left = CODE_MAX_ATTEMPTS - Number(row.attempts);
      await devAudit(env, request, 'wrong_code', `${Math.max(left, 0)} left`);
      if (left <= 0) {
        await env.DB.prepare('DELETE FROM dev_challenges WHERE id = ?').bind(key).run();
        return restart('Too many wrong codes. Please enter your email and password again.');
      }
      return jsonResponse({ error: `Incorrect code. ${left} ${left === 1 ? 'try' : 'tries'} left.` }, 401);
    }

    // A code works exactly once: only the request that removes the pending sign-in gets a session.
    const used = await env.DB.prepare('DELETE FROM dev_challenges WHERE id = ?').bind(key).run();
    if (!used?.meta?.changes) {
      return restart('That code has expired or was already used. Please enter your email and password again.');
    }

    const token = await createSessionToken(material, DEV_SESSION_TTL_SEC, env.DB, 'dev');
    await devAudit(env, request, 'signed_in');
    return jsonResponse({ ok: true }, 200, {
      'Set-Cookie': [
        devSessionCookieHeader(request, token, DEV_SESSION_TTL_SEC),
        challengeCookie(request, '', 0),
      ],
    });
  } catch (err) {
    console.error('Developer code check failed:', err);
    return jsonResponse({ error: 'Could not finish sign-in.' }, 500);
  }
}

// ---------- Protecting developer-only API routes ----------
// Returns { session } when the request carries a valid developer session, otherwise { denied }.
// Like the staff check, requests without a well-formed cookie never touch the database.
export async function authorizeDev(request, env) {
  if (request.method === 'GET' || request.method === 'HEAD') {
    const readOriginErr = verifySameSiteRead(request);
    if (readOriginErr) return { denied: readOriginErr };
  } else {
    const originErr = verifySameOrigin(request);
    if (originErr) return { denied: originErr };
  }

  if (!env?.DB) {
    return { denied: jsonResponse({ error: 'D1 database is not bound yet.' }, 503) };
  }
  if (tooManyRequests(`dev:${clientIp(request)}`, 120, 60 * 1000)) {
    return { denied: jsonResponse({ error: 'Too many requests. Please wait a minute and try again.' }, 429) };
  }
  if (!looksLikeSessionToken(getCookie(request, DEV_SESSION_COOKIE))) {
    return { denied: jsonResponse({ error: 'Authentication required.' }, 401) };
  }

  try {
    const session = await readDevSession(request, env);
    if (session) return { session };
  } catch (err) {
    console.error('Developer session check failed:', err);
    return { denied: jsonResponse({ error: 'Database connection error.' }, 500) };
  }
  return { denied: jsonResponse({ error: 'Authentication required.' }, 401) };
}

// ---------- Sign out ----------
// Signs this browser out of everything: the staff session and the developer session.
export async function signOutEverywhere(request, env) {
  const originErr = verifySameOrigin(request);
  if (originErr) return originErr;

  if (env?.DB) {
    try {
      const staffToken = getCookie(request, SESSION_COOKIE);
      const devToken = getCookie(request, DEV_SESSION_COOKIE);
      if (looksLikeSessionToken(staffToken) || looksLikeSessionToken(devToken)) {
        await ensureSchema(env.DB);
      }
      if (looksLikeSessionToken(staffToken)) {
        const material = await getSessionSigningMaterial(env, { create: false });
        if (material) await revokeSessionToken(staffToken, material, env.DB, 'staff');
      }
      if (looksLikeSessionToken(devToken)) {
        const wasSignedIn = await readDevSession(request, env);
        const material = await getDevSigningMaterial(env, { create: false });
        if (material) await revokeSessionToken(devToken, material, env.DB, 'dev');
        if (wasSignedIn) await devAudit(env, request, 'signed_out');
      }
    } catch (err) {
      console.warn('Session revocation skipped:', err?.message);
    }
  }

  return jsonResponse({ ok: true }, 200, {
    'Set-Cookie': [
      sessionCookieHeader(request, '', 0),
      devSessionCookieHeader(request, '', 0),
      challengeCookie(request, '', 0),
    ],
  });
}

// Used by the console's status panel (no secret values are ever returned, only yes/no).
export function devConfigSummary(env) {
  const formspree = typeof env?.FORMSPREE_ENDPOINT === 'string' ? env.FORMSPREE_ENDPOINT.trim() : '';
  const retention = Number.parseInt(env?.LEAD_RETENTION_DAYS || '', 10);
  return {
    staffPasswordSet: Boolean(env?.INBOX_PASSWORD),
    turnstileSecretSet: Boolean(env?.TURNSTILE_SECRET),
    requireTurnstile: env?.REQUIRE_TURNSTILE === 'true',
    leadEmailsConfigured: FORMSPREE_URL_RE.test(formspree),
    leadEmailsMisconfigured: Boolean(formspree) && !FORMSPREE_URL_RE.test(formspree),
    codeEmailProvider: codeEmailProvider(env),
    separateCodeEmail: Boolean(normalizeEmail(env?.DEV_CODE_EMAIL)) && normalizeEmail(env?.DEV_CODE_EMAIL) !== normalizeEmail(env?.DEV_EMAIL),
    leadRetentionDays: Number.isInteger(retention) && retention >= 30 ? retention : null,
  };
}

export { FORMSPREE_URL_RE };
