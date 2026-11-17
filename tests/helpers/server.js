// A stand-in for Cloudflare Pages, for tests only.
// It serves the files in /public the way Pages does (pretty addresses, the headers from
// _headers) and runs the real server code in /functions against an in-memory database.
// Calls the site makes to outside services (Turnstile, Resend, Formspree) are caught and
// recorded instead of being sent.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { createD1 } = require('./d1.js');

const ROOT = path.resolve(__dirname, '..', '..');
const PUBLIC = path.join(ROOT, 'public');

const TYPES = {
  html: 'text/html; charset=utf-8', js: 'application/javascript', css: 'text/css; charset=utf-8',
  jpg: 'image/jpeg', png: 'image/png', avif: 'image/avif', woff2: 'font/woff2',
  txt: 'text/plain; charset=utf-8', xml: 'application/xml',
};

// The site-wide header block ("/*") and the per-path blocks from public/_headers
function readHeaderRules() {
  const rules = [];
  let current = null;
  for (const line of fs.readFileSync(path.join(PUBLIC, '_headers'), 'utf8').split(/\r?\n/)) {
    if (!line.trim() || line.trim().startsWith('#')) continue;
    if (!/^\s/.test(line)) {
      current = { pattern: line.trim(), set: {}, remove: [] };
      rules.push(current);
    } else if (current) {
      const text = line.trim();
      if (text.startsWith('! ')) current.remove.push(text.slice(2).trim().toLowerCase());
      else current.set[text.slice(0, text.indexOf(':')).trim().toLowerCase()] = text.slice(text.indexOf(':') + 1).trim();
    }
  }
  return rules;
}

function headersFor(pathname, rules) {
  const out = {};
  for (const rule of rules) {
    const matches = rule.pattern.endsWith('*') ? pathname.startsWith(rule.pattern.slice(0, -1)) : pathname === rule.pattern;
    if (!matches) continue;
    for (const name of rule.remove) delete out[name];
    Object.assign(out, rule.set);
  }
  delete out['strict-transport-security']; // the test server is plain http
  return out;
}

const moduleCache = new Map();
function loadModule(file) {
  if (!moduleCache.has(file)) moduleCache.set(file, import(pathToFileURL(file).href));
  return moduleCache.get(file);
}

// Starts the server. "env" is what Cloudflare would pass to the functions (secrets etc).
async function startServer(env = {}) {
  const db = createD1();
  const fullEnv = { DB: db, ...env };
  const outside = []; // calls to outside services: { url, method, body }
  const background = []; // work the functions asked to finish after replying
  const rules = readHeaderRules();
  let turnstilePasses = true;
  // Optional stand-in answers for outside services: (url) => Response | undefined
  let outsideAnswer = null;

  // Catch calls to outside services made by the server code
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = typeof input === 'string' ? input : input.url;
    if (/^https?:\/\/(localhost|127\.0\.0\.1)[:/]/.test(url)) return realFetch(input, init);
    let body = init.body;
    if (body instanceof URLSearchParams) body = body.toString();
    else if (body && typeof body !== 'string' && typeof body.entries === 'function') body = Object.fromEntries(body.entries());
    outside.push({ url, method: init.method || 'GET', body, headers: init.headers || {} });
    if (outsideAnswer) {
      const custom = await outsideAnswer(url, init);
      if (custom) return custom;
    }
    if (url.includes('challenges.cloudflare.com/turnstile')) {
      return new Response(JSON.stringify({ success: turnstilePasses, hostname: 'localhost' }), { headers: { 'content-type': 'application/json' } });
    }
    return new Response(JSON.stringify({ ok: true, id: 'test' }), { headers: { 'content-type': 'application/json' } });
  };

  async function runFunction(req, res, url) {
    const relative = url.pathname.replace(/^\/api\//, '').replace(/\/$/, '');
    const file = path.join(ROOT, 'functions', 'api', ...relative.split('/')) + '.js';
    if (!file.startsWith(path.join(ROOT, 'functions')) || !fs.existsSync(file)) {
      res.writeHead(404, { 'content-type': 'application/json' });
      res.end('{"error":"Not found."}');
      return;
    }
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) headers.set(name, Array.isArray(value) ? value.join(', ') : value);
    const hasBody = !['GET', 'HEAD'].includes(req.method);
    const request = new Request(url.href, { method: req.method, headers, body: hasBody ? Buffer.concat(chunks) : undefined });

    const mod = await loadModule(file);
    const middleware = await loadModule(path.join(ROOT, 'functions', 'api', '_middleware.js'));
    const methodName = 'onRequest' + req.method[0] + req.method.slice(1).toLowerCase();
    const handler = mod[methodName] || mod.onRequest;
    const context = {
      request,
      env: fullEnv,
      params: {},
      waitUntil: (promise) => background.push(Promise.resolve(promise).catch(() => {})),
      next: async () => (handler ? handler(context) : new Response('Method not allowed', { status: 405 })),
    };
    const response = await middleware.onRequest(context);
    const outHeaders = {};
    response.headers.forEach((value, name) => {
      if (name !== 'set-cookie') outHeaders[name] = value;
    });
    const cookies = response.headers.getSetCookie ? response.headers.getSetCookie() : [];
    if (cookies.length) outHeaders['set-cookie'] = cookies;
    res.writeHead(response.status, outHeaders);
    res.end(Buffer.from(await response.arrayBuffer()));
  }

  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, `http://${req.headers.host}`);
      if (url.pathname.startsWith('/api/')) return await runFunction(req, res, url);

      let file = path.join(PUBLIC, url.pathname === '/' ? 'index.html' : url.pathname);
      if (url.pathname.endsWith('/')) file = path.join(PUBLIC, url.pathname, 'index.html');
      if (!fs.existsSync(file) && fs.existsSync(file + '.html')) file += '.html';
      if (!file.startsWith(PUBLIC) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        res.writeHead(404, { 'content-type': TYPES.html, ...headersFor(url.pathname, rules) });
        res.end(fs.existsSync(path.join(PUBLIC, '404.html')) ? fs.readFileSync(path.join(PUBLIC, '404.html')) : 'Not found');
        return;
      }
      res.writeHead(200, {
        'content-type': TYPES[path.extname(file).slice(1)] || 'application/octet-stream',
        'cache-control': 'public, max-age=0, must-revalidate',
        ...headersFor(url.pathname, rules),
      });
      fs.createReadStream(file).pipe(res);
    } catch (err) {
      res.writeHead(500, { 'content-type': 'text/plain' });
      res.end('Test server error: ' + (err && err.stack));
    }
  });

  await new Promise((resolve) => server.listen(0, 'localhost', resolve));
  const origin = `http://localhost:${server.address().port}`;

  return {
    origin,
    db,
    env: fullEnv,
    outside,
    setTurnstilePasses: (value) => { turnstilePasses = value; },
    // fn(url, init) returns a Response to use for that outside request, or nothing for the default
    setOutsideAnswer: (fn) => { outsideAnswer = fn; },
    settle: async () => { await Promise.all(background.splice(0)); },
    // Sends a request the way the site's own pages do (same-origin)
    api: (pathname, { method = 'GET', body, headers = {}, ip } = {}) =>
      realFetch(origin + pathname, {
        method,
        headers: {
          ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
          origin,
          ...(ip ? { 'x-forwarded-for': ip } : {}),
          ...headers,
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        redirect: 'manual',
      }),
    close: async () => {
      globalThis.fetch = realFetch;
      await new Promise((resolve) => server.close(resolve));
      server.closeAllConnections && server.closeAllConnections();
      db._close();
    },
  };
}

module.exports = { startServer, ROOT, PUBLIC };
