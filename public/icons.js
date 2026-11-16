/**
 * Self-hosted subset of Lucide icons (lucide v0.344.0, ISC license, https://lucide.dev).
 * Copyright (c) Lucide Contributors. Portions copyright (c) Cole Bemis (Feather, MIT).
 *
 * Only the icons this site uses are included, so no script has to be loaded from a CDN.
 * window.lucide.createIcons() turns every <i data-lucide="name"> into an inline SVG,
 * producing the same markup as the official Lucide library.
 *
 * To add an icon: copy its child elements from https://lucide.dev (or the lucide package)
 * into ICONS below, using the icon's kebab-case name as the key.
 */
(function () {
  'use strict';

  var SVG_NS = 'http://www.w3.org/2000/svg';
  var DEFAULT_ATTRS = {
    xmlns: SVG_NS,
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round'
  };

  var ICONS = {
    'alert-circle': [['circle', { cx: '12', cy: '12', r: '10' }], ['line', { x1: '12', x2: '12', y1: '8', y2: '12' }], ['line', { x1: '12', x2: '12.01', y1: '16', y2: '16' }]],
    'arrow-left': [['path', { d: 'm12 19-7-7 7-7' }], ['path', { d: 'M19 12H5' }]],
    'arrow-right': [['path', { d: 'M5 12h14' }], ['path', { d: 'm12 5 7 7-7 7' }]],
    'arrow-up': [['path', { d: 'm5 12 7-7 7 7' }], ['path', { d: 'M12 19V5' }]],
    'arrow-up-right': [['path', { d: 'M7 7h10v10' }], ['path', { d: 'M7 17 17 7' }]],
    'award': [['circle', { cx: '12', cy: '8', r: '6' }], ['path', { d: 'M15.477 12.89 17 22l-5-3-5 3 1.523-9.11' }]],
    'badge-dollar-sign': [['path', { d: 'M3.85 8.62a4 4 0 0 1 4.78-4.77 4 4 0 0 1 6.74 0 4 4 0 0 1 4.78 4.78 4 4 0 0 1 0 6.74 4 4 0 0 1-4.77 4.78 4 4 0 0 1-6.75 0 4 4 0 0 1-4.78-4.77 4 4 0 0 1 0-6.76Z' }], ['path', { d: 'M16 8h-6a2 2 0 1 0 0 4h4a2 2 0 1 1 0 4H8' }], ['path', { d: 'M12 18V6' }]],
    'book-open': [['path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }], ['path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' }]],
    'briefcase': [['rect', { width: '20', height: '14', x: '2', y: '7', rx: '2', ry: '2' }], ['path', { d: 'M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16' }]],
    'building-2': [['path', { d: 'M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18Z' }], ['path', { d: 'M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2' }], ['path', { d: 'M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2' }], ['path', { d: 'M10 6h4' }], ['path', { d: 'M10 10h4' }], ['path', { d: 'M10 14h4' }], ['path', { d: 'M10 18h4' }]],
    'calculator': [['rect', { width: '16', height: '20', x: '4', y: '2', rx: '2' }], ['line', { x1: '8', x2: '16', y1: '6', y2: '6' }], ['line', { x1: '16', x2: '16', y1: '14', y2: '18' }], ['path', { d: 'M16 10h.01' }], ['path', { d: 'M12 10h.01' }], ['path', { d: 'M8 10h.01' }], ['path', { d: 'M12 14h.01' }], ['path', { d: 'M8 14h.01' }], ['path', { d: 'M12 18h.01' }], ['path', { d: 'M8 18h.01' }]],
    'calendar': [['path', { d: 'M8 2v4' }], ['path', { d: 'M16 2v4' }], ['rect', { width: '18', height: '18', x: '3', y: '4', rx: '2' }], ['path', { d: 'M3 10h18' }]],
    'check': [['path', { d: 'M20 6 9 17l-5-5' }]],
    'check-circle-2': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    'chevron-down': [['path', { d: 'm6 9 6 6 6-6' }]],
    'chevron-right': [['path', { d: 'm9 18 6-6-6-6' }]],
    'clipboard-check': [['rect', { width: '8', height: '4', x: '8', y: '2', rx: '1', ry: '1' }], ['path', { d: 'M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2' }], ['path', { d: 'm9 14 2 2 4-4' }]],
    'clock': [['circle', { cx: '12', cy: '12', r: '10' }], ['polyline', { points: '12 6 12 12 16 14' }]],
    'compass': [['circle', { cx: '12', cy: '12', r: '10' }], ['polygon', { points: '16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76' }]],
    'copy': [['rect', { width: '14', height: '14', x: '8', y: '8', rx: '2', ry: '2' }], ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }]],
    'download': [['path', { d: 'M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4' }], ['polyline', { points: '7 10 12 15 17 10' }], ['line', { x1: '12', x2: '12', y1: '15', y2: '3' }]],
    'file-text': [['path', { d: 'M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z' }], ['path', { d: 'M14 2v4a2 2 0 0 0 2 2h4' }], ['path', { d: 'M10 9H8' }], ['path', { d: 'M16 13H8' }], ['path', { d: 'M16 17H8' }]],
    'flame': [['path', { d: 'M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z' }]],
    'globe': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20' }], ['path', { d: 'M2 12h20' }]],
    'heart': [['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }]],
    'heart-handshake': [['path', { d: 'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z' }], ['path', { d: 'M12 5 9.04 7.96a2.17 2.17 0 0 0 0 3.08v0c.82.82 2.13.85 3 .07l2.07-1.9a2.82 2.82 0 0 1 3.79 0l2.96 2.66' }], ['path', { d: 'm18 15-2-2' }], ['path', { d: 'm15 18-2-2' }]],
    'help-circle': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3' }], ['path', { d: 'M12 17h.01' }]],
    'home': [['path', { d: 'm3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' }], ['polyline', { points: '9 22 9 12 15 12 15 22' }]],
    'inbox': [['polyline', { points: '22 12 16 12 14 15 10 15 8 12 2 12' }], ['path', { d: 'M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z' }]],
    'info': [['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 16v-4' }], ['path', { d: 'M12 8h.01' }]],
    'lock': [['rect', { width: '18', height: '11', x: '3', y: '11', rx: '2', ry: '2' }], ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }]],
    'mail': [['rect', { width: '20', height: '16', x: '2', y: '4', rx: '2' }], ['path', { d: 'm22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7' }]],
    'map-pin': [['path', { d: 'M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z' }], ['circle', { cx: '12', cy: '10', r: '3' }]],
    'menu': [['line', { x1: '4', x2: '20', y1: '12', y2: '12' }], ['line', { x1: '4', x2: '20', y1: '6', y2: '6' }], ['line', { x1: '4', x2: '20', y1: '18', y2: '18' }]],
    'moon': [['path', { d: 'M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z' }]],
    'phone': [['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' }]],
    'phone-call': [['path', { d: 'M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z' }], ['path', { d: 'M14.05 2a9 9 0 0 1 8 7.94' }], ['path', { d: 'M14.05 6A5 5 0 0 1 18 10' }]],
    'refresh-cw': [['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }], ['path', { d: 'M21 3v5h-5' }], ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }], ['path', { d: 'M8 16H3v5' }]],
    'rotate-ccw': [['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }], ['path', { d: 'M3 3v5h5' }]],
    'send': [['path', { d: 'm22 2-7 20-4-9-9-4Z' }], ['path', { d: 'M22 2 11 13' }]],
    'shield-check': [['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }], ['path', { d: 'm9 12 2 2 4-4' }]],
    'sparkles': [['path', { d: 'm12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z' }], ['path', { d: 'M5 3v4' }], ['path', { d: 'M19 17v4' }], ['path', { d: 'M3 5h4' }], ['path', { d: 'M17 19h4' }]],
    'star': [['polygon', { points: '12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2' }]],
    'sun': [['circle', { cx: '12', cy: '12', r: '4' }], ['path', { d: 'M12 2v2' }], ['path', { d: 'M12 20v2' }], ['path', { d: 'm4.93 4.93 1.41 1.41' }], ['path', { d: 'm17.66 17.66 1.41 1.41' }], ['path', { d: 'M2 12h2' }], ['path', { d: 'M20 12h2' }], ['path', { d: 'm6.34 17.66-1.41 1.41' }], ['path', { d: 'm19.07 4.93-1.41 1.41' }]],
    'users': [['path', { d: 'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2' }], ['circle', { cx: '9', cy: '7', r: '4' }], ['path', { d: 'M22 21v-2a4 4 0 0 0-3-3.87' }], ['path', { d: 'M16 3.13a4 4 0 0 1 0 7.75' }]],
    'x': [['path', { d: 'M18 6 6 18' }], ['path', { d: 'm6 6 12 12' }]]
  };

  function createSvgElement(tag, attrs, children) {
    var el = document.createElementNS(SVG_NS, tag);
    Object.keys(attrs).forEach(function (name) {
      el.setAttribute(name, String(attrs[name]));
    });
    (children || []).forEach(function (child) {
      el.appendChild(createSvgElement(child[0], child[1], child[2]));
    });
    return el;
  }

  function combineClassNames(list) {
    var seen = [];
    list.forEach(function (value) {
      String(value || '').split(' ').forEach(function (cls) {
        cls = cls.trim();
        if (cls && seen.indexOf(cls) === -1) seen.push(cls);
      });
    });
    return seen.join(' ');
  }

  function replaceElement(element) {
    var name = element.getAttribute('data-lucide');
    if (name == null) return;
    if (!Object.prototype.hasOwnProperty.call(ICONS, name)) {
      if (window.console) console.warn('Icon "' + name + '" is not in /icons.js. Add it to the ICONS list.');
      return;
    }
    var elementAttrs = {};
    Array.prototype.forEach.call(element.attributes, function (attr) {
      elementAttrs[attr.name] = attr.value;
    });
    var attrs = {};
    Object.keys(DEFAULT_ATTRS).forEach(function (k) { attrs[k] = DEFAULT_ATTRS[k]; });
    attrs['data-lucide'] = name;
    Object.keys(elementAttrs).forEach(function (k) { attrs[k] = elementAttrs[k]; });
    var classes = combineClassNames(['lucide', 'lucide-' + name, elementAttrs['class']]);
    if (classes) attrs['class'] = classes;
    var svg = createSvgElement('svg', attrs, ICONS[name]);
    if (element.parentNode) element.parentNode.replaceChild(svg, element);
  }

  function createIcons() {
    if (typeof document === 'undefined') return;
    // Only <i> placeholders: icons that were already drawn are <svg> elements and are left alone.
    Array.prototype.forEach.call(document.querySelectorAll('[data-lucide]'), function (el) {
      if (el.namespaceURI === SVG_NS) return;
      replaceElement(el);
    });
  }

  window.lucide = { createIcons: createIcons, icons: ICONS };
})();
