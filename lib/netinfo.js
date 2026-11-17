// Network checks for the developer console: who an internet address belongs to, and whether it
// looks like a VPN, a privacy relay, Tor, a data centre or an ordinary home or phone connection.
//
// Everything here is a well-informed guess, and is always shown as one ("likely"). It is never
// used to block anyone automatically: the owner decides.
//
// Sources (all free, no account or key needed):
//   - Cloudflare tells the site the network number (ASN) and owner of every visitor's address.
//   - The public internet registries (RDAP, via rdap.org) say who owns any address and give
//     the network's abuse contact.
//   - The Tor Project publishes the list of Tor exit addresses.
//   - The lists below of well-known data-centre, VPN and privacy-relay networks.

import { normalizeIp } from './blocklist.js';

// ---------- Well-known networks (by ASN, the network's registered number) ----------
// Privacy relays built into phones and browsers. Real people use these all the time.
const RELAY_ASNS = new Map([
  ['36183', 'Apple iCloud Private Relay (through Akamai)'],
  ['13335', 'Cloudflare (iCloud Private Relay or the WARP app)'],
  ['54113', 'Fastly (often iCloud Private Relay)'],
]);
// Networks run by VPN companies.
const VPN_ASNS = new Map([
  ['39351', 'Mullvad VPN'],
  ['136787', 'NordVPN (Tefincom)'],
  ['147049', 'PacketHub (used by NordVPN)'],
]);
// Data centres and cloud providers. Homes and phones are not here, so traffic from these
// networks is usually a VPN, a proxy or an automated program.
const HOSTING_ASNS = new Map([
  ['16509', 'Amazon Web Services'], ['14618', 'Amazon Web Services'], ['8987', 'Amazon Web Services'],
  ['396982', 'Google Cloud'], ['15169', 'Google'], ['19527', 'Google'],
  ['8075', 'Microsoft Azure'],
  ['14061', 'DigitalOcean'], ['63949', 'Linode (Akamai Cloud)'], ['20473', 'Vultr'],
  ['16276', 'OVH'], ['24940', 'Hetzner'], ['213230', 'Hetzner Cloud'],
  ['9009', 'M247 (often used by VPNs)'], ['60068', 'Datacamp / CDN77 (often used by VPNs)'],
  ['51167', 'Contabo'], ['60781', 'Leaseweb'], ['28753', 'Leaseweb'], ['16265', 'Leaseweb'], ['30633', 'Leaseweb'],
  ['31898', 'Oracle Cloud'], ['45102', 'Alibaba Cloud'], ['132203', 'Tencent Cloud'],
  ['12876', 'Scaleway'], ['21859', 'Zenlayer'], ['199524', 'G-Core Labs'], ['40676', 'Psychz Networks'],
  ['8100', 'QuadraNet'], ['36352', 'ColoCrossing'], ['29802', 'Hivelocity'], ['47583', 'Hostinger'],
  ['8560', 'IONOS'], ['62240', 'Clouvider'],
]);
// Mobile phone networks (one address is shared by many phones, so blocking one is risky).
const MOBILE_ASNS = new Map([
  ['21928', 'T-Mobile USA'], ['6167', 'Verizon Wireless'], ['20057', 'AT&T Mobility'],
]);

const VPN_WORDS = /\bvpn\b|mullvad|proton ag|nordvpn|tefincom|packethub|surfshark|expressvpn|express vpn|private internet access|cyberghost|windscribe|ipvanish|hide\.me|purevpn|tunnelbear|astrill|privado|hotspot shield|\bivpn\b|airvpn|kape technologies/i;
const HOSTING_WORDS = /hosting|data ?cent(er|re)|\bvps\b|colocation|\bcolo\b|\bservers?\b|amazon|google llc|google cloud|microsoft|digitalocean|linode|vultr|choopa|\bovh|hetzner|m247|datacamp|cdn77|contabo|leaseweb|oracle|alibaba|tencent|scaleway|zenlayer|g-core|gcore|psychz|quadranet|colocrossing|hivelocity|hostinger|ionos|clouvider/i;
const MOBILE_WORDS = /wireless|mobility|cellular|t-mobile|\bmobile\b/i;

