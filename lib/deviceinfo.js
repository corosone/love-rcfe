// Everything the site can learn about the device behind a sign-in or a logged event.
// Shown ONLY in the developer console and in the developer's own emails; never to staff.
//
// There are two kinds of information, and they are always kept apart:
//
//   "seen"      What the site and Cloudflare observed for themselves: the address the request
//               came from, Cloudflare's estimate of where that address is, the network it
//               belongs to, and the headers the browser sent. The address cannot be faked.
//
//   "reported"  What the developer sign-in page asked the browser about itself (screen size,
//               graphics card, the "other" address, and so on). A browser can send anything,
//               so every value is checked against a strict list here, labelled as reported
//               wherever it is shown, and never used for lockouts, rate limits or blocking
//               decisions made by the site.
//
// A device normally has two addresses: a long one (IPv6) and a short one (IPv4). The site only
// sees the one the browser connected with. The other one is looked up by the sign-in page and
// arrives as "reported".

import { clientIp } from './db.js';
import { normalizeIp } from './blocklist.js';
import { shortUA } from './reqinfo.js';

const MAX_INFO_CHARS = 6000;

// Control characters, line breaks and invisible/direction-changing characters.
const UNSAFE = /[\u0000-\u001f\u007f-\u009f\u00ad\u061c\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff9-\ufffb]/g;

function text(value, max = 80) {
  if (typeof value !== 'string') return '';
  return value.replace(UNSAFE, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}
function int(value, min, max) {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max ? value : null;
}
function num(value, min, max, digits = 2) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) return null;
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}
function bool(value) {
  return typeof value === 'boolean' ? value : null;
}
function oneOf(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : '';
}
function put(out, key, value) {
  if (value !== '' && value !== null && value !== undefined) out[key] = value;
}

const TZ_RE = /^[A-Za-z_]{1,20}(\/[A-Za-z0-9_+\-]{1,30}){0,2}$/;
const LANG_RE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{1,8}){0,3}$/;
const COORD_RE = /^-?\d{1,3}(\.\d{1,8})?$/;
const IPV4_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

export const isLongIp = (ip) => typeof ip === 'string' && ip.includes(':');

// A real, public short (IPv4) address written the standard way, or ''.
export function publicIpv4(raw) {
  if (typeof raw !== 'string' || raw.length < 7 || raw.length > 15 || !IPV4_RE.test(raw)) return '';
  const [a, b, c] = raw.split('.').map(Number);
  const notPublic =
    a === 0 || a === 10 || a === 127 || a >= 224 ||   // "this network", private, loopback, multicast/reserved
    (a === 100 && b >= 64 && b <= 127) ||             // carrier-grade NAT (shared, not a real public address)
    (a === 169 && b === 254) ||                       // link-local
    (a === 172 && b >= 16 && b <= 31) ||              // private
    (a === 192 && b === 168) ||                       // private
    (a === 192 && b === 0 && (c === 0 || c === 2)) || // protocol assignments, documentation
    (a === 198 && (b === 18 || b === 19)) ||          // benchmarking
    (a === 198 && b === 51 && c === 100) ||           // documentation
    (a === 203 && b === 0 && c === 113);              // documentation
  return notPublic ? '' : raw;
}

// A real, public long (IPv6) address in its standard short form, or ''.
export function publicIpv6(raw) {
  if (typeof raw !== 'string' || raw.length < 3 || raw.length > 45 || !/^[0-9A-Fa-f:]+$/.test(raw)) return '';
  const ip = normalizeIp(raw);
  if (!ip || !ip.includes(':')) return '';
  // Public addresses are in 2000::/3. That leaves out loopback, link-local (fe80), private (fc/fd) and multicast (ff).
  if (!/^[23][0-9a-f]{3}:/.test(ip)) return '';
  if (/^2001:db8:/.test(ip)) return ''; // documentation examples
  return ip;
}

