-- Booking logic tests: slot generation, double-booking prevention, group
-- capacity, cancellation policy, package credits, Stripe holds/confirmation,
-- reminders, storage access. Run: npx supabase test db
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;
select no_plan();

-- seed ids
--   coach    a...01    parent A a...02 (Mia b...01, Leo b...02, 3 credits for 1-on-1)
--   parent B a...03 (Sam b...03, no credits)
--   1-on-1   c...01 (60 min, max 1)   small group c...02 (60 min, max 4)

create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;
create or replace function pg_temp.credits_a() returns int language sql as $$
  select sessions_remaining from public.package_purchases where id = 'e0000000-0000-4000-8000-000000000001'
$$;

-- Candidate 1-on-1 slots 5-18 days out (each slot n and n+4 are >= 2h apart).
create temp table s as
select row_number() over (order by slot_start) as n, slot_start, slot_end
from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
       (now() at time zone 'America/New_York')::date + 5,
       (now() at time zone 'America/New_York')::date + 18);
grant select on s to authenticated;  -- read while impersonating the coach below

select ok((select count(*) from s) >= 40, 'enough future 1-on-1 slots generated for the tests');
select ok(not exists (
  select 1 from s
  where extract(dow from slot_start at time zone 'America/New_York') in (0, 5)
), 'no slots on Sunday or Friday (no availability those days)');
select ok(not exists (
  select 1 from s
  where (slot_end at time zone 'America/New_York')::time > time '20:00'
    and extract(dow from slot_start at time zone 'America/New_York') between 1 and 4
), 'weekday slots end by 8pm (session fits inside the window)');
select ok(not exists (
  select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001') g
  where g.slot_start < now() + interval '12 hours'
), 'nothing bookable inside the 12h minimum notice');
select ok(not exists (
  select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000003')
), 'inactive session types have no slots');

-- =========================================================================
-- Book with package + double-booking prevention
-- =========================================================================
create temp table b1 as
select * from public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 1));

select is((select status::text from b1), 'booked', 'package booking is immediately booked');
select is((select payment_status::text from b1), 'paid', 'package booking is paid');
select is(pg_temp.credits_a(), 2, 'one package credit was used (3 -> 2)');

select is_empty($$ select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
                     (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) g
                   where g.slot_start = (select slot_start from s where n = 1) $$,
  'booked 1-on-1 slot disappears from the calendar');
select is_empty($$ select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000002',
                     (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) g
                   where tstzrange(g.slot_start, g.slot_end) && tstzrange((select slot_start from s where n = 1), (select slot_end from s where n = 1)) $$,
  'coach is busy: overlapping group slots disappear too');

select throws_ok($$ select public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
                      'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 1)) $$,
  'P0001', 'That time is no longer available. Please pick another slot.', 'second family cannot book the same 1-on-1 slot');

select throws_ok($$ insert into public.bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, slot_key)
                    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
                            (select slot_start from s where n = 1), (select slot_end from s where n = 1), 'booked', 'manual', 'unpaid', '') $$,
  '23P01', null, 'DB constraint blocks an overlapping booking even when inserted directly');

select throws_ok($$ insert into public.bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, slot_key)
                    values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
                            (select slot_start from s where n = 1) + interval '30 minutes', (select slot_end from s where n = 1) + interval '30 minutes',
                            'booked', 'manual', 'unpaid', '') $$,
  '23P01', null, 'DB constraint blocks a partially overlapping booking');

select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003',
                      'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 5)) $$,
  'P0001', 'That player is not on your account.', 'cannot book someone else''s child');

select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
                      'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 5)) $$,
  'P0001', 'You have no package credits that can be used for this session.', 'no credits = cannot book with package');

select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002',
                      'c0000000-0000-4000-8000-000000000002', (select slot_start from s where n = 9)) $$,
  'P0001', 'You have no package credits that can be used for this session.', '1-on-1 package credits cannot be used for group sessions');

select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
                      'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 5) + interval '7 minutes') $$,
  'P0001', 'That time is no longer available. Please pick another slot.', 'arbitrary (non-slot) start times are rejected');

-- =========================================================================
-- Cancellation policy
-- =========================================================================
select throws_ok($$ select public.cancel_booking('a0000000-0000-4000-8000-000000000003', (select id from b1)) $$,
  'P0001', 'Booking not found.', 'parent B cannot cancel parent A''s booking');

