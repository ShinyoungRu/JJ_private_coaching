import { mapsUrl, type Place, placeText } from "./location";

// "Add to calendar": builds a standard iCalendar (.ics) file for a booking.
// Apple Calendar, Google Calendar and Outlook all import it. On a Mac it opens in
// Calendar; on iPhone, Safari offers "Add to Calendar" (or saves it to Downloads,
// where tapping it does the same).

export interface CalendarEvent {
  /** Stable id (the booking id): re-downloading after a reschedule updates the same event. */
  id: string;
  start: string; // ISO date-time
  end: string;   // ISO date-time
  title: string;
  description?: string;
  location?: string;
  url?: string;
}

/** 2026-12-01T22:00:00.000Z -> 20261201T220000Z (UTC, so the calendar shows local time correctly). */
function icsDate(iso: string): string {
  return new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/** RFC 5545 text escaping. */
function icsText(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
}

/** RFC 5545 line folding: max 75 bytes per line, continuation lines start with a space. */
function fold(line: string): string {
  const enc = new TextEncoder();
  if (enc.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  for (const ch of line) {
    const limit = parts.length === 0 ? 75 : 74; // continuation lines lose a byte to the leading space
    if (enc.encode(current + ch).length > limit) {
      parts.push(current);
      current = ch;
    } else {
      current += ch;
    }
  }
  parts.push(current);
  return parts.join("\r\n ");
}

export function buildIcs(e: CalendarEvent): string {
  const now = new Date().toISOString();
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//JJ Private Training//Bookings//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    "BEGIN:VEVENT",
    `UID:${e.id}@jjprivatetraining.com`,
    `DTSTAMP:${icsDate(now)}`,
    // Newer downloads win, so a rescheduled session replaces the old time.
    `SEQUENCE:${Math.floor(Date.parse(now) / 1000)}`,
    `DTSTART:${icsDate(e.start)}`,
    `DTEND:${icsDate(e.end)}`,
    `SUMMARY:${icsText(e.title)}`,
    ...(e.description ? [`DESCRIPTION:${icsText(e.description)}`] : []),
    ...(e.location ? [`LOCATION:${icsText(e.location)}`] : []),
    ...(e.url ? [`URL:${e.url}`] : []),
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `DESCRIPTION:${icsText(e.title)}`,
    "TRIGGER:-PT1H",
    "END:VALARM",
    "END:VEVENT",
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

export function downloadIcs(e: CalendarEvent, filename: string): void {
  const url = URL.createObjectURL(new Blob([buildIcs(e)], { type: "text/calendar;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/** Calendar event for a training session booking. */
export function bookingEvent(
  b: { id: string; start_time: string; end_time: string },
  sessionName: string,
  playerName: string,
  place?: Place | null,
): CalendarEvent {
  const manage = `${window.location.origin}/bookings`;
  const where = place ? `\nWhere: ${placeText(place)}\nDirections: ${mapsUrl(place)}` : "";
  return {
    id: b.id,
    start: b.start_time,
    end: b.end_time,
    title: `${sessionName} - ${playerName} (JJ Private Training)`,
    description: `${sessionName} with JJ Private Training, Co. for ${playerName}.${where}\nReschedule or cancel: ${manage}`,
    location: place ? placeText(place) : undefined,
    url: manage,
  };
}
