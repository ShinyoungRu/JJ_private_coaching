-- =============================================================================
-- JJ Private Training app - 05: booking logic
--
-- Slot generation = weekly availability
--                   - blocked_times
--                   - existing bookings (other sessions, or full group slots)
--                   - too-soon / too-far-ahead times
--
-- Every function that WRITES bookings:
--   * takes the calendar lock first (no race between two parents)
--   * re-checks the slot with the same generator the calendar uses
--   * is callable only by the service role (i.e. from Edge Functions, which
--     verify the user's JWT and pass the verified user id as p_actor)
-- On top of that, the bookings_no_overlap exclusion constraint and the
-- bookings_enforce_rules capacity trigger are the last line of defence.
--
-- Errors are raised with errcode P0001 and a machine-readable HINT
-- (slot_unavailable, slot_full, no_credits, outside_window, ...) that the
-- Edge Functions pass to the frontend as `code`.
-- =============================================================================

-- Expire unpaid Stripe holds whose time ran out (also run by pg_cron).
create or replace function public.release_expired_holds()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  update public.bookings
     set status        = 'cancelled',
         cancelled_at  = now(),
         cancel_reason = 'hold_expired'
   where status = 'pending_payment'
     and hold_expires_at < now();
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Core slot generator (internal). Dates are calendar days in the coach's
-- time zone. Returns only times, never who booked them.
-- ---------------------------------------------------------------------------
create or replace function public._compute_slots(
  p_session_type_id   uuid,
  p_from              date,
  p_to                date,
  p_ignore_booking_id uuid    default null,
  p_enforce_notice    boolean default true
)
returns table (slot_start timestamptz, slot_end timestamptz, capacity integer, spots_left integer)
language sql
stable
security definer
set search_path = ''
as $$
  with cfg as (
    select * from public.app_settings where id = 1
  ),
  st as (
    select id, duration_minutes, max_players
    from public.session_types
    where id = p_session_type_id and active
  ),
  days as (
    select gs::date as d
    from generate_series(p_from::timestamp, p_to::timestamp, interval '1 day') gs
  ),
  windows as (
    -- local wall-clock window -> absolute UTC instants (DST-safe)
    select (days.d + a.start_time) at time zone cfg.timezone as w_start,
           (days.d + a.end_time)   at time zone cfg.timezone as w_end
    from days
    cross join cfg
    join public.availability a
      on a.active and a.day_of_week = extract(dow from days.d)
  ),
  candidates as (
    select distinct
           gs                                            as slot_start,
           gs + make_interval(mins => st.duration_minutes) as slot_end,
           st.max_players                                as capacity,
           st.id                                         as session_type_id
    from windows
    cross join st
    cross join cfg
    cross join lateral generate_series(
      windows.w_start,
      windows.w_end - make_interval(mins => st.duration_minutes),
      make_interval(mins => cfg.slot_interval_minutes)
    ) gs
  )
  select c.slot_start,
         c.slot_end,
         c.capacity,
         (c.capacity - coalesce(taken.n, 0))::integer as spots_left
  from candidates c
  cross join cfg
  left join lateral (
    select count(*) as n
    from public.bookings b
    where b.session_type_id = c.session_type_id
      and b.start_time = c.slot_start
      and b.id is distinct from p_ignore_booking_id
      and (b.status in ('booked', 'completed', 'no_show')
           or (b.status = 'pending_payment' and b.hold_expires_at > now()))
  ) taken on true
  where c.slot_start > now()
    and (not p_enforce_notice
         or (c.slot_start >= now() + make_interval(hours => cfg.min_booking_notice_hours)
             and c.slot_start <  now() + make_interval(days  => cfg.max_booking_days_ahead)))
    -- not inside a blocked period
    and not exists (
      select 1 from public.blocked_times bt
      where tstzrange(bt.start_time, bt.end_time, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
    )
    -- coach isn't already in a different session at that time
    and not exists (
      select 1 from public.bookings b
      where b.id is distinct from p_ignore_booking_id
        and (b.status in ('booked', 'completed', 'no_show')
             or (b.status = 'pending_payment' and b.hold_expires_at > now()))
        and tstzrange(b.start_time, b.end_time, '[)') && tstzrange(c.slot_start, c.slot_end, '[)')
        and (b.session_type_id <> c.session_type_id or b.start_time <> c.slot_start)
    )
    -- group slot not full
    and coalesce(taken.n, 0) < c.capacity
  order by c.slot_start;
$$;

-- ---------------------------------------------------------------------------
-- Public-facing slot list for the booking calendar (logged-in users).
-- p_from / p_to are dates in the coach's time zone; default = next 14 days.
-- ---------------------------------------------------------------------------
create or replace function public.get_available_slots(
  p_session_type_id uuid,
  p_from            date default null,
  p_to              date default null
)
returns table (slot_start timestamptz, slot_end timestamptz, capacity integer, spots_left integer)
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
  select timezone into v_tz from public.app_settings where id = 1;
  v_from := coalesce(p_from, (now() at time zone v_tz)::date);
  v_to   := coalesce(p_to, v_from + 13);
  if v_to < v_from then
    raise exception 'p_to must be on or after p_from.' using errcode = '22023', hint = 'bad_range';
  end if;
  if v_to - v_from > 62 then
    raise exception 'Date range too large (max 62 days).' using errcode = '22023', hint = 'bad_range';
  end if;
  return query
    select * from public._compute_slots(p_session_type_id, v_from, v_to, null, true);
end;
$$;

-- ---------------------------------------------------------------------------
-- "Next available sessions" across all active session types (used by the
-- public-availability Edge Function). Times + session type only.
-- ---------------------------------------------------------------------------
create or replace function public.public_next_slots(
  p_limit           integer default 10,
  p_session_type_id uuid    default null
)
returns table (session_type_id uuid, session_type_name text, slot_start timestamptz, slot_end timestamptz)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz    text;
  v_days  integer;
  v_today date;
begin
  select timezone, least(max_booking_days_ahead, 62) into v_tz, v_days
  from public.app_settings where id = 1;
  v_today := (now() at time zone v_tz)::date;

  return query
    select st.id, st.name, s.slot_start, s.slot_end
    from public.session_types st
    cross join lateral public._compute_slots(st.id, v_today, v_today + v_days, null, true) s
    where st.active
      and (p_session_type_id is null or st.id = p_session_type_id)
    order by s.slot_start, st.sort_order
    limit greatest(1, least(coalesce(p_limit, 10), 50));
end;
$$;

-- ---------------------------------------------------------------------------
-- Internal: raise unless p_start is a currently bookable slot; return its end.
-- ---------------------------------------------------------------------------
create or replace function public._assert_slot_available(
  p_session_type_id   uuid,
  p_start             timestamptz,
  p_ignore_booking_id uuid,
  p_enforce_notice    boolean
)
returns timestamptz
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz  text;
  v_day date;
  v_end timestamptz;
begin
  select timezone into v_tz from public.app_settings where id = 1;
  v_day := (p_start at time zone v_tz)::date;

  select s.slot_end into v_end
  from public._compute_slots(p_session_type_id, v_day, v_day, p_ignore_booking_id, p_enforce_notice) s
  where s.slot_start = p_start and s.spots_left > 0;

  if v_end is null then
    raise exception 'That time is no longer available. Please pick another slot.'
      using errcode = 'P0001', hint = 'slot_unavailable';
  end if;
  return v_end;
end;
$$;

-- Internal: raise unless the player is an active player on the parent's account.
create or replace function public._assert_player_owned(p_parent_id uuid, p_player_id uuid)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.players
    where id = p_player_id and parent_id = p_parent_id and active
  ) then
    raise exception 'That player is not on your account.'
      using errcode = 'P0001', hint = 'player_not_found';
  end if;
end;
$$;

-- Internal: lock and consume one package credit. Prefers credits tied to this
-- session type, then the ones expiring soonest.
create or replace function public._take_package_credit(
  p_parent_id       uuid,
  p_session_type_id uuid,
  p_start           timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase_id uuid;
begin
  select pp.id into v_purchase_id
  from public.package_purchases pp
  where pp.parent_id = p_parent_id
    and pp.sessions_remaining > 0
    and (pp.expires_at is null or pp.expires_at > p_start)
    and (pp.session_type_id is null or pp.session_type_id = p_session_type_id)
  order by (pp.session_type_id is null), pp.expires_at asc nulls last, pp.purchased_at asc
  limit 1
  for update;

  if v_purchase_id is null then
    raise exception 'You have no package credits that can be used for this session.'
      using errcode = 'P0001', hint = 'no_credits';
  end if;

  update public.package_purchases
     set sessions_remaining = sessions_remaining - 1
   where id = v_purchase_id;

  return v_purchase_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Book using a package credit (instant, no Stripe).
-- ---------------------------------------------------------------------------
create or replace function public.book_with_package(
  p_actor           uuid,
  p_player_id       uuid,
  p_session_type_id uuid,
  p_start           timestamptz,
  p_parent_note     text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end         timestamptz;
  v_purchase_id uuid;
  v_booking     public.bookings;
begin
  perform public.lock_booking_calendar();
  perform public.release_expired_holds();
  perform public._assert_player_owned(p_actor, p_player_id);

  v_end := public._assert_slot_available(p_session_type_id, p_start, null, true);
  v_purchase_id := public._take_package_credit(p_actor, p_session_type_id, p_start);

  insert into public.bookings (
    session_type_id, player_id, parent_id, start_time, end_time,
    status, paid_with, payment_status, package_purchase_id, price_cents, parent_note
  ) values (
    p_session_type_id, p_player_id, p_actor, p_start, v_end,
    'booked', 'package', 'paid', v_purchase_id, 0, nullif(btrim(p_parent_note), '')
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Hold a slot while the parent pays on Stripe Checkout.
-- The stripe-webhook confirms it; release_expired_holds() frees it otherwise.
-- ---------------------------------------------------------------------------
create or replace function public.create_pending_booking(
  p_actor           uuid,
  p_player_id       uuid,
  p_session_type_id uuid,
  p_start           timestamptz,
  p_parent_note     text default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end     timestamptz;
  v_price   integer;
  v_hold    integer;
  v_booking public.bookings;
begin
  perform public.lock_booking_calendar();
  perform public.release_expired_holds();
  perform public._assert_player_owned(p_actor, p_player_id);

  -- Anti-abuse: a parent can't hold more than 3 unpaid slots at once.
  if (select count(*) from public.bookings
      where parent_id = p_actor and status = 'pending_payment') >= 3 then
    raise exception 'You have unfinished checkouts. Complete or cancel them first.'
      using errcode = 'P0001', hint = 'too_many_holds';
  end if;

  v_end := public._assert_slot_available(p_session_type_id, p_start, null, true);

  select price_cents into v_price from public.session_types where id = p_session_type_id;
  select payment_hold_minutes into v_hold from public.app_settings where id = 1;

  insert into public.bookings (
    session_type_id, player_id, parent_id, start_time, end_time,
    status, paid_with, payment_status, price_cents, hold_expires_at, parent_note
  ) values (
    p_session_type_id, p_player_id, p_actor, p_start, v_end,
    'pending_payment', 'stripe', 'unpaid', v_price,
    now() + make_interval(mins => v_hold), nullif(btrim(p_parent_note), '')
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Called by stripe-webhook after Stripe says the Checkout Session is paid.
-- Returns: confirmed | already_confirmed | conflict | not_found | session_mismatch
--   conflict = payment arrived after the hold expired AND the slot was taken
--              (or the parent cancelled). The webhook refunds automatically.
-- ---------------------------------------------------------------------------
create or replace function public.confirm_stripe_booking(
  p_booking_id          uuid,
  p_checkout_session_id text,
  p_payment_intent_id   text,
  p_amount_cents        integer,
  p_currency            text default 'usd'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.bookings;
begin
  perform public.lock_booking_calendar();

  select * into b from public.bookings where id = p_booking_id for update;
  if not found then
    return 'not_found';
  end if;
  if b.stripe_checkout_session_id is not null
     and b.stripe_checkout_session_id <> p_checkout_session_id then
    return 'session_mismatch';
  end if;

  -- Record the money first (idempotent on the Checkout Session id).
  insert into public.payments (
    parent_id, booking_id, stripe_checkout_session_id, stripe_payment_intent_id,
    amount_cents, currency
  ) values (
    b.parent_id, b.id, p_checkout_session_id, p_payment_intent_id,
    coalesce(p_amount_cents, 0), coalesce(p_currency, 'usd')
  )
  on conflict (stripe_checkout_session_id) do nothing;

  if b.payment_status in ('paid', 'refunded') then
    return 'already_confirmed';
  end if;

  if b.status = 'pending_payment' then
    update public.bookings
       set status                     = 'booked',
           payment_status             = 'paid',
           hold_expires_at            = null,
           stripe_checkout_session_id = p_checkout_session_id,
           stripe_payment_intent_id   = p_payment_intent_id
     where id = b.id;
    return 'confirmed';
  end if;

  if b.status = 'cancelled' and b.cancel_reason = 'hold_expired' then
    -- Payment landed after the hold lapsed. Re-book if the slot is still free.
    begin
      perform public._assert_slot_available(b.session_type_id, b.start_time, b.id, false);
      update public.bookings
         set status                     = 'booked',
             payment_status             = 'paid',
             hold_expires_at            = null,
             cancelled_at               = null,
             cancelled_by               = null,
             cancel_reason              = null,
             stripe_checkout_session_id = p_checkout_session_id,
             stripe_payment_intent_id   = p_payment_intent_id
       where id = b.id;
      return 'confirmed';
    exception
      when sqlstate 'P0001' or sqlstate '23P01' or sqlstate '23505' then
        null; -- fall through to conflict
    end;
  end if;

  update public.bookings
     set payment_status             = 'paid',
         stripe_checkout_session_id = p_checkout_session_id,
         stripe_payment_intent_id   = p_payment_intent_id,
         cancel_reason              = coalesce(cancel_reason, 'cancelled') || ' / paid after cancellation - refunding'
   where id = b.id;
  return 'conflict';
end;
$$;

-- ---------------------------------------------------------------------------
-- Called by stripe-webhook when a package Checkout Session is paid.
-- Returns the new purchase, or NULL if this session was already processed.
-- ---------------------------------------------------------------------------
create or replace function public.grant_package_purchase(
  p_parent_id           uuid,
  p_package_id          uuid,
  p_checkout_session_id text,
  p_payment_intent_id   text,
  p_amount_cents        integer,
  p_currency            text default 'usd'
)
returns public.package_purchases
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_purchase public.package_purchases;
begin
  insert into public.package_purchases (
    parent_id, package_id, session_type_id, source, label,
    sessions_total, sessions_remaining, amount_paid_cents,
    stripe_payment_id, stripe_checkout_session_id, expires_at
  )
  select p_parent_id, pk.id, pk.session_type_id, 'purchase', pk.name,
         pk.session_count, pk.session_count, coalesce(p_amount_cents, 0),
         p_payment_intent_id, p_checkout_session_id,
         case when pk.validity_days is null then null
              else now() + make_interval(days => pk.validity_days) end
  from public.packages pk
  where pk.id = p_package_id
  on conflict (stripe_checkout_session_id) do nothing
  returning * into v_purchase;

  if v_purchase.id is null then
    if not exists (select 1 from public.packages where id = p_package_id) then
      raise exception 'Package % not found', p_package_id using errcode = 'P0001', hint = 'package_not_found';
    end if;
    return null;  -- already processed
  end if;

  insert into public.payments (
    parent_id, package_purchase_id, stripe_checkout_session_id, stripe_payment_intent_id,
    amount_cents, currency
  ) values (
    p_parent_id, v_purchase.id, p_checkout_session_id, p_payment_intent_id,
    coalesce(p_amount_cents, 0), coalesce(p_currency, 'usd')
  )
  on conflict (stripe_checkout_session_id) do nothing;

  return v_purchase;
end;
$$;

-- ---------------------------------------------------------------------------
-- Cancel a booking (parent: own bookings, subject to policy; coach: any,
-- always "within policy").
-- Returns jsonb { booking_id, action, within_policy, payment_intent_id, ... }
-- action: released_hold | credit_returned | session_credit | stripe_refund
--         | forfeited | none
-- For stripe_refund, the Edge Function issues the Stripe refund and then
-- calls record_stripe_refund().
-- ---------------------------------------------------------------------------
create or replace function public.cancel_booking(
  p_actor      uuid,
  p_booking_id uuid,
  p_reason     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b           public.bookings;
  cfg         public.app_settings;
  v_is_coach  boolean;
  v_within    boolean;
  v_action    text;
  v_credit_id uuid;
  v_st_name   text;
begin
  perform public.lock_booking_calendar();
  select * into cfg from public.app_settings where id = 1;

  select * into b from public.bookings where id = p_booking_id for update;
  v_is_coach := public.has_role(p_actor, 'coach');

  if b.id is null or (not v_is_coach and b.parent_id <> p_actor) then
    raise exception 'Booking not found.' using errcode = 'P0001', hint = 'booking_not_found';
  end if;
  if b.status not in ('booked', 'pending_payment') then
    raise exception 'This booking can no longer be cancelled.'
      using errcode = 'P0001', hint = 'not_cancellable';
  end if;
  if not v_is_coach and b.start_time <= now() then
    raise exception 'This session has already started.'
      using errcode = 'P0001', hint = 'already_started';
  end if;

  v_within := v_is_coach
              or b.status = 'pending_payment'
              or (b.start_time - now()) >= make_interval(hours => cfg.cancellation_window_hours);

  update public.bookings
     set status            = 'cancelled',
         cancelled_at      = now(),
         cancelled_by      = p_actor,
         cancel_reason     = coalesce(
                               nullif(left(btrim(p_reason), 300), ''),
                               case when v_is_coach then 'Cancelled by coach' else 'Cancelled by parent' end),
         late_cancellation = not v_within,
         hold_expires_at   = null
   where id = b.id;

  if b.status = 'pending_payment' then
    v_action := 'released_hold';

  elsif b.paid_with = 'package' then
    if v_within then
      update public.package_purchases
         set sessions_remaining = least(sessions_remaining + 1, sessions_total)
       where id = b.package_purchase_id;
      update public.bookings set payment_status = 'refunded' where id = b.id;
      v_action := 'credit_returned';
    else
      v_action := 'forfeited';
    end if;

  elsif b.paid_with = 'stripe' and b.payment_status = 'paid' then
    if not v_within then
      v_action := 'forfeited';
    elsif cfg.stripe_cancellation_refund = 'session_credit' and not v_is_coach then
      select name into v_st_name from public.session_types where id = b.session_type_id;
      insert into public.package_purchases (
        parent_id, session_type_id, source, label, sessions_total, sessions_remaining, expires_at
      ) values (
        b.parent_id, b.session_type_id, 'cancellation_credit',
        left('Credit: cancelled ' || coalesce(v_st_name, 'session'), 120), 1, 1,
        case when cfg.credit_validity_days is null then null
             else now() + make_interval(days => cfg.credit_validity_days) end
      )
      returning id into v_credit_id;
      update public.bookings set payment_status = 'refunded' where id = b.id;
      v_action := 'session_credit';
    else
      v_action := 'stripe_refund';
    end if;

  else
    v_action := 'none';
  end if;

  return jsonb_build_object(
    'booking_id',          b.id,
    'previous_status',     b.status,
    'action',              v_action,
    'within_policy',       v_within,
    'cancelled_by_coach',  v_is_coach,
    'paid_with',           b.paid_with,
    'payment_intent_id',   b.stripe_payment_intent_id,
    'checkout_session_id', b.stripe_checkout_session_id,
    'amount_cents',        b.price_cents,
    'credit_id',           v_credit_id
  );
end;
$$;

-- ---------------------------------------------------------------------------
-- Record a Stripe refund (after booking-actions refunds, or from the
-- charge.refunded webhook when the coach refunds in the Stripe dashboard).
-- p_total_refunded_cents = TOTAL refunded so far on that PaymentIntent.
-- ---------------------------------------------------------------------------
create or replace function public.record_stripe_refund(
  p_payment_intent_id    text,
  p_total_refunded_cents integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.payments p
     set amount_refunded_cents = greatest(p.amount_refunded_cents, least(p_total_refunded_cents, p.amount_cents)),
         status = case
                    when greatest(p.amount_refunded_cents, least(p_total_refunded_cents, p.amount_cents)) >= p.amount_cents
                      then 'refunded'
                    when greatest(p.amount_refunded_cents, least(p_total_refunded_cents, p.amount_cents)) > 0
                      then 'partially_refunded'
                    else 'paid'
                  end,
         refunded_at = coalesce(p.refunded_at, now())
   where p.stripe_payment_intent_id = p_payment_intent_id;

  -- A fully refunded single-session payment marks the booking refunded.
  update public.bookings b
     set payment_status = 'refunded'
    from public.payments p
   where p.stripe_payment_intent_id = p_payment_intent_id
     and p.booking_id = b.id
     and p.status = 'refunded'
     and b.payment_status <> 'refunded';
end;
$$;

-- ---------------------------------------------------------------------------
-- Reschedule (parent: outside the cancellation window only; coach: any time).
-- Keeps the original payment. Returns jsonb { booking_id, old_start, new_start }.
-- ---------------------------------------------------------------------------
create or replace function public.reschedule_booking(
  p_actor      uuid,
  p_booking_id uuid,
  p_new_start  timestamptz
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  b          public.bookings;
  cfg        public.app_settings;
  v_is_coach boolean;
  v_end      timestamptz;
begin
  perform public.lock_booking_calendar();
  perform public.release_expired_holds();
  select * into cfg from public.app_settings where id = 1;

  select * into b from public.bookings where id = p_booking_id for update;
  v_is_coach := public.has_role(p_actor, 'coach');

  if b.id is null or (not v_is_coach and b.parent_id <> p_actor) then
    raise exception 'Booking not found.' using errcode = 'P0001', hint = 'booking_not_found';
  end if;
  if b.status <> 'booked' then
    raise exception 'Only upcoming booked sessions can be rescheduled.'
      using errcode = 'P0001', hint = 'not_reschedulable';
  end if;
  if not v_is_coach
     and (b.start_time - now()) < make_interval(hours => cfg.cancellation_window_hours) then
    raise exception 'Sessions can only be rescheduled more than % hours in advance.', cfg.cancellation_window_hours
      using errcode = 'P0001', hint = 'outside_window';
  end if;
  if p_new_start = b.start_time then
    raise exception 'That is the current time for this session.'
      using errcode = 'P0001', hint = 'same_time';
  end if;

  v_end := public._assert_slot_available(b.session_type_id, p_new_start, b.id, not v_is_coach);

  update public.bookings
     set start_time       = p_new_start,
         end_time         = v_end,
         reminder_sent_at = null
   where id = b.id;

  return jsonb_build_object('booking_id', b.id, 'old_start', b.start_time, 'new_start', p_new_start);
end;
$$;

-- ---------------------------------------------------------------------------
-- Coach creates a booking for a family (cash/Venmo/comp, or using their
-- package credits). p_override_availability lets the coach book outside the
-- published hours; overlap + capacity rules still apply.
-- ---------------------------------------------------------------------------
create or replace function public.admin_create_booking(
  p_actor                 uuid,
  p_player_id             uuid,
  p_session_type_id       uuid,
  p_start                 timestamptz,
  p_use_package           boolean default false,
  p_override_availability boolean default false,
  p_note                  text    default null
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_parent_id   uuid;
  v_end         timestamptz;
  v_duration    integer;
  v_price       integer;
  v_purchase_id uuid;
  v_booking     public.bookings;
begin
  if not public.has_role(p_actor, 'coach') then
    raise exception 'Coach only.' using errcode = '42501', hint = 'forbidden';
  end if;

  perform public.lock_booking_calendar();
  perform public.release_expired_holds();

  select parent_id into v_parent_id from public.players where id = p_player_id and active;
  if v_parent_id is null then
    raise exception 'Player not found.' using errcode = 'P0001', hint = 'player_not_found';
  end if;

  select duration_minutes, price_cents into v_duration, v_price
  from public.session_types where id = p_session_type_id;
  if v_duration is null then
    raise exception 'Session type not found.' using errcode = 'P0001', hint = 'session_type_not_found';
  end if;

  if p_override_availability then
    v_end := p_start + make_interval(mins => v_duration);
  else
    v_end := public._assert_slot_available(p_session_type_id, p_start, null, false);
  end if;

  if p_use_package then
    v_purchase_id := public._take_package_credit(v_parent_id, p_session_type_id, p_start);
  end if;

  insert into public.bookings (
    session_type_id, player_id, parent_id, start_time, end_time,
    status, paid_with, payment_status, package_purchase_id, price_cents, parent_note
  ) values (
    p_session_type_id, p_player_id, v_parent_id, p_start, v_end,
    'booked',
    case when p_use_package then 'package'::public.payment_method else 'manual'::public.payment_method end,
    case when p_use_package then 'paid'::public.payment_status   else 'unpaid'::public.payment_status end,
    v_purchase_id,
    case when p_use_package then 0 else v_price end,
    nullif(btrim(p_note), '')
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- ---------------------------------------------------------------------------
-- Reminders: atomically claim bookings that need a reminder (safe if two
-- cron runs overlap). Bookings made inside the reminder window are skipped,
-- since their confirmation email already went out.
-- ---------------------------------------------------------------------------
create or replace function public.claim_due_reminders(p_limit integer default 50)
returns table (
  booking_id        uuid,
  start_time        timestamptz,
  end_time          timestamptz,
  parent_email      text,
  parent_name       text,
  player_first_name text,
  session_type_name text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_hours integer;
begin
  select reminder_hours_before into v_hours from public.app_settings where id = 1;

  return query
  with due as (
    select b.id
    from public.bookings b
    where b.status = 'booked'
      and b.reminder_sent_at is null
      and b.start_time > now()
      and b.start_time <= now() + make_interval(hours => v_hours)
      and b.created_at <= b.start_time - make_interval(hours => v_hours)
    order by b.start_time
    limit greatest(1, least(coalesce(p_limit, 50), 200))
    for update of b skip locked
  ),
  claimed as (
    update public.bookings bk
       set reminder_sent_at = now()
      from due
     where bk.id = due.id
    returning bk.id, bk.start_time, bk.end_time, bk.parent_id, bk.player_id, bk.session_type_id
  )
  select c.id, c.start_time, c.end_time, pr.email, pr.full_name, pl.first_name, st.name
  from claimed c
  join public.profiles      pr on pr.id = c.parent_id
  join public.players       pl on pl.id = c.player_id
  join public.session_types st on st.id = c.session_type_id;
end;
$$;

-- If a reminder email fails, put the booking back in the queue.
create or replace function public.unclaim_reminders(p_booking_ids uuid[])
returns void
language sql
security definer
set search_path = ''
as $$
  update public.bookings set reminder_sent_at = null where id = any (p_booking_ids);
$$;

-- ---------------------------------------------------------------------------
-- Announcement recipients.
--   all       -> every parent who hasn't opted out
--   today     -> parents with a session today (sent regardless of opt-out:
--                it's about their booking, e.g. "field closed today")
--   this_week -> parents with a session in the next 7 days (same rule)
-- ---------------------------------------------------------------------------
create or replace function public.announcement_recipients(p_audience text default 'all')
returns table (parent_id uuid, email text, full_name text)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_tz        text;
  v_day_start timestamptz;
begin
  select timezone into v_tz from public.app_settings where id = 1;
  v_day_start := ((now() at time zone v_tz)::date)::timestamp at time zone v_tz;

  if p_audience = 'all' then
    return query
      select p.id, p.email, p.full_name
      from public.profiles p
      where p.role = 'parent' and p.announcements_opt_in and p.email is not null;
  elsif p_audience in ('today', 'this_week') then
    return query
      select distinct p.id, p.email, p.full_name
      from public.bookings b
      join public.profiles p on p.id = b.parent_id
      where b.status = 'booked'
        and p.email is not null
        and b.start_time >= greatest(now() - interval '3 hours', v_day_start)
        and b.start_time < case when p_audience = 'today'
                                then v_day_start + interval '1 day'
                                else v_day_start + interval '7 days' end;
  else
    raise exception 'Unknown audience %', p_audience using errcode = '22023', hint = 'bad_audience';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Public-endpoint rate limiting (fixed window). Returns true if allowed.
-- ---------------------------------------------------------------------------
create or replace function public.check_rate_limit(
  p_key            text,
  p_limit          integer,
  p_window_seconds integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_window timestamptz;
  v_hits   integer;
begin
  v_window := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);

  insert into public.rate_limits as rl (key, window_start, hits)
  values (p_key, v_window, 1)
  on conflict (key, window_start) do update set hits = rl.hits + 1
  returning rl.hits into v_hits;

  -- Opportunistic cleanup of old windows.
  if random() < 0.05 then
    delete from public.rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_hits <= p_limit;
end;
$$;