export const NETWORK_KINDS = {
  tor: { label: 'Tor', hidden: true, about: 'Uses the Tor network, which hides the real address. Rare for families; common for people who want to stay hidden.' },
  relay: { label: 'Privacy relay', hidden: true, about: 'A privacy feature built into many iPhones, Macs and browsers (iCloud Private Relay or Cloudflare WARP). Real people use it all the time, so it is not a warning sign on its own.' },
  vpn: { label: 'Likely VPN', hidden: true, about: 'The network belongs to a VPN company, which hides the real address and location.' },
  hosting: { label: 'Likely VPN or server', hidden: true, about: 'Comes from a data centre, not a home or phone. That is usually a VPN, a proxy or an automated program.' },
  mobile: { label: 'Mobile network', hidden: false, about: 'A phone network. Many phones share one address, so blocking it can affect other people.' },
  home: { label: 'Home or business internet', hidden: false, about: 'An ordinary internet provider. No sign of a VPN.' },
  unknown: { label: 'Not known', hidden: false, about: 'There is not enough information about this network yet.' },
};

const cleanAsn = (asn) => (/^\d{1,10}$/.test(String(asn ?? '').trim()) ? String(asn).trim() : '');

// The best guess for one address. `asn` and `isp` come from Cloudflare (stored with visits,
// enquiries and activity); `owner` is the registry's name for the network, when looked up;
// `tor` is true when the address is on the Tor exit list.
export function classifyNetwork({ asn = '', isp = '', owner = '', tor = false } = {}) {
  const n = cleanAsn(asn);
  const names = [isp, owner].filter(Boolean).join(' / ');
  const result = (kind, reason) => ({ kind, label: NETWORK_KINDS[kind].label, hidden: NETWORK_KINDS[kind].hidden, about: NETWORK_KINDS[kind].about, reason });
  if (tor) return result('tor', 'On the Tor Project\'s list of exit addresses.');
  if (RELAY_ASNS.has(n)) return result('relay', RELAY_ASNS.get(n));
  if (VPN_ASNS.has(n)) return result('vpn', VPN_ASNS.get(n));
  if (names && VPN_WORDS.test(names)) return result('vpn', `Network name: ${names}`);
  if (HOSTING_ASNS.has(n)) return result('hosting', HOSTING_ASNS.get(n));
  if (names && HOSTING_WORDS.test(names)) return result('hosting', `Network name: ${names}`);
  if (MOBILE_ASNS.has(n)) return result('mobile', MOBILE_ASNS.get(n));
  if (names && MOBILE_WORDS.test(names)) return result('mobile', `Network name: ${names}`);
  if (names || n) return result('home', names ? `Network name: ${names}` : `Network number AS${n}`);
  return result('unknown', '');
}

// Cloudflare's network details for the request being handled: { asn, isp } (strings, '' if unknown).
export function cfNetwork(request) {
  const cf = request?.cf && typeof request.cf === 'object' ? request.cf : {};
  const asn = cleanAsn(cf.asn);
  const isp = typeof cf.asOrganization === 'string' ? cf.asOrganization.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 100) : '';
  return { asn, isp };
}

// ---------- Small in-memory caches (per Cloudflare server instance) ----------
function cacheGet(map, key, maxAgeMs) {
  const hit = map.get(key);
  if (hit && Date.now() - hit.at < maxAgeMs) return hit.value;
  return undefined;
}
function cacheSet(map, key, value, maxEntries = 200) {
  map.set(key, { at: Date.now(), value });
  if (map.size > maxEntries) map.delete(map.keys().next().value);
}

// Some public services refuse requests that do not say which program is asking (rdap.org does),
// and Cloudflare's servers send none by default.
export const USER_AGENT = 'LoveRCFE-DevConsole/1.0 (+https://love-rcfe.pages.dev)';

async function fetchWithTimeout(url, ms, init = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...init, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) }, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// ---------- Tor exit list ----------
const TOR_URL = 'https://check.torproject.org/torbulkexitlist';
let torCache = { at: 0, set: null };

