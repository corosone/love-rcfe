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
| `api.test.js` | The server code: enquiry form rules, the spam check, rate limits, staff sign-in and lockout, the staff inbox actions (stages, notes, handled, delete, mark as spam), the developer console staying private, the developer sign-in with an emailed 6-digit code (wrong codes, reused or expired codes, the code-email limit, lockout, signing out), blocked addresses, the weekly summary and its once-every-5-days limit. |
| `tools.test.js` | The developer console's Tools tab and what feeds it: the network and device check code saved with enquiries, blocking a device, the follow-up alarm and first-reply times, the duplicate finder, the holiday switch, the VPN check and IP address check, the visitor journey, the care-home licence lookup (including safe searching), backups and the spreadsheet keeping the new details. |
| `security.test.js` | The security fixes and what came with them: IPv6 home networks counting as one sender in every limit, trusted browsers still being able to sign in when strangers trigger the site-wide lockout (and losing that when signed out from the console), the contact form's separate allowance for senders that look automated, the weekly-summary address refusing calls without writing to the database, huge request bodies being cut off, the booking time check, individual staff accounts (sign-in, changing your own password, new passwords and removal signing people out, turning the shared password off, "last changed by"), Recently Deleted (put back, delete for good, empty, removed after 30 days), backups leaving out passwords, and the spreadsheet formula guard. |
| `site.test.js` | The public pages in a real (headless) Chrome: fonts, pictures, the spam check loading on demand, sending an enquiry, all 18 languages and their own addresses (`/es/`, `/zh/`, ...), sideways scrolling on phones and tablets, the top bar, text contrast, the visit log, the sign-in pages when the security check loads slowly, signing out of the console, pasting the 6-digit code, the staff inbox with more than 500 messages, the device check code, the privacy policy lines, the holiday notes in every language, the console's Tools tab and the staff inbox's Waiting and Possible duplicate labels, the device report sent with enquiries (gathered only once a form is used; staff see only phone or computer), and staff accounts with Recently Deleted from start to finish (the console creates an account, the person signs in and changes their password, and a deleted message is put back). |
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
