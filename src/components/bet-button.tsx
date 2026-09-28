"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useState, useTransition } from "react";
import { placeBet } from "@/app/(app)/actions";
import type { Market, Outcome } from "@/lib/providers/types";

export interface BetDraft {
  matchId: number;
  market: Market;
  outcome: Outcome;
  bookmaker: string;
  bookLabel: string;
  odds: number;
  stake: number;
  maxStake: number;
  modelProb: number;
  value: number;
}

/** Two clicks: "Parier" opens the pre-filled slip, "Confirmer" logs it (server re-checks guardrails). */
export function BetButton({ draft, disabled }: { draft: BetDraft; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const [odds, setOdds] = useState(draft.odds.toFixed(2));
  const [stake, setStake] = useState(draft.stake.toFixed(2));
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  if (msg?.ok) return <span className="text-xs text-win">{msg.text}</span>;

  return (
    <div className="flex flex-col items-end gap-2">
      {!open && (
        <button
          disabled={disabled}
          onClick={() => setOpen(true)}
          className="rounded-md border border-gold px-3 py-1.5 text-xs text-gold hover:bg-gold hover:text-bg disabled:cursor-not-allowed disabled:border-line disabled:text-muted"
        >
          Parier
        </button>
      )}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.15 }}
            className="flex w-full flex-wrap items-end justify-end gap-2 text-xs"
          >
            <label className="flex flex-col gap-1 text-muted">
              Cote {draft.bookLabel}
              <input value={odds} onChange={(e) => setOdds(e.target.value)} inputMode="decimal" className="w-20 rounded border border-line bg-bg px-2 py-1.5 font-mono text-fg" />
            </label>
            <label className="flex flex-col gap-1 text-muted">
              Mise (max {draft.maxStake.toFixed(2)} €)
              <input value={stake} onChange={(e) => setStake(e.target.value)} inputMode="decimal" className="w-24 rounded border border-line bg-bg px-2 py-1.5 font-mono text-fg" />
            </label>
            <button onClick={() => setOpen(false)} className="px-2 py-1.5 text-muted">
              Annuler
            </button>
            <button
              disabled={pending}
              onClick={() =>
                start(async () => {
                  const res = await placeBet({ ...draft, odds: Number(odds.replace(",", ".")), stake: Number(stake.replace(",", ".")) });
                  setMsg(res.ok ? { ok: true, text: "Pari enregistré ✓" } : { ok: false, text: res.error });
                })
              }
              className="rounded-md bg-gold px-3 py-1.5 font-medium text-bg disabled:opacity-50"
            >
              {pending ? "…" : "Confirmer"}
            </button>
            {msg && !msg.ok && <p className="w-full text-right text-loss">{msg.text}</p>}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
