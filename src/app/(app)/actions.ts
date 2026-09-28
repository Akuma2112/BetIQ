"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getGuards, getSettings } from "@/lib/data/queries";
import { validateStake } from "@/lib/guardrails";
import { closingValue, type LatestOdd } from "@/lib/picks";
import { betPnl } from "@/lib/stats";
import { requireOwner } from "@/lib/supabase/server";

export type ActionResult = { ok: true } | { ok: false; error: string };

const betSchema = z.object({
  matchId: z.coerce.number().int().positive(),
  market: z.enum(["h2h", "totals_2_5", "btts"]),
  outcome: z.enum(["home", "draw", "away", "over", "under", "yes", "no"]),
  bookmaker: z.string().min(1).max(40),
  odds: z.coerce.number().gt(1).lt(1000),
  stake: z.coerce.number().positive(),
  modelProb: z.coerce.number().min(0).max(1),
  value: z.coerce.number(),
});

/** Log a bet. Guardrails are re-checked server-side — the UI is never trusted. */
export async function placeBet(input: z.input<typeof betSchema>): Promise<ActionResult> {
  const parsed = betSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Pari invalide." };
  const b = parsed.data;
  const { db } = await requireOwner();
  const guards = await getGuards(db, await getSettings(db));
  const refusal = validateStake(b.stake, guards);
  if (refusal) return { ok: false, error: refusal };
  const { error } = await db.from("bets").insert({
    match_id: b.matchId,
    market: b.market,
    outcome: b.outcome,
    bookmaker: b.bookmaker,
    odds_taken: b.odds,
    stake: b.stake,
    model_prob: b.modelProb,
    value_at_bet: b.value,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function settleBet(id: number, status: "won" | "lost" | "void" | "pending"): Promise<ActionResult> {
  const { db } = await requireOwner();
  const { data: bet, error } = await db.from("bets").select("match_id, market, outcome, odds_taken, stake").eq("id", id).single();
  if (error || !bet) return { ok: false, error: "Pari introuvable." };
  const { data: closing } = await db
    .from("closing_odds")
    .select("bookmaker, market, outcome, price, captured_at")
    .eq("match_id", bet.match_id)
    .eq("market", bet.market);
  const close = closingValue(
    (closing ?? []).map((q) => ({ ...q, price: Number(q.price), capturedAt: q.captured_at })) as LatestOdd[],
    bet.market,
    bet.outcome,
    Number(bet.odds_taken),
  );
  const { error: e } = await db
    .from("bets")
    .update({
      status,
      pnl: betPnl(status, Number(bet.stake), Number(bet.odds_taken)),
      closing_odds: close?.closingOdds ?? null,
      clv: close?.clv ?? null,
    })
    .eq("id", id);
  if (e) return { ok: false, error: e.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function deleteBet(id: number): Promise<ActionResult> {
  const { db } = await requireOwner();
  const { error } = await db.from("bets").delete().eq("id", id).eq("status", "pending");
  if (error) return { ok: false, error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

const settingsSchema = z.object({
  bankroll: z.coerce.number().positive().max(1_000_000),
  kelly_fraction: z.coerce.number().gt(0).max(1),
  // Hard ceiling 5 % even if the form is tampered with (DB check agrees).
  max_stake_pct: z.coerce.number().gt(0).max(5).transform((v) => v / 100),
  monthly_budget: z.coerce.number().min(0).max(1_000_000),
  value_threshold: z.coerce.number().min(0).max(50).transform((v) => v / 100),
  model_weight: z.coerce.number().min(0).max(1),
});

export type SettingsState = { ok?: boolean; error?: string };

export async function updateSettings(_prev: SettingsState, form: FormData): Promise<SettingsState> {
  const parsed = settingsSchema.safeParse(Object.fromEntries(form));
  if (!parsed.success) return { error: "Valeurs invalides." };
  const { db } = await requireOwner();
  const { error } = await db.from("bankroll_settings").update({ ...parsed.data, updated_at: new Date().toISOString() }).eq("id", 1);
  if (error) return { error: error.message };
  revalidatePath("/", "layout");
  return { ok: true };
}

export async function signOut() {
  const { db } = await requireOwner();
  await db.auth.signOut();
  revalidatePath("/", "layout");
}
