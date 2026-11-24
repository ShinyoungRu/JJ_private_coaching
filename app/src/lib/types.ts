import type { Database } from "./database.types";

type T = Database["public"]["Tables"];
type F = Database["public"]["Functions"];
type E = Database["public"]["Enums"];

export type Profile = T["profiles"]["Row"];
export type Player = T["players"]["Row"];
export type SessionType = T["session_types"]["Row"];
export type Package = T["packages"]["Row"];
export type PackagePurchase = T["package_purchases"]["Row"];
export type Booking = T["bookings"]["Row"];
export type SessionNote = T["session_notes"]["Row"];
export type Drill = T["drills"]["Row"];
export type PlayerDrill = T["player_drills"]["Row"];
export type Availability = T["availability"]["Row"];
export type BlockedTime = T["blocked_times"]["Row"];
export type Inquiry = T["inquiries"]["Row"];
export type Announcement = T["announcements"]["Row"];
export type AppSettings = T["app_settings"]["Row"];

export type BookingStatus = E["booking_status"];
export type PaymentMethod = E["payment_method"];
export type PaymentStatus = E["payment_status"];
export type SkillLevel = E["skill_level"];
export type InquiryStatus = E["inquiry_status"];
export type ClientType = E["client_type"];

export const CLIENT_TYPE_LABEL: Record<ClientType, string> = { parent: "Parent / guardian", adult: "Adult athlete" };

export type Slot = F["get_available_slots"]["Returns"][number];
export type ScheduleRow = F["admin_schedule"]["Returns"][number];

export interface AdminStats {
  timezone: string;
  sessions_this_month: number;
  player_sessions_this_month: number;
  completed_this_month: number;
  no_shows_this_month: number;
  revenue_this_month_cents: number;
  upcoming_sessions_7_days: number;
  active_players: number;
  total_families: number;
  new_inquiries: number;
  unpaid_manual_bookings: number;
  outstanding_package_credits: number;
}

/** Booking joined with what the parent screens show. */
export type BookingWithDetails = Booking & {
  player: { first_name: string } | null;
  session_type: { name: string; duration_minutes: number } | null;
  note: SessionNote[] | SessionNote | null;
};

export interface PublicSlot {
  session_type_id: string;
  session_type: string;
  start: string;
  end: string;
  display_date: string;
  display_time: string;
  book_url: string;
}

export interface PublicPricing {
  currency: string;
  location: { name: string; address: string; maps_url: string } | null;
  session_types: Array<SessionType & { price_display: string; book_url: string }>;
  packages: Array<Package & { price_display: string; per_session_display: string; session_type_name: string | null }>;
}

export const AGE_GROUPS = ["U5", "U6", "U7", "U8", "U9", "U10", "U11", "U12", "U13", "U14", "U15", "U16", "U17", "U18", "U19", "Adult"];
export const SKILL_LEVELS: SkillLevel[] = ["beginner", "intermediate", "advanced", "elite"];
export const DAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
