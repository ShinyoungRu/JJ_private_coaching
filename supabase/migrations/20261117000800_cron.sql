-- =============================================================================
-- JJ Private Training app - 08: scheduled jobs (pg_cron)
--
-- 1. release-expired-holds (every 5 min, pure SQL)
-- 2. send-reminders        (every 15 min, calls the Edge Function over HTTP)
--
-- The HTTP job reads two Vault secrets, which you create once per
-- environment (see README "Scheduled reminders"):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'project_url');
--   select vault.create_secret('<same value as CRON_SECRET>',       'cron_secret');
-- Until they exist the job logs a notice and does nothing.
-- =============================================================================

create or replace function public.invoke_scheduled_function(p_function_name text)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_url    text;
  v_secret text;
begin
  select decrypted_secret into v_url    from vault.decrypted_secrets where name = 'project_url' limit 1;
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'cron_secret' limit 1;

  if v_url is null or v_secret is null then
    raise notice 'invoke_scheduled_function(%): vault secrets project_url / cron_secret not set; skipping.', p_function_name;
    return null;
  end if;

  return net.http_post(
    url                  := rtrim(v_url, '/') || '/functions/v1/' || p_function_name,
    headers              := jsonb_build_object(
                              'Content-Type', 'application/json',
                              'x-cron-secret', v_secret),
    body                 := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

-- Re-running this migration replaces the jobs instead of duplicating them.
select cron.schedule(
  'release-expired-holds',
  '*/5 * * * *',
  $$select public.release_expired_holds();$$
);

select cron.schedule(
  'send-reminders',
  '*/15 * * * *',
  $$select public.invoke_scheduled_function('send-reminders');$$
);

-- Keep cron's own run history from growing forever.
select cron.schedule(
  'purge-cron-history',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '14 days';$$
);
