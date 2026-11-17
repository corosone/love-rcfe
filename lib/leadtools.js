// Enquiry (lead) helpers for the developer console: spam guesses and spreadsheet export.
import { classifyNetwork } from './netinfo.js';

// ---------- Spam check ----------
// These are guesses to help find junk quickly. Nothing is ever deleted automatically.
const LINK_RE = /(https?:\/\/|www\.|\[url|<a\s|\b[a-z0-9-]+\.(ru|xyz|top|click|link|shop|site|online|icu|buzz)\b)/i;
const SPAM_WORDS_RE = /\b(seo|backlinks?|crypto|bitcoin|casino|forex|viagra|cialis|loan offer|guest posts?|link building|google ranking|first page of google|web ?design services|marketing services|grow your business|promote your|increase (your )?(traffic|sales)|click here|unsubscribe|lead generation)\b/i;

export const normalizeText = (s) => String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();

export function spamReasons(lead, { repeatedMessages, repeatedEmails, repeatedDevices } = {}) {
  const reasons = [];
  const name = String(lead.name || '');
  const message = String(lead.message || '');
  if (LINK_RE.test(message) || LINK_RE.test(name) || LINK_RE.test(String(lead.city || ''))) reasons.push('Contains a web link');
  if (SPAM_WORDS_RE.test(message) || SPAM_WORDS_RE.test(name)) reasons.push('Sales or spam wording');
  if (/\d{3,}|@|https?:/i.test(name) || name.length > 60 || !/\p{L}/u.test(name)) reasons.push('Name looks fake');
  const msg = normalizeText(message);
  if (msg.length >= 20 && repeatedMessages?.has(msg)) reasons.push('Same message as other enquiries');
  if (repeatedEmails?.has(normalizeText(lead.email))) reasons.push('Same email sent 3 or more times');
  if (lead.device && repeatedDevices?.has(lead.device)) reasons.push('Same device sent 3 or more times');
  const net = classifyNetwork({ asn: lead.asn, isp: lead.isp });
  if (net.kind === 'vpn' || net.kind === 'hosting' || net.kind === 'tor') reasons.push(`Sent through ${net.kind === 'tor' ? 'Tor' : 'a VPN or data centre'}`);
  const latin = message.replace(/[^A-Za-z]/g, '');
  if (latin.length >= 20 && latin.replace(/[^A-Z]/g, '').length / latin.length > 0.7) reasons.push('Mostly capital letters');
  return reasons;
}

// Messages that appear 2+ times and emails that appear 3+ times across all enquiries.
export async function repeatSets(db) {
  const [msgs, emails, devices] = await Promise.all([
    db.prepare(`
      SELECT lower(trim(message)) AS m FROM leads WHERE length(trim(message)) >= 20
      GROUP BY lower(trim(message)) HAVING COUNT(*) >= 2 LIMIT 500
    `).all(),
    db.prepare(`
      SELECT lower(trim(email)) AS e FROM leads
      GROUP BY lower(trim(email)) HAVING COUNT(*) >= 3 LIMIT 500
    `).all(),
    db.prepare(`
      SELECT device FROM leads WHERE device != '' GROUP BY device HAVING COUNT(*) >= 3 LIMIT 500
    `).all(),
  ]);
  return {
    repeatedMessages: new Set((msgs?.results || []).map((r) => normalizeText(r.m))),
    repeatedEmails: new Set((emails?.results || []).map((r) => normalizeText(r.e))),
    repeatedDevices: new Set((devices?.results || []).map((r) => r.device)),
  };
}

// ---------- Spreadsheet (CSV) export ----------
export const CSV_COLUMNS = [
  ['id', 'ID'], ['created_at', 'Received (UTC)'], ['kind', 'Type'], ['inquiry_type', 'Topic'],
  ['name', 'Name'], ['email', 'Email'], ['phone', 'Phone'], ['city', 'City'], ['message', 'Message'],
  ['preferred_date', 'Preferred date'], ['preferred_time', 'Preferred time'], ['stage', 'Stage'],
  ['handled', 'Handled'], ['notes', 'Staff notes'], ['source', 'Sent from page'],
  ['ip', 'IP address'], ['ip_place', 'Approximate location'], ['isp', 'Network'],
  ['first_response_at', 'First reply (UTC)'], ['handled_at', 'Marked handled (UTC)'],
  ['duplicate_of', 'Duplicate of'], ['device', 'Device check code'],
];

// Quotes every cell, and stops spreadsheet programs from treating text that starts with
// = + - @ (or a tab / line break) as a formula, which could otherwise run when the file is opened.
export function csvCell(value) {
  let s = value === null || value === undefined ? '' : String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return `"${s.replace(/"/g, '""')}"`;
}

export function leadsToCsv(rows) {
  const lines = [CSV_COLUMNS.map(([, label]) => csvCell(label)).join(',')];
  for (const row of rows) {
    lines.push(CSV_COLUMNS.map(([key]) => {
      if (key === 'handled') return csvCell(Number(row.handled) ? 'Yes' : 'No');
      if (key === 'duplicate_of') return csvCell(Number(row.duplicate_of) ? `#${row.duplicate_of}` : '');
      return csvCell(row[key]);
    }).join(','));
  }
  // The byte-order mark makes Excel read accented and non-English letters correctly.
  return `﻿${lines.join('\r\n')}\r\n`;
}
