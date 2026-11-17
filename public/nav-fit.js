// Top bar: decides whether the full menu fits next to the logo.
// If it does not (tablets, or languages with long menu words), the header gets the class
// "nav-compact" and shows the phone layout (menu button) instead of sliding the page sideways.
// Loaded right after the header so it runs before the page is first drawn, and again
// whenever the window size, the language or the fonts change.
(function () {
  'use strict';

  var header = document.querySelector('header');
  var nav = document.getElementById('desktop-nav');
  if (!header || !nav || !window.matchMedia) return;

  var row = nav.parentElement;
  var logo = row.querySelector('a[data-view-link="home"]');
  if (!logo) return;
  var wide = window.matchMedia('(min-width: 768px)');

  function fit() {
    header.classList.remove('nav-compact');
    if (!wide.matches) return; // phones: the stylesheet already shows the menu button
    header.classList.add('nav-measure'); // logo and menu at their full width while measuring
    var style = window.getComputedStyle(row);
    var room = row.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    var needed = logo.getBoundingClientRect().width + nav.getBoundingClientRect().width + (parseFloat(style.columnGap) || 0);
    var tooWide = needed > room - 1; // 1px spare, so nothing wraps because of rounding
    header.classList.remove('nav-measure');
    if (tooWide) header.classList.add('nav-compact');
  }

  var queued = false;
  function fitSoon() {
    if (queued) return;
    queued = true;
    window.requestAnimationFrame(function () {
      queued = false;
      fit();
    });
  }

  fit();
  window.addEventListener('resize', fitSoon);
  window.addEventListener('load', fit);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fit);

  // app.js calls this after the language changes
  window.fitHeaderNav = fit;
})();
