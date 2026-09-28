# BetIQ — Plan (STEP 1)

## 0. Research summary (STEP 0, validated 2026-09-28)

| Need | Choice | Why |
|---|---|---|
| History + backtest odds | **football-data.co.uk CSV** | Free; results + Pinnacle closing (`PSCH/PSCD/PSCA`), market max/avg, O/U 2.5 closing (`PC>2.5`, `PC<2.5`) |
| Fixtures + results | **football-data.org** free | PL, FL1, PD included; 10 req/min, no monthly cap |
| Live odds | **The Odds API** free (500 credits/mo) | Region `eu` holds Pinnacle **and** winamax_fr, betclic_fr, unibet_fr, pmu_fr. Cost = markets × regions per call |
| Scheduler | **Supabase pg_cron + pg_net** | Vercel Hobby cron is once/day ±59 min — useless for closing odds |
| Model maths | **Hand-rolled TS** (Dixon-Coles MLE + L-BFGS, Elo, Shin) | No maintained npm lib; ~40 params/league → ms-fast. Oracle: frozen `penaltyblog` (Python) outputs as Vitest fixtures |
| Upgrade path (not MVP) | The Odds API 20K ($30/mo); API-Football ($19/mo) for injuries/lineups | Only if the backtest justifies it |

**Found during STEP 2:** football-data.co.uk lost Pinnacle mid-2025-26 (none in 2026-27); Betfair Exchange
closing (`BFEC*`) is available from 2024-25. Backtest/CLV reference = Pinnacle when present, else Betfair.
The Odds API is called with an explicit `bookmakers=` list (7 books ≤ 10 → billed as one region).

BTTS: model-only (no BTTS odds on the free budget) → shown as a probability, no value/stake.

## 1. Folder structure

```
BetIQ/
├─ CLAUDE.md · README.md · .env.example · vitest.config.ts
├─ docs/PLAN.md
├─ supabase/
│  ├─ migrations/20260928000000_init.sql     schema + RLS
│  ├─ migrations/…_cron.sql                  pg_cron jobs (STEP 2)
│  └─ seed/team_aliases.sql                  name mapping for the 3 leagues
├─ scripts/
│  ├─ backfill.ts          football-data.co.uk → matches + odds_snapshots (idempotent upserts)
│  └─ backtest.ts          walk-forward → backtest_runs
├─ src/
│  ├─ proxy.ts             auth gate (Next 16 name for middleware)
│  ├─ app/
│  │  ├─ login/            magic link (OWNER_EMAIL only)
│  │  ├─ auth/callback/
│  │  ├─ (app)/            protected layout: nav + budget banner + ANJ footer
│  │  │  ├─ today/  match/[id]/  bets/  stats/  settings/  backtest/
│  │  └─ api/
│  │     ├─ cron/[job]/route.ts     sync-fixtures | refit | odds | closing
│  │     └─ analyse/[matchId]/route.ts
│  ├─ lib/
│  │  ├─ model/            PURE, tested: poisson, dixon-coles, optimizer, elo, blend,
│  │  │                    margin (proportional + Shin), value, kelly, markets (1X2/OU/BTTS from matrix)
│  │  ├─ backtest/         walk-forward runner + metrics (log-loss, Brier, calibration, ROI, DD)
│  │  ├─ guardrails/       budget, max stake, loss streak (pure)
│  │  ├─ providers/        fd-org.ts, odds-api.ts, fdcouk.ts — each logs to api_usage
│  │  ├─ teams/            alias resolution
│  │  ├─ supabase/         server.ts, browser.ts, admin.ts (service role, server-only)
│  │  └─ ai/               analysis prompt + Anthropic call + cache
│  └─ components/          ui/, charts/, match/, bets/
└─ tests/fixtures/         penaltyblog reference outputs, sample CSV/API payloads
```

## 2. Data flow

```mermaid
flowchart LR
  subgraph Sources
    FDUK[football-data.co.uk CSV]
    FDO[football-data.org]
    ODDS[The Odds API · eu]
  end
  FDUK -- backfill script (once, local) --> DB[(Supabase)]
  CRON[pg_cron + pg_net] -- Bearer CRON_SECRET --> API[/api/cron/*]
  FDO --> API
  ODDS --> API
  API -- upsert matches / odds / api_usage --> DB
  API -- refit --> MODEL[lib/model: Dixon-Coles + Elo → blend]
  MODEL -- predictions --> DB
  DB --> UI[Next.js pages · RLS owner-only]
  UI -- Analyse --> AI[/api/analyse] -- numbers only --> CLAUDE[Claude sonnet-5]
  CLAUDE -- FR commentary JSON --> DB
```

