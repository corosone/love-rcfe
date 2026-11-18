(function () {
  'use strict';

  // Apply saved dark-mode preference immediately in <head> before <body> paints
  try {
    if (localStorage.getItem('lovercfe_theme') === 'dark') {
      document.documentElement.classList.add('dark');
    }
  } catch (e) {}

  let allLeads = [];
  let totalLeads = 0;
  let hasMoreLeads = false;
  // Counts for every stored lead (from the server), not just the ones loaded on this page:
  // { open, handled, openCalls }. null until the first load.
  let leadCounts = null;
  let isSignedIn = false;
  let isDeveloper = false; // a signed-in developer also gets the offer to block a spammer's address
  let currentFilter = 'open';
  let searchQuery = '';

  function refreshIcons() {
    if (window.lucide && typeof window.lucide.createIcons === 'function') {
      window.lucide.createIcons();
    }
  }

  // ---------- Cloudflare Turnstile on the sign-in form ----------
  // The check runs hidden in the background (see /turnstile-gate.js). The server verifies its
  // token before it looks at the password, so automated password guessing is blocked up front.
  const loginGate = window.LoveTurnstile ? window.LoveTurnstile.mount('ts-login') : null;

  function toggleTheme() {
    const dark = !document.documentElement.classList.contains('dark');
    document.documentElement.classList.toggle('dark', dark);
    try { localStorage.setItem('lovercfe_theme', dark ? 'dark' : 'light'); } catch (e) {}
    const btn = document.getElementById('theme-btn');
    if (btn) {
      btn.setAttribute('aria-label', dark ? 'Switch to light mode' : 'Switch to dark mode');
      btn.innerHTML = dark ? '<i data-lucide="sun" class="w-4 h-4"></i>' : '<i data-lucide="moon" class="w-4 h-4"></i>';
      refreshIcons();
    }
  }

  function escapeHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  const STAGE_LABELS = { new: 'New', called: 'Called', tour: 'Tour scheduled', waiting: 'Waiting on family' };
  // The only device detail staff see: what kind of device a message came from.
  const DEVICE_TYPES = { phone: 'Sent from a phone', tablet: 'Sent from a tablet', computer: 'Sent from a computer' };
  const SOURCE_LABELS = {
    home: 'Home page', services: 'Services page', tools: 'Tools page',
    approach: 'Approach page', support: 'FAQs & Support', contact: 'Contact page',
    terms: 'Terms page', privacy: 'Privacy page', other: 'Other page',
  };
  const sourceLabel = (v) => SOURCE_LABELS[v] || v;
  const stageOptions = (cur) => Object.entries(STAGE_LABELS)
    .map(([v, label]) => `<option value="${escapeHtml(v)}" ${v === (cur || 'new') ? 'selected' : ''}>${escapeHtml(label)}</option>`).join('');
  const findLead = (id) => allLeads.find(l => Number(l.id) === Number(id));
  const hasUnsavedNotes = () => allLeads.some(l => l._savingNotes || (l._savedNotes !== undefined && l.notes !== l._savedNotes));

  function parseCreatedAt(raw) {
    if (!raw) return new Date(NaN);
    const s = String(raw).trim();
    const iso = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s) ? s.replace(' ', 'T') + 'Z' : s;
    return new Date(iso);
  }

  // Newest first. The server sends messages not yet handled first (so none can be left out
  // of the first batch), but the inbox lists everything by date.
  function byNewest(a, b) {
    const ta = parseCreatedAt(a.createdAt).getTime() || 0;
    const tb = parseCreatedAt(b.createdAt).getTime() || 0;
    return tb - ta || Number(b.id) - Number(a.id);
  }

  // Keeps the server's counts right after a change made on this page (until the next refresh).
  function countChange(lead, { handled, removed = false }) {
    if (!leadCounts || !lead) return;
    const wasOpen = !lead.handled;
    const isOpen = removed ? false : !handled;
    const call = lead.kind === 'call_request';
    if (wasOpen && !isOpen) { leadCounts.open -= 1; if (call) leadCounts.openCalls -= 1; }
    if (!wasOpen && isOpen) { leadCounts.open += 1; if (call) leadCounts.openCalls += 1; }
    if (!removed && wasOpen && !isOpen) leadCounts.handled += 1;
    if (!wasOpen && (isOpen || removed)) leadCounts.handled -= 1;
    Object.keys(leadCounts).forEach((k) => { if (leadCounts[k] < 0) leadCounts[k] = 0; });
  }

  async function apiFetch(url, options = {}) {
    const res = await fetch(url, {
      credentials: 'same-origin',
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      throw Object.assign(new Error(data.error || 'Request failed'), { status: res.status });
    }
    return data;
  }

  function showLogin(errorMsg = '') {
    isSignedIn = false;
    document.title = 'Staff Inbox | Love RCFE';
    document.getElementById('login-view').classList.remove('hidden');
    document.getElementById('dashboard-view').classList.add('hidden');
    document.getElementById('signout-btn').classList.add('hidden');
    const devLink = document.getElementById('dev-link');
    if (devLink) devLink.classList.add('hidden');
    document.getElementById('login-error').textContent = errorMsg;
  }

  function showDashboard() {
    isSignedIn = true;
    document.getElementById('login-view').classList.add('hidden');
    document.getElementById('dashboard-view').classList.remove('hidden');
    document.getElementById('signout-btn').classList.remove('hidden');
    document.getElementById('login-error').textContent = '';
  }

  async function signOut() {
    // Save any note still being typed before the session ends.
    await Promise.all(allLeads
      .filter(l => l._savedNotes !== undefined && l.notes !== l._savedNotes)
      .map(l => saveNote(Number(l.id))));
    try {
      await apiFetch('/api/admin/session', { method: 'DELETE' });
    } catch (e) {}
    allLeads = [];
    totalLeads = 0;
    hasMoreLeads = false;
    leadCounts = null;
    document.getElementById('inbox-password').value = '';
    showLogin('');
  }

  function handleAuthFailure(err) {
    if (err.status === 401 || err.status === 423) {
      allLeads = [];
      totalLeads = 0;
      hasMoreLeads = false;
      leadCounts = null;
      showLogin(err.message);
      return true;
    }
    return false;
  }

  async function loadLeads({ silentAuth = false, append = false } = {}) {
    const statusEl = document.getElementById('dash-status');
    if (statusEl && !silentAuth) statusEl.textContent = 'Loading leads from database...';
    try {
      const offset = append ? allLeads.length : 0;
      const data = await apiFetch(`/api/admin/leads?limit=500&offset=${offset}`);
      const incoming = Array.isArray(data.leads) ? data.leads : [];
      allLeads = append ? [...allLeads, ...incoming] : incoming;
      totalLeads = Number(data.total ?? allLeads.length);
      hasMoreLeads = Boolean(data.hasMore);
      const c = data.counts;
      leadCounts = c && typeof c === 'object'
        ? { open: Number(c.open) || 0, handled: Number(c.handled) || 0, openCalls: Number(c.openCalls) || 0 }
        : null;
      // A signed-in developer gets a link back to the developer console.
      const devLink = document.getElementById('dev-link');
      if (devLink) devLink.classList.toggle('hidden', !data.developer);
      isDeveloper = Boolean(data.developer);
      showDashboard();
      if (statusEl) {
        statusEl.textContent = hasMoreLeads
          ? `Showing ${allLeads.length} of ${totalLeads} records.`
          : `Showing latest records (${allLeads.length} loaded).`;
      }
      const moreWrap = document.getElementById('load-more-wrap');
      if (moreWrap) moreWrap.classList.toggle('hidden', !hasMoreLeads);
      renderLeads();
    } catch (err) {
      if (err.status === 401) {
        allLeads = [];
        showLogin(silentAuth ? '' : err.message);
      } else if (err.status === 423 || err.status === 429 || err.status === 503) {
        showLogin(err.message);
      } else {
        if (statusEl) statusEl.textContent = err.message;
      }
    }
  }

  async function loadMoreLeads() {
    const btn = document.getElementById('load-more-btn');
    if (btn) btn.disabled = true;
    await loadLeads({ append: true });
    if (btn) btn.disabled = false;
  }

  async function setHandled(id, handled) {
    try {
      await apiFetch('/api/admin/leads', {
        method: 'PATCH',
        body: JSON.stringify({ id, handled })
      });
      const target = findLead(id);
      countChange(target, { handled });
      if (target) target.handled = handled;
      renderLeads();
    } catch (err) {
      if (!handleAuthFailure(err)) alert(err.message);
    }
  }

  async function setStage(id, stage) {
    try {
      await apiFetch('/api/admin/leads', { method: 'PATCH', body: JSON.stringify({ id, stage }) });
      const target = findLead(id);
      if (target) target.stage = stage;
      renderLeads();
    } catch (err) {
      if (!handleAuthFailure(err)) alert(err.message);
    }
  }

  // Notes save automatically 1.5 seconds after you stop typing, when you click away,
  // and (best effort) when the tab is closed. The browser also warns before leaving
  // the page while a note has not been saved yet.
  const NOTE_AUTOSAVE_MS = 1500;
  const noteTimers = new Map();

  function noteDraft(id, value) {
    const target = findLead(id);
    if (!target) return;
    if (target._savedNotes === undefined) target._savedNotes = target.notes || '';
    target.notes = value;
    const statusEl = document.getElementById('note-status-' + id);
    if (statusEl && target.notes !== target._savedNotes) statusEl.textContent = 'Unsaved changes…';
    clearTimeout(noteTimers.get(id));
    noteTimers.set(id, setTimeout(() => saveNote(id), NOTE_AUTOSAVE_MS));
  }

  async function saveNote(id) {
    clearTimeout(noteTimers.get(id));
    noteTimers.delete(id);
    const target = findLead(id);
    if (!target || target._savedNotes === undefined || target.notes === target._savedNotes) return;
    if (target._savingNotes) {
      // A save is already running; save again once it finishes so the latest text is stored.
      target._saveAgain = true;
      return;
    }
    const sent = target.notes;
    target._savingNotes = true;
    const statusEl = () => document.getElementById('note-status-' + id);
    if (statusEl()) statusEl().textContent = 'Saving…';
    try {
      await apiFetch('/api/admin/leads', { method: 'PATCH', body: JSON.stringify({ id, notes: sent }) });
      // Mark only the text that was actually sent as saved (typing may have continued meanwhile).
      target._savedNotes = sent;
      const el = statusEl();
      if (el && target.notes === sent) {
        el.textContent = 'Saved';
        setTimeout(() => { if (el.textContent === 'Saved') el.textContent = ''; }, 2000);
      }
    } catch (err) {
      if (statusEl()) statusEl().textContent = 'Not saved: ' + err.message;
      handleAuthFailure(err);
    } finally {
      target._savingNotes = false;
      if (target._saveAgain) {
        target._saveAgain = false;
        if (target.notes !== target._savedNotes) saveNote(id);
      }
    }
  }

  // Last-chance save when the tab is hidden or closed. keepalive lets the request finish
  // after the page is gone.
  function flushUnsavedNotes() {
    allLeads.forEach((l) => {
      if (l._savedNotes === undefined || l.notes === l._savedNotes || l._savingNotes) return;
      clearTimeout(noteTimers.get(Number(l.id)));
      try {
        fetch('/api/admin/leads', {
          method: 'PATCH',
          credentials: 'same-origin',
          keepalive: true,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: Number(l.id), notes: l.notes }),
        }).then((res) => { if (res.ok) l._savedNotes = l.notes; }).catch(() => {});
      } catch (e) {}
    });
  }

  async function deleteLead(id) {
    if (!confirm('Permanently delete this lead from the database?')) return;
    try {
      await apiFetch(`/api/admin/leads?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      countChange(findLead(id), { removed: true });
      allLeads = allLeads.filter(l => Number(l.id) !== Number(id));
      if (totalLeads > 0) totalLeads -= 1;
      renderLeads();
    } catch (err) {
      if (!handleAuthFailure(err)) alert(err.message);
    }
  }

  // "Mark as spam": deletes the message and tells the site owner which address sent it
  // (it appears in the developer console's activity log, where the owner can block it).
  async function markSpam(id) {
    const lead = findLead(id);
    if (!lead) return;
    const ip = String(lead.ip || '');
    if (!confirm('Mark this message as spam?\n\nIt will be permanently deleted.' + (ip ? ' The address it was sent from is reported to the site owner.' : ''))) return;
    try {
      await apiFetch(`/api/admin/leads?id=${encodeURIComponent(id)}&spam=1`, { method: 'DELETE' });
      countChange(lead, { removed: true });
      allLeads = allLeads.filter(l => Number(l.id) !== Number(id));
      if (totalLeads > 0) totalLeads -= 1;
      renderLeads();
    } catch (err) {
      if (!handleAuthFailure(err)) alert(err.message);
      return;
    }
    // Only the developer can block addresses; the server refuses this for staff sessions.
    if (!isDeveloper || !ip || ip === 'unknown') return;
    if (!confirm(`Also block ${ip} for 30 days?\n\nIt will no longer be able to send enquiries or sign in to the staff inbox. You can unblock it in the developer console.`)) return;
    try {
      const res = await apiFetch('/api/dev/action', {
        method: 'POST',
        body: JSON.stringify({ action: 'block_ip', options: { ip, reason: 'Marked as spam', days: 30 } })
      });
      alert(res.message || 'Blocked.');
    } catch (err) {
      alert('The message was deleted, but the address was not blocked: ' + err.message);
    }
  }

  // ---------- Quick replies ----------
  // Choosing one opens your email app with the message already written, addressed to the
  // person. Nothing is sent until you press Send there, so you can edit it first.
  const BUSINESS_PHONE = '(818) 217-5755';
  const SIGN_OFF = '\n\nWarm regards,\nLove RCFE\n' + BUSINESS_PHONE;
  const REPLY_TEMPLATES = {
    thanks: {
      label: 'Thank you, we will call you',
      subject: 'Thank you for contacting Love RCFE',
      body: (l) => `Thank you for reaching out to Love RCFE. We received your message, and a member of our team will call you${l.phone ? ' at ' + l.phone : ''} within 1 business day.\n\nIf a different number or time works better for you, just reply to this email.`
    },
    missed: {
      label: 'We tried to call you',
      subject: 'We tried to reach you - Love RCFE',
      body: (l) => `We tried calling you${l.phone ? ' at ' + l.phone : ''} about your enquiry but were not able to reach you.\n\nWhen would be a good time to call back? You can reply to this email or call us at ${BUSINESS_PHONE}.`
    },
    details: {
      label: 'Ask for more details',
      subject: 'A quick question about your enquiry - Love RCFE',
      body: () => 'Thank you for your message. So that we can point you in the right direction, could you tell us a little more about what you need help with, and the best time to reach you by phone?'
    },
    confirm: {
      label: 'Confirm the scheduled call',
      subject: 'Your call with Love RCFE',
      body: (l) => `This is to confirm your call with Love RCFE on ${l.preferredDate}${l.preferredTime ? ' (' + l.preferredTime + ')' : ''}. We will call you${l.phone ? ' at ' + l.phone : ''}.\n\nIf you need to change the time, just reply to this email or call us at ${BUSINESS_PHONE}.`
    }
  };

  function replyOptions(l) {
    return Object.entries(REPLY_TEMPLATES)
      .filter(([key]) => key !== 'confirm' || (l.kind === 'call_request' && l.preferredDate))
      .map(([key, t]) => `<option value="${escapeHtml(key)}">${escapeHtml(t.label)}</option>`).join('');
  }

  function firstName(name) {
    const first = String(name || '').trim().split(/\s+/)[0] || '';
    // Letters (any language), apostrophes and hyphens only; anything odd falls back to a plain greeting.
    return /^[\p{L}\p{M}'’-]{1,30}$/u.test(first) ? first : '';
  }

  function quickReplyHref(l, key) {
    const t = Object.prototype.hasOwnProperty.call(REPLY_TEMPLATES, key) ? REPLY_TEMPLATES[key] : null;
    const email = String(l.email || '').trim();
    if (!t || !email) return '';
    const name = firstName(l.name);
    const body = (name ? `Hello ${name},` : 'Hello,') + '\n\n' + t.body(l) + SIGN_OFF;
    return 'mailto:' + encodeURIComponent(email)
      + '?subject=' + encodeURIComponent(t.subject)
      + '&body=' + encodeURIComponent(body.replace(/\n/g, '\r\n'));
  }

  function openQuickReply(id, key) {
    const lead = findLead(id);
    const href = lead ? quickReplyHref(lead, key) : '';
    if (!href) return;
    const a = document.createElement('a');
    a.href = href;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // The number in the browser tab, e.g. "(3) Staff Inbox": messages not yet marked handled.
  function setTitleCount(openCount) {
    document.title = (openCount > 0 ? '(' + openCount + ') ' : '') + 'Staff Inbox | Love RCFE';
  }

  // While the inbox tab is in the background, only the tab's number is refreshed (a small
  // request), so you can see new messages arrive without the page redrawing under you.
  async function refreshTitleCount() {
    try {
      const data = await apiFetch('/api/admin/leads?summary=1');
      if (isSignedIn) setTitleCount(Number(data.open || 0));
    } catch (err) {
      if (err.status === 401) {
        allLeads = [];
        showLogin('Your session has ended. Please sign in again.');
      }
    }
  }

  function renderLeads() {
    // The server's counts cover every stored lead; the loaded ones are only a fallback.
    const openCount = leadCounts ? leadCounts.open : allLeads.filter(l => !l.handled).length;
    const handledCount = leadCounts ? leadCounts.handled : allLeads.filter(l => l.handled).length;
    const callsCount = leadCounts ? leadCounts.openCalls : allLeads.filter(l => l.kind === 'call_request' && !l.handled).length;
    setTitleCount(openCount);

    document.getElementById('stat-open').textContent = openCount;
    document.getElementById('stat-calls').textContent = callsCount;
    document.getElementById('stat-handled').textContent = handledCount;
    document.getElementById('stat-total').textContent = totalLeads || allLeads.length;

    document.querySelectorAll('.filter-btn').forEach(btn => {
      const active = btn.dataset.filter === currentFilter;
      btn.className = active
        ? 'filter-btn px-3.5 py-1.5 rounded-full text-xs font-bold transition bg-brand-green text-white'
        : 'filter-btn px-3.5 py-1.5 rounded-full text-xs font-bold transition text-brand-ink hover:bg-brand-sageLight/40';
    });

    const q = searchQuery.toLowerCase();
    const filtered = allLeads.slice().sort(byNewest).filter(l => {
      if (currentFilter === 'open' && l.handled) return false;
      if (currentFilter === 'handled' && !l.handled) return false;
      if (currentFilter === 'calls' && l.kind !== 'call_request') return false;
      if (!q) return true;
      return [l.name, l.email, l.phone, l.city, l.inquiryType, l.message, l.notes, STAGE_LABELS[l.stage], sourceLabel(l.source), l.ip, l.ipPlace]
        .some(v => String(v || '').toLowerCase().includes(q));
    });

    // "Possible duplicate": another loaded message has the same email or phone number.
    // (The developer console's Duplicate Finder checks more, and can mark them.)
    const keyCounts = new Map();
    const leadKeys = (l) => {
      const keys = [];
      const email = String(l.email || '').trim().toLowerCase();
      if (email) keys.push('e:' + email);
      const digits = String(l.phone || '').replace(/\D/g, '');
      if (digits.length >= 7) keys.push('p:' + digits.slice(-10));
      return keys;
    };
    allLeads.forEach((l) => leadKeys(l).forEach((k) => keyCounts.set(k, (keyCounts.get(k) || 0) + 1)));
    const looksDuplicate = (l) => !l.duplicateOf && leadKeys(l).some((k) => keyCounts.get(k) > 1);
    // "Waiting 2 days": still new and nobody has acted on it for more than a day.
    const waitingDays = (l) => {
      if (l.handled || l.duplicateOf || (l.stage && l.stage !== 'new') || l.firstResponseAt) return 0;
      const t = parseCreatedAt(l.createdAt).getTime();
      const hours = Number.isNaN(t) ? 0 : (Date.now() - t) / 3600000;
      return hours > 24 ? Math.max(1, Math.floor(hours / 24)) : 0;
    };

    const listEl = document.getElementById('leads-list');
    if (!filtered.length) {
      listEl.innerHTML = `
        <div class="surface bg-white rounded-2xl border border-brand-line p-10 text-center">
          <i data-lucide="inbox" class="w-8 h-8 mx-auto text-brand-muted mb-2 opacity-60"></i>
          <p class="text-sm font-bold text-brand-ink">No matching leads</p>
          <p class="text-xs text-brand-muted mt-1">Try switching filter tabs or clearing the search bar.</p>
        </div>
      `;
      refreshIcons();
      return;
    }

    listEl.innerHTML = filtered.map(l => {
      const leadId = Number(l.id);
      const isCall = l.kind === 'call_request';
      const parsedDate = parseCreatedAt(l.createdAt);
      const created = Number.isNaN(parsedDate.getTime())
        ? String(l.createdAt || '')
        : parsedDate.toLocaleString('en-US', {
            month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit'
          });
      const telHref = 'tel:' + encodeURIComponent(String(l.phone || '').replace(/[^+\d]/g, ''));
      const mailHref = 'mailto:' + encodeURIComponent(String(l.email || '').trim());
      return `
        <article class="surface bg-white rounded-2xl border border-brand-line p-5 shadow-sm space-y-3 ${l.handled ? 'opacity-75' : ''}">
          <div class="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-base font-bold text-brand-ink">${escapeHtml(l.name)}</h3>
                <span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full ${isCall ? 'bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300' : 'bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-300'}">
                  ${isCall ? 'Scheduled Call' : 'Enquiry'}
                </span>
                <span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-brand-line text-brand-muted">
                  ${escapeHtml(l.inquiryType)}
                </span>
                ${l.stage && l.stage !== 'new' ? `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-brand-accentLight text-brand-accent">${escapeHtml(STAGE_LABELS[l.stage] || l.stage)}</span>` : ''}
                ${l.handled ? '<span class="text-[11px] font-bold px-2 py-0.5 rounded-full bg-brand-sageLight text-brand-green">Handled</span>' : ''}
                ${DEVICE_TYPES[l.deviceType] ? `<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-brand-line text-brand-muted" title="The kind of device this message was sent from">${DEVICE_TYPES[l.deviceType]}</span>` : ''}
                ${waitingDays(l) ? `<span class="text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300" title="Nobody has replied yet. Move it to another stage once you have called or written.">Waiting ${waitingDays(l)} day${waitingDays(l) === 1 ? '' : 's'}</span>` : ''}
                ${l.duplicateOf ? `<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full border border-brand-line text-brand-muted">Duplicate of #${Number(l.duplicateOf)}</span>` : (looksDuplicate(l) ? '<span class="text-[11px] font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-300" title="Another message has the same email or phone number">Possible duplicate</span>' : '')}
              </div>
              <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-brand-muted mt-1.5">
                <a href="${escapeHtml(telHref)}" class="hover:underline font-semibold text-brand-green flex items-center gap-1">
                  <i data-lucide="phone" class="w-3.5 h-3.5"></i> ${escapeHtml(l.phone)}
                </a>
                <a href="${escapeHtml(mailHref)}" class="hover:underline flex items-center gap-1">
                  <i data-lucide="mail" class="w-3.5 h-3.5"></i> ${escapeHtml(l.email)}
                </a>
                ${l.city ? `<span class="flex items-center gap-1"><i data-lucide="map-pin" class="w-3.5 h-3.5"></i> ${escapeHtml(l.city)}</span>` : ''}
                ${l.preferredDate ? `<span class="flex items-center gap-1 font-semibold text-brand-ink"><i data-lucide="calendar" class="w-3.5 h-3.5"></i> ${escapeHtml(l.preferredDate)} (${escapeHtml(l.preferredTime || '')})</span>` : ''}
              </div>
            </div>
            <div class="text-right">
              <span class="text-[11px] text-brand-muted">${escapeHtml(created)}</span>
              ${l.source ? `<p class="text-[11px] text-brand-muted mt-0.5">From: ${escapeHtml(sourceLabel(l.source))}</p>` : ''}
              ${l.ip ? `<p class="text-[11px] text-brand-muted mt-0.5" title="The internet address this message was sent from. The location is approximate.">IP: <span class="font-semibold text-brand-ink">${escapeHtml(l.ip)}</span>${l.ipPlace ? ` · ${escapeHtml(l.ipPlace)}` : ''}</p>` : ''}
            </div>
          </div>

          <div class="surface-soft bg-brand-cream/70 rounded-xl border border-brand-line p-3.5 text-sm text-brand-ink whitespace-pre-line leading-relaxed">${escapeHtml(l.message)}</div>

          <div class="grid gap-3 sm:grid-cols-[170px_1fr] items-start">
            <label class="text-[11px] font-bold text-brand-muted">Stage
              <select class="lead-field mt-1" data-action="stage" data-lead-id="${leadId}">${stageOptions(l.stage)}</select>
            </label>
            <label class="text-[11px] font-bold text-brand-muted">Staff notes (private)
              <textarea class="lead-field mt-1" rows="2" maxlength="2000" placeholder="Add a note, e.g. called, left voicemail, tour Friday 2pm" data-action="notes" data-lead-id="${leadId}">${escapeHtml(l.notes || '')}</textarea>
              <span id="note-status-${leadId}" class="block text-[11px] font-semibold text-brand-green mt-0.5 min-h-[14px]"></span>
            </label>
          </div>

          <div class="flex flex-wrap items-center justify-end gap-3 pt-1">
            ${l.email ? `<select class="lead-field lead-reply mr-auto" data-action="reply" data-lead-id="${leadId}" aria-label="Reply by email to ${escapeHtml(l.name)}" title="Opens your email app with the message written. Nothing is sent until you press Send there.">
                <option value="">Reply by Email…</option>${replyOptions(l)}
              </select>` : ''}
            <button type="button" data-action="spam" data-lead-id="${leadId}" class="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline" title="Deletes this message and reports the sender's address to the site owner">
              Mark as Spam
            </button>
            <button type="button" data-action="delete" data-lead-id="${leadId}" class="text-xs font-semibold text-red-600 dark:text-red-400 hover:underline">
              Delete
            </button>
            <button type="button" data-action="toggle-handled" data-lead-id="${leadId}" data-next-handled="${!l.handled}" class="px-4 py-1.5 rounded-full text-xs font-bold transition ${l.handled ? 'border border-brand-line text-brand-ink hover:bg-brand-sageLight/40' : 'bg-brand-green text-white hover:bg-brand-greenDark'}">
              ${l.handled ? 'Reopen' : 'Mark Handled'}
            </button>
          </div>
        </article>
      `;
    }).join('');
    refreshIcons();
  }

  function csvCell(value) {
    let s = String(value == null ? '' : value);
    if (/^[\t\r]/.test(s) || /^[ \t\r\n]*[=+\-@|%]/.test(s)) s = "'" + s;
    return '"' + s.replace(/"/g, '""') + '"';
  }

  function exportCsv() {
    if (!allLeads.length) return alert('No leads to export.');
    if (hasMoreLeads && !confirm(`Only the latest ${allLeads.length} of ${totalLeads} leads are loaded. Export these ${allLeads.length} leads anyway?`)) {
      return;
    }
    const headers = ['ID', 'Kind', 'Inquiry Type', 'Name', 'Phone', 'Email', 'City', 'Preferred Date', 'Preferred Time', 'Handled', 'Message', 'Created At', 'Stage', 'Source', 'Notes', 'IP Address', 'IP Location'];
    const rows = allLeads.slice().sort(byNewest).map(l => [
      l.id, l.kind, l.inquiryType, l.name, l.phone, l.email, l.city,
      l.preferredDate || '', l.preferredTime || '', l.handled ? 'Yes' : 'No',
      l.message, l.createdAt, STAGE_LABELS[l.stage] || '', l.source || '', l.notes || '', l.ip || '', l.ipPlace || ''
    ].map(csvCell).join(','));
    const csv = '\ufeff' + [headers.join(','), ...rows].join('\r\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `lovercfe_leads_${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function initStaffApp() {
    const themeBtn = document.getElementById('theme-btn');
    if (themeBtn) {
      themeBtn.addEventListener('click', toggleTheme);
      if (document.documentElement.classList.contains('dark')) {
        themeBtn.setAttribute('aria-label', 'Switch to light mode');
        themeBtn.innerHTML = '<i data-lucide="sun" class="w-4 h-4"></i>';
      }
    }

    const signoutBtn = document.getElementById('signout-btn');
    if (signoutBtn) signoutBtn.addEventListener('click', signOut);

    const refreshBtn = document.getElementById('refresh-btn');
    if (refreshBtn) refreshBtn.addEventListener('click', () => loadLeads());

    const exportBtn = document.getElementById('export-csv-btn');
    if (exportBtn) exportBtn.addEventListener('click', exportCsv);

    const loadMoreBtn = document.getElementById('load-more-btn');
    if (loadMoreBtn) loadMoreBtn.addEventListener('click', loadMoreLeads);

    const loginForm = document.getElementById('login-form');
    if (loginForm) {
      loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const pw = document.getElementById('inbox-password').value;
        const btn = document.getElementById('login-submit');
        const errorEl = document.getElementById('login-error');
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
          sent = true;
          await apiFetch('/api/admin/session', {
            method: 'POST',
            body: JSON.stringify({ password: pw, turnstile_token: token })
          });
          document.getElementById('inbox-password').value = '';
          await loadLeads();
        } catch (err) {
          errorEl.textContent = err.message;
        } finally {
          btn.disabled = false;
          // Each security-check token works only once, so get a fresh one for the next attempt.
          if (sent && loginGate) loginGate.reset();
        }
      });
    }

    document.addEventListener('click', (e) => {
      const filterBtn = e.target.closest && e.target.closest('[data-filter]');
      if (filterBtn) {
        currentFilter = filterBtn.dataset.filter;
        renderLeads();
        return;
      }

      const actionBtn = e.target.closest && e.target.closest('[data-action]');
      if (!actionBtn) return;
      const id = Number(actionBtn.dataset.leadId);
      if (!Number.isInteger(id) || id <= 0) return;

      if (actionBtn.dataset.action === 'delete') {
        deleteLead(id);
      } else if (actionBtn.dataset.action === 'spam') {
        markSpam(id);
      } else if (actionBtn.dataset.action === 'toggle-handled') {
        setHandled(id, actionBtn.dataset.nextHandled === 'true');
      }
    });

    const listEl = document.getElementById('leads-list');
    if (listEl) {
      listEl.addEventListener('change', (e) => {
        const el = e.target;
        if (el && el.dataset && el.dataset.action === 'stage') {
          const id = Number(el.dataset.leadId);
          if (Number.isInteger(id) && id > 0) setStage(id, el.value);
        } else if (el && el.dataset && el.dataset.action === 'reply') {
          const id = Number(el.dataset.leadId);
          const key = el.value;
          el.value = ''; // back to "Reply by email…" so the same reply can be picked again
          if (key && Number.isInteger(id) && id > 0) openQuickReply(id, key);
        }
      });
      listEl.addEventListener('input', (e) => {
        const el = e.target;
        if (el && el.dataset && el.dataset.action === 'notes') {
          const id = Number(el.dataset.leadId);
          if (Number.isInteger(id) && id > 0) noteDraft(id, el.value);
        }
      });
      listEl.addEventListener('focusout', (e) => {
        const el = e.target;
        if (el && el.dataset && el.dataset.action === 'notes') {
          const id = Number(el.dataset.leadId);
          if (Number.isInteger(id) && id > 0) saveNote(id);
        }
      });
    }

    const searchInput = document.getElementById('search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        searchQuery = e.target.value;
        renderLeads();
      });
    }

    // Warn before leaving the page while a note is unsaved, and try to save it on the way out.
    window.addEventListener('beforeunload', (e) => {
      if (isSignedIn && hasUnsavedNotes()) {
        e.preventDefault();
        e.returnValue = '';
      }
    });
    window.addEventListener('pagehide', flushUnsavedNotes);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushUnsavedNotes();
    });

    refreshIcons();
    loadLeads({ silentAuth: true });

    // Auto-refresh every 60s while signed in and the tab is visible. In a background tab,
    // only the number in the tab title is refreshed, every 3 minutes.
    const canRedraw = () => {
      const typing = document.activeElement && document.activeElement.matches('input, textarea, select');
      return isSignedIn && !typing && !hasUnsavedNotes();
    };
    let hiddenTicks = 0;
    setInterval(() => {
      if (!isSignedIn) return;
      if (document.hidden) {
        hiddenTicks += 1;
        if (hiddenTicks % 3 === 0) refreshTitleCount();
        return;
      }
      hiddenTicks = 0;
      if (canRedraw()) loadLeads({ silentAuth: true });
    }, 60000);
    // Coming back to the tab shows the latest messages straight away.
    let lastVisibleLoad = Date.now();
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState !== 'visible' || Date.now() - lastVisibleLoad < 15000) return;
      lastVisibleLoad = Date.now();
      hiddenTicks = 0;
      if (canRedraw()) loadLeads({ silentAuth: true });
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initStaffApp);
  } else {
    initStaffApp();
  }
})();
