// POST /functions/v1/stripe-webhook   (called by Stripe only)
//
// The ONLY place that marks bookings paid or adds package credits.
// Every request is verified with the Stripe signature (STRIPE_WEBHOOK_SECRET),
// and each event id is processed at most once.
//
// Subscribe the endpoint to:
//   checkout.session.completed
//   checkout.session.async_payment_succeeded
//   checkout.session.async_payment_failed
//   checkout.session.expired
//   charge.refunded
import type { Stripe } from "../_shared/deps.ts";
import { type Admin, adminClient, loadSettings, stripeClient, stripeCrypto } from "../_shared/clients.ts";
import { loadBookingEmailData, notifyBookingConfirmed } from "../_shared/bookings.ts";
import { coachEmail, sendSafely } from "../_shared/email.ts";
import { appUrl, env } from "../_shared/env.ts";
import { json } from "../_shared/http.ts";
import { coachNotice, formatMoney, packagePurchasedEmail, paidButSlotTakenEmail } from "../_shared/templates.ts";

type CheckoutSession = Stripe.Checkout.Session;

function paymentIntentId(session: CheckoutSession): string | null {
  const pi = session.payment_intent;
  if (!pi) return null;
  return typeof pi === "string" ? pi : pi.id;
}

async function handleBookingPaid(admin: Admin, stripe: Stripe, session: CheckoutSession) {
  const bookingId = session.metadata?.booking_id;
  if (!bookingId) throw new Error(`Checkout ${session.id} has no booking_id metadata`);
  const pi = paymentIntentId(session);

  const { data: result, error } = await admin.rpc("confirm_stripe_booking", {
    p_booking_id: bookingId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: pi,
    p_amount_cents: session.amount_total ?? 0,
    p_currency: session.currency ?? "usd",
  });
  if (error) throw new Error(`confirm_stripe_booking failed: ${error.message}`);

  if (result === "confirmed") {
    await notifyBookingConfirmed(admin, bookingId);
    return;
  }

  if (result === "conflict" && pi) {
    // Paid after the hold lapsed and someone else took the slot: refund in full.
    const refund = await stripe.refunds.create(
      { payment_intent: pi, reason: "requested_by_customer", metadata: { booking_id: bookingId, why: "slot_taken" } },
      { idempotencyKey: `slot-conflict-refund-${bookingId}` },
    );
    await admin.rpc("record_stripe_refund", {
      p_payment_intent_id: pi,
      p_total_refunded_cents: refund.amount,
    });
    const d = await loadBookingEmailData(admin, bookingId);
    if (d) await sendSafely(paidButSlotTakenEmail(d), `slot-conflict-${bookingId}`);
    const coach = coachEmail();
    if (coach) {
      await sendSafely(coachNotice(coach, "Auto-refund: slot was taken during checkout", [
        `Booking ${bookingId} was paid after its hold expired and the slot was no longer free.`,
        `Refunded ${formatMoney(refund.amount, session.currency ?? "usd")} automatically. No action needed.`,
      ]));
    }
    return;
  }

  if (result === "not_found" || result === "session_mismatch") {
    console.error(`Paid checkout ${session.id} could not be matched (${result}); booking ${bookingId}`);
    const coach = coachEmail();
    if (coach) {
      await sendSafely(coachNotice(coach, "Payment needs attention", [
        `Stripe checkout ${session.id} was paid but could not be matched to booking ${bookingId} (${result}).`,
        "Please check the Stripe dashboard and refund or book manually.",
      ]));
    }
  }
  // already_confirmed -> nothing to do (duplicate delivery)
}

