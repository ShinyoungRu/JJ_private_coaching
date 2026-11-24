// Loads everything an email about a booking needs, and sends the standard
// parent + coach notifications.
import type { Admin, AppSettings } from "./clients.ts";
import { loadSettings } from "./clients.ts";
import { coachEmail, sendSafely } from "./email.ts";
import { appUrl } from "./env.ts";
import {
  type BookingEmailData,
  bookingCancelledEmail,
  bookingConfirmedEmail,
  bookingRescheduledEmail,
  type CancelOutcome,
  coachNotice,
  formatWhen,
  paymentLabel,
} from "./templates.ts";

export async function loadBookingEmailData(
  admin: Admin,
  bookingId: string,
  settings?: AppSettings,
): Promise<BookingEmailData | null> {
  const cfg = settings ?? (await loadSettings(admin));
  const { data, error } = await admin
    .from("bookings")
    .select(
      "id, start_time, end_time, paid_with, price_cents, parent_note, " +
        "player:players(first_name), session_type:session_types(name), " +
        "parent:profiles!bookings_parent_id_fkey(email, full_name)",
    )
    .eq("id", bookingId)
    .single();
  if (error || !data) {
    console.error("loadBookingEmailData failed:", error);
    return null;
  }
  // deno-lint-ignore no-explicit-any
  const row = data as any;
  return {
    bookingId: row.id,
    parentEmail: row.parent?.email ?? "",
    parentName: row.parent?.full_name ?? null,
    playerFirstName: row.player?.first_name ?? "your player",
    sessionTypeName: row.session_type?.name ?? "Training session",
    startTime: row.start_time,
    endTime: row.end_time,
    paidWith: row.paid_with,
    priceCents: row.price_cents,
    parentNote: row.parent_note,
    timezone: cfg.timezone,
    currency: cfg.currency,
    cancellationWindowHours: cfg.cancellation_window_hours,
    locationName: cfg.training_location_name,
    locationAddress: cfg.training_location_address,
  };
}

function coachLines(d: BookingEmailData): string[] {
  return [
    `Player: ${d.playerFirstName}`,
    `Session: ${d.sessionTypeName}`,
    `When: ${formatWhen(d.startTime, d.timezone)}`,
    `Parent: ${d.parentName || "-"} (${d.parentEmail})`,
    ...(d.parentNote ? [`Note from parent: ${d.parentNote}`] : []),
  ];
}

export async function notifyBookingConfirmed(admin: Admin, bookingId: string): Promise<void> {
  const d = await loadBookingEmailData(admin, bookingId);
  if (!d) return;
  await sendSafely(bookingConfirmedEmail(d), `booking-confirmed-${bookingId}`);
  const coach = coachEmail();
  if (coach) {
    await sendSafely(
      coachNotice(coach, `New booking: ${d.playerFirstName} - ${formatWhen(d.startTime, d.timezone)}`, [
        ...coachLines(d),
        `Payment: ${paymentLabel(d)}${d.paidWith === "manual" ? " - collect at the session, then mark paid" : ""}`,
      ], { label: "Open schedule", url: `${appUrl()}/admin` }),
    );
  }
}

export async function notifyBookingCancelled(
  admin: Admin,
  bookingId: string,
  outcome: CancelOutcome,
  byCoach: boolean,
  reason?: string | null,
): Promise<void> {
  const d = await loadBookingEmailData(admin, bookingId);
  if (!d) return;
  await sendSafely(bookingCancelledEmail(d, outcome, byCoach, reason), `booking-cancelled-${bookingId}`);
  const coach = coachEmail();
  if (coach && !byCoach) {
    await sendSafely(
      coachNotice(coach, `Cancelled: ${d.playerFirstName} - ${formatWhen(d.startTime, d.timezone)}`, [
        ...coachLines(d),
        `Outcome: ${outcome.replace(/_/g, " ")}`,
      ], { label: "Open schedule", url: `${appUrl()}/admin` }),
    );
  }
}

export async function notifyBookingRescheduled(
  admin: Admin,
  bookingId: string,
  oldStart: string,
  byCoach: boolean,
): Promise<void> {
  const d = await loadBookingEmailData(admin, bookingId);
  if (!d) return;
  await sendSafely(bookingRescheduledEmail(d, oldStart), `booking-rescheduled-${bookingId}-${d.startTime}`);
  const coach = coachEmail();
  if (coach && !byCoach) {
    await sendSafely(
      coachNotice(coach, `Rescheduled: ${d.playerFirstName}`, [
        ...coachLines(d),
        `Previous time: ${formatWhen(oldStart, d.timezone)}`,
      ], { label: "Open schedule", url: `${appUrl()}/admin` }),
    );
  }
}
