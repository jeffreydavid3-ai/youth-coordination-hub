# Youth Coordination Hub — Project Handoff / Status

_Last updated: 2026-07-20 (Phase 2 shipped). Everything below is deployed, tested, and live in production._

## What this is

A mobile-first web app for coordinating youth assignments in the **Westfield 2nd Ward** (The Church of Jesus Christ of Latter-day Saints). It replaces lost clipboards and forgotten spreadsheets with one shared source of truth for who is responsible for what, on which date — used by the six class presidencies and adult leaders.

**The problem it solves:** Sunday assignments (sacrament prep/bless/pass, greeters) and Thursday activity planning were tracked on paper or verbally, then forgotten — every Sunday was a scramble, the same reliable kids got double-booked, and activity owners forgot they were in charge.

## Live production state

| Item | Value |
|---|---|
| **App URL** | https://youth-coordination-hub.vercel.app |
| **Ward** | Westfield 2nd Ward |
| **Ward join code** | `2FC514` (in-app header chip, tap to copy) |
| **Repo** | https://github.com/jeffreydavid3-ai/youth-coordination-hub (personal GitHub: jeffreydavid3-ai / jefferydavid3@gmail.com) |
| **Deploy** | Vercel, auto-deploys on push to `main`, framework "Other", no build step |
| **Backend** | Supabase project `ynenukjgsurkgpssimfs` (org "Church", project "Youth Hub", free tier) |
| **Ward row id** | `cfe53e12-29b0-4fed-b543-40502e496ea2` |
| **Roster** | All 57 youth loaded (Deacons 6, Teachers 9, Priests 16, YW Younger 7, YW Middle 8, YW Older 11) with presidency roles |

**How users get in:** open the URL → device signs in anonymously (Supabase anonymous auth; no email needed) → enter ward code once → device is remembered. Share the URL + code with presidencies; suggest "Add to Home Screen."

## What's built and verified (Phase 2 — DONE, 2026-07-20)

- **Activities tab** — chronological view grouped by month, next-10-weeks default with "show rest of year" toggle.
- **Cadence engine** — auto-provisions the next 8 Thursdays per the ward rotation (1st/3rd/5th = 6 class activities; 2nd = YW combined + YM combined; 4th = all combined). Skips Thursdays that already have ward events (imported calendar wins); "Cancel activity" tombstones (status=cancelled) so cancelled weeks don't regenerate.
- **Monthly themes** — gradient banner under each month header, tap to edit (stored in `monthly_themes`).
- **My-class filter** — two-row chip grid on Activities (All + YW classes / YM classes, no horizontal scroll): picking a class shows only that class's activities, its group's combined (YW or YM), all-combined, and context events. Persists per device (`localStorage: ych_act_filter`).
- **Audience targeting** — any event can be limited to specific classes ("Only for certain classes?" chips in the add/edit sheet) for things like 14+ stake dances (Teachers/Priests/YW Middle/YW Older). Shows as "For: Tea, Pri, YW-M, YW-O" on the row; the class filter respects it (audience overrides format rules). Stored as csv in `events.audience` (migration_phase2b.sql).
- **Plan-status chips** — tap to cycle unplanned → idea → planned → ready (grey/amber/blue/green). This is the at-a-glance "is Thursday ready?" signal.
- **Edit sheet** per activity: title, category (spiritual/social/physical/intellectual), time, location, leaders ("Priests / YW Older"), plan details. **Add-event sheet** for anything ad-hoc (class, combined, stake/church/holiday context).
- **Context events** (stake/church/school/holiday) render as muted rows so presidents see *why* a week is skipped.
- **2026 calendar imported** — `import/import_calendar.mjs` (idempotent; re-run inserts 0) parsed the ward Google Sheet snapshot (`import/2026_calendar.csv`): 63 events + 10 monthly themes ("Walk with Me …"; June & November have none in the sheet — set them in-app). Combined activities carry leaders + category; verified rendering live (e.g. Jul 29 "Lake Day — planned — Priests / YW Older — 7:00 AM").
- **Migration applied:** `migration_phase2.sql` added `class_key`, `leaders`, `plan_status`, `plan_details` to `events`.
- For future years: export the new sheet tab as CSV → `node import/import_calendar.mjs <csv> 2FC514`.

## What's built and verified (Phase 1 + 1b — DONE)

