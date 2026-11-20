// POST /functions/v1/stripe-checkout   (logged-in parent)
//
// Single session:
//   { "kind": "session", "session_type_id": "...", "player_id": "...",
//     "start_time": "2026-12-01T22:00:00Z", "hours": 1, "parent_note": "optional" }
//   hours (default 1): back-to-back private sessions; price = hourly price x hours.
//   -> holds the slot (status pending_payment) and returns { url } for Stripe Checkout.
//
// Package:
//   { "kind": "package", "package_id": "..." }
//   -> returns { url } for Stripe Checkout.
//
// Nothing is marked paid here. Only stripe-webhook does that, after Stripe
// confirms the payment.
//
// Frontend: Stripe Checkout cannot run inside an iframe, so redirect the TOP
// window: window.top.location.href = url
import { adminClient, loadSettings, requireUser, stripeClient } from "../_shared/clients.ts";
import { appOrigins, appUrl } from "../_shared/env.ts";
import {
  cleanText,
  corsHeaders,
  dbError,
  errorResponse,
  HttpError,
  json,
  optionalHours,
  readJson,
  requireDate,
  requireUuid,
} from "../_shared/http.ts";
import { formatWhen } from "../_shared/templates.ts";

const STRIPE_MIN_CHARGE_CENTS = 50;

Deno.serve(async (req) => {
  const cors = corsHeaders(req, appOrigins());
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const admin = adminClient();
    const caller = await requireUser(req, admin);
    const body = await readJson(req);
    const settings = await loadSettings(admin);
    const stripe = stripeClient();
    const base = appUrl();

    // -----------------------------------------------------------------------
    if (body.kind === "session") {
      const sessionTypeId = requireUuid(body.session_type_id, "session_type_id");
      const playerId = requireUuid(body.player_id, "player_id");
      const start = requireDate(body.start_time, "start_time");
      const note = cleanText(body.parent_note, 500);
      const hours = optionalHours(body.hours);

      const { data: booking, error } = await admin.rpc("create_pending_booking", {
        p_actor: caller.user.id,
        p_player_id: playerId,
        p_session_type_id: sessionTypeId,
        p_start: start,
        p_parent_note: note,
        p_hours: hours,
      });
      if (error) throw dbError(error);

      const releaseHold = async (reason: string) => {
        await admin.rpc("cancel_booking", { p_actor: caller.user.id, p_booking_id: booking.id, p_reason: reason });
      };

      if ((booking.price_cents ?? 0) < STRIPE_MIN_CHARGE_CENTS) {
        await releaseHold("Session type has no online price");
        throw new HttpError(400, "not_payable_online", "This session type can't be paid online. Please contact the coach.");
      }

      const [{ data: st }, { data: player }] = await Promise.all([
        admin.from("session_types").select("name").eq("id", sessionTypeId).single(),
        admin.from("players").select("first_name").eq("id", playerId).single(),
      ]);

      // Checkout must expire before our hold does (Stripe minimum is 30 min).
      const holdMs = new Date(booking.hold_expires_at).getTime() - Date.now();
      const checkoutSeconds = Math.max(30 * 60 + 30, Math.floor(holdMs / 1000) - 120);
      const metadata = { kind: "booking", booking_id: booking.id, parent_id: caller.user.id };

      try {
        const session = await stripe.checkout.sessions.create({
          mode: "payment",
          customer_email: caller.email || undefined,
          client_reference_id: booking.id,
          line_items: [{
            quantity: 1,
            price_data: {
              currency: settings.currency,
              unit_amount: booking.price_cents,
              product_data: {
                name: `${st?.name ?? "Training session"}${hours > 1 ? ` (${hours} hours)` : ""} - ${player?.first_name ?? "Player"}`,
                description: formatWhen(booking.start_time, settings.timezone),
              },
            },
          }],
          metadata,
          payment_intent_data: { metadata },
          expires_at: Math.floor(Date.now() / 1000) + checkoutSeconds,
          success_url: `${base}/booking/success?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: `${base}/book?checkout=cancelled&booking_id=${booking.id}`,
        }, { idempotencyKey: `booking-checkout-${booking.id}` });

        const { error: upErr } = await admin
          .from("bookings")
          .update({ stripe_checkout_session_id: session.id })
          .eq("id", booking.id);
        if (upErr) console.error("Could not store checkout session id:", upErr);

        return json({ url: session.url, booking_id: booking.id, hold_expires_at: booking.hold_expires_at }, 200, cors);
      } catch (e) {
        await releaseHold("Checkout could not be started");
        throw e;
      }
    }

    // -----------------------------------------------------------------------
    if (body.kind === "package") {
      const packageId = requireUuid(body.package_id, "package_id");
      const { data: pkg, error } = await admin
        .from("packages")
        .select("id, name, description, session_count, price_cents, active")
        .eq("id", packageId)
        .maybeSingle();
      if (error) throw dbError(error);
      if (!pkg || !pkg.active) throw new HttpError(404, "package_not_found", "That package is not available.");
      if (pkg.price_cents < STRIPE_MIN_CHARGE_CENTS) {
        throw new HttpError(400, "not_payable_online", "This package can't be paid online. Please contact the coach.");
      }

      const metadata = { kind: "package", package_id: pkg.id, parent_id: caller.user.id };
      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        customer_email: caller.email || undefined,
        client_reference_id: caller.user.id,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: settings.currency,
            unit_amount: pkg.price_cents,
            product_data: {
              name: pkg.name,
              description: pkg.description || `${pkg.session_count} training sessions`,
            },
          },
        }],
        metadata,
        payment_intent_data: { metadata },
        success_url: `${base}/packages?purchase=success&session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${base}/packages?purchase=cancelled`,
      });

      return json({ url: session.url }, 200, cors);
    }

    throw new HttpError(400, "invalid_input", 'kind must be "session" or "package".');
  } catch (err) {
    return errorResponse(err, cors);
  }
});
