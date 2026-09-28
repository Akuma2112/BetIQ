# BetIQ — CLAUDE.md

@AGENTS.md

Personal, single-user app (owner: Ludo, France) to find **positive expected-value** football bets.
Not a tipster app, not a SaaS: no Stripe, no multi-tenant, no onboarding.

## Non-negotiable principles
- **Probabilities come from the statistical model (`src/lib/model/`), never from the LLM.**
  Claude only comments on numbers it is given; it must never produce or alter a probability.
- Model code = pure functions, unit-tested with Vitest. No I/O inside `src/lib/model/`.
- No look-ahead leakage: any prediction for a match uses only data strictly before its kickoff.
- Guardrails (monthly budget, max stake 2%, no-chasing after 5 losses, CLV front and center,
  ANJ footer link) are features, not options. Never weaken them.
- Bets are only placeable at French-licensed books (Winamax, Betclic, Unibet FR, PMU, NetBet):
  "best odds" = max over those. Pinnacle is the **sharp reference** (fair market prob + CLV), never a place to bet.
- All user-facing text in French. Code, comments, commits in English.

## Stack
- Next.js 16 App Router (`src/`), TypeScript strict, Tailwind CSS v4, Framer Motion (subtle only)
  - Next 16: `middleware.ts` is renamed `proxy.ts`; check `node_modules/next/dist/docs/` before using an API you're unsure of.
- Supabase (Postgres + Auth magic link + RLS), single owner — every route protected
- Scheduling: **Supabase pg_cron + pg_net** → `POST /api/cron/<job>` with `Authorization: Bearer $CRON_SECRET`
  (Vercel Hobby cron = once/day ±59 min, too coarse for closing odds)
- Anthropic API, model `claude-sonnet-5`, analysis layer only, cached per match in `analyses`
- Vercel (Team ID `team_n4SDg3OYHaqpThh984Q5SUfr`)

## Data sources
| Use | Source | Cost |
|---|---|---|
| Historical results + closing odds (Pinnacle `PSCH/PSCD/PSCA`, max, O/U 2.5) | football-data.co.uk CSV | free |
| Upcoming fixtures + finished results | football-data.org v4 (`FL1`, `PL`, `PD`) | free, 10 req/min |
| Live odds (h2h, totals), region `eu` (contains Pinnacle + winamax_fr, betclic_fr, unibet_fr, pmu_fr) | The Odds API v4 | free 500 credits/month; cost = markets × regions per call |

## Design (Lefin aesthetic)
bg `#0a0a0a`, text `#f0f0f0`, accent gold `#c9a84c`; Playfair Display (headings), Inter (body),
JetBrains Mono (numbers/odds). Dark, minimal, data-dense, mobile-first.

## Commands
- `npm run dev` · `npm run build`
- `npm run test` (Vitest, `tests/**/*.test.ts`) · `npm run typecheck` · `npm run lint`
- `npm run verify` — all of the above + build; run before every commit
- `npm run backfill [-- --dry-run | --league L1 | --from 2024 | --refresh]`
- `npm run backtest` — walk-forward on data/cache CSVs → `src/data/backtest.json` (~10 s)
- Cron jobs: `POST /api/cron/{sync-fixtures|refit|odds-daily|odds-closing}` with `Authorization: Bearer $CRON_SECRET`

## Data facts learned (don't re-discover)
- football-data.co.uk URLs redirect to `https://football-data.co.uk/...` (no www) and need a User-Agent.
- Times in those CSVs are UK local time → converted with `zonedTimeToUtc(..., "Europe/London")`.
- **Pinnacle columns (`PS*`, `P>2.5`) disappear mid-2025-26 and are absent in 2026-27.** Betfair Exchange
  (`BFE*`) exists from 2024-25. Sharp reference = Pinnacle if present, else Betfair. 2026-27 files add `HxG/AxG`.
- Canonical team names = football-data.co.uk names. Other providers map via `team_aliases`
  (`src/lib/teams/resolve.ts` static map + fuzzy); misses land in `unresolved_team_names` — never guessed.
- The Odds API: we pass an explicit `bookmakers=` list (≤10 books = 1 region) → h2h+totals = 2 credits/league call.
- Odds stored in `odds_snapshots` with bookmaker keys `pinnacle`, `betfair_ex`, `market_max`, `market_avg`, `*_fr`.

## Backtest verdict (drives defaults)
The DC+Elo model is calibrated but loses to the sharp market on log-loss (0.992 vs 0.976) and its value bets lose
(−11% yield, −7% CLV). Only the sharp-anchored probability (Pinnacle/Betfair Shin) gave positive CLV. Hence
`bankroll_settings.model_weight` defaults to 0: value prob = w·model + (1−w)·sharp. Don't raise the default without a new
walk-forward proof. Details: `docs/BACKTEST.md`.

## Layout
- `src/lib/providers/` — fdcouk (CSV), fd-org, odds-api: fetch + pure mapping
- `src/lib/ingest/` — `repo.ts` (DB access, TeamResolver), `jobs.ts` (cron jobs)
- `src/lib/model/` — pure probability engine (Dixon-Coles, Elo, Shin, Kelly)
- `src/lib/backtest/` — walk-forward + metrics
- `src/lib/picks.ts` · `guardrails.ts` · `stats.ts` — pure app logic (tested)
- `src/lib/data/queries.ts` — server reads (RLS client) · `src/app/(app)/actions.ts` — server actions
- `src/proxy.ts` — auth gate (all routes except /login, /auth/*, /api/cron)
- UI: SVG charts hand-rolled in `src/components/charts.tsx` (no chart lib). In SVG attributes use hex colours, not `var()`.
- `scripts/` — backfill (and backtest in STEP 4)
- `supabase/migrations/` — schema + pg_cron

## Workflow
- Work phase by phase (see `docs/PLAN.md`). Run verification (typecheck, lint, tests, build) before each commit.
- Push to `main` after each phase. Keep this file updated after each phase.

## Status
- [x] STEP 0 — research (see `docs/PLAN.md` §0)
- [x] STEP 1 — plan (validated)
- [x] STEP 2 — data ingestion (code + tests done; DB not yet provisioned — needs Supabase keys)
- [x] STEP 3 — probability engine (`src/lib/model/`, 94% coverage)
- [x] STEP 4 — backtest (`npm run backtest`, verdict in `docs/BACKTEST.md`; /backtest page in STEP 5)
- [x] STEP 5 — dashboard UI (/today, /match/[id], /bets, /stats, /settings, /backtest)
- [x] STEP 6 — Claude analysis layer (`src/lib/ai/analysis.ts`, `/api/analyse/[matchId]`, number-integrity check)
- [x] STEP 7 — guardrails (`src/lib/guardrails.ts`, enforced in `placeBet` server action)
- [ ] Provision Supabase + keys, apply migrations, run backfill, deploy to Vercel (needs owner accounts)
