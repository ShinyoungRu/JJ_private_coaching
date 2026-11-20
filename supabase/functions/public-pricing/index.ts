// GET /functions/v1/public-pricing
//
// Public, no login. Active session types and packages with prices, for the
// marketing website. CORS: PUBLIC_SITE_ORIGINS.
import { adminClient, loadSettings } from "../_shared/clients.ts";
import { appUrl, publicSiteOrigins } from "../_shared/env.ts";
import { corsHeaders, errorResponse, HttpError, json } from "../_shared/http.ts";
import { formatMoney } from "../_shared/templates.ts";

Deno.serve(async (req) => {
  const cors = corsHeaders(req, publicSiteOrigins());
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET.");
    const admin = adminClient();
    const settings = await loadSettings(admin);
    const base = appUrl();

    const [types, packages] = await Promise.all([
      admin.from("session_types")
        .select("id, name, description, duration_minutes, price_cents, max_players")
        .eq("active", true)
        .order("sort_order").order("name"),
      admin.from("packages")
        .select("id, name, description, session_count, price_cents, validity_days, session_type_id")
        .eq("active", true)
        .order("sort_order").order("price_cents"),
    ]);
    if (types.error || packages.error) {
      console.error("pricing query failed:", types.error || packages.error);
      throw new HttpError(500, "server_error", "Could not load pricing.");
    }

    const typeNames = new Map((types.data ?? []).map((t) => [t.id, t.name]));

    return json({
      currency: settings.currency,
      session_types: (types.data ?? []).map((t) => ({
        ...t,
        price_display: formatMoney(t.price_cents, settings.currency),
        book_url: `${base}/book?type=${t.id}`,
      })),
      packages: (packages.data ?? []).map((p) => ({
        ...p,
        session_type_name: p.session_type_id ? typeNames.get(p.session_type_id) ?? null : null,
        price_display: formatMoney(p.price_cents, settings.currency),
        per_session_display: formatMoney(Math.round(p.price_cents / p.session_count), settings.currency),
        buy_url: `${base}/packages`,
      })),
    }, 200, { ...cors, "Cache-Control": "public, max-age=300, s-maxage=300" });
  } catch (err) {
    return errorResponse(err, cors);
  }
});
