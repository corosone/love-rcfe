// Site settings the owner can change from the developer console without touching code.
//
// Holiday switch: while it is set, call bookings for those dates are paused (the booking
// popup says so and the server refuses them) and the contact page shows a short "we are away"
// note. Enquiries through the contact form keep working the whole time.
// Stored in app_secrets as JSON: {"from":"YYYY-MM-DD","to":"YYYY-MM-DD"} (California dates,
// both days included).

import { ensureSchema } from './db.js';

const HOLIDAY_NAME = 'holiday';
export const MAX_HOLIDAY_DAYS = 120;
const CACHE_MS = 60 * 1000;
let cache = { at: 0, value: null, loaded: false };

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

// A real calendar date written YYYY-MM-DD, or ''.
export function cleanYmd(value) {
  const s = typeof value === 'string' ? value.trim() : '';
  if (!YMD_RE.test(s)) return '';
  const [y, m, d] = s.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d ? s : '';
}

// Today's date in California, YYYY-MM-DD.
export function pacificToday(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Los_Angeles', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(now);
}

export function addDays(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function daysBetween(a, b) {
  return Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
}

function parseHoliday(raw) {
  try {
    const v = JSON.parse(raw);
    const from = cleanYmd(v?.from);
    const to = cleanYmd(v?.to);
    return from && to && from <= to ? { from, to } : null;
  } catch {
    return null;
  }
}

// The holiday, if one is set and has not ended yet (it may be in the future). null otherwise.
// fresh=true skips the one-minute cache (used by the console and right after a change).
export async function getHoliday(env, { fresh = false, today = pacificToday() } = {}) {
  if (!env?.DB) return null;
  if (!fresh && cache.loaded && Date.now() - cache.at < CACHE_MS) {
    return cache.value && cache.value.to >= today ? cache.value : null;
  }
  try {
    await ensureSchema(env.DB);
    const row = await env.DB.prepare('SELECT value FROM app_secrets WHERE name = ?').bind(HOLIDAY_NAME).first();
    cache = { at: Date.now(), value: row?.value ? parseHoliday(row.value) : null, loaded: true };
  } catch (err) {
    console.warn('Could not read the holiday setting:', err?.message);
    return null; // a database hiccup must never stop bookings
  }
  return cache.value && cache.value.to >= today ? cache.value : null;
}

// Returns { ok, message, holiday } for the console.
export async function setHoliday(env, { from: rawFrom, to: rawTo } = {}, today = pacificToday()) {
  const from = cleanYmd(rawFrom);
  const to = cleanYmd(rawTo);
  if (!from || !to) return { ok: false, status: 400, message: 'Choose the first and last day you are away.' };
  if (from > to) return { ok: false, status: 400, message: 'The last day must be on or after the first day.' };
  if (to < today) return { ok: false, status: 400, message: 'Those dates have already passed.' };
  if (daysBetween(from, to) + 1 > MAX_HOLIDAY_DAYS) {
    return { ok: false, status: 400, message: `A break can be at most ${MAX_HOLIDAY_DAYS} days long.` };
  }
  await env.DB
    .prepare('INSERT INTO app_secrets (name, value) VALUES (?, ?) ON CONFLICT(name) DO UPDATE SET value = excluded.value')
    .bind(HOLIDAY_NAME, JSON.stringify({ from, to }))
    .run();
  cache = { at: Date.now(), value: { from, to }, loaded: true };
  return { ok: true, holiday: { from, to } };
}

export async function clearHoliday(env) {
  const res = await env.DB.prepare('DELETE FROM app_secrets WHERE name = ?').bind(HOLIDAY_NAME).run();
  cache = { at: Date.now(), value: null, loaded: true };
  return Number(res?.meta?.changes || 0) > 0;
}

// True when the date (YYYY-MM-DD) falls on a day off.
export function holidayCovers(holiday, ymd) {
  return Boolean(holiday && ymd && ymd >= holiday.from && ymd <= holiday.to);
}

// For tests only.
export function _resetSettingsCache() {
  cache = { at: 0, value: null, loaded: false };
}
