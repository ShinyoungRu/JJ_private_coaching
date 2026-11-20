// GET /functions/v1/public-availability?limit=5&session_type_id=<uuid>
//
// Public, no login. Next open session times for the marketing website (and the app's logged-out /book + /embed/book).
// Returns ONLY session type + date/time. Never names, players or bookings.
// CORS: PUBLIC_SITE_ORIGINS (default https://www.jjprivatetraining.com and
// https://jjprivatetraining.com).
import { adminClient, loadSettings } from "../_shared/clients.ts";
import { appUrl, publicSiteOrigins } from "../_shared/env.ts";
import { clientIp, corsHeaders, errorResponse, HttpError, json, sha256Hex } from "../_shared/http.ts";
import { optionalEnv } from "../_shared/env.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = corsHeaders(req, publicSiteOrigins());
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "GET") throw new HttpError(405, "method_not_allowed", "Use GET.");
    const admin = adminClient();

    const ipKey = await sha256Hex(optionalEnv("RATE_LIMIT_SALT", "jj") + clientIp(req));
    const { data: allowed } = await admin.rpc("check_rate_limit", {
      p_key: `public-availability:${ipKey}`,
      p_limit: 60,
      p_window_seconds: 60,
    });
    if (allowed === false) throw new HttpError(429, "rate_limited", "Too many requests. Please slow down.");

    const url = new URL(req.url);
    const limit = Math.min(Math.max(parseInt(url.searchParams.get("limit") || "5", 10) || 5, 1), 50);
    const typeParam = url.searchParams.get("session_type_id");
    const sessionTypeId = typeParam && UUID_RE.test(typeParam) ? typeParam : null;

    const settings = await loadSettings(admin);
    const { data, error } = await admin.rpc("public_next_slots", {
      p_limit: limit,
      p_session_type_id: sessionTypeId,
    });
    if (error) {
      console.error("public_next_slots failed:", error);
      throw new HttpError(500, "server_error", "Could not load availability.");
    }

    const dateFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone, weekday: "short", month: "short", day: "numeric",
    });
    const timeFmt = new Intl.DateTimeFormat("en-US", {
      timeZone: settings.timezone, hour: "numeric", minute: "2-digit",
    });
    const base = appUrl();

    const slots = (data ?? []).map((s: { session_type_id: string; session_type_name: string; slot_start: string; slot_end: string }) => ({
      session_type_id: s.session_type_id,
      session_type: s.session_type_name,
      start: s.slot_start,
      end: s.slot_end,
      display_date: dateFmt.format(new Date(s.slot_start)),
      display_time: timeFmt.format(new Date(s.slot_start)),
      book_url: `${base}/book?type=${s.session_type_id}`,
    }));

    return json(
      { timezone: settings.timezone, generated_at: new Date().toISOString(), slots },
      200,
      { ...cors, "Cache-Control": "public, max-age=60, s-maxage=60" },
    );
  } catch (err) {
    return errorResponse(err, cors);
  }
});