// Returns true / false, or null when the list could not be fetched.
export async function isTorExit(ip) {
  const clean = normalizeIp(ip);
  if (!clean) return false;
  if (!torCache.set || Date.now() - torCache.at > 60 * 60 * 1000) {
    try {
      const res = await fetchWithTimeout(TOR_URL, 6000);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const text = await res.text();
      const set = new Set(text.split(/\r?\n/).map((l) => normalizeIp(l)).filter(Boolean));
      if (set.size) torCache = { at: Date.now(), set };
      else console.warn('The Tor exit list came back empty.');
    } catch (err) {
      console.warn('Tor exit list could not be fetched:', err?.message);
    }
  }
  // null = could not check (no list yet); an older list is still used if the refresh failed
  return torCache.set ? torCache.set.has(clean) : null;
}

// ---------- Who owns an address (public registry, RDAP) ----------
const rdapCache = new Map();
const REGISTRIES = { 'whois.arin.net': 'ARIN (North America)', 'whois.ripe.net': 'RIPE NCC (Europe, Middle East)', 'whois.apnic.net': 'APNIC (Asia-Pacific)', 'whois.lacnic.net': 'LACNIC (Latin America)', 'whois.afrinic.net': 'AFRINIC (Africa)' };
const plain = (v, max = 120) => (typeof v === 'string' ? v.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max) : '');

function vcardValue(entity, field) {
  const card = Array.isArray(entity?.vcardArray) ? entity.vcardArray[1] : null;
  if (!Array.isArray(card)) return '';
  const row = card.find((r) => Array.isArray(r) && r[0] === field);
  return row ? plain(Array.isArray(row[3]) ? row[3].join(' ') : row[3]) : '';
}

// Every entity in the RDAP answer, however deeply nested.
function allEntities(list, out = [], depth = 0) {
  if (!Array.isArray(list) || depth > 4) return out;
  for (const e of list) {
    if (!e || typeof e !== 'object') continue;
    out.push(e);
    allEntities(e.entities, out, depth + 1);
  }
  return out;
}

// Returns { ok: true, network, owner, range, country, registry, abuseEmail } or { ok: false, error }.
export async function rdapLookup(ip) {
  const clean = normalizeIp(ip);
  if (!clean) return { ok: false, error: 'Not a valid IP address.' };
  const cached = cacheGet(rdapCache, clean, 6 * 60 * 60 * 1000);
  if (cached) return cached;
  let result;
  try {
    const res = await fetchWithTimeout(`https://rdap.org/ip/${clean}` /* clean is a checked address: digits, a-f, dots and colons only */, 8000, {
      headers: { Accept: 'application/rdap+json, application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const d = await res.json();
    const entities = allEntities(d.entities);
    const ownerEntity = entities.find((e) => Array.isArray(e.roles) && e.roles.includes('registrant'))
      || entities.find((e) => Array.isArray(e.roles) && e.roles.includes('administrative'))
      || entities[0];
    const abuse = entities.find((e) => Array.isArray(e.roles) && e.roles.includes('abuse'));
    const email = abuse ? vcardValue(abuse, 'email') : '';
    result = {
      ok: true,
      network: plain(d.name, 80),
      handle: plain(d.handle, 80),
      owner: ownerEntity ? vcardValue(ownerEntity, 'fn') : '',
      range: d.startAddress && d.endAddress ? `${plain(d.startAddress, 45)} - ${plain(d.endAddress, 45)}` : '',
      country: plain(d.country, 4),
      registry: REGISTRIES[plain(d.port43, 40)] || plain(d.port43, 40),
      abuseEmail: /^[^\s@<>"]{1,64}@[^\s@<>"]{1,190}$/.test(email) ? email : '',
    };
  } catch (err) {
    result = { ok: false, error: 'The internet registry could not be reached. Try again in a minute.' };
    console.warn('RDAP lookup failed:', err?.message);
    return result; // failures are not cached
  }
  cacheSet(rdapCache, clean, result);
  return result;
}

// For tests only.
export function _resetNetCaches() {
  torCache = { at: 0, set: null };
  rdapCache.clear();
}