select is((public.cancel_booking('a0000000-0000-4000-8000-000000000002', (select id from b1))) ->> 'action', 'credit_returned',
  'cancel more than 24h ahead returns the package credit');
select is(pg_temp.credits_a(), 3, 'credit is back (2 -> 3)');
select is((select payment_status::text from public.bookings where id = (select id from b1)), 'refunded', 'booking marked refunded');
select ok(exists (select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
                     (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) g
                   where g.slot_start = (select slot_start from s where n = 1)),
  'cancelled slot is bookable again');
select throws_ok($$ select public.cancel_booking('a0000000-0000-4000-8000-000000000002', (select id from b1)) $$,
  'P0001', 'This booking can no longer be cancelled.', 'cannot cancel twice');

-- Late cancellation: widen the window so the slot (5+ days out) is "inside" it.
update public.app_settings set cancellation_window_hours = 336 where id = 1;
create temp table b2 as
select * from public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 5));
select is(pg_temp.credits_a(), 2, 'credit used for late-cancel test');
select is((public.cancel_booking('a0000000-0000-4000-8000-000000000002', (select id from b2))) ->> 'action', 'forfeited',
  'cancel inside the window forfeits the session');
select is(pg_temp.credits_a(), 2, 'forfeited credit is NOT returned');
select is((select late_cancellation from public.bookings where id = (select id from b2)), true, 'booking flagged as late cancellation');

-- Coach cancelling is always within policy.
create temp table b3 as
select * from public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 9));
select is((public.cancel_booking('a0000000-0000-4000-8000-000000000001', (select id from b3), 'Coach sick')) ->> 'action', 'credit_returned',
  'coach cancellation returns the credit even inside the window');
update public.app_settings set cancellation_window_hours = 24 where id = 1;

-- =========================================================================
-- Reschedule
-- =========================================================================
create temp table b4 as
select * from public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 13));
select is(pg_temp.credits_a(), 1, 'credit used for reschedule test');
select lives_ok($$ select public.reschedule_booking('a0000000-0000-4000-8000-000000000002', (select id from b4), (select slot_start from s where n = 17)) $$,
  'parent can reschedule outside the window');
select is((select start_time from public.bookings where id = (select id from b4)), (select slot_start from s where n = 17), 'start time moved');
select is(pg_temp.credits_a(), 1, 'reschedule does not use another credit');
select ok(exists (select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
                     (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) g
                   where g.slot_start = (select slot_start from s where n = 13)),
  'old slot is free after reschedule');
update public.app_settings set cancellation_window_hours = 336 where id = 1;
select throws_ok($$ select public.reschedule_booking('a0000000-0000-4000-8000-000000000002', (select id from b4), (select slot_start from s where n = 21)) $$,
  'P0001', 'Sessions can only be rescheduled more than 336 hours in advance.', 'parent cannot reschedule inside the window');
update public.app_settings set cancellation_window_hours = 24 where id = 1;

-- =========================================================================
-- Group capacity
-- =========================================================================
update public.session_types set max_players = 2 where id = 'c0000000-0000-4000-8000-000000000002';
create temp table g as
select slot_start, slot_end from public.get_available_slots('c0000000-0000-4000-8000-000000000002',
  (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18)
order by slot_start desc limit 1;

select lives_ok($$ select public.admin_create_booking('a0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000002',
                     'c0000000-0000-4000-8000-000000000002', (select slot_start from g)) $$, 'coach books Leo into a group slot');
select is((select spots_left from public.get_available_slots('c0000000-0000-4000-8000-000000000002',
             (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) x
           where x.slot_start = (select slot_start from g)), 1, 'group slot shows 1 spot left');
create temp table gsam as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000002', (select slot_start from g));
select is((select status::text from gsam), 'pending_payment', 'Sam holds the second group spot while paying');
select is_empty($$ select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000002',
                     (now() at time zone 'America/New_York')::date + 5, (now() at time zone 'America/New_York')::date + 18) x
                   where x.slot_start = (select slot_start from g) $$, 'full group slot disappears');
select throws_ok($$ select public.create_pending_booking('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
                      'c0000000-0000-4000-8000-000000000002', (select slot_start from g)) $$,
  'P0001', 'That time is no longer available. Please pick another slot.', 'third player rejected by the booking function');
select throws_ok($$ insert into public.bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, slot_key)
                    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                            (select slot_start from g), (select slot_end from g), 'booked', 'manual', 'unpaid', '') $$,
  'P0001', 'Sorry, that session is full.', 'capacity trigger blocks a direct insert into a full group');
