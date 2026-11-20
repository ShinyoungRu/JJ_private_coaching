# App API reference (for building the frontend)

Everything the app.jjprivatetraining.com frontend needs to talk to this backend. Give this file to whichever tool or developer builds the screens.

## Setup

```js
import { createClient } from "@supabase/supabase-js";
export const supabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
// Only the anon/publishable key goes in the browser. Never the service role / secret key.
```

Call Edge Functions with `supabase.functions.invoke(name, { body })`. It attaches the logged-in user's token automatically. Errors come back as HTTP 4xx with this body:

```json
{ "error": { "code": "slot_unavailable", "message": "That time is no longer available. Please pick another slot." } }
```

`message` is written for parents and can be shown as-is. Use `code` for logic (see [Error codes](#error-codes)).

**Times**: every timestamp is ISO 8601 UTC. Show them in the coach's time zone (`app_settings.timezone`, `America/New_York`):

```js
new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(iso));
```

**Money**: `price_cents` integers. `$${(cents / 100).toFixed(2)}`.

**Branding**: dark background `#1a1a1a`, primary blue `#2563eb`, light accent `#60a5fa`, font Inter. Logo: `https://horizons-cdn.hostinger.com/15d30f89-ee6f-40af-a967-2464869fd5b6/4f227aae71add9c639ba8f483f5edf44.png`. Header text "Private Training, Co." / "Elite Soccer Training".

---

## Routes the app must provide

These URLs are used by the marketing site, Stripe and emails. Keep them stable.

| Route | Purpose |
|---|---|
| `/login` | Email + password, magic link, "forgot password", sign-up |
| `/book` | Booking calendar. **`?type=<session_type_id>`** preselects a session type. `?checkout=cancelled&booking_id=...` = parent backed out of Stripe (call `booking-actions` cancel to release the hold right away) |
| `/embed/book` | Same calendar with no site header, for the iframe on the marketing site. Its "Book" buttons open `/book?...` in a new tab (`target="_blank"`) |
| `/packages` | Buy packages. `?purchase=success&session_id=cs_...` or `?purchase=cancelled` |
| `/booking/success` | After Stripe: `?session_id=cs_...`. Poll until the webhook confirms (below) |
| `/bookings` | Parent's upcoming/past bookings, with cancel and reschedule |
| `/players` | Parent's children (add/edit/archive), notes and drills per child |
| `/account` | Name, phone, announcement opt-out, change email/password |
| `/reset-password` | Set a new password after the recovery email |
| `/admin` | Coach dashboard: today, this week, stats |
| `/admin/inquiries` | Website inquiries |

Route guards: logged-out users go to `/login?next=<path>`. Show `/admin*` only when `profiles.role === 'coach'`. This is cosmetic only: the database enforces access no matter what the UI shows.

---

## Auth

```js
// Sign up (profile row is created automatically, role is always 'client').
// account_type: 'parent' (booking for children, the default) or 'adult' (18+, booking
// for themselves: a "myself" player with is_self = true is created automatically).
await supabase.auth.signUp({
  email, password, // min 8 chars, letters + digits
  options: { data: { full_name, phone, account_type }, emailRedirectTo: `${APP_URL}/login` },
});
await supabase.auth.signInWithPassword({ email, password });
await supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: `${APP_URL}/bookings` } }); // magic link
await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${APP_URL}/reset-password` });
await supabase.auth.updateUser({ password: newPassword });  // on /reset-password
```

Current user's role: `supabase.from("profiles").select("*").eq("id", user.id).single()`.

---

## Parent screens

### Players (children)
```js
supabase.from("players").select("*").eq("active", true).order("first_name");
supabase.from("players").insert({ first_name, age_group, skill_level, notes }); // parent_id defaults to the current user
supabase.from("players").update({ first_name, age_group, skill_level, notes }).eq("id", id);
supabase.from("players").update({ active: false }).eq("id", id); // archive (delete fails once a player has bookings)
```
- `age_group`: `U5` … `U23` or `Adult`
- `skill_level`: `beginner | intermediate | advanced | elite`
- No email, phone or photo fields for children, by design.

### Catalog
```js
supabase.from("session_types").select("*").eq("active", true).order("sort_order");
supabase.from("packages").select("*").eq("active", true).order("sort_order");
supabase.from("app_settings").select("*").single(); // timezone, cancellation_window_hours, ...
```

### Calendar
```js
const { data: slots } = await supabase.rpc("get_available_slots", {
  p_session_type_id, p_from: "2026-12-01", p_to: "2026-12-14", // dates in the coach's time zone, max 62 days
});
// -> [{ slot_start, slot_end, capacity, spots_left }]
```
For group sessions, show "2 spots left" from `spots_left`.

### Book
Show "Use a package credit" only if the parent has matching credits:
```js
supabase.from("package_purchases").select("*").gt("sessions_remaining", 0);
// a credit matches when (session_type_id is null OR = the chosen type) AND (expires_at is null OR > slot_start)
```

**With a package credit (instant):**
```js
const { data, error } = await supabase.functions.invoke("booking-actions", {
  body: { action: "book_with_package", session_type_id, player_id, start_time: slot.slot_start, parent_note },
});
// data.booking
```

**Pay by card:**
```js
const { data, error } = await supabase.functions.invoke("stripe-checkout", {
  body: { kind: "session", session_type_id, player_id, start_time: slot.slot_start, parent_note },
});
window.top.location.href = data.url; // TOP window: Stripe Checkout cannot load inside an iframe
```
The slot is held about 35 min (`data.hold_expires_at`).

**On `/booking/success?session_id=cs_...`**, poll every 2 s for up to about 30 s:
```js
supabase.from("bookings").select("id,status,payment_status,start_time").eq("stripe_checkout_session_id", sessionId).maybeSingle();
// status 'booked' + payment_status 'paid' = confirmed. Until then show "Confirming your payment..."
```

### Packages
```js
const { data } = await supabase.functions.invoke("stripe-checkout", { body: { kind: "package", package_id } });
window.top.location.href = data.url;
// On /packages?purchase=success&session_id=cs_..., poll:
supabase.from("package_purchases").select("*").eq("stripe_checkout_session_id", sessionId).maybeSingle();
```

### My bookings
```js
supabase.from("bookings")
  .select("*, player:players(first_name), session_type:session_types(name, duration_minutes), note:session_notes(*)")
  .in("status", ["booked", "completed", "no_show", "cancelled"])
  .order("start_time", { ascending: false });