// ---------- What the site saw ----------
export function deviceSeen(request) {
  const cf = request?.cf && typeof request.cf === 'object' ? request.cf : {};
  const header = (name, max) => text(request?.headers?.get?.(name) || '', max);
  const str = (v, max = 80) => (typeof v === 'string' ? text(v, max) : typeof v === 'number' && Number.isFinite(v) ? String(v) : '');
  const coord = (v) => (COORD_RE.test(str(v, 16)) ? str(v, 16) : '');
  const rawIp = clientIp(request);
  const out = {};
  put(out, 'ip', normalizeIp(rawIp) || text(String(rawIp || ''), 64));
  put(out, 'city', str(cf.city));
  put(out, 'region', str(cf.region));
  put(out, 'regionCode', str(cf.regionCode, 12));
  put(out, 'postalCode', str(cf.postalCode, 16));
  put(out, 'country', str(cf.country, 8));
  put(out, 'continent', str(cf.continent, 4));
  if (cf.isEUCountry === '1' || cf.isEUCountry === true) out.eu = true;
  put(out, 'latitude', coord(cf.latitude));
  put(out, 'longitude', coord(cf.longitude));
  put(out, 'timezone', TZ_RE.test(str(cf.timezone, 60)) ? str(cf.timezone, 60) : '');
  put(out, 'metroCode', str(cf.metroCode, 8));
  put(out, 'isp', str(cf.asOrganization, 100));
  put(out, 'asn', /^\d{1,10}$/.test(str(cf.asn, 12)) ? str(cf.asn, 12) : '');
  put(out, 'colo', str(cf.colo, 8));
  put(out, 'http', str(cf.httpProtocol, 16));
  put(out, 'tls', str(cf.tlsVersion, 16));
  put(out, 'cipher', str(cf.tlsCipher, 60));
  put(out, 'tcpRtt', int(Number(cf.clientTcpRtt), 1, 60000));
  put(out, 'browser', shortUA(request));
  put(out, 'userAgent', header('user-agent', 400));
  put(out, 'languages', header('accept-language', 160));
  put(out, 'brands', header('sec-ch-ua', 200));
  put(out, 'platform', header('sec-ch-ua-platform', 40).replace(/^"|"$/g, ''));
  const mobile = header('sec-ch-ua-mobile', 4);
  if (mobile === '?1') out.mobile = true;
  else if (mobile === '?0') out.mobile = false;
  if (header('dnt', 2) === '1') out.dnt = true;
  if (header('sec-gpc', 2) === '1') out.gpc = true;
  // Where the request came from, unless that is just this site's own page (always true for the
  // console's own requests, so it would say nothing).
  const referer = header('referer', 200);
  let sameSite = false;
  try { sameSite = new URL(referer).origin === new URL(request.url).origin; } catch { sameSite = false; }
  if (!sameSite) put(out, 'referer', referer);
  return out;
}

