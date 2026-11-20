// Email via Resend (https://resend.com/docs/api-reference/emails/send-email).
// Without RESEND_API_KEY (local dev) emails are logged instead of sent.
import { optionalEnv } from "./env.ts";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string;
}

function fromAddress(): string {
  return optionalEnv("EMAIL_FROM", "JJ Private Training <bookings@jjprivatetraining.com>");
}

function defaultReplyTo(): string | undefined {
  return optionalEnv("EMAIL_REPLY_TO") || undefined;
}

function toResend(m: EmailMessage) {
  const replyTo = m.replyTo || defaultReplyTo();
  return {
    from: fromAddress(),
    to: [m.to],
    subject: m.subject,
    html: m.html,
    text: m.text,
    ...(replyTo ? { reply_to: replyTo } : {}),
  };
}

export async function sendEmail(m: EmailMessage, idempotencyKey?: string): Promise<{ id: string | null; skipped?: boolean }> {
  const key = optionalEnv("RESEND_API_KEY");
  if (!key) {
    console.log(`[email:dry-run] to=${m.to} subject="${m.subject}"`);
    return { id: null, skipped: true };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey.slice(0, 256) } : {}),
    },
    body: JSON.stringify(toResend(m)),
  });
  if (!res.ok) throw new Error(`Resend error ${res.status}: ${await res.text()}`);
  const body = await res.json();
  return { id: body?.id ?? null };
}

/** Up to 100 individually-addressed emails per request (recipients never see each other). */
export async function sendBatch(messages: EmailMessage[]): Promise<{ sent: number; failed: number }> {
  let sent = 0;
  let failed = 0;
  const key = optionalEnv("RESEND_API_KEY");
  for (let i = 0; i < messages.length; i += 100) {
    const chunk = messages.slice(i, i + 100);
    if (!key) {
      chunk.forEach((m) => console.log(`[email:dry-run] to=${m.to} subject="${m.subject}"`));
      sent += chunk.length;
      continue;
    }
    const res = await fetch("https://api.resend.com/emails/batch", {
      method: "POST",
      headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
      body: JSON.stringify(chunk.map(toResend)),
    });
    if (res.ok) {
      sent += chunk.length;
    } else {
      console.error(`Resend batch error ${res.status}: ${await res.text()}`);
      failed += chunk.length;
    }
  }
  return { sent, failed };
}

/** Sends and swallows errors (a failed email must not undo a booking). */
export async function sendSafely(m: EmailMessage | null, idempotencyKey?: string): Promise<boolean> {
  if (!m || !m.to) return false;
  try {
    await sendEmail(m, idempotencyKey);
    return true;
  } catch (e) {
    console.error(`Email to ${m.to} failed:`, e);
    return false;
  }
}

export function coachEmail(): string {
  return optionalEnv("COACH_NOTIFICATION_EMAIL");
}
