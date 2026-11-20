// POST /functions/v1/booking-actions   (logged-in parent or coach)
//
// Booking changes that need server-side rules, refunds or emails.
// (This function is not in the original list of seven. Booking with a
// package credit, cancelling and rescheduling all need it.)
//
//   { "action": "book_with_package", "session_type_id", "player_id", "start_time", "parent_note"? }
//   { "action": "cancel",     "booking_id", "reason"? }
//   { "action": "reschedule", "booking_id", "new_start_time" }
//   coach only:
//   { "action": "admin_create_booking", "player_id", "session_type_id", "start_time",
//     "use_package"?: bool, "override_availability"?: bool, "note"?: str, "notify_parent"?: bool }
//
// Cancellation policy (enforced in the database, cancel_booking()):
//   parent cancels >= cancellation_window_hours before -> package credit back, or Stripe refund
//   (or a 1-session credit if app_settings.stripe_cancellation_refund = 'session_credit')
//   parent cancels inside the window -> forfeited
//   coach cancels -> always refunded / credit returned
import { adminClient, requireUser, stripeClient } from "../_shared/clients.ts";
import { notifyBookingCancelled, notifyBookingConfirmed, notifyBookingRescheduled } from "../_shared/bookings.ts";
import { coachEmail, sendSafely } from "../_shared/email.ts";
import { appOrigins } from "../_shared/env.ts";
import {
  cleanText,
  corsHeaders,
  dbError,
  errorResponse,
  HttpError,
  json,
  readJson,
  requireDate,
  requireUuid,
} from "../_shared/http.ts";
import { type CancelOutcome, coachNotice } from "../_shared/templates.ts";

interface CancelResult {
  booking_id: string;
  previous_status: string;
  action: "released_hold" | "credit_returned" | "session_credit" | "stripe_refund" | "forfeited" | "none";
  within_policy: boolean;
  cancelled_by_coach: boolean;
  paid_with: string;
  payment_intent_id: string | null;
  checkout_session_id: string | null;
  amount_cents: number | null;
  credit_id: string | null;
}

Deno.serve(async (req) => {
  const cors = corsHeaders(req, appOrigins());
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const admin = adminClient();
    const caller = await requireUser(req, admin);
    const isCoach = caller.role === "coach";
    const body = await readJson(req);

    switch (body.action) {
      // ---------------------------------------------------------------------
      case "book_with_package": {
        const { data: booking, error } = await admin.rpc("book_with_package", {
          p_actor: caller.user.id,
          p_player_id: requireUuid(body.player_id, "player_id"),
          p_session_type_id: requireUuid(body.session_type_id, "session_type_id"),
          p_start: requireDate(body.start_time, "start_time"),
          p_parent_note: cleanText(body.parent_note, 500),
        });
        if (error) throw dbError(error);
        await notifyBookingConfirmed(admin, booking.id);
        return json({ booking }, 200, cors);
      }

      // ---------------------------------------------------------------------
      case "cancel": {
        const bookingId = requireUuid(body.booking_id, "booking_id");
        const reason = cleanText(body.reason, 300);
        const { data, error } = await admin.rpc("cancel_booking", {
          p_actor: caller.user.id,
          p_booking_id: bookingId,
          p_reason: reason,
        });
        if (error) throw dbError(error);
        const result = data as CancelResult;

        let outcome: CancelOutcome = "none";
        let refundStatus: "not_applicable" | "refunded" | "failed" = "not_applicable";

        if (result.action === "released_hold") {
          // Parent backed out of checkout: make sure the Stripe page can't still be paid.
          if (result.checkout_session_id) {
            try {
              await stripeClient().checkout.sessions.expire(result.checkout_session_id);
            } catch (e) {
              console.warn("Could not expire checkout session (may already be closed):", (e as Error).message);
            }
          }
          return json({ result, refund_status: refundStatus }, 200, cors);
        }

        if (result.action === "stripe_refund" && result.payment_intent_id) {
          try {
            const refund = await stripeClient().refunds.create(
              { payment_intent: result.payment_intent_id, metadata: { booking_id: bookingId, why: "cancelled_within_policy" } },
              { idempotencyKey: `cancel-refund-${bookingId}` },
            );
            await admin.rpc("record_stripe_refund", {
              p_payment_intent_id: result.payment_intent_id,
              p_total_refunded_cents: refund.amount,
            });
            outcome = "stripe_refund";
            refundStatus = "refunded";
          } catch (e) {
            console.error(`Refund for booking ${bookingId} failed:`, e);
            outcome = "refund_pending";
            refundStatus = "failed";
            const coach = coachEmail();
            if (coach) {
              await sendSafely(coachNotice(coach, "Refund failed: please refund manually", [
                `Booking ${bookingId} was cancelled within policy but the automatic Stripe refund failed.`,
                `PaymentIntent: ${result.payment_intent_id}`,
                "Please refund it from the Stripe dashboard.",
              ]));
            }
          }
        } else if (result.action === "credit_returned" || result.action === "session_credit" || result.action === "forfeited") {
          outcome = result.action;
        }

        await notifyBookingCancelled(admin, bookingId, outcome, result.cancelled_by_coach, reason);
        return json({ result, refund_status: refundStatus }, 200, cors);
      }

      // ---------------------------------------------------------------------
      case "reschedule": {
        const bookingId = requireUuid(body.booking_id, "booking_id");
        const { data, error } = await admin.rpc("reschedule_booking", {
          p_actor: caller.user.id,
          p_booking_id: bookingId,
          p_new_start: requireDate(body.new_start_time, "new_start_time"),
        });
        if (error) throw dbError(error);
        await notifyBookingRescheduled(admin, bookingId, data.old_start, isCoach);
        return json({ result: data }, 200, cors);
      }

      // ---------------------------------------------------------------------
      case "admin_create_booking": {
        if (!isCoach) throw new HttpError(403, "forbidden", "Coach only.");
        const { data: booking, error } = await admin.rpc("admin_create_booking", {
          p_actor: caller.user.id,
          p_player_id: requireUuid(body.player_id, "player_id"),
          p_session_type_id: requireUuid(body.session_type_id, "session_type_id"),
          p_start: requireDate(body.start_time, "start_time"),
          p_use_package: body.use_package === true,
          p_override_availability: body.override_availability === true,
          p_note: cleanText(body.note, 500),
        });
        if (error) throw dbError(error);
        if (body.notify_parent !== false) await notifyBookingConfirmed(admin, booking.id);
        return json({ booking }, 200, cors);
      }

      default:
        throw new HttpError(400, "invalid_input", "Unknown action.");
    }
  } catch (err) {
    return errorResponse(err, cors);
  }
});
