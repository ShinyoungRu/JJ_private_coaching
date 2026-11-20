// POST /functions/v1/send-announcement   (coach only)
//
//   { "subject": "Field closed today", "message": "Plain text, blank line = new paragraph",
//     "audience": "all" | "today" | "this_week",   (default "all")
//     "dry_run": true }                              (optional: just count recipients)
//
// "all" respects each parent's announcements_opt_in. "today"/"this_week" go
// to parents with sessions in that window regardless, because they're about
// those sessions.
import { adminClient, requireCoach } from "../_shared/clients.ts";
import { sendBatch } from "../_shared/email.ts";
import { appOrigins } from "../_shared/env.ts";
import { cleanText, corsHeaders, dbError, errorResponse, HttpError, json, readJson } from "../_shared/http.ts";
import { announcementEmail } from "../_shared/templates.ts";

const AUDIENCES = ["all", "today", "this_week"] as const;
type Audience = typeof AUDIENCES[number];

Deno.serve(async (req) => {
  const cors = corsHeaders(req, appOrigins());
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    const admin = adminClient();
    const coach = await requireCoach(req, admin);
    const body = await readJson(req, 50_000);

    const subject = cleanText(body.subject, 150);
    const message = cleanText(body.message, 10_000);
    const audience = (body.audience ?? "all") as Audience;
    if (!subject) throw new HttpError(400, "invalid_input", "Subject is required.");
    if (!message) throw new HttpError(400, "invalid_input", "Message is required.");
    if (!AUDIENCES.includes(audience)) throw new HttpError(400, "invalid_input", "Unknown audience.");

    const { data: recipients, error } = await admin.rpc("announcement_recipients", { p_audience: audience });
    if (error) throw dbError(error);
    const list = (recipients ?? []) as Array<{ email: string; full_name: string | null }>;

    if (body.dry_run === true) {
      return json({ dry_run: true, audience, recipient_count: list.length }, 200, cors);
    }
    if (list.length === 0) {
      return json({ audience, recipient_count: 0, sent: 0, failed: 0 }, 200, cors);
    }

    // Guard against an accidental double click sending the same thing twice.
    const twoMinutesAgo = new Date(Date.now() - 2 * 60_000).toISOString();
    const { data: recent } = await admin
      .from("announcements")
      .select("id")
      .eq("subject", subject)
      .eq("body", message)
      .gte("created_at", twoMinutesAgo)
      .limit(1);
    if (recent && recent.length) {
      throw new HttpError(409, "duplicate_announcement", "This announcement was just sent.");
    }

    const { data: logRow, error: logErr } = await admin
      .from("announcements")
      .insert({ subject, body: message, audience, recipient_count: list.length, sent_by: coach.user.id })
      .select("id")
      .single();
    if (logErr) throw dbError(logErr);

    const messages = list.map((r) => announcementEmail(r.email, r.full_name, subject, message, audience === "all"));
    const { sent, failed } = await sendBatch(messages);

    return json({ announcement_id: logRow.id, audience, recipient_count: list.length, sent, failed }, 200, cors);
  } catch (err) {
    return errorResponse(err, cors);
  }
});
