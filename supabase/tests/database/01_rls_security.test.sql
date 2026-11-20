-- Row Level Security + privilege tests. Run: npx supabase test db
-- Uses the seed data (parent A = Alex with Mia/Leo, parent B = Blair with Sam).
begin;
create extension if not exists pgtap with schema extensions;
set search_path = public, extensions;

select plan(42);

-- Helpers to impersonate users the same way PostgREST does.
create or replace function pg_temp.act_as(p_user uuid) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  perform set_config('role', 'authenticated', true);
end $$;
create or replace function pg_temp.act_as_anon() returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  perform set_config('role', 'anon', true);
end $$;
create or replace function pg_temp.reset_role() returns void language plpgsql as $$
begin
  perform set_config('role', 'postgres', true);
  perform set_config('request.jwt.claims', '', true);
end $$;

-- =========================================================================
-- Parent A
-- =========================================================================
select pg_temp.act_as('a0000000-0000-4000-8000-000000000002');

select results_eq($$ select first_name from players order by 1 $$, array['Leo', 'Mia'],
  'parent A sees only their own two players');
select is_empty($$ select 1 from players where id = 'b0000000-0000-4000-8000-000000000003' $$,
  'parent A cannot see parent B''s player by id');
select results_eq($$ select count(*)::int from profiles $$, array[1],
  'parent A sees only their own profile');
select is_empty($$ select 1 from bookings where parent_id <> 'a0000000-0000-4000-8000-000000000002' $$,
  'parent A sees no other family''s bookings');
select results_eq($$ select count(*)::int from bookings $$, array[3],
  'parent A sees their 3 bookings');
select results_eq($$ select count(*)::int from session_notes $$, array[1],
  'parent A sees only notes for their own kids');
select is_empty($$ select 1 from session_notes where player_id = 'b0000000-0000-4000-8000-000000000003' $$,
  'parent A cannot read Sam''s session notes');
select results_eq($$ select count(*)::int from drills $$, array[2],
  'parent A sees only drills assigned to their kids');
select results_eq($$ select count(*)::int from player_drills $$, array[2],
  'parent A sees only their kids'' drill assignments');
select results_eq($$ select count(*)::int from payments $$, array[1],
  'parent A sees only their own payments');
select results_eq($$ select count(*)::int from package_purchases $$, array[1],
  'parent A sees only their own package purchases');
select is_empty($$ select 1 from inquiries $$, 'parent A cannot read website inquiries');
select is_empty($$ select 1 from blocked_times $$, 'parent A cannot read blocked time reasons');
select is_empty($$ select 1 from announcements $$, 'parent A cannot read the announcement log');
select results_eq($$ select count(*)::int from session_types $$, array[2],
  'parent A sees active session types only');
select ok((select count(*) from availability) > 0, 'parent A can read weekly availability');
select ok((select count(*) from get_available_slots('c0000000-0000-4000-8000-000000000001')) > 0,
  'parent A can list open slots');

-- writes that must fail
select throws_ok($$ insert into players (parent_id, first_name) values ('a0000000-0000-4000-8000-000000000003', 'Intruder') $$,
  '42501', null, 'parent A cannot add a player to parent B''s account');
select throws_ok($$ update players set parent_id = 'a0000000-0000-4000-8000-000000000003' where id = 'b0000000-0000-4000-8000-000000000001' $$,
  '42501', null, 'parent A cannot move a player to another account');
select throws_ok($$ update profiles set role = 'coach' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'parent A cannot make themselves coach');
select throws_ok($$ insert into bookings (session_type_id, player_id, parent_id, start_time, end_time, status, paid_with, payment_status, slot_key)
                    values ('c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
                            now() + interval '9 days', now() + interval '9 days 1 hour', 'booked', 'stripe', 'paid', 'x') $$,
  '42501', null, 'parent A cannot insert a "paid" booking directly');
select throws_ok($$ update bookings set payment_status = 'paid' where id = 'f0000000-0000-4000-8000-000000000004' $$,
  '42501', null, 'parent A cannot mark their unpaid booking as paid');
