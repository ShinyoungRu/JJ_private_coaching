import { useState } from "react";
import { Link } from "react-router";
import { PaymentBadge, StatusBadge } from "../components/badges";
import { SlotPicker } from "../components/SlotPicker";
import { Alert, Badge, Button, buttonClasses, Card, Empty, Loading, Modal, PageHeader, Segmented, Textarea, useToast } from "../components/ui";
import { errorMessage, invoke, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtLongDateTime, fmtTime, hoursUntil } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { BookingWithDetails, SessionNote, Slot } from "../lib/types";
import { useLoad } from "../lib/useLoad";

export function noteOf(b: BookingWithDetails): SessionNote | null {
  return Array.isArray(b.note) ? b.note[0] ?? null : b.note;
}

export default function MyBookings() {
  const { tz, settings } = useAuth();
  const toast = useToast();
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [cancelling, setCancelling] = useState<BookingWithDetails | null>(null);
  const [moving, setMoving] = useState<BookingWithDetails | null>(null);

  const bookings = useLoad(async () => {
    const rows = unwrap(await supabase
      .from("bookings")
      .select("*, player:players(first_name), session_type:session_types(name, duration_minutes), note:session_notes(*)")
      .order("start_time", { ascending: true }));
    return rows as unknown as BookingWithDetails[];
  }, []);

  const now = Date.now();
  const all = bookings.data ?? [];
  const upcoming = all.filter((b) => ["booked", "pending_payment"].includes(b.status) && new Date(b.end_time).getTime() >= now);
  const past = all.filter((b) => !upcoming.includes(b) && !(b.status === "cancelled" && b.cancel_reason === "hold_expired")).reverse();
  const list = tab === "upcoming" ? upcoming : past;
  const windowHours = settings?.cancellation_window_hours ?? 24;

  return (
    <>
      <PageHeader
        title="My bookings"
        actions={<Link to="/book" className={buttonClasses()}>+ Book a session</Link>}
      />
      <Segmented
        className="mb-5"
        value={tab}
        onChange={setTab}
        options={[{ value: "upcoming", label: `Upcoming${upcoming.length ? ` (${upcoming.length})` : ""}` }, { value: "past", label: "Past & cancelled" }]}
      />

      {bookings.loading ? <Loading /> : bookings.error ? <Alert tone="error">{bookings.error}</Alert> : list.length === 0 ? (
        tab === "upcoming"
          ? <Empty title="No upcoming sessions" action={<Link to="/book" className={buttonClasses()}>Book a session</Link>}>Pick a time that works for your player.</Empty>
          : <Empty title="No past sessions yet" />
      ) : (
        <div className="space-y-3">
          {list.map((b) => {
            const note = noteOf(b);
            const inside = hoursUntil(b.start_time) < windowHours;
            return (
              <Card key={b.id} className="p-4 sm:p-5">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <div className="text-lg font-semibold text-fg">{fmtLongDateTime(b.start_time, tz)}</div>
                    <div className="mt-0.5 text-sm text-muted">
                      {b.player?.first_name} · {b.session_type?.name}{b.hours > 1 && ` · ${b.hours} hours`} · until {fmtTime(b.end_time, tz)}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <StatusBadge status={b.status} late={b.late_cancellation} />
                      {b.status !== "pending_payment" && <PaymentBadge method={b.paid_with} status={b.payment_status} />}
                    </div>
                    {b.parent_note && <p className="mt-2 text-sm text-muted">Your note: {b.parent_note}</p>}
                  </div>
                  {tab === "upcoming" && (
                    <div className="flex shrink-0 gap-2">
                      {b.status === "booked" && (
                        <Button variant="secondary" size="sm" disabled={inside} title={inside ? `Can't reschedule within ${windowHours} hours` : undefined} onClick={() => setMoving(b)}>
                          Reschedule
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setCancelling(b)}>
                        {b.status === "pending_payment" ? "Release" : "Cancel"}
                      </Button>
                    </div>
                  )}
                </div>
                {note && <NoteView note={note} />}
              </Card>
            );
          })}
        </div>
      )}

      <CancelModal
        booking={cancelling}
        windowHours={windowHours}
        refundMode={settings?.stripe_cancellation_refund ?? "stripe_refund"}
        onClose={() => setCancelling(null)}
        onDone={(msg) => { toast(msg); bookings.reload(); }}
      />
      <RescheduleModal
        booking={moving}
        tz={tz}
        onClose={() => setMoving(null)}
        onDone={() => { toast("Rescheduled. Check your email for the new time."); bookings.reload(); }}
      />
    </>
  );
}

export function NoteView({ note }: { note: SessionNote }) {
  return (
    <div className="mt-4 space-y-2 rounded-xl border border-line bg-ink-deep/60 p-4 text-sm">
      <div className="text-xs font-semibold uppercase tracking-wide text-brand">Coach's notes</div>
      {note.skills_worked_on.length > 0 && (
        <div className="flex flex-wrap gap-1.5">{note.skills_worked_on.map((s) => <Badge key={s} tone="blue">{s}</Badge>)}</div>
      )}
      {note.coach_notes && <p className="whitespace-pre-line text-fg-2">{note.coach_notes}</p>}
      {note.homework && <p className="text-fg-2"><span className="font-semibold text-fg">Homework:</span> {note.homework}</p>}
    </div>
  );
}

function CancelModal({ booking, windowHours, refundMode, onClose, onDone }: {
  booking: BookingWithDetails | null; windowHours: number; refundMode: string; onClose: () => void; onDone: (msg: string) => void;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!booking) return null;

  const pending = booking.status === "pending_payment";
  const inside = hoursUntil(booking.start_time) < windowHours;
  const outcome = pending
    ? "This releases the time you were holding. You haven't been charged."
    : inside
    ? `This is within ${windowHours} hours of the session, so it will be forfeited and ${booking.paid_with === "package" ? "the package credit won't be returned" : "the payment won't be refunded"}.`
    : booking.paid_with === "package"
    ? "Your package credit will be returned to your account."
    : booking.paid_with === "stripe"
    ? refundMode === "session_credit"
      ? "You'll get a 1-session credit to use for another booking."
      : "Your card will be refunded in full (usually 5-10 business days)."
    : "The coach will be notified.";

  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await invoke<{ result: { action: string }; refund_status: string }>("booking-actions", {
        action: "cancel", booking_id: booking!.id, reason,
      });
      const msg: Record<string, string> = {
        credit_returned: "Cancelled. Your credit is back.",
        stripe_refund: res.refund_status === "failed" ? "Cancelled. The coach will process your refund." : "Cancelled. Refund issued.",
        session_credit: "Cancelled. A session credit was added.",
        forfeited: "Cancelled (forfeited).",
        released_hold: "Released.",
        none: "Cancelled.",
      };
      onDone(msg[res.result.action] ?? "Cancelled.");
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={pending ? "Release this time?" : "Cancel this session?"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Keep it</Button>
          <Button variant="danger" loading={busy} onClick={go}>{pending ? "Release" : "Cancel session"}</Button>
        </>
      }
    >
      <div className="space-y-4">
        <p className="font-semibold text-fg">{booking.player?.first_name} · {booking.session_type?.name}</p>
        <Alert tone={inside && !pending ? "warning" : "info"}>{outcome}</Alert>
        {!pending && (
          <div>
            <label htmlFor="reason" className="mb-1.5 block text-sm font-medium text-fg-2">Reason (optional)</label>
            <Textarea id="reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} maxLength={300} />
          </div>
        )}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function RescheduleModal({ booking, tz, onClose, onDone }: {
  booking: BookingWithDetails | null; tz: string; onClose: () => void; onDone: () => void;
}) {
  const [slot, setSlot] = useState<Slot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!booking) return null;

  async function go() {
    if (!slot) return;
    setBusy(true);
    setError(null);
    try {
      await invoke("booking-actions", { action: "reschedule", booking_id: booking!.id, new_start_time: slot.slot_start });
      onDone();
      setSlot(null);
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal
      open
      wide
      onClose={() => { setSlot(null); onClose(); }}
      title={`Reschedule ${booking.player?.first_name}'s session`}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button disabled={!slot} loading={busy} onClick={go}>
            {slot ? `Move to ${fmtLongDateTime(slot.slot_start, tz).replace(/ [A-Z]{2,4}$/, "")}` : "Pick a new time"}
          </Button>
        </>
      }
    >
      <p className="mb-4 text-sm text-muted">Currently {fmtLongDateTime(booking.start_time, tz)}. Your payment carries over.</p>
      {error && <Alert tone="error" className="mb-4">{error}</Alert>}
      <SlotPicker sessionTypeId={booking.session_type_id} hours={booking.hours} tz={tz} selected={slot?.slot_start} onSelect={setSlot} />
    </Modal>
  );
}
