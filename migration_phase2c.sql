-- Phase 2c — multi-day events (e.g. Stake YM Camp Aug 6-8)
-- Paste into Supabase SQL Editor and Run (safe to re-run).
-- Null end_date = single-day event, as before.

alter table events add column if not exists end_date date;
