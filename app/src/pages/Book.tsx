import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { PlayerFormModal } from "../components/PlayerForm";
import { PageHero } from "../components/Layout";
import { PublicBook } from "../components/PublicBook";
import { HoursPicker, maxHoursFor, SlotPicker } from "../components/SlotPicker";
import { Alert, Button, buttonClasses, Card, cx, Loading, PageHeader, SectionTitle, SuccessMark, Textarea, useToast } from "../components/ui";
import { ApiError, errorMessage, invoke, listMyPlayers, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtLongDateTime, fmtMoney, fmtTime, hoursUntil, plural } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Booking, PackagePurchase, Player, SessionType, Slot } from "../lib/types";
import { useLoad } from "../lib/useLoad";

export default function Book() {
  const { session, loading } = useAuth();
  const [params] = useSearchParams();
  if (loading) return <Loading />;
  if (!session) {
    return (
      <>
        <PageHero
          title="Book Your Next Session"
          subtitle="Private and small-group soccer training focused on unlocking your full potential on the field. Pick a session to see open times."
        />
        <PublicBook initialType={params.get("type")} />
      </>
    );
  }
  return <BookingFlow />;
}

/** Packages that can pay for this booking: one credit per hour, all from the same package. */
function matchingCredits(credits: PackagePurchase[], typeId: string, slotStart: string, hours: number): PackagePurchase[] {
  return credits.filter((c) =>
    c.sessions_remaining >= hours &&
    (c.session_type_id === null || c.session_type_id === typeId) &&
    (c.expires_at === null || new Date(c.expires_at) > new Date(slotStart))
  );
}

