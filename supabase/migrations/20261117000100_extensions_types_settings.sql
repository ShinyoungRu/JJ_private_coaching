-- =============================================================================
-- JJ Private Training app - 01: extensions, enum types, app settings
-- =============================================================================

-- btree_gist lets us build the "no overlapping bookings" exclusion constraint.
create extension if not exists btree_gist with schema extensions;
-- pg_net + pg_cron power the scheduled reminder function.
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ---------------------------------------------------------------------------
-- Enum types
-- ---------------------------------------------------------------------------
create type public.app_role as enum ('coach', 'parent');

-- pending_payment = slot is held while the parent is on Stripe Checkout.
-- It is not one of the four statuses in the brief, but without it two parents
-- could pay for the same slot at the same time.
create type public.booking_status as enum (
  'pending_payment', 'booked', 'cancelled', 'completed', 'no_show'
);

-- stripe  = paid with a single-session Stripe Checkout
-- package = paid with a package credit
-- manual  = created by the coach (cash, Venmo, comp, etc.)
create type public.payment_method as enum ('stripe', 'package', 'manual');

create type public.payment_status as enum ('unpaid', 'paid', 'refunded');

create type public.skill_level as enum ('beginner', 'intermediate', 'advanced', 'elite');

create type public.inquiry_status as enum ('new', 'replied', 'closed');

-- ---------------------------------------------------------------------------
-- App settings (single row). Holds the business rules that were [bracketed]
-- in the brief, so the coach can change them without a code deploy.
-- ---------------------------------------------------------------------------
create table public.app_settings (
  id                         smallint primary key default 1 check (id = 1),
  business_name              text not null default 'JJ Private Training, Co.',
  timezone                   text not null default 'America/New_York',
  currency                   text not null default 'usd' check (currency ~ '^[a-z]{3}$'),
  -- Parents may cancel/reschedule up to this many hours before a session.
  cancellation_window_hours  integer not null default 24 check (cancellation_window_hours between 0 and 336),
  -- Reminder email is sent this many hours before a session.
  reminder_hours_before      integer not null default 24 check (reminder_hours_before between 1 and 168),
  -- Granularity of bookable start times inside availability windows.
  slot_interval_minutes      integer not null default 30 check (slot_interval_minutes between 5 and 240),
  -- Earliest a parent can book (hours from now) and how far ahead they can book.
  min_booking_notice_hours   integer not null default 12 check (min_booking_notice_hours between 0 and 336),
  max_booking_days_ahead     integer not null default 60 check (max_booking_days_ahead between 1 and 365),
  -- How long a slot is held while the parent is on Stripe Checkout.
  -- Stripe's minimum Checkout expiry is 30 minutes; keep this >= 32.
  payment_hold_minutes       integer not null default 35 check (payment_hold_minutes between 32 and 1440),
  -- What happens when a Stripe-paid single session is cancelled inside policy:
  --   'stripe_refund'  -> money back to the card (Stripe keeps its fee)
  --   'session_credit' -> parent gets a 1-session credit instead
  stripe_cancellation_refund text not null default 'stripe_refund'
                             check (stripe_cancellation_refund in ('stripe_refund', 'session_credit')),
  -- Days a cancellation credit stays valid (null = never expires).
  credit_validity_days       integer default 180 check (credit_validity_days is null or credit_validity_days > 0),
  updated_at                 timestamptz not null default now()
);

comment on table public.app_settings is
  'Single-row table of business rules (time zone, cancellation window, reminder timing, slot sizes).';

-- Reject invalid IANA time zone names (e.g. a typo would silently break slot math).
create or replace function public.validate_app_settings()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  perform now() at time zone new.timezone;  -- raises if the zone name is unknown
  new.updated_at := now();
  return new;
end;
$$;

create trigger app_settings_validate
  before insert or update on public.app_settings
  for each row execute function public.validate_app_settings();

insert into public.app_settings (id) values (1);
