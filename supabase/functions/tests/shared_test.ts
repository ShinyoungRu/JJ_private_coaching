// Unit tests for shared helpers. Run: deno test supabase/functions/tests/
import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1.0.13";
import { cleanText, corsHeaders, dbError, isEmail, isForeignOrigin, safeEqual } from "../_shared/http.ts";
import { escapeHtml, formatWhen, textToHtml } from "../_shared/templates.ts";
import { publicSiteOrigins } from "../_shared/env.ts";

const SITE_ORIGINS = ["https://www.jjprivatetraining.com", "https://jjprivatetraining.com"];
const req = (origin?: string) => new Request("http://x", { headers: origin ? { Origin: origin } : {} });

Deno.test("CORS: allows only the configured marketing site origins", () => {
  assertEquals(corsHeaders(req("https://www.jjprivatetraining.com"), SITE_ORIGINS)["Access-Control-Allow-Origin"], "https://www.jjprivatetraining.com");
  assertEquals(corsHeaders(req("https://jjprivatetraining.com"), SITE_ORIGINS)["Access-Control-Allow-Origin"], "https://jjprivatetraining.com");
  assertEquals(corsHeaders(req("https://evil.example"), SITE_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders(req("https://www.jjprivatetraining.com.evil.example"), SITE_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders(req(), SITE_ORIGINS)["Access-Control-Allow-Origin"], undefined);
  assertEquals(corsHeaders(req("https://evil.example"), SITE_ORIGINS)["Vary"], "Origin");
});

Deno.test("CORS: default public origins are the app plus the two site hosts", () => {
  Deno.env.delete("PUBLIC_SITE_ORIGINS");
  Deno.env.delete("EXTRA_ALLOWED_ORIGINS");
  Deno.env.delete("APP_URL");
  assertEquals(publicSiteOrigins(), ["https://app.jjprivatetraining.com", ...SITE_ORIGINS]);
});

Deno.test("isForeignOrigin: browser from another site is foreign; server-to-server is not", () => {
  assert(isForeignOrigin(req("https://evil.example"), SITE_ORIGINS));
  assertFalse(isForeignOrigin(req("https://jjprivatetraining.com"), SITE_ORIGINS));
  assertFalse(isForeignOrigin(req(), SITE_ORIGINS));
});

Deno.test("safeEqual compares secrets correctly", () => {
  assert(safeEqual("abc123", "abc123"));
  assertFalse(safeEqual("abc123", "abc124"));
  assertFalse(safeEqual("abc", "abcd"));
});

Deno.test("dbError maps SQL hints to API error codes", () => {
  const e = dbError({ code: "P0001", hint: "slot_unavailable", message: "That time is no longer available." });
  assertEquals([e.status, e.code], [409, "slot_unavailable"]);
  assertEquals(dbError({ code: "42501", message: "Coach only.", hint: "forbidden" }).status, 403);
  assertEquals(dbError({ code: "23P01", message: "conflicting key" }).code, "slot_unavailable");
  const unknown = dbError({ code: "XX000", message: "internal detail that must not leak" });
  assertEquals(unknown.status, 500);
  assertFalse(unknown.message.includes("internal detail"));
});

Deno.test("input cleaning and validation", () => {
  assertEquals(cleanText("  hi\u0000there  ", 100), "hithere");
  assertEquals(cleanText("x".repeat(50), 10), "x".repeat(10));
  assertEquals(cleanText("   ", 10), null);
  assertEquals(cleanText(42, 10), null);
  assert(isEmail("parent@example.com"));
  assertFalse(isEmail("not an email"));
  assertFalse(isEmail("a@b"));
  assertFalse(isEmail("<script>@x.com"));
});

Deno.test("email templates escape user content", () => {
  assertEquals(escapeHtml(`<img src=x onerror="alert(1)">`), "&lt;img src=x onerror=&quot;alert(1)&quot;&gt;");
  assert(!textToHtml("<b>hi</b>\n\nbye").includes("<b>"));
});

Deno.test("times are shown in the coach's time zone (DST aware)", () => {
  // 22:00 UTC in November = 5:00 PM EST; in July = 6:00 PM EDT
  assert(formatWhen("2026-11-18T22:00:00Z", "America/New_York").includes("5:00 PM EST"));
  assert(formatWhen("2026-07-15T22:00:00Z", "America/New_York").includes("6:00 PM EDT"));
});