function BookingFlow() {
  const { tz, settings, isCoach } = useAuth();
  const toast = useToast();
  const [params, setParams] = useSearchParams();

  const types = useLoad(async () => unwrap(await supabase.from("session_types").select("*").eq("active", true).order("sort_order")), []);
  const players = useLoad(listMyPlayers, []);
  const credits = useLoad(async () => unwrap(await supabase.from("package_purchases").select("*").gt("sessions_remaining", 0)), []);

  const [typeId, setTypeId] = useState<string | null>(params.get("type"));
  const [playerId, setPlayerId] = useState<string | null>(null);
  const [slot, setSlot] = useState<Slot | null>(null);
  const [hours, setHours] = useState(1);
  const [payWith, setPayWith] = useState<"package" | "card">("card");
  const [note, setNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [booked, setBooked] = useState<Booking | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [addingPlayer, setAddingPlayer] = useState(false);
  const confirmRef = useRef<HTMLDivElement>(null);

  // Parent backed out of Stripe Checkout: release the held slot right away.
  useEffect(() => {
    const bookingId = params.get("booking_id");
    if (params.get("checkout") !== "cancelled" || !bookingId) return;
    invoke("booking-actions", { action: "cancel", booking_id: bookingId, reason: "Checkout cancelled" })
      .catch(() => { /* already released or expired */ })
      .finally(() => {
        toast("Checkout cancelled. That time has been released.", "info");
        setRefreshKey((k) => k + 1);
      });
    const p = new URLSearchParams(params);
    p.delete("checkout");
    p.delete("booking_id");
    setParams(p, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Defaults once data loads.
  useEffect(() => {
    if (types.data && !types.data.find((t) => t.id === typeId)) setTypeId(types.data.length === 1 ? types.data[0].id : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [types.data]);
  useEffect(() => {
    if (players.data?.length === 1 && !playerId) setPlayerId(players.data[0].id);
  }, [players.data, playerId]);

  const type: SessionType | undefined = types.data?.find((t) => t.id === typeId);
  const player: Player | undefined = players.data?.find((p) => p.id === playerId);
  const maxHours = maxHoursFor(type, settings);
  const usable = useMemo(
    () => (type && slot ? matchingCredits(credits.data ?? [], type.id, slot.slot_start, hours) : []),
    [credits.data, type, slot, hours],
  );
  const usableCount = usable.reduce((n, c) => n + c.sessions_remaining, 0);

  useEffect(() => setPayWith(usableCount > 0 ? "package" : "card"), [usableCount]);
  useEffect(() => {
    if (slot) setTimeout(() => confirmRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" }), 50);
  }, [slot]);

  function chooseType(id: string) {
    setTypeId(id);
    setSlot(null);
    setHours(1);
    const p = new URLSearchParams(params);
    p.set("type", id);
    setParams(p, { replace: true });
  }

  async function confirm() {
    if (!type || !player || !slot) return;
    setSubmitting(true);
    setError(null);
    try {
      if (payWith === "package") {
        const res = await invoke<{ booking: Booking }>("booking-actions", {
          action: "book_with_package", session_type_id: type.id, player_id: player.id, start_time: slot.slot_start, hours, parent_note: note,
        });
        setBooked(res.booking);
        credits.reload();
      } else {
        const res = await invoke<{ url: string }>("stripe-checkout", {
          kind: "session", session_type_id: type.id, player_id: player.id, start_time: slot.slot_start, hours, parent_note: note,
        });
        // Stripe Checkout can't run inside an iframe: always use the top window.
        (window.top ?? window).location.href = res.url;
        return;
      }
    } catch (e) {
      const code = e instanceof ApiError ? e.code : "";
      if (code === "slot_unavailable" || code === "slot_full") {
        setSlot(null);
        setRefreshKey((k) => k + 1);
      }
      setError(errorMessage(e));
    } finally {
      setSubmitting(false);
    }
  }

  if (types.loading || players.loading) return <Loading />;
  if (types.error) return <Alert tone="error">{types.error}</Alert>;

  if (booked && type && player) {
    return (
      <div className="mx-auto max-w-xl">
        <Card className="p-6 text-center sm:p-8">
          <SuccessMark />
          <h1 className="mt-4 text-2xl font-bold text-fg">You're booked!</h1>
          <p className="mt-2 text-fg-2">{player.first_name} · {type.name}</p>
          <p className="mt-1 font-semibold text-fg">{fmtLongDateTime(booked.start_time, tz)}</p>
          <p className="mt-3 text-sm text-muted">A confirmation email is on its way. Paid with a package credit.</p>
          <div className="mt-6 flex flex-wrap justify-center gap-2">
            <Link to="/bookings" className={buttonClasses()}>View my bookings</Link>
            <Button variant="secondary" onClick={() => { setBooked(null); setSlot(null); setNote(""); setRefreshKey((k) => k + 1); }}>Book another</Button>
          </div>
        </Card>
      </div>
    );
  }

  const windowHours = settings?.cancellation_window_hours ?? 24;

  return (
    <>
      <PageHeader title="Book a session" subtitle="Pick a session type, the player, and a time that works." />

      {isCoach && (
        <Alert className="mb-6">
          You're viewing the calendar as the coach. To book for a client, use <Link to="/admin" className="font-semibold underline">Dashboard → New booking</Link>.
        </Alert>
      )}

      <div className="space-y-8">
        <section>
          <SectionTitle>1. Session type</SectionTitle>
          {types.data!.length === 0 ? (
            <Alert tone="warning">No sessions are open for booking yet.</Alert>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {types.data!.map((t) => (
                <button
                  key={t.id}
                  onClick={() => chooseType(t.id)}
                  aria-pressed={typeId === t.id}
                  className={cx("rounded-2xl border p-5 text-left transition-colors",
                    typeId === t.id ? "border-brand bg-brand/10" : "border-line bg-panel hover:border-faint")}
                >
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-lg font-bold text-fg">{t.name}</span>
                    <span className="font-bold text-fg">{fmtMoney(t.price_cents, settings?.currency)}</span>
                  </div>
                  <div className="mt-1 text-sm text-muted">{t.duration_minutes} min{t.max_players > 1 ? ` · up to ${t.max_players} players` : " · private"}</div>
                  {t.description && <p className="mt-2 text-sm text-fg-2">{t.description}</p>}
                </button>
              ))}
            </div>
          )}
        </section>

        {!isCoach && (
          <section>
            <SectionTitle>2. Who's training?</SectionTitle>
            {players.data!.length === 0 ? (
              <Card>
                <p className="text-fg-2">Add who's training first: yourself, or a child. Just a first name, age group and level.</p>
                <Button className="mt-4" onClick={() => setAddingPlayer(true)}>+ Add a player</Button>
              </Card>
            ) : (
              <div className="flex flex-wrap gap-2">
                {players.data!.map((p) => (
                  <button
                    key={p.id}
                    onClick={() => setPlayerId(p.id)}
                    aria-pressed={playerId === p.id}
                    className={cx("rounded-xl border px-4 py-2.5 text-sm font-semibold transition-colors",
                      playerId === p.id ? "border-brand bg-brand text-white" : "border-line bg-panel text-fg-2 hover:border-faint")}
                  >
                    {p.is_self ? `${p.first_name} (you)` : p.first_name}
                    {p.age_group && !p.is_self && <span className="ml-1.5 font-normal opacity-75">{p.age_group}</span>}
                  </button>
                ))}
                <button onClick={() => setAddingPlayer(true)} className="rounded-xl border border-dashed border-line px-4 py-2.5 text-sm font-semibold text-muted hover:border-faint hover:text-fg">
                  + Add player
                </button>
              </div>
            )}
          </section>
        )}

        {type && (
          <section>
            <SectionTitle hint={maxHours > 1 ? "1-hour sessions, back to back" : `${type.duration_minutes} min`}>{isCoach ? "2" : "3"}. Pick a time</SectionTitle>
            <Card className="p-3 sm:p-5">
              <HoursPicker value={hours} max={maxHours} onChange={(h) => { setHours(h); setSlot(null); }} />
              <SlotPicker
                sessionTypeId={type.id}
                hours={hours}
                tz={tz}
                maxDaysAhead={settings?.max_booking_days_ahead ?? 60}
                selected={slot?.slot_start}
                onSelect={(s) => { setSlot(s); setError(null); }}
                refreshKey={refreshKey}
              />
            </Card>
          </section>
        )}

        {type && slot && player && !isCoach && (
          <section ref={confirmRef}>
            <SectionTitle>4. Confirm</SectionTitle>
            <Card className="space-y-5">
              <div>
                <div className="text-sm text-muted">{player.first_name} · {type.name} · {plural(hours, "hour")}</div>
                <div className="text-xl font-bold text-fg">{fmtLongDateTime(slot.slot_start, tz)}</div>
                <div className="text-sm text-muted">until {fmtTime(slot.slot_end, tz)}</div>
              </div>

              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium text-fg-2">Payment</legend>
                {usableCount > 0 && (
                  <PayOption checked={payWith === "package"} onChange={() => setPayWith("package")}
                    title={hours > 1 ? `Use ${hours} package credits` : "Use a package credit"}
                    detail={`${plural(usableCount, "credit")} available`} />
                )}
                <PayOption checked={payWith === "card"} onChange={() => setPayWith("card")}
                  title={`Pay ${fmtMoney(type.price_cents * hours, settings?.currency)} by card`}
                  detail={hours > 1 ? `${fmtMoney(type.price_cents, settings?.currency)} x ${hours} hours · secure checkout with Stripe` : "Secure checkout with Stripe"} />
                {usableCount === 0 && (
                  <p className="text-xs text-subtle">Training often? <Link to="/packages" className="text-brand hover:underline">Packages</Link> save money per session.</p>
                )}
              </fieldset>

              <div>
                <label htmlFor="note" className="mb-1.5 block text-sm font-medium text-fg-2">Anything the coach should know? (optional)</label>
                <Textarea id="note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} rows={2} placeholder="e.g. wants to work on shooting with the left foot" />
              </div>

              <p className="text-xs text-subtle">
                You can cancel or reschedule up to {windowHours} hours before the session.
                {hoursUntil(slot.slot_start) < windowHours && <strong className="text-warn"> This session is less than {windowHours} hours away, so it can't be cancelled for a refund.</strong>}
              </p>

              {error && <Alert tone="error">{error}</Alert>}
              <Button size="lg" className="w-full sm:w-auto" loading={submitting} onClick={confirm}>
                {payWith === "package" ? "Book with credit" : "Continue to payment"}
              </Button>
            </Card>
          </section>
        )}
      </div>

      <PlayerFormModal
        open={addingPlayer}
        onClose={() => setAddingPlayer(false)}
        onSaved={(p) => { players.reload(); setPlayerId(p.id); toast(`${p.first_name} added`); }}
      />
    </>
  );
}

function PayOption({ checked, onChange, title, detail }: { checked: boolean; onChange: () => void; title: string; detail: string }) {
  return (
    <label className={cx("flex cursor-pointer items-center gap-3 rounded-xl border p-4 transition-colors",
      checked ? "border-brand bg-brand/10" : "border-line hover:border-faint")}>
      <input type="radio" name="pay" checked={checked} onChange={onChange} className="h-4 w-4 accent-brand" />
      <span>
        <span className="block font-semibold text-fg">{title}</span>
        <span className="block text-sm text-muted">{detail}</span>
      </span>
    </label>
  );
}
