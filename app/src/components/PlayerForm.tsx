import { type FormEvent, useEffect, useState } from "react";
import { errorMessage, unwrap } from "../lib/api";
import { supabase } from "../lib/supabase";
import { AGE_GROUPS, type Player, SKILL_LEVELS, type SkillLevel } from "../lib/types";
import { titleCase } from "../lib/format";
import { Alert, Button, Field, Input, Modal, Select, Textarea } from "./ui";

/**
 * Add / edit a player: a child, or the account holder themselves (is_self).
 * Only first name, age group, skill level and notes, by design.
 * `self` = adding the account holder as an athlete.
 */
export function PlayerFormModal({ open, onClose, player, onSaved, self = false }: {
  open: boolean;
  onClose: () => void;
  player?: Player | null;
  onSaved: (p: Player) => void;
  self?: boolean;
}) {
  const isSelf = player ? player.is_self : self;
  const [firstName, setFirstName] = useState("");
  const [ageGroup, setAgeGroup] = useState("");
  const [skill, setSkill] = useState<SkillLevel | "">("");
  const [notes, setNotes] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setFirstName(player?.first_name ?? "");
    setAgeGroup(player?.age_group ?? (self ? "Adult" : ""));
    setSkill(player?.skill_level ?? "");
    setNotes(player?.notes ?? "");
    setError(null);
  }, [open, player, self]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!firstName.trim()) return setError("Please enter a first name.");
    setSaving(true);
    setError(null);
    try {
      const values = {
        first_name: firstName.trim(),
        age_group: ageGroup || null,
        skill_level: (skill || null) as SkillLevel | null,
        notes: notes.trim() || null,
      };
      const saved = player
        ? unwrap(await supabase.from("players").update(values).eq("id", player.id).select().single())
        : unwrap(await supabase.from("players").insert({ ...values, is_self: self }).select().single());
      onSaved(saved);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={isSelf ? (player ? "Edit your athlete profile" : "Add yourself as an athlete") : player ? `Edit ${player.first_name}` : "Add a player"}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button type="submit" form="player-form" loading={saving}>{player ? "Save" : isSelf ? "Add me" : "Add player"}</Button>
        </>
      }
    >
      <form id="player-form" onSubmit={submit} className="space-y-4">
        {error && <Alert tone="error">{error}</Alert>}
        <Field label={isSelf ? "Your first name" : "First name"}>{(id) => <Input id={id} value={firstName} onChange={(e) => setFirstName(e.target.value)} maxLength={60} autoFocus required />}</Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Age group">
            {(id) => (
              <Select id={id} value={ageGroup} onChange={(e) => setAgeGroup(e.target.value)}>
                <option value="">Select...</option>
                {AGE_GROUPS.map((a) => <option key={a} value={a}>{a}</option>)}
              </Select>
            )}
          </Field>
          <Field label="Skill level">
            {(id) => (
              <Select id={id} value={skill} onChange={(e) => setSkill(e.target.value as SkillLevel | "")}>
                <option value="">Select...</option>
                {SKILL_LEVELS.map((s) => <option key={s} value={s}>{titleCase(s)}</option>)}
              </Select>
            )}
          </Field>
        </div>
        <Field label="Notes for the coach (optional)" hint="Position, goals, anything that helps. Please don't include medical or contact details.">
          {(id) => <Textarea id={id} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} rows={3} />}
        </Field>
      </form>
    </Modal>
  );
}
