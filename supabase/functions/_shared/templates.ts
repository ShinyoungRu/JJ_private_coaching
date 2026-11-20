// Branded email templates (dark header like jjprivatetraining.com, Inter
// font with safe fallbacks, blue primary button). Inline styles + tables
// because email clients ignore <style> blocks.
import { appUrl, optionalEnv } from "./env.ts";
import type { EmailMessage } from "./email.ts";

const BRAND = {
  dark: "#1a1a1a",
  primary: "#2563eb",
  text: "#1f2937",
  muted: "#6b7280",
  border: "#e5e7eb",
  bg: "#f3f4f6",
  font: "Inter, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif",
};

function logoUrl(): string {
  return optionalEnv(
    "EMAIL_LOGO_URL",
    "https://horizons-cdn.hostinger.com/15d30f89-ee6f-40af-a967-2464869fd5b6/4f227aae71add9c639ba8f483f5edf44.png",
  );
}

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Plain text -> safe HTML paragraphs. */
export function textToHtml(s: string): string {
  return s
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px">${escapeHtml(p).replace(/\n/g, "<br>")}</p>`)
    .join("");
}

export function formatWhen(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso));
}

export function formatTime(iso: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function formatMoney(cents: number, currency = "usd"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

interface LayoutOpts {
  heading: string;
  bodyHtml: string;
  cta?: { label: string; url: string };
  footerNote?: string;
}

function layout({ heading, bodyHtml, cta, footerNote }: LayoutOpts): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:24px 0 8px"><tr><td style="border-radius:8px;background:${BRAND.primary}">
         <a href="${escapeHtml(cta.url)}" style="display:inline-block;padding:12px 22px;font-family:${BRAND.font};font-size:15px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:8px">${escapeHtml(cta.label)}</a>
       </td></tr></table>`
    : "";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(heading)}</title></head>
<body style="margin:0;padding:0;background:${BRAND.bg}">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.bg}"><tr><td align="center" style="padding:24px 12px">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid ${BRAND.border}">
    <tr><td style="background:${BRAND.dark};padding:20px 28px">
      <table role="presentation" cellpadding="0" cellspacing="0"><tr>
        <td style="vertical-align:middle"><img src="${escapeHtml(logoUrl())}" alt="JJ Private Training" height="44" style="display:block;height:44px;width:auto;border:0"></td>
        <td style="vertical-align:middle;padding-left:12px;font-family:${BRAND.font}">
          <div style="color:#ffffff;font-size:15px;font-weight:700;line-height:1.1">Private Training, Co.</div>
          <div style="color:#60a5fa;font-size:13px;font-weight:700;line-height:1.1;margin-top:3px">Elite Soccer Training</div>
        </td>
      </tr></table>
    </td></tr>
    <tr><td style="padding:28px;font-family:${BRAND.font};font-size:15px;line-height:1.6;color:${BRAND.text}">
      <h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;color:${BRAND.dark}">${escapeHtml(heading)}</h1>
      ${bodyHtml}
      ${button}
    </td></tr>
    <tr><td style="padding:18px 28px;border-top:1px solid ${BRAND.border};font-family:${BRAND.font};font-size:12px;line-height:1.5;color:${BRAND.muted}">
      ${footerNote ? `${escapeHtml(footerNote)}<br>` : ""}
      JJ Private Training, Co. &middot; <a href="https://www.jjprivatetraining.com" style="color:${BRAND.muted}">jjprivatetraining.com</a>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

function detailsTable(rows: Array<[string, string]>): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="width:100%;margin:8px 0 8px;border:1px solid ${BRAND.border};border-radius:8px">
    ${
    rows.map(([k, v]) =>
      `<tr><td style="padding:10px 14px;color:${BRAND.muted};font-size:13px;width:38%;border-bottom:1px solid ${BRAND.border}">${escapeHtml(k)}</td>
           <td style="padding:10px 14px;font-weight:600;border-bottom:1px solid ${BRAND.border}">${escapeHtml(v)}</td></tr>`
    ).join("")
  }
  </table>`;
}

function detailsText(rows: Array<[string, string]>): string {
  return rows.map(([k, v]) => `${k}: ${v}`).join("\n");
}

// ---------------------------------------------------------------------------
// Booking-related emails
// ---------------------------------------------------------------------------
export interface BookingEmailData {
  bookingId: string;
  parentEmail: string;
  parentName: string | null;
  playerFirstName: string;
  sessionTypeName: string;
  startTime: string;
  endTime: string;
  paidWith: "stripe" | "package" | "manual";
  priceCents: number | null;
  parentNote: string | null;
  timezone: string;
  currency: string;
  cancellationWindowHours: number;
}

function greeting(name: string | null): string {
  const first = (name || "").trim().split(/\s+/)[0];
  return first ? `Hi ${first},` : "Hi,";
}

function paymentLabel(d: BookingEmailData): string {
  if (d.paidWith === "package") return "Package credit";
  if (d.paidWith === "stripe") return d.priceCents != null ? `Paid ${formatMoney(d.priceCents, d.currency)} by card` : "Paid by card";
  return "Arranged with coach";
}

function bookingRows(d: BookingEmailData): Array<[string, string]> {
  return [
    ["Player", d.playerFirstName],
    ["Session", d.sessionTypeName],
    ["When", formatWhen(d.startTime, d.timezone)],
    ["Ends", formatTime(d.endTime, d.timezone)],
    ["Payment", paymentLabel(d)],
  ];
}

export function bookingConfirmedEmail(d: BookingEmailData): EmailMessage {
  const rows = bookingRows(d);
  const policy = `Need to change plans? You can cancel or reschedule in the app up to ${d.cancellationWindowHours} hours before the session. ` +
    `Later than that, the session is forfeited${d.paidWith === "package" ? " and the package credit is not returned" : ""}.`;
  return {
    to: d.parentEmail,
    subject: `Booked: ${d.playerFirstName} - ${formatWhen(d.startTime, d.timezone)}`,
    html: layout({
      heading: "Your session is booked",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">You're all set. Here are the details:</p>
        ${detailsTable(rows)}
        <p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px">${escapeHtml(policy)}</p>`,
      cta: { label: "View my bookings", url: `${appUrl()}/bookings` },
    }),
    text: `${greeting(d.parentName)}\n\nYour session is booked.\n\n${detailsText(rows)}\n\n${policy}\n\nManage bookings: ${appUrl()}/bookings`,
  };
}

export type CancelOutcome =
  | "credit_returned"
  | "session_credit"
  | "stripe_refund"
  | "refund_pending"
  | "forfeited"
  | "none";

export function bookingCancelledEmail(d: BookingEmailData, outcome: CancelOutcome, byCoach: boolean, reason?: string | null): EmailMessage {
  const outcomeText: Record<CancelOutcome, string> = {
    credit_returned: "Your package credit has been returned to your account.",
    session_credit: "A 1-session credit has been added to your account. You can use it for your next booking.",
    stripe_refund: `A refund of ${d.priceCents != null ? formatMoney(d.priceCents, d.currency) : "your payment"} has been issued to your card. It usually appears in 5-10 business days.`,
    refund_pending: "Your refund is being processed. The coach will follow up if anything else is needed.",
    forfeited: `This cancellation was within ${d.cancellationWindowHours} hours of the session, so per the cancellation policy the session is forfeited.`,
    none: "",
  };
  const rows = bookingRows(d).filter(([k]) => k !== "Payment");
  const lead = byCoach
    ? "Unfortunately we had to cancel the following session. Sorry for the inconvenience!"
    : "Your session has been cancelled.";
  const reasonLine = byCoach && reason ? `Reason: ${reason}` : "";
  return {
    to: d.parentEmail,
    subject: `Cancelled: ${d.playerFirstName} - ${formatWhen(d.startTime, d.timezone)}`,
    html: layout({
      heading: "Session cancelled",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">${escapeHtml(lead)}</p>
        ${detailsTable(rows)}
        ${reasonLine ? `<p style="margin:16px 0 0">${escapeHtml(reasonLine)}</p>` : ""}
        ${outcomeText[outcome] ? `<p style="margin:16px 0 0">${escapeHtml(outcomeText[outcome])}</p>` : ""}`,
      cta: { label: "Book another session", url: `${appUrl()}/book` },
    }),
    text: `${greeting(d.parentName)}\n\n${lead}\n\n${detailsText(rows)}\n${reasonLine ? `\n${reasonLine}\n` : ""}\n${outcomeText[outcome]}\n\nBook again: ${appUrl()}/book`,
  };
}

export function bookingRescheduledEmail(d: BookingEmailData, oldStart: string): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Player", d.playerFirstName],
    ["Session", d.sessionTypeName],
    ["New time", formatWhen(d.startTime, d.timezone)],
    ["Previous time", formatWhen(oldStart, d.timezone)],
  ];
  return {
    to: d.parentEmail,
    subject: `Rescheduled: ${d.playerFirstName} - ${formatWhen(d.startTime, d.timezone)}`,
    html: layout({
      heading: "Session rescheduled",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">Your session has a new time:</p>${detailsTable(rows)}`,
      cta: { label: "View my bookings", url: `${appUrl()}/bookings` },
    }),
    text: `${greeting(d.parentName)}\n\nYour session has a new time.\n\n${detailsText(rows)}\n\n${appUrl()}/bookings`,
  };
}

export function reminderEmail(d: {
  parentEmail: string;
  parentName: string | null;
  playerFirstName: string;
  sessionTypeName: string;
  startTime: string;
  endTime: string;
  timezone: string;
}): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Player", d.playerFirstName],
    ["Session", d.sessionTypeName],
    ["When", formatWhen(d.startTime, d.timezone)],
    ["Ends", formatTime(d.endTime, d.timezone)],
  ];
  const tips = "Bring a ball, water, shin guards and cleats. See you on the field!";
  return {
    to: d.parentEmail,
    subject: `Reminder: ${d.playerFirstName}'s session ${formatWhen(d.startTime, d.timezone)}`,
    html: layout({
      heading: "Session reminder",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">Just a reminder about the upcoming session:</p>
        ${detailsTable(rows)}
        <p style="margin:16px 0 0">${escapeHtml(tips)}</p>`,
      cta: { label: "View or manage booking", url: `${appUrl()}/bookings` },
    }),
    text: `${greeting(d.parentName)}\n\nReminder about the upcoming session:\n\n${detailsText(rows)}\n\n${tips}\n\n${appUrl()}/bookings`,
  };
}

export function paidButSlotTakenEmail(d: BookingEmailData): EmailMessage {
  const rows = bookingRows(d).filter(([k]) => k !== "Payment");
  const msg = "Your payment went through, but the checkout took longer than the slot could be held and the time was booked by someone else. " +
    "We've refunded you in full automatically. Sorry about that! Please pick another time.";
  return {
    to: d.parentEmail,
    subject: "Your payment was refunded: time slot no longer available",
    html: layout({
      heading: "That time slot was taken",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">${escapeHtml(msg)}</p>${detailsTable(rows)}`,
      cta: { label: "Pick another time", url: `${appUrl()}/book` },
    }),
    text: `${greeting(d.parentName)}\n\n${msg}\n\n${detailsText(rows)}\n\n${appUrl()}/book`,
  };
}

