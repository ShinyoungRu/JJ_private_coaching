#!/usr/bin/env node
// End-to-end HTTP smoke test against the LOCAL Supabase stack.
//
//   npx supabase start
//   npx supabase db reset                      # fresh seed data
//   npx supabase functions serve --env-file supabase/functions/.env
//   node scripts/smoke-test.mjs
//
// It creates bookings/inquiries, so it refuses to run against a non-local URL.
// No dependencies (Node 18+).
import crypto from "node:crypto";

const URL_BASE = process.env.SUPABASE_URL ?? "http://127.0.0.1:54321";
// Well-known keys of the local Supabase demo stack (not secrets).
const ANON = process.env.SUPABASE_ANON_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY ??
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
const WHSEC = process.env.STRIPE_WEBHOOK_SECRET ?? "whsec_local_test_secret";
const CRON = process.env.CRON_SECRET ?? "local-cron-secret-change-me";
const SITE = "https://www.jjprivatetraining.com";

if (!/^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(URL_BASE)) {
  console.error(`Refusing to run against ${URL_BASE}: this test writes data. Local only.`);
  process.exit(2);
}

const ID = {
  coach: "a0000000-0000-4000-8000-000000000001",
  parentA: "a0000000-0000-4000-8000-000000000002",
  parentB: "a0000000-0000-4000-8000-000000000003",
  mia: "b0000000-0000-4000-8000-000000000001",
  sam: "b0000000-0000-4000-8000-000000000003",
  oneOnOne: "c0000000-0000-4000-8000-000000000001",
  smallGroup: "c0000000-0000-4000-8000-000000000002",
  pkgGroup5: "d0000000-0000-4000-8000-000000000003",
};
// Personal data from the seed that must NEVER appear in public responses.
const PII = ["Alex", "Parker", "Blair", "Rivera", "Mia", "Leo", "Sam", "example.com", "555-01", "parent_id"];

let passed = 0;
let failed = 0;
function check(cond, msg, extra) {
  if (cond) {
    passed++;
    console.log(`  ok   ${msg}`);
  } else {
    failed++;
    console.log(`  FAIL ${msg}${extra !== undefined ? `  -> ${JSON.stringify(extra).slice(0, 300)}` : ""}`);
  }
}

