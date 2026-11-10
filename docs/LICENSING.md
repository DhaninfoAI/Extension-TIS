# Licensing, sign-in and the dashboard

> Built 2026-11-05 (v0.4.0). Code: `backend/lib/auth.mjs` (accounts, tokens, licences), `backend/lib/dashboard.mjs`
> (figures), `backend/public/dashboard.html` (page at `/dashboard`), `extension/background/background.js` (token
> handling), sign-in card in the side panel. Tests: `backend/test/auth.mjs` (39 checks).
> 2026-11-10: **a seat = one computer signed in to the extension** (not one person); dashboard sign-ins are free; the
> customer's operator sees the signed-in computers on the dashboard and can sign any one out.
> 2026-11-05: customers are charged by **photos**: each plan has a fixed number of photos per month.

## 1. Recommended licence model

SmartFill is a hosted service: every review runs on **our** backend (the AI and its cost live there). The backend is
therefore the only place a licence has to be enforced. No licence keys inside the extension, nothing a customer can
copy or patch out.

**Customers are charged by photos.** Each **plan** has a fixed number of photos per month; the customer picks a
plan, and their licence gets that plan's photos and seats. One licence per customer organisation:

| Limit | What it means | Why |
|---|---|---|
| **Plan** | from the plan list (Trial, Starter, Professional, Enterprise… names, photo amounts, seats and a price note are editable in the dashboard → Customers & licences → Plans) | what was sold; shows on the customer's dashboard and in the extension |
| **Photos per month** | taken from the plan (can be set differently for one customer, e.g. a top-up) | **what they pay for**; photos are also where most of our AI cost is (vision) |
| **Seats** | taken from the plan (can be changed per customer): computers signed in to the extension at once | caps how many computers use SmartFill, however many logins the customer has |
| **Valid until** | expiry date; suspended or expired → nobody of that customer can sign in or review | renewals, unpaid invoices |

**How photos are counted** (`imagesThisMonth` in `backend/lib/auth.mjs`):
- A photo counts **once, the first time the AI reviews it** for that customer in the calendar month (meter resets on
  the 1st, UTC).
- Re-running a review, or reviewing the same order again later, reuses the saved photo results: **not counted again**.
  A re-made result after one of our prompt/model upgrades keeps its first date, so the customer is never charged for
  our changes.
- Practice mode (no AI) reviews no photos and counts nothing.
- Before a review starts, the backend counts the order's photos that still need the AI. If they don't fit in what is
  left this month, the review is refused (402 `IMAGE_LIMIT`): "This order has 49 photos to review, but only 2 of your
  plan's 5,000 photos are left this month. Please contact your administrator for more photos." Raise the customer's
  photos (Edit) or move them to a bigger plan and they can continue at once.

Suggested commercial shape (the numbers are yours to set; the starting plans are placeholders):
- **Monthly or annual subscription per plan** = a photo bundle (e.g. 5,000 / 15,000 / 50,000 photos per month) with
  seats included. Size it from the customer's volume: the sandbox orders have 38–72 photos each (≈ 55 on average),
  so 5,000 photos ≈ 90 orders a month.
- **Top-ups / overage**: sell extra photo packs (raise "Photos / month" for that customer) or move them up a plan.
  The admin dashboard shows each customer's photos this month and AI cost this month, so the margin per photo is
  visible (AI cost per photo ≈ cost per order ÷ photos per order).
- **Trial**: 30 days on the Trial plan (the default organisation starts like this).
- **Self-hosted option** (only if a customer insists on running the backend themselves): a signed licence file
  (Ed25519) that the backend checks at start-up. Not built; not needed for the hosted model.

### How seats behave (since 2026-11-10)

Typical set-up: we create **one login for the customer's operator** (a customer user). The operator uses the same
email and password on `/dashboard` (licence, seats, photos, their figures) and in the extension on each QC computer.

- A seat = **one computer signed in to the extension** (one active sign-in). One login can fill as many seats as the
  licence has; several logins per customer also work, and every computer counts the same way.
- **Dashboard sign-ins never use a seat.** Admins never use one.
- Signing in again on the **same computer** replaces that computer's earlier sign-in, so it keeps one seat. The
  extension keeps a random computer id in `chrome.storage.local.device` (kept after Sign out) and sends it with
  the sign-in, plus an optional **name for this computer** typed on the sign-in card (e.g. "QC desk 2").
