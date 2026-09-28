# Backtest — honest verdict (2026-09-28)

Reproduce: `npm run backfill -- --dry-run && npm run backtest` (≈ 10 s). Output: `src/data/backtest.json`, shown on `/backtest`.

## Protocol
- Data: football-data.co.uk, Ligue 1 + Premier League + La Liga, 2022-23 → 2026-27 (to date).
- **Walk-forward**: models are refit every Monday on matches strictly before that Monday (unit-tested: altering
  future results or the match itself does not change a prediction).
- **Validation** 2023-24 → picks ξ (time decay) and the Dixon-Coles/Elo weight. **Test** 2024-25 → today,
  parameters frozen: 2,224 matches.
- Market benchmark: Shin-devigged sharp odds — Pinnacle, or Betfair Exchange once Pinnacle disappears (mid-2025-26).
  "Opening" ≈ prices ~2 days before kickoff (when we'd bet), "closing" = last price.
- Bets: value ≥ threshold, ¼ Kelly capped at 2 % of bankroll, odds ≤ 10, bankroll 1,000.
  Bet prices: market **average** (proxy for a typical French book) and market **maximum** (upper bound — includes
  books not available in France, so optimistic).

## Results (test set)

| 1X2 log-loss (lower = better) | L1 | EPL | Liga | All |
|---|---|---|---|---|
| Model (0.7 DC + 0.3 Elo) | 0.992 | 1.008 | 0.976 | **0.992** |
| Sharp market, opening | 0.969 | 1.000 | 0.957 | **0.976** |
| Sharp market, closing | 0.969 | 0.997 | 0.953 | **0.973** |

Brier: model 0.591 vs market 0.581 (opening) / 0.579 (closing). Calibration is good (predicted ≈ observed in every
bin), but the model is **less sharp** than the market: it is right on average, yet knows less than the market does.

| Strategy (test) | Bets | Yield | Avg CLV | Bets beating the close |
|---|---|---|---|---|
| Model, value ≥ 5 %, **avg** prices | 2,356 | **−11.3 %** | −7.0 % | 18 % |
| Model, value ≥ 5 %, max prices | 3,272 | −8.2 % | −2.3 % | 37 % |
| Sharp market only (model weight 0), max prices, value ≥ 3 % | 231 | −8.3 % | **+5.9 %** | **74 %** |

The last line was selected on the **validation** season (CLV +4.5 %, 79 % beating the close, yield +7.6 % on 136 bets)
and held up out-of-sample on CLV. Its test yield is negative, but 231 bets at ~3.0 average odds is far too few to
separate skill from luck: at that size, the standard error of the yield is ≈ ±11 %. CLV converges much faster than
profit and is the signal to trust.

## Verdict
1. **The Dixon-Coles + Elo model does not beat the market.** It loses on log-loss in every league, and betting on its
   "value" loses about the bookmaker margin plus the model's error. Mixing any share of it into the market
   probability made CLV worse on both validation and test.
2. **The only positive signal is line shopping against a sharp reference**: take the Pinnacle/Betfair devigged
   probability as the truth and bet only where a book offers a clearly better price. That produced consistently
   positive CLV (+4.5 % / +5.9 %). Whether *French-licensed* books offer such prices often enough is unknown until the
   live odds snapshots accumulate — the max-price column includes books you can't use.
3. Therefore the app defaults to **`model_weight = 0`**: the value probability is the sharp market's. The model's
   numbers are still shown as a second opinion, and the weight is adjustable in /settings. Revisit when the live CLV
   of real bets (tracked on /stats) says otherwise.

Ways the model could improve (not done — each needs its own walk-forward proof before it earns any weight):
xG-based ratings (2026-27 CSVs include xG), lineups/injuries, a market-informed prior.
