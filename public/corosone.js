// Developer console (/corosone).
// Sign-in takes three things: the developer email, the developer password, and a 6-digit
// code emailed to the verification address. All checks happen on the server
// (functions/api/dev/* and lib/dev.js); this file only drives the page.
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

  const $ = (id) => document.getElementById(id);

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
      sent = true;
      await apiFetch('/api/dev/login', {
        method: 'POST',
        body: JSON.stringify({ email, password, turnstile_token: token })
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
      await apiFetch('/api/dev/verify', { method: 'POST', body: JSON.stringify({ code }) });
      $('dev-code').value = '';
      await loadOverview();
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

  // ---------- Console ----------
  const EVENT_LABELS = {
    code_sent: 'Password accepted, code emailed',
    signed_in: 'Signed in',
    signed_out: 'Signed out',
    wrong_password: 'Wrong email or password',
    wrong_code: 'Wrong code entered',
    code_limit: 'Code email limit reached',
    email_failed: 'Code email could not be sent',
    signout_staff: 'Tool: signed out all staff',
    clear_lockouts: 'Tool: cleared sign-in lockouts',
    test_lead_email: 'Tool: sent test lead email'
  };

  const formatTime = (sec) => new Date(Number(sec) * 1000).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
  });

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

  function renderOverview(data) {
    $('stat-total').textContent = data.leads.total;
    $('stat-open').textContent = data.leads.open;
    $('stat-week').textContent = data.leads.lastWeek;
    $('stat-staff').textContent = data.security.staffSessions;
    $('stat-lockouts').textContent = data.security.activeLockouts;
    $('session-info').textContent = 'Signed in as developer. This session ends at '
      + new Date(Number(data.session.expiresAt) * 1000).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
      + ', or when you sign out.';

    const list = $('config-list');
    list.textContent = '';
    configRows(data.config || {}).forEach(([level, text]) => {
      const li = document.createElement('li');
      li.className = 'flex items-baseline';
      const dot = document.createElement('span');
      dot.className = 'status-dot status-' + level;
      dot.setAttribute('aria-hidden', 'true');
      const label = document.createElement('span');
      label.textContent = (level === 'ok' ? '' : level === 'warn' ? 'Note: ' : 'Problem: ') + text;
      li.appendChild(dot);
      li.appendChild(label);
      list.appendChild(li);
    });

    const body = $('activity-body');
    body.textContent = '';
    const activity = Array.isArray(data.activity) ? data.activity : [];
    if (!activity.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = 4;
      td.textContent = 'No activity yet.';
      tr.appendChild(td);
      body.appendChild(tr);
    }
    activity.forEach((item) => {
      const tr = document.createElement('tr');
      const label = Object.prototype.hasOwnProperty.call(EVENT_LABELS, item.event) ? EVENT_LABELS[item.event] : String(item.event || '');
      [formatTime(item.at), label, item.ip || '', item.detail || ''].forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });
      body.appendChild(tr);
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
        showLogin(wasSignedIn ? 'Your session has ended. Please sign in again.' : '');
      } else if (signedIn) {
        $('console-status').textContent = err.message;
      } else if (!silent) {
        showLogin(err.message);
      }
      return false;
    }
  }

  const TOOL_CONFIRM = {
    signout_staff: 'Sign out every staff member from the inbox now?',
    clear_lockouts: 'Clear all sign-in lockouts now?',
    test_lead_email: 'Send a test email through the enquiry notification form? It counts toward the Formspree monthly limit.'
  };

  async function runTool(button) {
    const name = button.getAttribute('data-tool');
    if (!Object.prototype.hasOwnProperty.call(TOOL_CONFIRM, name)) return;
    if (!confirm(TOOL_CONFIRM[name])) return;
    const statusEl = $('tool-status');
    statusEl.className = 'text-xs font-semibold text-brand-muted mt-3 min-h-4';
    statusEl.textContent = 'Working…';
    button.disabled = true;
    try {
      const data = await apiFetch('/api/dev/action', { method: 'POST', body: JSON.stringify({ action: name }) });
      statusEl.className = 'text-xs font-semibold text-brand-green mt-3 min-h-4';
      statusEl.textContent = data.message || 'Done.';
    } catch (err) {
      if (err.status === 401) {
        showLogin('Your session has ended. Please sign in again.');
        return;
      }
      statusEl.className = 'text-xs font-semibold text-red-600 dark:text-red-400 mt-3 min-h-4';
      statusEl.textContent = err.message;
    } finally {
      button.disabled = false;
    }
    loadOverview();
  }

  async function signOut() {
    try {
      await apiFetch('/api/dev/session', { method: 'DELETE' });
    } catch (e) {}
    signedIn = false;
    showLogin('');
  }

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
    $('refresh-btn').addEventListener('click', () => loadOverview());
    document.addEventListener('click', (e) => {
      const toolBtn = e.target.closest && e.target.closest('[data-tool]');
      if (toolBtn) runTool(toolBtn);
    });

    refreshIcons();
    loadOverview({ silent: true });

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
