# Youth Coordination Hub — Product Plan

_Last updated: 2026-07-19_

## Vision

One shared source of truth for **who is responsible for what, on which date** — for ward youth leadership. Replaces the lost clipboard, the forgotten spreadsheet, and the "we discussed it in the meeting" memory hole. Success metric: no Sunday-morning scramble, no forgotten Thursday activity, and a 13–17-year-old class president can fill their week's assignments on a phone in under 60 seconds.

## Guiding principles

1. **Youth-president-first UX.** If it feels like enterprise software, it dies. Mobile-first, near-zero login friction.
2. **Warn, don't block.** Double-booking gets a loud warning, not a hard stop — occasionally it's legitimate, and hard blocks teach users to fight the tool.
3. **The calendar is the spine.** Sundays carry sacrament/greeter/teaching assignments; Thursdays carry activities. Everything is an event with assignment slots.
4. **Scope guardrail.** The app tracks who's planning and what the plan is. It is NOT a budget tracker, permission-slip system, or attendance roll (v1). Themes: entered once per month, shown everywhere.

## Domain

**Classes:** YW Younger, YW Middle, YW Older, Deacons, Teachers, Priests. Each has a presidency (president, 1st counselor, 2nd counselor, secretary).

**Sunday assignments (weekly):**
| Assignment | Slots | Eligible | Owner |
|---|---|---|---|
| Prepare sacrament | ~4 | Teachers | Teachers quorum pres. |
| Bless sacrament | 3 | Priests | Priests quorum pres. |
| Pass sacrament | 8 | Deacons first, teachers fill gap (only 4–5 deacons attend) | Deacons quorum pres. |
| Greeters | 2 YW + 2 YM | Any class | YW class presidents |
| Class teaching (Phase 1.5) | per class | Adult / youth rotation / team-teach — per-class config | Each class pres. |

**Thursday activity cadence (Phase 2):**
- 1st, 3rd, 5th Thursday: class-specific (each presidency plans their own)
- 2nd Thursday: YW combined + YM combined (one presidency each, rotating)
- 4th Thursday: all-combined (one YM presidency + one YW presidency co-plan, rotating pairings — e.g. Priests/YW Older → Deacons/YW Youngers → Teachers/YW Middles)
- Monthly theme (2026: "Walk with Me" + monthly virtue) guides all activities that month
- Activity categories rotate across the four growth areas: Spiritual / Social / Physical / Intellectual
- Whole year mapped at annual planning meeting; frequent overrides (holidays, stake conference, trek/camp season)

**Real data source:** ward Google Sheet ("Youth Parents" tab) — 2026 calendar with themes, leader pairings, stake/school/holiday context events. Import parser proven (CSV export). Sheet captures only the "big rocks"; class-level activities live nowhere → that's the gap this app fills.

## Data model (see schema.sql)

`wards → members → events → assignment_slots (+ activity_plans, monthly_themes)`

- `events.type`: sunday | activity; `events.level`: ward | stake | church | school | holiday (non-ward levels are read-mostly context so presidents see WHY a Thursday is skipped)
- `slot_type`: prep | bless | pass | greet_yw | greet_ym | teach | plan
- Conflict check = other filled slots for the same member on the same date
- RLS: ward-scoped set-based membership (no permissive USING(true) policies — lesson from goal-tracker security sprint)

## Phases

- **Phase 1 ✅ (2026-07-19):** Sunday board + conflict warnings + fairness ("last served") + roster + copy-as-text. Demo mode (localStorage).
- **Phase 1b:** Supabase wiring + auth. Presidents/leaders sign in (magic link or ward join code + PIN); public read-only share link for parents/ward. Per-assignment-type edit rights.
- **Phase 1.5:** Teaching assignments on the Sunday board (per-class teaching model config).
- **Phase 2:** Activities module — cadence engine generates the year, overrides for exceptions, monthly themes, planner assignments (resolve class pairing → named people), plan status (Unplanned → Idea → Planned → Ready), youth-council "next 4–6 weeks" view, spreadsheet importer. **Launch at the annual planning meeting / a monthly youth council.**
- **Phase 3:** Reminders (Saturday to assigned youth/parents, Wednesday to presidents with open slots), confirm/decline, substitution flow.

## Open decisions

- Greeter ownership: all three YW presidents can edit greeter slots; human rotation handled offline.
- Youth logins in v1: no — presidencies + adult leaders only, plus public view link.
- Notifications: start with copy-as-text into existing group chats (80% of value, 5% of effort); Twilio/email later.
- Ward name / real roster: placeholder until beta ward data is entered.

## Stack

Vanilla JS static SPA (no build) + Supabase + Vercel, mirroring the proven goal-tracker setup. Deploy = push to `main` on personal GitHub (jeffreydavid3-ai).
