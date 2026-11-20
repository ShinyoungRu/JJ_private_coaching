// POST /functions/v1/send-reminders   (pg_cron every 15 minutes)
//
// Auth: header x-cron-secret must equal the CRON_SECRET env var (the cron
// job reads the same value from Vault). Sends one reminder per booking,
// reminder_hours_before (default 24) hours ahead. Also releases expired holds.
import { adminClient, loadSettings } from "../_shared/clients.ts";
import { sendEmail } from "../_shared/email.ts";
import { env } from "../_shared/env.ts";
import { json, safeEqual } from "../_shared/http.ts";
import { reminderEmail } from "../_shared/templates.ts";

interface DueReminder {
  booking_id: string;
  start_time: string;
  end_time: string;
  parent_email: string | null;
  parent_name: string | null;
  player_first_name: string;
  session_type_name: string;
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  const provided = req.headers.get("x-cron-secret") || "";
  if (!provided || !safeEqual(provided, env("CRON_SECRET"))) {
    return json({ error: "unauthorized" }, 401);
  }

  const admin = adminClient();
  const settings = await loadSettings(admin);

  const { data: released } = await admin.rpc("release_expired_holds");

  let sent = 0;
  let failed = 0;
  // Up to 4 batches of 50 per run; the next run picks up anything left.
  for (let batch = 0; batch < 4; batch++) {
    const { data, error } = await admin.rpc("claim_due_reminders", { p_limit: 50 });
    if (error) {
      console.error("claim_due_reminders failed:", error);
      return json({ error: "claim_failed" }, 500);
    }
    const due = (data ?? []) as DueReminder[];
    if (due.length === 0) break;

    const failedIds: string[] = [];
    for (const r of due) {
      if (!r.parent_email) continue;
      try {
        await sendEmail(
          reminderEmail({
            parentEmail: r.parent_email,
            parentName: r.parent_name,
            playerFirstName: r.player_first_name,
            sessionTypeName: r.session_type_name,
            startTime: r.start_time,
            endTime: r.end_time,
            timezone: settings.timezone,
          }),
          `reminder-${r.booking_id}-${r.start_time}`,
        );
        sent++;
      } catch (e) {
        console.error(`Reminder for ${r.booking_id} failed:`, e);
        failedIds.push(r.booking_id);
        failed++;
      }
    }
    if (failedIds.length) {
      await admin.rpc("unclaim_reminders", { p_booking_ids: failedIds });
      break; // don't hammer a failing email provider; retry next run
    }
    if (due.length < 50) break;
  }

  return json({ ok: true, reminders_sent: sent, reminders_failed: failed, holds_released: released ?? 0 });
});
