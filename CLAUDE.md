# Working on the Love RCFE website

Read this first. It holds the owner's standing rules and how the site fits together, so every
new session starts with the same understanding. This repository is public: never add passwords,
keys, email addresses or any other private details here.

## The owner's rules

- **Everything must stay free.** No paid plans, paid services, card-on-file trials or paid
  domains. Prefer what the site already uses (Cloudflare free plan, GitHub free, Resend free,
  Formspree free, Turnstile).
- **Plain language.** The owner is not a programmer. Explain things simply, in short steps,
  without jargon. The same goes for comments, test names and text on the site.
- **Be thorough and careful.** Only change what was asked. Check your work properly before
  calling it done, and say plainly what was and was not verified.
- **Do the work yourself.** Do not hand the owner steps you can do.
- **Allowed without asking:** making changes on the session's own branch, opening pull
  requests, and **merging them once the "test" check has passed** (main is protected by a
  ruleset that requires it). Also normal Cloudflare work through the API (checking deploys,
  reading the database, preview settings).
- **Always ask first:** deleting anything (branches, files, enquiries or other data, Cloudflare
  resources), force-pushing or rewriting history, changing live passwords or keys, and anything
  else that is hard to undo or could break the live site or lose data.
- **Privacy:** never write the owner's email address (DEV_EMAIL) or any personal details into
  code, comments, commits or pull requests. Full device reports for enquiries are shown only in
  the developer console, never on the staff page (staff only see "Phone" or "Computer").
- **Never ask for secrets in the chat.** Keys go through the session's secure credential form.

## How the site is built

| Part | Where | What it is |
|---|---|---|
| Public pages | `public/` | `index.html` (home page, 18 languages), `staff.html` (staff inbox), `corosone.html` (developer console), plus their scripts |
| Server | `functions/api/` | Cloudflare Pages Functions: the forms, staff inbox, developer console, health check, weekly summary |
| Shared server code | `lib/` | database set-up and limits (`db.js`), developer sign-in (`dev.js`), staff accounts, backups, trusted devices, ... |
| Styles | `src/input.css`, `tailwind.config.js` | Tailwind 3, built into `public/tailwind.css` (not stored in the repository) |
| Language pages | `scripts/build-pages.js` | builds ready-translated copies (`public/es/`, `public/zh/`, ...) at deploy time (not stored) |
| Translations | `public/i18n/<code>.js` | 17 languages. The key is the **English text exactly as on the page**; change the English and every language file must get the same new key |
| Guides | `src/guides/<name>.html` | articles at their own address (`/guides/<name>/`, `/<code>/guides/<name>/`), built by `scripts/build-pages.js` from the home page's header and footer. The build stops if any piece is untranslated. Add each new address to `public/sitemap.xml` |
| Tests | `tests/` | see `tests/README.md` |

Things that are easy to get wrong:

- `public/index.html` and `public/app.js` use Windows line endings (CRLF). Keep them that way.
- Button labels use Title Case ("Download Full Backup").
- Any text change on the public site needs all 17 translations updated too.
- Arabic, Persian and Hebrew pages are right to left (`dir="rtl"`, set by `public/i18n.js`), so the
  whole layout mirrors. On the public site use start/end styles, never left/right: `ms-`/`me-`,
  `ps-`/`pe-`, `start-`/`end-`, `text-start`/`text-end`, `border-s`/`border-e`, and
  `inset-inline-start` / `padding-inline-start` in CSS. Arrow icons flip by themselves.
- The two small scripts written into `index.html` are allowed by their sha256 fingerprints in
  `public/_headers` (Content-Security-Policy). Changing one means updating its fingerprint; the
  build stops with a message if they do not match.
- GitHub Actions are pinned to exact commit fingerprints with the version in a comment.
- Cloudflare's free plan: 100,000 database row writes a day for the whole site, at most 50
  database queries per request, and about 10 ms of computing time per request. Code here is
  written to stay well inside those; keep it that way (no writes on refused requests).

## Cloudflare

- Pages project **love-rcfe**, live at https://love-rcfe.pages.dev, deploys `main`
  automatically. Every other branch gets a preview address made from its name, e.g. branch
  `claude/new-session-dxpg7d` → https://claude-new-session-dxpg7d.love-rcfe.pages.dev.
- Build command: `npm run build` (Cloudflare runs `npm clean-install` first, which uses the
  exact versions in `package-lock.json`).
- Databases (D1), both bound as `DB`:
  - **lovercfe-db**: the live database, used by the live site only. Real enquiries: handle with care.
  - **lovercfe-db-preview**: a separate test database used by every preview. Safe for testing.
- Previews have their own test-only staff password and the real spam check (Turnstile), but no
  email settings, so test enquiries on a preview never email anyone, and the developer console
  is not set up there.
- Settings and secrets (names only) on the live site: `INBOX_PASSWORD`, `SESSION_SECRET`,
  `DEV_EMAIL`, `DEV_PASSWORD`, `DEV_CODE_EMAIL`, `RESEND_API_KEY`, `FORMSPREE_ENDPOINT`,
  `TURNSTILE_SECRET`, `REQUIRE_TURNSTILE`, `LEAD_RETENTION_DAYS`. Secret values cannot be read
  back through the API, and should never be printed.
- A Cloudflare API token (Pages, D1 and Turnstile; no billing or DNS) may be saved on the
  session's cloud environment for `api.cloudflare.com`. It is added to requests automatically,
  so send requests without an Authorization header (or with a placeholder). The account ID can
  be read from `GET /client/v4/accounts`.

## Checking a change

```bash
npm ci && npm run build
```

```bash
cd tests && npm ci && npm test
```

GitHub runs the same tests on every push (`.github/workflows/tests.yml`); the "test" check
must be green before merging. For anything visible, also look at the branch's preview.
In a Claude cloud session the browser tests use the Chrome already installed there when the one
matching the Playwright version is missing (it cannot be downloaded); nothing to set up.

## Automatic jobs on GitHub

- `tests.yml`: the tests, on every push.
- `site-check.yml`: every day, checks the live site's main pages, languages, styles, staff
  inbox and `/api/health` (server and database). A failure makes GitHub email the owner. It also
  keeps the scheduled jobs switched on (GitHub turns them off after 60 days without changes).
- `weekly-summary.yml`: Mondays, asks the site to email the owner a summary (numbers only),
  including a reminder when the last full backup is more than 30 days old.
- `.github/dependabot.yml`: weekly update pull requests for the build tools, test tools and
  GitHub Actions. Merge them only when the tests pass; never automatically.
