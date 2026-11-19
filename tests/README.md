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
| `api.test.js` | The server code: enquiry form rules, the spam check, rate limits, staff sign-in and lockout, the staff inbox actions (stages, notes, handled, delete, mark as spam), the developer console staying private, the developer sign-in with an emailed 6-digit code (wrong codes, reused or expired codes, the code-email limit, lockout, signing out), blocked addresses, the weekly summary and its once-every-5-days limit, the summary's backup reminder (after 30 days), and the health check used by the daily site check. |
| `tools.test.js` | The developer console's Tools tab and what feeds it: the network and device check code saved with enquiries, blocking a device, the follow-up alarm and first-reply times, the duplicate finder, the holiday switch (including a long break whose first days back can still be booked), the VPN check and IP address check, the visitor journey, the care-home licence lookup (including safe searching), backups and the spreadsheet keeping the new details. |
| `security.test.js` | The security fixes and what came with them: IPv6 home networks counting as one sender in every limit, trusted browsers still being able to sign in when strangers trigger the site-wide lockout (and losing that when signed out from the console), the contact form's separate allowance for senders that look automated, the weekly-summary address refusing calls without writing to the database, huge request bodies being cut off, the booking time check, individual staff accounts (sign-in, changing your own password, new passwords and removal signing people out, turning the shared password off, "last changed by"), Recently Deleted (put back, delete for good, empty, removed after 30 days), backups leaving out passwords, and the spreadsheet formula guard. Also the fixes from the second security review: a lockout's count starting again once it ends, the weekly summary only going out on Mondays (California time), the site-wide daily cap on recorded visits, each staff account's own limit on sessions and trusted browsers, removed staff (or staff with a new password) losing their trusted browsers, wrong current passwords being counted and logged when staff change their own, and the IP address check finding a long address's whole network however busy its provider is. And from the third review: a try already turned away by its own limit not being counted against the shared ones (contact form, staff and developer sign-in), trusted staff browsers only skipping the site-wide lockout for their own account, turning the shared password off forgetting its trusted browsers, the code-email limits (hour checked first, unsent codes not counted, reset by Clear Sign-In Lockouts), an enquiry whose number is taken staying in Recently Deleted, the IP check not showing ended blocks, and the Database tab counting every table. |
| `site.test.js` | The public pages in a real (headless) Chrome: fonts, pictures, the spam check loading on demand, sending an enquiry, all 18 languages and their own addresses (`/es/`, `/zh/`, ...), sideways scrolling on phones and tablets, the top bar, text contrast, the visit log, the sign-in pages when the security check loads slowly, signing out of the console, pasting the 6-digit code, the staff inbox with more than 500 messages, the device check code, the privacy policy lines, the holiday notes in every language, Arabic, Persian and Hebrew laid out right to left as a mirror image (menu, text, arrows, logo, phone numbers, floating buttons, language menu, pop-ups) while every other language stays left to right, pop-up close buttons never covering the title in any language, the console's Tools tab and the staff inbox's Waiting and Possible duplicate labels, the device report sent with enquiries (gathered only once a form is used; staff see only phone or computer; the console's Show Journey and Show Device panels opening and closing in any order), a holiday that ends after the usual 3 months still offering a day families can book, the family guide (its own translated page in every language with its search details, links back to the home page and the language menu staying on the guide, right-to-left reading and no sideways scroll), and staff accounts with Recently Deleted from start to finish (the console creates an account, the person signs in and changes their password (a wrong current password is shown in the form without signing them out), and a deleted message is put back). |
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
