import { type FormEvent, useEffect, useState } from "react";
import { Alert, Button, Card, Checkbox, Field, Input, PageHeader, useToast } from "../components/ui";
import { errorMessage, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function Account() {
  const { profile, session, refresh } = useAuth();
  const toast = useToast();
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  const [optIn, setOptIn] = useState(true);
  const [saving, setSaving] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<{ tone: "success" | "error"; text: string } | null>(null);

  useEffect(() => {
    setFullName(profile?.full_name ?? "");
    setPhone(profile?.phone ?? "");
    setOptIn(profile?.announcements_opt_in ?? true);
  }, [profile]);

  async function saveProfile(e: FormEvent) {
    e.preventDefault();
    if (!profile) return;
    setSaving(true);
    try {
      unwrap(await supabase.from("profiles").update({ full_name: fullName.trim() || null, phone: phone.trim() || null, announcements_opt_in: optIn }).eq("id", profile.id).select().single());
      await refresh();
      toast("Saved");
    } catch (err) {
      toast(errorMessage(err), "error");
    } finally {
      setSaving(false);
    }
  }

  async function changeEmail(e: FormEvent) {
    e.preventDefault();
    const { error } = await supabase.auth.updateUser({ email }, { emailRedirectTo: `${window.location.origin}/account` });
    setMsg(error ? { tone: "error", text: error.message } : { tone: "success", text: `Confirm the change from the emails sent to your old and new address (${email}).` });
    if (!error) setEmail("");
  }

  async function changePassword(e: FormEvent) {
    e.preventDefault();
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return setMsg({ tone: "error", text: "Use at least 8 characters with letters and numbers." });
    }
    const { error } = await supabase.auth.updateUser({ password });
    setMsg(error ? { tone: "error", text: error.message } : { tone: "success", text: "Password updated." });
    if (!error) setPassword("");
  }

  return (
    <div className="mx-auto max-w-2xl">
      <PageHeader title="Account" subtitle={session?.user.email} />
      <div className="space-y-6">
        <Card>
          <form onSubmit={saveProfile} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Your details</h2>
            <Field label="Name">{(id) => <Input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} maxLength={120} autoComplete="name" />}</Field>
            <Field label="Phone">{(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={30} autoComplete="tel" />}</Field>
            <Checkbox
              checked={optIn}
              onChange={(e) => setOptIn(e.target.checked)}
              label={<>Email me announcements from the coach <span className="block text-xs text-gray-500">Booking confirmations, reminders and same-day changes to your sessions are always sent.</span></>}
            />
            <Button type="submit" loading={saving}>Save</Button>
          </form>
        </Card>

        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}

        <Card>
          <form onSubmit={changeEmail} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Change email</h2>
            <Field label="New email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />}</Field>
            <Button type="submit" variant="secondary">Send confirmation</Button>
          </form>
        </Card>

        <Card>
          <form onSubmit={changePassword} className="space-y-4">
            <h2 className="text-lg font-semibold text-white">Change password</h2>
            <Field label="New password" hint="At least 8 characters, letters and numbers.">
              {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />}
            </Field>
            <Button type="submit" variant="secondary">Update password</Button>
          </form>
        </Card>
      </div>
    </div>
  );
}