async function call(path, { method = "GET", body, token, headers = {}, raw = false } = {}) {
  const res = await fetch(`${URL_BASE}${path}`, {
    method,
    redirect: "manual",
    headers: {
      apikey: ANON,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body && !raw ? { "Content-Type": "application/json" } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch { /* not json */ }
  return { status: res.status, headers: res.headers, json, text };
}
const fn = (name, opts) => call(`/functions/v1/${name}`, opts);
const rest = (path, opts = {}) => call(`/rest/v1/${path}`, { token: SERVICE, ...opts, headers: { apikey: opts.token ? ANON : SERVICE, ...(opts.headers ?? {}) } });

async function login(email) {
  const r = await call("/auth/v1/token?grant_type=password", { method: "POST", body: { email, password: "Password123!" } });
  if (!r.json?.access_token) throw new Error(`login failed for ${email}: ${r.text}`);
  return r.json.access_token;
}

function stripeSignature(payload) {
  const t = Math.floor(Date.now() / 1000);
  const sig = crypto.createHmac("sha256", WHSEC).update(`${t}.${payload}`).digest("hex");
  return `t=${t},v1=${sig}`;
}
async function sendWebhook(event) {
  const payload = JSON.stringify(event);
  return fn("stripe-webhook", { method: "POST", raw: true, body: payload, headers: { "stripe-signature": stripeSignature(payload), "Content-Type": "application/json" } });
}

function isoDate(daysFromNow) {
  return new Date(Date.now() + daysFromNow * 86400_000).toISOString().slice(0, 10);
}

// ---------------------------------------------------------------------------
console.log("\nPublic endpoints");
{
  const r = await fn("public-pricing", { headers: { Origin: SITE } });
  check(r.status === 200, "public-pricing returns 200", r.status);
  // The LOCAL gateway (Kong) rewrites CORS to "*"; hosted Supabase passes the function's headers through.
  const localCorsOverride = r.headers.get("access-control-allow-origin") === "*";
  if (localCorsOverride) console.log("  skip CORS origin checks: local gateway sends '*' (covered by deno unit tests + production curl check)");
  else check(r.headers.get("access-control-allow-origin") === SITE, "public-pricing allows www.jjprivatetraining.com (CORS)");
  check(r.json?.session_types?.length === 2, "only active session types are listed", r.json?.session_types?.map((t) => t.name));
  check(r.json?.packages?.length === 3, "active packages are listed");
  check(typeof r.json?.location?.name === "string" && r.json.location.maps_url?.startsWith("https://www.google.com/maps/"), "public-pricing includes the training location");
  check(!PII.some((p) => r.text.includes(p)), "public-pricing leaks no personal data");

  const evil = await fn("public-pricing", { headers: { Origin: "https://evil.example" } });
  if (!localCorsOverride) check(!evil.headers.get("access-control-allow-origin"), "other websites get no CORS permission");

  const a = await fn("public-availability?limit=8", { headers: { Origin: "https://jjprivatetraining.com" } });
  check(a.status === 200, "public-availability returns 200", a.status);
  check(a.json?.slots?.length > 0, "public-availability lists upcoming slots");
  const allowedKeys = ["session_type_id", "session_type", "start", "end", "display_date", "display_time", "book_url"];
  check(a.json?.slots?.every((s) => Object.keys(s).every((k) => allowedKeys.includes(k))), "slots contain only time + session type fields");
  check(!PII.some((p) => a.text.includes(p)), "public-availability leaks no personal data");
  check(a.json?.slots?.every((s) => new Date(s.start) > new Date()), "all public slots are in the future");
}

console.log("\nContact form");
{
  const unique = crypto.randomUUID().slice(0, 8);
  const ok = await fn("contact-form", {
    method: "POST",
    headers: { Origin: SITE },
    body: { name: "Smoke Tester", email: `smoke-${unique}@example.org`, phone: "610-555-0123", message: `Hello ${unique}`, website: "" },
  });
  check(ok.status === 200 && ok.json?.ok, "valid inquiry accepted", ok.json);
  const saved = await rest(`inquiries?message=eq.Hello%20${unique}&select=id,status`);
  check(saved.json?.length === 1 && saved.json[0].status === "new", "inquiry saved with status new", saved.json);

  const bot = await fn("contact-form", {
    method: "POST",
    headers: { Origin: SITE },
    body: { name: "Bot", email: `bot-${unique}@example.org`, message: `spam ${unique}`, website: "http://spam.example" },
  });
  check(bot.status === 200, "honeypot submission gets a fake success");
  const botSaved = await rest(`inquiries?message=eq.spam%20${unique}&select=id`);
  check(botSaved.json?.length === 0, "honeypot submission is NOT saved");

  const foreign = await fn("contact-form", { method: "POST", headers: { Origin: "https://evil.example" }, body: { name: "x", email: "x@example.org", message: "x" } });
  check(foreign.status === 403, "posts from other websites are rejected", foreign.status);

  const bad = await fn("contact-form", { method: "POST", headers: { Origin: SITE }, body: { name: "x", email: "not-an-email", message: "hi" } });
  check(bad.status === 400, "invalid email rejected", bad.status);

  const form = await fn("contact-form", {
    method: "POST",
    raw: true,
    headers: { Origin: SITE, "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ name: "Form Post", email: `form-${unique}@example.org`, message: "plain html form", _redirect: `${SITE}/contact?sent=1` }).toString(),
  });
  check(form.status === 303 && form.headers.get("location") === `${SITE}/contact?sent=1`, "plain HTML form post redirects back to the site", form.status);

  // Same IP: 3 accepted so far (ok, form, + bad/foreign don't count). Hammer until limited.
  let limited = false;
  for (let i = 0; i < 8 && !limited; i++) {
    const r = await fn("contact-form", { method: "POST", headers: { Origin: SITE }, body: { name: "Flood", email: `flood${i}-${unique}@example.org`, message: `flood ${i}` } });
    if (r.status === 429) limited = true;
  }
  check(limited, "rate limit kicks in after repeated posts from one IP");
}

console.log("\nAuth checks on private functions");
{
  const r = await fn("booking-actions", { method: "POST", body: { action: "cancel", booking_id: ID.mia } });
  check(r.status === 401, "booking-actions without login -> 401", r.status);
  const r2 = await fn("stripe-checkout", { method: "POST", body: { kind: "package", package_id: ID.pkgGroup5 } });
  check(r2.status === 401, "stripe-checkout without login -> 401", r2.status);
  const r3 = await fn("send-reminders", { method: "POST" });
  check(r3.status === 401, "send-reminders without cron secret -> 401", r3.status);
  const r4 = await fn("stripe-webhook", { method: "POST", raw: true, body: "{}", headers: { "stripe-signature": "t=1,v1=bad" } });
  check(r4.status === 400, "stripe-webhook with a forged signature -> 400", r4.status);
}

console.log("\nParent flows (REST + booking-actions)");
const tokenA = await login("parent.a@example.com");
const tokenB = await login("parent.b@example.com");
const tokenCoach = await login("coach@example.com");
let bookedId;
{
  const players = await call("/rest/v1/players?select=first_name&order=first_name", { token: tokenA });
  check(JSON.stringify(players.json) === JSON.stringify([{ first_name: "Leo" }, { first_name: "Mia" }]), "parent A sees only Leo and Mia via the API", players.json);
  const inq = await call("/rest/v1/inquiries?select=id", { token: tokenA });
  check(Array.isArray(inq.json) && inq.json.length === 0, "parent A sees no inquiries via the API", inq.json);
  const anonPlayers = await call("/rest/v1/players?select=first_name");
  check(anonPlayers.status >= 400, "anonymous API call to players is refused", anonPlayers.status);
  const sneaky = await call("/rest/v1/rpc/confirm_stripe_booking", { method: "POST", token: tokenA, body: { p_booking_id: ID.mia, p_checkout_session_id: "x", p_payment_intent_id: "x", p_amount_cents: 0 } });
  check(sneaky.status >= 400, "parent cannot call confirm_stripe_booking through the API", sneaky.status);

  const slots = await call("/rest/v1/rpc/get_available_slots", { method: "POST", token: tokenA, body: { p_session_type_id: ID.oneOnOne, p_from: isoDate(20), p_to: isoDate(34) } });
  check(slots.json?.length > 3, "parent can list 1-on-1 slots", slots.json?.length);

  const book = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "book_with_package", session_type_id: ID.oneOnOne, player_id: ID.mia, start_time: slots.json[0].slot_start, parent_note: "Smoke test" } });
  check(book.status === 200 && book.json?.booking?.status === "booked", "parent A books with a package credit", book.json);
  bookedId = book.json?.booking?.id;

  const again = await fn("booking-actions", { method: "POST", token: tokenB, body: { action: "book_with_package", session_type_id: ID.oneOnOne, player_id: ID.sam, start_time: slots.json[0].slot_start } });
  check(again.status === 409, "parent B can't take the same slot (409)", again.json);

  const steal = await fn("booking-actions", { method: "POST", token: tokenB, body: { action: "cancel", booking_id: bookedId } });
  check(steal.status === 409 && steal.json?.error?.code === "booking_not_found", "parent B cannot cancel parent A's booking", steal.json);

  const resched = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "reschedule", booking_id: bookedId, new_start_time: slots.json[3].slot_start } });
  check(resched.status === 200, "parent A reschedules (outside the window)", resched.json);

  const cancel = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "cancel", booking_id: bookedId } });
  check(cancel.status === 200 && cancel.json?.result?.action === "credit_returned", "parent A cancels within policy and gets the credit back", cancel.json);

  const coachOnly = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "admin_create_booking", player_id: ID.mia, session_type_id: ID.oneOnOne, start_time: slots.json[5].slot_start } });
  check(coachOnly.status === 403, "parents cannot use coach-only booking actions", coachOnly.status);

  // Multi-hour: private sessions can be booked back to back (one credit per hour).
  const slots2 = await call("/rest/v1/rpc/get_available_slots", { method: "POST", token: tokenA, body: { p_session_type_id: ID.oneOnOne, p_from: isoDate(20), p_to: isoDate(34), p_hours: 2 } });
  const twoHour = slots2.json?.at(-1);
  check(twoHour && Date.parse(twoHour.slot_end) - Date.parse(twoHour.slot_start) === 2 * 3600e3, "2-hour slots are listed", slots2.json?.length);
  const book2 = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "book_with_package", session_type_id: ID.oneOnOne, player_id: ID.mia, start_time: twoHour?.slot_start, hours: 2 } });
  check(book2.status === 200 && book2.json?.booking?.hours === 2, "parent A books 2 hours with package credits", book2.json);
  const cancel2 = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "cancel", booking_id: book2.json?.booking?.id } });
  check(cancel2.status === 200 && cancel2.json?.result?.action === "credit_returned", "cancelling the 2-hour booking returns the credits", cancel2.json);
  const groupLong = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "book_with_package", session_type_id: ID.smallGroup, player_id: ID.mia, start_time: twoHour?.slot_start, hours: 2 } });
  check(groupLong.status >= 400 && groupLong.json?.error?.code === "bad_hours", "group sessions can't be booked longer than 1 hour", groupLong.json);
  const tooLong = await fn("booking-actions", { method: "POST", token: tokenA, body: { action: "book_with_package", session_type_id: ID.oneOnOne, player_id: ID.mia, start_time: twoHour?.slot_start, hours: 9 } });
  check(tooLong.status === 400, "hours outside 1-8 are rejected", tooLong.status);
}

