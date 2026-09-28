"use client";

import { useActionState } from "react";
import { updateSettings, type SettingsState } from "@/app/(app)/actions";
import type { Settings } from "@/lib/data/queries";

const inputCls = "w-full rounded-md border border-line bg-bg px-3 py-2 font-mono text-fg outline-none focus:border-gold";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span>{label}</span>
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function SettingsForm({ settings }: { settings: Settings }) {
  const [state, action, pending] = useActionState<SettingsState, FormData>(updateSettings, {});
  return (
    <form action={action} className="grid gap-4 sm:grid-cols-2">
      <Field label="Bankroll (€)" hint="Capital dédié aux paris. Les gains ne l’augmentent jamais automatiquement.">
        <input name="bankroll" type="number" step="0.01" min="1" defaultValue={settings.bankroll} className={inputCls} />
      </Field>
      <Field label="Budget mensuel (€)" hint="Une fois atteint, plus aucune mise suggérée jusqu’au mois suivant.">
        <input name="monthly_budget" type="number" step="0.01" min="0" defaultValue={settings.monthlyBudget} className={inputCls} />
      </Field>
      <Field label="Fraction de Kelly" hint="0.25 = quart de Kelly (recommandé).">
        <input name="kelly_fraction" type="number" step="0.05" min="0.05" max="1" defaultValue={settings.kellyFraction} className={inputCls} />
      </Field>
      <Field label="Mise max par pari (% bankroll)" hint="Plafond dur : 5 % maximum.">
        <input name="max_stake_pct" type="number" step="0.1" min="0.1" max="5" defaultValue={+(settings.maxStakePct * 100).toFixed(2)} className={inputCls} />
      </Field>
      <Field label="Seuil de value (%)" hint="Valeur minimale pour signaler un pari.">
        <input name="value_threshold" type="number" step="0.5" min="0" max="50" defaultValue={+(settings.valueThreshold * 100).toFixed(2)} className={inputCls} />
      </Field>
      <Field label="Poids du modèle vs marché sharp" hint="0 = proba du marché sharp (défaut, seule approche à CLV positive au backtest). 1 = modèle seul.">
        <input name="model_weight" type="number" step="0.05" min="0" max="1" defaultValue={settings.modelWeight} className={inputCls} />
      </Field>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-md bg-gold px-5 py-2 font-medium text-bg disabled:opacity-50">
          {pending ? "Enregistrement…" : "Enregistrer"}
        </button>
        {state.ok && <span className="text-sm text-win">Enregistré.</span>}
        {state.error && <span className="text-sm text-loss">{state.error}</span>}
      </div>
    </form>
  );
}
