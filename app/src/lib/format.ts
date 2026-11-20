// Date/time helpers. All stored times are UTC; everything is DISPLAYED in the
// coach's time zone (app_settings.timezone), regardless of the viewer's device.

export const DEFAULT_TZ = "America/New_York";

/** 'YYYY-MM-DD' of an instant, in the given time zone. */
export function dateKey(d: Date | string, tz: string): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(d));
}

export function todayKey(tz: string): string {
  return dateKey(new Date(), tz);
}

export function addDays(key: string, n: number): string {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

export function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.split("-").map(Number);
  const [by, bm, bd] = b.split("-").map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000);
}

/** 0 = Sunday ... 6 = Saturday for a 'YYYY-MM-DD' key. */
export function dayOfWeek(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Monday of the week containing `key`. */
export function weekStart(key: string): string {
  const dow = dayOfWeek(key);
  return addDays(key, dow === 0 ? -6 : 1 - dow);
}

/** Label for a date key, e.g. "Wed, Nov 18". */
export function fmtDay(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" }): string {
  return new Intl.DateTimeFormat("en-US", { ...opts, timeZone: "UTC" }).format(new Date(`${key}T12:00:00Z`));
}

export function fmtTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit" }).format(new Date(iso));
}

export function fmtDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
  }).format(new Date(iso));
}

export function fmtLongDateTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: tz, weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short",
  }).format(new Date(iso));
}

export function fmtDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat("en-US", { timeZone: tz, month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

export function tzAbbrev(tz: string): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" })
    .formatToParts(new Date()).find((p) => p.type === "timeZoneName");
  return part?.value ?? tz;
}

export function fmtMoney(cents: number | null | undefined, currency = "usd"): string {
  if (cents == null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: currency.toUpperCase() }).format(cents / 100);
}

export function hoursUntil(iso: string): number {
  return (new Date(iso).getTime() - Date.now()) / 3_600_000;
}

/** Converts a wall-clock time in `tz` (e.g. "2026-12-01", "17:30") to a UTC ISO string. */
export function zonedToUtc(key: string, hhmm: string, tz: string): string {
  const [y, m, d] = key.split("-").map(Number);
  const [hh, mm] = hhmm.split(":").map(Number);
  const wanted = Date.UTC(y, m - 1, d, hh, mm);
  let guess = wanted;
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
      }).formatToParts(new Date(guess)).map((p) => [p.type, p.value]),
    );
    const shown = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
    guess += wanted - shown;
  }
  return new Date(guess).toISOString();
}

/** "HH:MM:SS" (Postgres time) -> "4:00 PM" */
export function fmtClock(t: string): string {
  const [h, m] = t.split(":").map(Number);
  const suffix = h >= 12 ? "PM" : "AM";
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, "0")} ${suffix}`;
}

/** plural(1, "client") -> "1 client", plural(3, "client") -> "3 clients". */
export function plural(n: number, word: string, many = `${word}s`): string {
  return `${n} ${n === 1 ? word : many}`;
}

export function titleCase(s: string | null | undefined): string {
  if (!s) return "";
  return s.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function firstName(full: string | null | undefined): string {
  return (full || "").trim().split(/\s+/)[0] || "";
}