update public.session_types set max_players = 4 where id = 'c0000000-0000-4000-8000-000000000002';
select throws_ok($$ insert into public.bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, slot_key)
                    values ('c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
                            (select slot_start from g), (select slot_end from g), 'booked', 'manual', 'unpaid', '') $$,
  '23505', null, 'same player cannot be in the same session twice');

-- =========================================================================
-- Stripe holds + webhook confirmation
-- =========================================================================
update public.bookings set hold_expires_at = now() - interval '1 minute' where id = (select id from gsam);
select ok(public.release_expired_holds() >= 1, 'expired hold is released');
select is((select status::text || '/' || cancel_reason from public.bookings where id = (select id from gsam)), 'cancelled/hold_expired',
  'released hold is cancelled with reason hold_expired');
select is(public.confirm_stripe_booking((select id from gsam), 'cs_test_late', 'pi_test_late', 4500), 'confirmed',
  'late payment re-books the slot when it is still free');
select is((select status::text || '/' || payment_status::text from public.bookings where id = (select id from gsam)), 'booked/paid',
  'late-paid booking is booked and paid');
select is(public.confirm_stripe_booking((select id from gsam), 'cs_test_late', 'pi_test_late', 4500), 'already_confirmed',
  'duplicate webhook delivery is a no-op');
select is((select count(*)::int from public.payments where stripe_checkout_session_id = 'cs_test_late'), 1, 'payment recorded exactly once');

-- conflict: hold expires, someone else books, then the payment lands -> refund path
create temp table hold2 as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 25));
update public.bookings set hold_expires_at = now() - interval '1 minute' where id = (select id from hold2);
select lives_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
                     'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 25)) $$,
  'another family takes the slot after the hold expired');
select is(public.confirm_stripe_booking((select id from hold2), 'cs_test_conflict', 'pi_test_conflict', 9000), 'conflict',
  'payment for a lost slot returns conflict (webhook then auto-refunds)');
select is(public.confirm_stripe_booking((select id from hold2), 'cs_other_session', 'pi_x', 9000), 'session_mismatch',
  'a different checkout session id cannot confirm the booking');

-- Stripe-paid booking cancelled within policy -> stripe_refund
create temp table paid1 as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 29));
update public.bookings set stripe_checkout_session_id = 'cs_test_paid1' where id = (select id from paid1);
select is(public.confirm_stripe_booking((select id from paid1), 'cs_test_paid1', 'pi_test_paid1', 9000), 'confirmed', 'normal webhook confirmation');
select is((public.cancel_booking('a0000000-0000-4000-8000-000000000003', (select id from paid1))) ->> 'action', 'stripe_refund',
  'cancelling a card-paid session within policy asks for a Stripe refund');
select lives_ok($$ select public.record_stripe_refund('pi_test_paid1', 9000) $$, 'refund recorded');
select is((select status from public.payments where stripe_payment_intent_id = 'pi_test_paid1'), 'refunded', 'payment marked refunded');
select is((select payment_status::text from public.bookings where id = (select id from paid1)), 'refunded', 'booking marked refunded');

-- session_credit mode
update public.app_settings set stripe_cancellation_refund = 'session_credit' where id = 1;
create temp table paid2 as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 33));
select is(public.confirm_stripe_booking((select id from paid2), 'cs_test_paid2', 'pi_test_paid2', 9000), 'confirmed', 'second card booking confirmed');
select is((public.cancel_booking('a0000000-0000-4000-8000-000000000003', (select id from paid2))) ->> 'action', 'session_credit',
  'in session_credit mode the parent gets a credit instead of a card refund');
select is((select sessions_remaining from public.package_purchases
           where parent_id = 'a0000000-0000-4000-8000-000000000003' and source = 'cancellation_credit'), 1,
  'parent B now has a 1-session credit');
update public.app_settings set stripe_cancellation_refund = 'stripe_refund' where id = 1;

