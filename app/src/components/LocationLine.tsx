import { mapsUrl, type Place } from "../lib/location";
import { cx } from "./ui";

/** Pin icon, "Cherry Street Park · Upper Providence Township, Media, PA", and a Directions link. */
export function LocationLine({ place, className, onDark }: { place: Place | null; className?: string; onDark?: boolean }) {
  if (!place) return null;
  return (
    <p className={cx("flex flex-wrap items-center gap-x-2 gap-y-0.5 text-sm", onDark ? "text-gray-200" : "text-fg-2", className)}>
      <svg className={cx("h-4 w-4 shrink-0", onDark ? "text-blue-400" : "text-brand")} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" />
      </svg>
      <span>
        <span className={cx("font-semibold", onDark ? "text-white" : "text-fg")}>{place.name}</span>
        {place.address && <span className={onDark ? "text-gray-300" : "text-muted"}> · {place.address}</span>}
      </span>
      <a
        href={mapsUrl(place)}
        target="_blank"
        rel="noopener"
        className={cx("font-semibold hover:underline", onDark ? "text-blue-400" : "text-brand")}
      >
        Directions →
      </a>
    </p>
  );
}