console.log("\nStripe webhook (signed locally with STRIPE_WEBHOOK_SECRET)");
{
  const slots = await call("/rest/v1/rpc/get_available_slots", { method: "POST", token: tokenB, body: { p_session_type_id: ID.oneOnOne, p_from: isoDate(36), p_to: isoDate(50) } });
  const hold = await rest("rpc/create_pending_booking", { method: "POST", body: { p_actor: ID.parentB, p_player_id: ID.sam, p_session_type_id: ID.oneOnOne, p_start: slots.json[0].slot_start } });
  check(hold.status === 200 && hold.json?.status === "pending_payment", "slot held while parent pays", hold.json);
  const bookingId = hold.json.id;
  const csId = `cs_test_smoke_${crypto.randomUUID().slice(0, 8)}`;
  await rest(`bookings?id=eq.${bookingId}`, { method: "PATCH", body: { stripe_checkout_session_id: csId } });

  const event = {
    id: `evt_smoke_${crypto.randomUUID().slice(0, 12)}`,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: csId, object: "checkout.session", payment_status: "paid", payment_intent: `pi_${csId}`, amount_total: 9000, currency: "usd", metadata: { kind: "booking", booking_id: bookingId, parent_id: ID.parentB } } },
  };
  const w = await sendWebhook(event);
  check(w.status === 200, "signed webhook accepted", w.json);
  const after = await rest(`bookings?id=eq.${bookingId}&select=status,payment_status`);
  check(after.json?.[0]?.status === "booked" && after.json?.[0]?.payment_status === "paid", "booking marked booked + paid only after the webhook", after.json);
  const replay = await sendWebhook(event);
  check(replay.json?.duplicate === true, "replayed event is ignored (idempotent)", replay.json);

  const pkgCs = `cs_test_pkg_${crypto.randomUUID().slice(0, 8)}`;
  const pkgEvent = {
    id: `evt_smoke_${crypto.randomUUID().slice(0, 12)}`,
    object: "event",
    type: "checkout.session.completed",
    created: Math.floor(Date.now() / 1000),
    data: { object: { id: pkgCs, object: "checkout.session", payment_status: "paid", payment_intent: `pi_${pkgCs}`, amount_total: 20000, currency: "usd", metadata: { kind: "package", package_id: ID.pkgGroup5, parent_id: ID.parentB } } },
  };
  const pw = await sendWebhook(pkgEvent);
  check(pw.status === 200, "package webhook accepted", pw.json);
  const credits = await call(`/rest/v1/package_purchases?stripe_checkout_session_id=eq.${pkgCs}&select=sessions_remaining`, { token: tokenB });
  check(credits.json?.[0]?.sessions_remaining === 5, "parent B sees 5 new credits after paying", credits.json);
  const othersCredits = await call(`/rest/v1/package_purchases?stripe_checkout_session_id=eq.${pkgCs}&select=id`, { token: tokenA });
  check(othersCredits.json?.length === 0, "parent A cannot see parent B's purchase");
}

