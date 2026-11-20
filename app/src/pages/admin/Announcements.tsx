import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, Field, Input, Loading, Modal, PageHeader, Segmented, Textarea, useToast } from "../../components/ui";
import { errorMessage, invoke, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDateTime, plural } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { useLoad } from "../../lib/useLoad";

type Audience = "all" | "today" | "this_week";
const AUDIENCE_LABEL: Record<Audience, string> = {
  all: "All clients",
  today: "Families with a session today",
  this_week: "Families with a session in the next 7 days",
};

export default function Announcements() {
  const { tz } = useAuth();
  const toast = useToast();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [audience, setAudience] = useState<Audience>("today");
  const [preview, setPreview] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const history = useLoad(async () => unwrap(await supabase.from("announcements").select("*").order("created_at", { ascending: false }).limit(20)), []);

  async function check(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await invoke<{ recipient_count: number }>("send-announcement", { subject, message, audience, dry_run: true });
      setPreview(r.recipient_count);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  async function send() {
    setBusy(true);
    try {
      const r = await invoke<{ sent: number; failed: number }>("send-announcement", { subject, message, audience });
      toast(r.failed ? `Sent to ${r.sent}, ${r.failed} failed` : `Sent to ${plural(r.sent, "client")}`, r.failed ? "warning" : "success");
      setPreview(null);
      setSubject("");
      setMessage("");
      history.reload();
    } catch (err) {
      setError(errorMessage(err));
      setPreview(null);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Announcements" subtitle="Email clients about schedule changes, field closures or news." />
      <div className="grid gap-6 lg:grid-cols-[3fr_2fr]">
        <Card>
          <form onSubmit={check} className="space-y-4">
            <div>
              <div className="mb-1.5 text-sm font-medium text-fg-2">Send to</div>
              <Segmented value={audience} onChange={setAudience} options={[{ value: "today", label: "Today" }, { value: "this_week", label: "This week" }, { value: "all", label: "Everyone" }]} />
              <p className="mt-1.5 text-xs text-subtle">
                {AUDIENCE_LABEL[audience]}.{audience === "all" ? " Skips parents who opted out." : " Sent even to opted-out parents, since it's about their session."}
              </p>
            </div>
            <Field label="Subject">{(id) => <Input id={id} value={subject} onChange={(e) => setSubject(e.target.value)} required maxLength={150} placeholder="Field closed today" />}</Field>
            <Field label="Message" hint="Plain text. Leave a blank line between paragraphs.">
              {(id) => <Textarea id={id} rows={8} value={message} onChange={(e) => setMessage(e.target.value)} required maxLength={10000} />}
            </Field>
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" loading={busy && preview === null}>Review & send</Button>
          </form>
        </Card>
        <div>
          <h2 className="mb-3 text-lg font-semibold text-fg">Recent</h2>
          {history.loading ? <Loading /> : (history.data ?? []).length === 0 ? <p className="text-sm text-subtle">Nothing sent yet.</p> : (
            <div className="space-y-2">
              {history.data!.map((a) => (
                <div key={a.id} className="rounded-xl border border-line bg-panel p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="font-semibold text-fg">{a.subject}</div>
                    <Badge>{a.recipient_count}</Badge>
                  </div>
                  <div className="text-xs text-subtle">{fmtDateTime(a.created_at, tz)} · {AUDIENCE_LABEL[a.audience as Audience]}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <Modal open={preview !== null} onClose={() => setPreview(null)} title="Send announcement?"
        footer={<><Button variant="ghost" onClick={() => setPreview(null)}>Back</Button><Button loading={busy} disabled={!preview} onClick={send}>Send to {plural(preview ?? 0, "client")}</Button></>}>
        {preview === 0 ? <Alert tone="warning">No clients match this audience, so nothing will be sent.</Alert> : (
          <div className="space-y-3">
            <p className="text-fg-2">This emails <strong className="text-fg">{plural(preview ?? 0, "client")}</strong>. Each gets their own email, and they won't see each other's addresses.</p>
            <div className="rounded-xl border border-line bg-ink-deep p-4">
              <div className="font-semibold text-fg">{subject}</div>
              <p className="mt-2 whitespace-pre-line text-sm text-fg-2">{message}</p>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
