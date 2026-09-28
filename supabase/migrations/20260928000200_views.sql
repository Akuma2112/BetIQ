-- Read helpers for the UI. security_invoker → RLS of the caller applies.

-- Latest quote per match/book/market/outcome.
create or replace view latest_odds with (security_invoker = on) as
select distinct on (match_id, bookmaker, market, outcome)
  match_id, bookmaker, market, outcome, price, captured_at, is_closing
from odds_snapshots
order by match_id, bookmaker, market, outcome, captured_at desc;

-- Closing quote per match/book/market/outcome (last snapshot flagged closing).
create or replace view closing_odds with (security_invoker = on) as
select distinct on (match_id, bookmaker, market, outcome)
  match_id, bookmaker, market, outcome, price, captured_at
from odds_snapshots
where is_closing
order by match_id, bookmaker, market, outcome, captured_at desc;

-- Latest prediction per match.
create or replace view latest_predictions with (security_invoker = on) as
select distinct on (match_id) *
from predictions
order by match_id, created_at desc;