Rules: the model reads only `matches` with `kickoff_at < as_of`. "Best odds" = max over FR-licensed books.
Market fair probability & CLV use Pinnacle (Shin de-margined). Value = p_model × best_odds − 1.

## 3. Schema
See `supabase/migrations/20260928000000_init.sql`. Tables: `app_owner`, `leagues`, `teams`, `team_aliases`,
`matches`, `odds_snapshots`, `model_ratings`, `predictions`, `analyses` (LLM cache), `bankroll_settings`
(single row), `bets`, `api_usage`, `backtest_runs`. RLS on all: `is_owner()`; cron uses the service-role key.
Sign-ups disabled in Supabase Auth; login additionally rejects any email ≠ `OWNER_EMAIL`.

## 4. Env vars (`.env.example`)

| Var | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | client+server | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | client+server | anon/publishable key (RLS applies) |
| `SUPABASE_SECRET_KEY` | server only | service-role key for cron + scripts |
| `OWNER_EMAIL` | server | only email allowed to log in |
| `FOOTBALL_DATA_ORG_TOKEN` | server | football-data.org |
| `ODDS_API_KEY` | server | The Odds API |
| `ODDS_API_MONTHLY_CREDITS` | server | default 500 — hard stop at 95% |
| `ANTHROPIC_API_KEY` | server | analysis layer |
| `ANTHROPIC_MODEL` | server | default `claude-sonnet-5` |
| `CRON_SECRET` | server + Supabase Vault | auth for `/api/cron/*` |
| `NEXT_PUBLIC_SITE_URL` | both | magic-link redirect + pg_net target |

## 5. Cron schedule & monthly API budget

All times UTC, via pg_cron → pg_net POST.

| Job | Schedule | Calls | Monthly |
|---|---|---|---|
| `sync-fixtures` — fd.org matches D-3…D+7 for 3 leagues (new fixtures + finished results) | `0 5 * * *` and `30 23 * * *` | 3 × 2/day | ~180 fd.org calls (free, no cap) |
| `refit` — DC + Elo per league, predictions for next 7 days | `15 5 * * *` | 0 external | 0 |
| `odds` — daily snapshot, h2h+totals, `eu` (2 credits/league), **skips leagues with no match in next 7 days** | `0 8 * * *` | ≤ 6 credits/day | ≤ 180 credits |
| `closing` — every 10 min; if a league has a kickoff in the next 15–30 min and no closing snapshot for that slot → 1 league call, snapshot flagged `is_closing` | `*/10 * * * *` | ~7 slots/league/week × 3 × 2 credits | ~180 credits |
| **Total The Odds API** | | | **~360 / 500** (Odds API empty responses cost 0) |

Safety: every provider call logs to `api_usage` with `credits_remaining` from response headers; odds jobs refuse to run
when projected usage > 95% of `ODDS_API_MONTHLY_CREDITS`. Midweek rounds are covered by the headroom (~140 credits).
If the backtest shows edge and we want more snapshots/markets → 20K plan ($30).

Anthropic: on-demand only, cached per match (`input_hash`), ~3k tokens/call → cents per month.

## 6. Phases after validation

| Step | Output | Done when |
|---|---|---|
| 2 Ingestion | scaffold, migrations applied, aliases seed, `backfill.ts` (2022-23 → current, 2022-23 = Elo/DC warm-up), cron routes + pg_cron SQL | backfill re-run is a no-op; api_usage populated |
| 3 Model | `lib/model/*` + tests (DC vs penaltyblog fixtures, Shin, Kelly caps) | `vitest` green, ≥ 90% coverage on `lib/model` |
| 4 Backtest | walk-forward 2023-24 → 2025-26 (weekly refit, only past data), metrics vs Pinnacle closing, `/backtest` page | honest verdict written in README |
| 5 UI | `/today`, `/match/[id]`, `/bets`, `/stats`, `/settings` | mobile-first, Lighthouse OK |
| 6 Claude | `/api/analyse` with strict JSON schema, "never alter probabilities" rule, cache | test asserts numbers in output = numbers in input |
| 7 Guardrails | budget banner & zero stakes, 2% cap, 5-loss warning, CLV hero on /stats, ANJ footer | guardrail unit tests green |
| End | Vercel deploy via MCP, env vars set, pg_cron pointing at prod URL | |

Each step: typecheck + lint + tests + build → commit → push `main` → update CLAUDE.md.
