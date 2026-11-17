# Automated tests

These tests check the website before a change goes live. GitHub runs them by itself on
every push (see `.github/workflows/tests.yml`); the result shows as a green tick or a red
cross next to the commit and on the pull request.

Nothing here is part of the live site, and the tests never touch the live site or its
database. They start a local stand-in for Cloudflare Pages with an empty in-memory
database, and outside services (Turnstile, Resend, Formspree, Pexels) are replaced by
stand-ins.

| File | What it checks |
|---|---|
| `api.test.js` | The server code: enquiry form rules, the spam check, rate limits, staff sign-in and lockout, the developer console staying private, blocked addresses, the weekly summary and its once-every-5-days limit. |
| `site.test.js` | The public pages in a real (headless) Chrome: fonts, pictures, the spam check loading on demand, sending an enquiry, all 18 languages and their own addresses (`/es/`, `/zh/`, ...), sideways scrolling on phones and tablets, the top bar, text contrast. |
| `helpers/server.js` | The stand-in for Cloudflare Pages. |
| `helpers/d1.js` | The stand-in for the D1 database. |

To run them on a computer with Node.js 22 or newer:

```bash
npm install && npm run build
```

```bash
cd tests && npm ci && npx playwright install chromium && npm test
```

A red cross means a test failed: open the failed run on GitHub (Actions tab) to see which
check failed and why, and do not merge until it is green.