- When all seats are in use, a further computer is refused: 403 `SEAT_LIMIT`, shown in red on the extension's
  sign-in card: "All 2 seats of your licence are in use. Sign out a computer on the SmartFill dashboard (Licence &
  team) or ask your administrator for more seats." Computers already signed in are not affected.
- **Signing a computer out from the dashboard**: Licence & team → **Computers signed in** lists each computer (its
  name, or "Chrome on Windows" from the browser), who it is signed in as, when it signed in and when it was last
  active (~every 15 min while used), with **Sign out** (click twice to confirm; no browser pop-up). The seat is free
  at once; that computer gets the sign-in card the next time it calls the server, with "This computer was signed
  out from the SmartFill dashboard. Sign in again to continue." A customer can only see and sign out their own
  organisation's computers. Admins see every customer's computers under Users (and "Sign out everywhere" per person).
- **Idle limit (2026-11-10)**: a computer **not used for 8 hours** stops holding its seat by itself and leaves the
  dashboard list (`SEAT_IDLE_HOURS`, default 8, 0 = never). "Used" = any SmartFill call that renews its sign-in,
  about every 15 minutes while the panel is working, so a computer in use all day keeps its seat. When the idle
  computer is used again it simply carries on if a seat is free; if all seats are taken by then, its sign-in ends
  and the sign-in card says: "This computer was not used for 8 hours, so its seat was freed, and all 2 seats are now
  in use. Sign out a computer on the SmartFill dashboard (Licence & team) or ask your administrator for more seats."
  Tests: `backend/test/seat-idle.mjs` (fake clock).
- A seat is also freed by **Sign out** in the extension's Settings, or by disabling the user or giving them a new
  password.

### Current set-up (2026-11-05)

Admin: the user's own email. Demo customer: `reviewer@tis.demo` (TIS organisation). Passwords only in
`backend/data/ACCOUNTS.txt` (gitignored; change them after the first sign-in, then delete the file). TIS
organisation on the Trial plan (500 photos/month, 2 seats, valid until 2026-12-04). The starting plans
(Trial 500 · Starter 5,000 · Professional 15,000 · Enterprise 50,000 photos) are placeholders.

## 2. Accounts and roles

| Role | Who | Can |
|---|---|---|
| **admin** | us (the vendor) | everything: all customers, AI tokens and cost, models, fallbacks, create/edit customers + licences, create/disable users, reset passwords, sign people out |
| **customer** | the customer's staff (QC reviewers, managers) | sign in to the extension and run reviews (uses a seat), see **their own** organisation on the dashboard: orders, findings, decisions, inspectors, licence use, team. Never tokens, cost, models or engines |

Customers' data is separated by organisation: a customer can only read snapshots, reviews, photos and dashboard
figures of their own organisation (`orgId` on every snapshot, review, feedback and outcome). Older data without an
`orgId` belongs to the default organisation `tis`.

## 3. Tokens

| Token | Lifetime | Where it lives | Notes |
|---|---|---|---|
| **Access token** (JWT, HS256) | 15 min | memory (dashboard) / `chrome.storage.local` (extension) | sent as `Authorization: Bearer …`; `?token=` for `<img>` and the live-progress stream |
| **Refresh token** (random 256-bit) | 30 days | dashboard: **HttpOnly cookie** (`Path=/v1/auth`, `SameSite=Strict`, `Secure` on https); extension: `chrome.storage.local` | stored on the server only as a SHA-256 hash; **rotated on every use**; re-using an old one revokes the whole sign-in |

- Passwords: scrypt (N 16384), at least 10 characters with letters and a number. 5 wrong passwords lock the account
  for 5 minutes.
- Signing secret: `JWT_SECRET` in `.env`, or generated once and kept in the database.
- Disabling a user, changing their password/role/organisation, or "Sign out" in the dashboard ends all their sessions.
- Each request re-checks the user and the licence, so suspending a customer takes effect at once.

