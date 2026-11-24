// Training location (app_settings.training_location_name / _address).

export interface Place {
  name: string;
  address: string;
}

/** The coach's location from settings, or null when the name is blank. */
export function placeFromSettings(s: { training_location_name: string; training_location_address: string } | null | undefined): Place | null {
  const name = s?.training_location_name?.trim();
  return name ? { name, address: s?.training_location_address?.trim() ?? "" } : null;
}

/** "Cherry Street Park, Upper Providence Township, Media, PA 19063" */
export function placeText(p: Place): string {
  return p.address ? `${p.name}, ${p.address}` : p.name;
}

/** Google Maps search link: opens the Maps app on phones. */
export function mapsUrl(p: Place): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(placeText(p))}`;
}
