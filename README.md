# JJ Private Training: booking and player-progress backend

Backend for **app.jjprivatetraining.com**, a booking and progress app for JJ Private Training, Co.
It runs on Supabase (Postgres, Auth, Storage, Edge Functions), takes payments with Stripe Checkout and sends email through Resend.

The parent and coach web app (React) is in [app/](app/). Everything else is the backend.

This is a **separate project** from the marketing site at www.jjprivatetraining.com. Nothing here changes that site. See [docs/INTEGRATION_CHECKLIST.md](docs/INTEGRATION_CHECKLIST.md) for the links and snippets to add there.

| Document | For |
|---|---|
| [docs/API.md](docs/API.md) | Whoever builds the app's screens: every table, RPC, Edge Function, route and error code |
| [docs/INTEGRATION_CHECKLIST.md](docs/INTEGRATION_CHECKLIST.md) | Buttons, links and snippets for the existing website |
| [docs/SECURITY_TESTS.md](docs/SECURITY_TESTS.md) | Automated tests plus the manual security checklist |
| [supabase/setup/production_setup.sql](supabase/setup/production_setup.sql) | One-time production setup: prices, hours, coach account, cron secrets |

---

## What's in here

```
app/                          the web app (React + Vite + Tailwind): parent booking + coach dashboard
supabase/
  config.toml                 local dev config (auth URLs, function JWT settings, email templates)
  migrations/                 database schema, run in order
    ..0100_extensions_types_settings.sql   enums + app_settings (time zone, 24h policy, ...)
    ..0200_tables.sql                      all tables, constraints, indexes, double-booking guard
    ..0300_helpers_triggers.sql            role helpers, signup -> profile, capacity trigger
    ..0400_rls_policies.sql                privileges + Row Level Security on every table
    ..0500_booking_logic.sql               slot generator, book / hold / confirm / cancel / reschedule
    ..0600_admin_functions.sql             coach schedule, stats, quick session notes, block time
    ..0700_storage.sql                     private drill-videos bucket + policies
    ..0800_cron.sql                        reminder + hold-cleanup jobs (pg_cron)
    ..0900_function_grants.sql             who may call which database function
  functions/
    stripe-checkout/          start Stripe Checkout (single session or package)
    stripe-webhook/           the ONLY place payments are confirmed
    booking-actions/          book with credit, cancel, reschedule, coach-created bookings
    send-reminders/           scheduled reminder emails
    send-announcement/        coach broadcast email
    public-availability/      public: next open times (no personal data)
    public-pricing/           public: session types + packages with prices
    contact-form/             public: website contact form -> inquiries + coach email
    _shared/                  CORS, auth, Stripe, Resend, branded email templates
    tests/                    Deno unit tests
  templates/                  branded auth emails (confirm, magic link, reset, email change)
  tests/database/             pgTAP tests (security + booking rules)
  seed.sql                    local test data
  setup/production_setup.sql  fill-in-the-blanks production setup
integration/                  ready-to-paste HTML/JS for the marketing site
deploy/                       iframe/security headers for Vercel, Netlify or Apache (frontend hosting)
scripts/smoke-test.mjs        end-to-end HTTP test against the local stack
```

### How a booking works

1. A parent picks a slot. Slots are built from weekly availability, minus blocked times, minus existing bookings, minus anything sooner than 12 hours away.
2. **Package credit**: `booking-actions` books it instantly and uses one credit.
   **Card**: `stripe-checkout` *holds* the slot (`pending_payment`, about 35 min) and sends the parent to Stripe.
3. Stripe calls `stripe-webhook`. Only after a verified, signed webhook does the booking become `booked` + `paid`, or the package credits get added.
4. Holds that are never paid are released automatically. If a payment lands after its hold expired *and* someone else took the slot, the parent is refunded automatically.
5. Cancel or reschedule up to 24 h before: the credit comes back, or the card is refunded. Inside 24 h the session is forfeited. When the coach cancels, the parent is always refunded.
6. A reminder email goes out 24 h before. After the session, the coach writes a quick note (skills, notes, homework), which parents can read.

**Double-booking** is prevented in the database, not just in the UI:
- A Postgres exclusion constraint stops two different sessions from overlapping.
- A trigger caps group sessions at `max_players`.
- Every booking write takes one calendar lock.

