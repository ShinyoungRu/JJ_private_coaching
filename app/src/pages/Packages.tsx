import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { Alert, Badge, Button, buttonClasses, Card, Loading, PageHeader, SectionTitle } from "../components/ui";
import { errorMessage, invoke, publicGet, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { fmtDate, fmtMoney } from "../lib/format";
import { supabase } from "../lib/supabase";
import type { PublicPricing } from "../lib/types";
import { useLoad } from "../lib/useLoad";

interface PackageView {
  id: string;
  name: string;
  description: string | null;
  session_count: number;
  price_cents: number;
  validity_days: number | null;
  session_type_name: string | null;
}

export default function Packages() {
  const { session, tz, settings } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [buying, setBuying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: "success" | "info"; text: string } | null>(null);

  const packages = useLoad<PackageView[]>(async () => {
    if (!session) return (await publicGet<PublicPricing>("public-pricing")).packages;
    const rows = unwrap(await supabase.from("packages").select("*, session_type:session_types(name)").eq("active", true).order("sort_order"));
    return rows.map((p) => ({ ...p, session_type_name: p.session_type?.name ?? null }));
  }, [session?.user.id]);

  const credits = useLoad(async () => {
    if (!session) return [];
    return unwrap(await supabase.from("package_purchases").select("*").order("purchased_at", { ascending: false }));
  }, [session?.user.id]);

  // Return from Stripe.
  useEffect(() => {
    const result = params.get("purchase");
    const sessionId = params.get("session_id");
    if (!result) return;
    if (result === "cancelled") setNotice({ tone: "info", text: "Checkout cancelled. You weren't charged." });
    if (result === "success" && sessionId) {
      setNotice({ tone: "info", text: "Payment received. Adding your credits..." });
      let tries = 0;
      const poll = async () => {
        const { data } = await supabase.from("package_purchases").select("label, sessions_total").eq("stripe_checkout_session_id", sessionId).maybeSingle();
        if (data) {
          setNotice({ tone: "success", text: `${data.label}: ${data.sessions_total} credits added. You're ready to book!` });
          credits.reload();
        } else if (++tries < 20) setTimeout(poll, 2000);
        else setNotice({ tone: "info", text: "Payment received. Your credits will appear shortly, and you'll get an email." });
      };
      poll();
    }
    setParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function buy(id: string) {
    if (!session) return navigate(`/login?mode=signup&next=${encodeURIComponent("/packages")}`);
    setBuying(id);
    setError(null);
    try {
      const { url } = await invoke<{ url: string }>("stripe-checkout", { kind: "package", package_id: id });
      (window.top ?? window).location.href = url;
    } catch (e) {
      setError(errorMessage(e));
      setBuying(null);
    }
  }

  const now = Date.now();
  const active = (credits.data ?? []).filter((c) => c.sessions_remaining > 0 && (!c.expires_at || new Date(c.expires_at).getTime() > now));
  const currency = settings?.currency ?? "usd";

  return (
    <>
      <PageHeader title="Session packages" subtitle="Buy sessions in advance and save. Credits are used automatically when you book." />
      {notice && <Alert tone={notice.tone} className="mb-6">{notice.text}</Alert>}
      {error && <Alert tone="error" className="mb-6">{error}</Alert>}

      {session && active.length > 0 && (
        <section className="mb-10">
          <SectionTitle>Your credits</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {active.map((c) => (
              <Card key={c.id} className="p-4">
                <div className="flex items-start justify-between gap-2">
                  <div className="font-semibold text-white">{c.label}</div>
                  <Badge tone="blue">{c.sessions_remaining} left</Badge>
                </div>
                <div className="mt-1 text-sm text-gray-400">
                  {c.sessions_remaining} of {c.sessions_total} remaining{c.expires_at ? ` · use by ${fmtDate(c.expires_at, tz)}` : ""}
                </div>
              </Card>
            ))}
          </div>
          <Link to="/book" className={buttonClasses("primary", "md", "mt-4")}>Book with a credit</Link>
        </section>
      )}

      <section>
        {session && active.length > 0 && <SectionTitle>Buy more</SectionTitle>}
        {packages.loading ? <Loading /> : packages.error ? <Alert tone="error">{packages.error}</Alert> : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {(packages.data ?? []).map((p) => (
              <Card key={p.id} className="flex flex-col">
                <h3 className="text-xl font-bold text-white">{p.name}</h3>
                {p.session_type_name && <div className="mt-1 text-sm text-brand-soft">{p.session_type_name}</div>}
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-4xl font-extrabold text-white">{fmtMoney(p.price_cents, currency)}</span>
                </div>
                <div className="mt-1 text-sm text-gray-400">
                  {p.session_count} sessions · {fmtMoney(Math.round(p.price_cents / p.session_count), currency)} each
                </div>
                {p.description && <p className="mt-3 text-sm text-gray-300">{p.description}</p>}
                {p.validity_days && <p className="mt-2 text-xs text-gray-500">Valid for {p.validity_days} days after purchase.</p>}
                <div className="mt-auto pt-6">
                  <Button className="w-full" loading={buying === p.id} disabled={!!buying} onClick={() => buy(p.id)}>
                    {session ? "Buy package" : "Sign up to buy"}
                  </Button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
