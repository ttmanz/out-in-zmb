-- Lets an admin manually award (or deduct, via a negative amount) points to
-- any member from the new Admin -> Points board. Reuses the existing
-- points_ledger table and its balance-update trigger untouched — this just
-- adds a second, admin-scoped path into the same append-only ledger
-- alongside the existing checkin trigger, so every award is still a real
-- row with a reason, not a direct balance edit.
create policy "admins award points"
  on public.points_ledger for insert
  with check (exists (select 1 from public.profiles where profiles.id = auth.uid() and profiles.is_admin = true));