-- pending checkout cancelled by the parent (backed out of Stripe)
create temp table hold3 as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 37));
select is((public.cancel_booking('a0000000-0000-4000-8000-000000000003', (select id from hold3))) ->> 'action', 'released_hold',
  'backing out of checkout releases the hold');
select is(public.confirm_stripe_booking((select id from hold3), 'cs_test_hold3', 'pi_test_hold3', 9000), 'conflict',
  'a payment that still lands after the parent cancelled is refunded, not booked');

-- too many open checkouts
insert into public.bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, hold_expires_at, slot_key)
select 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
       now() + make_interval(days => 300 + i), now() + make_interval(days => 300 + i) + interval '1 hour',
       'pending_payment', 'stripe', 'unpaid', now() + interval '30 minutes', ''
from generate_series(1, 3) i;
select throws_ok($$ select public.create_pending_booking('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
                      'c0000000-0000-4000-8000-000000000001', (select slot_start from s where n = 41)) $$,
  'P0001', 'You have unfinished checkouts. Complete or cancel them first.', 'max 3 open checkouts per parent');

-- package purchase via webhook is idempotent
select is((public.grant_package_purchase('a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003',
           'cs_test_pkg', 'pi_test_pkg', 20000)).sessions_remaining, 5, 'package purchase grants 5 credits');
select ok((public.grant_package_purchase('a0000000-0000-4000-8000-000000000003', 'd0000000-0000-4000-8000-000000000003',
           'cs_test_pkg', 'pi_test_pkg', 20000)).id is null, 'replayed webhook does not grant credits twice');

-- =========================================================================
-- Blocked time
-- =========================================================================
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select is(jsonb_array_length((public.admin_block_time(p_start_date => ((select slot_start from s where n = 17) at time zone 'America/New_York')::date,
                                                      p_reason => 'Field closed')) -> 'conflicting_bookings'), 1,
  'blocking a day reports the existing booking that day');
select pg_temp.reset_role();
select is_empty($$ select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
                     ((select slot_start from s where n = 17) at time zone 'America/New_York')::date,
                     ((select slot_start from s where n = 17) at time zone 'America/New_York')::date) $$,
  'no slots on a blocked day');

-- =========================================================================
-- Reminders
-- =========================================================================
insert into public.bookings (id, session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, created_at, slot_key)
values ('f0000000-0000-4000-8000-0000000000aa', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003',
        'a0000000-0000-4000-8000-000000000003', now() + interval '20 hours', now() + interval '21 hours',
        'booked', 'manual', 'paid', now() - interval '3 days', '');
select ok(exists (select 1 from public.claim_due_reminders() where booking_id = 'f0000000-0000-4000-8000-0000000000aa'),
  'booking 20h out is claimed for a reminder');
select ok(not exists (select 1 from public.claim_due_reminders() where booking_id = 'f0000000-0000-4000-8000-0000000000aa'),
  'the same reminder is never claimed twice');

-- =========================================================================
-- Coach admin
-- =========================================================================
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.admin_complete_session('f0000000-0000-4000-8000-000000000002', array['shooting'], 'Good session', 'Juggling x100') $$,
  'coach writes a quick session note');
select throws_ok($$ select public.admin_complete_session('f0000000-0000-4000-8000-000000000003', array['shooting'], 'Too early', null) $$,
  'P0001', 'This session hasn''t started yet.', 'coach cannot mark a future session completed');
select ok((select count(*) from public.admin_schedule(p_to => (now() at time zone 'America/New_York')::date + 6)) >= 3,
  'coach weekly schedule returns bookings');
select ok((public.admin_stats() ->> 'new_inquiries')::int = 1, 'stats count new inquiries');
select pg_temp.reset_role();
select is((select coach_notes from public.session_notes where booking_id = 'f0000000-0000-4000-8000-000000000002'), 'Good session',
  'quick note updates the existing note');
select is((select status::text from public.bookings where id = 'f0000000-0000-4000-8000-000000000003'), 'booked',
  'future booking stays booked');

-- =========================================================================
-- Storage: drill videos visible only to the assigned family
-- =========================================================================
insert into storage.objects (bucket_id, name) values ('drill-videos', 'aa000000-0000-4000-8000-000000000001/wall-pass.mp4');
update public.drills set video_path = 'aa000000-0000-4000-8000-000000000001/wall-pass.mp4' where id = 'aa000000-0000-4000-8000-000000000001';
select pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
select results_eq($$ select count(*)::int from storage.objects where bucket_id = 'drill-videos' $$, array[1],
  'parent A can access the video for a drill assigned to Mia');
