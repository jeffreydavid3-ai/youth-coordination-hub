-- ============================================================
-- Phase 2 migration — Thursday activities
-- Paste into Supabase SQL Editor and Run (safe to re-run).
-- Adds activity-planning fields to events. RLS already covers
-- events for ward members; no policy changes needed.
-- ============================================================

alter table events add column if not exists class_key text;      -- class-specific activities
alter table events add column if not exists leaders text;        -- e.g. "Priests / YW Older"
alter table events add column if not exists plan_status text not null default 'unplanned'; -- unplanned | idea | planned | ready
alter table events add column if not exists plan_details text;   -- the actual plan (what/where/supplies)
