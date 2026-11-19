// Internet addresses: checking them, and working out which "sender" an address belongs to.
//
// A short (IPv4) address is one sender. A long (IPv6) address is not: every home or phone
// connection is given a block of billions of long addresses (a "/64"), and a device can pick
// a new one whenever it likes. Counting each long address separately would let anyone get
// past a "5 tries per address" limit just by moving to the next address. So every limit and
// lockout on the site counts a long address by its /64 network, which is one household or
// one phone. The block list (lib/blocklist.js) blocks long addresses the same way.

// Returns the address in one standard form, or '' if it is not a valid IPv4 or IPv6 address.
export function normalizeIp(value) {
  const s = String(value ?? '').trim().toLowerCase();
  if (!s || s.length > 45) return '';
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(s);
  if (v4) {
    const parts = v4.slice(1).map(Number);
    if (parts.some((n, i) => n > 255 || (v4[i + 1].length > 1 && v4[i + 1][0] === '0'))) return '';
    return parts.join('.');
  }
  if (!s.includes(':') || !/^[0-9a-f:.]+$/.test(s)) return '';
  try {
    // The URL parser checks IPv6 strictly and writes it in its shortest standard form.
    const host = new URL(`http://[${s}]/`).hostname;
    return host.slice(1, -1);
  } catch {
    return '';
  }
}

// The eight groups of a long address written out in full, e.g. ['2603','8001','9a00','1cc6','0','0','0','1'].
export function ipv6Groups(ip) {
  const [head, tail] = ip.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  if (ip.includes('::')) return [...left, ...Array(Math.max(0, 8 - left.length - right.length)).fill('0'), ...right];
  return left;
}

// The sender an address belongs to: the address itself for a short one, "<network>/64" for a
// long one. Also accepts a network already written as ".../64". Returns '' if it is not valid.
export function networkKey(value) {
  let raw = String(value ?? '').trim().toLowerCase();
  if (raw.endsWith('/64')) raw = raw.slice(0, -3);
  const ip = normalizeIp(raw);
  if (!ip) return '';
  if (!ip.includes(':')) return ip;
  const groups = ipv6Groups(ip);
  if (groups.length !== 8) return '';
  // A short address written in long form (::ffff:a.b.c.d) is the short address.
  if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
    const hi = parseInt(groups[6], 16);
    const lo = parseInt(groups[7], 16);
    return `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;
  }
  const network = normalizeIp(`${groups.slice(0, 4).join(':')}::`);
  return network ? `${network}/64` : '';
}

// Search patterns (for SQL LIKE) that match every long address in the same /64 network, as
// written in the standard short form Cloudflare reports. The short form can hide zero groups of
// the network part behind "::", so each way that can happen gets its own pattern. A few extra
// addresses can match; callers check each result with networkKey. [] for a short address.
export function networkLikePatterns(value) {
  const key = networkKey(value);
  if (!key.endsWith('/64')) return [];
  const net = ipv6Groups(key.slice(0, -3)).slice(0, 4);
  const patterns = new Set([`${net.join(':')}:%`]);
  // A run of zero groups from s to e, shortened to "::"; it may carry on past the network part.
  for (let s = 0; s < 4; s++) {
    if (s > 0 && net[s - 1] === '0') continue; // a run starts after a non-zero group
    for (let e = s + 1; e < 8; e++) {
      if (net.slice(s, Math.min(e, 3) + 1).some((g) => g !== '0')) break;
      if (e >= 3) { patterns.add(`${net.slice(0, s).join(':')}::%`); break; }
      if (net[e + 1] !== '0') patterns.add(`${net.slice(0, s).join(':')}::${net.slice(e + 1).join(':')}:%`);
    }
  }
  return [...patterns];
}
