// Hidden Cloudflare Turnstile check for the sign-in pages (/staff and /corosone).
//
// The check runs in the background and takes up no space on the page. Cloudflare only shows
// its "Verify you are human" box when it wants extra proof; in that case the box appears
// in the container and the visitor ticks it. The server still verifies every token.
//
// Usage:  const gate = LoveTurnstile.mount('element-id');
//         const { token, reason } = await gate.getToken();   // reason: '', 'interaction', 'timeout' or 'unavailable'
//         gate.reset();                                       // after each attempt (a token works once)
(function () {
  'use strict';

  var SITE_KEY = '0x4AAAAAAF_J9TXjVKsqM-AR'; // same public site key as the contact forms
  var LOAD_ERROR = 'The security check could not load. Turn off ad or script blockers for this site, then reload the page.';
  var gates = [];

  function showError(el, message) {
    el.textContent = '';
    var p = document.createElement('p');
    p.className = 'text-xs font-semibold text-red-600 dark:text-red-400 text-center';
    p.textContent = message;
    el.appendChild(p);
  }

  // Adds spacing only while something is actually visible in the container.
  function watchVisibility(el) {
    function sync() {
      el.classList.toggle('ts-visible', el.offsetHeight > 0);
    }
    if (typeof ResizeObserver === 'function') {
      new ResizeObserver(sync).observe(el);
    } else {
      setInterval(sync, 500);
    }
    sync();
  }

  function render(gate) {
    if (gate.widget !== undefined || gate.failed) return;
    var el = document.getElementById(gate.id);
    if (!el || !window.turnstile) return;
    if (!gate.watching) {
      gate.watching = true;
      watchVisibility(el);
    }
    try {
      el.textContent = ''; // clears the "could not load" message when the script arrived late
      gate.widget = window.turnstile.render(el, {
        sitekey: SITE_KEY,
        theme: document.documentElement.classList.contains('dark') ? 'dark' : 'light',
        appearance: 'interaction-only'
      });
    } catch (e) {
      gate.failed = true;
      showError(el, LOAD_ERROR);
    }
  }

  function currentToken(gate) {
    try {
      return gate.widget !== undefined ? (window.turnstile.getResponse(gate.widget) || '') : '';
    } catch (e) {
      return '';
    }
  }

  function mount(id) {
    // failed: rendering threw (give up). late: the script has not arrived after 7 seconds; a
    // message is shown, but the check still starts if the script turns up afterwards.
    var gate = { id: id, widget: undefined, failed: false, late: false, watching: false };
    gates.push(gate);

    function start() {
      render(gate);
      // If Cloudflare's script never arrives (blocked or offline), say so instead of failing silently.
      setTimeout(function () {
        var el = document.getElementById(id);
        if (el && gate.widget === undefined && !gate.failed) {
          gate.late = true;
          if (!gate.watching) { gate.watching = true; watchVisibility(el); }
          showError(el, LOAD_ERROR);
        }
      }, 7000);
    }
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', start, { once: true });
    } else {
      start();
    }

    return {
      // Resolves with the token as soon as the background check has produced one.
      getToken: function (timeoutMs) {
        var deadline = Date.now() + (timeoutMs || 10000);
        return new Promise(function (resolve) {
          (function poll() {
            render(gate);
            if (gate.widget === undefined) {
              if (gate.failed || (gate.late && !window.turnstile) || Date.now() > deadline) return resolve({ token: '', reason: 'unavailable' });
              return setTimeout(poll, 150);
            }
            var token = currentToken(gate);
            if (token) return resolve({ token: token, reason: '' });
            var el = document.getElementById(id);
            // The box is on screen: Cloudflare is waiting for the visitor to tick it.
            if (el && el.offsetHeight > 20) return resolve({ token: '', reason: 'interaction' });
            if (Date.now() > deadline) return resolve({ token: '', reason: 'timeout' });
            setTimeout(poll, 150);
          })();
        });
      },
      reset: function () {
        try {
          if (gate.widget !== undefined) window.turnstile.reset(gate.widget);
        } catch (e) {}
      },
      message: function (reason) {
        if (reason === 'interaction') return 'Please tick the "Verify you are human" box above, then try again.';
        if (reason === 'timeout') return 'The security check is still running. Wait a few seconds and try again, or reload the page.';
        return LOAD_ERROR;
      }
    };
  }

  window.LoveTurnstile = { mount: mount };

  // Called by Cloudflare's script when it has loaded (?onload=loveTurnstileReady)
  window.loveTurnstileReady = function () {
    gates.forEach(render);
  };
})();
