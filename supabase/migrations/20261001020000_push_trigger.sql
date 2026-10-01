-- Push alerts. Every new row in `notifications` asks this project's send-push
-- edge function to deliver it (Expo's push service, which is free).
--
-- This replaces the function left behind by the Find-Mee clone, which pointed
-- at Find-Mee's own project and carried Find-Mee's keys; the new one points at
-- THIS project and reads its secret from Supabase Vault ('push_cron_secret',
-- the same value as the CRON_SECRET function secret — never kept in this repo).
--
-- It can never stop an alert from being saved: if the secret is missing or the
-- request can't be queued, the alert is still stored and shown in the app.

create or replace function public.push_on_notification_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_secret text;
begin
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_cron_secret';
  if v_secret is null then
    return new;
  end if;

  perform net.http_post(
    url := 'https://xomypskslmgibqaulyks.supabase.co/functions/v1/send-push',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := jsonb_build_object('notification_id', new.id)
  );
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_push_on_notification_insert on public.notifications;
create trigger trg_push_on_notification_insert
  after insert on public.notifications
  for each row execute function public.push_on_notification_insert();
