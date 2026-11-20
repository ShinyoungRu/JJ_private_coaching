-- =============================================================================
-- ONE-TIME PRODUCTION SETUP. Run in Supabase Dashboard > SQL Editor AFTER
-- `supabase db push`. Fill in every <<...>> first. Safe to re-run sections.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Business rules (these were the [brackets] in the brief)
-- -----------------------------------------------------------------------------
update public.app_settings set
  timezone                   = 'America/New_York',  -- coach's time zone
  cancellation_window_hours  = 24,                  -- cancel/reschedule up to N hours before
  reminder_hours_before      = 24,                  -- reminder email N hours before
  min_booking_notice_hours   = 12,                  -- earliest a parent can book
  max_booking_days_ahead     = 60,                  -- how far ahead parents can book
  slot_interval_minutes      = 30,                  -- start times every N minutes
  stripe_cancellation_refund = 'stripe_refund'      -- or 'session_credit'
where id = 1;

-- -----------------------------------------------------------------------------
-- 2. Session types and packages (prices in CENTS: $90.00 = 9000)
-- -----------------------------------------------------------------------------
insert into public.session_types (name, description, duration_minutes, price_cents, max_players, sort_order) values
  ('1-on-1 Training',      '<<description>>', 60, <<PRICE_1ON1_CENTS>>,  1, 1),
  ('Small Group Training', '<<description>>', 60, <<PRICE_GROUP_CENTS>>, 4, 2);

insert into public.packages (name, description, session_count, price_cents, session_type_id, validity_days, sort_order)
select '5 x 1-on-1 Sessions', '<<description>>', 5, <<PRICE_5PACK_CENTS>>, id, 120, 1
from public.session_types where name = '1-on-1 Training';

insert into public.packages (name, description, session_count, price_cents, session_type_id, validity_days, sort_order)
select '10 x 1-on-1 Sessions', '<<description>>', 10, <<PRICE_10PACK_CENTS>>, id, 180, 2
from public.session_types where name = '1-on-1 Training';

-- -----------------------------------------------------------------------------
-- 3. Weekly availability (coach's local time). 0=Sun 1=Mon ... 6=Sat
-- -----------------------------------------------------------------------------
insert into public.availability (day_of_week, start_time, end_time) values
  (1, '16:00', '20:00'),
  (2, '16:00', '20:00'),
  (3, '16:00', '20:00'),
  (4, '16:00', '20:00'),
  (6, '09:00', '13:00');

-- -----------------------------------------------------------------------------
-- 4. Make the coach an admin. The coach must sign up in the app FIRST
--    (https://app.jjprivatetraining.com/login), then run:
-- -----------------------------------------------------------------------------
update public.profiles set role = 'coach' where email = '<<COACH_LOGIN_EMAIL>>';
-- Verify: exactly one row
select id, email, role from public.profiles where role = 'coach';

-- -----------------------------------------------------------------------------
-- 5. Secrets for the reminder cron job (must match the CRON_SECRET function secret)
-- -----------------------------------------------------------------------------
select vault.create_secret('https://<<PROJECT_REF>>.supabase.co', 'project_url');
select vault.create_secret('<<SAME_VALUE_AS_CRON_SECRET>>', 'cron_secret');
-- To change one later:
--   select vault.update_secret((select id from vault.secrets where name = 'cron_secret'), '<<new value>>');

-- Verify the jobs exist and (after 15 min) succeed:
select jobname, schedule, active from cron.job order by jobname;
select j.jobname, d.status, d.start_time, d.return_message
from cron.job_run_details d join cron.job j using (jobid)
order by d.start_time desc limit 10;
select status_code, content, created from net._http_response order by created desc limit 5;