```
Status labels: `pending_payment` = "Awaiting payment", `booked`, `completed`, `no_show`, `cancelled`. `late_cancellation` = forfeited.

Show **Cancel** / **Reschedule** when `status === 'booked'`. If `start_time - now < cancellation_window_hours`, warn: "This is inside 24 hours. The session will be forfeited." Reschedule is not allowed inside the window.

```js
await supabase.functions.invoke("booking-actions", { body: { action: "cancel", booking_id, reason } });
// -> { result: { action: 'credit_returned' | 'stripe_refund' | 'session_credit' | 'forfeited' | 'released_hold' | 'none', within_policy }, refund_status }
await supabase.functions.invoke("booking-actions", { body: { action: "reschedule", booking_id, new_start_time } });
```

### Notes and drills (read-only for parents)
```js
supabase.from("session_notes").select("*, booking:bookings(start_time, session_type:session_types(name))").eq("player_id", id).order("created_at", { ascending: false });
supabase.from("player_drills").select("assigned_at, coach_note, drill:drills(*)").eq("player_id", id).order("assigned_at", { ascending: false });
// uploaded video:
const { data } = await supabase.storage.from("drill-videos").createSignedUrl(drill.video_path, 3600);
// or drill.external_url (YouTube etc.)
```

### Account
```js
supabase.from("profiles").update({ full_name, phone, announcements_opt_in }).eq("id", user.id);
// email/role can't be changed here; change email with supabase.auth.updateUser({ email })
```

---

## Coach screens

Every query below works only for the coach account. The database rejects anyone else.

### Dashboard
```js
supabase.rpc("admin_schedule");                                   // today
supabase.rpc("admin_schedule", { p_to: todayPlus6 });              // this week (dates as 'YYYY-MM-DD', coach's time zone)
supabase.rpc("admin_schedule", { p_from, p_to, p_include_cancelled: true });
// rows: booking_id, slot_key (same value = same group session), start_time, local_date, local_start, status,
//       paid_with, payment_status, price_cents, session_type_name, player_first_name, player_age_group,
//       player_skill_level, parent_name, parent_email, parent_phone, parent_note, has_session_note
supabase.rpc("admin_stats");
// { sessions_this_month, player_sessions_this_month, completed_this_month, no_shows_this_month,
//   revenue_this_month_cents, upcoming_sessions_7_days, active_players, total_families,
//   new_inquiries, unpaid_manual_bookings, outstanding_package_credits }
```
Payment status badge: `paid_with` (`stripe`/`package`/`manual`) + `payment_status` (`unpaid`/`paid`/`refunded`).

### After a session (quick form)
```js
supabase.rpc("admin_complete_session", {
  p_booking_id, p_skills: ["first touch", "weak foot"], p_coach_notes, p_homework,
  p_status: "completed", // or "no_show"
});
supabase.rpc("admin_set_booking_status", { p_booking_id, p_status: "no_show" });
supabase.rpc("admin_set_booking_status", { p_booking_id, p_payment_status: "paid" }); // manual (cash/Venmo) bookings only
```

### Bookings on behalf of a family / cancel as coach
```js
supabase.functions.invoke("booking-actions", { body: {
  action: "admin_create_booking", player_id, session_type_id, start_time,
  use_package: false,           // true = use the family's credit
  override_availability: false, // true = allow outside published hours
  note, notify_parent: true,
}});
supabase.functions.invoke("booking-actions", { body: { action: "cancel", booking_id, reason: "Field closed" } });
// coach cancellations always refund the card or return the credit
```

### Availability
```js
supabase.from("availability").select("*").order("day_of_week").order("start_time");
supabase.from("availability").insert({ day_of_week: 1, start_time: "16:00", end_time: "20:00" }); // 0=Sun..6=Sat, local time
supabase.from("availability").update({ active: false }).eq("id", id);
supabase.from("availability").delete().eq("id", id);

