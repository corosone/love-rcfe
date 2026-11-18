// Device report: everything a browser can say about the device it runs on, without asking the
// person for any permission. Used in two places:
//   - the developer sign-in (/corosone), for the code email and the activity log;
//   - the enquiry and call-request forms on the main site, so the developer console can show
//     the same report for each message ("Device details improve security." in the privacy
//     policy). It is only gathered once someone starts filling in a form, never on ordinary
//     page views, and staff never see it.
// Everything sent is checked field by field on the server (lib/deviceinfo.js).
//
// A device usually has a long (IPv6) and a short (IPv4) internet address, and the site only
// sees the one the browser connected with. These address-lookup services (ipify, icanhazip;
// listed in the privacy policy) each answer over one kind only, which is how the page finds
// the other. If none answers, everything works the same, just without it.
(function () {
  'use strict';

  const ADDRESS_SOURCES = {
    ipv4: ['https://ipv4.icanhazip.com/', 'https://api.ipify.org/'],
    ipv6: ['https://ipv6.icanhazip.com/', 'https://api6.ipify.org/']
  };
  const IPV4_TEXT_RE = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;
  const CLIENT_FRESH_MS = 5 * 60 * 1000;
  let clientInfo = null;   // filled in piece by piece as the answers arrive
  let clientReady = null;  // settles when every piece has arrived (or given up)
  let clientAt = 0;

  function looksLikeIp(kind, value) {
    if (kind === 'ipv4') return IPV4_TEXT_RE.test(value);
    if (!/^[0-9a-fA-F:]{3,45}$/.test(value) || !value.includes(':')) return false;
    try { return new URL('http://[' + value + ']/').hostname.length > 2; } catch (e) { return false; }
  }

  function askAddress(kind, url) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 4000);
    return fetch(url, { cache: 'no-store', credentials: 'omit', referrerPolicy: 'no-referrer', signal: ctrl.signal })
      .then((res) => (res.ok ? res.text() : ''))
      .then((body) => {
        const ip = String(body).slice(0, 60).trim();
        return looksLikeIp(kind, ip) ? ip : '';
      })
      .catch(() => '')
      .finally(() => clearTimeout(timer));
  }

  async function findAddress(kind) {
    for (const url of ADDRESS_SOURCES[kind]) {
      const ip = await askAddress(kind, url);
      if (ip) return ip;
    }
    return '';
  }

  // Everything the browser will say about itself without asking the person for permission.
  function readDeviceNow() {
    const d = {};
    const set = (key, read) => { try { const v = read(); if (v !== undefined && v !== null && v !== '') d[key] = v; } catch (e) {} };
    const media = (q) => window.matchMedia(q).matches;
    set('screenW', () => screen.width);
    set('screenH', () => screen.height);
    set('availW', () => screen.availWidth);
    set('availH', () => screen.availHeight);
    set('windowW', () => window.innerWidth);
    set('windowH', () => window.innerHeight);
    set('pixelRatio', () => Math.round(window.devicePixelRatio * 100) / 100);
    set('colorDepth', () => screen.colorDepth);
    set('orientation', () => screen.orientation.type);
    set('timezone', () => Intl.DateTimeFormat().resolvedOptions().timeZone);
    set('utcOffset', () => new Date().getTimezoneOffset());
    set('languages', () => Array.from(navigator.languages || [navigator.language]).slice(0, 8));
    set('platform', () => navigator.platform);
    set('vendor', () => navigator.vendor);
    set('cores', () => navigator.hardwareConcurrency);
    set('memory', () => navigator.deviceMemory);
    set('touchPoints', () => navigator.maxTouchPoints);
    set('cookies', () => navigator.cookieEnabled);
    set('dnt', () => (navigator.doNotTrack === '1' ? true : navigator.doNotTrack === '0' ? false : undefined));
    set('gpc', () => (typeof navigator.globalPrivacyControl === 'boolean' ? navigator.globalPrivacyControl : undefined));
    set('dark', () => media('(prefers-color-scheme: dark)'));
    set('reducedMotion', () => media('(prefers-reduced-motion: reduce)'));
    set('pdf', () => (typeof navigator.pdfViewerEnabled === 'boolean' ? navigator.pdfViewerEnabled : undefined));
    set('webdriver', () => (typeof navigator.webdriver === 'boolean' ? navigator.webdriver : undefined));
    set('online', () => navigator.onLine);
    set('pointer', () => (media('(pointer: fine)') ? 'fine' : media('(pointer: coarse)') ? 'coarse' : 'none'));
    set('hover', () => media('(hover: hover)'));
    set('referrer', () => document.referrer.slice(0, 200));
    set('netType', () => navigator.connection.effectiveType);
    set('netKind', () => navigator.connection.type);
    set('downlink', () => navigator.connection.downlink);
    set('rtt', () => navigator.connection.rtt);
    set('saveData', () => navigator.connection.saveData);
    // Graphics card name, as the browser's 3D drawing system reports it.
    try {
      const gl = document.createElement('canvas').getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        set('gpuVendor', () => String(gl.getParameter(ext ? ext.UNMASKED_VENDOR_WEBGL : gl.VENDOR)).slice(0, 80));
        set('gpu', () => String(gl.getParameter(ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER)).slice(0, 160));
        const lose = gl.getExtension('WEBGL_lose_context');
        if (lose) lose.loseContext();
      }
    } catch (e) {}
    return d;
  }

  // The parts that take a moment: exact operating system and browser versions, and battery.
  async function readDeviceSlow(into) {
    const jobs = [];
    try {
      const uad = navigator.userAgentData;
      if (uad && typeof uad.getHighEntropyValues === 'function') {
        if (typeof uad.mobile === 'boolean') into.mobile = uad.mobile;
        if (uad.platform) into.os = String(uad.platform);
        jobs.push(uad.getHighEntropyValues(['architecture', 'bitness', 'model', 'platformVersion', 'fullVersionList', 'formFactors', 'wow64']).then((h) => {
          if (h.platform) into.os = String(h.platform);
          if (h.platformVersion) into.osVersion = String(h.platformVersion);
          if (h.architecture) into.arch = String(h.architecture);
          if (h.bitness) into.bitness = String(h.bitness);
          if (h.model) into.model = String(h.model);
          if (typeof h.wow64 === 'boolean') into.wow64 = h.wow64;
          if (Array.isArray(h.formFactors)) into.formFactors = h.formFactors.map(String).slice(0, 4);
          if (Array.isArray(h.fullVersionList)) into.brands = h.fullVersionList.slice(0, 6).map((b) => ({ brand: String(b.brand), version: String(b.version) }));
        }).catch(() => {}));
      }
    } catch (e) {}
    try {
      if (typeof navigator.getBattery === 'function') {
        jobs.push(navigator.getBattery().then((b) => {
          if (typeof b.level === 'number') into.batteryLevel = Math.round(b.level * 100);
          if (typeof b.charging === 'boolean') into.charging = b.charging;
        }).catch(() => {}));
      }
    } catch (e) {}
    await Promise.all(jobs);
  }

  // Starts collecting (or reuses a recent collection). Never throws.
  function gatherClient() {
    if (clientReady && Date.now() - clientAt < CLIENT_FRESH_MS) return clientReady;
    clientAt = Date.now();
    let info;
    try { info = readDeviceNow(); } catch (e) { info = {}; }
    clientInfo = info;
    clientReady = Promise.all([
      findAddress('ipv4').then((ip) => { if (ip) info.ipv4 = ip; }),
      findAddress('ipv6').then((ip) => { if (ip) info.ipv6 = ip; }),
      readDeviceSlow(info)
    ]).catch(() => {});
    return clientReady;
  }

  // What has been collected so far, waiting at most `ms` for the slower answers. Sign-in is
  // never held up for longer than that: whatever has not arrived is simply left out.
  async function clientSnapshot(ms) {
    try {
      await Promise.race([gatherClient(), new Promise((resolve) => setTimeout(resolve, ms))]);
      return JSON.parse(JSON.stringify(clientInfo || {}));
    } catch (e) {
      return {};
    }
  }

  window.LoveDeviceReport = {
    // Starts gathering (or reuses one from the last 5 minutes). Never throws.
    start: gatherClient,
    // What has been gathered so far, waiting at most `ms` for the slower parts.
    snapshot: clientSnapshot,
  };
})();