async function handlePackagePaid(admin: Admin, session: CheckoutSession) {
  const parentId = session.metadata?.parent_id;
  const packageId = session.metadata?.package_id;
  if (!parentId || !packageId) throw new Error(`Checkout ${session.id} missing package metadata`);

  const { data: purchase, error } = await admin.rpc("grant_package_purchase", {
    p_parent_id: parentId,
    p_package_id: packageId,
    p_checkout_session_id: session.id,
    p_payment_intent_id: paymentIntentId(session),
    p_amount_cents: session.amount_total ?? 0,
    p_currency: session.currency ?? "usd",
  });
  if (error) throw new Error(`grant_package_purchase failed: ${error.message}`);
  if (!purchase?.id) return; // already granted (duplicate delivery)

  const settings = await loadSettings(admin);
  const { data: parent } = await admin.from("profiles").select("email, full_name").eq("id", parentId).single();
  if (parent?.email) {
    await sendSafely(packagePurchasedEmail({
      parentEmail: parent.email,
      parentName: parent.full_name,
      label: purchase.label,
      sessions: purchase.sessions_total,
      amountCents: purchase.amount_paid_cents,
      currency: settings.currency,
      expiresAt: purchase.expires_at,
      timezone: settings.timezone,
    }), `package-${purchase.id}`);
  }
  const coach = coachEmail();
  if (coach) {
    await sendSafely(coachNotice(coach, `Package sold: ${purchase.label}`, [
      `Parent: ${parent?.full_name || "-"} (${parent?.email || "-"})`,
      `Amount: ${formatMoney(purchase.amount_paid_cents, settings.currency)}`,
    ], { label: "Open dashboard", url: `${appUrl()}/admin` }));
  }
}

async function handleCheckoutPaid(admin: Admin, stripe: Stripe, session: CheckoutSession) {
  if (session.payment_status !== "paid") return; // async methods: wait for async_payment_succeeded
  const kind = session.metadata?.kind;
  if (kind === "booking") return await handleBookingPaid(admin, stripe, session);
  if (kind === "package") return await handlePackagePaid(admin, session);
  console.log(`Ignoring checkout ${session.id} with unknown kind "${kind}"`);
}

async function handleCheckoutNotPaid(admin: Admin, session: CheckoutSession) {
  if (session.metadata?.kind !== "booking" || !session.metadata.booking_id) return;
  const { error } = await admin
    .from("bookings")
    .update({ status: "cancelled", cancelled_at: new Date().toISOString(), cancel_reason: "hold_expired", hold_expires_at: null })
    .eq("id", session.metadata.booking_id)
    .eq("status", "pending_payment");
  if (error) throw new Error(`Releasing hold failed: ${error.message}`);
}

async function handleChargeRefunded(admin: Admin, charge: Stripe.Charge) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { error } = await admin.rpc("record_stripe_refund", {
    p_payment_intent_id: pi,
    p_total_refunded_cents: charge.amount_refunded,
  });
  if (error) throw new Error(`record_stripe_refund failed: ${error.message}`);
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const signature = req.headers.get("stripe-signature");
  if (!signature) return json({ error: "missing_signature" }, 400);

  const stripe = stripeClient();
  const rawBody = await req.text();
  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      rawBody,
      signature,
      env("STRIPE_WEBHOOK_SECRET"),
      undefined,
      stripeCrypto,
    );
  } catch (e) {
    console.warn("Stripe signature verification failed:", (e as Error).message);
    return json({ error: "invalid_signature" }, 400);
  }

  const admin = adminClient();
  const { data: seen } = await admin.from("stripe_events").select("id").eq("id", event.id).maybeSingle();
  if (seen) return json({ received: true, duplicate: true });

  try {
    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded":
        await handleCheckoutPaid(admin, stripe, event.data.object as CheckoutSession);
        break;
      case "checkout.session.expired":
      case "checkout.session.async_payment_failed":
        await handleCheckoutNotPaid(admin, event.data.object as CheckoutSession);
        break;
      case "charge.refunded":
        await handleChargeRefunded(admin, event.data.object as Stripe.Charge);
        break;
      default:
        // Not subscribed / not needed.
        break;
    }
  } catch (e) {
    // 500 -> Stripe retries with backoff for up to 3 days. Handlers are idempotent.
    console.error(`Processing ${event.type} ${event.id} failed:`, e);
    return json({ error: "processing_failed" }, 500);
  }

  const { error: logErr } = await admin.from("stripe_events").insert({ id: event.id, type: event.type });
  if (logErr && logErr.code !== "23505") console.error("Could not record stripe event:", logErr);
  return json({ received: true });
});
