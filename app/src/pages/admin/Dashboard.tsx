import { type FormEvent, useEffect, useMemo, useState } from "react";
import { Link } from "react-router";
import { PaymentBadge, StatusBadge } from "../../components/badges";
import { HoursPicker, maxHoursFor, SlotPicker } from "../../components/SlotPicker";
import {
  Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Segmented, Select, Stat, Textarea, useToast,
} from "../../components/ui";
import { errorMessage, invoke, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { addDays, firstName, fmtDay, fmtLongDateTime, fmtMoney, fmtTime, plural, todayKey, zonedToUtc } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { AdminStats, ScheduleRow, Slot } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

type Range = "past" | "today" | "week" | "month";

export default function Dashboard() {
  const { tz, profile } = useAuth();
  const toast = useToast();
  const [range, setRange] = useState<Range>("today");
  const [noteFor, setNoteFor] = useState<ScheduleRow | null>(null);
  const [cancelFor, setCancelFor] = useState<ScheduleRow | null>(null);
  const [newBooking, setNewBooking] = useState(false);
  const today = todayKey(tz);
  const from = range === "past" ? addDays(today, -7) : today;
  const to = range === "past" || range === "today" ? today : range === "week" ? addDays(today, 6) : addDays(today, 29);

  const stats = useLoad(async () => unwrap(await supabase.rpc("admin_stats")) as unknown as AdminStats, []);
  const schedule = useLoad(async () => unwrap(await supabase.rpc("admin_schedule", { p_from: from, p_to: to })), [from, to]);

  const reloadAll = () => { schedule.reload(); stats.reload(); };

  // date -> slot_key -> rows
  const grouped = useMemo(() => {
    const days = new Map<string, Map<string, ScheduleRow[]>>();
    (schedule.data ?? []).forEach((r) => {
      if (r.status === "pending_payment" && r.payment_status === "unpaid" && r.start_time < new Date().toISOString()) return;
      const d = days.get(r.local_date) ?? new Map<string, ScheduleRow[]>();
      d.set(r.slot_key, [...(d.get(r.slot_key) ?? []), r]);
      days.set(r.local_date, d);
    });
    const list = [...days.entries()];
    return range === "past" ? list.reverse() : list;
  }, [schedule.data, range]);

  async function quick(row: ScheduleRow, args: { p_status?: "no_show" | "booked"; p_payment_status?: "paid" }, msg: string) {
    try {
      unwrap(await supabase.rpc("admin_set_booking_status", { p_booking_id: row.booking_id, ...args }));
      toast(msg);
      reloadAll();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  const s = stats.data;
  return (
    <>
      <PageHeader
        title={`Hi${firstName(profile?.full_name) ? `, ${firstName(profile?.full_name)}` : ""}`}
        subtitle={fmtDay(today, { weekday: "long", month: "long", day: "numeric" })}
        actions={<Button onClick={() => setNewBooking(true)}>+ New booking</Button>}
      />

      <div className="mb-8 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Sessions this month" value={s?.sessions_this_month ?? "–"} hint={s ? `${s.completed_this_month} completed · ${s.no_shows_this_month} no-shows` : undefined} />
        <Stat label="Revenue this month" value={s ? fmtMoney(s.revenue_this_month_cents) : "–"} hint="Card + packages, after refunds" />
        <Stat label="Active players" value={s?.active_players ?? "–"} hint={s ? plural(s.total_families, "client") : undefined} />
        <Link to="/admin/inquiries" className="block transition-transform hover:-translate-y-0.5">
          <Stat label="New inquiries" value={s?.new_inquiries ?? "–"} hint={s?.unpaid_manual_bookings ? `${s.unpaid_manual_bookings} unpaid cash/Venmo` : "From the website"} />
        </Link>
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-fg">Schedule</h2>
        <Segmented value={range} onChange={setRange} options={[{ value: "past", label: "Last 7 days" }, { value: "today", label: "Today" }, { value: "week", label: "This week" }, { value: "month", label: "30 days" }]} />
      </div>

      {schedule.loading && !schedule.data ? <Loading /> : schedule.error ? <Alert tone="error">{schedule.error}</Alert> : grouped.length === 0 ? (
        <Empty title={range === "today" ? "Nothing on the schedule today" : "No sessions in this range"}>Enjoy the break, or add a booking for a family.</Empty>
      ) : (
        <div className="space-y-6">
          {grouped.map(([day, slots]) => (
            <section key={day}>
              <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">
                {day === today ? "Today" : fmtDay(day, { weekday: "long", month: "short", day: "numeric" })}
              </h3>
              <div className="space-y-3">
                {[...slots.entries()].map(([key, rows]) => {
                  const first = rows[0];
                  const active = rows.filter((r) => r.status !== "cancelled");
                  return (
                    <Card key={key} flush className="overflow-hidden">
                      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3 sm:px-5">
                        <div>
                          <span className="text-base font-bold text-fg">{fmtTime(first.start_time, tz)}–{fmtTime(first.end_time, tz)}</span>
                          <span className="ml-2 text-sm text-muted">{first.session_type_name}</span>
                        </div>
                        {first.max_players > 1 && <Badge tone="blue">{active.length}/{first.max_players} players</Badge>}
                      </div>
                      <ul className="divide-y divide-line">
                        {rows.map((r) => (
                          <li key={r.booking_id} className="flex flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                            <div className="min-w-0">
                              <div className="font-semibold text-fg">
                                {r.player_first_name}
                                <span className="ml-2 text-sm font-normal text-muted">{[r.player_age_group, r.player_skill_level].filter(Boolean).join(" · ")}</span>
                              </div>
                              <div className="text-sm text-muted">
                                {r.parent_name || r.parent_email}
                                {r.parent_phone && <> · <a href={`tel:${r.parent_phone}`} className="hover:text-brand">{r.parent_phone}</a></>}
                              </div>
                              {r.parent_note && <div className="mt-1 text-sm text-warn">“{r.parent_note}”</div>}
                              <div className="mt-1.5 flex flex-wrap gap-1.5">
                                <StatusBadge status={r.status} late={r.late_cancellation} />
                                {r.status !== "pending_payment" && <PaymentBadge method={r.paid_with} status={r.payment_status} />}
                                {r.has_session_note && <Badge tone="green">Note written</Badge>}
                              </div>
                            </div>
                            <div className="flex shrink-0 flex-wrap gap-2">
                              {["booked", "completed", "no_show"].includes(r.status) && new Date(r.start_time) <= new Date() && (
                                <Button size="sm" variant={r.has_session_note ? "secondary" : "primary"} onClick={() => setNoteFor(r)}>
                                  {r.has_session_note ? "Edit note" : "Session note"}
                                </Button>
                              )}
                              {r.status === "booked" && new Date(r.start_time) < new Date() && (
                                <Button size="sm" variant="ghost" onClick={() => quick(r, { p_status: "no_show" }, "Marked as no-show")}>No-show</Button>
                              )}
                              {r.paid_with === "manual" && r.payment_status === "unpaid" && r.status !== "cancelled" && (
                                <Button size="sm" variant="secondary" onClick={() => quick(r, { p_payment_status: "paid" }, "Marked paid")}>Mark paid</Button>
                              )}
                              {(r.status === "booked" || r.status === "pending_payment") && (
                                <Button size="sm" variant="ghost" onClick={() => setCancelFor(r)}>Cancel</Button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </Card>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}

      <SessionNoteModal row={noteFor} tz={tz} onClose={() => setNoteFor(null)} onSaved={() => { toast("Note saved. The parent can see it now."); reloadAll(); }} />
      <CoachCancelModal row={cancelFor} tz={tz} onClose={() => setCancelFor(null)} onDone={(m) => { toast(m); reloadAll(); }} />
      <NewBookingModal open={newBooking} tz={tz} onClose={() => setNewBooking(false)} onDone={() => { toast("Booked. The parent has been emailed."); reloadAll(); }} />
    </>
  );
}

// ---------------------------------------------------------------------------
const SKILL_SUGGESTIONS = ["first touch", "passing", "dribbling", "shooting", "weak foot", "1v1 moves", "receiving", "scanning", "finishing", "defending", "speed & agility", "goalkeeping"];

function SessionNoteModal({ row, tz, onClose, onSaved }: { row: ScheduleRow | null; tz: string; onClose: () => void; onSaved: () => void }) {
  const [skills, setSkills] = useState<string[]>([]);
  const [custom, setCustom] = useState("");
  const [notes, setNotes] = useState("");
  const [homework, setHomework] = useState("");
  const [status, setStatus] = useState<"completed" | "no_show">("completed");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!row) return;
    setError(null);
    setStatus(row.status === "no_show" ? "no_show" : "completed");
    supabase.from("session_notes").select("*").eq("booking_id", row.booking_id).maybeSingle().then(({ data }) => {
      setSkills(data?.skills_worked_on ?? []);
      setNotes(data?.coach_notes ?? "");
      setHomework(data?.homework ?? "");
    });
  }, [row]);

  if (!row) return null;
  const toggle = (s: string) => setSkills((xs) => (xs.includes(s) ? xs.filter((x) => x !== s) : [...xs, s]));

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const all = [...skills, ...custom.split(",").map((s) => s.trim()).filter(Boolean)];
      unwrap(await supabase.rpc("admin_complete_session", {
        p_booking_id: row!.booking_id, p_skills: [...new Set(all)], p_coach_notes: notes, p_homework: homework, p_status: status,
      }));
      setCustom("");
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`${row.player_first_name}: session note`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="note-form" loading={busy}>Save note</Button></>}>
      <form id="note-form" onSubmit={save} className="space-y-4">
        <p className="text-sm text-muted">{fmtLongDateTime(row.start_time, tz)} · {row.session_type_name}</p>
        {error && <Alert tone="error">{error}</Alert>}
        <Segmented value={status} onChange={setStatus} options={[{ value: "completed", label: "Completed" }, { value: "no_show", label: "No-show" }]} />
        <div>
          <div className="mb-1.5 text-sm font-medium text-fg-2">Skills worked on</div>
          <div className="flex flex-wrap gap-1.5">
            {[...new Set([...SKILL_SUGGESTIONS, ...skills])].map((s) => (
              <button type="button" key={s} onClick={() => toggle(s)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold ${skills.includes(s) ? "border-brand bg-brand text-white" : "border-line text-fg-2 hover:border-faint"}`}>
                {s}
              </button>
            ))}
          </div>
          <Input className="mt-2" placeholder="Other skills, comma separated" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </div>
        <Field label="Notes for the parent">{(id) => <Textarea id={id} rows={4} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} placeholder="What went well, what to focus on next" />}</Field>
        <Field label="Homework">{(id) => <Textarea id={id} rows={2} value={homework} onChange={(e) => setHomework(e.target.value)} maxLength={2000} placeholder="e.g. 50 wall passes per foot, 4x this week" />}</Field>
      </form>
    </Modal>
  );
}

function CoachCancelModal({ row, tz, onClose, onDone }: { row: ScheduleRow | null; tz: string; onClose: () => void; onDone: (m: string) => void }) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!row) return null;
  async function go() {
    setBusy(true);
    setError(null);
    try {
      const res = await invoke<{ result: { action: string }; refund_status: string }>("booking-actions", { action: "cancel", booking_id: row!.booking_id, reason });
      onDone(res.refund_status === "failed" ? "Cancelled, but the card refund failed. Refund it in Stripe." : "Cancelled. The parent was refunded and emailed.");
      setReason("");
      onClose();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancel ${row.player_first_name}'s session?`}
      footer={<><Button variant="ghost" onClick={onClose}>Keep</Button><Button variant="danger" loading={busy} onClick={go}>Cancel session</Button></>}>
      <div className="space-y-4">
        <p className="text-sm text-fg-2">{fmtLongDateTime(row.start_time, tz)} · {row.session_type_name}</p>
        <Alert>When you cancel, the family always gets their credit back or a full card refund, and an email.</Alert>
        <Field label="Reason (included in the email)">{(id) => <Textarea id={id} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Field closed due to weather" />}</Field>
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Modal>
  );
}

function NewBookingModal({ open, tz, onClose, onDone }: { open: boolean; tz: string; onClose: () => void; onDone: () => void }) {
  const { settings } = useAuth();
  const players = useLoad(async () => open
    ? unwrap(await supabase.from("players").select("id, first_name, age_group, parent:profiles(full_name, email)").eq("active", true).order("first_name"))
    : [], [open]);
  const types = useLoad(async () => open ? unwrap(await supabase.from("session_types").select("*").eq("active", true).order("sort_order")) : [], [open]);
  const [playerId, setPlayerId] = useState("");
  const [typeId, setTypeId] = useState("");
  const [mode, setMode] = useState<"slot" | "custom">("slot");
  const [slot, setSlot] = useState<Slot | null>(null);
  const [hours, setHours] = useState(1);
  const [date, setDate] = useState(todayKey(tz));
  const [time, setTime] = useState("17:00");
  const [usePackage, setUsePackage] = useState(false);
  const [notify, setNotify] = useState(true);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { if (types.data?.length && !typeId) setTypeId(types.data[0].id); }, [types.data, typeId]);
  if (!open) return null;

  const start = mode === "slot" ? slot?.slot_start : zonedToUtc(date, time, tz);

  async function go() {
    if (!playerId || !typeId || !start) return setError("Choose a player, session type and time.");
    setBusy(true);
    setError(null);
    try {
      await invoke("booking-actions", {
        action: "admin_create_booking", player_id: playerId, session_type_id: typeId, start_time: start,
        hours, use_package: usePackage, override_availability: mode === "custom", note, notify_parent: notify,
      });
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
    <Modal open wide onClose={onClose} title="New booking"
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} disabled={!start || !playerId} onClick={go}>Book{start ? ` ${fmtLongDateTime(start, tz).replace(/ [A-Z]{2,4}$/, "")}` : ""}</Button></>}>
      <div className="space-y-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Player">
            {(id) => (
              <Select id={id} value={playerId} onChange={(e) => setPlayerId(e.target.value)}>
                <option value="">Choose a player...</option>
                {(players.data ?? []).map((p) => (
                  <option key={p.id} value={p.id}>{p.first_name}{p.age_group ? ` (${p.age_group})` : ""} · {p.parent?.full_name || p.parent?.email}</option>
                ))}
              </Select>
            )}
          </Field>
          <Field label="Session type">
            {(id) => (
              <Select id={id} value={typeId} onChange={(e) => { setTypeId(e.target.value); setSlot(null); setHours(1); }}>
                {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name} ({t.duration_minutes} min)</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Segmented value={mode} onChange={setMode} options={[{ value: "slot", label: "Open slot" }, { value: "custom", label: "Custom time" }]} />
        <HoursPicker value={hours} max={maxHoursFor(types.data?.find((t) => t.id === typeId), settings)} onChange={(h) => { setHours(h); setSlot(null); }} />
        {mode === "slot" ? (
          typeId && <SlotPicker sessionTypeId={typeId} hours={hours} tz={tz} selected={slot?.slot_start} onSelect={setSlot} />
        ) : (
          <div className="grid grid-cols-2 gap-4">
            <Field label="Date">{(id) => <Input id={id} type="date" value={date} onChange={(e) => setDate(e.target.value)} />}</Field>
            <Field label="Start time" hint="Outside your published hours is OK. Overlaps are still blocked.">{(id) => <Input id={id} type="time" step={900} value={time} onChange={(e) => setTime(e.target.value)} />}</Field>
          </div>
        )}
        <div className="space-y-2">
          <Checkbox checked={usePackage} onChange={(e) => setUsePackage(e.target.checked)} label={`Use ${hours > 1 ? `${hours} of the client's package credits` : "one of the client's package credits"} (otherwise: cash/Venmo, mark paid later)`} />
          <Checkbox checked={notify} onChange={(e) => setNotify(e.target.checked)} label="Email the parent a confirmation" />
        </div>
        <Field label="Note (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} />}</Field>
      </div>
    </Modal>
  );
}
