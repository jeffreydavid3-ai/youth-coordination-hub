-- ============================================================
-- Youth Coordination Hub — Supabase schema (Phase 1)
-- Generalized event/assignment model so Sunday assignments,
-- teaching rotations, and Thursday activities all share one core.
-- Apply in Supabase SQL editor. RLS is ON for every table.
-- ============================================================

-- ---------- Wards ----------
create table if not exists wards (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  join_code text unique not null default substr(md5(random()::text), 1, 6),
  created_at timestamptz not null default now()
);

-- ---------- Members (youth + adult leaders) ----------
-- class_key: yw_younger | yw_middle | yw_older | deacons | teachers | priests | adult
-- role: president | counselor1 | counselor2 | secretary | member | leader
create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  name text not null,
  class_key text not null,
  role text not null default 'member',
  active boolean not null default true,
  phone text,
  auth_user_id uuid references auth.users(id), -- null for youth without logins
  created_at timestamptz not null default now()
);
create index if not exists members_ward_idx on members(ward_id);

-- ---------- Events ----------
-- One row per calendar occurrence.
-- type: sunday | activity
-- format (activities): class | yw_combined | ym_combined | all_combined
-- level: ward | stake | church | school | holiday  (stake/school rows are context-only)
create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  ward_id uuid not null references wards(id) on delete cascade,
  event_date date not null,
  type text not null,
  format text,
  level text not null default 'ward',
  title text,
  theme text,                       -- monthly theme surfaced on activities
  category text,                    -- spiritual | social | physical | intellectual
  start_time text,
  location text,
  notes text,
  status text not null default 'scheduled',  -- scheduled | cancelled | no_assignments
  created_at timestamptz not null default now(),
  unique (ward_id, event_date, type, title)
);
create index if not exists events_ward_date_idx on events(ward_id, event_date);

-- ---------- Assignment slots ----------
-- slot_type: prep | bless | pass | greet_yw | greet_ym | teach | plan
-- class_key: scopes teach/plan slots to a class; null otherwise
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
-- RLS — ward-scoped isolation (same pattern as security hardening
-- sprint: set-based membership check, NO permissive USING(true)).
-- ============================================================
alter table wards enable row level security;
alter table members enable row level security;
alter table events enable row level security;
alter table assignment_slots enable row level security;
alter table activity_plans enable row level security;
alter table monthly_themes enable row level security;

-- Helper: wards the current auth user belongs to
create or replace function my_ward_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select ward_id from members where auth_user_id = auth.uid()
$$;

create policy ward_select on wards for select using (id in (select my_ward_ids()));

create policy members_all on members for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

create policy events_all on events for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

create policy slots_all on assignment_slots for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

create policy plans_all on activity_plans for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

create policy themes_all on monthly_themes for all
  using (ward_id in (select my_ward_ids()))
  with check (ward_id in (select my_ward_ids()));

-- NOTE (Phase 1b): per-assignment-type edit rights (e.g. only the deacons
-- presidency edits 'pass' slots) enforced at policy level once auth lands.
-- Until then all ward members with logins can edit; UI scopes ownership.
