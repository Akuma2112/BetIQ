# BetIQ

Outil personnel (mono-utilisateur) pour repérer les paris football à **valeur positive** sur
Ligue 1, Premier League et La Liga. Les probabilités viennent d'un modèle statistique
(Dixon-Coles + Elo) — jamais d'un LLM. Claude ne sert qu'à commenter les chiffres.

> Jouer comporte des risques : endettement, isolement, dépendance.
> Pour être aidé : [joueurs-info-service.fr](https://www.joueurs-info-service.fr) — 09 74 75 13 13 (appel non surtaxé).

## Stack
Next.js 16 (App Router) · TypeScript strict · Tailwind v4 · Supabase (Postgres, Auth, RLS, pg_cron) · Vercel · Anthropic API.
Detailed plan: [`docs/PLAN.md`](docs/PLAN.md). Rules for contributors/agents: [`CLAUDE.md`](CLAUDE.md).

## Setup

### 1. API keys
| Key | Where | Cost |
|---|---|---|
| Supabase URL + publishable + secret keys | [supabase.com](https://supabase.com) → New project → Project Settings → API Keys | free |
| `FOOTBALL_DATA_ORG_TOKEN` | [football-data.org/client/register](https://www.football-data.org/client/register) — token by email | free (10 req/min) |
| `ODDS_API_KEY` | [the-odds-api.com](https://the-odds-api.com) → Starter plan | free (500 credits/month) |
| `ANTHROPIC_API_KEY` | [console.anthropic.com](https://console.anthropic.com) → API Keys | pay-as-you-go (cents/month, cached) |
| `CRON_SECRET` | `openssl rand -hex 32` | — |

Historical data comes from [football-data.co.uk](https://www.football-data.co.uk) — no key needed.

```bash
cp .env.example .env.local   # then fill it in
npm install
```

### 2. Database
Apply the migrations in `supabase/migrations/` (Supabase CLI `supabase db push`, or paste them into the SQL editor in order).
Then, in the SQL editor:
```sql
-- Vault secrets used by pg_cron (before applying the *_cron.sql migration)
select vault.create_secret('https://<your-app>.vercel.app', 'site_url');
select vault.create_secret('<CRON_SECRET value>', 'cron_secret');
```
In Authentication → URL Configuration, set the Site URL and add `<NEXT_PUBLIC_SITE_URL>/auth/callback` to the redirect URLs.
First magic-link login with `OWNER_EMAIL` registers you as the owner automatically (`app_owner`); then **disable sign-ups**
(Authentication → Providers → Email). Any other email is rejected anyway.

### 3. Backfill history (idempotent, safe to re-run)
```bash
npm run backfill -- --dry-run      # parse only, no DB
npm run backfill                   # 2022-23 → current season, 3 leagues
npm run backfill -- --league L1 --from 2024
```
CSVs are cached in `data/cache/` (past seasons are never re-downloaded; the current one is).

### 4. Backtest
```bash
npm run backtest   # walk-forward on the cached CSVs → src/data/backtest.json (shown on /backtest)
```
Verdict and method: [`docs/BACKTEST.md`](docs/BACKTEST.md). Short version: the Dixon-Coles + Elo model does **not** beat the
sharp market; only the sharp-anchored probability showed positive CLV, so the app uses it by default (`model_weight = 0`).

### 5. Develop
```bash
npm run dev
npm run verify   # typecheck + lint + tests + build
```
Trigger a cron job locally:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-fixtures
```

## Pages
| Route | What |
|---|---|
| `/today` | Next 7 days: model %, sharp market %, best French odds, value, suggested stake; filters (min value, league, market) |
| `/match/[id]` | Score heatmap, odds history, **Analyse** (Claude commentary, cached per match) |
| `/bets` | Journal: log a bet in 2 clicks from a pick, settle it, P&L and CLV per bet |
| `/stats` | CLV first, then yield/ROI, profit curve, by league / market / odds range |
| `/backtest` | Walk-forward results and verdict |
| `/settings` | Bankroll, Kelly fraction, max stake, monthly budget, value threshold, model weight |

Guardrails: monthly budget (stakes drop to 0 + banner), max 2 % per bet (server-enforced, 5 % hard ceiling), pause banner
after 5 straight losses, stakes computed on min(bankroll, bankroll + P&L) so they never grow to chase, ANJ link in the footer.

## Data notes
- **Sharp reference for CLV / fair odds**: Pinnacle closing odds up to ~Jan 2026 (Pinnacle vanished from
  football-data.co.uk mid-2025-26), Betfair Exchange closing from 2024-25 onward. Live: Pinnacle + Betfair via The Odds API.
- **Best odds** only consider ANJ-licensed books (Winamax, Betclic, Unibet, PMU, NetBet).
- Every external call is logged in `api_usage`; odds jobs refuse to exceed 95 % of the monthly quota.