// block time off: whole days or exact times; returns bookings it overlaps so the coach can cancel them
supabase.rpc("admin_block_time", { p_start_date: "2026-12-24", p_end_date: "2026-12-26", p_reason: "Holiday" });
supabase.rpc("admin_block_time", { p_start: isoStart, p_end: isoEnd, p_reason: "Field closed" });
supabase.from("blocked_times").select("*").gte("end_time", new Date().toISOString()).order("start_time");
supabase.from("blocked_times").delete().eq("id", id);
```

### Catalog
Table CRUD on `session_types` and `packages`. Prices are in cents. Deactivate (`active: false`) instead of deleting.

### Drills
```js
const { data: drill } = await supabase.from("drills").insert({ title, description, skill_tag }).select().single();
const path = `${drill.id}/${file.name}`;
await supabase.storage.from("drill-videos").upload(path, file, { contentType: file.type });
await supabase.from("drills").update({ video_path: path }).eq("id", drill.id);
supabase.from("player_drills").insert({ player_id, drill_id: drill.id, coach_note });
supabase.from("player_drills").delete().match({ player_id, drill_id });
```
Allowed uploads: mp4, mov, webm, m4v, jpg, png, webp. 500 MB bucket limit (50 MB on the Supabase Free plan).

### Families, credits, settings
```js
supabase.from("profiles").select("*, players(*)").eq("role", "client").order("full_name");
supabase.from("package_purchases").insert({ parent_id, source: "coach_grant", label: "Comp session", sessions_total: 1, sessions_remaining: 1 });
supabase.from("app_settings").update({ cancellation_window_hours: 24, reminder_hours_before: 24 }).eq("id", 1);
```

### Inquiries
```js
supabase.from("inquiries").select("*").order("created_at", { ascending: false });
supabase.from("inquiries").update({ status: "replied" }).eq("id", id); // new | replied | closed
```

### Announcements
```js
await supabase.functions.invoke("send-announcement", { body: { subject, message, audience: "today", dry_run: true } });
// -> { recipient_count }  show "This will email N families", then send without dry_run
await supabase.functions.invoke("send-announcement", { body: { subject, message, audience } });
supabase.from("announcements").select("*").order("created_at", { ascending: false }); // history
```
Audiences:
- `all`: every parent who hasn't opted out.
- `today`: parents with a session today.
- `this_week`: parents with a session in the next 7 days.

---

## Public endpoints (no login)

Used by the marketing site and the app's logged-out pages. CORS allows only `https://www.jjprivatetraining.com`, `https://jjprivatetraining.com` and the app itself (`APP_URL`).

| Endpoint | Returns |
|---|---|
| `GET /functions/v1/public-availability?limit=5&session_type_id=` | `{ timezone, slots: [{ session_type_id, session_type, start, end, display_date, display_time, book_url }] }` |
| `GET /functions/v1/public-pricing` | `{ currency, session_types: [{ id, name, description, duration_minutes, price_cents, price_display, max_players, book_url }], packages: [{ ..., per_session_display, buy_url }] }` |
| `POST /functions/v1/contact-form` | body `{ name, email, phone?, message, website: "" }` → `{ ok: true }` |

---

## Error codes

| code | Meaning / suggested UI |
|---|---|
| `unauthorized` (401) | Session expired. Send to `/login` |
| `forbidden` (403) | Not allowed (e.g. parent calling a coach action) |
| `slot_unavailable` (409) | Someone just took it. Refresh slots |
| `slot_full` (409) | Group is full |
| `no_credits` (409) | No matching package credits. Offer card payment or packages |
| `player_not_found` (409) | Player isn't on this account / archived |
| `booking_not_found` (409) | Booking doesn't exist or isn't yours |
| `not_cancellable` / `not_reschedulable` (409) | Already cancelled/completed |
| `already_started` (409) | Session already started |
| `outside_window` (409) | Inside the 24 h window, so it can't be rescheduled |
| `too_many_holds` (409) | 3 unfinished checkouts. Finish or cancel them |
| `not_payable_online` (400) | Price below the Stripe minimum |
| `invalid_input` / `bad_range` (400) | Fix the form |
| `rate_limited` (429) | Contact form flood protection |
| `duplicate_announcement` (409) | Same announcement sent in the last 2 minutes |
| `server_error` (500) | Generic. Retry |

RPC errors from `supabase.rpc(...)` have the same code in `error.hint`.