select pg_temp.act_as('a0000000-0000-4000-8000-000000000003');
select results_eq($$ select count(*)::int from storage.objects where bucket_id = 'drill-videos' $$, array[0],
  'parent B cannot access a video for a drill not assigned to Sam');
select throws_ok($$ insert into storage.objects (bucket_id, name) values ('drill-videos', 'evil.mp4') $$,
  '42501', null, 'parents cannot upload to the drill-videos bucket');
select pg_temp.reset_role();

-- =========================================================================
-- Multi-hour bookings: default 1 hour; private sessions up to 4 hours back to
-- back; price and package credits scale with hours; groups stay 1 hour.
-- Uses days 25-40 out so it doesn't collide with the bookings above.
-- =========================================================================
create temp table h2 as
select row_number() over (order by slot_start) as n, slot_start, slot_end
from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
       (now() at time zone 'America/New_York')::date + 25,
       (now() at time zone 'America/New_York')::date + 40, 2);

select ok((select count(*) from h2) > 10, '2-hour private slots are offered');
select ok(not exists (select 1 from h2 where slot_end - slot_start <> interval '2 hours'),
  'every 2-hour slot is exactly 2 hours long');
select ok(not exists (
  select 1 from h2
  where (slot_end at time zone 'America/New_York')::time > time '20:00'
    and extract(dow from slot_start at time zone 'America/New_York') between 1 and 4
), '2-hour weekday slots still end by 8pm (the whole length fits the window)');
select ok(not exists (
  select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001') g
  where g.slot_end - g.slot_start <> interval '1 hour'
), 'without hours, slots default to 1 hour');
select throws_ok($$ select * from public.get_available_slots('c0000000-0000-4000-8000-000000000002', null, null, 2) $$,
  'P0001', 'Group sessions are 1 hour.', 'group sessions cannot be booked longer than 1 hour');
select throws_ok($$ select * from public.get_available_slots('c0000000-0000-4000-8000-000000000001', null, null, 5) $$,
  'P0001', 'Sessions can be booked for 1 to 4 hours.', 'longer than the 4-hour maximum is rejected');

-- Card: price = hourly price x hours, and the whole length is held.
-- (The adult client books for themselves; parent B already has 3 open checkouts above.)
create temp table hp as
select * from public.create_pending_booking('a0000000-0000-4000-8000-000000000005',
  (select id from public.players where parent_id = 'a0000000-0000-4000-8000-000000000005' and is_self),
  'c0000000-0000-4000-8000-000000000001', (select slot_start from h2 where n = 1), null, 2);
select is((select price_cents from hp), 18000, '2 hours by card costs 2 x $90');
select is((select hours from hp), 2, 'the booking records 2 hours');
select is((select end_time - start_time from hp), interval '2 hours', 'the booking runs 2 hours');
select ok(not exists (
  select 1 from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
    (now() at time zone 'America/New_York')::date + 25, (now() at time zone 'America/New_York')::date + 40)
  where slot_start = (select start_time + interval '1 hour' from hp)
), 'the second hour of a 2-hour booking is not offered to anyone else');

-- Package credits: one per hour, all from one package; cancelling returns them all.
insert into public.package_purchases (id, parent_id, session_type_id, source, label, sessions_total, sessions_remaining)
values ('e0000000-0000-4000-8000-0000000000f1', 'a0000000-0000-4000-8000-000000000002',
        'c0000000-0000-4000-8000-000000000001', 'coach_grant', 'Hours test', 4, 4);
create temp table credits_before as
select sum(sessions_remaining)::int as n from public.package_purchases where parent_id = 'a0000000-0000-4000-8000-000000000002';
create temp table h3 as
select row_number() over (order by slot_start) as n, slot_start
from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
       (now() at time zone 'America/New_York')::date + 25,
       (now() at time zone 'America/New_York')::date + 40, 3)
where slot_start > (select start_time from hp) + interval '1 day';
create temp table hb as
select * from public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from h3 where n = 1), null, 3);
select is((select sum(sessions_remaining)::int from public.package_purchases where parent_id = 'a0000000-0000-4000-8000-000000000002'),
  (select n - 3 from credits_before), 'a 3-hour booking uses 3 package credits');
