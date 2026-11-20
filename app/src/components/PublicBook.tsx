import { useState } from "react";
import { Link } from "react-router";
import { publicGet } from "../lib/api";
import type { PublicPricing, PublicSlot } from "../lib/types";
import { useLoad } from "../lib/useLoad";
import { Alert, buttonClasses, Card, cx, Loading } from "./ui";

/**
 * Logged-out booking preview, built only from the public endpoints (no
 * personal data). Used on /book when logged out and on /embed/book (iframe).
 * In the embed, every link opens in a new tab, because login and Stripe
 * can't run inside a cross-site iframe.
 */
export function PublicBook({ initialType, embed = false }: { initialType?: string | null; embed?: boolean }) {
  const pricing = useLoad(() => publicGet<PublicPricing>("public-pricing"), []);
  const types = pricing.data?.session_types ?? [];
  const [typeId, setTypeId] = useState<string | null>(initialType ?? null);
  const activeType = types.find((t) => t.id === typeId) ?? types[0];

  const slots = useLoad(
    () =>
      activeType
        ? publicGet<{ timezone: string; slots: PublicSlot[] }>(`public-availability?limit=12&session_type_id=${activeType.id}`)
        : Promise.resolve({ timezone: "", slots: [] as PublicSlot[] }),
    [activeType?.id],
  );

  const target = embed ? { target: "_blank", rel: "noopener" } : {};
  const nextPath = `/book${activeType ? `?type=${activeType.id}` : ""}`;
  const loginHref = (mode: string) => `/login?mode=${mode}&next=${encodeURIComponent(nextPath)}`;

  if (pricing.loading) return <Loading />;
  if (pricing.error) return <Alert tone="error">Couldn't load sessions right now. Please try again shortly.</Alert>;

  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-2">
        {types.map((t) => (
          <button
            key={t.id}
            onClick={() => setTypeId(t.id)}
            className={cx(
              "rounded-2xl border p-5 text-left transition-colors",
              activeType?.id === t.id ? "border-brand bg-brand/10" : "border-line bg-panel hover:border-gray-500",
            )}
          >
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-lg font-bold text-white">{t.name}</span>
              <span className="font-bold text-white">{t.price_display}</span>
            </div>
            <div className="mt-1 text-sm text-gray-400">
              {t.duration_minutes} min{t.max_players > 1 ? ` · up to ${t.max_players} players` : " · private"}
            </div>
            {t.description && <p className="mt-2 text-sm text-gray-300">{t.description}</p>}
          </button>
        ))}
      </div>

      <Card>
        <h2 className="text-lg font-semibold text-white">Next open times{activeType ? `: ${activeType.name}` : ""}</h2>
        {slots.loading ? (
          <Loading />
        ) : slots.data && slots.data.slots.length > 0 ? (
          <ul className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {slots.data.slots.map((s) => (
              <li key={s.start}>
                <a
                  href={loginHref("signin")}
                  {...target}
                  className="flex items-center justify-between rounded-xl border border-line bg-ink-deep/60 px-4 py-3 text-sm font-semibold text-gray-100 transition-colors hover:border-brand-soft"
                >
                  <span>{s.display_date} · {s.display_time}</span>
                  <span className="text-brand-soft">Book →</span>
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-gray-400">No open times right now. Check back soon!</p>
        )}
        <div className="mt-6 flex flex-col gap-3 rounded-xl border border-line bg-ink-deep/60 p-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-gray-300">Log in or create a free parent account to pick a time and book.</p>
          <div className="flex gap-2">
            {embed ? (
              <>
                <a href={loginHref("signin")} {...target} className={buttonClasses("secondary")}>Log in</a>
                <a href={loginHref("signup")} {...target} className={buttonClasses()}>Create account</a>
              </>
            ) : (
              <>
                <Link to={loginHref("signin")} className={buttonClasses("secondary")}>Log in</Link>
                <Link to={loginHref("signup")} className={buttonClasses()}>Create account</Link>
              </>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}
