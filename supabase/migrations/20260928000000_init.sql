-- BetIQ initial schema — single-owner app.
-- All tables have RLS enabled; only the owner (app_owner.user_id) can read/write.
-- Cron / ingestion code uses the service-role key, which bypasses RLS.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- Owner
-- ---------------------------------------------------------------------------
create table app_owner (
  id      smallint primary key default 1 check (id = 1),
  user_id uuid not null unique references auth.users (id) on delete cascade
);

create or replace function is_owner() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from app_owner where user_id = auth.uid());
$$;

-- ---------------------------------------------------------------------------
-- Reference data
-- ---------------------------------------------------------------------------
create table leagues (
  id            text primary key,              -- 'L1' | 'EPL' | 'LIGA'
  name          text not null,
  country       text not null,
  fd_org_code   text not null unique,          -- football-data.org: FL1 | PL | PD
  odds_api_key  text not null unique,          -- soccer_france_ligue_one | soccer_epl | soccer_spain_la_liga
  fdcouk_code   text not null unique           -- football-data.co.uk: F1 | E0 | SP1
);

insert into leagues (id, name, country, fd_org_code, odds_api_key, fdcouk_code) values
  ('L1',   'Ligue 1',        'France',  'FL1', 'soccer_france_ligue_one', 'F1'),
  ('EPL',  'Premier League', 'England', 'PL',  'soccer_epl',              'E0'),
  ('LIGA', 'La Liga',        'Spain',   'PD',  'soccer_spain_la_liga',    'SP1');

create table teams (
  id         serial primary key,
  name       text not null unique,             -- canonical name
  short_name text,
  crest_url  text
);

-- Each provider spells team names differently; resolve through aliases.
create table team_aliases (
  source  text not null check (source in ('fdcouk', 'fd_org', 'odds_api')),
  alias   text not null,
  team_id int  not null references teams (id) on delete cascade,
  primary key (source, alias)
);

-- Names a provider sent that could not be resolved to a team; fix by adding an alias.
create table unresolved_team_names (
  source    text not null,
  league_id text not null,
  name      text not null,
  last_seen timestamptz not null default now(),
  primary key (source, league_id, name)
);

-- ---------------------------------------------------------------------------
-- Matches & odds
-- ---------------------------------------------------------------------------
create table matches (
  id                bigserial primary key,
  league_id         text not null references leagues (id),
  season            text not null,             -- '2025-26'
  kickoff_at        timestamptz not null,
  home_team_id      int not null references teams (id),
  away_team_id      int not null references teams (id),
  status            text not null default 'scheduled'
                    check (status in ('scheduled', 'live', 'finished', 'postponed', 'cancelled')),
  home_goals        smallint,
  away_goals        smallint,
  home_xg           numeric(4, 2),               -- football-data.co.uk from 2026-27 (HxG/AxG)
  away_xg           numeric(4, 2),
  fd_org_id         int unique,
  odds_api_event_id text unique,
  updated_at        timestamptz not null default now(),
  -- natural key used for idempotent upserts across sources
  unique (league_id, season, home_team_id, away_team_id)
);
create index matches_kickoff_idx on matches (kickoff_at);
create index matches_league_status_idx on matches (league_id, status, kickoff_at);

create table odds_snapshots (
  id          bigserial primary key,
  match_id    bigint not null references matches (id) on delete cascade,
  captured_at timestamptz not null,
  source      text not null check (source in ('odds_api', 'fdcouk')),
  bookmaker   text not null,                   -- 'pinnacle' | 'betfair_ex' | 'winamax_fr' | ... | 'market_max' | 'market_avg'
  market      text not null check (market in ('h2h', 'totals_2_5', 'btts')),
  outcome     text not null check (outcome in ('home', 'draw', 'away', 'over', 'under', 'yes', 'no')),
  price       numeric(7, 3) not null check (price > 1),
  is_closing  boolean not null default false,
  unique (match_id, captured_at, bookmaker, market, outcome)
);
create index odds_match_market_idx on odds_snapshots (match_id, market, captured_at desc);
create index odds_closing_idx on odds_snapshots (match_id) where is_closing;

-- ---------------------------------------------------------------------------
-- Model
-- ---------------------------------------------------------------------------
create table model_ratings (
  id         bigserial primary key,
  league_id  text not null references leagues (id),
  model      text not null check (model in ('dixon_coles', 'elo')),
  as_of      timestamptz not null,             -- only matches strictly before this were used
  params     jsonb not null,                   -- DC: {attack, defence, homeAdv, rho, xi}; Elo: {ratings, k, homeAdv, drawModel}
  fit_stats  jsonb,                            -- log-likelihood, iterations, n_matches
  created_at timestamptz not null default now(),
  unique (league_id, model, as_of)
);