select throws_ok($$ insert into package_purchases (parent_id, source, label, sessions_total, sessions_remaining)
                    values ('a0000000-0000-4000-8000-000000000002', 'coach_grant', 'free', 99, 99) $$,
  '42501', null, 'parent A cannot give themselves package credits');
select throws_ok($$ insert into session_notes (booking_id, player_id, coach_notes) values ('f0000000-0000-4000-8000-000000000003', 'b0000000-0000-4000-8000-000000000001', 'x') $$,
  '42501', null, 'parent A cannot write session notes');
select throws_ok($$ insert into inquiries (name, email, message) values ('x', 'x@example.com', 'x') $$,
  '42501', null, 'parent A cannot insert inquiries directly');
select throws_ok($$ select public.book_with_package('a0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', now() + interval '9 days') $$,
  '42501', null, 'parent A cannot call service-only booking functions');
select throws_ok($$ select public.confirm_stripe_booking('f0000000-0000-4000-8000-000000000004', 'cs_fake', 'pi_fake', 0) $$,
  '42501', null, 'parent A cannot call the Stripe confirmation function');
select throws_ok($$ select public.admin_stats() $$, '42501', null, 'parent A cannot read coach stats');

-- writes that must silently affect nothing (RLS hides the rows)
update profiles set full_name = 'Hacked' where id = 'a0000000-0000-4000-8000-000000000003';
delete from players where id = 'b0000000-0000-4000-8000-000000000003';
update package_purchases set sessions_remaining = 5;  -- parent can see but not update
-- allowed edits
update players set notes = 'Updated by parent' where id = 'b0000000-0000-4000-8000-000000000001';
update profiles set phone = '(610) 555-0000' where id = 'a0000000-0000-4000-8000-000000000002';

select pg_temp.reset_role();
select results_eq($$ select full_name from profiles where id = 'a0000000-0000-4000-8000-000000000003' $$, array['Blair Rivera'],
  'parent A''s update to parent B''s profile had no effect');
select results_eq($$ select count(*)::int from players where id = 'b0000000-0000-4000-8000-000000000003' $$, array[1],
  'parent A''s delete of parent B''s player had no effect');
select results_eq($$ select sessions_remaining from package_purchases where id = 'e0000000-0000-4000-8000-000000000001' $$, array[3],
  'parent A cannot top up their own package credits');
select results_eq($$ select notes from players where id = 'b0000000-0000-4000-8000-000000000001' $$, array['Updated by parent'],
  'parent A can edit their own player');

-- =========================================================================
-- Anonymous (not logged in)
-- =========================================================================
select pg_temp.act_as_anon();
select throws_ok($$ select * from players $$, '42501', null, 'anon cannot read players');
select throws_ok($$ select * from bookings $$, '42501', null, 'anon cannot read bookings');
select throws_ok($$ select * from inquiries $$, '42501', null, 'anon cannot read inquiries');
select throws_ok($$ insert into inquiries (name, email, message) values ('x', 'x@example.com', 'x') $$,
  '42501', null, 'anon cannot insert inquiries directly (must use contact-form)');
select throws_ok($$ select * from public.get_available_slots('c0000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'anon cannot call the slot RPC directly (public data goes through Edge Functions)');

-- =========================================================================
-- Coach
-- =========================================================================
select pg_temp.act_as('a0000000-0000-4000-8000-000000000001');
select results_eq($$ select count(*)::int from players $$, array[3], 'coach sees every player');
select results_eq($$ select count(*)::int from inquiries $$, array[2], 'coach sees inquiries');
select lives_ok($$ select public.admin_stats() $$, 'coach can read stats');
select lives_ok($$ update inquiries set status = 'closed' where email = 'jordan@example.com' $$, 'coach can update inquiry status');
select throws_ok($$ update profiles set role = 'coach' where id = 'a0000000-0000-4000-8000-000000000002' $$,
  '42501', null, 'even the coach cannot change roles from the app (SQL only)');

select pg_temp.reset_role();
select * from finish();
rollback;
