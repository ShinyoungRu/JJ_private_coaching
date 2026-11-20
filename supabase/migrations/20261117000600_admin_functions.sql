-- =============================================================================
-- JJ Private Training app - 06: coach admin queries
-- Called directly from the coach dashboard with supabase.rpc(...).
-- Each one checks is_coach() itself and errors for anyone else.
-- =============================================================================

create or replace function public._require_coach()
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.is_coach() then
    raise exception 'Coach only.' using errcode = '42501', hint = 'forbidden';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Schedule with payment status. Dates are in the coach's time zone.
--   today:     admin_schedule()                      (defaults to today)
--   this week: admin_schedule(p_to => today + 6)
-- ---------------------------------------------------------------------------
create or replace function public.admin_schedule(
  p_from              date    default null,
  p_to                date    default null,
  p_include_cancelled boolean default false
)
returns table (
  booking_id         uuid,
  slot_key           text,
  start_time         timestamptz,
  end_time           timestamptz,
  local_date         date,
  local_start        text,
  status             public.booking_status,
  paid_with          public.payment_method,
  payment_status     public.payment_status,
  price_cents        integer,
  session_type_id    uuid,
  session_type_name  text,
  max_players        integer,
  player_id          uuid,
  player_first_name  text,
  player_age_group   text,
  player_skill_level public.skill_level,
  parent_id          uuid,
  parent_name        text,
  parent_email       text,
  parent_phone       text,
  parent_note        text,
  late_cancellation  boolean,
  has_session_note   boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz   text;
  v_from date;
  v_to   date;
begin
  perform public._require_coach();
  select timezone into v_tz from public.app_settings where id = 1;
  v_from := coalesce(p_from, (now() at time zone v_tz)::date);
  v_to   := coalesce(p_to, v_from);
  if v_to < v_from or v_to - v_from > 92 then
    raise exception 'Invalid date range (max 92 days).' using errcode = '22023', hint = 'bad_range';
  end if;

  return query
    select b.id, b.slot_key, b.start_time, b.end_time,
           (b.start_time at time zone v_tz)::date,
           to_char(b.start_time at time zone v_tz, 'FMHH12:MI AM'),
           b.status, b.paid_with, b.payment_status, b.price_cents,
           st.id, st.name, st.max_players,
           pl.id, pl.first_name, pl.age_group, pl.skill_level,
           pr.id, pr.full_name, pr.email, pr.phone,
           b.parent_note, b.late_cancellation,
           exists (select 1 from public.session_notes sn where sn.booking_id = b.id)
    from public.bookings b
    join public.session_types st on st.id = b.session_type_id
    join public.players       pl on pl.id = b.player_id
    join public.profiles      pr on pr.id = b.parent_id
    where b.start_time >= (v_from::timestamp at time zone v_tz)
      and b.start_time <  ((v_to + 1)::timestamp at time zone v_tz)
      and (p_include_cancelled or b.status <> 'cancelled')
    order by b.start_time, st.name, pl.first_name;
end;
$$;

-- ---------------------------------------------------------------------------
-- Dashboard stats (current calendar month in the coach's time zone).
-- "sessions" counts a group session once; "player_sessions" counts each kid.
-- ---------------------------------------------------------------------------
create or replace function public.admin_stats()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz          text;
  v_month_start timestamptz;
  v_month_end   timestamptz;
  v_result      jsonb;
begin
  perform public._require_coach();
  select timezone into v_tz from public.app_settings where id = 1;
  v_month_start := date_trunc('month', now() at time zone v_tz) at time zone v_tz;
  v_month_end   := (date_trunc('month', now() at time zone v_tz) + interval '1 month') at time zone v_tz;

  select jsonb_build_object(
    'timezone',     v_tz,
    'month_start',  v_month_start,
    'sessions_this_month', (
      select count(distinct b.slot_key) from public.bookings b
      where b.start_time >= v_month_start and b.start_time < v_month_end
        and b.status in ('booked', 'completed', 'no_show')),
    'player_sessions_this_month', (
      select count(*) from public.bookings b
      where b.start_time >= v_month_start and b.start_time < v_month_end
        and b.status in ('booked', 'completed', 'no_show')),
    'completed_this_month', (
      select count(distinct b.slot_key) from public.bookings b
      where b.start_time >= v_month_start and b.start_time < v_month_end
        and b.status = 'completed'),
    'no_shows_this_month', (
      select count(*) from public.bookings b
      where b.start_time >= v_month_start and b.start_time < v_month_end
        and b.status = 'no_show'),
    'revenue_this_month_cents', (
      select coalesce(sum(p.amount_cents - p.amount_refunded_cents), 0) from public.payments p
      where p.created_at >= v_month_start and p.created_at < v_month_end),
    'upcoming_sessions_7_days', (
      select count(distinct b.slot_key) from public.bookings b
      where b.start_time >= now() and b.start_time < now() + interval '7 days'
        and b.status = 'booked'),
    'active_players', (
      select count(distinct b.player_id) from public.bookings b
      where b.start_time >= now() - interval '60 days'
        and b.status in ('booked', 'completed', 'no_show')),
    'total_families', (
      select count(*) from public.profiles where role = 'parent'),
    'new_inquiries', (
      select count(*) from public.inquiries where status = 'new'),
    'unpaid_manual_bookings', (
      select count(*) from public.bookings b
      where b.paid_with = 'manual' and b.payment_status = 'unpaid'
        and b.status in ('booked', 'completed')),
    'outstanding_package_credits', (
      select coalesce(sum(pp.sessions_remaining), 0) from public.package_purchases pp
      where pp.expires_at is null or pp.expires_at > now())
  ) into v_result;

  return v_result;
end;
$$;

-- ---------------------------------------------------------------------------
-- Quick "after the session" form: write/update the note and mark the booking
-- completed (or no_show) in one call.
-- ---------------------------------------------------------------------------
create or replace function public.admin_complete_session(
  p_booking_id  uuid,
  p_skills      text[]                default '{}',
  p_coach_notes text                  default null,
  p_homework    text                  default null,
  p_status      public.booking_status default 'completed'
)
returns public.session_notes
language plpgsql
security definer
set search_path = ''
as $$
declare
  b      public.bookings;
  v_note public.session_notes;
begin
  perform public._require_coach();
  if p_status not in ('completed', 'no_show') then
    raise exception 'Status must be completed or no_show.' using errcode = '22023', hint = 'bad_status';
  end if;

  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = 'P0001', hint = 'booking_not_found';
  end if;
  if b.status not in ('booked', 'completed', 'no_show') then
    raise exception 'Cannot write a note for a % booking.', b.status using errcode = 'P0001', hint = 'bad_status';
  end if;
  if b.start_time > now() then
    raise exception 'This session hasn''t started yet.' using errcode = 'P0001', hint = 'not_started';
  end if;

  update public.bookings set status = p_status where id = b.id and status is distinct from p_status;

  insert into public.session_notes (booking_id, player_id, skills_worked_on, coach_notes, homework)
  values (b.id, b.player_id, coalesce(p_skills, '{}'), nullif(btrim(p_coach_notes), ''), nullif(btrim(p_homework), ''))
  on conflict (booking_id) do update
     set skills_worked_on = excluded.skills_worked_on,
         coach_notes      = excluded.coach_notes,
         homework         = excluded.homework
  returning * into v_note;

  return v_note;
end;
$$;

-- ---------------------------------------------------------------------------
-- Coach changes a booking's attendance status or marks a manual (cash/Venmo)
-- booking as paid. Cancellation is NOT done here; use the booking-actions
-- Edge Function so refunds and emails happen.
-- ---------------------------------------------------------------------------
create or replace function public.admin_set_booking_status(
  p_booking_id     uuid,
  p_status         public.booking_status default null,
  p_payment_status public.payment_status default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  perform public._require_coach();
  select * into b from public.bookings where id = p_booking_id for update;
  if b.id is null then
    raise exception 'Booking not found.' using errcode = 'P0001', hint = 'booking_not_found';
  end if;

  if p_status is not null then
    if p_status not in ('booked', 'completed', 'no_show') then
      raise exception 'Use booking-actions to cancel; status must be booked, completed or no_show.'
        using errcode = '22023', hint = 'bad_status';
    end if;
    if b.status not in ('booked', 'completed', 'no_show') then
      raise exception 'Cannot change a % booking.', b.status using errcode = 'P0001', hint = 'bad_status';
    end if;
    if p_status in ('completed', 'no_show') and b.start_time > now() then
      raise exception 'This session hasn''t started yet.' using errcode = 'P0001', hint = 'not_started';
    end if;
  end if;

  if p_payment_status is not null then
    if b.paid_with <> 'manual' or p_payment_status not in ('unpaid', 'paid') then
      raise exception 'Only manual bookings can be marked paid/unpaid here.'
        using errcode = '22023', hint = 'bad_payment_status';
    end if;
  end if;

  update public.bookings
     set status         = coalesce(p_status, status),
         payment_status = coalesce(p_payment_status, payment_status)
   where id = b.id
  returning * into b;
  return b;
end;
$$;

-- ---------------------------------------------------------------------------
-- Block time off. Either exact instants (p_start/p_end) or whole local days
-- (p_start_date..p_end_date inclusive). Returns the block plus any existing
-- bookings it overlaps, so the coach can cancel/reschedule those.
-- ---------------------------------------------------------------------------
create or replace function public.admin_block_time(
  p_start      timestamptz default null,
  p_end        timestamptz default null,
  p_start_date date        default null,
  p_end_date   date        default null,
  p_reason     text        default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_start timestamptz;
  v_end   timestamptz;
  v_id    uuid;
  v_hits  jsonb;
begin
  perform public._require_coach();
  select timezone into v_tz from public.app_settings where id = 1;

  if p_start_date is not null then
    v_start := p_start_date::timestamp at time zone v_tz;
    v_end   := (coalesce(p_end_date, p_start_date) + 1)::timestamp at time zone v_tz;
  else
    v_start := p_start;
    v_end   := p_end;
  end if;

  if v_start is null or v_end is null or v_end <= v_start then
    raise exception 'Provide a valid start and end.' using errcode = '22023', hint = 'bad_range';
  end if;

  insert into public.blocked_times (start_time, end_time, reason)
  values (v_start, v_end, nullif(btrim(p_reason), ''))
  returning id into v_id;

  select coalesce(jsonb_agg(jsonb_build_object(
           'booking_id', b.id, 'start_time', b.start_time,
           'player_first_name', pl.first_name, 'status', b.status)
           order by b.start_time), '[]'::jsonb)
    into v_hits
  from public.bookings b
  join public.players pl on pl.id = b.player_id
  where b.status in ('booked', 'pending_payment')
    and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(v_start, v_end, '[)');

  return jsonb_build_object('blocked_time_id', v_id, 'start_time', v_start, 'end_time', v_end,
                            'conflicting_bookings', v_hits);
end;
$$;
