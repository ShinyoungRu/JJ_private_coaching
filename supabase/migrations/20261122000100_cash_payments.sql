-- =============================================================================
-- JJ Private Training app - 10: "Pay cash in person"
--
-- Lets a client book without paying up front and hand the coach cash at the
-- session. These bookings reuse paid_with = 'manual' (the same method the
-- coach's own cash/Venmo bookings use), so the existing "Unpaid (cash/Venmo)"
-- badge, the dashboard's unpaid count and "mark paid" all work unchanged.
-- =============================================================================

-- The coach can switch the option off in Settings.
alter table public.app_settings
  add column allow_cash_payments boolean not null default true;

comment on column public.app_settings.allow_cash_payments is
  'Clients may book and pay cash in person (booking is created unpaid, paid_with = manual).';

-- ---------------------------------------------------------------------------
-- Book now, pay cash at the session. Confirmed right away, payment_status
-- 'unpaid' until the coach marks it paid (admin_set_booking_status).
-- ---------------------------------------------------------------------------
create or replace function public.book_with_cash(
  p_actor           uuid,
  p_player_id       uuid,
  p_session_type_id uuid,
  p_start           timestamptz,
  p_parent_note     text    default null,
  p_hours           integer default 1
)
returns public.bookings
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_end     timestamptz;
  v_price   integer;
  v_booking public.bookings;
begin
  if not (select allow_cash_payments from public.app_settings where id = 1) then
    raise exception 'Paying cash in person is not available right now. Please pay by card.'
      using errcode = 'P0001', hint = 'cash_disabled';
  end if;

  perform public.lock_booking_calendar();
  perform public.release_expired_holds();
  perform public._assert_player_owned(p_actor, p_player_id);

  -- Anti-abuse: at most 3 upcoming unpaid cash sessions per client.
  if (select count(*) from public.bookings
      where parent_id = p_actor
        and paid_with = 'manual'
        and payment_status = 'unpaid'
        and status = 'booked'
        and end_time > now()) >= 3 then
    raise exception 'You already have 3 upcoming sessions to pay in person. Please pay by card or use a package for this one.'
      using errcode = 'P0001', hint = 'too_many_unpaid';
  end if;

  v_end := public._assert_slot_available(p_session_type_id, p_start, null, true, p_hours);

  select price_cents * p_hours into v_price from public.session_types where id = p_session_type_id;

  insert into public.bookings (
    session_type_id, player_id, parent_id, start_time, end_time, hours,
    status, paid_with, payment_status, price_cents, parent_note
  ) values (
    p_session_type_id, p_player_id, p_actor, p_start, v_end, p_hours,
    'booked', 'manual', 'unpaid', v_price, nullif(btrim(p_parent_note), '')
  )
  returning * into v_booking;

  return v_booking;
end;
$$;

-- service_role only (the booking-actions Edge Function calls it).
revoke execute on function public.book_with_cash(uuid, uuid, uuid, timestamptz, text, integer)
  from public, anon, authenticated;
grant execute on function public.book_with_cash(uuid, uuid, uuid, timestamptz, text, integer)
  to service_role;
