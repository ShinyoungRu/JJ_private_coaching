import { type FormEvent, useEffect, useState } from "react";
import { Alert, Button, Card, Field, Input, PageHeader, Select, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import type { AppSettings } from "../../lib/types";

const ZONES = ["America/New_York", "America/Chicago", "America/Denver", "America/Phoenix", "America/Los_Angeles"];

export default function Settings() {
  const { settings, refresh } = useAuth();
  const toast = useToast();
  const [f, setF] = useState<AppSettings | null>(settings);
  const [busy, setBusy] = useState(false);
  useEffect(() => setF(settings), [settings]);
  if (!f) return <Alert tone="error">Settings couldn't be loaded.</Alert>;

  const num = (k: keyof AppSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value === "" ? null : Number(e.target.value) });

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    try {
      const { id: _id, updated_at: _u, ...rest } = f!;
      unwrap(await supabase.from("app_settings").update(rest).eq("id", 1).select().single());
      await refresh();
      toast("Settings saved");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="max-w-3xl">
      <PageHeader title="Settings" subtitle="Booking rules. Changes apply right away." />
      <form onSubmit={save} className="space-y-6">
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Business</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Business name">{(id) => <Input id={id} value={f.business_name} onChange={(e) => setF({ ...f, business_name: e.target.value })} />}</Field>
            <Field label="Time zone" hint="All times are shown in this zone, for everyone.">
              {(id) => <Select id={id} value={f.timezone} onChange={(e) => setF({ ...f, timezone: e.target.value })}>{[...new Set([f.timezone, ...ZONES])].map((z) => <option key={z}>{z}</option>)}</Select>}
            </Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Booking</h2>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Start times every (min)">{(id) => <Input id={id} type="number" min={5} max={240} step={5} value={f.slot_interval_minutes} onChange={num("slot_interval_minutes")} />}</Field>
            <Field label="Minimum notice (hours)" hint="How soon parents can book">{(id) => <Input id={id} type="number" min={0} max={336} value={f.min_booking_notice_hours} onChange={num("min_booking_notice_hours")} />}</Field>
            <Field label="Book up to (days ahead)">{(id) => <Input id={id} type="number" min={1} max={365} value={f.max_booking_days_ahead} onChange={num("max_booking_days_ahead")} />}</Field>
          </div>
        </Card>
        <Card className="space-y-4">
          <h2 className="text-lg font-semibold text-white">Cancellations & reminders</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Free cancellation up to (hours before)" hint="Inside this window the session is forfeited.">
              {(id) => <Input id={id} type="number" min={0} max={336} value={f.cancellation_window_hours} onChange={num("cancellation_window_hours")} />}
            </Field>
            <Field label="Reminder email (hours before)">{(id) => <Input id={id} type="number" min={1} max={168} value={f.reminder_hours_before} onChange={num("reminder_hours_before")} />}</Field>
            <Field label="Card-paid session cancelled in time">
              {(id) => (
                <Select id={id} value={f.stripe_cancellation_refund} onChange={(e) => setF({ ...f, stripe_cancellation_refund: e.target.value })}>
                  <option value="stripe_refund">Refund the card</option>
                  <option value="session_credit">Give a 1-session credit (keeps Stripe fee)</option>
                </Select>
              )}
            </Field>
            <Field label="Cancellation credits expire after (days)" hint="Blank = never">{(id) => <Input id={id} type="number" min={1} value={f.credit_validity_days ?? ""} onChange={num("credit_validity_days")} />}</Field>
          </div>
        </Card>
        <Button type="submit" size="lg" loading={busy}>Save settings</Button>
      </form>
    </div>
  );
}
