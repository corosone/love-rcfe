// ==================== SITE SETTINGS ====================
    const CONTACT = {
      email: 'loveRCFE@gmail.com',
      phoneDisplay: '(818) 217-5755',
      phoneCopy: '(818) 217-5755'
    };
    // Leads are saved by the Cloudflare Pages Function at /api/leads (D1 database).
    // Email notifications are sent by that function on the server (FORMSPREE_ENDPOINT in Cloudflare),
    // never from the browser, so every email has passed the Turnstile and rate-limit checks.
    const FORM_ENDPOINT = (typeof window !== 'undefined' && typeof window.__FORM_ENDPOINT__ === 'string' && window.__FORM_ENDPOINT__.startsWith('/'))
      ? window.__FORM_ENDPOINT__
      : '/api/leads';
    const BUSINESS = { tz: 'America/Los_Angeles', openDays: [1, 2, 3, 4, 5, 6], openHour: 8, closeHour: 19 };
    const BOOKING_TIME_CANONICAL = {
      morning: 'Morning (9am - 12pm)',
      afternoon: 'Afternoon (1pm - 4pm)',
      evening: 'Late Afternoon (4pm - 6pm)'
    };

    const t = (text, vars) => (window.LoveI18n
      ? window.LoveI18n.t(text, vars)
      : String(text || '').replace(/\{(\w+)\}/g, (_, k) => (vars && vars[k] !== undefined ? vars[k] : `{${k}}`)));
    const currentLocale = () => (window.LoveI18n ? window.LoveI18n.getIntlLocale() : 'en-US');

    let currentView = 'home';
    let quizCurrentStep = 1;
    let hasNavigated = false;
    let bookingCloseTimer = null;

    // ==================== MODAL MANAGER (focus, scroll lock, Esc, Tab trap) ====================
    const modalStack = [];
    let lastFocused = null;
    const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

    function openModal(id) {
      const modal = document.getElementById(id);
      if (!modal) return;
      if (!modalStack.length) lastFocused = document.activeElement;
      modalStack.slice().forEach(other => { if (other !== id) closeModal(other, false); });
      modal.classList.remove('hidden');
      modal.setAttribute('tabindex', '-1');
      if (!modalStack.includes(id)) modalStack.push(id);
      document.body.style.overflow = 'hidden';
      refreshIcons();
      requestAnimationFrame(() => focusInModal(modal));
    }

    function focusInModal(modal) {
      const target = modal.querySelector('[data-autofocus], input:not([type="hidden"]), select, textarea, .quiz-option-btn') || modal.querySelector(FOCUSABLE) || modal;
      target.focus();
    }

    function closeModal(id, restoreFocus = true) {
      const modal = document.getElementById(id);
      if (!modal) return;
      modal.classList.add('hidden');
      const idx = modalStack.indexOf(id);
      if (idx > -1) modalStack.splice(idx, 1);
      if (id === 'booking-modal') {
        if (bookingCloseTimer) {
          clearTimeout(bookingCloseTimer);
          bookingCloseTimer = null;
        }
        const status = document.getElementById('booking-status');
        if (status) status.textContent = '';
      }
      if (!modalStack.length) {
        document.body.style.overflow = '';
        if (restoreFocus && lastFocused && document.contains(lastFocused) && typeof lastFocused.focus === 'function') {
          lastFocused.focus();
        }
      }
    }

    // ==================== CLICK-TO-CALL ====================
    function deviceCanDial() {
      const ua = navigator.userAgent || '';
      return /Android|iPhone|iPad|iPod|Windows Phone/i.test(ua) || (/Macintosh/i.test(ua) && navigator.maxTouchPoints > 1);
    }

    // Phones dial natively. Desktops usually have no handler for tel: links (so clicks did nothing), so show a call card instead.
    document.addEventListener('click', event => {
      const link = event.target.closest && event.target.closest('a[href^="tel:"]');
      if (!link || link.hasAttribute('data-native-tel')) return;
      if (deviceCanDial()) return;
      event.preventDefault();
      openCallModal();
    });

    function getBusinessStatus(now = new Date()) {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: BUSINESS.tz, weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23'
      }).formatToParts(now);
      const get = type => parts.find(p => p.type === type).value;
      const dayIndex = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
      const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
      const day = dayIndex[get('weekday')];
      const minutes = (parseInt(get('hour'), 10) % 24) * 60 + parseInt(get('minute'), 10);
      const openToday = BUSINESS.openDays.includes(day);

      if (openToday && minutes >= BUSINESS.openHour * 60 && minutes < BUSINESS.closeHour * 60) {
        return { open: true, text: t('Open now, closes at 7:00 PM PT') };
      }
      if (openToday && minutes < BUSINESS.openHour * 60) {
        return { open: false, text: t('Closed right now, opens today at 8:00 AM PT') };
      }
      for (let i = 1; i <= 7; i++) {
        const next = (day + i) % 7;
        if (BUSINESS.openDays.includes(next)) {
          const when = i === 1 ? t('tomorrow') : t(dayNames[next]);
          return { open: false, text: t('Closed right now, opens {when} at 8:00 AM PT', { when }) };
        }
      }
      return { open: false, text: t('Closed right now') };
    }

    function updateCallStatus() {
      const el = document.getElementById('call-modal-status');
      if (!el) return;
      const status = getBusinessStatus();
      el.innerHTML = '<span class="w-2 h-2 rounded-full ' + (status.open ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500') + '"></span><span></span>';
      el.lastElementChild.textContent = status.text;
    }

    function openCallModal() {
      updateCallStatus();
      openModal('call-modal');
    }

    function closeCallModal() {
      closeModal('call-modal');
    }

    async function copyPhoneNumber() {
      const btn = document.getElementById('call-copy-btn');
      const label = btn ? btn.querySelector('span') : null;
      let copied = false;
      try {
        await navigator.clipboard.writeText(CONTACT.phoneCopy);
        copied = true;
      } catch (err) {
        try {
          const ta = document.createElement('textarea');
          ta.value = CONTACT.phoneCopy;
          ta.setAttribute('readonly', '');
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e) { copied = false; }
      }
      if (label) {
        label.textContent = copied ? t('Copied') : t('Press Ctrl+C to copy');
        setTimeout(() => { label.textContent = t('Copy number'); }, 2200);
      }
    }

    // ==================== QUIZ ANSWER LABELS (readable text for pre-filled messages) ====================
    const ANSWER_LABELS = {
      'elder-parent': 'Elder parent or relative', spouse: 'Spouse or partner', self: 'Myself',
      client: 'A client or patient (social worker / discharge planner)',
      sharp: 'Sharp and clear', mild: 'Mild forgetfulness', dementia: "Alzheimer's or moderate dementia",
      independent: 'Independent or minimal help', assist: 'Help with bathing, dressing, or transfers', total: 'Bedridden or total care',
      immediate: 'Immediate (1-7 days)', soon: 'Next 30-60 days', research: 'Future research'
    };
    const answerLabel = key => t(ANSWER_LABELS[key] || 'Not answered');

    function selectInquiryType(text) {
      document.querySelectorAll('input[name="inquiry_type"]').forEach(radio => {
        radio.checked = radio.value.includes(text);
      });
    }

    // ==================== SENDING LEADS ====================
    async function postJson(url, record) {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(record)
      });
      const data = await res.json().catch(() => ({}));
      return { res, data };
    }

    // ==================== TURNSTILE (spam protection) ====================
    const TURNSTILE_SITE_KEY = '0x4AAAAAAF_J9TXjVKsqM-AR';
    const TURNSTILE_SCRIPT_URL = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit&onload=initTurnstile';
    const tsWidgets = {};
    let tsScriptLoading = false;
    // Cloudflare's Turnstile script is downloaded the first time an enquiry form is on screen,
    // not on every page view. When it has loaded, it calls window.initTurnstile (see the URL).
    function loadTurnstileScript() {
      if (window.turnstile || tsScriptLoading) return;
      tsScriptLoading = true;
      const showErrors = () => {
        if (window.turnstile) return;
        document.querySelectorAll('.cf-ts').forEach(el => {
          if (tsWidgets[el.id] === undefined) tsShowError(el);
        });
      };
      const script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      script.crossOrigin = 'anonymous';
      script.referrerPolicy = 'no-referrer';
      script.addEventListener('error', () => {
        // Blocked or offline: say so now, and try again the next time a form is shown.
        script.remove();
        tsScriptLoading = false;
        showErrors();
      });
      document.head.appendChild(script);
      // Still not here after 10 seconds: show the message. If the script does arrive later,
      // initTurnstile replaces the message with the real check.
      setTimeout(showErrors, 10000);
    }
    function initTurnstile() {
      // A widget renders when its page or popup is shown
      const pending = Array.from(document.querySelectorAll('.cf-ts')).filter(el =>
        tsWidgets[el.id] === undefined && !el.closest('[hidden], .hidden'));
      if (!pending.length) return;
      if (!window.turnstile) { loadTurnstileScript(); return; }
      const tsTheme = document.documentElement.classList.contains('dark') ? 'dark' : 'light';
      pending.forEach(el => {
        try {
          el.textContent = ''; // clears an earlier "could not load" message
          tsWidgets[el.id] = turnstile.render(el, { sitekey: TURNSTILE_SITE_KEY, theme: tsTheme });
        } catch (e) { tsShowError(el); }
      });
    }
    function tsShowError(el) {
      el.innerHTML = '';
      const p = document.createElement('p');
      p.className = 'text-xs font-semibold text-red-600 dark:text-red-400';
      p.textContent = t('The security check could not load. Please turn off ad blockers for this site, or call (818) 217-5755 or email loveRCFE@gmail.com.');
      el.appendChild(p);
    }
    window.addEventListener('load', initTurnstile);
    function tsToken(id) {
      try { return tsWidgets[id] !== undefined ? (turnstile.getResponse(tsWidgets[id]) || '') : ''; } catch (e) { return ''; }
    }
    function tsReset(id) {
      try { if (tsWidgets[id] !== undefined) turnstile.reset(tsWidgets[id]); } catch (e) {}
    }

    async function sendLead(record, tsId) {
      const token = tsToken(tsId);
      try {
        return await sendLeadInner(record, token);
      } finally {
        tsReset(tsId);
      }
    }

    async function sendLeadInner(record, token) {
      if (!FORM_ENDPOINT) return { ok: false, reason: 'no-endpoint' };

      if (/\b\d{3}-\d{2}-\d{4}\b/.test(String(record.message || ''))) {
        return {
          ok: false,
          validationError: t('For your privacy, please do not include Social Security numbers in web messages.'),
          reason: 'validation'
        };
      }

      try {
        const { res, data } = await postJson(FORM_ENDPOINT, { ...record, source: (location.hash || '#home').replace('#', '').slice(0, 40), turnstile_token: token });

        if (res.status >= 400 && res.status < 500) {
          return {
            ok: false,
            validationError: data.error ? t(data.error) : t('Please check the highlighted fields.'),
            reason: 'validation'
          };
        }

        if (res.ok) return { ok: true, reason: '' };

        // Server error: the form handlers offer the email-draft / phone fallback
        return { ok: false, reason: 'http-' + res.status };
      } catch (err) {
        return { ok: false, reason: 'network' };
      }
    }

    function openMailDraft(record) {
      const subject = `[Love RCFE] ${record.inquiry_type} from ${record.name}`;
      const body = [
        `Name: ${record.name}`,
        `Phone: ${record.phone}`,
        `Email: ${record.email}`,
        record.city ? `City/Region: ${record.city}` : '',
        `Topic: ${record.inquiry_type}`,
        '',
        record.message
      ].filter((line, i) => line !== '' || i === 5).join('\n');
      const mailtoUrl = `mailto:${CONTACT.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      try {
        const link = document.createElement('a');
        link.href = mailtoUrl;
        link.rel = 'noopener noreferrer';
        link.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:1px;height:1px;opacity:0;';
        document.body.appendChild(link);
        link.click();
        setTimeout(() => {
          if (link.parentNode) link.parentNode.removeChild(link);
        }, 500);
      } catch (e) {
        window.location.href = mailtoUrl;
      }
      return mailtoUrl;
    }

    // Set dynamic current year in footer
    const currentYearEl = document.getElementById('current-year');
    if (currentYearEl) currentYearEl.textContent = new Date().getFullYear();

    // Available Views
    const viewNames = new Set(['home', 'services', 'tools', 'approach', 'contact', 'support', 'terms', 'privacy']);

    // Safe Lucide icon refresh
    function refreshIcons() {
      if (window.lucide && typeof lucide.createIcons === 'function') {
        lucide.createIcons();
      }
    }

    const VIEW_TITLES = {
      home: 'Love RCFE | Thoughtful Guidance for Elder Care & Residential Care Facilities',
      services: 'Our Services | Love RCFE Elder Care & Operator Consulting',
      tools: 'Care Tools & Cost Calculators | Love RCFE',
      approach: 'Our Approach | Love RCFE Compassionate Care',
      support: 'Support & FAQs | Love RCFE',
      contact: 'Contact Us | Love RCFE Advisory Team',
      terms: 'Terms of Use | Love RCFE',
      privacy: 'Privacy Policy | Love RCFE'
    };

    function updateDocumentTitle(viewName) {
      document.title = t(VIEW_TITLES[viewName] || 'Love RCFE');
    }

    // View Routing
    function openView(name, updateHistory = true) {
      if (name === 'main-content') return;
      const chosen = viewNames.has(name) ? name : 'home';
      currentView = chosen;
      
      // Toggle view visibility
      document.querySelectorAll('.view').forEach(view => {
        view.hidden = view.id !== chosen;
      });

      // Update Nav links (Desktop and Mobile)
      document.querySelectorAll('[data-view-link]').forEach(link => {
        if (link.dataset.viewLink === chosen) {
          link.setAttribute('aria-current', 'page');
        } else {
          link.removeAttribute('aria-current');
        }
      });

      // Close mobile menu if open
      closeMobileMenu();

      // Update browser history
      if (updateHistory && location.hash !== '#' + chosen) {
        history.pushState({ view: chosen }, '', '#' + chosen);
      }

      // Update Document Title
      updateDocumentTitle(chosen);

      // Snappy view top reset without sluggish scroll animation
      document.documentElement.classList.remove('scroll-smooth');
      window.scrollTo(0, 0);
      setTimeout(() => {
        document.documentElement.classList.add('scroll-smooth');
      }, 40);

      // Move focus to the new view for keyboard / screen reader users (not on first page load)
      const mainEl = document.getElementById('main-content');
      if (hasNavigated && mainEl) {
        mainEl.setAttribute('tabindex', '-1');
        mainEl.focus({ preventScroll: true });
      }
      hasNavigated = true;

      // Refresh icons in newly revealed view
      refreshIcons();

      // Spam-check widget renders once its page is visible
      if (typeof initTurnstile === 'function') initTurnstile();
    }

    // ==================== DARK / LIGHT MODE CONTROLLER ====================
    function initTheme() {
      try {
        const saved = localStorage.getItem('lovercfe_theme');
        // First-time visitors always default to light mode first; only activate dark if explicitly saved
        const isDark = saved === 'dark';
        applyTheme(isDark);
      } catch (e) {
        applyTheme(false);
      }
    }

    function toggleTheme() {
      const isDark = document.documentElement.classList.contains('dark');
      const nextDark = !isDark;
      applyTheme(nextDark);
      try {
        localStorage.setItem('lovercfe_theme', nextDark ? 'dark' : 'light');
      } catch (e) {}
    }

    function applyTheme(isDark) {
      if (isDark) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }

      // Desktop theme icons
      const moon = document.getElementById('theme-moon-icon');
      const sun = document.getElementById('theme-sun-icon');
      if (moon && sun) {
        if (isDark) {
          moon.classList.add('hidden');
          sun.classList.remove('hidden');
        } else {
          moon.classList.remove('hidden');
          sun.classList.add('hidden');
        }
      }

      // Mobile theme icons & labels
      document.querySelectorAll('.theme-moon-mobile').forEach(el => {
        if (isDark) el.classList.add('hidden');
        else el.classList.remove('hidden');
      });
      document.querySelectorAll('.theme-sun-mobile').forEach(el => {
        if (isDark) el.classList.remove('hidden');
        else el.classList.add('hidden');
      });
      document.querySelectorAll('.theme-label-mobile').forEach(el => {
        el.textContent = t(isDark ? 'Light Mode' : 'Dark Mode');
      });

      // Update accessibility labels & aria-pressed state
      const themeLabel = t(isDark ? 'Switch to light mode' : 'Switch to dark mode');
      const themeBtn = document.getElementById('theme-toggle-btn');
      if (themeBtn) {
        themeBtn.setAttribute('aria-label', themeLabel);
        themeBtn.setAttribute('title', themeLabel);
        themeBtn.setAttribute('aria-pressed', isDark ? 'true' : 'false');
      }
      document.querySelectorAll('.theme-toggle-btn').forEach(btn => {
        btn.setAttribute('aria-label', themeLabel);
      });

      // Sync mobile browser chrome / status bar theme color
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute('content', isDark ? '#121915' : '#315d48');

      refreshIcons();
    }

    // ==================== CARE BUDGET CALCULATOR ENGINE ====================
    const neonState = {
      display: '0',
      prev: null,
      op: null,
      resetNext: false,
      history: ''
    };

    function updateNeonUI() {
      const displayEl = document.getElementById('neon-display');
      const historyEl = document.getElementById('neon-history');
      if (displayEl) {
        displayEl.textContent = neonState.display;
      }
      if (historyEl) {
        historyEl.innerHTML = neonState.history ? escapeHtml(neonState.history) : '&nbsp;';
      }
    }

    function neonFormatOp(op) {
      if (op === '*') return '×';
      if (op === '/') return '÷';
      if (op === '-') return '−';
      return op;
    }

    function neonCompute(a, b, op) {
      const numA = parseFloat(a);
      const numB = parseFloat(b);
      if (isNaN(numA) || isNaN(numB)) return numB || 0;
      let res = 0;
      switch (op) {
        case '+': res = numA + numB; break;
        case '-': res = numA - numB; break;
        case '*': res = numA * numB; break;
        case '/':
          if (numB === 0) return 'ERROR';
          res = numA / numB;
          break;
        default: return numB;
      }
      // Round to 8 decimal places max to prevent floating-point artifacts
      const rounded = Math.round(res * 100000000) / 100000000;
      return String(rounded);
    }

    function neonInput(type, val) {
      if (type === 'AC') {
        neonState.display = '0';
        neonState.prev = null;
        neonState.op = null;
        neonState.resetNext = false;
        neonState.history = '';
        updateNeonUI();
        return;
      }
      if (type === 'C') {
        neonState.display = '0';
        neonState.resetNext = false;
        updateNeonUI();
        return;
      }
      if (type === 'BACK') {
        if (neonState.resetNext || neonState.display === 'ERROR') {
          neonState.display = '0';
          neonState.resetNext = false;
        } else if (neonState.display.length > 1) {
          neonState.display = neonState.display.slice(0, -1);
          if (neonState.display === '-' || neonState.display === '') neonState.display = '0';
        } else {
          neonState.display = '0';
        }
        updateNeonUI();
        return;
      }
      if (type === 'SIGN') {
        if (neonState.display !== '0' && neonState.display !== 'ERROR') {
          if (neonState.display.startsWith('-')) {
            neonState.display = neonState.display.slice(1);
          } else {
            neonState.display = '-' + neonState.display;
          }
        }
        updateNeonUI();
        return;
      }
      if (type === 'NUM') {
        if (neonState.display === '0' || neonState.resetNext || neonState.display === 'ERROR') {
          neonState.display = val;
          neonState.resetNext = false;
        } else {
          if (neonState.display.replace(/[^0-9]/g, '').length < 12) {
            neonState.display += val;
          }
        }
        updateNeonUI();
        return;
      }
      if (type === 'DOT') {
        if (neonState.resetNext || neonState.display === 'ERROR') {
          neonState.display = '0.';
          neonState.resetNext = false;
        } else if (!neonState.display.includes('.')) {
          neonState.display += '.';
        }
        updateNeonUI();
        return;
      }
      if (type === 'OP') {
        if (neonState.display === 'ERROR') return;
        if (neonState.op && !neonState.resetNext && neonState.prev !== null) {
          const res = neonCompute(neonState.prev, neonState.display, neonState.op);
          neonState.display = String(res);
          neonState.prev = res;
        } else {
          neonState.prev = neonState.display;
        }
        neonState.op = val;
        neonState.history = `${neonState.prev} ${neonFormatOp(val)}`;
        neonState.resetNext = true;
        updateNeonUI();
        return;
      }
      if (type === 'EQUALS') {
        if (neonState.op && neonState.prev !== null) {
          const current = neonState.display;
          const res = neonCompute(neonState.prev, current, neonState.op);
          neonState.history = `${neonState.prev} ${neonFormatOp(neonState.op)} ${current} =`;
          neonState.display = String(res);
          neonState.prev = null;
          neonState.op = null;
          neonState.resetNext = true;
          updateNeonUI();
        }
        return;
      }
    }

    function toggleNeonCalculator() {
      const widget = document.getElementById('neon-calculator-widget');
      const btn = document.getElementById('toggle-neon-calc-btn');
      if (!widget) return;
      const isHidden = widget.classList.contains('hidden');
      if (isHidden) {
        widget.classList.remove('hidden');
        if (btn) { btn.setAttribute('aria-expanded', 'true'); btn.setAttribute('aria-label', t('Hide calculator')); btn.title = t('Hide the budget calculator'); }
        widget.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      } else {
        widget.classList.add('hidden');
        if (btn) { btn.setAttribute('aria-expanded', 'false'); btn.setAttribute('aria-label', t('Open calculator')); btn.title = t('Open the budget calculator'); }
      }
      refreshIcons();
    }

    async function copyNeonResult() {
      const val = neonState.display;
      const label = document.getElementById('neon-copy-label');
      let copied = false;
      try {
        await navigator.clipboard.writeText(val);
        copied = true;
      } catch (err) {
        try {
          const ta = document.createElement('textarea');
          ta.value = val;
          ta.style.position = 'fixed';
          ta.style.opacity = '0';
          document.body.appendChild(ta);
          ta.select();
          copied = document.execCommand('copy');
          document.body.removeChild(ta);
        } catch (e) { copied = false; }
      }
      if (label) {
        label.textContent = copied ? t('Copied!') : t('Failed');
        setTimeout(() => { label.textContent = t('Copy'); }, 1500);
      }
    }

    function applyNeonToBudget() {
      const num = parseFloat(neonState.display);
      if (isNaN(num) || num <= 0) {
        alert(t('Please enter or calculate a valid budget amount on the calculator first.'));
        return;
      }
      const formatted = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(num);
      
      const messageField = document.getElementById('message');
      if (messageField) {
        messageField.value = t(
          "Hello Love RCFE Team,\n\nI calculated my family's monthly elder care budget using your calculator at approximately {amount}/month.\n\nPlease provide vetted licensed residential care facility (RCFE) recommendations and cost breakdown options that fit within this budget.",
          { amount: formatted }
        );
      }
      selectInquiryType('Family Care');
      openView('contact');
      const msgEl = document.getElementById('message');
      if (msgEl) {
        setTimeout(() => {
          msgEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          msgEl.focus();
        }, 200);
      }
    }

    // Keyboard support for the calculator
    document.addEventListener('keydown', e => {
      const widget = document.getElementById('neon-calculator-widget');
      // Only when the calculator is actually on screen (open, and its page is the one showing)
      if (!widget || widget.classList.contains('hidden') || widget.offsetParent === null) return;
      // Leave shortcuts (Ctrl+C, Cmd+R, Alt+…) and popups alone
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || modalStack.length) return;

      // Leave keys alone while focus is on anything interactive: form fields, buttons,
      // links (Enter must still open a focused link), and editable content.
      const active = document.activeElement;
      if (active && active !== document.body && active.closest &&
          active.closest('input, textarea, select, button, a[href], summary, [contenteditable]:not([contenteditable="false"]), [role="button"], [role="link"], [role="menuitem"], [role="tab"]')) return;

      if (e.key >= '0' && e.key <= '9') {
        neonInput('NUM', e.key);
      } else if (e.key === '.') {
        neonInput('DOT');
      } else if (e.key === '+' || e.key === '-' || e.key === '*' || e.key === '/') {
        neonInput('OP', e.key);
      } else if (e.key === 'Enter' || e.key === '=') {
        e.preventDefault();
        neonInput('EQUALS');
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        neonInput('BACK');
      } else if (e.key === 'Escape') {
        neonInput('AC');
      } else if (e.key.toLowerCase() === 'c') {
        neonInput('C');
      }
    });

    // Attach click listeners to all view links
    document.addEventListener('DOMContentLoaded', () => {
      // Initialize theme (Dark / Light mode)
      initTheme();
      document.querySelectorAll('[data-view-link]').forEach(link => {
        link.addEventListener('click', event => {
          event.preventDefault();
          const target = link.dataset.viewLink;
          openView(target);
        });
      });

      // Initialize initial view from hash
      const initialView = location.hash ? location.hash.slice(1) : 'home';
      openView(initialView, false);

      // Create Lucide Icons
      refreshIcons();

      // Calculator values, booking date picker, and quiz progress bar.
      // Each runs on its own so one failure can't stop the others (or the skip link below).
      [calculateCosts, initBookingDatePicker, () => updateQuizProgress(1)].forEach(step => {
        try { step(); } catch (err) { console.error('Init step failed:', err); }
      });

      // Skip link: jump to content without changing the hash (which would break view routing)
      const skipLink = document.querySelector('a[href="#main-content"]');
      if (skipLink) {
        skipLink.addEventListener('click', event => {
          event.preventDefault();
          const mainEl = document.getElementById('main-content');
          mainEl.setAttribute('tabindex', '-1');
          mainEl.focus();
        });
      }
    });

    window.addEventListener('load', refreshIcons);

    // Single unified routing handler to prevent double execution from both popstate and hashchange
    let isRouting = false;
    function handleRoute() {
      if (isRouting) return;
      isRouting = true;
      const target = location.hash ? location.hash.slice(1) : 'home';
      openView(target, false);
      setTimeout(() => { isRouting = false; }, 60);
    }
    window.addEventListener('popstate', handleRoute);
    window.addEventListener('hashchange', handleRoute);

    // Mobile Menu Toggle
    const mobileMenuBtn = document.getElementById('mobile-menu-btn');
    const mobileMenu = document.getElementById('mobile-menu');
    const hamburgerIcon = document.getElementById('hamburger-icon');
    const closeIcon = document.getElementById('close-icon');

    function toggleMobileMenu() {
      const isExpanded = mobileMenuBtn.getAttribute('aria-expanded') === 'true';
      mobileMenuBtn.setAttribute('aria-expanded', !isExpanded);
      mobileMenu.classList.toggle('hidden');
      hamburgerIcon.classList.toggle('hidden');
      closeIcon.classList.toggle('hidden');
    }

    function closeMobileMenu() {
      if (mobileMenu && !mobileMenu.classList.contains('hidden')) {
        mobileMenu.classList.add('hidden');
        if (mobileMenuBtn) mobileMenuBtn.setAttribute('aria-expanded', 'false');
        if (hamburgerIcon) hamburgerIcon.classList.remove('hidden');
        if (closeIcon) closeIcon.classList.add('hidden');
      }
    }

    if (mobileMenuBtn) {
      mobileMenuBtn.addEventListener('click', toggleMobileMenu);
    }

    // Header Scroll Shadow & Back to top button listener
    window.addEventListener('scroll', () => {
      const header = document.querySelector('header');
      if (header) {
        if (window.scrollY > 20) {
          header.classList.add('is-scrolled');
        } else {
          header.classList.remove('is-scrolled');
        }
      }

      const backToTop = document.getElementById('back-to-top');
      if (backToTop) {
        if (window.scrollY > 350) {
          backToTop.classList.add('visible');
        } else {
          backToTop.classList.remove('visible');
        }
      }
    });

    // ==================== INTERACTIVE TOOLS LOGIC ====================
    // Tabs switcher
    function switchToolTab(tabName) {
      const tabs = ['calculator', 'quiz', 'roadmap'];
      tabs.forEach(tab => {
        const el = document.getElementById('tool-' + tab);
        const btn = document.getElementById('tab-btn-' + tab);
        const active = tab === tabName;
        if (btn) btn.setAttribute('aria-selected', active ? 'true' : 'false');
        if (active) {
          if (el) el.classList.remove('hidden');
          if (btn) btn.className = 'px-3 sm:px-5 py-2.5 min-w-0 rounded-full text-xs min-[360px]:text-sm font-semibold transition bg-brand-green text-white shadow-sm';
        } else {
          if (el) el.classList.add('hidden');
          if (btn) btn.className = 'px-3 sm:px-5 py-2.5 min-w-0 rounded-full text-xs min-[360px]:text-sm font-semibold transition text-brand-ink hover:text-brand-green';
        }
      });
      refreshIcons();
    }

    // Cost Calculator
    function calculateCosts() {
      const regionEl = document.getElementById('calc-region');
      const careLevelEl = document.getElementById('calc-care-level');
      if (!regionEl || !careLevelEl) return;

      const region = regionEl.value;
      const careLevel = careLevelEl.value;
      const isShared = document.querySelector('input[name="calc-room"]:checked')?.value === 'shared';

      // Base rates by region (Board & Care / RCFE base)
      let base = 4800;
      if (region === 'bay-area') base = 5800;
      else if (region === 'socal') base = 5000;
      else if (region === 'central-valley') base = 4200;
      else if (region === 'rural') base = 3800;

      // Add care level adjustments
      let careAddOn = 0;
      if (careLevel === 'moderate') careAddOn = 800;
      else if (careLevel === 'memory') careAddOn = 1600;
      else if (careLevel === 'advanced') careAddOn = 2400;

      // Shared room discount
      if (isShared) {
        base = Math.round(base * 0.78);
      }

      const totalRCFE = base + careAddOn;
      const lowRange = Math.round(totalRCFE * 0.95);
      const highRange = Math.round(totalRCFE * 1.15);

      const facilityPrice = Math.round(totalRCFE * 1.25);
      
      // Home care in California: 24/7 care requires 720 hours/month (3 shifts of caregivers per day).
      // CA prevailing agency rates range from $30-$42/hr depending on region and care level.
      let agencyHourly = 34;
      if (region === 'bay-area') agencyHourly = 42;
      else if (region === 'socal') agencyHourly = 36;
      else if (region === 'central-valley') agencyHourly = 32;
      else if (region === 'rural') agencyHourly = 30;

      if (careLevel === 'memory' || careLevel === 'advanced') {
        agencyHourly += 4;
      } else if (careLevel === 'moderate') {
        agencyHourly += 2;
      }
      const homeCarePrice = 720 * agencyHourly;

      const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

      const rangeEl = document.getElementById('calc-result-range');
      const rcfeEl = document.getElementById('calc-rcfe-price');
      const facEl = document.getElementById('calc-facility-price');
      const homeEl = document.getElementById('calc-homecare-price');

      const perMo = t('/mo');
      if (rangeEl) rangeEl.textContent = `${formatter.format(lowRange)} – ${formatter.format(highRange)}`;
      if (rcfeEl) rcfeEl.textContent = `${formatter.format(totalRCFE)}${perMo}`;
      if (facEl) facEl.textContent = `${formatter.format(facilityPrice)}${perMo}`;
      if (homeEl) homeEl.textContent = `${formatter.format(homeCarePrice)}${perMo}`;
    }

    // Pre-fill contact form from calculator estimate
    function prefillContactFromEstimate() {
      const regionEl = document.getElementById('calc-region');
      const careLevelEl = document.getElementById('calc-care-level');
      const roomType = document.querySelector('input[name="calc-room"]:checked')?.value || 'private';
      const range = document.getElementById('calc-result-range')?.textContent || '$5,200 – $6,400';

      const regionText = regionEl ? regionEl.options[regionEl.selectedIndex].text : 'California';
      const careText = careLevelEl ? careLevelEl.options[careLevelEl.selectedIndex].text : 'Moderate Care';

      const messageField = document.getElementById('message');
      if (messageField) {
        messageField.value = t(
          "Hello Love RCFE Team,\n\nI used your cost calculator and would like personalized recommendations for care:\n• Region: {region}\n• Care Level: {care}\n• Room Preference: {room}\n• Estimated Monthly Budget: {range}\n\nPlease reach out to me with vetted licensed care facilities that match this criteria.",
          {
            region: regionText,
            care: careText,
            room: t(roomType === 'private' ? 'Private Room' : 'Shared / Semi-Private'),
            range
          }
        );
      }

      selectInquiryType('Family Care');
      openView('contact');
    }

    // ==================== CARE LEVEL ASSESSMENT QUIZ ENGINE ====================
    const quizState = { 1: null, 2: null, 3: null, 4: null };

    function updateQuizProgress(step) {
      quizCurrentStep = step;
      const textEl = document.getElementById('quiz-progress-text');
      const percentEl = document.getElementById('quiz-progress-percent');
      const barEl = document.getElementById('quiz-progress-bar');
      const wrapperEl = document.getElementById('quiz-progress-wrapper');

      if (step > 4) {
        if (wrapperEl) wrapperEl.classList.add('hidden');
        return;
      }
      if (wrapperEl) wrapperEl.classList.remove('hidden');

      const pct = Math.round((step / 4) * 100);
      if (textEl) textEl.textContent = t('Question {step} of 4', { step });
      if (percentEl) percentEl.textContent = t('{pct}% Complete', { pct });
      if (barEl) barEl.style.width = `${pct}%`;
    }

    function setQuizAnswer(step, answer) {
      quizState[step] = answer;
      const currentStepEl = document.getElementById(`quiz-step-${step}`);
      if (currentStepEl) currentStepEl.classList.add('hidden');

      if (step < 4) {
        const nextStep = step + 1;
        const nextStepEl = document.getElementById(`quiz-step-${nextStep}`);
        if (nextStepEl) nextStepEl.classList.remove('hidden');
        updateQuizProgress(nextStep);
      } else {
        updateQuizProgress(5);
        renderQuizResult();
      }
      refreshIcons();
    }

    function prevQuizStep(targetStep) {
      for (let i = 1; i <= 4; i++) {
        const el = document.getElementById(`quiz-step-${i}`);
        if (el) {
          if (i === targetStep) el.classList.remove('hidden');
          else el.classList.add('hidden');
        }
      }
      const resultEl = document.getElementById('quiz-result');
      if (resultEl) resultEl.classList.add('hidden');
      updateQuizProgress(targetStep);
      refreshIcons();
    }

    // Unified Care Recommendation Engine (single source of truth for both in-page & modal wizard)
    function getCareRecommendation(answers) {
      let recTitle = 'Residential 6-Bed Care Home (RCFE / Board & Care)';
      let recDesc = 'Your loved one is best served by an intimate residential board-and-care home offering 24-hour awake assistance for dressing, bathing, medication management, and warm home-cooked meals in a cozy family neighborhood.';
      let questions = [
        'Are medications managed and logged by trained caregivers under strict physician orders?',
        'Is night staff awake or on-call sleep? (Awake staff is strongly recommended).',
        'Can residents bring their own familiar bedroom furniture?',
        'What is the monthly rate stability policy when care needs increase?'
      ];

      if (answers[2] === 'dementia') {
        recTitle = 'Specialized Memory Care Community or Secured RCFE';
        recDesc = 'Given memory impairment and potential wandering risks, your loved one requires a state-licensed facility with certified delayed egress security, dementia-trained 24/7 care staff, and predictable sensory routines.';
        questions = [
          'Does the home have an approved Dementia Plan of Operation on file with CDSS?',
          'Are perimeter pathways and exits secured with delayed egress and audible chimes?',
          'What is the staff-to-resident ratio during the night shift?',
          'How does staff redirect agitation or exit-seeking without chemical sedation?'
        ];
      } else if (answers[3] === 'total') {
        recTitle = 'High-Acuity Residential Board & Care with Hospice Waiver';
        recDesc = 'Because significant help with mobility, turning, or transfers is necessary, an intimate 6-bed residential home provides the essential 1-on-3 caregiver ratio required to prevent falls, skin breakdown, and hospital readmissions.';
        questions = [
          'Does the facility have an active Bedridden Clearance and Hospice Waiver for the room?',
          'Can caregivers perform 2-person physical transfers or operate a hoyer lift safely?',
          'How frequently are non-ambulatory residents turned and repositioned?',
          'Does the visiting home health or hospice nurse have direct 24/7 coordination with staff?'
        ];
      } else if (answers[3] === 'independent') {
        recTitle = 'Assisted Living Community / Independent Living';
        recDesc = 'Your loved one remains largely independent but will thrive with nutritious meal service, vibrant social activities, housekeeping, and medication cueing to maintain dignity and prevent loneliness.';
        questions = [
          'What social activities, gardening, and creative programs take place daily?',
          'Are transportation services provided for doctor appointments and shopping?',
          'How are changes in health or subtle cognitive changes reported to family?'
        ];
      }

      return {
        recTitle: t(recTitle),
        recDesc: t(recDesc),
        questions: questions.map(q => t(q)),
        isImmediate: answers[4] === 'immediate'
      };
    }

    function renderQuizResult() {
      const resultEl = document.getElementById('quiz-result');
      const titleEl = document.getElementById('result-title');
      const descEl = document.getElementById('result-description');
      const checklistEl = document.getElementById('result-checklist');
      const urgentBannerEl = document.getElementById('result-urgent-banner');

      if (!resultEl) return;
      resultEl.classList.remove('hidden');

      const rec = getCareRecommendation(quizState);

      // Urgent banner toggle
      if (urgentBannerEl) {
        if (rec.isImmediate) urgentBannerEl.classList.remove('hidden');
        else urgentBannerEl.classList.add('hidden');
      }

      if (titleEl) titleEl.textContent = rec.recTitle;
      if (descEl) descEl.textContent = rec.recDesc;
      if (checklistEl) {
        checklistEl.innerHTML = rec.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('');
      }

      refreshIcons();
    }

    function resetQuiz() {
      for (let i = 1; i <= 4; i++) {
        quizState[i] = null;
        const el = document.getElementById(`quiz-step-${i}`);
        if (el) {
          if (i === 1) el.classList.remove('hidden');
          else el.classList.add('hidden');
        }
      }
      const resultEl = document.getElementById('quiz-result');
      if (resultEl) resultEl.classList.add('hidden');
      updateQuizProgress(1);
      refreshIcons();
    }

    function prefillBookingFromQuiz() {
      const topicSelect = document.getElementById('book-topic');
      if (topicSelect) topicSelect.value = 'Family Care Placement';
      openBookingModal();
    }

    function prefillContactFromQuiz() {
      const title = document.getElementById('result-title')?.textContent || t('Residential Care');
      const messageField = document.getElementById('message');
      if (messageField) {
        messageField.value = t(
          "Hello Love RCFE Advisory Team,\n\nI completed your Care Level Assessment and received the following recommendation:\n• Target Care Setting: {title}\n• Exploring care for: {recipient}\n• Cognitive status: {memory}\n• Physical ADL needs: {adl}\n• Placement Timeframe: {timeline}\n\nPlease contact me with licensed facility openings and touring support.",
          {
            title,
            recipient: answerLabel(quizState[1]),
            memory: answerLabel(quizState[2]),
            adl: answerLabel(quizState[3]),
            timeline: answerLabel(quizState[4])
          }
        );
      }
      selectInquiryType('Family Care');
      openView('contact');
    }

    // ==================== INTERACTIVE QUIZ MODAL (FULL WIZARD IN MODAL) ====================
    const modalQuizState = { step: 1, answers: { 1: null, 2: null, 3: null, 4: null } };

    function openCareQuizModal() {
      modalQuizState.step = 1;
      modalQuizState.answers = { 1: null, 2: null, 3: null, 4: null };
      renderModalQuiz();
      openModal('quiz-modal');
    }

    function closeCareQuizModal() {
      closeModal('quiz-modal');
    }

    function refocusQuizModal() {
      const modal = document.getElementById('quiz-modal');
      if (modal) requestAnimationFrame(() => focusInModal(modal));
    }

    function setModalQuizAnswer(step, answer) {
      modalQuizState.answers[step] = answer;
      modalQuizState.step = step + 1;
      renderModalQuiz();
      refreshIcons();
      refocusQuizModal();
    }

    function prevModalQuizStep(step) {
      modalQuizState.step = step;
      renderModalQuiz();
      refreshIcons();
      refocusQuizModal();
    }

    function renderModalQuiz() {
      const content = document.getElementById('modal-quiz-content');
      if (!content) return;
      const step = modalQuizState.step;
      const ans = modalQuizState.answers;
      const tx = s => escapeHtml(t(s));

      if (step === 1) {
        content.innerHTML = `
          <div>
            <div class="mb-5">
              <div class="flex items-center justify-between text-xs font-semibold text-brand-muted mb-1.5">
                <span>${tx('Question 1 of 4: Profile')}</span>
                <span class="text-brand-green font-bold">${tx('25% Complete')}</span>
              </div>
              <div class="w-full bg-brand-sageLight rounded-full h-2 overflow-hidden border border-brand-line/60">
                <div class="bg-brand-green h-full rounded-full transition-all duration-300" style="width: 25%"></div>
              </div>
            </div>

            <p class="text-sm font-bold text-brand-ink mb-3">${tx('Who are you exploring care for?')}</p>
            <div class="grid sm:grid-cols-2 gap-3 mb-4">
              <button data-click="setModalQuizAnswer(1, 'elder-parent')" class="quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Elder Parent or Relative')}</span>
                <span class="block text-xs text-brand-muted mt-1">${tx('Caring for Mom, Dad, or elder relative')}</span>
              </button>
              <button data-click="setModalQuizAnswer(1, 'spouse')" class="quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Spouse or Partner')}</span>
                <span class="block text-xs text-brand-muted mt-1">${tx("Seeking support for partner's health progression")}</span>
              </button>
              <button data-click="setModalQuizAnswer(1, 'self')" class="quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Myself')}</span>
                <span class="block text-xs text-brand-muted mt-1">${tx('Planning forward for my own future residence')}</span>
              </button>
              <button data-click="setModalQuizAnswer(1, 'client')" class="quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Social Worker / Discharge Planner')}</span>
                <span class="block text-xs text-brand-muted mt-1">${tx('Hospital / rehab safe discharge placement')}</span>
              </button>
            </div>
          </div>
        `;
      } else if (step === 2) {
        content.innerHTML = `
          <div>
            <div class="mb-5">
              <div class="flex items-center justify-between text-xs font-semibold text-brand-muted mb-1.5">
                <span>${tx('Question 2 of 4: Cognitive Health')}</span>
                <span class="text-brand-green font-bold">${tx('50% Complete')}</span>
              </div>
              <div class="w-full bg-brand-sageLight rounded-full h-2 overflow-hidden border border-brand-line/60">
                <div class="bg-brand-green h-full rounded-full transition-all duration-300" style="width: 50%"></div>
              </div>
            </div>

            <button data-click="prevModalQuizStep(1)" class="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted hover:text-brand-ink mb-3 transition">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> ${tx('Back to Question 1')}
            </button>

            <p class="text-sm font-bold text-brand-ink mb-3">${tx('What is their primary cognitive and memory status?')}</p>
            <div class="space-y-3 mb-4">
              <button data-click="setModalQuizAnswer(2, 'sharp')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Sharp & Clear Cognitively')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Alert, manages conversations, no wandering or severe memory confusion')}</span>
              </button>
              <button data-click="setModalQuizAnswer(2, 'mild')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Mild Forgetfulness / Age-Related Memory Lapses')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Occasionally forgets medications or dates, but oriented to surroundings')}</span>
              </button>
              <button data-click="setModalQuizAnswer(2, 'dementia')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx("Diagnosed Alzheimer's or Moderate/Severe Dementia")}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Confusion, disorientation, risk of exit-seeking/wandering, requires secured care')}</span>
              </button>
            </div>
          </div>
        `;
      } else if (step === 3) {
        content.innerHTML = `
          <div>
            <div class="mb-5">
              <div class="flex items-center justify-between text-xs font-semibold text-brand-muted mb-1.5">
                <span>${tx('Question 3 of 4: Physical Assistance')}</span>
                <span class="text-brand-green font-bold">${tx('75% Complete')}</span>
              </div>
              <div class="w-full bg-brand-sageLight rounded-full h-2 overflow-hidden border border-brand-line/60">
                <div class="bg-brand-green h-full rounded-full transition-all duration-300" style="width: 75%"></div>
              </div>
            </div>

            <button data-click="prevModalQuizStep(2)" class="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted hover:text-brand-ink mb-3 transition">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> ${tx('Back to Question 2')}
            </button>

            <p class="text-sm font-bold text-brand-ink mb-3">${tx('What assistance is required with physical activities of daily living (ADLs)?')}</p>
            <div class="space-y-3 mb-4">
              <button data-click="setModalQuizAnswer(3, 'independent')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Independent / Minimal assistance')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Walks easily; just needs meal service, companionship, and medication reminders')}</span>
              </button>
              <button data-click="setModalQuizAnswer(3, 'assist')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Moderate Assistance (Bathing, Dressing, Transfers)')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Uses walker or wheelchair; needs 1 caregiver for showers or getting out of bed')}</span>
              </button>
              <button data-click="setModalQuizAnswer(3, 'total')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('High Acuity / Bedridden / Total Dependence')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Non-ambulatory, frequent turning, hoyer lift or 2-person assist, hospice waiver')}</span>
              </button>
            </div>
          </div>
        `;
      } else if (step === 4) {
        content.innerHTML = `
          <div>
            <div class="mb-5">
              <div class="flex items-center justify-between text-xs font-semibold text-brand-muted mb-1.5">
                <span>${tx('Question 4 of 4: Timeline')}</span>
                <span class="text-brand-green font-bold">${tx('100% Ready')}</span>
              </div>
              <div class="w-full bg-brand-sageLight rounded-full h-2 overflow-hidden border border-brand-line/60">
                <div class="bg-brand-green h-full rounded-full transition-all duration-300" style="width: 100%"></div>
              </div>
            </div>

            <button data-click="prevModalQuizStep(3)" class="inline-flex items-center gap-1 text-xs font-semibold text-brand-muted hover:text-brand-ink mb-3 transition">
              <i data-lucide="arrow-left" class="w-3.5 h-3.5"></i> ${tx('Back to Question 3')}
            </button>

            <p class="text-sm font-bold text-brand-ink mb-3">${tx('How soon is care needed?')}</p>
            <div class="space-y-3 mb-4">
              <button data-click="setModalQuizAnswer(4, 'immediate')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Immediate / Hospital Discharge (Within 1–7 Days)')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Urgent transition needing expedited bed placement and physician review')}</span>
              </button>
              <button data-click="setModalQuizAnswer(4, 'soon')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Next 30–60 Days')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Proactively planning a comfortable, unhurried transition')}</span>
              </button>
              <button data-click="setModalQuizAnswer(4, 'research')" class="w-full quiz-option-btn text-left p-4 rounded-2xl border border-brand-line hover:border-brand-green hover:bg-brand-sageLight/40 transition">
                <span class="block font-bold text-sm text-brand-ink">${tx('Future Research & Budget Planning')}</span>
                <span class="block text-xs text-brand-muted mt-0.5">${tx('Gathering pricing, options, and understanding California licensing levels')}</span>
              </button>
            </div>
          </div>
        `;
      } else {
        // Result Step in Modal
        const rec = getCareRecommendation(ans);
        modalQuizState.lastRec = rec;
        const lang = window.LoveI18n ? window.LoveI18n.getLang() : 'en';
        const modalUrgentHtml = (window.LoveI18n && typeof window.LoveI18n.getBlock === 'function' && window.LoveI18n.getBlock('modal_urgent_p'))
          || 'With an immediate 1–7 day timeframe, call our intake hotline at <a href="tel:+18182175755" data-call class="underline font-bold text-brand-ink dark:text-amber-300">(818) 217-5755</a> for emergency openings and priority tour booking.';

        content.innerHTML = `
          <div class="space-y-4">
            <div class="p-6 rounded-2xl bg-brand-sageLight border border-brand-line">
              <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-brand-green text-white text-xs font-bold uppercase tracking-wider mb-2.5">
                <i data-lucide="check" class="w-3.5 h-3.5"></i> ${tx('Custom Recommendation')}
              </div>
              <h4 class="display text-xl sm:text-2xl font-bold text-brand-ink mb-2">${escapeHtml(rec.recTitle)}</h4>
              <p class="text-xs sm:text-sm text-brand-muted leading-relaxed mb-4">${escapeHtml(rec.recDesc)}</p>

              ${rec.isImmediate ? `
                <div class="mb-4 p-3.5 rounded-xl bg-amber-50 dark:bg-amber-950/60 border border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 text-xs">
                  <div class="flex items-center gap-1.5 font-bold mb-1 text-sm text-amber-950 dark:text-amber-100">
                    <i data-lucide="alert-circle" class="w-4 h-4 text-amber-700 dark:text-amber-400"></i>
                    <span>${tx('Hospital Discharge / Urgent Placement Alert')}</span>
                  </div>
                  <p class="leading-relaxed">
                    ${modalUrgentHtml}
                  </p>
                </div>
              ` : ''}

              <div class="border-t border-brand-line pt-3 text-xs">
                <p class="font-bold text-brand-ink mb-1.5">${tx('Key Questions to Ask on Your First Tour:')}</p>
                <ul class="list-disc pl-5 space-y-1 text-brand-muted">
                  ${rec.questions.map(q => `<li>${escapeHtml(q)}</li>`).join('')}
                </ul>
              </div>
            </div>

            <div class="flex flex-col sm:flex-row gap-3 pt-2">
              <button data-click="closeCareQuizModal(); openBookingModal();" class="flex-1 rounded-full bg-brand-green text-white py-3 px-4 text-xs font-bold hover:bg-brand-greenDark shadow-sm transition">
                ${tx('Book Free Advisory Call')}
              </button>
              <button data-click="closeCareQuizModal(); prefillContactFromModalQuiz();" class="flex-1 rounded-full border border-brand-green text-brand-green py-3 px-4 text-xs font-bold hover:bg-brand-sageLight transition">
                ${tx('Email Care Plan to Advisor')}
              </button>
            </div>

            <div class="text-center pt-1">
              <button data-click="openCareQuizModal()" class="text-xs text-brand-muted hover:text-brand-ink underline">
                ${tx('Retake Assessment')}
              </button>
            </div>
          </div>
        `;
      }
    }

    function prefillContactFromModalQuiz() {
      const recTitle = (modalQuizState.lastRec && modalQuizState.lastRec.recTitle) || t('Personalized Residential Care');
      const messageField = document.getElementById('message');
      if (messageField) {
        messageField.value = t(
          "Hello Love RCFE Advisory Team,\n\nI completed your Care Assessment Wizard and received the following custom match:\n• Recommended Setting: {title}\n• Care recipient: {recipient}\n• Memory status: {memory}\n• Physical ADL needs: {adl}\n• Timeframe: {timeline}\n\nPlease reach out with verified California licensed facilities in my area.",
          {
            title: recTitle,
            recipient: answerLabel(modalQuizState.answers[1]),
            memory: answerLabel(modalQuizState.answers[2]),
            adl: answerLabel(modalQuizState.answers[3]),
            timeline: answerLabel(modalQuizState.answers[4])
          }
        );
      }
      selectInquiryType('Family Care');
      openView('contact');
    }

    // Modal Helpers
    function openBookingModal() {
      if (bookingCloseTimer) {
        clearTimeout(bookingCloseTimer);
        bookingCloseTimer = null;
      }
      initBookingDatePicker();
      openModal('booking-modal');
      initTurnstile();
    }

    function closeBookingModal() {
      closeModal('booking-modal');
    }

    function initBookingDatePicker() {
      const dateInput = document.getElementById('book-date');
      if (!dateInput) return;
      const toStr = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const earliest = new Date();
      earliest.setDate(earliest.getDate() + 1);
      const latest = new Date();
      latest.setDate(latest.getDate() + 90);
      dateInput.min = toStr(earliest);
      dateInput.max = toStr(latest);
      if (!dateInput.value) {
        const first = new Date(earliest);
        if (first.getDay() === 0) first.setDate(first.getDate() + 1); // we do not take calls on Sundays
        dateInput.value = toStr(first);
      }
    }

    async function handleBookingSubmit(event) {
      event.preventDefault();
      const bookingForm = event.target;
      const status = document.getElementById('booking-status');
      const submitBtn = bookingForm.querySelector('button[type="submit"]');
      const name = document.getElementById('book-name').value.trim();
      const phone = document.getElementById('book-phone').value.trim();
      const email = document.getElementById('book-email').value.trim();
      const date = document.getElementById('book-date').value;
      const timeSelect = document.getElementById('book-time');
      const displayTimeLabel = timeSelect.options[timeSelect.selectedIndex].text;
      const canonicalTimeLabel = BOOKING_TIME_CANONICAL[timeSelect.value] || displayTimeLabel;
      const topic = document.getElementById('book-topic').value;

      const fail = message => {
        status.textContent = message;
        status.style.color = '';
        status.className = 'text-xs text-center font-semibold min-h-4 text-red-600 dark:text-red-400';
      };

      if (!name || !phone || !email || !date) return fail(t('Please fill out all required fields.'));
      if (bookingForm.elements.hp_notes && bookingForm.elements.hp_notes.value) return;

      const [y, m, d] = date.split('-').map(Number);
      const chosen = new Date(y, m - 1, d);
      if (chosen.getDay() === 0) return fail(t('We make calls Monday through Saturday. Please pick another date.'));
      const prettyDateEn = chosen.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
      const prettyDateLocal = chosen.toLocaleDateString(currentLocale(), { weekday: 'long', month: 'long', day: 'numeric' });

      submitBtn.disabled = true;
      status.textContent = t('Sending your call request…');
      status.style.color = '';
      status.className = 'text-xs text-center font-semibold min-h-4 text-brand-green dark:text-emerald-400';

      const record = {
        kind: 'call_request',
        name, phone, email, city: '',
        preferred_date: date,
        preferred_time: canonicalTimeLabel,
        message: `[Call request] ${prettyDateEn}, ${canonicalTimeLabel}, Pacific Time. Topic: ${topic}`,
        inquiry_type: topic,
        submitted_at: new Date().toISOString()
      };
      const result = await sendLead(record, 'ts-booking');
      submitBtn.disabled = false;

      if (result.ok) {
        status.style.color = '';
        status.className = 'text-xs text-center font-semibold min-h-4 text-brand-green dark:text-emerald-400';
        status.textContent = t('✓ Request received. An advisor will call you on {date} ({time}) to confirm.', { date: prettyDateLocal, time: displayTimeLabel });
        if (bookingCloseTimer) clearTimeout(bookingCloseTimer);
        bookingCloseTimer = setTimeout(() => {
          bookingCloseTimer = null;
          closeBookingModal();
          bookingForm.reset();
        }, 2600);
      } else if (result.validationError) {
        fail(result.validationError);
      } else {
        const draftUrl = openMailDraft(record);
        status.style.color = '';
        status.className = 'text-xs text-center font-semibold min-h-4 text-amber-700 dark:text-amber-400';
        status.textContent = t("If your email app didn't open automatically, ");
        const mailLink = document.createElement('a');
        mailLink.href = draftUrl;
        mailLink.className = 'underline font-bold hover:text-amber-900 dark:hover:text-amber-200';
        mailLink.textContent = t('click here to send by email');
        status.appendChild(mailLink);
        status.appendChild(document.createTextNode(t(', or call {phone}.', { phone: CONTACT.phoneDisplay })));
      }
    }

    // Accordion Toggle
    function toggleFaq(button) {
      const content = button.nextElementSibling;
      const icon = button.querySelector('.faq-chevron, svg.lucide-chevron-down, [data-lucide="chevron-down"]');
      const isExpanded = button.getAttribute('aria-expanded') === 'true';

      // Close other FAQs
      document.querySelectorAll('#faq-accordion .faq-content').forEach(c => c.classList.add('hidden'));
      document.querySelectorAll('#faq-accordion button').forEach(b => {
        b.setAttribute('aria-expanded', 'false');
        const ic = b.querySelector('.faq-chevron, svg.lucide-chevron-down, [data-lucide="chevron-down"]');
        if (ic) ic.classList.remove('rotate-180');
      });

      if (!isExpanded) {
        content.classList.remove('hidden');
        button.setAttribute('aria-expanded', 'true');
        if (icon) icon.classList.add('rotate-180');
      }
    }

    // ==================== FORM & LEAD STORAGE (STANDALONE ROBUST) ====================
    const form = document.getElementById('enquiry-form');
    const submitButton = document.getElementById('submit-button');
    const formStatus = document.getElementById('form-status');

    function showStatus(message, success) {
      if (!formStatus) return;
      formStatus.textContent = message;
      formStatus.className = success 
        ? 'text-sm font-semibold text-emerald-800 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/60 p-3.5 rounded-xl border border-emerald-200 dark:border-emerald-800 mt-2 flex items-center gap-2'
        : 'text-sm font-semibold text-red-700 dark:text-red-300 bg-red-50 dark:bg-red-950/60 p-3.5 rounded-xl border border-red-200 dark:border-red-800 mt-2 flex items-center gap-2';
    }

    if (form) {
      form.addEventListener('submit', async event => {
        event.preventDefault();
        if (!form.reportValidity()) return;

        // Honeypot: people never see this field, bots fill it in
        if (form.elements.hp_notes && form.elements.hp_notes.value) return;

        submitButton.disabled = true;
        showStatus(t('Sending your confidential enquiry…'), true);

        const record = {
          kind: 'enquiry',
          name: form.elements.name.value.trim(),
          email: form.elements.email.value.trim(),
          phone: form.elements.phone.value.trim(),
          city: form.elements.city ? form.elements.city.value.trim() : '',
          inquiry_type: form.querySelector('input[name="inquiry_type"]:checked')?.value || 'General Inquiry',
          message: form.elements.message.value.trim(),
          submitted_at: new Date().toISOString()
        };

        const result = await sendLead(record, 'ts-contact');
        submitButton.disabled = false;

        if (result.ok) {
          form.reset();
          showStatus(t('✓ Thank you, {name}. Your message was sent. An elder care advisor will reply within 1 business day.', { name: record.name }), true);
        } else if (result.validationError) {
          showStatus(result.validationError, false);
        } else {
          const draftUrl = openMailDraft(record);
          if (formStatus) {
            formStatus.className = 'text-sm font-semibold text-amber-800 dark:text-amber-300 bg-amber-50 dark:bg-amber-950/60 p-3.5 rounded-xl border border-amber-200 dark:border-amber-800 mt-2 leading-relaxed';
            formStatus.textContent = t("If your email app didn't open automatically, ");
            const mailLink = document.createElement('a');
            mailLink.href = draftUrl;
            mailLink.className = 'underline font-bold hover:text-amber-950 dark:hover:text-amber-100';
            mailLink.textContent = t('click here to send by email');
            formStatus.appendChild(mailLink);
            formStatus.appendChild(document.createTextNode(t(', email ')));
            const emailLink = document.createElement('a');
            emailLink.href = `mailto:${CONTACT.email}`;
            emailLink.className = 'underline';
            emailLink.textContent = CONTACT.email;
            formStatus.appendChild(emailLink);
            formStatus.appendChild(document.createTextNode(t(', or call {phone}.', { phone: CONTACT.phoneDisplay })));
          }
        }
      });
    }



    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }

    // Keyboard accessibility: Esc closes the top modal, Tab stays inside it
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape') {
        if (modalStack.length) closeModal(modalStack[modalStack.length - 1]);
        closeMobileMenu();
        return;
      }
      if (e.key === 'Tab' && modalStack.length) {
        const modal = document.getElementById(modalStack[modalStack.length - 1]);
        const items = Array.from(modal.querySelectorAll(FOCUSABLE)).filter(el => el.offsetParent !== null);
        if (!items.length) { e.preventDefault(); modal.focus(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!modal.contains(active)) {
          e.preventDefault();
          first.focus();
          return;
        }
        if (e.shiftKey && (active === first || active === modal)) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && active === last) {
          e.preventDefault();
          first.focus();
        }
      }
    });

    window.initTurnstile = initTurnstile;

    // Delegated event bindings (CSP-safe without 'unsafe-inline' in script-src)
    const bookingFormEl = document.getElementById('booking-form');
    if (bookingFormEl) {
      bookingFormEl.addEventListener('submit', handleBookingSubmit);
    }

    document.querySelectorAll('img[data-fallback-src]').forEach(img => {
      const useFallback = () => {
        img.removeEventListener('error', useFallback);
        const fb = img.getAttribute('data-fallback-src');
        if (!fb) return;
        // srcset would win over src, so the fallback would never be used
        img.removeAttribute('srcset');
        img.removeAttribute('sizes');
        img.src = fb;
      };
      img.addEventListener('error', useFallback);
      // The picture may already have failed before this script ran
      if (img.complete && img.naturalWidth === 0) useFallback();
    });

    document.addEventListener('change', e => {
      if (e.target && e.target.closest && e.target.closest('[data-calc-input]')) {
        calculateCosts();
      }
    });

    document.addEventListener('click', e => {
      if (e.target && e.target.dataset && e.target.dataset.backdropClose) {
        const modalId = e.target.dataset.backdropClose;
        if (modalId === 'call-modal') closeCallModal();
        else if (modalId === 'booking-modal') closeBookingModal();
        else if (modalId === 'quiz-modal') closeCareQuizModal();
        return;
      }

      const el = e.target && e.target.closest ? e.target.closest('[data-click]') : null;
      if (!el) return;
      const act = el.getAttribute('data-click');
      if (!act) return;

      switch (act) {
        case 'openBookingModal()': openBookingModal(); break;
        case 'closeBookingModal()': closeBookingModal(); break;
        case 'closeCallModal()': closeCallModal(); break;
        case 'closeCallModal(); openBookingModal();': closeCallModal(); openBookingModal(); break;
        case 'openCareQuizModal()': openCareQuizModal(); break;
        case 'closeCareQuizModal()': closeCareQuizModal(); break;
        case 'closeCareQuizModal(); openBookingModal();': closeCareQuizModal(); openBookingModal(); break;
        case 'closeCareQuizModal(); prefillContactFromModalQuiz();': closeCareQuizModal(); prefillContactFromModalQuiz(); break;
        case 'toggleTheme()': toggleTheme(); break;
        case 'toggleNeonCalculator()': toggleNeonCalculator(); break;
        case 'copyNeonResult()': copyNeonResult(); break;
        case 'applyNeonToBudget()': applyNeonToBudget(); break;
        case 'copyPhoneNumber()': copyPhoneNumber(); break;
        case 'prefillContactFromEstimate()': prefillContactFromEstimate(); break;
        case 'prefillBookingFromQuiz()': prefillBookingFromQuiz(); break;
        case 'prefillContactFromQuiz()': prefillContactFromQuiz(); break;
        case 'resetQuiz()': resetQuiz(); break;
        case 'toggleFaq(this)': toggleFaq(el); break;
        case "window.scrollTo({ top: 0, behavior: 'smooth' })": window.scrollTo({ top: 0, behavior: 'smooth' }); break;
        default: {
          let m;
          if ((m = act.match(/^switchToolTab\('([^']+)'\)$/))) {
            switchToolTab(m[1]);
          } else if ((m = act.match(/^neonInput\('([^']+)'(?:,\s*'([^']+)')?\)$/))) {
            neonInput(m[1], m[2]);
          } else if ((m = act.match(/^setQuizAnswer\((\d+),\s*'([^']+)'\)$/))) {
            setQuizAnswer(Number(m[1]), m[2]);
          } else if ((m = act.match(/^prevQuizStep\((\d+)\)$/))) {
            prevQuizStep(Number(m[1]));
          } else if ((m = act.match(/^setModalQuizAnswer\((\d+),\s*'([^']+)'\)$/))) {
            setModalQuizAnswer(Number(m[1]), m[2]);
          } else if ((m = act.match(/^prevModalQuizStep\((\d+)\)$/))) {
            prevModalQuizStep(Number(m[1]));
          }
          break;
        }
      }
    });

    if (window.LoveI18n && typeof window.LoveI18n.onChange === 'function') {
      window.LoveI18n.onChange(() => {
        // Menu words have a different length in each language
        if (typeof window.fitHeaderNav === 'function') window.fitHeaderNav();
        updateDocumentTitle(currentView);
        applyTheme(document.documentElement.classList.contains('dark'));
        calculateCosts();
        updateQuizProgress(quizCurrentStep);
        const resultEl = document.getElementById('quiz-result');
        if (resultEl && !resultEl.classList.contains('hidden')) {
          renderQuizResult();
        }
        const quizModal = document.getElementById('quiz-modal');
        if (quizModal && !quizModal.classList.contains('hidden')) {
          renderModalQuiz();
          refreshIcons();
        }
        const callModal = document.getElementById('call-modal');
        if (callModal && !callModal.classList.contains('hidden')) {
          updateCallStatus();
        }
        const calcWidget = document.getElementById('neon-calculator-widget');
        const calcBtn = document.getElementById('toggle-neon-calc-btn');
        if (calcWidget && calcBtn) {
          const isCalcOpen = !calcWidget.classList.contains('hidden');
          calcBtn.setAttribute('aria-label', t(isCalcOpen ? 'Hide calculator' : 'Open calculator'));
          calcBtn.title = t(isCalcOpen ? 'Hide the budget calculator' : 'Open the budget calculator');
        }
        if (!window.turnstile) {
          document.querySelectorAll('.cf-ts p').forEach(p => {
            p.textContent = t('The security check could not load. Please turn off ad blockers for this site, or call (818) 217-5755 or email loveRCFE@gmail.com.');
          });
        }
      });
      // Sync localized title and dynamic JS widgets on initial load
      updateDocumentTitle(currentView);
      applyTheme(document.documentElement.classList.contains('dark'));
      calculateCosts();
      updateQuizProgress(quizCurrentStep);
    }
