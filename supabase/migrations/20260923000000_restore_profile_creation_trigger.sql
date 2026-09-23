-- The handle_new_user() function was captured by the original schema-only
-- copy from Find-Mee (it lives in public), but the trigger attaching it to
-- auth.users was not — auth.users is a Supabase-managed schema outside
-- `pg_dump --schema=public`. Without this trigger, no profile row is ever
-- created on signup, silently breaking the app for every new user (not
-- just admin access — profile is null everywhere).
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
