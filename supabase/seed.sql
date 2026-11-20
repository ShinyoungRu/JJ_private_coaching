-- =============================================================================
-- LOCAL TEST DATA ONLY. Runs on `supabase db reset` (never on production
-- `supabase db push`).
--
-- Logins (password for all: Password123!)
--   coach@example.com      -> coach (Jonathan: the app's one admin)
--   parent.a@example.com   -> client, parent with 2 players (Mia, Leo) + package credits
--   parent.b@example.com   -> client, parent with 1 player (Sam)
--   adult@example.com      -> client, adult athlete training themselves (Jordan)
--
-- Prices below are PLACEHOLDERS for testing.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Auth users (the on_auth_user_created trigger creates their profiles)
-- ---------------------------------------------------------------------------
insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change_token_new, email_change,
  email_change_token_current, reauthentication_token, phone_change, phone_change_token
)
select '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email,
       extensions.crypt('Password123!', extensions.gen_salt('bf')), now(),
       '{"provider":"email","providers":["email"]}'::jsonb,
       jsonb_build_object('full_name', u.full_name, 'phone', u.phone, 'account_type', u.account_type),
       now() - interval '30 days', now(),
       '', '', '', '', '', '', '', ''
from (values
  ('a0000000-0000-4000-8000-000000000001'::uuid, 'coach@example.com',     'Coach Jonathan', '(484) 555-0100', 'parent'),
  ('a0000000-0000-4000-8000-000000000002'::uuid, 'parent.a@example.com',  'Alex Parker',    '(610) 555-0101', 'parent'),
  ('a0000000-0000-4000-8000-000000000003'::uuid, 'parent.b@example.com',  'Blair Rivera',   '(610) 555-0102', 'parent'),
  ('a0000000-0000-4000-8000-000000000005'::uuid, 'adult@example.com',     'Jordan Lee',     '(610) 555-0104', 'adult')
) as u(id, email, full_name, phone, account_type);

insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
select gen_random_uuid(), u.id, u.id::text,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now(), now()
from auth.users u
where u.email like '%@example.com';

-- Promote the coach (this is how you do it in production too, see README).
update public.profiles set role = 'coach' where id = 'a0000000-0000-4000-8000-000000000001';
-- adult@example.com got its "myself" player (Jordan) from the signup trigger.

-- ---------------------------------------------------------------------------
-- Players (children)
-- ---------------------------------------------------------------------------
insert into public.players (id, parent_id, first_name, age_group, skill_level, notes) values
  ('b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002', 'Mia', 'U12', 'intermediate', 'Left-footed winger. Working on weak foot.'),
  ('b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002', 'Leo', 'U9',  'beginner',     null),
  ('b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003', 'Sam', 'U14', 'advanced',     'Center mid, club travel team.');

-- ---------------------------------------------------------------------------
-- Session types + packages (PLACEHOLDER PRICES)
-- ---------------------------------------------------------------------------
insert into public.session_types (id, name, description, duration_minutes, price_cents, max_players, sort_order) values
  ('c0000000-0000-4000-8000-000000000001', '1-on-1 Training',     'Private session focused on your player''s goals.',          60, 9000, 1, 1),
  ('c0000000-0000-4000-8000-000000000002', 'Small Group Training', 'Up to 4 players of similar age and level.',               60, 4500, 4, 2),
  ('c0000000-0000-4000-8000-000000000003', 'Retired Session Type', 'Inactive type: should not appear publicly.',              45, 5000, 1, 9);
update public.session_types set active = false where id = 'c0000000-0000-4000-8000-000000000003';

insert into public.packages (id, name, description, session_count, price_cents, session_type_id, validity_days, sort_order) values
  ('d0000000-0000-4000-8000-000000000001', '5 x 1-on-1 Sessions',  'Save $25. Use within 4 months.',  5,  42500, 'c0000000-0000-4000-8000-000000000001', 120, 1),
  ('d0000000-0000-4000-8000-000000000002', '10 x 1-on-1 Sessions', 'Save $100. Use within 6 months.', 10, 80000, 'c0000000-0000-4000-8000-000000000001', 180, 2),
  ('d0000000-0000-4000-8000-000000000003', '5 x Small Group',      'Use within 4 months.',             5,  20000, 'c0000000-0000-4000-8000-000000000002', 120, 3);