The tests prove that direct inserts bypassing the app are blocked too.

### Changes from the original brief (and why)

| Change | Why |
|---|---|
| Extra booking status `pending_payment` | Holds the slot while a parent is on Stripe, so two parents can't pay for the same time |
| Extra Edge Function `booking-actions` | Booking with a credit, cancelling (with Stripe refunds) and rescheduling need server-side rules and emails |
| Money stored as `price_cents` (integer) | No rounding errors. $90.00 = `9000` |
| `drills.video_path` instead of `video_url` | Videos live in a **private** bucket. The app makes a short-lived signed URL. `external_url` holds YouTube links |
| Extra tables: `app_settings`, `payments`, `announcements`, `stripe_events`, `rate_limits` | Rules you can change without code, a revenue ledger, an email log, webhook idempotency and spam limits |
| `profiles.email`, `players.active`, `packages.session_type_id`, `packages.validity_days` | Coach can contact parents, players with history can be archived, and credits can be tied to a session type and expire |
| Payment method `manual` | Coach can add cash/Venmo/comp bookings and mark them paid |
| Parents can't write `bookings` / `package_purchases` directly | They "write" only through the booking functions. Otherwise a browser could create a "paid" booking |

### Business settings (the [brackets] in the brief)

These are in the `app_settings` table, so the coach can change them later without a deploy:

| Setting | Default |
|---|---|
| Time zone | `America/New_York` |
| Cancel/reschedule window | 24 hours |
| Reminder | 24 hours before |
| Minimum notice / max days ahead | 12 hours / 60 days |
| Card cancellation inside policy | Refund to card (`stripe_refund`). Set `session_credit` to give a credit instead and keep Stripe's fee |
| Coach notification email | `COACH_NOTIFICATION_EMAIL` secret (e.g. jjprivatetraining@gmail.com) |

**Prices were left blank in the brief.** The seed uses placeholders ($90 1-on-1, $45 group, $425 / $800 packs) for local testing only. Put the real prices in `supabase/setup/production_setup.sql`.

---

## Environment variables

Edge Function secrets (template: [supabase/functions/.env.example](supabase/functions/.env.example)):

