create table if not exists public.records (
  user_id uuid not null references auth.users(id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('session', 'task', 'expense', 'milestone', 'round')),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists records_user_id_updated_at_idx
  on public.records (user_id, updated_at desc);

alter table public.records enable row level security;
revoke all on table public.records from anon, authenticated;
grant select, insert, update, delete on table public.records to authenticated;

drop policy if exists "Users can read their own records" on public.records;
drop policy if exists "Users can create their own records" on public.records;
drop policy if exists "Users can update their own records" on public.records;
drop policy if exists "Users can delete their own records" on public.records;

create policy "Users can read their own records"
  on public.records for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own records"
  on public.records for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own records"
  on public.records for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete their own records"
  on public.records for delete
  to authenticated
  using ((select auth.uid()) = user_id);
