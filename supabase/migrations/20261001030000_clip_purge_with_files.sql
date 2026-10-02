-- Clip of the Day: the weekly purge now deletes the video files too.
--
-- The old job 'purge-unapproved-clips' (20260906000000_daily_clips.sql) ran
-- `delete from daily_clips where is_approved = false` every Monday at 03:00.
-- That removed the rows but left every video file in storage forever. The
-- hourly cleanup-expired-content function (20261001010000_cleanup_schedule.sql)
-- now does the same purge — unapproved clips older than the most recent
-- Monday 03:00 UTC — and removes the video file first. Two jobs doing the same
-- thing would let the SQL one delete the rows before the function can find
-- their files, so the SQL job is removed.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'purge-unapproved-clips') then
    perform cron.unschedule('purge-unapproved-clips');
  end if;
end $$;