console.log("\nCoach functions");
{
  const parentTry = await fn("send-announcement", { method: "POST", token: tokenA, body: { subject: "x", message: "x" } });
  check(parentTry.status === 403, "parents cannot send announcements", parentTry.status);
  const dry = await fn("send-announcement", { method: "POST", token: tokenCoach, body: { subject: "Field closed today", message: "Sorry!", audience: "all", dry_run: true } });
  check(dry.status === 200 && dry.json?.recipient_count === 3, "coach dry-run announcement counts 3 clients (2 parents + 1 adult)", dry.json);
  const tokenAdult = await login("adult@example.com");
  const adultTry = await fn("send-announcement", { method: "POST", token: tokenAdult, body: { subject: "x", message: "x" } });
  check(adultTry.status === 403, "adult clients cannot send announcements", adultTry.status);
  const stats = await call("/rest/v1/rpc/admin_stats", { method: "POST", token: tokenCoach, body: {} });
  check(stats.status === 200 && typeof stats.json?.revenue_this_month_cents === "number", "coach stats via RPC", stats.json);
  const parentStats = await call("/rest/v1/rpc/admin_stats", { method: "POST", token: tokenA, body: {} });
  check(parentStats.status >= 400, "parents cannot read coach stats", parentStats.status);
  const rem = await fn("send-reminders", { method: "POST", headers: { "x-cron-secret": CRON } });
  check(rem.status === 200 && rem.json?.ok, "send-reminders runs with the cron secret", rem.json);
}

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
