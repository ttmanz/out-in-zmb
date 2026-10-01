-- Runs the cleanup-expired-content edge function every hour, so content the app
-- has already stopped showing is really deleted (Open Chat and Spur posts after
-- 24 hours, stories after 6 days, At Venue check-in locations after 24 hours).
--
-- The function checks an x-cron-secret header against its CRON_SECRET secret.
-- That value is NOT kept in this repository: it lives in Supabase Vault under
-- the name 'cleanup_cron_secret' (create it with
--   select vault.create_secret('<the same value as the CRON_SECRET function secret>', 'cleanup_cron_secret');
-- ), and the job reads it from there at run time.

create extension if not exists pg_net with schema extensions;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'cleanup-expired-content') then
    perform cron.unschedule('cleanup-expired-content');
  end if;
end $$;

select cron.schedule(
  'cleanup-expired-content',
  '0 * * * *',
  $job$
  select net.http_post(
    url := 'https://xomypskslmgibqaulyks.supabase.co/functions/v1/cleanup-expired-content',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-cron-secret', (select decrypted_secret from vault.decrypted_secrets where name = 'cleanup_cron_secret')
    ),
    body := '{}'::jsonb
  );
  $job$
);
