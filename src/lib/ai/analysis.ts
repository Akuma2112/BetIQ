import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Claude analysis layer. The LLM only COMMENTS on numbers computed by the model;
 * it must never produce or alter a probability. Enforced by the system prompt AND by
 * `checkNumbers`, which flags any percentage in the output that isn't in the input.
 */

export interface AnalysisInput {
  match: { league: string; home: string; away: string; kickoffAt: string };
  probabilities: {
    label: string;
    model: number;
    sharpMarket: number | null;
    usedForValue: number | null;
    bestOdds: number | null;
    bestBook: string | null;
    value: number | null;
  }[];
  expectedGoals: { home: number; away: number };
  form: { home: string[]; away: string[] };
  injuries: string | null;
}

export const analysisSchema = z.object({
  summary: z.string().min(1).max(800),
  keyFactors: z.array(z.string().max(240)).min(1).max(6),
  risks: z.array(z.string().max(240)).min(1).max(6),
  confidenceNote: z.string().min(1).max(400),
});
export type Analysis = z.infer<typeof analysisSchema>;

export const ANALYSIS_TOOL = {
  name: "submit_analysis",
  description: "Soumettre l'analyse du match en français.",
  input_schema: {
    type: "object" as const,
    properties: {
      summary: { type: "string", description: "Résumé en 2-4 phrases, en français." },
      keyFactors: { type: "array", items: { type: "string" }, description: "3 à 5 facteurs clés." },
      risks: { type: "array", items: { type: "string" }, description: "2 à 4 risques pour ce pari." },
      confidenceNote: { type: "string", description: "Une phrase sur la fiabilité de la lecture des chiffres." },
    },
    required: ["summary", "keyFactors", "risks", "confidenceNote"],
  },
};

export const SYSTEM_PROMPT = `Tu es l'analyste d'un outil personnel de paris sportifs. Tu écris en français, de façon concise et factuelle.

RÈGLES ABSOLUES :
1. Tu ne calcules, n'estimes, ne corriges et n'inventes AUCUNE probabilité, cote ou pourcentage. Les chiffres viennent d'un modèle statistique et du marché ; tu les commentes uniquement.
2. Si tu cites un chiffre, recopie-le exactement tel qu'il apparaît dans les données fournies. N'en crée aucun autre.
3. Tu ne dis jamais qu'un pari est « sûr » ou « garanti ». Tu ne pousses jamais à augmenter les mises.
4. Si une donnée manque (blessures, compositions), dis-le au lieu de la supposer.
5. Rappelle-toi : la référence la plus fiable est la cote de clôture du marché sharp ; un écart entre modèle et marché signifie le plus souvent que le modèle ignore une information.

Réponds uniquement via l'outil submit_analysis.`;

const pct = (x: number | null) => (x === null ? "n/d" : `${(x * 100).toFixed(1)} %`);

export function buildUserPrompt(input: AnalysisInput): string {
  const rows = input.probabilities
    .map(
      (p) =>
        `- ${p.label} : modèle ${pct(p.model)} | marché sharp ${pct(p.sharpMarket)} | proba retenue ${pct(p.usedForValue)} | meilleure cote FR ${p.bestOdds ?? "n/d"}${p.bestBook ? ` (${p.bestBook})` : ""} | value ${pct(p.value)}`,
    )
    .join("\n");
  return `Match : ${input.match.home} – ${input.match.away} (${input.match.league}), coup d'envoi ${input.match.kickoffAt}.

Buts attendus (modèle) : ${input.expectedGoals.home.toFixed(2)} – ${input.expectedGoals.away.toFixed(2)}

Probabilités et cotes :
${rows}

Forme récente (du plus récent au plus ancien, V/N/D) :
- ${input.match.home} : ${input.form.home.join(" ") || "n/d"}
- ${input.match.away} : ${input.form.away.join(" ") || "n/d"}

Blessures / absences : ${input.injuries ?? "données non disponibles"}

Commente ces chiffres : ce qui les explique, ce qui pourrait les rendre trompeurs, et la cohérence entre modèle et marché.`;
}

export function inputHash(input: AnalysisInput, model: string): string {
  return createHash("sha256").update(JSON.stringify({ input, model, v: 1 })).digest("hex");
}

/** Every "xx %" / "xx,x %" in the output must match an input percentage (±0.15 pt). Returns offending values. */
export function checkNumbers(analysis: Analysis, input: AnalysisInput): string[] {
  const allowed = input.probabilities.flatMap((p) => [p.model, p.sharpMarket, p.usedForValue, p.value]).filter((x): x is number => x !== null).map((x) => x * 100);
  const text = [analysis.summary, ...analysis.keyFactors, ...analysis.risks, analysis.confidenceNote].join(" ");
  const found = [...text.matchAll(/(-?\d+(?:[.,]\d+)?)\s?%/g)].map((m) => ({ raw: m[0], v: Number(m[1].replace(",", ".")) }));
  return found.filter(({ v }) => !allowed.some((a) => Math.abs(a - v) <= 0.15 || Math.abs(Math.round(a) - v) < 1e-9)).map((f) => f.raw);
}