// ---------- What the browser reported (checked field by field; anything unexpected is dropped) ----------
export function deviceReported(raw, seenIp) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out = {};
  // Only the address family the site did NOT see is taken from the browser. For the family the
  // site saw, its own observation is the truth and anything reported is ignored.
  if (isLongIp(seenIp)) put(out, 'ipv4', publicIpv4(raw.ipv4));
  else if (IPV4_RE.test(String(seenIp || ''))) put(out, 'ipv6', publicIpv6(raw.ipv6));

  put(out, 'screenW', int(raw.screenW, 1, 20000));
  put(out, 'screenH', int(raw.screenH, 1, 20000));
  put(out, 'availW', int(raw.availW, 1, 20000));
  put(out, 'availH', int(raw.availH, 1, 20000));
  put(out, 'windowW', int(raw.windowW, 1, 20000));
  put(out, 'windowH', int(raw.windowH, 1, 20000));
  put(out, 'pixelRatio', num(raw.pixelRatio, 0.1, 10));
  put(out, 'colorDepth', int(raw.colorDepth, 1, 64));
  put(out, 'orientation', oneOf(raw.orientation, ['portrait-primary', 'portrait-secondary', 'landscape-primary', 'landscape-secondary']));
  put(out, 'timezone', typeof raw.timezone === 'string' && TZ_RE.test(raw.timezone) ? raw.timezone : '');
  put(out, 'utcOffset', int(raw.utcOffset, -900, 900));
  if (Array.isArray(raw.languages)) {
    const langs = raw.languages.filter((l) => typeof l === 'string' && LANG_RE.test(l)).slice(0, 8);
    if (langs.length) out.languages = langs;
  }
  put(out, 'platform', text(raw.platform, 40));
  put(out, 'vendor', text(raw.vendor, 40));
  put(out, 'os', text(raw.os, 40));
  put(out, 'osVersion', typeof raw.osVersion === 'string' && /^[0-9.]{1,20}$/.test(raw.osVersion) ? raw.osVersion : '');
  put(out, 'arch', typeof raw.arch === 'string' && /^[A-Za-z0-9_]{1,12}$/.test(raw.arch) ? raw.arch : '');
  put(out, 'bitness', oneOf(raw.bitness, ['32', '64']));
  put(out, 'model', text(raw.model, 60));
  put(out, 'mobile', bool(raw.mobile));
  put(out, 'wow64', bool(raw.wow64));
  if (Array.isArray(raw.formFactors)) {
    const ff = raw.formFactors.filter((f) => typeof f === 'string' && /^[A-Za-z]{1,12}$/.test(f)).slice(0, 4);
    if (ff.length) out.formFactors = ff;
  }
  if (Array.isArray(raw.brands)) {
    const brands = raw.brands
      .filter((b) => b && typeof b === 'object' && typeof b.brand === 'string' && typeof b.version === 'string')
      .map((b) => ({ brand: text(b.brand, 40), version: /^[0-9.]{1,24}$/.test(b.version) ? b.version : '' }))
      .filter((b) => b.brand && b.version && !/not.{0,3}a.{0,3}brand/i.test(b.brand))
      .slice(0, 5);
    if (brands.length) out.brands = brands;
  }
  put(out, 'cores', int(raw.cores, 1, 1024));
  put(out, 'memory', num(raw.memory, 0.25, 1024));
  put(out, 'touchPoints', int(raw.touchPoints, 0, 32));
  put(out, 'gpuVendor', text(raw.gpuVendor, 80));
  put(out, 'gpu', text(raw.gpu, 160));
  put(out, 'netType', oneOf(raw.netType, ['slow-2g', '2g', '3g', '4g']));
  put(out, 'netKind', oneOf(raw.netKind, ['bluetooth', 'cellular', 'ethernet', 'none', 'wifi', 'wimax', 'other', 'unknown']));
  put(out, 'downlink', num(raw.downlink, 0, 10000, 1));
  put(out, 'rtt', int(raw.rtt, 0, 60000));
  put(out, 'saveData', bool(raw.saveData));
  put(out, 'cookies', bool(raw.cookies));
  put(out, 'dnt', bool(raw.dnt));
  put(out, 'gpc', bool(raw.gpc));
  put(out, 'dark', bool(raw.dark));
  put(out, 'reducedMotion', bool(raw.reducedMotion));
  put(out, 'pdf', bool(raw.pdf));
  put(out, 'webdriver', bool(raw.webdriver));
  put(out, 'online', bool(raw.online));
  put(out, 'pointer', oneOf(raw.pointer, ['fine', 'coarse', 'none']));
  put(out, 'hover', bool(raw.hover));
  put(out, 'batteryLevel', int(raw.batteryLevel, 0, 100));
  put(out, 'charging', bool(raw.charging));
  put(out, 'referrer', text(raw.referrer, 200));
  return Object.keys(out).length ? out : null;
}

// ---------- Storing it with an activity-log row ----------
export function buildDeviceInfo(request, rawReported) {
  const seen = deviceSeen(request);
  const info = { v: 1, seen };
  const reported = deviceReported(rawReported, seen.ip || '');
  if (reported) info.reported = reported;
  return info;
}

export function infoToJson(info) {
  try {
    let json = JSON.stringify(info);
    if (json.length > MAX_INFO_CHARS && info.reported) json = JSON.stringify({ v: info.v, seen: info.seen });
    return json.length > MAX_INFO_CHARS ? '' : json;
  } catch {
    return '';
  }
}

export function infoFromJson(json) {
  if (typeof json !== 'string' || !json || json.length > MAX_INFO_CHARS * 2) return null;
  try {
    const info = JSON.parse(json);
    if (!info || typeof info !== 'object' || !info.seen || typeof info.seen !== 'object') return null;
    return { v: 1, seen: info.seen, reported: info.reported && typeof info.reported === 'object' ? info.reported : undefined };
  } catch {
    return null;
  }
}

// ---------- The two addresses ----------
// Returns { long, short }: each is null or { ip, source: 'seen' | 'reported' }.
export function deviceAddresses(info) {
  const seenIp = String(info?.seen?.ip || '');
  const reported = info?.reported || {};
  const out = { long: null, short: null };
  if (isLongIp(seenIp)) {
    out.long = { ip: seenIp, source: 'seen' };
    if (reported.ipv4) out.short = { ip: String(reported.ipv4), source: 'reported' };
  } else if (seenIp && /^[0-9.]+$/.test(seenIp)) {
    out.short = { ip: seenIp, source: 'seen' };
    if (reported.ipv6) out.long = { ip: String(reported.ipv6), source: 'reported' };
  }
  return out;
}

