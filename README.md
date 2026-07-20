# ⛪ Youth Coordination Hub

A coordination tool for ward youth leadership (The Church of Jesus Christ of Latter-day Saints). One shared source of truth for the assignments that currently live on lost clipboards and forgotten spreadsheets — Sunday sacrament assignments, greeters, class teaching rotations, and Thursday activity planning.

**Repo:** https://github.com/jeffreydavid3-ai/youth-coordination-hub

---

## The problem

Every Sunday needs greeters (2 YW + 2 YM), 3 priests to bless the sacrament, 8 young men to pass it (deacons first, teachers filling gaps), and teachers to prepare it beforehand. Every Thursday needs a planned activity with a rotating owner. These assignments are made verbally or on paper, then forgotten — so every week is a scramble, and the same reliable kids get triple-booked.

## What it does (Phase 1 — current)

- **Sunday board** — every assignment set for a given Sunday on one mobile-first screen, with open slots loudly visible.
- **Double-booking prevention** — the member picker warns when someone is already assigned that day (warn, don't block).
- **Eligibility built in** — blessing slots only offer priests; passing offers deacons first, teachers as helpers; greeter slots split YW/YM.
- **Fairness signal** — every name in the picker shows when they last served, sorted longest-ago first, "never served" on top.
- **Copy as text** — one tap turns the Sunday into a plain-text summary for pasting into the group chat.
- **Week off** — mark a Sunday as no-assignments (stake conference etc.).
- **Roster** — youth by class, presidency roles, active/inactive.

Currently runs in **demo mode**: data persists in `localStorage` on the device. `schema.sql` contains the full Supabase schema (ward-scoped RLS); Phase 1b swaps `db.js` internals to Supabase without touching `app.js`.

## Roadmap

| Phase | Scope |
|---|---|
| **1** ✅ | Sunday assignment board, conflict warnings, fairness, roster, copy-as-text (demo mode) |
| **1b** | Supabase backend + auth (magic link / ward join code), public read-only view |
| **1.5** | Sunday teaching assignments (per-class model: adult / youth rotation / team-teach) |
| **2** | Thursday activities: cadence engine (1st/3rd/5th = class, 2nd = YW+YM combined, 4th = all combined), monthly themes, planner assignments, plan status, annual calendar import from the ward spreadsheet |
| **3** | Reminders (Sat to assigned youth/parents, Wed to presidents with open slots), confirm/decline |

See [PRODUCT_PLAN.md](PRODUCT_PLAN.md) for the full product plan and design decisions.

## Architecture

Same pattern as proven in prior projects: single-page static app, **no build step, no framework, no bundler**. Deployed by pushing to `main` (Vercel).

```
index.html   markup shells (board, sheet, tabs)
styles.css   mobile-first styling
db.js        data layer — window.DB (demo: localStorage; next: Supabase)
app.js       views + interactions — reads window.DB only
schema.sql   Supabase schema + RLS (apply in SQL editor)
```

## Run locally

No build. Serve the folder statically:

```
npx serve .
```

or just open `index.html` in a browser.
