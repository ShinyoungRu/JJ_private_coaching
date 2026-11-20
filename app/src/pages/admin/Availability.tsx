import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, PageHeader, Segmented, Select, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtClock, fmtDateTime, fmtLongDateTime, todayKey, tzAbbrev, zonedToUtc } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { DAY_NAMES } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

// Monday-first display order
const ORDER = [1, 2, 3, 4, 5, 6, 0];

export default function Availability() {
  const { tz } = useAuth();
  const toast = useToast();
  const hours = useLoad(async () => unwrap(await supabase.from("availability").select("*").order("start_time")), []);
  const blocks = useLoad(async () => unwrap(await supabase.from("blocked_times").select("*").gte("end_time", new Date().toISOString()).order("start_time")), []);

  const [day, setDay] = useState(1);
  const [start, setStart] = useState("16:00");
  const [end, setEnd] = useState("20:00");

  const [blockMode, setBlockMode] = useState<"days" | "hours">("days");
  const [bFrom, setBFrom] = useState(todayKey(tz));
  const [bTo, setBTo] = useState(todayKey(tz));
  const [bStart, setBStart] = useState("16:00");
  const [bEnd, setBEnd] = useState("18:00");
  const [reason, setReason] = useState("");
  const [conflicts, setConflicts] = useState<Array<{ booking_id: string; start_time: string; player_first_name: string }>>([]);

  async function addWindow(e: FormEvent) {
    e.preventDefault();
    if (end <= start) return toast("End time must be after the start time.", "error");
    try {
      unwrap(await supabase.from("availability").insert({ day_of_week: day, start_time: start, end_time: end }).select().single());
      toast(`${DAY_NAMES[day]} ${fmtClock(start)}–${fmtClock(end)} added`);
      hours.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function toggle(id: string, active: boolean) {
    try {
      unwrap(await supabase.from("availability").update({ active }).eq("id", id).select().single());
      hours.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function remove(id: string) {
    try {
      unwrap(await supabase.from("availability").delete().eq("id", id).select());
      hours.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function addBlock(e: FormEvent) {
    e.preventDefault();
    try {
      const args = blockMode === "days"
        ? { p_start_date: bFrom, p_end_date: bTo < bFrom ? bFrom : bTo, p_reason: reason }
        : { p_start: zonedToUtc(bFrom, bStart, tz), p_end: zonedToUtc(bFrom, bEnd, tz), p_reason: reason };
      const res = unwrap(await supabase.rpc("admin_block_time", args)) as unknown as {
        conflicting_bookings: Array<{ booking_id: string; start_time: string; player_first_name: string }>;
      };
      setConflicts(res.conflicting_bookings);
      toast(res.conflicting_bookings.length ? "Blocked. Some sessions are already booked in that time." : "Time blocked", res.conflicting_bookings.length ? "warning" : "success");
      setReason("");
      blocks.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  async function unblock(id: string) {
    try {
      unwrap(await supabase.from("blocked_times").delete().eq("id", id).select());
      blocks.reload();
    } catch (err) {
      toast(errorMessage(err), "error");
    }
  }

  return (
    <>
      <PageHeader title="Availability" subtitle={`Weekly hours parents can book, in ${tzAbbrev(tz)}. Block days off for vacations, tournaments or field closures.`} />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <h2 className="mb-4 text-lg font-semibold text-fg">Weekly hours</h2>
          {hours.loading ? <Loading /> : (
            <div className="space-y-3">
              {ORDER.map((d) => {
                const rows = (hours.data ?? []).filter((h) => h.day_of_week === d);
                return (
                  <div key={d} className="flex flex-col gap-2 border-b border-line pb-3 last:border-0 sm:flex-row sm:items-start">
                    <div className="w-28 shrink-0 pt-1 text-sm font-semibold text-fg-2">{DAY_NAMES[d]}</div>
                    <div className="flex flex-1 flex-wrap gap-2">
                      {rows.length === 0 && <span className="pt-1 text-sm text-muted">Unavailable</span>}
                      {rows.map((h) => (
                        <div key={h.id} className={`flex items-center gap-1 rounded-lg border px-2.5 py-1 text-sm ${h.active ? "border-line bg-ink-deep" : "border-dashed border-line text-subtle"}`}>
                          <span className="font-semibold">{fmtClock(h.start_time)}–{fmtClock(h.end_time)}</span>
                          <button onClick={() => toggle(h.id, !h.active)} className="ml-1 rounded px-1 text-xs text-muted hover:text-brand" title={h.active ? "Pause" : "Resume"}>
                            {h.active ? "pause" : "resume"}
                          </button>
                          <button onClick={() => remove(h.id)} className="rounded px-1 text-subtle hover:text-danger" aria-label="Remove">×</button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <form onSubmit={addWindow} className="mt-5 grid grid-cols-2 gap-3 rounded-xl border border-line bg-ink-deep/60 p-4">
            <Field label="Day" className="col-span-2">
              {(id) => <Select id={id} value={day} onChange={(e) => setDay(Number(e.target.value))}>{ORDER.map((d) => <option key={d} value={d}>{DAY_NAMES[d]}</option>)}</Select>}
            </Field>
            <Field label="From">{(id) => <Input id={id} type="time" step={900} value={start} onChange={(e) => setStart(e.target.value)} />}</Field>
            <Field label="To">{(id) => <Input id={id} type="time" step={900} value={end} onChange={(e) => setEnd(e.target.value)} />}</Field>
            <Button type="submit" className="col-span-2">Add hours</Button>
          </form>
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold text-fg">Time off</h2>
          <form onSubmit={addBlock} className="space-y-3 rounded-xl border border-line bg-ink-deep/60 p-4">
            <Segmented value={blockMode} onChange={setBlockMode} options={[{ value: "days", label: "Whole days" }, { value: "hours", label: "Part of a day" }]} />
            {blockMode === "days" ? (
              <div className="grid grid-cols-2 gap-3">
                <Field label="From">{(id) => <Input id={id} type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} />}</Field>
                <Field label="Through">{(id) => <Input id={id} type="date" value={bTo} min={bFrom} onChange={(e) => setBTo(e.target.value)} />}</Field>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                <Field label="Date">{(id) => <Input id={id} type="date" value={bFrom} onChange={(e) => setBFrom(e.target.value)} />}</Field>
                <Field label="From">{(id) => <Input id={id} type="time" step={900} value={bStart} onChange={(e) => setBStart(e.target.value)} />}</Field>
                <Field label="To">{(id) => <Input id={id} type="time" step={900} value={bEnd} onChange={(e) => setBEnd(e.target.value)} />}</Field>
              </div>
            )}
            <Field label="Reason (private)">{(id) => <Input id={id} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Tournament" maxLength={200} />}</Field>
            <Button type="submit">Block time</Button>
          </form>

          {conflicts.length > 0 && (
            <Alert tone="warning" className="mt-4">
              These sessions are already booked during that time. Cancel or move them from the Schedule tab:
              <ul className="mt-2 list-disc pl-5">{conflicts.map((c) => <li key={c.booking_id}>{c.player_first_name}: {fmtLongDateTime(c.start_time, tz)}</li>)}</ul>
            </Alert>
          )}

          <div className="mt-5 space-y-2">
            {blocks.loading ? <Loading /> : (blocks.data ?? []).length === 0 ? <Empty title="No upcoming time off" /> : (blocks.data ?? []).map((b) => (
              <div key={b.id} className="flex items-center justify-between gap-3 rounded-xl border border-line px-4 py-3">
                <div>
                  <div className="text-sm font-semibold text-fg">{fmtDateTime(b.start_time, tz)} → {fmtDateTime(b.end_time, tz)}</div>
                  {b.reason && <Badge>{b.reason}</Badge>}
                </div>
                <Button size="sm" variant="ghost" onClick={() => unblock(b.id)}>Remove</Button>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </>
  );
}