select is((select end_time - start_time from hb), interval '3 hours', 'the 3-hour package booking runs 3 hours');

select lives_ok($$ select public.reschedule_booking('a0000000-0000-4000-8000-000000000001', (select id from hb),
  (select slot_start from h3 where slot_start > (select start_time from hb) + interval '1 day' limit 1)) $$,
  'coach reschedules a 3-hour booking');
select is((select end_time - start_time from public.bookings where id = (select id from hb)), interval '3 hours',
  'rescheduling keeps the 3-hour length');

select lives_ok($$ select public.cancel_booking('a0000000-0000-4000-8000-000000000001', (select id from hb)) $$,
  'coach cancels the 3-hour booking');
select is((select sum(sessions_remaining)::int from public.package_purchases where parent_id = 'a0000000-0000-4000-8000-000000000002'),
  (select n from credits_before), 'cancelling returns all 3 credits');

-- Credits must all come from one package (parent B: two packs of 1 credit each).
insert into public.package_purchases (parent_id, session_type_id, source, label, sessions_total, sessions_remaining) values
  ('a0000000-0000-4000-8000-000000000003', null, 'coach_grant', 'One A', 1, 1),
  ('a0000000-0000-4000-8000-000000000003', null, 'coach_grant', 'One B', 1, 1);
select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', (select slot_start from h2 where n = 20), null, 2) $$,
  'P0001', 'A 2-hour session needs 2 credits on one package.', '2 hours needs 2 credits on a single package');

-- Coach-created: manual payment price scales too.
select is((select price_cents from public.admin_create_booking('a0000000-0000-4000-8000-000000000001',
  'b0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001',
  (select slot_start from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
     (now() at time zone 'America/New_York')::date + 25, (now() at time zone 'America/New_York')::date + 40, 4)
   order by slot_start desc limit 1), false, false, null, 4)), 36000,
  'coach-created 4-hour booking (cash/Venmo) is priced at 4 x $90');

-- =========================================================================
-- Pay cash in person (client books now, coach marks paid later)
-- =========================================================================
create or replace function pg_temp.next_cash_slot() returns timestamptz language sql as $$
  select slot_start from public.get_available_slots('c0000000-0000-4000-8000-000000000001',
    (now() at time zone 'America/New_York')::date + 19, (now() at time zone 'America/New_York')::date + 24)
  order by slot_start limit 1
$$;

create temp table cash1 as
select * from public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot(), '  bring cones  ');
grant select on cash1 to authenticated;  -- read while impersonating the coach below
select is((select status::text || '/' || paid_with::text || '/' || payment_status::text from cash1), 'booked/manual/unpaid',
  'cash booking is confirmed right away, unpaid, paid_with manual');
select is((select price_cents from cash1), 9000, 'cash booking records the $90 owed');
select is((select parent_note from cash1), 'bring cones', 'cash booking keeps the trimmed note');

select throws_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$,
  'P0001', 'That player is not on your account.', 'cash booking: cannot book another family''s player');

select lives_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$, 'second cash booking ok');
select lives_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$, 'third cash booking ok');
select throws_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$,
  'P0001', 'You already have 3 upcoming sessions to pay in person. Please pay by card or use a package for this one.',
  'max 3 upcoming unpaid cash bookings per client');

-- Once the coach marks one paid, the client can book another.
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select lives_ok($$ select public.admin_set_booking_status((select id from cash1), null, 'paid') $$, 'coach marks the cash booking paid');
select pg_temp.reset_role();
select lives_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000003',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$, 'paid cash bookings don''t count toward the limit');

update public.app_settings set allow_cash_payments = false where id = 1;
select throws_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', pg_temp.next_cash_slot()) $$,
  'P0001', 'Paying cash in person is not available right now. Please pay by card.', 'cash option can be switched off in settings');
update public.app_settings set allow_cash_payments = true where id = 1;

select pg_temp.act_as('a0000000-0000-4000-8000-000000000002');
select throws_ok($$ select public.book_with_cash('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', now() + interval '20 days') $$,
  '42501', null, 'browsers cannot call book_with_cash directly');
select pg_temp.reset_role();

select * from finish();
rollback;
