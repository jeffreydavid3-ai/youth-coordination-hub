-- Phase 2b — event audience targeting
-- Paste into Supabase SQL Editor and Run (safe to re-run).
-- audience: comma-separated class keys (e.g. 'teachers,priests,yw_middle,yw_older')
-- for events that apply to a subset of classes (14+ stake dances etc.).
-- Null = derive audience from the event's format, as before.

alter table events add column if not exists audience text;
