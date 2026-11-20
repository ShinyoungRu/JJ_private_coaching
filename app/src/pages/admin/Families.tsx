import { type FormEvent, useState } from "react";
import { Alert, Badge, Button, Card, Empty, Field, Input, Loading, Modal, PageHeader, Select, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { useAuth } from "../../lib/auth";
import { fmtDate, plural, titleCase } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import { CLIENT_TYPE_LABEL, type PackagePurchase, type Player, type Profile } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

type Family = Profile & { players: Player[]; package_purchases: PackagePurchase[] };

export default function Families() {
  const { tz } = useAuth();
  const toast = useToast();
  const [q, setQ] = useState("");
  const [grantFor, setGrantFor] = useState<Family | null>(null);

  const families = useLoad(async () => {
    const rows = unwrap(await supabase
      .from("profiles")
      .select("*, players(*), package_purchases(*)")
      .eq("role", "client")
      .order("full_name"));
    return rows as unknown as Family[];
  }, []);

  const needle = q.trim().toLowerCase();
  const list = (families.data ?? []).filter((f) =>
    !needle ||
    [f.full_name, f.email, f.phone, ...f.players.map((p) => p.first_name)].some((v) => v?.toLowerCase().includes(needle))
  );

  return (
    <>
      <PageHeader title="Clients" subtitle={families.data ? clientSummary(families.data) : undefined} />
      <Input className="mb-5 max-w-sm" placeholder="Search clients or players..." value={q} onChange={(e) => setQ(e.target.value)} />

      {families.loading ? <Loading /> : families.error ? <Alert tone="error">{families.error}</Alert> : list.length === 0 ? (
        <Empty title={needle ? "No matches" : "No clients yet"}>Clients appear here after they sign up in the app.</Empty>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {list.map((f) => {
            const now = Date.now();
            const credits = f.package_purchases.filter((c) => c.sessions_remaining > 0 && (!c.expires_at || new Date(c.expires_at).getTime() > now));
            const total = credits.reduce((n, c) => n + c.sessions_remaining, 0);
            return (
              <Card key={f.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="flex min-w-0 items-center gap-2 text-lg font-semibold text-fg">
                      <span className="truncate">{f.full_name || "(no name)"}</span>
                      <Badge tone={f.client_type === "adult" ? "green" : "gray"}>{CLIENT_TYPE_LABEL[f.client_type]}</Badge>
                    </h2>
                    <div className="text-sm text-muted">
                      <a href={`mailto:${f.email}`} className="hover:text-brand">{f.email}</a>
                      {f.phone && <> · <a href={`tel:${f.phone}`} className="hover:text-brand">{f.phone}</a></>}
                    </div>
                    <div className="mt-0.5 text-xs text-muted">Joined {fmtDate(f.created_at, tz)}{!f.announcements_opt_in && " · opted out of announcements"}</div>
                  </div>
                  <Badge tone={total ? "blue" : "gray"}>{total} credit{total === 1 ? "" : "s"}</Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {f.players.filter((p) => p.active).map((p) => (
                    <span key={p.id} className="rounded-lg border border-line bg-ink-deep px-2.5 py-1 text-sm">
                      <span className="font-semibold text-fg">{p.first_name}</span>
                      {p.is_self && <span className="ml-1 text-xs font-semibold text-brand">(self)</span>}
                      <span className="ml-1 text-muted">{[p.age_group, p.skill_level && titleCase(p.skill_level)].filter(Boolean).join(" · ")}</span>
                    </span>
                  ))}
                  {f.players.filter((p) => p.active).length === 0 && <span className="text-sm text-muted">No players added yet</span>}
                </div>
                {credits.length > 0 && (
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {credits.map((c) => (
                      <li key={c.id}>{c.label}: {c.sessions_remaining}/{c.sessions_total}{c.expires_at ? ` · until ${fmtDate(c.expires_at, tz)}` : ""}</li>
                    ))}
                  </ul>
                )}
                <div className="mt-4">
                  <Button size="sm" variant="secondary" onClick={() => setGrantFor(f)}>+ Add credits</Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <GrantModal family={grantFor} onClose={() => setGrantFor(null)} onDone={() => { toast("Credits added"); families.reload(); }} />
    </>
  );
}

function clientSummary(list: Family[]): string {
  const adults = list.filter((f) => f.client_type === "adult").length;
  const parents = list.length - adults;
  return `${plural(list.length, "client")}: ${plural(parents, "parent")}, ${plural(adults, "adult athlete")}`;
}

function GrantModal({ family, onClose, onDone }: { family: Family | null; onClose: () => void; onDone: () => void }) {
  const types = useLoad(async () => unwrap(await supabase.from("session_types").select("id, name").eq("active", true).order("sort_order")), []);
  const [count, setCount] = useState(1);
  const [label, setLabel] = useState("Complimentary session");
  const [typeId, setTypeId] = useState("");
  const [days, setDays] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!family) return null;

  async function go(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      unwrap(await supabase.from("package_purchases").insert({
        parent_id: family!.id,
        source: "coach_grant",
        label: label.trim() || "Coach credit",
        sessions_total: count,
        sessions_remaining: count,
        session_type_id: typeId || null,
        expires_at: days ? new Date(Date.now() + Number(days) * 86_400_000).toISOString() : null,
      }).select().single());
      onDone();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Add credits for ${family.full_name || family.email}`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="grant" loading={busy}>Add credits</Button></>}>
      <form id="grant" onSubmit={go} className="space-y-4">
        <p className="text-sm text-muted">For comps, cash-paid packages, or migrating credits from the old system. No charge is made.</p>
        {error && <Alert tone="error">{error}</Alert>}
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sessions">{(id) => <Input id={id} type="number" min={1} max={100} value={count} onChange={(e) => setCount(Math.max(1, Number(e.target.value)))} />}</Field>
          <Field label="Expires after (days)" hint="Blank = never">{(id) => <Input id={id} type="number" min={1} value={days} onChange={(e) => setDays(e.target.value)} />}</Field>
        </div>
        <Field label="Label (parent sees this)">{(id) => <Input id={id} value={label} onChange={(e) => setLabel(e.target.value)} maxLength={120} />}</Field>
        <Field label="Valid for">
          {(id) => (
            <Select id={id} value={typeId} onChange={(e) => setTypeId(e.target.value)}>
              <option value="">Any session type</option>
              {(types.data ?? []).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </Field>
      </form>
    </Modal>
  );
}
