create table if not exists public.user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  currency text not null default 'AUD' check (currency in ('AUD', 'USD', 'EUR', 'GBP', 'NZD', 'CAD')),
  distance_unit text not null default 'm' check (distance_unit in ('m', 'yd')),
  speed_unit text not null default 'mph' check (speed_unit in ('mph', 'kmh')),
  updated_at timestamptz not null default now()
);

alter table public.user_preferences enable row level security;
revoke all on table public.user_preferences from anon, authenticated;
grant select, insert, update on table public.user_preferences to authenticated;

drop policy if exists "Users can read their own preferences" on public.user_preferences;
drop policy if exists "Users can create their own preferences" on public.user_preferences;
drop policy if exists "Users can update their own preferences" on public.user_preferences;

create policy "Users can read their own preferences"
  on public.user_preferences for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can create their own preferences"
  on public.user_preferences for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update their own preferences"
  on public.user_preferences for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
