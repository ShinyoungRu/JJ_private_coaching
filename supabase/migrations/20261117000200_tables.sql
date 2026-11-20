-- =============================================================================
-- JJ Private Training app - 02: tables, constraints, indexes
-- All timestamps are timestamptz (stored in UTC). Availability windows are
-- "wall clock" times in the coach's time zone (app_settings.timezone).
-- Money is stored as integer cents to avoid rounding errors.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- profiles: one row per auth user (created automatically on signup).
-- ---------------------------------------------------------------------------
create table public.profiles (
  id                    uuid primary key references auth.users (id) on delete cascade,
  role                  public.app_role not null default 'client',
  -- Chosen at signup. Only meaningful for clients (ignored for the coach).
  client_type           public.client_type not null default 'parent',
  full_name             text check (char_length(full_name) <= 120),
  -- Copied from auth.users by trigger (read-only for users). Lets the coach
  -- see/contact parents without querying the auth schema.
  email                 text,
  phone                 text check (char_length(phone) <= 30),
  announcements_opt_in  boolean not null default true,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

-- Exactly one coach account: Jonathan, who is also the app's admin.
create unique index profiles_single_coach on public.profiles ((true)) where role = 'coach';
create index profiles_role_idx on public.profiles (role);

-- ---------------------------------------------------------------------------
-- players: the athletes on a client account: a parent's children, and/or the
-- account holder themselves (is_self, for adult clients). Minimal data on
-- purpose: no email, phone, photos or birth date.
-- parent_id here and on other tables means "the client account that owns
-- this", whether that client is a parent or an adult athlete.
-- ---------------------------------------------------------------------------
create table public.players (
  id           uuid primary key default gen_random_uuid(),
  parent_id    uuid not null references public.profiles (id) on delete cascade,
  first_name   text not null check (char_length(btrim(first_name)) between 1 and 60),
  age_group    text check (age_group ~ '^(U([5-9]|1[0-9]|2[0-3])|Adult)$'),
  skill_level  public.skill_level,
  notes        text check (char_length(notes) <= 1000),
  -- True when this athlete IS the account holder (an adult training themselves).
  is_self      boolean not null default false,
  -- Archive instead of delete once a player has booking history.
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index players_parent_idx on public.players (parent_id);
-- At most one "myself" athlete per account.
create unique index players_one_self_per_account on public.players (parent_id) where is_self;

-- ---------------------------------------------------------------------------
-- session_types: what can be booked (1-on-1, small group, ...).
-- ---------------------------------------------------------------------------
create table public.session_types (
  id                uuid primary key default gen_random_uuid(),
  name              text not null check (char_length(name) between 1 and 80),
  description       text check (char_length(description) <= 1000),
  duration_minutes  integer not null check (duration_minutes between 15 and 480),
  price_cents       integer not null check (price_cents >= 0),
  max_players       integer not null default 1 check (max_players between 1 and 30),
  active            boolean not null default true,
  sort_order        integer not null default 0,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- availability: the coach's weekly recurring hours (coach's local time).
-- day_of_week: 0 = Sunday ... 6 = Saturday (same as Postgres extract(dow)).
-- ---------------------------------------------------------------------------
create table public.availability (
  id           uuid primary key default gen_random_uuid(),
  day_of_week  smallint not null check (day_of_week between 0 and 6),
  start_time   time not null,
  end_time     time not null,
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  check (end_time > start_time)
);
create index availability_dow_idx on public.availability (day_of_week) where active;

-- ---------------------------------------------------------------------------
-- blocked_times: one-off unavailability (vacation, field closed, ...).
-- ---------------------------------------------------------------------------
create table public.blocked_times (
  id          uuid primary key default gen_random_uuid(),
  start_time  timestamptz not null,
  end_time    timestamptz not null,
  reason      text check (char_length(reason) <= 200),
  created_at  timestamptz not null default now(),
  check (end_time > start_time)
);
create index blocked_times_range_idx on public.blocked_times
  using gist (tstzrange(start_time, end_time, '[)'));

-- ---------------------------------------------------------------------------
-- packages: prepaid bundles of sessions.
-- session_type_id null = credits can be used for any session type.
-- ---------------------------------------------------------------------------
create table public.packages (
  id               uuid primary key default gen_random_uuid(),
  name             text not null check (char_length(name) between 1 and 80),
  description      text check (char_length(description) <= 1000),
  session_count    integer not null check (session_count between 1 and 100),
  price_cents      integer not null check (price_cents >= 0),
  session_type_id  uuid references public.session_types (id) on delete restrict,
  -- Credits expire this many days after purchase (null = never).
  validity_days    integer check (validity_days is null or validity_days > 0),
  active           boolean not null default true,
  sort_order       integer not null default 0,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- package_purchases: a parent's balance of session credits.
-- Rows are created ONLY by the Stripe webhook (or by the coach for comps /
-- cancellation credits), never by the parent's browser.
-- ---------------------------------------------------------------------------
create table public.package_purchases (
  id                          uuid primary key default gen_random_uuid(),
  parent_id                   uuid not null references public.profiles (id) on delete cascade,
  package_id                  uuid references public.packages (id) on delete restrict,
  -- Snapshot of which session type the credits are valid for (null = any).
  session_type_id             uuid references public.session_types (id) on delete restrict,
  source                      text not null default 'purchase'
                              check (source in ('purchase', 'cancellation_credit', 'coach_grant')),
  label                       text not null check (char_length(label) <= 120),
  sessions_total              integer not null check (sessions_total > 0),
  sessions_remaining          integer not null,
  amount_paid_cents           integer not null default 0 check (amount_paid_cents >= 0),
  stripe_payment_id           text,            -- Stripe PaymentIntent id
  stripe_checkout_session_id  text unique,     -- idempotency key for the webhook
  purchased_at                timestamptz not null default now(),
  expires_at                  timestamptz,
  created_at                  timestamptz not null default now(),
  check (sessions_remaining between 0 and sessions_total),
  check (source <> 'purchase' or package_id is not null)
);
create index package_purchases_parent_idx on public.package_purchases (parent_id);

-- ---------------------------------------------------------------------------
-- bookings: one row per player per session. A small-group session with three
-- kids is three rows that share the same session_type_id + start_time.
-- Bookings are written ONLY through the booking functions (see 05), never
-- directly by parents. That is how the cancellation policy, credit
-- accounting and payment rules are enforced.
-- ---------------------------------------------------------------------------
create table public.bookings (
  id                          uuid primary key default gen_random_uuid(),
  session_type_id             uuid not null references public.session_types (id) on delete restrict,
  player_id                   uuid not null references public.players (id) on delete restrict,
  parent_id                   uuid not null references public.profiles (id) on delete restrict,
  start_time                  timestamptz not null,
  end_time                    timestamptz not null,
  -- Length in sessions (= hours, since sessions are 1 hour). Default 1; private
  -- sessions can be booked longer (up to app_settings.max_booking_hours).
  -- Price and package credits scale with it.
  hours                       integer not null default 1 check (hours between 1 and 8),
  status                      public.booking_status not null default 'booked',
  paid_with                   public.payment_method not null,
  payment_status              public.payment_status not null default 'unpaid',
  package_purchase_id         uuid references public.package_purchases (id) on delete restrict,
  price_cents                 integer check (price_cents >= 0),   -- snapshot at booking time
  stripe_checkout_session_id  text unique,
  stripe_payment_intent_id    text,
  hold_expires_at             timestamptz,   -- only for pending_payment
  parent_note                 text check (char_length(parent_note) <= 500),
  -- Group key: bookings with the same slot_key are the same session.
  -- Set by trigger (session_type_id + start epoch); do not write it yourself.
  slot_key                    text not null,
  cancelled_at                timestamptz,
  cancelled_by                uuid references public.profiles (id) on delete set null,
  cancel_reason               text check (char_length(cancel_reason) <= 300),
  late_cancellation           boolean not null default false,
  reminder_sent_at            timestamptz,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  check (end_time > start_time),
  check ((paid_with = 'package') = (package_purchase_id is not null)),
  check (status <> 'pending_payment' or hold_expires_at is not null),

  -- DOUBLE-BOOKING GUARD (database level): the coach can only be in one
  -- session at a time. Two active bookings may overlap in time only if they
  -- are the same group session (same slot_key). Group capacity
  -- (max_players) is enforced by the bookings_enforce_rules trigger.
  constraint bookings_no_overlap exclude using gist (
    tstzrange(start_time, end_time, '[)') with &&,
    slot_key with <>
  ) where (status in ('pending_payment', 'booked', 'completed', 'no_show'))
);

-- The same player can't be in the same session twice.
create unique index bookings_player_slot_unique on public.bookings (player_id, slot_key)
  where status in ('pending_payment', 'booked', 'completed', 'no_show');

create index bookings_parent_idx      on public.bookings (parent_id, start_time desc);
create index bookings_player_idx      on public.bookings (player_id, start_time desc);
create index bookings_start_idx       on public.bookings (start_time);
create index bookings_slot_key_idx    on public.bookings (slot_key);
create index bookings_reminder_idx    on public.bookings (start_time)
  where status = 'booked' and reminder_sent_at is null;
create index bookings_pending_idx     on public.bookings (hold_expires_at)
  where status = 'pending_payment';

-- ---------------------------------------------------------------------------
-- payments: ledger of money received through Stripe (for revenue stats and
-- refunds). Written only by Edge Functions.
-- ---------------------------------------------------------------------------
create table public.payments (
  id                          uuid primary key default gen_random_uuid(),
  parent_id                   uuid references public.profiles (id) on delete set null,
  booking_id                  uuid references public.bookings (id) on delete set null,
  package_purchase_id         uuid references public.package_purchases (id) on delete set null,
  stripe_checkout_session_id  text not null unique,
  stripe_payment_intent_id    text,
  amount_cents                integer not null check (amount_cents >= 0),
  amount_refunded_cents       integer not null default 0 check (amount_refunded_cents >= 0),
  currency                    text not null default 'usd',
  status                      text not null default 'paid'
                              check (status in ('paid', 'refunded', 'partially_refunded')),
  created_at                  timestamptz not null default now(),
  refunded_at                 timestamptz,
  check (amount_refunded_cents <= amount_cents)
);
create index payments_parent_idx  on public.payments (parent_id);
create index payments_created_idx on public.payments (created_at);
create index payments_intent_idx  on public.payments (stripe_payment_intent_id);

-- ---------------------------------------------------------------------------
-- session_notes: coach's notes after a session. Parents can read, not edit.
-- ---------------------------------------------------------------------------
create table public.session_notes (
  id                uuid primary key default gen_random_uuid(),
  booking_id        uuid not null unique references public.bookings (id) on delete cascade,
  player_id         uuid not null references public.players (id) on delete cascade,
  skills_worked_on  text[] not null default '{}',
  coach_notes       text check (char_length(coach_notes) <= 5000),
  homework          text check (char_length(homework) <= 2000),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
create index session_notes_player_idx on public.session_notes (player_id, created_at desc);

-- ---------------------------------------------------------------------------
-- drills + assignments
-- video_path = object path inside the private "drill-videos" Storage bucket.
-- external_url = optional YouTube/Vimeo link instead of an upload.
-- ---------------------------------------------------------------------------
create table public.drills (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (char_length(title) between 1 and 120),
  description   text check (char_length(description) <= 5000),
  video_path    text unique,
  external_url  text check (external_url ~ '^https://'),
  skill_tag     text check (char_length(skill_tag) <= 40),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index drills_skill_tag_idx on public.drills (skill_tag);

create table public.player_drills (
  player_id    uuid not null references public.players (id) on delete cascade,
  drill_id     uuid not null references public.drills (id) on delete cascade,
  coach_note   text check (char_length(coach_note) <= 1000),
  assigned_at  timestamptz not null default now(),
  primary key (player_id, drill_id)
);
create index player_drills_drill_idx on public.player_drills (drill_id);

-- ---------------------------------------------------------------------------
-- inquiries: website contact form submissions (inserted only by the
-- contact-form Edge Function).
-- ---------------------------------------------------------------------------
create table public.inquiries (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 120),
  email       text not null check (char_length(email) <= 254),
  phone       text check (char_length(phone) <= 30),
  message     text not null check (char_length(message) between 1 and 5000),
  status      public.inquiry_status not null default 'new',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index inquiries_status_idx on public.inquiries (status, created_at desc);

-- ---------------------------------------------------------------------------
-- announcements: log of coach broadcast emails.
-- ---------------------------------------------------------------------------
create table public.announcements (
  id               uuid primary key default gen_random_uuid(),
  subject          text not null check (char_length(subject) between 1 and 150),
  body             text not null check (char_length(body) between 1 and 10000),
  audience         text not null default 'all' check (audience in ('all', 'today', 'this_week')),
  recipient_count  integer not null default 0,
  sent_by          uuid references public.profiles (id) on delete set null,
  created_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Internal tables (no client access at all)
-- ---------------------------------------------------------------------------
-- Stripe webhook idempotency: each event id is processed once.
create table public.stripe_events (
  id            text primary key,
  type          text not null,
  processed_at  timestamptz not null default now()
);

-- Fixed-window rate limiting for public endpoints (keys are hashed IPs).
create table public.rate_limits (
  key           text not null,
  window_start  timestamptz not null,
  hits          integer not null default 0,
  primary key (key, window_start)
);
