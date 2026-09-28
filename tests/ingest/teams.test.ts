import { describe, expect, it } from "vitest";
import { normalizeName, resolveTeamName } from "@/lib/teams/resolve";

const L1 = ["Paris SG", "Paris FC", "Marseille", "Lyon", "Lens", "Lille", "St Etienne", "Rennes"];
const LIGA = ["Real Madrid", "Ath Madrid", "Ath Bilbao", "Sociedad", "Betis", "Vallecano"];

describe("normalizeName", () => {
  it("strips accents, punctuation and case", () => {
    expect(normalizeName("Atlético  Madrid")).toBe("atletico madrid");
    expect(normalizeName("Nott'm Forest")).toBe("nottm forest");
    expect(normalizeName("Brighton & Hove")).toBe("brighton and hove");
  });
});

describe("resolveTeamName", () => {
  it.each([
    ["Paris Saint-Germain FC", "Paris SG"],
    ["Paris Saint Germain", "Paris SG"],
    ["Paris FC", "Paris FC"],
    ["Olympique de Marseille", "Marseille"],
    ["AS Saint-Étienne", "St Etienne"],
    ["Stade Rennais FC 1901", "Rennes"],
  ])("L1: %s → %s", (raw, expected) => expect(resolveTeamName(raw, L1)).toBe(expected));

  it.each([
    ["Club Atlético de Madrid", "Ath Madrid"],
    ["Atlético Madrid", "Ath Madrid"],
    ["Athletic Bilbao", "Ath Bilbao"],
    ["Real Madrid CF", "Real Madrid"],
    ["Rayo Vallecano de Madrid", "Vallecano"],
  ])("Liga: %s → %s", (raw, expected) => expect(resolveTeamName(raw, LIGA)).toBe(expected));

  it("fuzzy-matches unknown spellings among league candidates", () => {
    expect(resolveTeamName("RC Lens Football", L1)).toBe("Lens");
  });

  it("returns null rather than guessing when ambiguous or unknown", () => {
    expect(resolveTeamName("Paris", L1)).toBeNull();
    expect(resolveTeamName("Totally Unknown", L1)).toBeNull();
  });
});