- **Sunday board** — all weekly assignment slots on one screen, next 8 Sundays as date pills with fill counters (e.g. `12/19`):
  - Prepare the Sacrament — 4 slots, teachers (owner: Teachers Quorum pres.)
  - Bless the Sacrament — 3 slots, priests only (owner: bishop / priests presidency — the priests have **no president**; the bishop is acting president, Kyle P is 1st counselor)
  - Pass the Sacrament — 8 slots, **deacons listed first, teachers as "helpers"** (only 4–5 deacons attend, so 3–4 teachers fill the gap)
  - Greeters — 2 YW + 2 YM slots (owner: YW class presidents)
- **Double-booking prevention** — picker warns "⚠ already: Pass the Sacrament"; assigning anyway is allowed (warn, don't block) and the board shows a "double-booked" badge.
- **Fairness signal** — every name shows "never served" / "served N wks ago", sorted longest-ago first.
- **Copy as text** — one tap produces a plain-text summary of the Sunday for pasting into group chats.
- **Week off** toggle (stake conference etc.), **Roster** tab (add/deactivate/remove, presidency role chips).
- **Multi-device sync** — writes are optimistic + write-through; app polls every 60s and on tab focus.
- **Security (all verified live):** ward-scoped RLS on every table, set-based membership (no `USING(true)` anywhere); a device that hasn't joined sees empty data, direct inserts are blocked, bad join codes rejected.

## Architecture

Single-page static app — **no build step, no framework** (same pattern as the Rise family app). Deploy = push to `main`.

```
index.html   markup shells (board, bottom sheet, tabs, auth root)
styles.css   mobile-first styling
config.js    Supabase URL + publishable key (safe client-side; RLS is the security)
db.js        data layer (window.DB) — live Supabase adapter with in-memory
             cache + optimistic writes; falls back to localStorage DEMO mode
             if config.js is empty. This is the only file that talks to Supabase.
app.js       views + interactions — reads window.DB only
auth.js      boot: anonymous sign-in → join/create ward screen → APP.start()
schema.sql   full schema + RLS + RPCs (already applied in production)
```

**Data model:** `wards → ward_devices (auth access) / members (roster, no logins) / events (type: sunday|activity) → assignment_slots`. Plus `activity_plans`, `monthly_themes` (Phase 2, tables exist).
**RPCs:** `create_ward`, `join_ward(code)`, `ensure_sundays(ward, dates[])` (idempotently provisions each Sunday's 19 slots server-side).
**Conflict/fairness logic** is client-side over the loaded ward data (small scale — one ward).

## Operational notes

- **Supabase free tier auto-pauses on inactivity.** If the app spins forever: Supabase dashboard → Restore. (Same known behavior as the Rise app.)
- Dashboard one-time setup already done: `schema.sql` run in SQL Editor; **Authentication → Sign In / Up → "Allow anonymous sign-ins"** enabled.
- Ward rename currently requires SQL (`update wards set name = '…' where join_code = '2FC514';`) — the app has no update policy on `wards` yet; add a rename function with the future Settings screen.
- Deleting a roster member clears their slots first (fixed 2026-07-20) — slots reset to `open` rather than staying `filled` with no member.
- Anonymous auth means clearing browser data = device must rejoin with the ward code. Data is unaffected.

## Roadmap (agreed, not yet built)

1. **Phase 1.5 — Sunday teaching assignments.** Per-class teaching model config: adult teaches / youth rotation / adult+youth team-teach. Slots join the same board + conflict + fairness system. Small increment (`teach` slot_type already in schema).
2. **Phase 3 — Reminders & follow-through.** Saturday reminders to assigned youth/parents, Wednesday nudges to presidents with open slots, confirm/decline. (Start cheap: "Copy as text" already covers group-chat sharing.)
3. Smaller ideas: "Copy as text" for a Thursday, Settings screen (ward rename), category balance view (spiritual/social/physical/intellectual across the year).

**Scope guardrails (deliberate no-builds):** no budget tracking, no permission slips, no attendance rolls in v1. Warn on double-booking, never hard-block. If it feels like enterprise software to a 14-year-old president, it's wrong.

## Product principles

- Success metric: a class president fills their week's assignments on a phone in under 60 seconds; no Sunday-morning scramble.
- The calendar is the spine — Sundays carry sacrament/greeter/teaching assignments, Thursdays carry activities; everything is an event with assignment slots.
- Adoption strategy: Sunday board builds the weekly habit → activities module lands at an annual-planning/youth-council moment → reminders close the follow-through gap.

See [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the full plan and [README.md](README.md) for feature detail and local dev (`npx serve .` — no build).
