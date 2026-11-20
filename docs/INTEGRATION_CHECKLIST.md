# Integration checklist: www.jjprivatetraining.com → app.jjprivatetraining.com

The marketing site stays as it is. These are the only additions: links/buttons, and later a contact-form hookup and an "next available sessions" widget.
Replace `YOUR-PROJECT-REF` with the **app's** Supabase project ref (Dashboard → Project Settings → General).

---

## ⚠️ Read first: the current site already has its own backend

The live site's code (checked 2026-11-17) is **not** frontend-only. It talks to two existing Supabase projects (`jtxpiupbetatxhrjjlxr`, `sffnslikyrnlezivcggn`) and has:

- its own **`/login`, `/dashboard`, `/trainer-dashboard`** pages
- tables for `bookings`, `clients`, `packages`, `scheduled_sessions`, `session_requests`, `waivers`, `notifications`, `contact_messages`
- Stripe functions (`create-booking-checkout`, `verify-booking-payment`) and a working contact form (`send-contact-email`)
- **`/packages`, `/checkout`, `/payment-success`** pages and a waiver flow

Before linking parents to the new app, decide:
1. **Which booking system parents use.** Running two side by side means two calendars, which can double-book the coach. Recommended: send all new booking traffic to app.jjprivatetraining.com and remove (or hide) the old booking/checkout/login pages in Horizons.
2. **Existing clients and paid packages** in the old project. Export them (Supabase Dashboard → Table Editor → Export CSV) and re-create the families and their remaining credits in the new app (`package_purchases` with `source = 'coach_grant'`), or honor them manually.
3. **Waivers.** The new app doesn't collect waivers. Keep the old waiver flow or add one later.
4. **Which contact form.** Switching (step 3 below) sends new messages to the app's Inquiries screen instead of the old `contact_messages` table.

Don't delete the old Supabase projects until everything is migrated.

---

## 1. Buttons and links to add

| Where on the site | Label | URL |
|---|---|---|
| Header / nav (every page), primary button | **Book a Session** | `https://app.jjprivatetraining.com/book` |
| Header / nav, secondary link | **Parent Login** | `https://app.jjprivatetraining.com/login` |
| Home hero, next to "View Training Packages" | **Book a Session** | `https://app.jjprivatetraining.com/book` |
| Training Packages page: each 1-on-1 card | **Book 1-on-1** | `https://app.jjprivatetraining.com/book?type=<1-on-1 id>` |
| Training Packages page: each group card | **Book Small Group** | `https://app.jjprivatetraining.com/book?type=<group id>` |
| Training Packages page: each multi-session pack | **Buy Package** | `https://app.jjprivatetraining.com/packages` |
| Footer → Quick Links | **Book Online**, **Parent Login** | `/book`, `/login` on app.jjprivatetraining.com |
| Contact page, below the form | "Already a client? **Log in to book**" | `https://app.jjprivatetraining.com/login` |

Get the `<... id>` values after production setup with `select id, name from session_types;` in the SQL editor, or from the `book_url` fields of `https://YOUR-PROJECT-REF.supabase.co/functions/v1/public-pricing`.

Open the links in the **same tab** (normal links). The app has the same dark branding, so it feels like one site.

### Paste-ready prompt for Hostinger Horizons

> Add links to my separate booking app. Do not change anything else on the site, and do not modify any existing Supabase code, pages, or data.
> 1. In the header navigation on every page, add a primary button "Book a Session" linking to https://app.jjprivatetraining.com/book and a text link "Parent Login" linking to https://app.jjprivatetraining.com/login. Match the existing button style.
> 2. On the home page hero, add a second button "Book a Session" next to "View Training Packages", linking to https://app.jjprivatetraining.com/book.
> 3. In the footer Quick Links, add "Book Online" (https://app.jjprivatetraining.com/book) and "Parent Login" (https://app.jjprivatetraining.com/login).
> 4. Use normal links (same tab), not router links, because these are a different domain.

---

## 2. "Next available sessions" widget (later)

Ready-to-paste block: [integration/next-sessions-widget.html](../integration/next-sessions-widget.html). It calls `public-availability`, which returns only dates and times, and links each time to `/book?type=...`.

Horizons is a React app, so ask Horizons to build it:

> Add a "Next available sessions" card to the home page below the hero. On load, fetch GET https://YOUR-PROJECT-REF.supabase.co/functions/v1/public-availability?limit=4 (no auth headers). The JSON is { slots: [{ session_type, display_date, display_time, book_url }] }. Show each slot as a row: "display_date · display_time", session_type underneath in gray, and a blue "Book" button linking to book_url. Below the list add a link "See full calendar →" to https://app.jjprivatetraining.com/book. If the request fails or there are no slots, show only a "Book a session →" link. Dark card style (#1a1a1a background, white text, primary blue buttons). Do not use Supabase client code for this; use plain fetch.

## 3. Contact form → app inquiries (later)

Ready-to-paste block: [integration/contact-form.html](../integration/contact-form.html). It keeps the spam honeypot and works without JavaScript too.

Horizons prompt:

> Change the existing contact form so it no longer uses the current send-contact-email function or contact_messages table. Instead, on submit, POST JSON to https://YOUR-PROJECT-REF.supabase.co/functions/v1/contact-form with Content-Type application/json and the body { "name", "email", "phone", "message", "website" }. "website" is a hidden honeypot field: add an input named website inside a visually hidden container (position:absolute; left:-10000px), with tabindex="-1" and autocomplete="off", and always send its value. On HTTP 200 clear the form and show "Thanks! Your message was sent." On an error, show the error.message from the JSON response. No auth headers. Keep the current form design.

What happens on the server:
1. The honeypot check, the Origin allow-list (only jjprivatetraining.com) and per-IP/per-email/global rate limits run first.
2. The message is saved to `inquiries` with status `new`.
3. The coach gets an email (reply goes straight to the sender) and sees it under `/admin/inquiries`.

## 4. Embedding the booking calendar (optional)

```html
<iframe src="https://app.jjprivatetraining.com/embed/book"
        title="Book a training session" loading="lazy"
        style="width:100%;min-height:760px;border:0;border-radius:16px;background:#1a1a1a"></iframe>
```

- Only `/book` and `/embed/*` may be framed, and only by jjprivatetraining.com (headers in [deploy/](../deploy/)).
- Logging in and paying happen in a **new tab / top window**. Browsers block login cookies inside cross-site iframes, and Stripe Checkout refuses to load in an iframe. The embed view should link out for those steps.

## 5. Showing prices from the app (optional)

`GET https://YOUR-PROJECT-REF.supabase.co/functions/v1/public-pricing` returns active session types and packages with `price_display`, `book_url` and `buy_url`. That way the site's prices always match what Stripe charges.

---

## Verify after each change

- [ ] Every new link opens the right app page (`/book`, `/book?type=...` preselects the type, `/login`, `/packages`).
- [ ] The widget shows times in Eastern time, and "Book" opens the right session type.
- [ ] A test contact message shows up in the app's Inquiries and in the coach's email, and Reply goes to the sender.
- [ ] Submitting the contact form 6 times in an hour from one network shows the "Too many messages" error.
- [ ] The old pages you decided to retire are hidden, and parents can't book the same time twice through two systems.
