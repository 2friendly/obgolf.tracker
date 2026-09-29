create table if not exists public.golf_courses (
  id text primary key,
  name text not null,
  locality text,
  region text,
  country_code text not null default 'AU' check (char_length(country_code) = 2),
  source_url text,
  verified_at date,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.course_tees (
  id text primary key,
  course_id text not null references public.golf_courses(id) on delete cascade,
  name text not null default '',
  holes_count integer not null check (holes_count in (9, 18)),
  total_par integer not null check (total_par between 27 and 108),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (course_id, name)
);

create table if not exists public.course_holes (
  tee_id text not null references public.course_tees(id) on delete cascade,
  hole_number integer not null check (hole_number between 1 and 18),
  par integer not null check (par between 3 and 6),
  distance_metres numeric(6, 1) check (distance_metres is null or distance_metres between 0 and 1000),
  primary key (tee_id, hole_number)
);

create index if not exists golf_courses_name_idx on public.golf_courses (name);
create index if not exists course_tees_course_id_idx on public.course_tees (course_id);

alter table public.golf_courses enable row level security;
alter table public.course_tees enable row level security;
alter table public.course_holes enable row level security;

revoke all on table public.golf_courses, public.course_tees, public.course_holes from anon, authenticated;
grant select on table public.golf_courses, public.course_tees, public.course_holes to authenticated;

drop policy if exists "Authenticated users can read courses" on public.golf_courses;
drop policy if exists "Authenticated users can read course tees" on public.course_tees;
drop policy if exists "Authenticated users can read course holes" on public.course_holes;

create policy "Authenticated users can read courses"
  on public.golf_courses for select to authenticated using (active);
create policy "Authenticated users can read course tees"
  on public.course_tees for select to authenticated using (true);
create policy "Authenticated users can read course holes"
  on public.course_holes for select to authenticated using (true);

create temporary table seed_course_catalog (
  course_id text,
  course_name text,
  tee_id text,
  tee_name text,
  source_url text,
  holes jsonb
) on commit drop;

insert into seed_course_catalog values
('kdv-sport','KDV Sport','kdv-sport','','https://kdvsport.com/golf/9-hole-golf-course/','[{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null},{"par":3,"distance_metres":null}]'::jsonb),
('emerald-lakes','Emerald Lakes Golf Club','emerald-lakes','','https://emeraldlakesgolf.com.au/golf/golf-course-overview/','[{"par":4,"distance_metres":null},{"par":5,"distance_metres":null},{"par":3,"distance_metres":null},{"par":5,"distance_metres":null},{"par":3,"distance_metres":null},{"par":5,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":5,"distance_metres":null},{"par":3,"distance_metres":null},{"par":5,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":4,"distance_metres":null}]'::jsonb),
('gainsborough','Gainsborough Greens','gainsborough-men','Men','https://gainsboroughgolf.com.au/our-course/','[{"par":4,"distance_metres":326},{"par":3,"distance_metres":177},{"par":5,"distance_metres":544},{"par":4,"distance_metres":340},{"par":4,"distance_metres":376},{"par":5,"distance_metres":438},{"par":3,"distance_metres":203},{"par":4,"distance_metres":417},{"par":4,"distance_metres":301},{"par":4,"distance_metres":267},{"par":5,"distance_metres":445},{"par":4,"distance_metres":334},{"par":4,"distance_metres":340},{"par":3,"distance_metres":145},{"par":4,"distance_metres":350},{"par":3,"distance_metres":173},{"par":5,"distance_metres":472},{"par":4,"distance_metres":310}]'::jsonb),
('gainsborough','Gainsborough Greens','gainsborough-ladies','Ladies','https://gainsboroughgolf.com.au/our-course/','[{"par":4,"distance_metres":235},{"par":3,"distance_metres":117},{"par":5,"distance_metres":450},{"par":4,"distance_metres":323},{"par":4,"distance_metres":345},{"par":5,"distance_metres":403},{"par":3,"distance_metres":160},{"par":4,"distance_metres":298},{"par":4,"distance_metres":245},{"par":4,"distance_metres":239},{"par":5,"distance_metres":412},{"par":4,"distance_metres":307},{"par":4,"distance_metres":300},{"par":3,"distance_metres":141},{"par":4,"distance_metres":310},{"par":3,"distance_metres":113},{"par":5,"distance_metres":436},{"par":4,"distance_metres":246}]'::jsonb),
('links-hope-island','Links Hope Island','links-hope-island','Course guide','https://www.linkshopeisland.com.au/play/','[{"par":4,"distance_metres":341},{"par":5,"distance_metres":515},{"par":4,"distance_metres":330},{"par":4,"distance_metres":427},{"par":3,"distance_metres":150},{"par":4,"distance_metres":372},{"par":4,"distance_metres":351},{"par":5,"distance_metres":516},{"par":3,"distance_metres":156},{"par":4,"distance_metres":372},{"par":5,"distance_metres":542},{"par":4,"distance_metres":351},{"par":4,"distance_metres":411},{"par":3,"distance_metres":192},{"par":4,"distance_metres":407},{"par":4,"distance_metres":320},{"par":3,"distance_metres":224},{"par":5,"distance_metres":515}]'::jsonb),
('palm-meadows','Palm Meadows','palm-meadows','','https://palmmeadows.com.au/golf/course-map-playing-tips/','[{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":5,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":5,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":4,"distance_metres":null},{"par":5,"distance_metres":null},{"par":4,"distance_metres":null},{"par":3,"distance_metres":null},{"par":5,"distance_metres":null}]'::jsonb),
('sanctuary-palms','Sanctuary Cove · The Palms','sanctuary-palms-black','Black','https://www.sanctuarycovegolf.com.au/cms/golf/the-palms-course/','[{"par":5,"distance_metres":484},{"par":4,"distance_metres":387},{"par":3,"distance_metres":190},{"par":4,"distance_metres":326},{"par":3,"distance_metres":173},{"par":4,"distance_metres":387},{"par":4,"distance_metres":360},{"par":3,"distance_metres":146},{"par":4,"distance_metres":392},{"par":5,"distance_metres":472},{"par":4,"distance_metres":327},{"par":3,"distance_metres":163},{"par":4,"distance_metres":314},{"par":5,"distance_metres":498},{"par":4,"distance_metres":374},{"par":3,"distance_metres":162},{"par":4,"distance_metres":367},{"par":4,"distance_metres":368}]'::jsonb),
('sanctuary-palms','Sanctuary Cove · The Palms','sanctuary-palms-blue','Blue','https://www.sanctuarycovegolf.com.au/cms/golf/the-palms-course/','[{"par":5,"distance_metres":465},{"par":4,"distance_metres":357},{"par":3,"distance_metres":169},{"par":4,"distance_metres":302},{"par":3,"distance_metres":158},{"par":4,"distance_metres":373},{"par":4,"distance_metres":340},{"par":3,"distance_metres":120},{"par":4,"distance_metres":375},{"par":5,"distance_metres":450},{"par":4,"distance_metres":318},{"par":3,"distance_metres":139},{"par":4,"distance_metres":294},{"par":5,"distance_metres":473},{"par":4,"distance_metres":352},{"par":3,"distance_metres":148},{"par":4,"distance_metres":350},{"par":4,"distance_metres":347}]'::jsonb),
('sanctuary-palms','Sanctuary Cove · The Palms','sanctuary-palms-white','White','https://www.sanctuarycovegolf.com.au/cms/golf/the-palms-course/','[{"par":5,"distance_metres":453},{"par":4,"distance_metres":337},{"par":3,"distance_metres":147},{"par":4,"distance_metres":253},{"par":3,"distance_metres":142},{"par":4,"distance_metres":306},{"par":4,"distance_metres":320},{"par":3,"distance_metres":117},{"par":4,"distance_metres":355},{"par":5,"distance_metres":413},{"par":4,"distance_metres":283},{"par":3,"distance_metres":130},{"par":4,"distance_metres":285},{"par":5,"distance_metres":439},{"par":4,"distance_metres":333},{"par":3,"distance_metres":139},{"par":4,"distance_metres":328},{"par":4,"distance_metres":323}]'::jsonb),
('sanctuary-palms','Sanctuary Cove · The Palms','sanctuary-palms-red','Red','https://www.sanctuarycovegolf.com.au/cms/golf/the-palms-course/','[{"par":5,"distance_metres":421},{"par":4,"distance_metres":315},{"par":3,"distance_metres":131},{"par":4,"distance_metres":243},{"par":3,"distance_metres":123},{"par":4,"distance_metres":269},{"par":4,"distance_metres":283},{"par":3,"distance_metres":113},{"par":4,"distance_metres":330},{"par":5,"distance_metres":382},{"par":4,"distance_metres":283},{"par":3,"distance_metres":107},{"par":4,"distance_metres":246},{"par":5,"distance_metres":380},{"par":4,"distance_metres":299},{"par":3,"distance_metres":123},{"par":4,"distance_metres":311},{"par":4,"distance_metres":286}]'::jsonb);

insert into public.golf_courses (id, name, locality, region, country_code, source_url, verified_at)
select distinct on (course_id) course_id, course_name, 'Gold Coast', 'Queensland', 'AU', source_url, date '2026-09-29'
from seed_course_catalog
order by course_id, tee_id
on conflict (id) do update set
  name = excluded.name,
  locality = excluded.locality,
  region = excluded.region,
  country_code = excluded.country_code,
  source_url = excluded.source_url,
  verified_at = excluded.verified_at,
  updated_at = now();

insert into public.course_tees (id, course_id, name, holes_count, total_par)
select tee_id, course_id, tee_name, jsonb_array_length(holes),
  (select sum((item.value->>'par')::integer) from jsonb_array_elements(holes) as item(value))
from seed_course_catalog
on conflict (id) do update set
  course_id = excluded.course_id,
  name = excluded.name,
  holes_count = excluded.holes_count,
  total_par = excluded.total_par,
  updated_at = now();

insert into public.course_holes (tee_id, hole_number, par, distance_metres)
select catalog.tee_id, hole.ordinality::integer, (hole.value->>'par')::integer,
  nullif(hole.value->>'distance_metres', '')::numeric
from seed_course_catalog catalog
cross join lateral jsonb_array_elements(catalog.holes) with ordinality as hole(value, ordinality)
on conflict (tee_id, hole_number) do update set
  par = excluded.par,
  distance_metres = excluded.distance_metres;