-- ---------------------------------------------------------------------------
-- Weekly availability (coach's local time): Mon-Thu 4-8pm, Sat 9am-1pm
-- ---------------------------------------------------------------------------
insert into public.availability (day_of_week, start_time, end_time) values
  (1, '16:00', '20:00'),
  (2, '16:00', '20:00'),
  (3, '16:00', '20:00'),
  (4, '16:00', '20:00'),
  (6, '09:00', '13:00');

-- Block the coming Saturday morning (tournament).
insert into public.blocked_times (start_time, end_time, reason)
select (d + time '09:00') at time zone 'America/New_York',
       (d + time '11:00') at time zone 'America/New_York',
       'Tournament'
from (select ((now() at time zone 'America/New_York')::date
              + ((6 - extract(dow from (now() at time zone 'America/New_York')::date)::int + 7) % 7)
              + case when extract(dow from (now() at time zone 'America/New_York')::date) = 6 then 7 else 0 end) as d) s;

-- ---------------------------------------------------------------------------
-- Parent A owns a 5-pack with 3 credits left (2 used below)
-- ---------------------------------------------------------------------------
insert into public.package_purchases (id, parent_id, package_id, session_type_id, source, label,
  sessions_total, sessions_remaining, amount_paid_cents, stripe_payment_id, stripe_checkout_session_id,
  purchased_at, expires_at) values
  ('e0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   'd0000000-0000-4000-8000-000000000001', 'c0000000-0000-4000-8000-000000000001', 'purchase',
   '5 x 1-on-1 Sessions', 5, 3, 42500, 'pi_seed_package_a', 'cs_seed_package_a',
   now() - interval '20 days', now() + interval '100 days');

insert into public.payments (parent_id, package_purchase_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, created_at)
values ('a0000000-0000-4000-8000-000000000002', 'e0000000-0000-4000-8000-000000000001', 'cs_seed_package_a', 'pi_seed_package_a', 42500, now() - interval '20 days');

-- ---------------------------------------------------------------------------
-- Bookings (relative to today so the calendar always looks current)
-- ---------------------------------------------------------------------------
with t as (select (now() at time zone 'America/New_York')::date as today)
insert into public.bookings (id, session_type_id, player_id, parent_id, start_time, end_time,
  status, paid_with, payment_status, package_purchase_id, price_cents,
  stripe_checkout_session_id, stripe_payment_intent_id, created_at)
select v.id, v.st, v.player, v.parent,
       (t.today + v.day_offset + v.at) at time zone 'America/New_York',
       (t.today + v.day_offset + v.at + make_interval(mins => v.mins)) at time zone 'America/New_York',
       v.status::public.booking_status, v.paid_with::public.payment_method, v.pay::public.payment_status,
       v.purchase, v.price, v.cs, v.pi, now() - interval '10 days'
from t, (values
  -- past, completed (package)
  ('f0000000-0000-4000-8000-000000000001'::uuid, 'c0000000-0000-4000-8000-000000000001'::uuid, 'b0000000-0000-4000-8000-000000000001'::uuid, 'a0000000-0000-4000-8000-000000000002'::uuid,
   -7, time '17:00', 60, 'completed', 'package', 'paid', 'e0000000-0000-4000-8000-000000000001'::uuid, 0, null, null),
  -- past, completed (stripe)
  ('f0000000-0000-4000-8000-000000000002', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   -5, time '18:00', 60, 'completed', 'stripe', 'paid', null, 9000, 'cs_seed_booking_sam', 'pi_seed_booking_sam'),
  -- upcoming 1-on-1 (package)
  ('f0000000-0000-4000-8000-000000000003', 'c0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001', 'a0000000-0000-4000-8000-000000000002',
   3, time '17:00', 60, 'booked', 'package', 'paid', 'e0000000-0000-4000-8000-000000000001', 0, null, null),
  -- upcoming small group: Leo (manual/unpaid) + Sam (stripe) in the SAME slot
  ('f0000000-0000-4000-8000-000000000004', 'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000002', 'a0000000-0000-4000-8000-000000000002',
   4, time '18:00', 60, 'booked', 'manual', 'unpaid', null, 4500, null, null),
  ('f0000000-0000-4000-8000-000000000005', 'c0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003', 'a0000000-0000-4000-8000-000000000003',
   4, time '18:00', 60, 'booked', 'stripe', 'paid', null, 4500, 'cs_seed_group_sam', 'pi_seed_group_sam')
) as v(id, st, player, parent, day_offset, at, mins, status, paid_with, pay, purchase, price, cs, pi);

insert into public.payments (parent_id, booking_id, stripe_checkout_session_id, stripe_payment_intent_id, amount_cents, created_at) values
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000002', 'cs_seed_booking_sam', 'pi_seed_booking_sam', 9000, now() - interval '6 days'),
  ('a0000000-0000-4000-8000-000000000003', 'f0000000-0000-4000-8000-000000000005', 'cs_seed_group_sam',   'pi_seed_group_sam',   4500, now() - interval '2 days');

-- ---------------------------------------------------------------------------
-- Session notes, drills, assignments
-- ---------------------------------------------------------------------------
insert into public.session_notes (booking_id, player_id, skills_worked_on, coach_notes, homework) values
  ('f0000000-0000-4000-8000-000000000001', 'b0000000-0000-4000-8000-000000000001',
   array['first touch', 'weak foot passing'], 'Great energy. First touch is improving fast; keep the ankle locked.', '50 wall passes per foot, 4x this week.'),
  ('f0000000-0000-4000-8000-000000000002', 'b0000000-0000-4000-8000-000000000003',
   array['scanning', 'turning under pressure'], 'Scanning before receiving is much better. Next: half-turn on the back foot.', 'Watch the assigned turning video twice.');

insert into public.drills (id, title, description, external_url, skill_tag) values
  ('aa000000-0000-4000-8000-000000000001', 'Wall Pass Ladder',    'Alternate feet, 2-touch then 1-touch, 5 min per set.', 'https://example.com/drills/wall-pass', 'passing'),
  ('aa000000-0000-4000-8000-000000000002', 'Cone Weave Dribbling', 'Inside/outside touches through 8 cones.',              'https://example.com/drills/cone-weave', 'dribbling'),
  ('aa000000-0000-4000-8000-000000000003', 'Half-Turn Receiving', 'Open body, receive across, play forward.',              'https://example.com/drills/half-turn', 'receiving');

insert into public.player_drills (player_id, drill_id, coach_note) values
  ('b0000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000001', 'Do this before every practice.'),
  ('b0000000-0000-4000-8000-000000000001', 'aa000000-0000-4000-8000-000000000002', null),
  ('b0000000-0000-4000-8000-000000000003', 'aa000000-0000-4000-8000-000000000003', 'Focus on the first step.');

-- ---------------------------------------------------------------------------
-- Website inquiries
-- ---------------------------------------------------------------------------
insert into public.inquiries (name, email, phone, message, status, created_at) values
  ('Jordan Lee', 'jordan@example.com', '(610) 555-0199', 'Do you offer goalkeeper sessions for U13?', 'new', now() - interval '1 day'),
  ('Casey Kim',  'casey@example.com',  null,             'Interested in small group for two U10 boys.', 'replied', now() - interval '6 days');

-- ---------------------------------------------------------------------------
-- Local-only Vault secrets so the send-reminders cron job can reach the
-- local Edge Functions. (CRON_SECRET in supabase/functions/.env must match.)
-- ---------------------------------------------------------------------------
select vault.create_secret('http://host.docker.internal:54321', 'project_url');
select vault.create_secret('local-cron-secret-change-me', 'cron_secret');
