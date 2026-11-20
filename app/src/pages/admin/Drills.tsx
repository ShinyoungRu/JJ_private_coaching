import { type FormEvent, useEffect, useState } from "react";
import { Alert, Badge, Button, Card, Checkbox, Empty, Field, Input, Loading, Modal, PageHeader, Textarea, useToast } from "../../components/ui";
import { errorMessage, unwrap } from "../../lib/api";
import { supabase } from "../../lib/supabase";
import type { Drill } from "../../lib/types";
import { useLoad } from "../../lib/useLoad";

type DrillRow = Drill & { player_drills: Array<{ player_id: string }> };

export default function Drills() {
  const toast = useToast();
  const [editing, setEditing] = useState<DrillRow | null | undefined>(undefined);
  const [assigning, setAssigning] = useState<DrillRow | null>(null);

  const drills = useLoad(async () => unwrap(await supabase.from("drills").select("*, player_drills(player_id)").order("created_at", { ascending: false })) as unknown as DrillRow[], []);

  async function remove(d: DrillRow) {
    if (!confirm(`Delete "${d.title}"? It will be removed from every player.`)) return;
    try {
      if (d.video_path) await supabase.storage.from("drill-videos").remove([d.video_path]);
      unwrap(await supabase.from("drills").delete().eq("id", d.id).select());
      toast("Drill deleted");
      drills.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  return (
    <>
      <PageHeader title="Drills" subtitle="Upload drill videos (or link YouTube) and assign them to players as homework." actions={<Button onClick={() => setEditing(null)}>+ New drill</Button>} />
      {drills.loading ? <Loading /> : drills.error ? <Alert tone="error">{drills.error}</Alert> : (drills.data ?? []).length === 0 ? (
        <Empty title="No drills yet" action={<Button onClick={() => setEditing(null)}>+ New drill</Button>} />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {drills.data!.map((d) => (
            <Card key={d.id} className="flex flex-col">
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold text-white">{d.title}</h2>
                {d.skill_tag && <Badge tone="blue">{d.skill_tag}</Badge>}
              </div>
              {d.description && <p className="mt-1.5 line-clamp-3 text-sm text-gray-400">{d.description}</p>}
              <div className="mt-2 text-xs text-gray-500">
                {d.video_path ? "🎬 Uploaded video" : d.external_url ? "🔗 Video link" : "No video"} · assigned to {d.player_drills.length}
              </div>
              <div className="mt-auto flex flex-wrap gap-2 pt-4">
                <Button size="sm" onClick={() => setAssigning(d)}>Assign</Button>
                <Button size="sm" variant="secondary" onClick={() => setEditing(d)}>Edit</Button>
                <Button size="sm" variant="ghost" onClick={() => remove(d)}>Delete</Button>
              </div>
            </Card>
          ))}
        </div>
      )}
      <DrillModal drill={editing} onClose={() => setEditing(undefined)} onSaved={() => { toast("Drill saved"); drills.reload(); }} />
      <AssignModal drill={assigning} onClose={() => setAssigning(null)} onSaved={() => { toast("Assignments updated"); drills.reload(); }} />
    </>
  );
}

function DrillModal({ drill, onClose, onSaved }: { drill: DrillRow | null | undefined; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [tag, setTag] = useState("");
  const [url, setUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (drill === undefined) return;
    setTitle(drill?.title ?? "");
    setDescription(drill?.description ?? "");
    setTag(drill?.skill_tag ?? "");
    setUrl(drill?.external_url ?? "");
    setFile(null);
    setError(null);
  }, [drill]);

  if (drill === undefined) return null;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (url && !url.startsWith("https://")) return setError("Video links must start with https://");
    setBusy(true);
    setError(null);
    try {
      const values = { title: title.trim(), description: description.trim() || null, skill_tag: tag.trim() || null, external_url: url.trim() || null };
      const saved = drill
        ? unwrap(await supabase.from("drills").update(values).eq("id", drill.id).select().single())
        : unwrap(await supabase.from("drills").insert(values).select().single());
      if (file) {
        const path = `${saved.id}/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
        const up = await supabase.storage.from("drill-videos").upload(path, file, { contentType: file.type, upsert: false });
        if (up.error) throw new Error(`Saved, but the video upload failed: ${up.error.message}`);
        if (saved.video_path) await supabase.storage.from("drill-videos").remove([saved.video_path]);
        unwrap(await supabase.from("drills").update({ video_path: path }).eq("id", saved.id).select().single());
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={drill ? "Edit drill" : "New drill"}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button type="submit" form="drill" loading={busy}>{file ? "Save & upload" : "Save"}</Button></>}>
      <form id="drill" onSubmit={save} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label="Title">{(id) => <Input id={id} value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={120} />}</Field>
        <Field label="Instructions">{(id) => <Textarea id={id} rows={4} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={5000} />}</Field>
        <Field label="Skill tag">{(id) => <Input id={id} value={tag} onChange={(e) => setTag(e.target.value)} placeholder="passing, dribbling, ..." maxLength={40} />}</Field>
        <Field label="Upload a video" hint={drill?.video_path ? "A video is already uploaded. Choosing a new file replaces it." : "MP4, MOV or WebM. Keep it under 50 MB on the free Supabase plan."}>
          {(id) => <Input id={id} type="file" accept="video/mp4,video/quicktime,video/webm,video/x-m4v" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />}
        </Field>
        <Field label="…or a video link" hint="YouTube, Vimeo, etc.">{(id) => <Input id={id} type="url" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://" />}</Field>
      </form>
    </Modal>
  );
}

function AssignModal({ drill, onClose, onSaved }: { drill: DrillRow | null; onClose: () => void; onSaved: () => void }) {
  const players = useLoad(async () => drill
    ? unwrap(await supabase.from("players").select("id, first_name, age_group, parent:profiles(full_name)").eq("active", true).order("first_name"))
    : [], [drill?.id]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setSelected(new Set(drill?.player_drills.map((p) => p.player_id) ?? []));
    setNote("");
  }, [drill]);
  if (!drill) return null;

  async function save() {
    setBusy(true);
    try {
      const before = new Set(drill!.player_drills.map((p) => p.player_id));
      const add = [...selected].filter((id) => !before.has(id));
      const del = [...before].filter((id) => !selected.has(id));
      if (add.length) unwrap(await supabase.from("player_drills").insert(add.map((player_id) => ({ player_id, drill_id: drill!.id, coach_note: note.trim() || null }))).select());
      if (del.length) unwrap(await supabase.from("player_drills").delete().eq("drill_id", drill!.id).in("player_id", del).select());
      onSaved();
      onClose();
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title={`Assign "${drill.title}"`}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button loading={busy} onClick={save}>Save</Button></>}>
      {players.loading ? <Loading /> : (
        <div className="space-y-4">
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {(players.data ?? []).map((p) => (
              <Checkbox
                key={p.id}
                checked={selected.has(p.id)}
                onChange={(e) => setSelected((s) => { const n = new Set(s); e.target.checked ? n.add(p.id) : n.delete(p.id); return n; })}
                label={<><span className="font-semibold">{p.first_name}</span> <span className="text-gray-500">{p.age_group} · {p.parent?.full_name}</span></>}
              />
            ))}
          </div>
          <Field label="Note for newly assigned players (optional)">{(id) => <Input id={id} value={note} onChange={(e) => setNote(e.target.value)} placeholder="e.g. 10 minutes before every practice" />}</Field>
        </div>
      )}
    </Modal>
  );
}
