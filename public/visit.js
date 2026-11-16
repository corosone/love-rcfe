// Tells the server which page was opened, so the visit shows in the developer console's
// request log. Sends only the page address (no cookies are set, nothing is stored in the
// browser, and nothing is sent to any other website). Failures are ignored.
(function () {
  'use strict';
  var script = document.currentScript;
  var status = script && script.getAttribute('data-status') === '404' ? 404 : 200;
  var sent = 0;

  function send() {
    if (sent >= 30) return; // a single page never reports more than 30 views
    sent++;
    try {
      var view = (location.hash || '').replace(/^#/, '').toLowerCase();
      if (!/^[a-z0-9-]{1,40}$/.test(view)) view = '';
      var path = location.pathname;
      if (!/^\/[A-Za-z0-9._~\-\/%]{0,150}$/.test(path)) path = '/';
      fetch('/api/visit', {
        method: 'POST',
        credentials: 'omit',
        keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: path, view: view, status: status })
      }).catch(function () {});
    } catch (e) {}
  }

  send();
  // The main site switches sections without loading a new page (#services, #contact, ...).
  var last = location.hash;
  window.addEventListener('hashchange', function () {
    if (location.hash === last) return;
    last = location.hash;
    send();
  });
})();
