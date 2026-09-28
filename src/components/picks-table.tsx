import { Fragment } from "react";
import { BetButton } from "@/components/bet-button";
import { tone } from "@/components/ui";
import type { GuardState } from "@/lib/guardrails";
import { odds, pct, signedPct } from "@/lib/format";
import { BOOK_LABELS, type Pick } from "@/lib/picks";

/** Model %, market %, best FR odds, value, stake — value rows highlighted in gold. */
export function PicksTable({ picks, matchId, guards }: { picks: Pick[]; matchId: number; guards: GuardState }) {
  const th = "px-1 py-1 text-right font-normal";
  return (
    <table className="w-full whitespace-nowrap text-[13px] sm:text-sm">
      <thead>
        <tr className="text-left text-[10px] uppercase tracking-wider text-muted">
          <th className="px-1 py-1 font-normal" />
          <th className={th}>Modèle</th>
          <th className={th}>Marché</th>
          <th className={th}>Cote</th>
          <th className={th}>Value</th>
          <th className={th}>Mise</th>
        </tr>
      </thead>
      <tbody className="font-mono tabular-nums">
        {picks.map((p) => (
          <Fragment key={`${p.market}-${p.outcome}`}>
            <tr className={`border-t border-line/60 ${p.isValue ? "bg-gold/10" : ""}`}>
              <td className={`px-1 py-2 font-sans ${p.isValue ? "text-gold" : ""}`}>{p.label}</td>
              <td className="px-1 py-2 text-right">{pct(p.modelProb, 0)}</td>
              <td className="px-1 py-2 text-right text-muted">{pct(p.marketProb, 0)}</td>
              <td className="px-1 py-2 text-right">
                {odds(p.bestOdds)}
                {p.bestBook && <div className="font-sans text-[10px] leading-tight text-muted">{BOOK_LABELS[p.bestBook] ?? p.bestBook}</div>}
              </td>
              <td className={`px-1 py-2 text-right ${p.isValue ? "text-gold" : tone(p.value)}`}>{signedPct(p.value)}</td>
              <td className="px-1 py-2 text-right">{p.isValue ? `${p.stake.toFixed(2)} €` : <span className="text-muted">—</span>}</td>
            </tr>
            {p.isValue && (
              <tr className="bg-gold/10">
                <td colSpan={6} className="px-1 pb-2">
                  <BetButton
                    disabled={guards.budgetReached}
                    draft={{
                      matchId,
                      market: p.market,
                      outcome: p.outcome,
                      bookmaker: p.bestBook!,
                      bookLabel: BOOK_LABELS[p.bestBook!] ?? p.bestBook!,
                      odds: p.bestOdds!,
                      stake: p.stake,
                      maxStake: Math.min(guards.maxStake, guards.budgetRemaining),
                      modelProb: p.prob!,
                      value: p.value!,
                    }}
                  />
                </td>
              </tr>
            )}
          </Fragment>
        ))}
      </tbody>
    </table>
  );
}
