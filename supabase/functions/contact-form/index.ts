// POST /functions/v1/contact-form   (public, from the marketing website)
//
// Accepts JSON, application/x-www-form-urlencoded or multipart/form-data:
//   name, email, phone (optional), message
//   website  <- HONEYPOT: hidden field humans leave empty
//   _redirect (optional, form posts only): https URL on jjprivatetraining.com
//             to send the browser to afterwards (303)
//
// Spam protection: honeypot, Origin allow-list, per-IP + per-email + global
// rate limits (IPs are stored only as salted SHA-256 hashes).
// Saves to public.inquiries (service role) and emails the coach (Reply-To
// = the person who wrote in).
import { adminClient } from "../_shared/clients.ts";
import { coachEmail, sendSafely } from "../_shared/email.ts";
import { optionalEnv, publicSiteOrigins } from "../_shared/env.ts";
import {
  cleanText,
  clientIp,
  corsHeaders,
  errorResponse,
  HttpError,
  isEmail,
  isForeignOrigin,
  json,
  sha256Hex,
} from "../_shared/http.ts";
import { coachInquiryEmail } from "../_shared/templates.ts";

const LIMIT_PER_IP_PER_HOUR = 5;
const LIMIT_PER_EMAIL_PER_HOUR = 3;
const LIMIT_GLOBAL_PER_HOUR = 60;

async function readFields(req: Request): Promise<{ fields: Record<string, string>; isForm: boolean }> {
  const type = (req.headers.get("content-type") || "").toLowerCase();
  const raw = await req.text();
  if (raw.length > 20_000) throw new HttpError(413, "payload_too_large", "Message too long.");

  if (type.includes("application/json")) {
    try {
      const obj = JSON.parse(raw || "{}");
      const fields: Record<string, string> = {};
      for (const [k, v] of Object.entries(obj)) if (typeof v === "string") fields[k] = v;
      return { fields, isForm: false };
    } catch {
      throw new HttpError(400, "invalid_json", "Invalid JSON.");
    }
  }
  if (type.includes("application/x-www-form-urlencoded")) {
    return { fields: Object.fromEntries(new URLSearchParams(raw)), isForm: true };
  }
  if (type.includes("multipart/form-data")) {
    const form = await new Request("http://x", { method: "POST", headers: { "content-type": type }, body: raw }).formData();
    const fields: Record<string, string> = {};
    form.forEach((v, k) => {
      if (typeof v === "string") fields[k] = v;
    });
    return { fields, isForm: true };
  }
  throw new HttpError(415, "unsupported_media_type", "Send JSON or a regular form post.");
}

function safeRedirect(value: string | undefined, allowedOrigins: string[]): string | null {
  if (!value) return null;
  try {
    const u = new URL(value);
    return allowedOrigins.includes(u.origin) ? u.toString() : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  const origins = publicSiteOrigins();
  const cors = corsHeaders(req, origins);
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  try {
    if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST.");
    if (isForeignOrigin(req, origins)) throw new HttpError(403, "forbidden_origin", "Not allowed.");

    const { fields, isForm } = await readFields(req);
    const redirect = isForm ? safeRedirect(fields._redirect, origins) : null;
    const ok = () =>
      redirect
        ? new Response(null, { status: 303, headers: { ...cors, Location: redirect } })
        : json({ ok: true, message: "Thanks! We'll be in touch soon." }, 200, cors);

    // Honeypot: bots fill every field. Pretend success, store nothing.
    if ((fields.website || "").trim() !== "") {
      console.log("contact-form: honeypot triggered");
      return ok();
    }

    const name = cleanText(fields.name, 120);
    const email = cleanText(fields.email, 254)?.toLowerCase() ?? null;
    const phone = cleanText(fields.phone, 30);
    const message = cleanText(fields.message, 5000);
    if (!name) throw new HttpError(400, "invalid_input", "Please enter your name.");
    if (!email || !isEmail(email)) throw new HttpError(400, "invalid_input", "Please enter a valid email address.");
    if (phone && !/^[0-9+().\-\s]{7,30}$/.test(phone)) throw new HttpError(400, "invalid_input", "Please enter a valid phone number.");
    if (!message || message.length < 2) throw new HttpError(400, "invalid_input", "Please enter a message.");

    const admin = adminClient();
    const salt = optionalEnv("RATE_LIMIT_SALT", "jj");
    const ipHash = await sha256Hex(salt + clientIp(req));
    const emailHash = await sha256Hex(salt + email);

    const checks = await Promise.all([
      admin.rpc("check_rate_limit", { p_key: `contact:ip:${ipHash}`, p_limit: LIMIT_PER_IP_PER_HOUR, p_window_seconds: 3600 }),
      admin.rpc("check_rate_limit", { p_key: `contact:email:${emailHash}`, p_limit: LIMIT_PER_EMAIL_PER_HOUR, p_window_seconds: 3600 }),
      admin.rpc("check_rate_limit", { p_key: "contact:global", p_limit: LIMIT_GLOBAL_PER_HOUR, p_window_seconds: 3600 }),
    ]);
    if (checks.some((c) => c.error)) {
      console.error("rate limit check failed:", checks.map((c) => c.error));
      throw new HttpError(500, "server_error", "Please try again later.");
    }
    if (checks.some((c) => c.data === false)) {
      throw new HttpError(429, "rate_limited", "Too many messages. Please try again later or email us directly.");
    }

    const { error } = await admin.from("inquiries").insert({ name, email, phone, message });
    if (error) {
      console.error("inquiry insert failed:", error);
      throw new HttpError(500, "server_error", "Could not send your message. Please try again.");
    }

    const coach = coachEmail();
    if (coach) await sendSafely(coachInquiryEmail(coach, { name, email, phone, message }));

    return ok();
  } catch (err) {
    return errorResponse(err, cors);
  }
});
