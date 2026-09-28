"use client";

import { motion } from "framer-motion";
import { useState } from "react";

interface AnalysisResult {
  summary: string;
  keyFactors: string[];
  risks: string[];
  confidenceNote: string;
  integrity?: { ok: boolean; invented?: string[] };
  cached?: boolean;
  createdAt?: string;
  error?: string;
}

export function AnalyseButton({ matchId }: { matchId: number }) {
  const [state, setState] = useState<{ loading: boolean; data?: AnalysisResult }>({ loading: false });

  async function run() {
    setState({ loading: true });
    try {
      const res = await fetch(`/api/analyse/${matchId}`, { method: "POST" });
      setState({ loading: false, data: await res.json() });
    } catch {
      setState({ loading: false, data: { error: "Erreur réseau." } as AnalysisResult });
    }
  }

  const d = state.data;
  return (
    <div>
      <button onClick={run} disabled={state.loading} className="rounded-md border border-gold px-4 py-2 text-sm text-gold hover:bg-gold hover:text-bg disabled:opacity-50">
        {state.loading ? "Analyse en cours…" : d ? "Relancer l’analyse" : "Analyse"}
      </button>
      {d?.error && <p className="mt-3 text-sm text-loss">{d.error}</p>}
      {d && !d.error && (
        <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3 text-sm leading-relaxed">
          {d.integrity && !d.integrity.ok && (
            <p className="rounded border border-loss/60 bg-loss/10 px-3 py-2 text-xs">
              ⚠ Cette réponse cite des chiffres absents des données ({d.integrity.invented?.join(", ")}). Ignore-les : seuls les chiffres du tableau font foi.
            </p>
          )}
          <p>{d.summary}</p>
          <div>
            <h3 className="mb-1 font-sans text-xs uppercase tracking-wider text-muted">Facteurs clés</h3>
            <ul className="list-disc space-y-1 pl-5">
              {d.keyFactors.map((f) => (
                <li key={f}>{f}</li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="mb-1 font-sans text-xs uppercase tracking-wider text-muted">Risques</h3>
            <ul className="list-disc space-y-1 pl-5">
              {d.risks.map((r) => (
                <li key={r}>{r}</li>
              ))}
            </ul>
          </div>
          <p className="text-xs text-muted">
            {d.confidenceNote} {d.cached && "· (en cache)"}
          </p>
          <p className="text-[11px] text-muted">Commentaire généré par Claude à partir des chiffres ci-dessus. Il ne calcule aucune probabilité.</p>
        </motion.div>
      )}
    </div>
  );
}
