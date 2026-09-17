-- Spoken languages on the profile — required at profile completion (enforced
-- client-side in CompleteProfileScreen, same convention as gender/city/dob:
-- no NOT NULL constraint, so existing rows from before this field existed
-- aren't retroactively broken).
alter table public.profiles add column spoken_languages text[];
