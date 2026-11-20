import { type FormEvent, useState } from "react";
import { Link, Navigate, useNavigate, useSearchParams } from "react-router";
import { Alert, Button, Card, cx, Field, Input, Segmented } from "../components/ui";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { supabase } from "../lib/supabase";
import type { ClientType } from "../lib/types";

type Mode = "signin" | "signup" | "magic" | "forgot";

/** Only allow in-app redirects (prevents open-redirects via ?next=). */
function safeNext(next: string | null): string {
  return next && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

export default function Login() {
  const [params] = useSearchParams();
  const next = safeNext(params.get("next"));
  const [mode, setMode] = useState<Mode>((params.get("mode") as Mode) || "signin");
  const { session, loading } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("");
  // ?account=adult preselects the adult option (handy for links from the website).
  const [accountType, setAccountType] = useState<ClientType>(params.get("account") === "adult" ? "adult" : "parent");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);

  if (!loading && session && !sent) return <Navigate to={next} replace />;

  const origin = window.location.origin;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (mode === "signin") {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate(next, { replace: true });
      } else if (mode === "signup") {
        if (password.length < 8 || !/[a-z]/i.test(password) || !/\d/.test(password)) {
          throw new Error("Use at least 8 characters with letters and numbers.");
        }
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName.trim(), phone: phone.trim(), account_type: accountType }, emailRedirectTo: `${origin}${next}` },
        });
        if (error) throw error;
        if (data.session) navigate(next, { replace: true });
        else setSent(`We sent a confirmation link to ${email}. Click it to finish creating your account.`);
      } else if (mode === "magic") {
        const { error } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: `${origin}${next}`, shouldCreateUser: false },
        });
        if (error) throw error;
        setSent(`Check ${email} for a sign-in link.`);
      } else {
        const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/reset-password` });
        if (error) throw error;
        setSent(`If an account exists for ${email}, a password reset link is on its way.`);
      }
    } catch (err) {
      const msg = errorMessage(err);
      setError(
        /invalid login credentials/i.test(msg) ? "That email and password don't match." :
        /email not confirmed/i.test(msg) ? "Please confirm your email first. Check your inbox for the link." :
        /signups not allowed for otp|user not found/i.test(msg) ? "No account with that email yet. Create one instead." :
        msg,
      );
    } finally {
      setBusy(false);
    }
  }

  const titles: Record<Mode, [string, string]> = {
    signin: ["Welcome back", "Log in to book sessions and follow your player's progress."],
    signup: ["Create an account", "Parents book for their kids. Athletes 18+ book for themselves. Either way, you can add more players later."],
    magic: ["Email me a sign-in link", "No password needed. We'll email you a one-time link."],
    forgot: ["Reset your password", "We'll email you a link to choose a new one."],
  };

  return (
    <div className="mx-auto max-w-md">
      <Card className="p-6 sm:p-8">
        <h1 className="text-2xl font-bold text-fg">{titles[mode][0]}</h1>
        <p className="mt-1.5 text-sm text-muted">{titles[mode][1]}</p>

        {(mode === "signin" || mode === "signup") && (
          <Segmented
            className="mt-6 w-full [&>button]:flex-1"
            value={mode}
            onChange={(m) => { setMode(m); setError(null); setSent(null); }}
            options={[{ value: "signin", label: "Log in" }, { value: "signup", label: "Sign up" }]}
          />
        )}

        {sent ? (
          <div className="mt-6 space-y-4">
            <Alert tone="success">{sent}</Alert>
            {import.meta.env.DEV && (
              <Alert tone="info">
                Local development: emails aren't really sent. Open the test inbox at{" "}
                <a href="http://127.0.0.1:54324" target="_blank" rel="noopener" className="font-semibold underline">127.0.0.1:54324</a>{" "}
                and click the link there.
              </Alert>
            )}
            <Button variant="secondary" className="w-full" onClick={() => { setSent(null); setMode("signin"); }}>Back to log in</Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 space-y-4">
            {error && <Alert tone="error">{error}</Alert>}
            {mode === "signup" && (
              <>
                <fieldset>
                  <legend className="mb-1.5 block text-sm font-medium text-fg-2">Who is the training for?</legend>
                  <div className="grid grid-cols-2 gap-2">
                    {([
                      ["parent", "My child or children", "Parent or guardian"],
                      ["adult", "Myself", "Athlete 18 or older"],
                    ] as const).map(([value, title, hint]) => (
                      <label
                        key={value}
                        className={cx(
                          "cursor-pointer rounded-xl border p-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/30",
                          accountType === value ? "border-brand bg-brand/10" : "border-line-strong bg-panel hover:border-faint",
                        )}
                      >
                        <input type="radio" name="account_type" value={value} checked={accountType === value}
                          onChange={() => setAccountType(value)} className="sr-only" />
                        <span className="block text-sm font-semibold text-fg">{title}</span>
                        <span className="mt-0.5 block text-xs text-muted">{hint}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <Field label="Your name" hint={accountType === "adult" ? "You'll be added as the athlete, using your first name." : undefined}>
                  {(id) => <Input id={id} value={fullName} onChange={(e) => setFullName(e.target.value)} autoComplete="name" required maxLength={120} />}
                </Field>
                <Field label="Phone (optional)" hint="So the coach can reach you about schedule changes.">
                  {(id) => <Input id={id} type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" maxLength={30} />}
                </Field>
              </>
            )}
            <Field label="Email">{(id) => <Input id={id} type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required />}</Field>
            {(mode === "signin" || mode === "signup") && (
              <Field label="Password" hint={mode === "signup" ? "At least 8 characters, letters and numbers." : undefined}>
                {(id) => (
                  <Input id={id} type="password" value={password} onChange={(e) => setPassword(e.target.value)}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"} required minLength={mode === "signup" ? 8 : undefined} />
                )}
              </Field>
            )}
            <Button type="submit" className="w-full" size="lg" loading={busy}>
              {{ signin: "Log in", signup: "Create account", magic: "Send link", forgot: "Send reset link" }[mode]}
            </Button>
          </form>
        )}

        <div className="mt-6 flex flex-col items-center gap-2 text-sm">
          {mode === "signin" && !sent && (
            <>
              <button className="font-semibold text-brand hover:underline" onClick={() => setMode("magic")}>Email me a sign-in link instead</button>
              <button className="text-muted hover:text-fg" onClick={() => setMode("forgot")}>Forgot password?</button>
            </>
          )}
          {(mode === "magic" || mode === "forgot") && !sent && (
            <button className="font-semibold text-brand hover:underline" onClick={() => setMode("signin")}>← Back to log in</button>
          )}
        </div>
      </Card>
      <p className="mt-6 text-center text-sm text-subtle">
        Just looking? <Link to="/book" className="font-semibold text-fg-2 hover:text-brand">See open times</Link>
      </p>
    </div>
  );
}
