// Short, human-readable descriptions of who made a request, for the developer console logs.
// Everything returned here is plain text; the console always displays it with textContent.

// "Chrome on Windows", "Safari on iOS", ... (empty string when unknown)
export function shortUA(request) {
  const ua = (request?.headers?.get?.('user-agent') || '').slice(0, 400);
  if (!ua) return '';
  let browser = '';
  if (/bot|crawl|spider|slurp|curl\/|wget\/|python-requests|python-urllib|go-http-client|okhttp|java\/|headless/i.test(ua)) browser = 'Bot/script';
  else if (/Edg(e|A|iOS)?\//i.test(ua)) browser = 'Edge';
  else if (/OPR\/|Opera/i.test(ua)) browser = 'Opera';
  else if (/SamsungBrowser\//i.test(ua)) browser = 'Samsung Internet';
  else if (/CriOS\/|Chrome\//i.test(ua)) browser = 'Chrome';
  else if (/FxiOS\/|Firefox\//i.test(ua)) browser = 'Firefox';
  else if (/Safari\//i.test(ua)) browser = 'Safari';

  let os = '';
  if (/Windows/i.test(ua)) os = 'Windows';
  else if (/Android/i.test(ua)) os = 'Android';
  else if (/iPhone|iPad|iPod/i.test(ua)) os = 'iOS';
  else if (/Mac OS X|Macintosh/i.test(ua)) os = 'macOS';
  else if (/CrOS/i.test(ua)) os = 'ChromeOS';
  else if (/Linux/i.test(ua)) os = 'Linux';

  if (browser && os) return `${browser} on ${os}`;
  return browser || os || 'Unknown browser';
}

// "Burbank, US" from Cloudflare's approximate location for the visitor's IP address.
export function cfLocation(request) {
  const cf = request?.cf;
  if (!cf || typeof cf !== 'object') return '';
  const city = typeof cf.city === 'string' ? cf.city.slice(0, 60) : '';
  const country = typeof cf.country === 'string' ? cf.country.slice(0, 8) : '';
  if (city && country) return `${city}, ${country}`;
  return city || country || '';
}

// "Chrome on Windows · Burbank, US"
export function requestContext(request) {
  return [shortUA(request), cfLocation(request)].filter(Boolean).join(' · ').slice(0, 200);
}

// The place part ("Burbank, US") of a detail string written by requestContext, or ''.
export function placeFromDetail(detail) {
  const parts = String(detail || '').split(' · ');
  for (let i = parts.length - 1; i >= 0; i--) {
    const p = parts[i].trim();
    if (/^[^,·]{1,60}, [A-Z0-9]{2,8}$/.test(p) || /^[A-Z]{2}$/.test(p)) return p;
  }
  return '';
}
