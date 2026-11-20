-- =============================================================================
-- JJ Private Training app - 04: privileges + Row Level Security
--
-- Model:
--   anon (not logged in) -> no table access at all. Public data is served
--                           only by the public-* Edge Functions.
--   authenticated parent -> own profile, own players, own bookings/purchases/
--                           payments; read-only notes + drills for own kids.
--   authenticated coach  -> everything.
--   service_role         -> Edge Functions only (bypasses RLS). Never ship
--                           this key to a browser.
--
-- Two layers: GRANTs decide which tables/columns a role can touch at all;
-- RLS policies decide which rows.
-- =============================================================================

-- Start from zero: Supabase grants everything to anon/authenticated by default.
revoke all on all tables in schema public from anon, authenticated;

-- Enable RLS on every table (tables with no policy = no access for clients).
alter table public.app_settings      enable row level security;
alter table public.profiles          enable row level security;
alter table public.players           enable row level security;
alter table public.session_types     enable row level security;
alter table public.availability      enable row level security;
alter table public.blocked_times     enable row level security;
alter table public.packages          enable row level security;
alter table public.package_purchases enable row level security;
alter table public.bookings          enable row level security;
alter table public.payments          enable row level security;
alter table public.session_notes     enable row level security;
alter table public.drills            enable row level security;
alter table public.player_drills     enable row level security;
alter table public.inquiries         enable row level security;
alter table public.announcements     enable row level security;
alter table public.stripe_events     enable row level security;
alter table public.rate_limits       enable row level security;

-- ---------------------------------------------------------------------------
-- app_settings: everyone logged in can read (time zone, policy hours);
-- only the coach can change.
-- ---------------------------------------------------------------------------
grant select, update on public.app_settings to authenticated;

create policy "settings: logged-in users read"
  on public.app_settings for select to authenticated using (true);
create policy "settings: coach updates"
  on public.app_settings for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
grant select on public.profiles to authenticated;
-- Only these columns are editable from the app (not role, not email).
grant update (full_name, phone, announcements_opt_in, client_type) on public.profiles to authenticated;

create policy "profiles: read own, coach reads all"
  on public.profiles for select to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()));

create policy "profiles: update own, coach updates all"
  on public.profiles for update to authenticated
  using (id = (select auth.uid()) or (select public.is_coach()))
  with check (id = (select auth.uid()) or (select public.is_coach()));

-- ---------------------------------------------------------------------------
-- players (children)
-- ---------------------------------------------------------------------------
alter table public.players alter column parent_id set default auth.uid();

grant select, delete on public.players to authenticated;
grant insert (parent_id, first_name, age_group, skill_level, notes, active, is_self) on public.players to authenticated;
-- parent_id is deliberately NOT updatable: a player can't be moved to another account.
grant update (first_name, age_group, skill_level, notes, active, is_self) on public.players to authenticated;

create policy "players: parent reads own, coach reads all"
  on public.players for select to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()));

create policy "players: parent adds own, coach adds any"
  on public.players for insert to authenticated
  with check (parent_id = (select auth.uid()) or (select public.is_coach()));

create policy "players: parent edits own, coach edits any"
  on public.players for update to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()))
  with check (parent_id = (select auth.uid()) or (select public.is_coach()));

-- Deleting a player that has bookings fails (FK restrict); archive with active=false instead.
create policy "players: parent deletes own, coach deletes any"
  on public.players for delete to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()));

-- ---------------------------------------------------------------------------
-- session_types / packages: logged-in users read active ones (plus any they
-- have history with); coach manages.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.session_types to authenticated;

create policy "session_types: read active or own history; coach all"
  on public.session_types for select to authenticated
  using (
    active
    or (select public.is_coach())
    or exists (
      select 1 from public.bookings b
      where b.session_type_id = session_types.id and b.parent_id = (select auth.uid())
    )
  );
create policy "session_types: coach inserts"
  on public.session_types for insert to authenticated with check ((select public.is_coach()));
create policy "session_types: coach updates"
  on public.session_types for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "session_types: coach deletes"
  on public.session_types for delete to authenticated using ((select public.is_coach()));

grant select, insert, update, delete on public.packages to authenticated;

create policy "packages: read active or own history; coach all"
  on public.packages for select to authenticated
  using (
    active
    or (select public.is_coach())
    or exists (
      select 1 from public.package_purchases pp
      where pp.package_id = packages.id and pp.parent_id = (select auth.uid())
    )
  );
create policy "packages: coach inserts"
  on public.packages for insert to authenticated with check ((select public.is_coach()));
create policy "packages: coach updates"
  on public.packages for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "packages: coach deletes"
  on public.packages for delete to authenticated using ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- availability: logged-in users read; coach manages.
