-- Additive: existing records and milestones are retained unchanged.
create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(btrim(title)) between 1 and 200),
  type text not null check (type in ('score', 'penalties', 'carry', 'tee_in_play', 'putts', 'custom')),
  target_value numeric not null check (target_value between -1000000 and 1000000),
  starting_value numeric check (starting_value between -1000000 and 1000000),
  target_date date,
  status text not null default 'active' check (status in ('active', 'completed', 'archived')),
  is_primary boolean not null default false,
  club text check (char_length(club) <= 80),
  unit text check (char_length(unit) <= 30),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not is_primary or status = 'active'),
  check (type = 'custom' or (target_value >= 0 and (starting_value is null or starting_value >= 0))),
  check (type <> 'score' or (target_value > 0 and (starting_value is null or starting_value > 0))),
  check (type <> 'tee_in_play' or (target_value <= 100 and (starting_value is null or starting_value <= 100))),
  check (type <> 'carry' or (club is not null and char_length(btrim(club)) > 0 and unit is not null and unit in ('m', 'yd')))
);
create index goals_user_created_idx on public.goals (user_id, created_at desc);
create unique index goals_one_primary_idx on public.goals (user_id) where is_primary;
alter table public.goals enable row level security;
revoke all on public.goals from anon, authenticated;
grant select, delete on public.goals to authenticated;
create policy "Users read own goals" on public.goals for select to authenticated using ((select auth.uid()) = user_id);
create policy "Users delete own goals" on public.goals for delete to authenticated using ((select auth.uid()) = user_id);

-- Writes use this transaction so replacing a primary never leaves two primaries,
-- and a failed save rolls back the demotion of the previous primary.
create function public.save_goal(p_goal jsonb, p_create boolean) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  goal_id uuid := (p_goal->>'id')::uuid;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  perform 1 from auth.users where id = owner_id for update;
  if not p_create and not exists (select 1 from public.goals where id = goal_id and user_id = owner_id) then
    raise exception 'Goal not found' using errcode = 'P0002';
  end if;
  if (p_goal->>'is_primary')::boolean then
    update public.goals set is_primary = false, updated_at = now() where user_id = owner_id and is_primary and id <> goal_id;
  end if;
  if p_create then
    insert into public.goals (id, user_id, title, type, target_value, starting_value, target_date, status, is_primary, club, unit)
    values (goal_id, owner_id, p_goal->>'title', p_goal->>'type', (p_goal->>'target_value')::numeric,
      (p_goal->>'starting_value')::numeric, (p_goal->>'target_date')::date, p_goal->>'status',
      (p_goal->>'is_primary')::boolean, p_goal->>'club', p_goal->>'unit');
  else
    update public.goals set title = p_goal->>'title', type = p_goal->>'type', target_value = (p_goal->>'target_value')::numeric,
      starting_value = (p_goal->>'starting_value')::numeric, target_date = (p_goal->>'target_date')::date,
      status = p_goal->>'status', is_primary = (p_goal->>'is_primary')::boolean, club = p_goal->>'club', unit = p_goal->>'unit', updated_at = now()
    where id = goal_id and user_id = owner_id;
    if not found then raise exception 'Goal not found' using errcode = 'P0002'; end if;
  end if;
  return (select coalesce(jsonb_agg(to_jsonb(g) - 'user_id' order by g.created_at desc, g.id), '[]'::jsonb) from public.goals g where user_id = owner_id);
end;
$$;
revoke all on function public.save_goal(jsonb, boolean) from public, anon;
grant execute on function public.save_goal(jsonb, boolean) to authenticated;