export function packagePurchasedEmail(d: {
  parentEmail: string;
  parentName: string | null;
  label: string;
  sessions: number;
  amountCents: number;
  currency: string;
  expiresAt: string | null;
  timezone: string;
}): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Package", d.label],
    ["Sessions", String(d.sessions)],
    ["Paid", formatMoney(d.amountCents, d.currency)],
    ["Valid until", d.expiresAt ? formatWhen(d.expiresAt, d.timezone).replace(/ at .*/, "") : "No expiry"],
  ];
  return {
    to: d.parentEmail,
    subject: `Package confirmed: ${d.label}`,
    html: layout({
      heading: "Thanks for your purchase!",
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(d.parentName))}</p>
        <p style="margin:0 0 16px">Your session credits are ready to use.</p>${detailsTable(rows)}`,
      cta: { label: "Book a session", url: `${appUrl()}/book` },
    }),
    text: `${greeting(d.parentName)}\n\nYour session credits are ready to use.\n\n${detailsText(rows)}\n\nBook: ${appUrl()}/book`,
  };
}

export function announcementEmail(to: string, name: string | null, subject: string, message: string, isOptOutable: boolean): EmailMessage {
  const footer = isOptOutable ? "You can turn off announcement emails in your account settings in the app." : undefined;
  return {
    to,
    subject,
    html: layout({
      heading: subject,
      bodyHtml: `<p style="margin:0 0 16px">${escapeHtml(greeting(name))}</p>${textToHtml(message)}`,
      cta: { label: "Open the app", url: appUrl() },
      footerNote: footer,
    }),
    text: `${greeting(name)}\n\n${message}\n\n${appUrl()}${footer ? `\n\n${footer}` : ""}`,
  };
}

// ---------------------------------------------------------------------------
// Coach notifications (short, operational)
// ---------------------------------------------------------------------------
export function coachNotice(to: string, subject: string, lines: string[], cta?: { label: string; url: string }): EmailMessage {
  return {
    to,
    subject,
    html: layout({
      heading: subject,
      bodyHtml: lines.map((l) => `<p style="margin:0 0 10px">${escapeHtml(l)}</p>`).join(""),
      cta,
    }),
    text: `${lines.join("\n")}${cta ? `\n\n${cta.url}` : ""}`,
  };
}

export function coachInquiryEmail(to: string, inq: { name: string; email: string; phone: string | null; message: string }): EmailMessage {
  const rows: Array<[string, string]> = [
    ["Name", inq.name],
    ["Email", inq.email],
    ["Phone", inq.phone || "-"],
  ];
  return {
    to,
    replyTo: inq.email,
    subject: `New website inquiry from ${inq.name}`,
    html: layout({
      heading: "New website inquiry",
      bodyHtml: `${detailsTable(rows)}<div style="margin-top:16px;padding:14px;background:${BRAND.bg};border-radius:8px">${textToHtml(inq.message)}</div>
        <p style="margin:16px 0 0;color:${BRAND.muted};font-size:13px">Reply to this email to answer ${escapeHtml(inq.name)} directly.</p>`,
      cta: { label: "Open inquiries", url: `${appUrl()}/admin/inquiries` },
    }),
    text: `New website inquiry\n\n${detailsText(rows)}\n\n${inq.message}\n\nReply to this email to answer directly.`,
  };
}
