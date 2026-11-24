import { useAuth } from "../lib/auth";
import { bookingEvent, downloadIcs } from "../lib/calendar";
import { placeFromSettings } from "../lib/location";
import { dateKey } from "../lib/format";
import { Button } from "./ui";

/** Downloads the booking as an .ics file (Apple Calendar, Google Calendar, Outlook). */
export function AddToCalendar({ booking, sessionName, playerName, tz, size = "md" }: {
  booking: { id: string; start_time: string; end_time: string };
  sessionName: string;
  playerName: string;
  tz: string;
  size?: "sm" | "md";
}) {
  const { settings } = useAuth();
  return (
    <Button
      variant="secondary"
      size={size}
      onClick={() => downloadIcs(bookingEvent(booking, sessionName, playerName, placeFromSettings(settings)), `jj-training-${dateKey(booking.start_time, tz)}.ics`)}
    >
      <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18M12 14v4M10 16h4" />
      </svg>
      Add to calendar
    </Button>
  );
}