// ---------- Turning it into labelled lines (one place, used by the email and the console) ----------
const CONTINENTS = { AF: 'Africa', AN: 'Antarctica', AS: 'Asia', EU: 'Europe', NA: 'North America', OC: 'Oceania', SA: 'South America' };
const yesNo = (v) => (v === true ? 'Yes' : v === false ? 'No' : '');
const SOURCE_NOTE = { seen: 'seen by the site', reported: 'reported by the browser' };

function offsetLabel(minutesBehindUtc) {
  if (typeof minutesBehindUtc !== 'number') return '';
  const total = -minutesBehindUtc; // JavaScript reports minutes BEHIND UTC
  const sign = total < 0 ? '-' : '+';
  const abs = Math.abs(total);
  return `UTC${sign}${String(Math.floor(abs / 60)).padStart(2, '0')}:${String(abs % 60).padStart(2, '0')}`;
}

function windowsName(os, osVersion) {
  if (!/^windows$/i.test(os || '') || !osVersion) return '';
  const major = Number(String(osVersion).split('.')[0]);
  if (!Number.isFinite(major)) return '';
  if (major >= 13) return 'Windows 11';
  if (major >= 1) return 'Windows 10';
  return '';
}

export function deviceSections(info) {
  if (!info || !info.seen) return [];
  const s = info.seen;
  const r = info.reported || {};
  const sections = [];
  const add = (title, rows) => {
    const kept = rows.filter(([, value]) => value !== '' && value !== null && value !== undefined).map(([label, value]) => [label, String(value)]);
    if (kept.length) sections.push({ title, rows: kept });
  };

  const addr = deviceAddresses(info);
  const addrRow = (a, missing) => (a ? `${a.ip} (${SOURCE_NOTE[a.source]})` : missing);
  add('Addresses', [
    ['Long address (IPv6)', addrRow(addr.long, info.reported ? 'Not found (this device or its network may not have one)' : 'Not known for this event')],
    ['Short address (IPv4)', addrRow(addr.short, info.reported ? 'Not found (this device or its network may not have one)' : 'Not known for this event')],
  ]);

  const place = [s.city, s.region, s.country].filter(Boolean).join(', ');
  add('Location (Cloudflare\'s estimate from the address; usually right to the city, never the exact building)', [
    ['Place', place],
    ['Postal code', s.postalCode],
    ['Region code', s.regionCode],
    ['Continent', CONTINENTS[s.continent] || s.continent],
    ['Coordinates', s.latitude && s.longitude ? `${s.latitude}, ${s.longitude}` : ''],
    ['Time zone', s.timezone],
    ['Metro area code', s.metroCode],
    ['In the European Union', s.eu ? 'Yes' : ''],
  ]);

  add('Network (seen by the site)', [
    ['Internet provider', s.isp],
    ['Provider network number', s.asn ? `AS${s.asn}` : ''],
    ['Cloudflare data centre that answered', s.colo],
    ['Connection type', s.http],
    ['Encryption', [s.tls, s.cipher].filter(Boolean).join(', ')],
    ['Network delay to Cloudflare', s.tcpRtt ? `${s.tcpRtt} ms` : ''],
  ]);

  add('Browser (from what the browser sent to the site)', [
    ['Browser', s.browser],
    ['Full browser identifier', s.userAgent],
    ['Browser brands', s.brands],
    ['Operating system', s.platform],
    ['Phone or tablet', yesNo(s.mobile)],
    ['Preferred languages', s.languages],
    ['Asked not to be tracked', s.dnt || s.gpc ? 'Yes' : ''],
    ['Came from', s.referer],
  ]);

  const osName = windowsName(r.os, r.osVersion) || r.os || '';
  const brandList = Array.isArray(r.brands) ? r.brands.map((b) => `${b.brand} ${b.version}`).join(', ') : '';
  const size = (w, h) => (w && h ? `${w} x ${h}` : '');
  add('Device (reported by the browser, so it could be faked)', [
    ['Operating system', osName ? `${osName}${r.osVersion ? ` (platform version ${r.osVersion})` : ''}` : ''],
    ['Processor type', [r.arch, r.bitness ? `${r.bitness}-bit` : ''].filter(Boolean).join(', ')],
    ['Device model', r.model],
    ['Kind of device', Array.isArray(r.formFactors) ? r.formFactors.join(', ') : ''],
    ['Phone or tablet', yesNo(r.mobile)],
    ['Exact browser version', brandList],
    ['Browser maker', r.vendor],
    ['Platform', r.platform],
    ['Processor cores', r.cores],
    ['Memory', r.memory ? (r.memory >= 8 ? '8 GB or more' : `about ${r.memory} GB`) : ''],
    ['Graphics card', [r.gpuVendor, r.gpu].filter(Boolean).join(' / ')],
    ['Screen size', size(r.screenW, r.screenH)],
    ['Usable screen area', size(r.availW, r.availH)],
    ['Browser window size', size(r.windowW, r.windowH)],
    ['Screen sharpness (pixel ratio)', r.pixelRatio],
    ['Colour depth', r.colorDepth ? `${r.colorDepth}-bit` : ''],
    ['Screen orientation', r.orientation ? r.orientation.replace('-primary', '').replace('-secondary', ' (flipped)') : ''],
    ['Touch screen', typeof r.touchPoints === 'number' ? (r.touchPoints > 0 ? `Yes (${r.touchPoints} touch points)` : 'No') : ''],
    ['Main pointer', r.pointer === 'fine' ? 'Mouse or trackpad' : r.pointer === 'coarse' ? 'Finger (touch)' : r.pointer === 'none' ? 'None' : ''],
    ['Device time zone', [r.timezone, offsetLabel(r.utcOffset)].filter(Boolean).join(', ')],
    ['Device languages', Array.isArray(r.languages) ? r.languages.join(', ') : ''],
    ['Connection quality', [r.netKind && r.netKind !== 'unknown' ? r.netKind : '', r.netType ? `${r.netType} speed class` : '', typeof r.downlink === 'number' ? `about ${r.downlink} Mbps` : '', typeof r.rtt === 'number' ? `${r.rtt} ms delay` : ''].filter(Boolean).join(', ')],
    ['Data saver on', yesNo(r.saveData)],
    ['Battery', typeof r.batteryLevel === 'number' ? `${r.batteryLevel}%${r.charging === true ? ', charging' : r.charging === false ? ', not charging' : ''}` : ''],
    ['Dark mode', yesNo(r.dark)],
    ['Reduced motion', yesNo(r.reducedMotion)],
    ['Cookies allowed', yesNo(r.cookies)],
    ['Asked not to be tracked', r.dnt === true || r.gpc === true ? 'Yes' : r.dnt === false || r.gpc === false ? 'No' : ''],
    ['Built-in PDF viewer', yesNo(r.pdf)],
    ['Controlled by automation software', yesNo(r.webdriver)],
    ['Came from', r.referrer],
  ]);

  // The device's time zone not matching the address's time zone often means a VPN or proxy.
  if (s.timezone && r.timezone && s.timezone !== r.timezone) {
    add('Worth noticing', [['Time zones differ', `The address is in ${s.timezone} but the device clock is set to ${r.timezone}. That often means a VPN or proxy.`]]);
  }
  return sections;
}

// One line for the top of an email: "Chrome on Windows 11, Burbank, California, US, Charter Communications".
export function deviceSummary(info) {
  if (!info || !info.seen) return '';
  const s = info.seen;
  const r = info.reported || {};
  const os = windowsName(r.os, r.osVersion);
  const browser = os && s.browser ? s.browser.replace(/ on Windows$/, ` on ${os}`) : s.browser;
  return [browser, [s.city, s.region, s.country].filter(Boolean).join(', '), s.isp].filter(Boolean).join(' · ');
}

// Makes text safe to put in an email: it cannot become a clickable link, whatever it says.
export function defang(value) {
  return String(value).replace(/\.(?=[A-Za-z])/g, '[.]').replace(/:\/\//g, '[://]').replace(/@/g, '[at]');
}

// The plain-text block added to the developer's emails.
export function deviceEmailLines(info) {
  const sections = deviceSections(info);
  if (!sections.length) return [];
  const lines = [];
  for (const section of sections) {
    lines.push('', section.title.toUpperCase());
    for (const [label, value] of section.rows) {
      // Addresses were validated character by character, so they are shown exactly.
      lines.push(`  ${label}: ${section.title === 'Addresses' ? value : defang(value)}`);
    }
  }
  return lines;
}