-- blocked_times: coach only (reasons may be private). Parents see the effect
-- through get_available_slots().
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.availability to authenticated;

create policy "availability: logged-in users read"
  on public.availability for select to authenticated using (true);
create policy "availability: coach inserts"
  on public.availability for insert to authenticated with check ((select public.is_coach()));
create policy "availability: coach updates"
  on public.availability for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "availability: coach deletes"
  on public.availability for delete to authenticated using ((select public.is_coach()));

grant select, insert, update, delete on public.blocked_times to authenticated;

create policy "blocked_times: coach only"
  on public.blocked_times for all to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- bookings: read-only for clients. All writes go through booking functions
-- (book_with_package, create_pending_booking, cancel_booking, ...), which are
-- called by Edge Functions. This is what makes "never trust the frontend for
-- payment status" true: a parent cannot insert a 'paid' booking.
-- ---------------------------------------------------------------------------
grant select on public.bookings to authenticated;

create policy "bookings: parent reads own, coach reads all"
  on public.bookings for select to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()));

-- ---------------------------------------------------------------------------
-- package_purchases: parents read own; coach can comp / adjust credits.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.package_purchases to authenticated;

create policy "package_purchases: parent reads own, coach reads all"
  on public.package_purchases for select to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()));
create policy "package_purchases: coach inserts"
  on public.package_purchases for insert to authenticated with check ((select public.is_coach()));
create policy "package_purchases: coach updates"
  on public.package_purchases for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "package_purchases: coach deletes"
  on public.package_purchases for delete to authenticated using ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- payments: read-only (written by the Stripe webhook).
-- ---------------------------------------------------------------------------
grant select on public.payments to authenticated;

create policy "payments: parent reads own, coach reads all"
  on public.payments for select to authenticated
  using (parent_id = (select auth.uid()) or (select public.is_coach()));

-- ---------------------------------------------------------------------------
-- session_notes: parents read notes for their own kids; only coach writes.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.session_notes to authenticated;

create policy "session_notes: parent reads own kids, coach reads all"
  on public.session_notes for select to authenticated
  using (
    (select public.is_coach())
    or exists (
      select 1 from public.players p
      where p.id = session_notes.player_id and p.parent_id = (select auth.uid())
    )
  );
create policy "session_notes: coach inserts"
  on public.session_notes for insert to authenticated with check ((select public.is_coach()));
create policy "session_notes: coach updates"
  on public.session_notes for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "session_notes: coach deletes"
  on public.session_notes for delete to authenticated using ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- drills / player_drills: parents see only drills assigned to their kids.
-- ---------------------------------------------------------------------------
grant select, insert, update, delete on public.drills to authenticated;

create policy "drills: parent reads assigned, coach reads all"
  on public.drills for select to authenticated
  using (
    (select public.is_coach())
    or exists (
      select 1
      from public.player_drills pd
      join public.players p on p.id = pd.player_id
      where pd.drill_id = drills.id and p.parent_id = (select auth.uid())
    )
  );
create policy "drills: coach inserts"
  on public.drills for insert to authenticated with check ((select public.is_coach()));
create policy "drills: coach updates"
  on public.drills for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "drills: coach deletes"
  on public.drills for delete to authenticated using ((select public.is_coach()));

grant select, insert, update, delete on public.player_drills to authenticated;

create policy "player_drills: parent reads own kids, coach reads all"
  on public.player_drills for select to authenticated
  using (
    (select public.is_coach())
    or exists (
      select 1 from public.players p
      where p.id = player_drills.player_id and p.parent_id = (select auth.uid())
    )
  );
create policy "player_drills: coach inserts"
  on public.player_drills for insert to authenticated with check ((select public.is_coach()));
create policy "player_drills: coach updates"
  on public.player_drills for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "player_drills: coach deletes"
  on public.player_drills for delete to authenticated using ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- inquiries: coach only. No INSERT grant for any client role: new rows come
-- only from the contact-form Edge Function (service role).
-- ---------------------------------------------------------------------------
grant select, update, delete on public.inquiries to authenticated;

create policy "inquiries: coach reads"
  on public.inquiries for select to authenticated using ((select public.is_coach()));
create policy "inquiries: coach updates"
  on public.inquiries for update to authenticated
  using ((select public.is_coach())) with check ((select public.is_coach()));
create policy "inquiries: coach deletes"
  on public.inquiries for delete to authenticated using ((select public.is_coach()));

-- ---------------------------------------------------------------------------
-- announcements: coach reads the send log (rows written by send-announcement).
-- ---------------------------------------------------------------------------
grant select on public.announcements to authenticated;

create policy "announcements: coach reads"
  on public.announcements for select to authenticated using ((select public.is_coach()));

-- stripe_events, rate_limits: RLS on, no grants, no policies = service role only.
