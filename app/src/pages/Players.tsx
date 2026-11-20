import { useState } from "react";
import { PlayerFormModal } from "../components/PlayerForm";
import { Alert, Badge, Button, Card, Empty, Loading, Modal, PageHeader, useToast } from "../components/ui";
import { errorMessage, listMyPlayers, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtDateTime, titleCase } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { Drill, Player } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { NoteView } from "./MyBookings";

export default function Players() {
  const { tz, isAdultClient } = useAuth();
  const toast = useToast();
  // Player form: undefined = closed, "new" = add a player, "self" = add yourself, Player = edit.
  const [editing, setEditing] = useState<Player | "new" | "self" | undefined>(undefined);
  const [video, setVideo] = useState<{ title: string; url: string } | null>(null);

  const players = useLoad(listMyPlayers, []);
  const notes = useLoad(async () => unwrap(await supabase
    .from("session_notes")
    .select("*, booking:bookings(start_time, session_type:session_types(name))")
    .order("created_at", { ascending: false })), []);
  const drills = useLoad(async () => unwrap(await supabase
    .from("player_drills")
    .select("player_id, assigned_at, coach_note, drill:drills(*)")
    .order("assigned_at", { ascending: false })), []);

  async function archive(p: Player) {
    const msg = p.is_self
      ? "Remove yourself as an athlete? Your session history is kept."
      : `Remove ${p.first_name} from your account? Their session history is kept.`;
    if (!confirm(msg)) return;
    try {
      unwrap(await supabase.from("players").update({ active: false }).eq("id", p.id).select().single());
      toast(`${p.first_name} removed`);
      players.reload();
    } catch (e) {
      toast(errorMessage(e), "error");
    }
  }

  async function watch(d: Drill) {
    if (d.video_path) {
      const { data, error } = await supabase.storage.from("drill-videos").createSignedUrl(d.video_path, 3600);
      if (error || !data) return toast("Couldn't open the video.", "error");
      setVideo({ title: d.title, url: data.signedUrl });
    } else if (d.external_url) {
      window.open(d.external_url, "_blank", "noopener");
    }
  }

  if (players.loading) return <Loading />;
  if (players.error) return <Alert tone="error">{players.error}</Alert>;

  // Adults are the main athlete, so "Add myself" leads for them and "Add a player" for parents.
  const hasSelf = players.data!.some((p) => p.is_self);
  const addButtons = (
    <>
      {!hasSelf && <Button variant={isAdultClient ? "primary" : "secondary"} onClick={() => setEditing("self")}>+ Add myself</Button>}
      <Button variant={isAdultClient ? "secondary" : "primary"} onClick={() => setEditing("new")}>+ Add {isAdultClient ? "a child" : "a player"}</Button>
    </>
  );

  return (
    <>
      <PageHeader
        title="Players"
        subtitle={isAdultClient
          ? "You and anyone else you book for, with the coach's session notes and assigned drills."
          : "Your kids, the coach's session notes, and their assigned drills."}
        actions={addButtons}
      />

      {players.data!.length === 0 ? (
        <Empty
          title="No players yet"
          action={<div className="flex flex-wrap justify-center gap-2">{addButtons}</div>}
        >
          {isAdultClient
            ? "Add yourself to book your own sessions. You can add children too."
            : "Add each child you'd like to book sessions for. Just a first name, age group and level. Training yourself too? Add yourself."}
        </Empty>
      ) : (
        <div className="space-y-6">
          {players.data!.map((p) => {
            const pNotes = (notes.data ?? []).filter((n) => n.player_id === p.id);
            const pDrills = (drills.data ?? []).filter((d) => d.player_id === p.id && d.drill);
            return (
              <Card key={p.id}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <h2 className="flex items-center gap-2 text-xl font-bold text-fg">
                      {p.first_name}
                      {p.is_self && <Badge tone="blue">You</Badge>}
                    </h2>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {p.age_group && <Badge>{p.age_group}</Badge>}
                      {p.skill_level && <Badge tone="blue">{titleCase(p.skill_level)}</Badge>}
                    </div>
                    {p.notes && <p className="mt-2 text-sm text-muted">{p.notes}</p>}
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" size="sm" onClick={() => setEditing(p)}>Edit</Button>
                    <Button variant="ghost" size="sm" onClick={() => archive(p)}>Remove</Button>
                  </div>
                </div>

                <div className="mt-6 grid gap-6 lg:grid-cols-2">
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Assigned drills</h3>
                    {pDrills.length === 0 ? <p className="text-sm text-subtle">No drills assigned yet.</p> : (
                      <ul className="space-y-2">
                        {pDrills.map((pd) => (
                          <li key={pd.drill!.id} className="rounded-xl border border-line bg-ink-deep/60 p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <div className="font-semibold text-fg">{pd.drill!.title}</div>
                                {pd.drill!.skill_tag && <div className="text-xs text-brand">{pd.drill!.skill_tag}</div>}
                              </div>
                              {(pd.drill!.video_path || pd.drill!.external_url) && (
                                <Button size="sm" variant="outline" onClick={() => watch(pd.drill!)}>▶ Watch</Button>
                              )}
                            </div>
                            {pd.drill!.description && <p className="mt-1.5 text-sm text-fg-2">{pd.drill!.description}</p>}
                            {pd.coach_note && <p className="mt-1.5 text-sm text-muted">Coach: {pd.coach_note}</p>}
                            <p className="mt-1 text-xs text-muted">Assigned {fmtDate(pd.assigned_at, tz)}</p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                  <div>
                    <h3 className="mb-2 text-sm font-semibold uppercase tracking-wide text-muted">Session notes</h3>
                    {pNotes.length === 0 ? <p className="text-sm text-subtle">Notes appear here after each session.</p> : (
                      <div className="space-y-3">
                        {pNotes.slice(0, 5).map((n) => (
                          <div key={n.id}>
                            <div className="text-sm font-semibold text-fg-2">
                              {n.booking ? fmtDateTime(n.booking.start_time, tz) : fmtDate(n.created_at, tz)}
                              {n.booking?.session_type?.name && <span className="font-normal text-subtle"> · {n.booking.session_type.name}</span>}
                            </div>
                            <div className="-mt-2"><NoteView note={n} /></div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <PlayerFormModal
        open={editing !== undefined}
        player={typeof editing === "object" ? editing : null}
        self={editing === "self"}
        onClose={() => setEditing(undefined)}
        onSaved={(p) => { toast(p.is_self ? "Your athlete profile is saved" : `${p.first_name} saved`); players.reload(); }}
      />
      <Modal open={!!video} onClose={() => setVideo(null)} title={video?.title ?? ""} wide>
        {video && <video src={video.url} controls autoPlay playsInline className="w-full rounded-xl bg-black" />}
      </Modal>
    </>
  );
}
