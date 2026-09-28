import { describe, expect, it } from "vitest";
import { buildUserPrompt, checkNumbers, inputHash, SYSTEM_PROMPT, type AnalysisInput } from "@/lib/ai/analysis";

const input: AnalysisInput = {
  match: { league: "Ligue 1", home: "Lens", away: "Lyon", kickoffAt: "2026-10-04 21:00" },
  probabilities: [{ label: "1", model: 0.452, sharpMarket: 0.431, usedForValue: 0.431, bestOdds: 2.45, bestBook: "Winamax", value: 0.056 }],
  expectedGoals: { home: 1.41, away: 1.12 },
  form: { home: ["V", "N", "D"], away: ["V", "V"] },
  injuries: null,
};

describe("analysis layer", () => {
  it("system prompt forbids inventing probabilities", () => {
    expect(SYSTEM_PROMPT).toMatch(/n'inventes AUCUNE probabilité/);
  });

  it("user prompt carries the numbers verbatim and flags missing injuries", () => {
    const prompt = buildUserPrompt(input);
    expect(prompt).toContain("modèle 45.2 %");
    expect(prompt).toContain("marché sharp 43.1 %");
    expect(prompt).toContain("données non disponibles");
  });

  it("accepts percentages copied from the input, flags invented ones", () => {
    const ok = { summary: "Le modèle donne 45.2 % contre 43,1 % au marché.", keyFactors: ["value 5.6 %"], risks: ["forme"], confidenceNote: "ok" };
    expect(checkNumbers(ok, input)).toEqual([]);
    const bad = { ...ok, summary: "Selon moi Lens a 60 % de chances." };
    expect(checkNumbers(bad, input)).toEqual(["60 %"]);
  });

  it("hash changes with inputs", () => {
    expect(inputHash(input, "m")).not.toBe(inputHash({ ...input, injuries: "X absent" }, "m"));
  });
});
