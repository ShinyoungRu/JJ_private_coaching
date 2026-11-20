import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router";
import { Alert, Button, Card, Field, Input, Loading } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";

export default function ResetPassword() {
  const { session, loading } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (loading) return <Loading />;

  if (!session) {
    return (
      <div className="mx-auto max-w-md">
        <Card>
          <h1 className="text-xl font-bold text-white">This link has expired</h1>
          <p className="mt-2 text-sm text-gray-400">Password reset links work once and expire after an hour.</p>
          <Link to="/login?mode=forgot" className="mt-5 inline-block font-semibold text-brand-soft hover:underline">Send a new link →</Link>
        </Card>
      </div>
    );
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) return setError("The passwords don't match.");
    if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
      return setError("Use at least 8 characters with letters and numbers.");
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      navigate("/", { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-white">Choose a new password</h1>
        <form onSubmit={submit} className="mt-6 space-y-4">
          {error && <Alert tone="error">{error}</Alert>}
          <Field label="New password" hint="At least 8 characters, letters and numbers.">
            {(id) => <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required />}
          </Field>
          <Field label="Confirm new password">
            {(id) => <Input id={id} type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" required />}
          </Field>
          <Button type="submit" size="lg" className="w-full" loading={busy}>Save password</Button>
        </form>
      </Card>
    </div>
  );
}
