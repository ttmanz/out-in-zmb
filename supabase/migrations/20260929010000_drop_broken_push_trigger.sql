-- 20260812000000_push_notifications.sql was cloned from Find-Mee. Its
-- trg_push_on_notification_insert trigger calls net.http_post(), but pg_net
-- was never installed in this project, so every insert into notifications
-- failed with `schema "net" does not exist` — which took down anything that
-- creates an alert (friend requests, messages, replies, reports, cash back).
-- It also posted to Find-Mee's project, not this one, so push could never
-- have worked here. Drop the trigger; in-app alerts don't need it.
drop trigger if exists trg_push_on_notification_insert on public.notifications;