| Name | Required | What |
|---|---|---|
| `APP_URL` | yes | `https://app.jjprivatetraining.com` (used for Stripe return URLs, email links, CORS) |
| `PUBLIC_SITE_ORIGINS` | no | Defaults to `https://www.jjprivatetraining.com,https://jjprivatetraining.com` |
| `EXTRA_ALLOWED_ORIGINS` | no | Extra CORS origins, local testing only |
| `STRIPE_SECRET_KEY` | yes | `sk_test_...` (live keys are **refused** unless `STRIPE_ALLOW_LIVE=true`) |
| `STRIPE_WEBHOOK_SECRET` | yes | `whsec_...` from the Stripe webhook endpoint |
| `STRIPE_ALLOW_LIVE` | no | `false` until you decide to take real payments |
| `RESEND_API_KEY` | yes in prod | Empty locally = emails are logged, not sent |
| `EMAIL_FROM` | no | `JJ Private Training <bookings@jjprivatetraining.com>` |
| `EMAIL_REPLY_TO` | no | Where parents' replies go, e.g. `jjprivatetraining@gmail.com` |
| `COACH_NOTIFICATION_EMAIL` | yes | Gets new booking/cancellation/inquiry notices |
| `CRON_SECRET` | yes | Random string. Must match the `cron_secret` Vault secret |
| `RATE_LIMIT_SALT` | yes | Random string used to hash IPs for rate limiting |
| `EMAIL_LOGO_URL` | no | Logo in email headers (defaults to the site's current logo) |

`SUPABASE_URL` and the service key are injected by Supabase automatically.

Frontend (public) values: `VITE_SUPABASE_URL=https://<ref>.supabase.co` and `VITE_SUPABASE_ANON_KEY=<anon or publishable key>`. The service role / secret key must **never** go in the frontend.

Generate secrets with `openssl rand -hex 32`.

---

## Run it locally

Requirements: Docker Desktop and Node 18+. Tested with Supabase CLI 2.122.1.

```bash
npx supabase@2 start                    # Postgres, Auth, Storage, Functions (first run downloads images)
npx supabase@2 db reset                 # apply migrations + seed data
cp supabase/functions/.env.example supabase/functions/.env   # then edit (local values are fine)
npx supabase@2 functions serve --env-file supabase/functions/.env
```

- Studio (database UI): http://127.0.0.1:54323
- Local inbox for auth emails (Mailpit): http://127.0.0.1:54324
- API: http://127.0.0.1:54321. Functions are at `/functions/v1/<name>`
- Test logins (password `Password123!` for all):
  - `coach@example.com`: the coach (Jonathan, the app's admin)
  - `parent.a@example.com`, `parent.b@example.com`: clients signed up as parents
  - `adult@example.com`: client signed up as an adult athlete (books for themselves)

Then start the web app in a second terminal:

```bash
cd app
npm install          # first time only
npm run dev          # http://localhost:5173
```

`app/.env.local` already points at the local backend (template: `app/.env.example`). Card payments need a real `sk_test_` key in `supabase/functions/.env` (see "Stripe locally" below). Without one, "Continue to payment" shows an error, but package-credit bookings work.

Run the tests:

```bash
npx supabase@2 test db                          # 116 pgTAP tests: RLS + booking rules
deno test --allow-env supabase/functions/tests/ # helper unit tests (CORS, escaping, time zones)
node scripts/smoke-test.mjs                     # 44 end-to-end HTTP checks (needs functions serve running)
```

Stripe locally (optional), with the [Stripe CLI](https://stripe.com/docs/stripe-cli):

```bash
stripe listen --forward-to http://127.0.0.1:54321/functions/v1/stripe-webhook
# put the printed whsec_... in supabase/functions/.env as STRIPE_WEBHOOK_SECRET, plus your sk_test_ key
# test card: 4242 4242 4242 4242, any future date, any CVC
```

---

## Deploy

### 1. Create the Supabase project

Create a **new** project at supabase.com (region: East US). Don't reuse the projects the marketing site already uses (see the note in the integration checklist). Then:

```bash
npx supabase@2 login
npx supabase@2 link --project-ref <PROJECT_REF>
npx supabase@2 db push                                  # all migrations (not the seed)
npx supabase@2 secrets set --env-file supabase/functions/.env.production
npx supabase@2 functions deploy                         # deploys all 8 functions with config.toml JWT settings
```

Then open **SQL Editor**, paste [supabase/setup/production_setup.sql](supabase/setup/production_setup.sql), fill in the `<<...>>` values and run it (sections 1-3 and 5 now; section 4 after the coach signs up).

### 2. Auth settings (Dashboard → Authentication)

- **URL Configuration** → Site URL: `https://app.jjprivatetraining.com`. Redirect URLs: `https://app.jjprivatetraining.com/**` (add `http://localhost:5173/**` while developing).
- **Sign In / Providers → Email**: enable "Confirm email". Magic link is on by default.
- **Emails → SMTP Settings**: required. Supabase's built-in email only delivers to your own team and is heavily rate-limited. Use Resend SMTP:
  host `smtp.resend.com`, port `465`, username `resend`, password = your Resend API key, sender `bookings@jjprivatetraining.com`, name `JJ Private Training`.
- **Emails → Templates**: paste the files from [supabase/templates/](supabase/templates/) (Confirm signup, Magic Link, Reset Password, Change Email).
- **Rate limits**: defaults are fine.
- Recommended: enable leaked-password protection, and CAPTCHA (Turnstile) if bot signups appear.

### 3. Point app.jjprivatetraining.com at the frontend

The domain is managed in **Hostinger → Domains → jjprivatetraining.com → DNS / Nameservers → Manage DNS records**. Add **one** record, depending on where the app's frontend is hosted:

| Frontend host | Type | Name | Points to / Target | TTL |
|---|---|---|---|---|
| **Vercel** (recommended) | `CNAME` | `app` | `cname.vercel-dns.com` (or the project-specific value Vercel shows under Domains) | 14400 (default) |
| **Netlify** | `CNAME` | `app` | `<your-site-name>.netlify.app` | 14400 |
| **Hostinger Horizons / Hostinger hosting** | Connect `app.jjprivatetraining.com` as the domain in that project's Hostinger settings. Hostinger adds the record for you | | | |

Notes:
- In Hostinger's form, enter only `app` as the name, not `app.jjprivatetraining.com`.
- If an `A` or `CNAME` record named `app` already exists, delete it first.
- Add the domain in Vercel/Netlify **first**. It verifies once DNS propagates (minutes to a few hours) and issues HTTPS automatically.

**Deploying the web app.** Build command `npm run build`, output folder `dist`, root directory `app`. Set `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the production project's values in the host's environment settings.

Frontend hosting headers (iframe embedding of `/book` allowed only from jjprivatetraining.com, and no framing of anything else) are already included in the app: `app/vercel.json`, plus `app/public/_headers`, `_redirects` and `.htaccess`, which get copied into the build. Originals are in [deploy/](deploy/). Hostinger Horizons doesn't let you set custom headers. If the frontend ends up there, embedding still works but isn't restricted to your domain.

### 4. Sending email from jjprivatetraining.com (Resend)

1. In Resend → **Domains → Add domain** → `jjprivatetraining.com`, region **us-east-1**.
2. Resend shows the exact records. Add them in Hostinger's DNS editor. They look like this:

| Type | Name | Value | Priority |
|---|---|---|---|
| `MX` | `send` | `feedback-smtp.us-east-1.amazonses.com` | `10` |
| `TXT` | `send` | `v=spf1 include:amazonses.com ~all` | |
| `TXT` | `resend._domainkey` | `p=MIGfMA0...` (**unique to your account, so copy it from Resend**) | |
| `TXT` (recommended) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:jjprivatetraining@gmail.com` | |

3. Click **Verify** in Resend. These records live on the `send` / `resend._domainkey` subdomains, so they don't affect any existing email on the main domain.
4. Create an API key → `RESEND_API_KEY` secret. Use the same key as the Supabase SMTP password.

### 5. Stripe (test mode)

The Stripe account should belong to the coach (payments go to their bank). Give the developer access via **Settings → Team**.

1. Dashboard in **Test mode** → Developers → API keys → copy `sk_test_...` → `STRIPE_SECRET_KEY`.
2. Developers → Webhooks → **Add endpoint**: `https://<PROJECT_REF>.supabase.co/functions/v1/stripe-webhook`. Events:
   `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`.
   Copy the signing secret → `STRIPE_WEBHOOK_SECRET`.
3. Settings → Branding: upload the logo, set colors (`#1a1a1a`, accent `#2563eb`) so Checkout matches the site.
4. Settings → Emails: turn on "Successful payments" receipts if you want Stripe receipts too.

**Going live later**:
1. Activate the Stripe account.
2. Create a *live* webhook endpoint (it has a different `whsec_`).
3. Set the live `sk_live_` and webhook secret.
4. Set `STRIPE_ALLOW_LIVE=true`.
5. Redeploy the functions.

### 6. Scheduled reminders

The migrations create the pg_cron jobs. They need two Vault secrets, created in step 5 of `production_setup.sql` (`project_url`, and `cron_secret` = the same value as the `CRON_SECRET` function secret). Check them with the queries at the bottom of that file.

### 7. Make Jonathan the coach

Account types:

| Role | Who | Access |
|---|---|---|
| `coach` | Jonathan: the app's one admin (the database allows exactly one) | Everything: dashboard, schedule, prices, settings, all clients |
| `client` (`client_type = 'parent'`) | Parent or guardian booking for their children | Own account, players, bookings |
| `client` (`client_type = 'adult'`) | Athlete 18+ booking for themselves | Same as a parent. Gets a "myself" player at signup and can add children too |

Jonathan signs up at `https://app.jjprivatetraining.com/login` like any client. Then run section 4 of `production_setup.sql`. Roles can only be changed in SQL, never from the app.

---

## Day-to-day notes

- **Prices, hours, policy**: the coach changes them in the admin UI, or in Table Editor (`session_types`, `packages`, `availability`, `app_settings`).
- **Refunds done in the Stripe dashboard** are synced by the `charge.refunded` webhook. Package refunds don't remove credits automatically; adjust `package_purchases.sessions_remaining` if needed.
- **Comp a free session**: insert a `package_purchases` row with `source = 'coach_grant'`, or use the coach "create booking" action with payment `manual`.
- **New database functions are private by default** (migration 09). `GRANT EXECUTE ... TO authenticated` any function the browser should call.
- **Storage limits**: the drill-videos bucket allows 500 MB per file, but the Supabase Free plan caps uploads at 50 MB. Use the Pro plan or YouTube links (`external_url`) for longer videos.
