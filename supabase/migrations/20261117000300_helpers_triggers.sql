-- =============================================================================
-- JJ Private Training app - 03: helper functions and triggers
-- All functions pin search_path = '' and fully qualify object names, so a
-- malicious object in another schema can't hijack them.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Role helpers (used by RLS policies)
-- ---------------------------------------------------------------------------
create or replace function public.has_role(p_user_id uuid, p_role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles where id = p_user_id and role = p_role
  );
$$;

create or replace function public.is_coach()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select public.has_role(auth.uid(), 'coach');
$$;

-- Serialises every booking write so capacity checks can't race.
-- One coach = one calendar, so a single global lock is simple and cheap.
create or replace function public.lock_booking_calendar()
returns void
language sql
set search_path = ''
as $$
  select pg_advisory_xact_lock(727274001);
$$;

-- Coach's time zone (from app_settings).
create or replace function public.coach_timezone()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select timezone from public.app_settings where id = 1;
$$;

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at      before update on public.profiles      for each row execute function public.set_updated_at();
create trigger players_updated_at       before update on public.players       for each row execute function public.set_updated_at();
create trigger session_types_updated_at before update on public.session_types for each row execute function public.set_updated_at();
create trigger packages_updated_at      before update on public.packages      for each row execute function public.set_updated_at();
create trigger session_notes_updated_at before update on public.session_notes for each row execute function public.set_updated_at();
create trigger drills_updated_at        before update on public.drills        for each row execute function public.set_updated_at();
create trigger inquiries_updated_at     before update on public.inquiries     for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- New auth user -> profile row (always role 'client').
-- The role is NEVER taken from signup metadata; users control that metadata,
-- so trusting it would let anyone sign up as the coach. client_type ('parent' or
-- 'adult') does come from metadata: it grants nothing. Adult clients also get
-- a "myself" player so they can book straight away.
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text := nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), 120), '');
  v_type public.client_type :=
    case when new.raw_user_meta_data ->> 'account_type' = 'adult' then 'adult' else 'parent' end;
begin
  insert into public.profiles (id, email, full_name, phone, client_type)
  values (
    new.id,
    new.email,
    v_name,
    nullif(left(btrim(coalesce(new.raw_user_meta_data ->> 'phone', '')), 30), ''),
    v_type
  )
  on conflict (id) do nothing;

  if v_type = 'adult' then
    insert into public.players (parent_id, first_name, age_group, is_self)
    values (new.id, coalesce(left(split_part(v_name, ' ', 1), 60), 'Me'), 'Adult', true)
    on conflict do nothing;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep profiles.email in sync when a user changes their email.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles set email = new.email where id = new.id;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row
  when (old.email is distinct from new.email)
  execute function public.handle_user_email_change();

-- ---------------------------------------------------------------------------
-- Profiles: belt-and-braces guard against role escalation from the API.
-- (Column grants in 04 already stop it; this also covers service code bugs
-- that forward user input.)
-- ---------------------------------------------------------------------------
create or replace function public.profiles_protect_columns()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(auth.role(), '') in ('anon', 'authenticated') then
    if new.role is distinct from old.role then
      raise exception 'Changing roles is not allowed.' using errcode = '42501';
    end if;
    if new.email is distinct from old.email then
      raise exception 'Change your email through account settings.' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

create trigger profiles_protect_columns
  before update on public.profiles
  for each row execute function public.profiles_protect_columns();

-- ---------------------------------------------------------------------------
-- Bookings: derive slot_key, check the player belongs to the parent, and
-- enforce group capacity (max_players) under the calendar lock.
-- The overlap guarantee itself is the bookings_no_overlap exclusion
-- constraint; this trigger adds the per-slot head count.
-- ---------------------------------------------------------------------------
create or replace function public.bookings_enforce_rules()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_player_parent uuid;
  v_max_players   integer;
  v_taken         integer;
  v_check_cap     boolean := false;
begin
  new.slot_key := new.session_type_id::text || '|'
                  || floor(extract(epoch from new.start_time))::bigint::text;

  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;

  select parent_id into v_player_parent from public.players where id = new.player_id;
  if v_player_parent is distinct from new.parent_id then
    raise exception 'That player is not on this account.'
      using errcode = 'P0001', hint = 'player_not_found';
  end if;

  if new.status in ('pending_payment', 'booked', 'completed', 'no_show') then
    if tg_op = 'INSERT' then
      v_check_cap := true;
    elsif old.slot_key is distinct from new.slot_key
       or old.status not in ('pending_payment', 'booked', 'completed', 'no_show') then
      v_check_cap := true;
    end if;
  end if;

  if v_check_cap then
    perform public.lock_booking_calendar();

    select max_players into v_max_players
    from public.session_types where id = new.session_type_id;

    select count(*) into v_taken
    from public.bookings b
    where b.slot_key = new.slot_key
      and b.id <> new.id
      and b.status in ('pending_payment', 'booked', 'completed', 'no_show');

    if v_taken >= v_max_players then
      raise exception 'Sorry, that session is full.'
        using errcode = 'P0001', hint = 'slot_full';
    end if;
  end if;

  return new;
end;
$$;

create trigger bookings_enforce_rules
  before insert or update on public.bookings
  for each row execute function public.bookings_enforce_rules();

-- ---------------------------------------------------------------------------
-- Session notes: player_id always comes from the booking (so a note can't be
-- attached to the wrong child).
-- ---------------------------------------------------------------------------
create or replace function public.session_notes_set_player()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  select player_id into new.player_id from public.bookings where id = new.booking_id;
  if new.player_id is null then
    raise exception 'Booking not found.' using errcode = 'P0001', hint = 'booking_not_found';
  end if;
  return new;
end;
$$;

create trigger session_notes_set_player
  before insert or update of booking_id, player_id on public.session_notes
  for each row execute function public.session_notes_set_player();
