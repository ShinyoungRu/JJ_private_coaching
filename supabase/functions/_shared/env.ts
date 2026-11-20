// Environment helpers. Secrets live in Supabase (supabase secrets set ...)
// or supabase/functions/.env locally, never in code.

export function env(name: string): string {
  const value = Deno.env.get(name);
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function optionalEnv(name: string, fallback = ""): string {
  return Deno.env.get(name) || fallback;
}

/** Base URL of the booking app, no trailing slash. */
export function appUrl(): string {
  return optionalEnv("APP_URL", "https://app.jjprivatetraining.com").replace(/\/+$/, "");
}

function splitList(value: string): string[] {
  return value.split(",").map((s) => s.trim().replace(/\/+$/, "")).filter(Boolean);
}

/** Origins allowed to call the logged-in app functions (the app itself). */
export function appOrigins(): string[] {
  return [appUrl(), ...splitList(optionalEnv("EXTRA_ALLOWED_ORIGINS"))];
}

/**
 * Origins allowed to call the public functions: the marketing website, plus
 * the app itself (its logged-out /book page and /embed/book use them).
 */
export function publicSiteOrigins(): string[] {
  return [
    appUrl(),
    ...splitList(
      optionalEnv(
        "PUBLIC_SITE_ORIGINS",
        "https://www.jjprivatetraining.com,https://jjprivatetraining.com",
      ),
    ),
    ...splitList(optionalEnv("EXTRA_ALLOWED_ORIGINS")),
  ];
}
