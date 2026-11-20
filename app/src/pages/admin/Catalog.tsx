import { type FormEvent, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Loading, Modal, PageHeader, SectionTitle, Select, Textarea, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { fmtMoney } from "../../lib/format";
import { supabase } from "../../lib/supabase";
import type { Package, SessionType } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

const dollars = (cents: number) => (cents / 100).toFixed(2);
const toCents = (s: string) => Math.round(parseFloat(s || "0") * 100);

export default function Catalog() {
  const toast = useToast();
  const types = useLoad(async () => unwrap(await supabase.from("session_types").select("*").order("sort_order")), []);
  const packages = useLoad(async () => unwrap(await supabase.from("packages").select("*").order("sort_order")), []);
  const [editType, setEditType] = useState<SessionType | null | undefined>(undefined);
  const [editPkg, setEditPkg] = useState<Package | null | undefined>(undefined);

  return (
    <>
      <PageHeader title="Sessions & prices" subtitle="What parents can book and buy. Changes apply to new bookings right away." />
      {types.error && <Alert tone="error">{types.error}</Alert>}

      <section className="mb-10">
        <SectionTitle hint={<Button size="sm" onClick={() => setEditType(null)}>+ Session type</Button>}>Session types</SectionTitle>
        {types.loading ? <Loading /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {types.data!.map((t) => (
              <Card key={t.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-white">{t.name}</span>{!t.active && <Badge>Hidden</Badge>}</div>
                    <div className="text-sm text-gray-400">{t.duration_minutes} min · {t.max_players === 1 ? "private" : `up to ${t.max_players} players`}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{fmtMoney(t.price_cents)}</div>
                    <button className="text-sm font-semibold text-brand-soft hover:underline" onClick={() => setEditType(t)}>Edit</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <section>
        <SectionTitle hint={<Button size="sm" onClick={() => setEditPkg(null)}>+ Package</Button>}>Packages</SectionTitle>
        {packages.loading ? <Loading /> : (
          <div className="grid gap-3 md:grid-cols-2">
            {packages.data!.map((p) => (
              <Card key={p.id} className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2"><span className="font-semibold text-white">{p.name}</span>{!p.active && <Badge>Hidden</Badge>}</div>
                    <div className="text-sm text-gray-400">
                      {p.session_count} sessions · {types.data?.find((t) => t.id === p.session_type_id)?.name ?? "any session type"}
                      {p.validity_days ? ` · ${p.validity_days} days` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold text-white">{fmtMoney(p.price_cents)}</div>
                    <div className="text-xs text-gray-500">{fmtMoney(Math.round(p.price_cents / p.session_count))}/session</div>
                    <button className="text-sm font-semibold text-brand-soft hover:underline" onClick={() => setEditPkg(p)}>Edit</button>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <TypeModal item={editType} onClose={() => setEditType(undefined)} onSaved={() => { toast("Saved"); types.reload(); }} />
      <PackageModal item={editPkg} types={types.data ?? []} onClose={() => setEditPkg(undefined)} onSaved={() => { toast("Saved"); packages.reload(); }} />
    </>
  );
}

function TypeModal({ item, onClose, onSaved }: { item: SessionType | null | undefined; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", description: "", duration: "60", price: "", max: "1", active: true, sort: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (item === undefined) return;
    setF({
      name: item?.name ?? "", description: item?.description ?? "", duration: String(item?.duration_minutes ?? 60),
      price: item ? dollars(item.price_cents) : "", max: String(item?.max_players ?? 1), active: item?.active ?? true, sort: String(item?.sort_order ?? 0),
    });
    setError(null);
  }, [item]);
  if (item === undefined) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const v = {
        name: f.name.trim(), description: f.description.trim() || null, duration_minutes: Number(f.duration),
        price_cents: toCents(f.price), max_players: Number(f.max), active: f.active, sort_order: Number(f.sort),
      };
      if (item) unwrap(await supabase.from("session_types").update(v).eq("id", item.id).select().single());
      else unwrap(await supabase.from("session_types").insert(v).select().single());
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : "New session type"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="type" loading={busy}>Save</Button></>}>
      <form id="type" onSubmit={save} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />}</Field>
        <div className="grid grid-cols-3 gap-4">
          <Field label="Minutes">{(id) => <Input id={id} type="number" min={15} max={480} step={15} value={f.duration} onChange={(e) => setF({ ...f, duration: e.target.value })} required />}</Field>
          <Field label="Price ($)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required />}</Field>
          <Field label="Max players">{(id) => <Input id={id} type="number" min={1} max={30} value={f.max} onChange={(e) => setF({ ...f, max: e.target.value })} required />}</Field>
        </div>
        <Field label="Display order">{(id) => <Input id={id} type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />}</Field>
        <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="Bookable (uncheck to hide without deleting history)" />
      </form>
    </Modal>
  );
}

function PackageModal({ item, types, onClose, onSaved }: { item: Package | null | undefined; types: SessionType[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({ name: "", description: "", count: "5", price: "", typeId: "", validity: "", active: true, sort: "0" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (item === undefined) return;
    setF({
      name: item?.name ?? "", description: item?.description ?? "", count: String(item?.session_count ?? 5), price: item ? dollars(item.price_cents) : "",
      typeId: item?.session_type_id ?? "", validity: item?.validity_days ? String(item.validity_days) : "", active: item?.active ?? true, sort: String(item?.sort_order ?? 0),
    });
    setError(null);
  }, [item]);
  if (item === undefined) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const v = {
        name: f.name.trim(), description: f.description.trim() || null, session_count: Number(f.count), price_cents: toCents(f.price),
        session_type_id: f.typeId || null, validity_days: f.validity ? Number(f.validity) : null, active: f.active, sort_order: Number(f.sort),
      };
      if (item) unwrap(await supabase.from("packages").update(v).eq("id", item.id).select().single());
      else unwrap(await supabase.from("packages").insert(v).select().single());
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={item ? `Edit ${item.name}` : "New package"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="pkg" loading={busy}>Save</Button></>}>
      <form id="pkg" onSubmit={save} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Name">{(id) => <Input id={id} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required maxLength={80} />}</Field>
        <Field label="Description">{(id) => <Textarea id={id} rows={2} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={1000} />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Sessions">{(id) => <Input id={id} type="number" min={1} max={100} value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} required />}</Field>
          <Field label="Price ($)">{(id) => <Input id={id} type="number" min={0} step="0.01" value={f.price} onChange={(e) => setF({ ...f, price: e.target.value })} required />}</Field>
          <Field label="Valid for (days)" hint="Blank = never expires">{(id) => <Input id={id} type="number" min={1} value={f.validity} onChange={(e) => setF({ ...f, validity: e.target.value })} />}</Field>
          <Field label="Display order">{(id) => <Input id={id} type="number" value={f.sort} onChange={(e) => setF({ ...f, sort: e.target.value })} />}</Field>
        </div>
        <Field label="Credits can be used for">
          {(id) => (
            <Select id={id} value={f.typeId} onChange={(e) => setF({ ...f, typeId: e.target.value })}>
              <option value="">Any session type</option>
              {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          )}
        </Field>
        <Checkbox checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} label="For sale" />
      </form>
    </Modal>
  );
}
