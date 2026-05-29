-- IK101 globe messages — table, security, realtime
-- Inserts happen ONLY through the submit-message edge function (service role,
-- which bypasses RLS); the public anon role can read approved rows but cannot
-- insert directly. The signed-in admin can read all rows and approve/reject.

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  message text not null check (char_length(message) <= 150),
  display_name text check (display_name is null or char_length(display_name) <= 60),
  country_code text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

-- privileges
grant select on public.messages to anon;
grant select, update, delete on public.messages to authenticated;

-- row-level security
alter table public.messages enable row level security;

-- public reads ONLY approved rows
create policy "read approved" on public.messages
  for select using (status = 'approved');

-- the signed-in admin reads ALL rows (so the moderation queue can see pending)
create policy "admin read all" on public.messages
  for select to authenticated using (true);

-- only the signed-in admin can approve/reject or delete
create policy "admin update" on public.messages
  for update to authenticated using (true) with check (true);
create policy "admin delete" on public.messages
  for delete to authenticated using (true);

-- live updates so approved dots appear in real time
alter publication supabase_realtime add table public.messages;
