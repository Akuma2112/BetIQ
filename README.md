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
In Authentication → Providers → Email: keep magic link on, **disable sign-ups** after your first login, then register yourself as owner:
```sql
insert into app_owner (user_id) select id from auth.users where email = '<OWNER_EMAIL>';
```

### 3. Backfill history (idempotent, safe to re-run)
```bash
npm run backfill -- --dry-run      # parse only, no DB
npm run backfill                   # 2022-23 → current season, 3 leagues
npm run backfill -- --league L1 --from 2024
```
CSVs are cached in `data/cache/` (past seasons are never re-downloaded; the current one is).

### 4. Develop
```bash
npm run dev
npm run verify   # typecheck + lint + tests + build
```
Trigger a cron job locally:
```bash
curl -X POST -H "Authorization: Bearer $CRON_SECRET" http://localhost:3000/api/cron/sync-fixtures
```

## Data notes
- **Sharp reference for CLV / fair odds**: Pinnacle closing odds up to ~Jan 2026 (Pinnacle vanished from
  football-data.co.uk mid-2025-26), Betfair Exchange closing from 2024-25 onward. Live: Pinnacle + Betfair via The Odds API.
- **Best odds** only consider ANJ-licensed books (Winamax, Betclic, Unibet, PMU, NetBet).
- Every external call is logged in `api_usage`; odds jobs refuse to exceed 95 % of the monthly quota.
