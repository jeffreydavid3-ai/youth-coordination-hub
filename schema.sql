-- ============================================================
-- Youth Coordination Hub — Supabase schema (Phase 1b)
--
-- HOW TO APPLY:
--   1. Supabase Dashboard → SQL Editor → New query → paste this whole
--      file → Run.
--   2. Dashboard → Authentication → Sign In / Up → enable
--      "Anonymous sign-ins". (Access is device-based + ward join code,
--      so youth presidents don't need email accounts.)
--
-- Access model: signing in anonymously gives a device an auth user id;
-- joining a ward (via join_code) records that device in ward_devices.
-- All data is ward-scoped through my_ward_ids(). No permissive
-- USING(true) policies anywhere.
-- ============================================================

-- ---------- Wards ----------
create table if not exists wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null default upper(substr(md5(random()::text), 1, 6)),
  created_at timestamptz not null default now()
);

-- ---------- Devices with access to a ward ----------
create table if not exists ward_devices (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  auth_user_id uuid not null references auth.users(id) on delete cascade,
  label text,
  created_at timestamptz not null default now(),
  unique (ward_id, auth_user_id)
);
create index if not exists ward_devices_user_idx on ward_devices(auth_user_id);

-- ---------- Members (the roster: youth + adult leaders; no logins) ----------
-- class_key: yw_younger | yw_middle | yw_older | deacons | teachers | priests
-- role: president | counselor1 | counselor2 | secretary | member
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  name text not null,
  class_key text not null,
  role text not null default 'member',
  active boolean not null default true,
  phone text,
  created_at timestamptz not null default now()
);
create index if not exists members_ward_idx on members(ward_id);

-- ---------- Events ----------
-- type: sunday | activity
-- format (activities): class | yw_combined | ym_combined | all_combined
-- level: ward | stake | church | school | holiday (non-ward = context rows)
-- status: scheduled | cancelled | no_assignments
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  event_date date not null,
  type text not null,
  format text,
  level text not null default 'ward',
  title text,
  theme text,
  category text,          -- spiritual | social | physical | intellectual
  start_time text,
  location text,
  notes text,
  status text not null default 'scheduled',
  created_at timestamptz not null default now()
);
create index if not exists events_ward_date_idx on events(ward_id, event_date);
-- exactly one Sunday event per ward per date
create unique index if not exists events_sunday_uniq
  on events(ward_id, event_date) where type = 'sunday';

-- ---------- Assignment slots ----------
-- slot_type: prep | bless | pass | greet_yw | greet_ym | teach | plan
-- status: open | filled | confirmed | declined
create table if not exists assignment_slots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ward_id uuid not null references wards(id) on delete cascade,
  slot_type text not null,
  position int not null default 0,
  class_key text,
  class_key_norm text generated always as (coalesce(class_key, '-')) stored,
  member_id uuid references members(id) on delete set null,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  unique (event_id, slot_type, class_key_norm, position)
);
create index if not exists slots_event_idx on assignment_slots(event_id);
create index if not exists slots_member_idx on assignment_slots(member_id);

-- ---------- Activity plans (Phase 2) ----------
create table if not exists activity_plans (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references events(id) on delete cascade,
  ward_id uuid not null references wards(id) on delete cascade,
  plan_status text not null default 'unplanned', -- unplanned | idea | planned | ready
  details text,
  supplies text,
  updated_at timestamptz not null default now()
);

-- ---------- Monthly themes (Phase 2) ----------
create table if not exists monthly_themes (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  year int not null,
  month int not null,
  theme text not null,
  unique (ward_id, year, month)
);

-- ============================================================
-- RLS
-- ============================================================
alter table wards enable row level security;
alter table ward_devices enable row level security;
alter table members enable row level security;
alter table events enable row level security;
alter table assignment_slots enable row level security;
alter table activity_plans enable row level security;
alter table monthly_themes enable row level security;

create or replace function my_ward_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select ward_id from ward_devices where auth_user_id = auth.uid()
$$;

drop policy if exists ward_select on wards;
create policy ward_select on wards for select
  using (id in (select my_ward_ids()));

drop policy if exists devices_select on ward_devices;
create policy devices_select on ward_devices for select
  using (ward_id in (select my_ward_ids()));
-- inserts happen only through create_ward / join_ward (security definer)

drop policy if exists members_all on members;
create policy members_all on members for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

drop policy if exists events_all on events;
create policy events_all on events for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

drop policy if exists slots_all on assignment_slots;
create policy slots_all on assignment_slots for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

drop policy if exists plans_all on activity_plans;
create policy plans_all on activity_plans for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

drop policy if exists themes_all on monthly_themes;
create policy themes_all on monthly_themes for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

-- ============================================================
-- RPCs
-- ============================================================

create or replace function create_ward(p_name text, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare w wards;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  if coalesce(trim(p_name), '') = '' then raise exception 'Ward name required'; end if;
  insert into wards (name) values (trim(p_name)) returning * into w;
  insert into ward_devices (ward_id, auth_user_id, label)
  values (w.id, auth.uid(), p_label);
  return jsonb_build_object('id', w.id, 'name', w.name, 'join_code', w.join_code);
end $$;

create or replace function join_ward(p_code text, p_label text default null)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare w wards;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  select * into w from wards where join_code = upper(trim(p_code));
  if w.id is null then raise exception 'Invalid ward code'; end if;
  insert into ward_devices (ward_id, auth_user_id, label)
  values (w.id, auth.uid(), p_label)
  on conflict (ward_id, auth_user_id) do nothing;
  return jsonb_build_object('id', w.id, 'name', w.name, 'join_code', w.join_code);
end $$;

-- Ensure a Sunday event + its 19 slots exist for each date; returns ALL
-- of the ward's Sunday events (history included, for fairness stats).
create or replace function ensure_sundays(p_ward uuid, p_dates date[])
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  d date;
  ev_id uuid;
begin
  if not exists (select 1 from ward_devices
                 where ward_id = p_ward and auth_user_id = auth.uid()) then
    raise exception 'Not a member of this ward';
  end if;

  foreach d in array p_dates loop
    insert into events (ward_id, event_date, type)
    values (p_ward, d, 'sunday')
    on conflict (ward_id, event_date) where type = 'sunday' do nothing;

    select id into ev_id from events
    where ward_id = p_ward and event_date = d and type = 'sunday';

    insert into assignment_slots (event_id, ward_id, slot_type, position)
    select ev_id, p_ward, s.slot_type, gs.pos
    from (values ('prep', 4), ('bless', 3), ('pass', 8),
                 ('greet_yw', 2), ('greet_ym', 2)) as s(slot_type, cnt)
    cross join lateral generate_series(0, s.cnt - 1) as gs(pos)
    on conflict (event_id, slot_type, class_key_norm, position) do nothing;
  end loop;

  return (
    select coalesce(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'event_date', e.event_date,
      'status', e.status,
      'slots', (
        select coalesce(jsonb_agg(jsonb_build_object(
          'id', a.id, 'slot_type', a.slot_type,
          'position', a.position, 'member_id', a.member_id
        ) order by a.slot_type, a.position), '[]'::jsonb)
        from assignment_slots a where a.event_id = e.id
      )
    ) order by e.event_date), '[]'::jsonb)
    from events e
    where e.ward_id = p_ward and e.type = 'sunday'
  );
end $$;

grant execute on function my_ward_ids() to authenticated;
grant execute on function create_ward(text, text) to authenticated;
grant execute on function join_ward(text, text) to authenticated;
grant execute on function ensure_sundays(uuid, date[]) to authenticated;