create table predictions (
  id            bigserial primary key,
  match_id      bigint not null references matches (id) on delete cascade,
  model_version text not null,                 -- e.g. 'dc+elo@v1'
  created_at    timestamptz not null default now(),
  lambda_home   numeric(6, 4) not null,
  lambda_away   numeric(6, 4) not null,
  p_home        numeric(6, 5) not null,
  p_draw        numeric(6, 5) not null,
  p_away        numeric(6, 5) not null,
  p_over_2_5    numeric(6, 5) not null,
  p_btts        numeric(6, 5) not null,
  score_matrix  jsonb not null,                -- 11x11 P(home=i, away=j)
  components    jsonb not null,                -- raw DC and Elo probs + blend weights
  unique (match_id, model_version)
);

-- LLM commentary cache (never contains probabilities of its own)
create table analyses (
  match_id   bigint primary key references matches (id) on delete cascade,
  input_hash text not null,                    -- regenerate only if inputs changed
  model      text not null,
  content    jsonb not null,                   -- {summary, keyFactors[], risks[], confidenceNote}
  tokens_in  int,
  tokens_out int,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Betting journal & settings
-- ---------------------------------------------------------------------------
create table bankroll_settings (
  id                   smallint primary key default 1 check (id = 1),
  bankroll             numeric(10, 2) not null default 500,
  kelly_fraction       numeric(4, 3) not null default 0.25 check (kelly_fraction > 0 and kelly_fraction <= 1),
  max_stake_pct        numeric(4, 3) not null default 0.02 check (max_stake_pct > 0 and max_stake_pct <= 0.05),
  monthly_budget       numeric(10, 2) not null default 100,
  value_threshold      numeric(4, 3) not null default 0.05,
  blend_weight_dc      numeric(4, 3) not null default 0.7 check (blend_weight_dc between 0 and 1),
  -- Probability used for value = w·model + (1−w)·sharp market (Shin). Default 0: in the
  -- walk-forward backtest only the sharp-anchored probability produced positive CLV (see docs/BACKTEST.md).
  model_weight         numeric(4, 3) not null default 0 check (model_weight between 0 and 1),
  loss_streak_warning  smallint not null default 5,
  updated_at           timestamptz not null default now()
);
insert into bankroll_settings (id) values (1);

create table bets (
  id            bigserial primary key,
  match_id      bigint not null references matches (id),
  market        text not null check (market in ('h2h', 'totals_2_5', 'btts')),
  outcome       text not null check (outcome in ('home', 'draw', 'away', 'over', 'under', 'yes', 'no')),
  bookmaker     text not null,
  odds_taken    numeric(7, 3) not null check (odds_taken > 1),
  stake         numeric(10, 2) not null check (stake > 0),
  model_prob    numeric(6, 5) not null,
  value_at_bet  numeric(6, 4) not null,
  placed_at     timestamptz not null default now(),
  status        text not null default 'pending' check (status in ('pending', 'won', 'lost', 'void')),
  pnl           numeric(10, 2),
  closing_odds  numeric(7, 3),                 -- Pinnacle closing price for the same outcome
  clv           numeric(6, 4),                 -- odds_taken / closing_odds - 1
  notes         text
);
create index bets_placed_idx on bets (placed_at desc);

-- ---------------------------------------------------------------------------
-- Ops
-- ---------------------------------------------------------------------------
create table api_usage (
  id                bigserial primary key,
  provider          text not null check (provider in ('fd_org', 'odds_api', 'fdcouk', 'anthropic')),
  endpoint          text not null,
  called_at         timestamptz not null default now(),
  http_status       int,
  credits_used      int not null default 1,
  credits_remaining int,                       -- from x-requests-remaining when provided
  job               text
);
create index api_usage_provider_time_idx on api_usage (provider, called_at desc);

create table backtest_runs (
  id         bigserial primary key,
  created_at timestamptz not null default now(),
  config     jsonb not null,
  metrics    jsonb not null,                   -- log-loss, brier, ROI, yield, max DD, n_bets, vs market
  series     jsonb not null                    -- calibration bins, equity curve
);

-- ---------------------------------------------------------------------------
-- RLS: owner-only on every table
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'app_owner', 'leagues', 'teams', 'team_aliases', 'unresolved_team_names', 'matches', 'odds_snapshots',
    'model_ratings', 'predictions', 'analyses', 'bankroll_settings', 'bets',
    'api_usage', 'backtest_runs'
  ] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy owner_all on %I for all to authenticated using (is_owner()) with check (is_owner())', t);
  end loop;
end $$;