API: `POST /v1/auth/login {email, password, client: 'extension'|'dashboard'}` → `{accessToken, expiresIn,
refreshToken (extension only), user, org}` · `POST /v1/auth/refresh {refreshToken}` (or the cookie) · `POST
/v1/auth/logout` · `GET /v1/auth/me`. Admin: `GET/POST /v1/admin/orgs`, `PATCH /v1/admin/orgs/{id}`,
`GET/POST /v1/admin/users`, `PATCH /v1/admin/users/{id}`, `POST /v1/admin/users/{id}/sign-out` (every computer +
dashboard). Computers (any signed-in user; customers only their own organisation, admins all or `?org=`):
`GET /v1/devices` → `{devices:[{deviceId, name, browser, user:{name,email}, signedInAt, lastActiveAt}]}`,
`POST /v1/devices/{deviceId}/sign-out`. The extension's login also sends `deviceId` and `deviceName`. Dashboard:
`GET /v1/dashboard?from=&to=&org=` (role decides the content). Errors a customer can see are written for them:
`INVALID_CREDENTIALS`, `ACCOUNT_LOCKED`, `SEAT_LIMIT`, `LICENCE_EXPIRED`, `ORG_SUSPENDED`, `IMAGE_LIMIT` (402).
Plans: `GET /v1/admin/plans`, `PUT /v1/admin/plans {plans:[{name, imagesPerMonth, seats, price}]}` (admin).

## 3b. Customer brand and platform (2026-11-11)

SmartFill is Boost's product; TIS is its first customer. Each organisation has:

- `platform`: the web tool its team works in (`backend/lib/platforms.mjs`; `ez` = EZSurveyForm). The extension reads
  it from the sign-in and uses that platform's page code. Unknown platforms are refused by the server.
- `brand: { name, logoLight, logoDark }`: shown in the extension (panel, viewer) and on that customer's dashboard
  after sign-in; SmartFill's star is shown before sign-in, for admins and when there is no logo. Set on the dashboard
  (Customers & licences → Edit) or `PATCH /v1/admin/orgs/{id} {platform, brand}`. `GET /v1/platforms` (admin) lists
  the platforms.

## 4. What each side sees

- **Extension**: sign-in card when nobody is signed in (email, password, optional name for this computer); Settings
  shows the person, organisation, "This computer: QC desk 2", licence ("Starter · until … · 1,240 of 5,000 photos
  this month") and **Sign out**. Customers' review responses are stripped
  of usage, cost, models, engines, fallback reasons and the internal score on the server.
- **Dashboard** (`/dashboard`): customers see Overview (orders reviewed, must-fix found, missed hazards, fixes
  applied, review time, orders per day, findings by area, frequent issues), Orders, Inspectors, Licence & team
  (seats in use, photos this month, valid until, **Computers signed in** with Sign out, team).
  Admins additionally see AI usage & cost (cost per order/day/step/model, tokens, fallbacks), Customers &
  licences (edit seats, allowance, expiry, suspend), Users (create, disable, new password, sign out), and cost /
  token / model columns on Orders.
- `/v1/health` returns only `{ok:true}` unless an admin asks; `/v1/analytics/summary` and cost routes are admin-only.

## 5. Developer token

`DEV_TOKEN` (default `dev-token`) acts as an admin so tests, the harness and the eval script keep working. It is
accepted only while `ALLOW_DEV_TOKEN` is not `0`. The extension has no way to enter it since 2026-11-06
(the Settings field was removed); use it from tests, the harness and the eval script only.

## 6. Going live (checklist)

Also fix the security items A1–A11 of the improvement list in `ROADMAP.md` first (rules editable by customers,
data keyed by order number only, dev token and dev pages open, seat gaps, tokens in URLs, rate limits…).


1. Host the backend on https (tokens must never travel over plain http); point `extension/common/config.js`
   `apiBase` and `manifest.json` `host_permissions` at that address.
2. `.env`: `ALLOW_DEV_TOKEN=0`, a long random `JWT_SECRET`, `ADMIN_EMAIL` + `ADMIN_PASSWORD` for the first admin
   (remove the password after the first start).
3. Sign in at `/dashboard` as admin → **Customers & licences** → **Plans**: set your real plans (photos per month,
   seats, price); then set the customer's plan (photos and seats follow; override if needed),
   valid-until → **Users**: create their people (temporary passwords, shared privately).
4. Restrict CORS to the extension id and the dashboard origin (today the server echoes any origin).
5. Optional next steps: password reset by email, "invite" links instead of temporary passwords, SSO, audit log.

Creating accounts on a development backend: `cd backend && npm run create-user -- --email you@company.com --role
admin` (asks for the password; uses the developer token).
