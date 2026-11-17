// Developer console (/corosone).
// Sign-in takes three things: the developer email, the developer password, and a 6-digit
// code emailed to the verification address. All checks happen on the server
// (functions/api/dev/* and lib/dev.js); this file only drives the page.
// Everything that comes from the server is shown with textContent (never as HTML).
(function () {
  'use strict';

  // Apply saved dark-mode preference immediately in <head> before <body> paints
  try {
    if (localStorage.getItem('lovercfe_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}

  const loginGate = window.LoveTurnstile ? window.LoveTurnstile.mount('ts-dev') : null;
  let signedIn = false;
  let lastOverview = null;
  let blockedIps = new Set(); // addresses blocked from the forms and staff inbox
  let yourIp = '';            // the address this console is being used from

  const $ = (id) => document.getElementById(id);
  const has = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('lovercfe_theme', dark ? 'dark' : 'light'); } catch (e) {}
    syncThemeButton();
  }

  function syncThemeButton() {
    const btn = $('theme-btn');
    if (!btn) return;
    const dark = document.documentElement.classList.contains('dark');
    btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
    btn.innerHTML = dark ? '<i data-lucide="sun" class="w-4 h-4"></i>' : '<i data-lucide="moon" class="w-4 h-4"></i>';
    refreshIcons();
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: { 'Content-Type': 'application/json', ...(options.headers || {}) }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error || data.message || 'Request failed'), { status: res.status, data });
    }
    return data;
  }

  // ---------- Small DOM helpers (text only) ----------
  function el(tag, opts = {}, children = []) {
    const node = document.createElement(tag);
    if (opts.className) node.className = opts.className;
    if (opts.text !== undefined) node.textContent = String(opts.text);
    if (opts.title) node.title = String(opts.title);
    if (opts.attrs) Object.entries(opts.attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
    children.forEach((c) => { if (c) node.appendChild(c); });
    return node;
  }

  function td(content, className) {
    const cell = el('td', { className });
    if (content instanceof Node) cell.appendChild(content);
    else cell.textContent = content === null || content === undefined ? '' : String(content);
    return cell;
  }

  function emptyRow(body, colSpan, text) {
    body.textContent = '';
    const tr = el('tr');
    const cell = td(text);
    cell.colSpan = colSpan;
    cell.className = 'text-brand-muted';
    tr.appendChild(cell);
    body.appendChild(tr);
  }

  const formatTime = (sec) => new Date(Number(sec) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });
  const formatIso = (iso) => {
    const d = new Date(iso);
    return isNaN(d) ? String(iso || '') : d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  };
  const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

  // ---------- Views ----------
  function showView(name) {
    ['login-view', 'code-view', 'console-view'].forEach((id) => {
      $(id).classList.toggle('hidden', id !== name);
    });
    signedIn = name === 'console-view';
    $('signout-btn').classList.toggle('hidden', !signedIn);
    $('inbox-link').classList.toggle('hidden', !signedIn);
  }

  function showLogin(message = '') {
    showView('login-view');
    gatherClient(); // start early so it is ready by the time the form is filled in
    $('login-error').textContent = message;
    $('dev-password').value = '';
    $('dev-code').value = '';
    $('code-error').textContent = '';
  }

  function showCodeStep() {
    showView('code-view');
    $('dev-password').value = '';
    $('dev-code').value = '';
    $('code-error').textContent = '';
    setTimeout(() => { try { $('dev-code').focus(); } catch (e) {} }, 50);
  }

  function sessionEnded() {
    showLogin('Your session has ended. Please sign in again.');
  }

  // ---------- Device details for the sign-in email and the activity log ----------
  // The developer sign-in is the most sensitive door on the site, so every attempt records
  // as much as possible about the device that made it. The server already sees one address,
  // the location Cloudflare estimates for it, and what the browser sends with every request.
  // This part adds what only the browser itself can tell: the device's OTHER address, its
  // screen, processor, graphics card and so on. It is sent with the sign-in, checked field by
  // field on the server (lib/deviceinfo.js), and shown only in the code email and this console.
  //
  // A device usually has a long (IPv6) and a short (IPv4) address, and the site only sees the
  // one the browser connected with. These services answer over one kind only, which is how the
  // page finds the other. If none answers, sign-in works exactly the same, just without it.
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

  // ---------- Step 1: email + password ----------
  async function submitLogin(e) {
    e.preventDefault();
    const email = $('dev-email').value.trim();
    const password = $('dev-password').value;
    const btn = $('login-submit');
    const errorEl = $('login-error');
    if (!email || !password) {
      errorEl.textContent = 'Please enter your email and password.';
      return;
    }
    btn.disabled = true;
    errorEl.textContent = '';
    let sent = false;
    try {
      // Wait for the hidden security check (usually instant; it only shows a box if Cloudflare needs one).
      let token = '';
      if (loginGate) {
        const check = await loginGate.getToken();
        if (!check.token && check.reason !== 'unavailable') {
          errorEl.textContent = loginGate.message(check.reason);
          return;
        }
        token = check.token;
      }
      const client = await clientSnapshot(2500);
      sent = true;
      await apiFetch('/api/dev/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, turnstile_token: token, client })
      });
      showCodeStep();
    } catch (err) {
      errorEl.textContent = err.message;
    } finally {
      btn.disabled = false;
      // Each security-check token works only once, so get a fresh one for the next attempt.
      if (sent && loginGate) loginGate.reset();
    }
  }

  // ---------- Step 2: emailed code ----------
  async function submitCode(e) {
    e.preventDefault();
    const code = $('dev-code').value.replace(/\D/g, '');
    const btn = $('code-submit');
    const errorEl = $('code-error');
    if (code.length !== 6) {
      errorEl.textContent = 'Enter the 6-digit code from the email.';
      return;
    }
    btn.disabled = true;
    errorEl.textContent = '';
    try {
      const client = await clientSnapshot(1500);
      await apiFetch('/api/dev/verify', { method: 'POST', body: JSON.stringify({ code, client }) });
      $('dev-code').value = '';
      await loadOverview();
      loadTabData(currentTab);
    } catch (err) {
      if (err.data && err.data.restart) {
        showLogin(err.message);
      } else {
        errorEl.textContent = err.message;
        $('dev-code').select();
      }
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Tabs ----------
  const TABS = ['overview', 'security', 'leads', 'requests', 'site', 'activity'];
  let currentTab = 'overview';
  const loadedTabs = new Set();

  function setTab(name, { focus = false, load = true } = {}) {
    if (!TABS.includes(name)) name = 'overview';
    currentTab = name;
    TABS.forEach((t) => {
      const tab = $('tab-' + t);
      const selected = t === name;
      tab.setAttribute('aria-selected', selected ? 'true' : 'false');
      tab.tabIndex = selected ? 0 : -1;
      $('panel-' + t).classList.toggle('hidden', !selected);
    });
    if (focus) $('tab-' + name).focus();
    try { sessionStorage.setItem('lovercfe_dev_tab', name); } catch (e) {}
    if (signedIn && load) loadTabData(name);
  }

  // The Enquiries and Requests tabs fetch fresh data each time they are opened
  // (keeping whatever search was last used there).
  function loadTabData(name) {
    if (!signedIn) return;
    if (name === 'leads') { loadedTabs.add(name); loadLeads(leadsQuery); }
    if (name === 'requests') { loadedTabs.add(name); loadRequests(requestsQuery); }
  }

  function onTabKey(e) {
    const i = TABS.indexOf(currentTab);
    if (e.key === 'ArrowRight') { e.preventDefault(); setTab(TABS[(i + 1) % TABS.length], { focus: true }); }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); setTab(TABS[(i - 1 + TABS.length) % TABS.length], { focus: true }); }
    else if (e.key === 'Home') { e.preventDefault(); setTab(TABS[0], { focus: true }); }
    else if (e.key === 'End') { e.preventDefault(); setTab(TABS[TABS.length - 1], { focus: true }); }
  }

  // ---------- Overview ----------
  const EVENT_LABELS = {
    code_sent: 'Password accepted, code emailed',
    signed_in: 'Signed in',
    signed_out: 'Signed out',
    wrong_password: 'Wrong email or password',
    wrong_code: 'Wrong code entered',
    code_limit: 'Code email limit reached',
    email_failed: 'Code email could not be sent',
    blocked_locked: 'Blocked: developer sign-in is locked',
    staff_signed_in: 'Staff signed in',
    staff_signed_out: 'Staff signed out',
    staff_wrong_password: 'Staff: wrong password',
    staff_locked_out: 'Staff: blocked after too many wrong passwords',
    export_leads: 'Downloaded enquiries spreadsheet',
    backup_download: 'Downloaded full backup',
    restore_leads: 'Tool: restored enquiries from a backup',
    staff_marked_spam: 'Inbox: message marked as spam (sent from)',
    signout_staff: 'Tool: signed out all staff',
    clear_lockouts: 'Tool: cleared sign-in lockouts',
    test_lead_email: 'Tool: sent test enquiry email',
    test_code_email: 'Tool: sent test code email',
    signout_other_devs: 'Tool: signed out other developer devices',
    lock_dev: 'Tool: locked developer sign-in',
    unlock_dev: 'Tool: unlocked developer sign-in',
    delete_leads: 'Tool: deleted enquiries',
    purge_old_leads: 'Tool: deleted old enquiries',
    clear_activity: 'Tool: cleared activity log',
    cleanup_records: 'Tool: cleaned up old records',
    clear_requests: 'Tool: cleared request log',
    pause_requests: 'Tool: paused request logging',
    resume_requests: 'Tool: resumed request logging',
    block_ip: 'Tool: blocked an IP address',
    unblock_ip: 'Tool: unblocked an IP address'
  };

  const FAILURE_LABELS = [
    ['staff_wrong_password', 'Staff inbox: wrong password'],
    ['staff_locked_out', 'Staff inbox: blocked after too many wrong passwords'],
    ['wrong_password', 'Developer: wrong email or password'],
    ['wrong_code', 'Developer: wrong code'],
    ['blocked_locked', 'Developer: blocked because sign-in is locked'],
    ['code_limit', 'Developer: code email limit reached']
  ];

  function configRows(config) {
    const rows = [];
    rows.push(config.staffPasswordSet
      ? ['ok', 'Staff password is set']
      : ['bad', 'Staff password (INBOX_PASSWORD) is missing: the staff inbox cannot be opened']);
    rows.push(config.turnstileSecretSet
      ? ['ok', 'Security check secret is set']
      : ['bad', 'Security check secret (TURNSTILE_SECRET) is missing']);
    rows.push(config.requireTurnstile
      ? ['ok', 'Security check is always required']
      : ['warn', 'REQUIRE_TURNSTILE is not "true": forms would work without the check if the secret went missing']);
    if (config.leadEmailsConfigured) rows.push(['ok', 'Enquiry notification emails are set up']);
    else if (config.leadEmailsMisconfigured) rows.push(['bad', 'FORMSPREE_ENDPOINT is not a valid Formspree form address: no enquiry emails are sent']);
    else rows.push(['warn', 'FORMSPREE_ENDPOINT is not set: enquiries are saved but no emails are sent']);
    rows.push(['ok', 'Sign-in codes are emailed through ' + (config.codeEmailProvider === 'formspree' ? 'Formspree' : 'Resend')]);
    rows.push(config.separateCodeEmail
      ? ['ok', 'Sign-in codes go to a separate email address']
      : ['warn', 'Sign-in codes go to the same address as the sign-in email (set DEV_CODE_EMAIL to separate them)']);
    rows.push(config.leadRetentionDays
      ? ['ok', 'Old enquiries are deleted automatically after ' + config.leadRetentionDays + ' days']
      : ['warn', 'Old enquiries are kept forever (LEAD_RETENTION_DAYS is not set)']);
    return rows;
  }

  function statusList(list, rows) {
    list.textContent = '';
    rows.forEach(([level, text]) => {
      const dot = el('span', { className: 'status-dot status-' + level, attrs: { 'aria-hidden': 'true' } });
      const label = el('span', { text: (level === 'ok' ? '' : level === 'warn' ? 'Note: ' : 'Problem: ') + text });
      list.appendChild(el('li', { className: 'flex items-baseline' }, [dot, label]));
    });
  }

  function renderOverview(data) {
    lastOverview = data;
    blockedIps = new Set((Array.isArray(data.blocks) ? data.blocks : []).map((b) => b.ip));
    yourIp = String(data.yourIp || '');
    renderBlocks(Array.isArray(data.blocks) ? data.blocks : []);
    const sec = data.security || {};
    $('stat-total').textContent = data.leads.total;
    $('stat-open').textContent = data.leads.open;
    $('stat-week').textContent = data.leads.lastWeek;
    $('stat-staff').textContent = sec.staffSessions;
    $('stat-lockouts').textContent = sec.activeLockouts;
    $('session-info').textContent = 'Signed in as developer. This session ends at '
      + new Date(Number(data.session.expiresAt) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      + ', or when you sign out.';

    statusList($('config-list'), configRows(data.config || {}));

    // Failed sign-ins
    const f = sec.failures || {};
    const day = (k) => Number((f[k] || {}).day || 0);
    const week = (k) => Number((f[k] || {}).week || 0);
    const staffDay = day('staff_wrong_password') + day('staff_locked_out');
    const devDay = day('wrong_password') + day('wrong_code') + day('blocked_locked') + day('code_limit');
    const level = (n) => (n === 0 ? 'ok' : n < 10 ? 'warn' : 'bad');
    statusList($('overview-failures'), [
      [level(staffDay), staffDay ? `${plural(staffDay, 'failed staff sign-in', 'failed staff sign-ins')} in the last 24 hours` : 'No failed staff sign-ins in the last 24 hours'],
      [level(devDay), devDay ? `${plural(devDay, 'failed developer sign-in', 'failed developer sign-ins')} in the last 24 hours` : 'No failed developer sign-ins in the last 24 hours'],
      [sec.devLocked ? 'warn' : 'ok', sec.devLocked ? 'Developer sign-in is locked' : 'Developer sign-in is open (email, password and code required)']
    ]);

    const fb = $('failures-body');
    fb.textContent = '';
    FAILURE_LABELS.forEach(([key, label]) => {
      fb.appendChild(el('tr', {}, [td(label), td(day(key), 'dv-num'), td(week(key), 'dv-num')]));
    });
    const sources = Array.isArray(sec.failureSources) ? sec.failureSources : [];
    if (!sources.length) emptyRow($('sources-body'), 5, 'No failed sign-ins in the last 7 days.');
    else {
      const sb = $('sources-body');
      sb.textContent = '';
      sources.forEach((s) => {
        sb.appendChild(el('tr', {}, [td(ipButton(s.ip)), td(s.count, 'dv-num'), td(s.place || 'Unknown'), td(formatTime(s.last)), td(blockAction(s.ip))]));
      });
    }

    // Lock and sessions
    const locked = Boolean(sec.devLocked);
    $('lock-banner').classList.toggle('hidden', !locked);
    $('lock-banner-text').textContent = locked
      ? `Since ${sec.devLockedSince ? formatTime(sec.devLockedSince) : 'earlier'}. Nobody can sign in to this console until you unlock it. You are still signed in here.`
      : '';
    $('lock-state').textContent = locked
      ? 'Locked. New developer sign-ins are blocked.'
      : 'Open. Signing in needs your email, password and the emailed code.';
    $('lock-btn').classList.toggle('hidden', locked);
    $('unlock-btn').classList.toggle('hidden', !locked);
    const others = Math.max(0, Number(sec.developerSessions || 0) - 1);
    $('sessions-state').textContent = `${plural(Number(sec.staffSessions || 0), 'staff session', 'staff sessions')} active. `
      + (others ? `${plural(others, 'other developer device is', 'other developer devices are')} signed in besides this one.` : 'No other developer devices are signed in.');

    // Old enquiries (LEAD_RETENTION_DAYS)
    const oldEl = $('old-leads');
    oldEl.textContent = '';
    const keep = data.leads.retentionDays;
    const old = Number(data.leads.olderThanRetention || 0);
    if (keep) {
      oldEl.appendChild(el('span', { text: old ? `${plural(old, 'enquiry is', 'enquiries are')} older than ${keep} days and will be deleted automatically over time.` : `No enquiries are older than ${keep} days.` }));
      if (old) oldEl.appendChild(el('button', { className: 'dv-btn dv-btn-danger', text: 'Delete them now', attrs: { type: 'button', 'data-tool': 'purge_old_leads' } }));
      oldEl.classList.remove('hidden');
    } else {
      oldEl.classList.add('hidden');
    }

    // Request logging switch
    const paused = Boolean(data.requestLog && data.requestLog.paused);
    $('requests-paused').classList.toggle('hidden', !paused);
    const pauseBtn = $('pause-btn');
    pauseBtn.textContent = paused ? 'Resume logging' : 'Pause logging';
    pauseBtn.setAttribute('data-tool', paused ? 'resume_requests' : 'pause_requests');

    renderActivity();
  }

  // ---------- Activity ----------
  let activityFilter = 'all';
  function renderActivity() {
    const body = $('activity-body');
    const all = lastOverview && Array.isArray(lastOverview.activity) ? lastOverview.activity : [];
    const isStaff = (e) => String(e || '').startsWith('staff_');
    const list = all.filter((item) => activityFilter === 'all' || (activityFilter === 'staff') === isStaff(item.event));
    if (!list.length) { emptyRow(body, 5, 'No activity yet.'); return; }
    body.textContent = '';
    list.forEach((item) => {
      const label = has(EVENT_LABELS, item.event) ? EVENT_LABELS[item.event] : String(item.event || '');
      let detail = item.detail || '';
      if (item.event === 'staff_marked_spam') {
        // The detail starts with the address the spam was sent from: offer to block it.
        const sender = String(detail).split(' · ')[0];
        if (/^[0-9a-f:.]{3,45}$/i.test(sender) && /[.:]/.test(sender)) {
          const action = blockAction(sender);
          detail = el('span', {}, [el('span', { text: detail + ' ' }), typeof action === 'string' ? el('span', { className: 'text-brand-muted', text: action }) : action]);
        }
      }
      // Both addresses when known: the one the site saw, and the device's other one underneath.
      const ipCell = el('div', {}, [el('div', { className: 'dv-mono', text: item.ip || '' })]);
      if (item.otherIp && item.otherIp.ip) {
        ipCell.appendChild(el('div', {
          className: 'dv-mono text-brand-muted',
          text: `${item.otherIp.kind === 'long' ? 'long' : 'short'}: ${item.otherIp.ip}`,
          title: 'The device\'s other address, as reported by its browser'
        }));
      }
      let more = '';
      if (item.hasInfo) {
        more = el('button', { className: 'dv-btn', text: 'Details', attrs: { type: 'button', 'aria-expanded': 'false' } });
        more.addEventListener('click', () => toggleActivityDetail(item, row, more));
      }
      const row = el('tr', {}, [td(formatTime(item.at)), td(label), td(ipCell), td(detail), td(more)]);
      body.appendChild(row);
      if (openActivityId === item.id && item.hasInfo) toggleActivityDetail(item, row, more, { keepOpen: true });
    });
  }

  // The "Details" panel under an activity row: both addresses (with Block buttons) and
  // everything known about the device. Loaded only when asked for.
  let openActivityId = null;
  const activityDetailCache = new Map();

  function closeActivityDetail() {
    const open = document.getElementById('activity-detail-row');
    if (open) open.remove();
    document.querySelectorAll('#activity-body button[aria-expanded="true"]').forEach((b) => { b.setAttribute('aria-expanded', 'false'); b.textContent = 'Details'; });
  }

  async function toggleActivityDetail(item, row, button, { keepOpen = false } = {}) {
    const wasOpen = button.getAttribute('aria-expanded') === 'true';
    closeActivityDetail();
    if (wasOpen && !keepOpen) { openActivityId = null; return; }
    openActivityId = item.id;
    button.setAttribute('aria-expanded', 'true');
    button.textContent = 'Hide';
    const cell = el('td', { attrs: { colspan: '5' } });
    const holder = el('div', { className: 'dv-detail', text: 'Loading…' });
    cell.appendChild(holder);
    const detailRow = el('tr', { attrs: { id: 'activity-detail-row' } }, [cell]);
    row.after(detailRow);
    fitActivityDetail();
    try {
      let data = activityDetailCache.get(item.id);
      if (!data) {
        data = await apiFetch('/api/dev/overview?detail=' + encodeURIComponent(item.id));
        activityDetailCache.set(item.id, data);
        if (activityDetailCache.size > 200) activityDetailCache.delete(activityDetailCache.keys().next().value);
      }
      if (openActivityId !== item.id || !detailRow.isConnected) return;
      renderActivityDetail(holder, data);
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      holder.textContent = err.message || 'Could not load the details.';
    }
  }

  // Keeps the panel exactly as wide as the visible part of the table. On a phone the table is
  // wider than the screen and scrolls sideways inside its box; the panel should not.
  function fitActivityDetail() {
    const holder = document.querySelector('#activity-detail-row .dv-detail');
    if (!holder) return;
    const scroller = holder.closest('.dev-scroll');
    if (scroller && scroller.clientWidth > 40) holder.style.width = (scroller.clientWidth - 20) + 'px';
  }
  window.addEventListener('resize', fitActivityDetail);

  function renderActivityDetail(holder, data) {
    holder.textContent = '';
    const addresses = Array.isArray(data.addresses) ? data.addresses : [];
    const sections = Array.isArray(data.sections) ? data.sections : [];
    if (!sections.length) { holder.textContent = 'No device details were stored for this entry.'; return; }

    if (addresses.length) {
      const box = el('div', { className: 'dv-detail-addr' });
      addresses.forEach((a) => {
        const action = blockAction(a.ip);
        const line = el('div', { className: 'dv-detail-addr-line' }, [
          el('span', { className: 'dv-detail-label', text: a.kind === 'long' ? 'Long address (IPv6)' : 'Short address (IPv4)' }),
          ipButton(a.ip),
          el('span', { className: 'dv-chip ' + (a.source === 'seen' ? 'dv-chip-view' : 'dv-chip-note'), text: a.source === 'seen' ? 'Seen by the site' : 'Reported by the browser' }),
          typeof action === 'string' ? null : action
        ]);
        box.appendChild(line);
      });
      const long = addresses.find((a) => a.kind === 'long');
      box.appendChild(el('p', { className: 'dv-help', text: long
        ? 'To block this device, block its long address: that blocks the whole home or phone network it belongs to, so it stays blocked when the device changes its address. Block the short address as well if you want to cover both ways in.'
        : 'Only a short address is known for this entry. Blocking it blocks that exact address.' }));
      holder.appendChild(box);
    }

    sections.forEach((section) => {
      if (section.title === 'Addresses') return; // shown above, with buttons
      const list = el('dl', { className: 'dv-detail-list' });
      (Array.isArray(section.rows) ? section.rows : []).forEach((pair) => {
        list.appendChild(el('dt', { text: pair[0] }));
        list.appendChild(el('dd', { text: pair[1] }));
      });
      holder.appendChild(el('div', { className: 'dv-detail-section' }, [el('h3', { text: section.title }), list]));
    });
  }

  // Loads the console. Returns true when signed in.
  async function loadOverview({ silent = false } = {}) {
    try {
      const data = await apiFetch('/api/dev/overview');
      renderOverview(data);
      showView('console-view');
      $('console-status').textContent = '';
      refreshIcons();
      return true;
    } catch (err) {
      if (err.status === 401) {
        const wasSignedIn = signedIn;
        loadedTabs.clear();
        showLogin(wasSignedIn ? 'Your session has ended. Please sign in again.' : '');
      } else if (signedIn) {
        $('console-status').textContent = err.message;
      } else if (!silent) {
        showLogin(err.message);
      }
      return false;
    }
  }

  // ---------- Tools ----------
  function setStatus(kind, text) {
    const s = $('tool-status');
    s.className = 'dv-status' + (kind === 'ok' ? ' is-ok' : kind === 'bad' ? ' is-bad' : ' is-busy');
    s.textContent = text;
    s.classList.toggle('hidden', !text);
  }

  const TOOL_CONFIRM = {
    signout_staff: 'Sign out every staff member from the inbox now?',
    clear_lockouts: 'Clear all sign-in lockouts now?',
    test_lead_email: 'Send a test email through the enquiry notification form? It counts toward the Formspree monthly limit.',
    test_code_email: 'Send a test email (with no code) to your verification address?',
    signout_other_devs: 'Sign out every other device that is signed in to this console? This device stays signed in.',
    lock_dev: 'Lock the developer sign-in?\n\nNobody (including you on other devices) will be able to sign in to this console until you unlock it from here, or change DEV_PASSWORD in Cloudflare. Your other developer devices will be signed out.',
    unlock_dev: 'Unlock the developer sign-in? Signing in will again need your email, password and the emailed code.',
    purge_old_leads: 'Permanently delete every enquiry older than the LEAD_RETENTION_DAYS setting? This cannot be undone. Consider downloading the spreadsheet first.',
    cleanup_records: 'Remove expired sessions and codes, finished lockouts and old rate-limit counters?',
    clear_requests: 'Delete the whole request log? This cannot be undone.',
    pause_requests: 'Pause request logging? Nothing new will be recorded until you resume it.',
    resume_requests: 'Resume request logging?'
  };
  const ACTIVITY_CONFIRM = {
    older30: 'Delete activity log entries older than 30 days?',
    all: 'Delete the whole activity log? This cannot be undone. One entry will be kept saying the log was cleared.'
  };
  const LEAD_TOOLS = ['purge_old_leads', 'delete_leads'];
  const REQUEST_TOOLS = ['clear_requests', 'pause_requests', 'resume_requests'];

  async function callTool(name, options) {
    const body = options ? { action: name, options } : { action: name };
    return apiFetch('/api/dev/action', { method: 'POST', body: JSON.stringify(body) });
  }

  async function runTool(button) {
    const name = button.getAttribute('data-tool');
    let options;
    let question;
    if (name === 'clear_activity') {
      const mode = button.getAttribute('data-mode');
      if (!has(ACTIVITY_CONFIRM, mode)) return;
      options = { mode };
      question = ACTIVITY_CONFIRM[mode];
    } else if (has(TOOL_CONFIRM, name)) {
      question = TOOL_CONFIRM[name];
    } else {
      return;
    }
    if (!confirm(question)) return;
    setStatus('busy', 'Working…');
    button.disabled = true;
    try {
      if (name === 'test_code_email') options = { client: await clientSnapshot(2500) };
      const data = await callTool(name, options);
      setStatus('ok', data.message || 'Done.');
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      setStatus('bad', err.message);
    } finally {
      button.disabled = false;
    }
    await loadOverview();
    if (LEAD_TOOLS.includes(name) && loadedTabs.has('leads')) loadLeads(leadsQuery);
    if (REQUEST_TOOLS.includes(name) && loadedTabs.has('requests')) loadRequests();
  }

  async function signOut() {
    // /api/admin/session is the address that also receives this browser's staff inbox cookie
    // (it is only sent to /api/admin), so the staff session is ended on the server too, not
    // just removed from this browser. /api/dev/session then makes sure the developer session
    // ends even if the first request was refused (for example from a blocked address).
    try {
      await apiFetch('/api/admin/session', { method: 'DELETE' });
    } catch (e) {}
    try {
      await apiFetch('/api/dev/session', { method: 'DELETE' });
    } catch (e) {}
    signedIn = false;
    loadedTabs.clear();
    setStatus('', '');
    showLogin('');
  }

  // ---------- Enquiries ----------
  let leadsQuery = { q: '', spam: false };
  const selectedLeads = new Set();
  let shownLeadIds = [];
  let leadsSeq = 0; // only the newest search may update the table

  async function loadLeads(query = leadsQuery) {
    leadsQuery = { q: String(query.q || ''), spam: Boolean(query.spam) };
    const info = $('leads-info');
    info.textContent = 'Loading…';
    const params = new URLSearchParams();
    if (leadsQuery.q) params.set('q', leadsQuery.q);
    if (leadsQuery.spam) params.set('spam', '1');
    const seq = ++leadsSeq;
    try {
      const data = await apiFetch('/api/dev/leads' + (params.toString() ? '?' + params : ''));
      if (seq !== leadsSeq) return;
      renderLeads(data);
    } catch (err) {
      if (seq !== leadsSeq) return;
      if (err.status === 401) { sessionEnded(); return; }
      info.textContent = err.message;
    }
  }

  function renderLeads(data) {
    const body = $('leads-body');
    const leads = Array.isArray(data.leads) ? data.leads : [];
    selectedLeads.clear();
    shownLeadIds = leads.map((l) => Number(l.id));
    $('leads-check-all').checked = false;
    updateDeleteButton();
    let summary;
    if (leadsQuery.spam) {
      summary = leads.length
        ? `${plural(leads.length, 'enquiry looks', 'enquiries look')} like spam (checked the newest ${data.spamChecked}). These are guesses, so check before deleting.`
        : `No likely spam found in the newest ${data.spamChecked} enquiries.`;
    } else if (leadsQuery.q) {
      summary = `${plural(leads.length, 'match', 'matches')} for "${leadsQuery.q}"${data.more ? ' (showing the newest 200)' : ''}.`;
    } else {
      summary = `Showing the newest ${leads.length} of ${data.total} enquiries.`;
    }
    $('leads-info').textContent = summary;
    if (!leads.length) { emptyRow(body, 7, leadsQuery.spam ? 'Nothing looks like spam.' : 'No enquiries found.'); return; }
    body.textContent = '';
    leads.forEach((l) => {
      const id = Number(l.id);
      const box = el('input', { attrs: { type: 'checkbox', 'aria-label': `Select enquiry from ${l.name || 'unknown'}` } });
      box.addEventListener('change', () => {
        if (box.checked) selectedLeads.add(id); else selectedLeads.delete(id);
        tr.classList.toggle('is-selected', box.checked);
        updateDeleteButton();
      });
      const contact = el('div', {}, [
        el('div', { className: 'dv-mono', text: l.email || '' }),
        el('div', { className: 'text-brand-muted', text: l.phone || '' })
      ]);
      const nameCell = el('div', {}, [
        el('div', { className: 'font-semibold', text: l.name || '' }),
        el('div', { className: 'text-brand-muted', text: [l.kind === 'call_request' ? 'Call request' : 'Enquiry', l.city].filter(Boolean).join(' · ') })
      ]);
      const msg = el('div', { className: 'dv-msg', text: (l.message || '') + (l.messageCut ? '…' : '') });
      const flags = el('div');
      (Array.isArray(l.flags) ? l.flags : []).forEach((f) => flags.appendChild(el('span', { className: 'dv-chip', text: f })));
      if (!flags.childNodes.length) flags.appendChild(el('span', { className: 'text-brand-muted', text: 'None' }));
      // Clicking the IP address opens the Requests tab showing everything else it did.
      const from = l.ip
        ? el('div', {}, [ipButton(l.ip), el('div', { className: 'text-brand-muted', text: l.ipPlace || 'Unknown location' }), (() => { const a = blockAction(l.ip); if (!a) return null; const w = el('div', { attrs: { style: 'margin-top:0.35rem' } }); w.appendChild(typeof a === 'string' ? document.createTextNode(a) : a); return w; })()])
        : el('span', { className: 'text-brand-muted', text: 'Not recorded', title: 'Sent before IP addresses were saved' });
      const tr = el('tr', {}, [td(box), td(formatIso(l.createdAt)), td(nameCell), td(contact), td(from), td(msg), td(flags)]);
      body.appendChild(tr);
    });
  }

  function updateDeleteButton() {
    const n = selectedLeads.size;
    const btn = $('leads-delete');
    btn.disabled = n === 0;
    btn.textContent = n ? `Delete selected (${n})` : 'Delete selected';
  }

  function toggleAllLeads(checked) {
    selectedLeads.clear();
    if (checked) shownLeadIds.forEach((id) => selectedLeads.add(id));
    document.querySelectorAll('#leads-body input[type="checkbox"]').forEach((box) => {
      box.checked = checked;
      const row = box.closest('tr');
      if (row) row.classList.toggle('is-selected', checked);
    });
    updateDeleteButton();
  }

  async function deleteSelectedLeads() {
    const ids = [...selectedLeads];
    if (!ids.length) return;
    if (!confirm(`Permanently delete ${plural(ids.length, 'enquiry', 'enquiries')}? This cannot be undone.`)) return;
    const btn = $('leads-delete');
    btn.disabled = true;
    setStatus('busy', 'Deleting…');
    let deleted = 0;
    try {
      // The server accepts up to 50 at a time.
      for (let i = 0; i < ids.length; i += 50) {
        const data = await callTool('delete_leads', { ids: ids.slice(i, i + 50) });
        const m = /Deleted (\d+)/.exec(data.message || '');
        deleted += m ? Number(m[1]) : 0;
      }
      setStatus('ok', `Deleted ${plural(deleted, 'enquiry', 'enquiries')}.`);
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      setStatus('bad', (deleted ? `Deleted ${deleted}, then: ` : '') + err.message);
    }
    await loadLeads(leadsQuery);
    loadOverview();
  }

  async function exportLeads() {
    const btn = $('export-btn');
    btn.disabled = true;
    setStatus('busy', 'Preparing the spreadsheet…');
    try {
      const res = await fetch('/api/dev/leads-export', { credentials: 'same-origin' });
      if (res.status === 401) { sessionEnded(); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The download failed.');
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
      const url = URL.createObjectURL(blob);
      const a = el('a', { attrs: { href: url, download: match ? match[1] : 'love-rcfe-enquiries.csv' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('ok', 'Spreadsheet downloaded. It contains personal information, so keep it somewhere safe and delete it when you no longer need it.');
      loadOverview();
    } catch (err) {
      setStatus('bad', err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Backups ----------
  async function downloadBackup() {
    const btn = $('backup-btn');
    btn.disabled = true;
    setStatus('busy', 'Preparing the backup…');
    try {
      const res = await fetch('/api/dev/backup', { credentials: 'same-origin' });
      if (res.status === 401) { sessionEnded(); return; }
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'The backup failed.');
      }
      const blob = await res.blob();
      const match = /filename="([^"]+)"/.exec(res.headers.get('content-disposition') || '');
      const url = URL.createObjectURL(blob);
      const a = el('a', { attrs: { href: url, download: match ? match[1] : 'love-rcfe-backup.json' } });
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
      setStatus('ok', 'Backup downloaded. It contains personal information, so keep it somewhere safe (not in a shared or public folder).');
      loadOverview();
    } catch (err) {
      setStatus('bad', err.message);
    } finally {
      btn.disabled = false;
    }
  }

  const RESTORE_BATCH = 25; // the server accepts up to 25 enquiries per request
  let restoring = false;

  async function restoreFromFile(file) {
    if (!file || restoring) return;
    const progress = $('restore-progress');
    progress.textContent = '';
    let backup;
    try {
      if (file.size > 60 * 1024 * 1024) throw new Error('too big');
      backup = JSON.parse(await file.text());
    } catch (e) {
      setStatus('bad', 'That file could not be read. Choose a backup file downloaded from this page (its name starts with "love-rcfe-backup").');
      return;
    }
    const leads = backup && backup.format === 'love-rcfe-backup' && backup.tables && Array.isArray(backup.tables.leads) ? backup.tables.leads : null;
    if (!leads) {
      setStatus('bad', 'That is not a Love RCFE backup file. Choose a file downloaded with "Download full backup".');
      return;
    }
    if (!leads.length) { setStatus('bad', 'That backup file has no enquiries in it.'); return; }
    const made = backup.createdAt && !isNaN(new Date(backup.createdAt)) ? formatIso(backup.createdAt) : 'an unknown date';
    if (!confirm(`This backup was made on ${made} and has ${plural(leads.length, 'enquiry', 'enquiries')}.\n\nAdd back any that are missing from the site now? Nothing is changed or deleted.`)) return;

    restoring = true;
    $('restore-btn').disabled = true;
    let added = 0, skipped = 0, invalid = 0;
    setStatus('busy', 'Restoring…');
    try {
      for (let i = 0; i < leads.length; i += RESTORE_BATCH) {
        const data = await apiFetch('/api/dev/backup', { method: 'POST', body: JSON.stringify({ leads: leads.slice(i, i + RESTORE_BATCH) }) });
        added += Number(data.added || 0);
        skipped += Number(data.skipped || 0);
        invalid += Number(data.invalid || 0);
        progress.textContent = `Checked ${Math.min(i + RESTORE_BATCH, leads.length)} of ${leads.length}…`;
      }
      setStatus('ok', `Restore finished: ${plural(added, 'enquiry was', 'enquiries were')} added back, ${skipped} ${skipped === 1 ? 'was' : 'were'} already there${invalid ? `, and ${invalid} could not be read from the file` : ''}.`);
      progress.textContent = '';
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      setStatus('bad', `Restore stopped: ${err.message} ${added} added so far. It is safe to choose the file again to continue.`);
    } finally {
      restoring = false;
      $('restore-btn').disabled = false;
    }
    await loadOverview();
    if (loadedTabs.has('leads')) loadLeads(leadsQuery);
  }

  // ---------- Requests ----------
  // The log holds page visits only (requests to the site's server are not recorded).
  let requestsQuery = { q: '', type: 'view' };
  let requestsRows = [];
  let requestsSeq = 0; // only the newest search may update the table

  // An IP address as a link that shows its page visits, with a "Blocked" tag when it is blocked.
  function ipButton(ip) {
    const b = el('button', { className: 'dv-link dv-mono', text: ip || 'unknown', attrs: { type: 'button', title: 'Show this address\'s page visits' } });
    b.addEventListener('click', () => {
      $('requests-q').value = ip || '';
      loadedTabs.add('requests');
      setTab('requests', { load: false }); // loaded just below, already filtered
      loadRequests({ q: ip || '', type: $('requests-type').value });
    });
    if (!blockedAs(ip)) return b;
    return el('span', {}, [b, el('span', { className: 'dv-chip dv-chip-bad', text: 'Blocked', attrs: { style: 'margin-left:0.4rem' } })]);
  }

  // ---------- Blocked IP addresses ----------
  // A long (IPv6) address is blocked as the whole network it belongs to (its "/64"), because
  // devices switch to a new long address inside that network every day or so. This gives the
  // name a block is stored under, the same way the server does (lib/blocklist.js): the address
  // itself for a short one, "xxxx:xxxx:xxxx:xxxx::/64" for a long one, '' if it is not an address.
  function blockKeyOf(value) {
    let raw = String(value || '').trim().toLowerCase();
    if (raw.endsWith('/64')) raw = raw.slice(0, -3);
    if (!raw.includes(':')) return /^[0-9.]{7,15}$/.test(raw) ? raw : '';
    if (!/^[0-9a-f:.]{2,45}$/.test(raw)) return '';
    let ip;
    try { ip = new URL('http://[' + raw + ']/').hostname.slice(1, -1); } catch (e) { return ''; }
    const halves = ip.split('::');
    const left = halves[0] ? halves[0].split(':') : [];
    const right = halves[1] ? halves[1].split(':') : [];
    const groups = ip.includes('::') ? left.concat(Array(Math.max(0, 8 - left.length - right.length)).fill('0'), right) : left;
    if (groups.length !== 8) return '';
    if (groups.slice(0, 5).every((g) => g === '0') && groups[5] === 'ffff') {
      const hi = parseInt(groups[6], 16);
      const lo = parseInt(groups[7], 16);
      return (hi >> 8) + '.' + (hi & 255) + '.' + (lo >> 8) + '.' + (lo & 255);
    }
    try { return new URL('http://[' + groups.slice(0, 4).join(':') + '::]/').hostname.slice(1, -1) + '/64'; } catch (e) { return ''; }
  }

  // The entry in the block list that covers this address, or '' if it is not blocked.
  function blockedAs(ip) {
    if (!ip) return '';
    if (blockedIps.has(ip)) return ip;
    const key = blockKeyOf(ip);
    return key && blockedIps.has(key) ? key : '';
  }

  const isYou = (ip) => Boolean(ip && yourIp && (ip === yourIp || (blockKeyOf(ip) && blockKeyOf(ip) === blockKeyOf(yourIp))));

  // "Block" / "Unblock" button shown beside an address in the tables.
  function blockAction(ip) {
    if (!ip || ip === 'unknown') return '';
    if (isYou(ip)) return el('span', { className: 'text-brand-muted', text: 'You' });
    const entry = blockedAs(ip);
    const b = el('button', { className: 'dv-btn' + (entry ? '' : ' dv-btn-danger'), text: entry ? 'Unblock' : 'Block', attrs: { type: 'button' } });
    b.addEventListener('click', () => (entry ? unblockIp(entry, b) : startBlock(ip)));
    return b;
  }

  // Fills in the block form on the Security tab, so you can choose how long and add a reason.
  function startBlock(ip) {
    setTab('security');
    $('block-ip').value = ip;
    $('block-reason').value = '';
    $('blocks-card').scrollIntoView({ behavior: 'smooth', block: 'start' });
    setTimeout(() => { try { $('block-reason').focus(); } catch (e) {} }, 300);
  }

  function renderBlocks(blocks) {
    const body = $('blocks-body');
    $('block-you').textContent = yourIp ? `You are using ${yourIp} right now, so that address${yourIp.includes(':') ? ' (and the network it belongs to)' : ''} cannot be blocked.` : '';
    if (!blocks.length) { emptyRow(body, 6, 'No addresses are blocked.'); return; }
    body.textContent = '';
    blocks.forEach((x) => {
      const unblock = el('button', { className: 'dv-btn', text: 'Unblock', attrs: { type: 'button' } });
      unblock.addEventListener('click', () => unblockIp(x.ip, unblock));
      body.appendChild(el('tr', {}, [
        td(el('span', { className: 'dv-mono', text: x.ip })),
        td(x.reason || '-'),
        td(formatTime(x.createdAt)),
        td(Number(x.expiresAt) === 0 ? 'Never' : formatTime(x.expiresAt)),
        td(x.hits ? `${x.hits}${x.lastHit ? ' (last ' + formatTime(x.lastHit) + ')' : ''}` : '0', 'dv-num'),
        td(unblock)
      ]));
    });
  }

  async function afterBlockChange() {
    await loadOverview();
    // Redraw lists that show "Blocked" tags and Block buttons.
    if (loadedTabs.has('requests')) loadRequests(requestsQuery);
    if (loadedTabs.has('leads')) loadLeads(leadsQuery);
  }

  async function submitBlock(e) {
    e.preventDefault();
    const ip = $('block-ip').value.trim();
    const reason = $('block-reason').value.trim();
    const days = Number($('block-days').value);
    if (!ip) { setStatus('bad', 'Enter the IP address to block.'); $('block-ip').focus(); return; }
    if (isYou(ip)) { setStatus('bad', 'That is the address you are using right now, so it cannot be blocked.'); return; }
    const length = days === 0 ? 'permanently' : `for ${plural(days, 'day', 'days')}`;
    const key = blockKeyOf(ip);
    const network = key.endsWith('/64')
      ? `\n\nThis is a long address, so the whole network it belongs to (${key}) will be blocked. That is one home or one phone, and it keeps the block working when the device changes its address.`
      : '';
    if (!confirm(`Block ${ip} ${length}?${network}\n\nIt will still be able to open the website, but it won't be able to send enquiries or call requests, or sign in to the staff inbox.`)) return;
    const btn = $('block-submit');
    btn.disabled = true;
    setStatus('busy', 'Blocking…');
    try {
      const data = await callTool('block_ip', { ip, reason, days });
      setStatus('ok', data.message);
      $('block-ip').value = '';
      $('block-reason').value = '';
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      setStatus('bad', err.message);
    } finally {
      btn.disabled = false;
    }
    await afterBlockChange();
  }

  async function unblockIp(ip, button) {
    if (!confirm(`Unblock ${ip}? It will be able to send enquiries and sign in to the staff inbox again.`)) return;
    if (button) button.disabled = true;
    setStatus('busy', 'Unblocking…');
    try {
      const data = await callTool('unblock_ip', { ip });
      setStatus('ok', data.message);
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      setStatus('bad', err.message);
      if (button) button.disabled = false;
    }
    await afterBlockChange();
  }

  async function loadRequests(query = requestsQuery, { append = false } = {}) {
    requestsQuery = { q: String(query.q || ''), type: String(query.type || 'view') };
    const info = $('requests-info');
    info.textContent = 'Loading…';
    const params = new URLSearchParams();
    if (requestsQuery.q) params.set('q', requestsQuery.q);
    params.set('type', requestsQuery.type);
    if (append && requestsRows.length) params.set('before', String(requestsRows[requestsRows.length - 1].id));
    const seq = ++requestsSeq;
    try {
      const data = await apiFetch('/api/dev/requests' + (params.toString() ? '?' + params : ''));
      if (seq !== requestsSeq) return;
      requestsRows = append ? requestsRows.concat(data.requests || []) : (data.requests || []);
      renderRequests(data);
    } catch (err) {
      if (seq !== requestsSeq) return;
      if (err.status === 401) { sessionEnded(); return; }
      info.textContent = err.message;
    }
  }

  function statusChip(r) {
    if (r.kind === 'note') return el('span', { className: 'dv-chip dv-chip-note', text: 'Limit' });
    const s = Number(r.status || 0);
    const words = { 200: 'OK', 201: 'Saved', 204: 'OK', 400: 'Bad request', 401: 'Not signed in', 403: 'Blocked', 404: 'Not found', 405: 'Wrong method', 413: 'Too large', 415: 'Wrong format', 422: 'Rejected', 423: 'Locked', 429: 'Too many', 500: 'Server error', 502: 'Email failed', 503: 'Not set up' };
    const text = `${s}${has(words, s) ? ' ' + words[s] : ''}`;
    return el('span', { className: 'dv-chip ' + (s >= 400 ? 'dv-chip-bad' : 'dv-chip-view'), text });
  }

  function renderRequests(data) {
    const s = data.last24h || {};
    const notFoundOnly = requestsQuery.type === 'errors';
    $('req-total').textContent = s.total || 0;
    $('req-ips').textContent = s.uniqueIps || 0;
    $('req-errors').textContent = s.errors || 0;
    $('requests-body').closest('table').classList.add('req-visits-only');
    $('requests-paused').classList.toggle('hidden', !data.paused);
    if (data.keep) {
      $('requests-about').textContent = 'Every page visit, newest first, with the IP address it came from.'
        + ` The newest ${Number(data.keep.rows).toLocaleString('en-US')} are kept, for up to ${data.keep.days} days.`;
    }

    const tb = $('topips-body');
    const top = Array.isArray(data.topIps) ? data.topIps : [];
    if (!top.length) emptyRow(tb, 7, 'No page visits in the last 24 hours.');
    else {
      tb.textContent = '';
      top.forEach((t) => tb.appendChild(el('tr', {}, [td(ipButton(t.ip)), td(t.count, 'dv-num'), td(t.errors, 'dv-num'), td(t.place || 'Unknown'), td(t.device || ''), td(formatTime(t.last)), td(blockAction(t.ip))])));
    }

    const body = $('requests-body');
    if (!requestsRows.length) {
      emptyRow(body, 7, requestsQuery.q || notFoundOnly ? 'No page visits match.' : 'No page visits recorded yet.');
    } else {
      body.textContent = '';
      requestsRows.forEach((r) => {
        const type = r.kind === 'note'
          ? el('span', { className: 'dv-chip dv-chip-note', text: 'Note' })
          : el('span', { className: 'dv-chip dv-chip-view', text: 'Page visit' });
        body.appendChild(el('tr', {}, [
          td(formatTime(r.at)), td(type), td(el('span', { className: 'dv-mono', text: r.path || '' })),
          td(statusChip(r)), td(ipButton(r.ip)), td(r.place || 'Unknown'), td(r.device || '')
        ]));
      });
    }
    $('requests-more').classList.toggle('hidden', !data.hasMore);
    $('requests-info').textContent = `Showing ${plural(requestsRows.length, notFoundOnly ? '"page not found" visit' : 'page visit', notFoundOnly ? '"page not found" visits' : 'page visits')}${requestsQuery.q ? ` matching "${requestsQuery.q}"` : ''}.`;
    refreshIcons();
  }

  // ---------- Site check (runs in this browser) ----------
  const LANGS = [['es', 'Spanish'], ['zh', 'Chinese'], ['tl', 'Tagalog'], ['vi', 'Vietnamese'], ['ko', 'Korean'], ['hy', 'Armenian'], ['ru', 'Russian'], ['ar', 'Arabic'], ['fa', 'Persian'], ['hi', 'Hindi'], ['pa', 'Punjabi'], ['ja', 'Japanese'], ['uk', 'Ukrainian'], ['he', 'Hebrew'], ['km', 'Khmer'], ['fr', 'French'], ['pt', 'Portuguese']];
  const SLOW_MS = 2000;

  function siteChecks() {
    const checks = [
      { label: 'Home page', url: '/', expect: 200, headers: 'site' },
      { label: 'Staff inbox page', url: '/staff', expect: 200, headers: 'private' },
      { label: 'Developer console page', url: '/corosone', expect: 200, headers: 'private' },
      { label: '"Page not found" page', url: '/site-check-missing-' + Date.now(), expect: 404 },
      { label: 'Server functions are running', url: '/api/leads', expect: 405 },
      { label: 'Styles (tailwind.css)', url: '/tailwind.css', expect: 200, minBytes: 1000 }
    ];
    ['app.js', 'i18n.js', 'icons.js', 'turnstile-gate.js', 'visit.js', 'staff.js', 'corosone.js', '404.js'].forEach((f) => {
      checks.push({ label: 'Script ' + f, url: '/' + f, expect: 200, minBytes: 200 });
    });
    checks.push({ label: 'Main photo (hero.jpg)', url: '/hero.jpg', expect: 200, minBytes: 1000 });
    checks.push({ label: 'Phone icon (apple-touch-icon.png)', url: '/apple-touch-icon.png', expect: 200 });
    checks.push({ label: 'robots.txt', url: '/robots.txt', expect: 200 });
    checks.push({ label: 'sitemap.xml', url: '/sitemap.xml', expect: 200 });
    // Optional: Cloudflare adds this script to the pages when Web Analytics is turned on.
    checks.push({ label: 'Visitor statistics (Cloudflare Web Analytics)', url: '/', expect: 200, optionalContains: 'static.cloudflareinsights.com/beacon.min.js' });
    LANGS.forEach(([code, name]) => checks.push({ label: `Language: ${name} (${code})`, url: `/i18n/${code}.js`, expect: 200, contains: 'LoveI18nData' }));
    return checks;
  }

  function headerProblems(res, kind) {
    const h = (n) => (res.headers.get(n) || '').toLowerCase();
    const problems = [];
    const csp = h('content-security-policy');
    if (!csp.includes("default-src 'self'")) problems.push('security policy (Content-Security-Policy) missing');
    if (h('x-content-type-options') !== 'nosniff') problems.push('X-Content-Type-Options missing');
    if (h('x-frame-options') !== 'deny' && !csp.includes("frame-ancestors 'none'")) problems.push('framing protection missing');
    if (location.protocol === 'https:' && !h('strict-transport-security')) problems.push('HTTPS-only header (HSTS) missing');
    if (kind === 'private') {
      if (!h('cache-control').includes('no-store')) problems.push('should never be cached');
      if (!h('x-robots-tag').includes('noindex')) problems.push('should be hidden from search engines');
    }
    return problems;
  }

  async function runCheck(c) {
    const started = performance.now();
    try {
      const res = await fetch(c.url, { cache: 'no-store', credentials: 'omit' });
      const buf = await res.arrayBuffer();
      const ms = Math.round(performance.now() - started);
      const problems = [];
      if (res.status !== c.expect) problems.push(`returned ${res.status}, expected ${c.expect}`);
      if (c.minBytes && buf.byteLength < c.minBytes) problems.push('file is empty or too small');
      if (c.contains && !new TextDecoder().decode(buf).includes(c.contains)) problems.push('file does not contain the translations');
      if (c.headers) headerProblems(res, c.headers).forEach((p) => problems.push(p));
      if (c.optionalContains && !problems.length) {
        const on = new TextDecoder().decode(buf).includes(c.optionalContains);
        return { c, level: on ? 'ok' : 'note', text: on ? 'Turned on' : 'Not turned on (optional)', ms, bytes: buf.byteLength };
      }
      const level = problems.length ? 'bad' : ms > SLOW_MS ? 'warn' : 'ok';
      return { c, level, text: problems.length ? problems.join('; ') : ms > SLOW_MS ? 'Works, but slow' : 'OK', ms, bytes: buf.byteLength };
    } catch (err) {
      return { c, level: 'bad', text: 'Could not be loaded (network error)', ms: Math.round(performance.now() - started), bytes: 0 };
    }
  }

  async function runSiteCheck() {
    const btn = $('sitecheck-btn');
    btn.disabled = true;
    const checks = siteChecks();
    const body = $('sitecheck-body');
    emptyRow(body, 4, 'Checking…');
    $('sitecheck-summary').textContent = `Checking ${checks.length} items…`;
    const results = new Array(checks.length);
    let next = 0;
    async function worker() {
      while (next < checks.length) {
        const i = next++;
        results[i] = await runCheck(checks[i]);
      }
    }
    await Promise.all([worker(), worker(), worker(), worker()]);
    body.textContent = '';
    const order = { bad: 0, warn: 1, note: 1, ok: 2 };
    results.slice().sort((a, b) => order[a.level] - order[b.level]).forEach((r) => {
      const dot = el('span', { className: 'status-dot status-' + (r.level === 'note' ? 'warn' : r.level), attrs: { 'aria-hidden': 'true' } });
      const result = el('span', { className: 'flex items-baseline' }, [dot, el('span', { text: (r.level === 'bad' ? 'Problem: ' : r.level === 'warn' || r.level === 'note' ? 'Note: ' : '') + r.text })]);
      body.appendChild(el('tr', {}, [
        td(el('span', {}, [el('span', { text: r.c.label }), el('div', { className: 'dv-mono text-brand-muted', text: r.c.url })])),
        td(result), td(`${r.ms} ms`, 'dv-num'), td(r.bytes ? `${(r.bytes / 1024).toFixed(1)} KB` : '-', 'dv-num')
      ]));
    });
    const bad = results.filter((r) => r.level === 'bad').length;
    const slow = results.filter((r) => r.level === 'warn').length;
    // Optional items that are simply switched off are mentioned, but are not counted as checks.
    const notes = results.filter((r) => r.level === 'note');
    const counted = results.length - notes.length;
    $('sitecheck-summary').textContent = (bad
      ? `${plural(bad, 'problem', 'problems')} found out of ${counted} checks${slow ? `, and ${slow} slow` : ''}. Problems are listed first.`
      : `All ${counted} checks passed${slow ? `, but ${plural(slow, 'item was', 'items were')} slow` : ''}.`)
      + (notes.length ? ' Visitor statistics are not turned on (optional).' : '');
    btn.disabled = false;
  }

  // ---------- Database ----------
  async function checkDatabase() {
    const btn = $('db-btn');
    btn.disabled = true;
    emptyRow($('db-body'), 2, 'Checking…');
    try {
      const data = await apiFetch('/api/dev/database');
      const body = $('db-body');
      body.textContent = '';
      (data.tables || []).forEach((t) => body.appendChild(el('tr', {}, [td(t.label), td(Number(t.rows).toLocaleString('en-US'), 'dv-num')])));
      const limit = Number(data.limits && data.limits.sizeBytes) || 0;
      if (data.sizeBytes && limit) {
        const pct = Math.min(100, (data.sizeBytes / limit) * 100);
        $('db-size').textContent = `Size: ${(data.sizeBytes / 1048576).toFixed(2)} MB of the free plan's ${Math.round(limit / 1048576)} MB (${pct < 0.1 ? 'under 0.1' : pct.toFixed(1)}%).`;
        $('db-meter').classList.remove('hidden');
        $('db-meter-fill').style.width = Math.max(pct, 0.5) + '%';
      } else {
        $('db-size').textContent = 'Size: not reported by Cloudflare.';
        $('db-meter').classList.add('hidden');
      }
    } catch (err) {
      if (err.status === 401) { sessionEnded(); return; }
      emptyRow($('db-body'), 2, err.message);
    } finally {
      btn.disabled = false;
    }
  }

  // ---------- Start ----------
  function init() {
    $('theme-btn').addEventListener('click', toggleTheme);
    syncThemeButton();
    $('login-form').addEventListener('submit', submitLogin);
    $('code-form').addEventListener('submit', submitCode);
    $('code-restart').addEventListener('click', () => showLogin(''));
    $('dev-code').addEventListener('input', (e) => {
      e.target.value = e.target.value.replace(/\D/g, '').slice(0, 6);
    });
    $('signout-btn').addEventListener('click', signOut);
    $('refresh-btn').addEventListener('click', async () => {
      await loadOverview();
      if (currentTab === 'leads') loadLeads(leadsQuery);
      if (currentTab === 'requests') loadRequests(requestsQuery);
    });

    TABS.forEach((t) => {
      $('tab-' + t).addEventListener('click', () => setTab(t));
      $('tab-' + t).addEventListener('keydown', onTabKey);
    });
    document.querySelectorAll('[data-activity]').forEach((b) => {
      b.addEventListener('click', () => {
        activityFilter = b.getAttribute('data-activity');
        document.querySelectorAll('[data-activity]').forEach((x) => x.setAttribute('aria-pressed', x === b ? 'true' : 'false'));
        renderActivity();
      });
    });

    $('leads-search').addEventListener('submit', (e) => { e.preventDefault(); loadLeads({ q: $('leads-q').value.trim(), spam: false }); });
    $('leads-spam').addEventListener('click', () => loadLeads({ q: $('leads-q').value.trim(), spam: true }));
    $('leads-all').addEventListener('click', () => { $('leads-q').value = ''; loadLeads({ q: '', spam: false }); });
    $('leads-check-all').addEventListener('change', (e) => toggleAllLeads(e.target.checked));
    $('leads-delete').addEventListener('click', deleteSelectedLeads);
    $('export-btn').addEventListener('click', exportLeads);

    $('requests-search').addEventListener('submit', (e) => { e.preventDefault(); loadRequests({ q: $('requests-q').value.trim(), type: $('requests-type').value }); });
    $('requests-reset').addEventListener('click', () => { $('requests-q').value = ''; $('requests-type').value = 'view'; loadRequests({ q: '', type: 'view' }); });
    $('requests-more').addEventListener('click', () => loadRequests(requestsQuery, { append: true }));
    $('block-form').addEventListener('submit', submitBlock);

    $('sitecheck-btn').addEventListener('click', runSiteCheck);
    $('db-btn').addEventListener('click', checkDatabase);
    $('backup-btn').addEventListener('click', downloadBackup);
    $('restore-btn').addEventListener('click', () => { if (!restoring) $('restore-file').click(); });
    $('restore-file').addEventListener('change', (e) => {
      const file = e.target.files && e.target.files[0];
      e.target.value = ''; // so the same file can be chosen again later
      restoreFromFile(file);
    });

    document.addEventListener('click', (e) => {
      const toolBtn = e.target.closest && e.target.closest('[data-tool]');
      if (toolBtn && !toolBtn.disabled) runTool(toolBtn);
    });

    let savedTab = 'overview';
    try { savedTab = sessionStorage.getItem('lovercfe_dev_tab') || 'overview'; } catch (e) {}
    setTab(TABS.includes(savedTab) ? savedTab : 'overview');

    refreshIcons();
    loadOverview({ silent: true }).then((ok) => { if (ok) loadTabData(currentTab); });

    // Keep the numbers fresh, and notice promptly when the session has ended
    setInterval(() => {
      if (!document.hidden && signedIn) loadOverview();
    }, 60000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
