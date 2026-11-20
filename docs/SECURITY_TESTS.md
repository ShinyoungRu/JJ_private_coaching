# Security tests

## Automated (run before every deploy)

```bash
npx supabase@2 db reset && npx supabase@2 test db   # 116 database tests (RLS, privileges, booking rules, storage)
deno test --allow-env supabase/functions/tests/      # CORS allow-list, escaping, secret compare, time zones
node scripts/smoke-test.mjs                          # 44 end-to-end HTTP checks (local only)
```

Covered automatically:
- Parent A can't see or change parent B's profile, players, bookings, notes, drills, payments or credits.
- Parents can't create "paid" bookings, top up credits, write notes, change roles or call service-only functions.
- Anonymous users can't read any table.
- Public endpoints contain no names, emails, phone numbers or booking details.
- Double-booking is blocked by the database, group sessions are capped, and the cancellation policy is applied.
- Forged Stripe webhooks are rejected and replayed webhooks are ignored.
- Contact form honeypot, foreign-origin block and rate limits work.
- Drill videos are visible only to families with that drill assigned.

## Manual checks on the real (production or staging) project

Do these in test mode, with two throwaway parent accounts (A and B) and the coach account. In the browser, run snippets in DevTools → Console on app.jjprivatetraining.com while logged in (the app's `supabase` client must be on `window`, or use the Supabase JS CDN).

### Accounts and roles
1. [ ] Sign up as parent A. The confirmation email arrives **from bookings@jjprivatetraining.com** with JJ branding, and the link returns to `https://app.jjprivatetraining.com`.
2. [ ] Magic link and password reset both arrive and return to the app domain (not localhost, not supabase.co).
3. [ ] Sign up with extra metadata to try to become coach:
   `supabase.auth.signUp({ email, password, options: { data: { role: "coach" } } })` → the profile role is still `parent`.
4. [ ] As parent A: `await supabase.from("profiles").update({ role: "coach" }).eq("id", user.id)` → error (permission denied).

### Data isolation (parent A vs parent B)
5. [ ] As A, add a child. As B, `await supabase.from("players").select("*")` → only B's children, never A's.
6. [ ] As B, `await supabase.from("players").select("*").eq("id", "<A's player id>")` → `[]`.
7. [ ] As B, `await supabase.from("bookings").select("*")`, then `session_notes`, `player_drills`, `payments`, `package_purchases` → only B's own rows.
8. [ ] As B, `await supabase.from("players").insert({ parent_id: "<A's user id>", first_name: "X" })` → error.
9. [ ] As B, try to cancel A's booking: `supabase.functions.invoke("booking-actions", { body: { action: "cancel", booking_id: "<A's booking>" } })` → `booking_not_found`.
10. [ ] As A, `await supabase.from("inquiries").select("*")` → `[]`, and `await supabase.rpc("admin_stats")` → error.
11. [ ] As A, open a drill video signed URL for B's assigned drill: `supabase.storage.from("drill-videos").createSignedUrl("<B's drill video_path>", 60)` → error.

### Payments can't be faked
12. [ ] As A, `await supabase.from("bookings").insert({...status:"booked", payment_status:"paid"...})` → permission denied.
13. [ ] As A, `await supabase.rpc("confirm_stripe_booking", {...})` and `await supabase.rpc("book_with_package", {...})` → permission denied.
14. [ ] Start a card checkout, close the Stripe tab without paying → the slot is held, then free again after ~35 min (or right away if the app calls cancel on `?checkout=cancelled`). The booking never shows as paid.
15. [ ] Pay with `4242 4242 4242 4242` → the booking shows booked + paid only after the webhook (Stripe Dashboard → Webhooks shows a 200).
16. [ ] In Stripe Dashboard → Webhooks → your endpoint → **Resend** the same event → no duplicate booking, credits or email.
17. [ ] Send a fake webhook: `curl -X POST https://<ref>.supabase.co/functions/v1/stripe-webhook -H "stripe-signature: t=1,v1=fake" -d '{}'` → `400 invalid_signature`.
18. [ ] Card `4000 0000 0000 0002` (declined) → no booking, and the slot frees up.
19. [ ] With `STRIPE_ALLOW_LIVE` unset, setting an `sk_live_` key makes checkout fail with a clear error (no live charges by accident).

### Booking rules
20. [ ] Two browsers (A and B) book the same 1-on-1 slot at the same moment → exactly one succeeds, and the other gets "That time is no longer available."
21. [ ] Group session with `max_players = 2`: a third child is refused.
22. [ ] Cancel more than 24 h ahead → credit back / card refunded (check Stripe → Payments → Refunded).
23. [ ] Cancel inside 24 h → "forfeited", no credit returned, and reschedule refused.
24. [ ] Reminder email arrives about 24 h before (check `cron.job_run_details` and `net._http_response` if not).
25. [ ] `curl -X POST https://<ref>.supabase.co/functions/v1/send-reminders` without the secret → `401`.

### Public endpoints leak nothing
26. [ ] `curl https://<ref>.supabase.co/functions/v1/public-availability?limit=50` → only `session_type`, dates and times. Search the output for `@`, family names and child names: none.
27. [ ] `curl https://<ref>.supabase.co/functions/v1/public-pricing` → only catalog data.
28. [ ] CORS (only testable on the hosted project; the local gateway always sends `*`):
    - `curl -sI -H "Origin: https://www.jjprivatetraining.com" .../public-pricing` → `access-control-allow-origin: https://www.jjprivatetraining.com`
    - `curl -sI -H "Origin: https://evil.example" .../public-pricing` → **no** `access-control-allow-origin` header.
29. [ ] Anonymous REST: `curl "https://<ref>.supabase.co/rest/v1/players?select=*" -H "apikey: <anon key>"` → error, no rows. Repeat for `bookings`, `inquiries`, `profiles`.
30. [ ] Anonymous insert: `curl -X POST "https://<ref>.supabase.co/rest/v1/inquiries" -H "apikey: <anon key>" -H "Content-Type: application/json" -d '{"name":"x","email":"x@x.com","message":"x"}'` → error.

### Contact form
31. [ ] A normal submission arrives in Inquiries and in the coach's email. **Reply** goes to the sender.
32. [ ] Fill the hidden `website` field (DevTools) → "success" shown, but nothing saved or emailed.
33. [ ] `curl -X POST .../contact-form -H "Origin: https://evil.example" -H "Content-Type: application/json" -d '{"name":"x","email":"x@x.com","message":"hi"}'` → `403`.
34. [ ] 6 submissions within an hour from one IP → the 6th gets `429`.
35. [ ] Put `<script>alert(1)</script>` in the message → the coach email shows it as plain text, and nothing runs.

### Embedding / headers (after the frontend is deployed)
36. [ ] `curl -sI https://app.jjprivatetraining.com/book` → `content-security-policy: frame-ancestors 'self' https://www.jjprivatetraining.com https://jjprivatetraining.com`
37. [ ] `curl -sI https://app.jjprivatetraining.com/login` → `frame-ancestors 'self'` (can't be framed by other sites).

### Keys and config
38. [ ] Search the deployed frontend JS for `service_role` / `sb_secret_` → not found. Only the anon/publishable key is present.
39. [ ] Supabase Dashboard → Advisors → Security: no "RLS disabled" or "function search_path mutable" warnings for this project.
40. [ ] `select count(*) from profiles where role = 'coach'` → exactly 1.
