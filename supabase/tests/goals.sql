-- Run against a disposable local Supabase database with `supabase test db`.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path = public, extensions;
select no_plan();

insert into auth.users (id) values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.records (user_id, id, kind, data) values
  ('10000000-0000-4000-8000-000000000001', 'goal-test-legacy', 'milestone', '{"title":"Existing milestone"}');

create function pg_temp.goal_input(goal_id uuid, primary_goal boolean default false, goal_status text default 'active') returns jsonb
language sql as $$
  select jsonb_build_object('id', goal_id, 'title', 'Score goal', 'type', 'score', 'target_value', 90,
    'starting_value', null, 'target_date', null, 'status', goal_status, 'is_primary', primary_goal, 'club', null, 'unit', null);
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000001', true), true)$$, 'Create a primary goal');
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000002'), true)$$, 'Create a secondary goal');
select is((select count(*) from public.goals), 2::bigint, 'Both goals retained');
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000002', true), false)$$, 'Replace primary atomically');
select is((select count(*) from public.goals where is_primary), 1::bigint, 'Exactly one primary');
select is((select is_primary from public.goals where id = '20000000-0000-4000-8000-000000000001'), false, 'Previous primary becomes secondary');
select throws_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000003', true) || '{"target_value":-1}'::jsonb, true)$$, '23514', null, 'Invalid target rejected by database');
select is((select is_primary from public.goals where id = '20000000-0000-4000-8000-000000000002'), true, 'Failed save rolls back primary demotion');
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000002', false, 'completed'), false)$$, 'Complete goal');
select is((select count(*) from public.goals where is_primary), 0::bigint, 'Completion clears primary');
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000001', false, 'archived'), false)$$, 'Archive goal');
select is((select status from public.goals where id = '20000000-0000-4000-8000-000000000001'), 'archived', 'Archive retains goal');
select is((select data->>'title' from public.records where id = 'goal-test-legacy'), 'Existing milestone', 'Existing records preserved');
select ok(not has_table_privilege('authenticated', 'public.goals', 'INSERT'), 'Direct inserts cannot bypass atomic save');
select ok(not has_table_privilege('authenticated', 'public.goals', 'UPDATE'), 'Direct updates cannot bypass atomic save');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000002', true);
select is((select count(*) from public.goals), 0::bigint, 'Other user cannot read goals');
select throws_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000001'), false)$$, 'P0002', 'Goal not found', 'Other user cannot edit goal');
select throws_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000001'), true)$$, '23505', null, 'Create cannot overwrite another user goal');
select lives_ok($$delete from public.goals where id = '20000000-0000-4000-8000-000000000001'$$, 'Foreign delete is safely filtered');
select lives_ok($$select public.save_goal(pg_temp.goal_input('20000000-0000-4000-8000-000000000003', true) || '{"user_id":"10000000-0000-4000-8000-000000000001"}'::jsonb, true)$$, 'Payload owner is ignored');
select is((select user_id::text from public.goals where id = '20000000-0000-4000-8000-000000000003'), '10000000-0000-4000-8000-000000000002', 'Goal belongs to authenticated user');

select set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true);
select is((select count(*) from public.goals), 2::bigint, 'Foreign delete preserved original goals');
select lives_ok($$delete from public.goals where id = '20000000-0000-4000-8000-000000000001'$$, 'Owner can delete goal');
select is((select count(*) from public.goals), 1::bigint, 'Owner deletion persisted');
reset role;
select ok(not has_function_privilege('anon', 'public.save_goal(jsonb,boolean)', 'EXECUTE'), 'Anonymous users cannot save goals');
select * from finish();
rollback;
