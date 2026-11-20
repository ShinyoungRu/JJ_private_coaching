// Supabase + Stripe clients and the "who is calling" check.
import { createClient, Stripe, type SupabaseClient, type User } from "./deps.ts";
import { env, optionalEnv } from "./env.ts";
import { HttpError } from "./http.ts";

export type Admin = SupabaseClient;

/**
 * The server-side key. Supabase injects SUPABASE_SERVICE_ROLE_KEY (legacy
 * keys) and/or SUPABASE_SECRET_KEYS (new sb_secret_ keys, JSON map). As a last
 * resort you can set your own secret named SERVICE_ROLE_KEY.
 */
function serverKey(): string {
  const legacy = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
  if (legacy) return legacy;
  const keys = optionalEnv("SUPABASE_SECRET_KEYS");
  if (keys) {
    try {
      const parsed = JSON.parse(keys) as Record<string, string>;
      const first = parsed.default ?? Object.values(parsed)[0];
      if (first) return first;
    } catch { /* fall through */ }
  }
  return env("SERVICE_ROLE_KEY");
}

/** Service-role client. Bypasses RLS, so use only after checking the caller. */
export function adminClient(): Admin {
  return createClient(env("SUPABASE_URL"), serverKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export interface Caller {
  user: User;
  role: "coach" | "client";
  email: string;
  fullName: string | null;
}

/** Verifies the Supabase access token in the Authorization header. */
export async function requireUser(req: Request, admin: Admin): Promise<Caller> {
  const header = req.headers.get("Authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : "";
  if (!token) throw new HttpError(401, "unauthorized", "Please log in.");

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data?.user) throw new HttpError(401, "unauthorized", "Your session has expired. Please log in again.");

  const { data: profile, error: pErr } = await admin
    .from("profiles")
    .select("role, full_name, email")
    .eq("id", data.user.id)
    .single();
  if (pErr || !profile) throw new HttpError(403, "forbidden", "Account profile not found.");

  return {
    user: data.user,
    role: profile.role,
    email: profile.email || data.user.email || "",
    fullName: profile.full_name,
  };
}

export async function requireCoach(req: Request, admin: Admin): Promise<Caller> {
  const caller = await requireUser(req, admin);
  if (caller.role !== "coach") throw new HttpError(403, "forbidden", "Coach only.");
  return caller;
}

let stripeSingleton: Stripe | null = null;

/**
 * Stripe client. Refuses live keys unless STRIPE_ALLOW_LIVE=true, so the app
 * stays in test mode until the coach explicitly switches.
 */
export function stripeClient(): Stripe {
  if (stripeSingleton) return stripeSingleton;
  const key = env("STRIPE_SECRET_KEY");
  const allowLive = optionalEnv("STRIPE_ALLOW_LIVE") === "true";
  if (!key.startsWith("sk_test_") && !key.startsWith("rk_test_") && !allowLive) {
    throw new Error("Refusing to use a live Stripe key: set STRIPE_ALLOW_LIVE=true when you are ready to go live.");
  }
  stripeSingleton = new Stripe(key, { httpClient: Stripe.createFetchHttpClient() });
  return stripeSingleton;
}

export const stripeCrypto = Stripe.createSubtleCryptoProvider();

export interface AppSettings {
  business_name: string;
  timezone: string;
  currency: string;
  cancellation_window_hours: number;
  reminder_hours_before: number;
  payment_hold_minutes: number;
}

export async function loadSettings(admin: Admin): Promise<AppSettings> {
  const { data, error } = await admin
    .from("app_settings")
    .select("business_name, timezone, currency, cancellation_window_hours, reminder_hours_before, payment_hold_minutes")
    .eq("id", 1)
    .single();
  if (error || !data) throw new Error(`Could not load app_settings: ${error?.message}`);
  return data as AppSettings;
}
