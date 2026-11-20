// HTTP helpers: CORS, JSON responses, body parsing, error mapping.

export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function corsHeaders(req: Request, allowedOrigins: string[]): Record<string, string> {
  const headers: Record<string, string> = {
    "Vary": "Origin",
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
  };
  const origin = req.headers.get("Origin");
  if (origin && allowedOrigins.includes(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

/** True when the browser sent an Origin we don't allow. (No Origin = server-to-server.) */
export function isForeignOrigin(req: Request, allowedOrigins: string[]): boolean {
  const origin = req.headers.get("Origin");
  return !!origin && !allowedOrigins.includes(origin);
}

export function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...headers },
  });
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 20_000): Promise<T> {
  const text = await req.text();
  if (text.length > maxBytes) throw new HttpError(413, "payload_too_large", "Request body too large.");
  if (!text) return {} as T;
  try {
    const parsed = JSON.parse(text);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) throw new Error();
    return parsed as T;
  } catch {
    throw new HttpError(400, "invalid_json", "Request body must be a JSON object.");
  }
}

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@<>()[\]\\,;:"]+@[^\s@<>()[\]\\,;:"]+\.[a-z]{2,}$/i;

export function requireUuid(value: unknown, field: string): string {
  if (typeof value !== "string" || !UUID_RE.test(value)) {
    throw new HttpError(400, "invalid_input", `${field} must be a valid id.`);
  }
  return value;
}

export function requireDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    throw new HttpError(400, "invalid_input", `${field} must be an ISO date-time.`);
  }
  return new Date(value).toISOString();
}

/** Booking length in hours: omitted = 1. The database enforces the real limit (app_settings). */
export function optionalHours(value: unknown): number {
  if (value === undefined || value === null) return 1;
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 8) {
    throw new HttpError(400, "invalid_input", "hours must be a whole number from 1 to 8.");
  }
  return value;
}

export function cleanText(value: unknown, maxLen: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return null;
  // Strip control characters except newlines/tabs.
  // deno-lint-ignore no-control-regex
  const cleaned = value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "").trim();
  return cleaned ? cleaned.slice(0, maxLen) : null;
}

export function isEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// ---------------------------------------------------------------------------
// Error -> Response. Database errors raised by our SQL functions carry a
// machine-readable HINT (slot_unavailable, no_credits, ...) which becomes
// `code` for the frontend.
// ---------------------------------------------------------------------------
interface DbError {
  message?: string;
  code?: string;
  hint?: string | null;
  details?: string | null;
}

export function dbError(error: DbError): HttpError {
  const code = error.hint || "database_error";
  switch (error.code) {
    case "P0001":
      return new HttpError(409, code, error.message || "Request could not be completed.");
    case "42501":
      return new HttpError(403, code === "database_error" ? "forbidden" : code, error.message || "Not allowed.");
    case "22023":
    case "22P02":
      return new HttpError(400, code === "database_error" ? "invalid_input" : code, error.message || "Invalid input.");
    case "23P01":
    case "23505":
      return new HttpError(409, "slot_unavailable", "That time is no longer available. Please pick another slot.");
    default:
      console.error("Database error:", error);
      return new HttpError(500, "server_error", "Something went wrong. Please try again.");
  }
}

export function errorResponse(err: unknown, headers: Record<string, string>): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status, headers);
  }
  console.error("Unhandled error:", err);
  return json({ error: { code: "server_error", message: "Something went wrong. Please try again." } }, 500, headers);
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string, b: string): boolean {
  const enc = new TextEncoder();
  const ab = enc.encode(a);
  const bb = enc.encode(b);
  if (ab.length !== bb.length) return false;
  let diff = 0;
  for (let i = 0; i < ab.length; i++) diff |= ab[i] ^ bb[i];
  return diff === 0;
}

export async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Best-effort client IP (Supabase's gateway sets x-forwarded-for). */
export function clientIp(req: Request): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  return req.headers.get("cf-connecting-ip") || req.headers.get("x-real-ip") || "unknown";
}
