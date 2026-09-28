/**
 * Team-name resolution across providers. Canonical names are football-data.co.uk
 * names (the backfill creates teams from them). Pure: no I/O.
 */

export type TeamSource = "fdcouk" | "fd_org" | "odds_api";

// Known provider spellings → canonical name. Misses fall back to fuzzy matching,
// and anything still unresolved is logged to `unresolved_team_names`.
const KNOWN_ALIASES: Record<string, string[]> = {
  // Premier League
  Arsenal: ["Arsenal FC"],
  "Aston Villa": ["Aston Villa FC"],
  Bournemouth: ["AFC Bournemouth"],
  Brentford: ["Brentford FC"],
  Brighton: ["Brighton & Hove Albion FC", "Brighton and Hove Albion", "Brighton Hove"],
  Burnley: ["Burnley FC"],
  Chelsea: ["Chelsea FC"],
  Coventry: ["Coventry City FC", "Coventry City"],
  "Crystal Palace": ["Crystal Palace FC"],
  Everton: ["Everton FC"],
  Fulham: ["Fulham FC"],
  Hull: ["Hull City AFC", "Hull City"],
  Ipswich: ["Ipswich Town FC", "Ipswich Town"],
  Leeds: ["Leeds United FC", "Leeds United"],
  Leicester: ["Leicester City FC", "Leicester City"],
  Liverpool: ["Liverpool FC"],
  Luton: ["Luton Town FC", "Luton Town"],
  "Man City": ["Manchester City FC", "Manchester City"],
  "Man United": ["Manchester United FC", "Manchester United"],
  Newcastle: ["Newcastle United FC", "Newcastle United"],
  "Nott'm Forest": ["Nottingham Forest FC", "Nottingham Forest", "Nottingham"],
  "Sheffield United": ["Sheffield United FC"],
  Southampton: ["Southampton FC"],
  Sunderland: ["Sunderland AFC"],
  Tottenham: ["Tottenham Hotspur FC", "Tottenham Hotspur"],
  "West Ham": ["West Ham United FC", "West Ham United"],
  Wolves: ["Wolverhampton Wanderers FC", "Wolverhampton Wanderers", "Wolverhampton"],
  // Ligue 1
  Ajaccio: ["AC Ajaccio"],
  Angers: ["Angers SCO"],
  Auxerre: ["AJ Auxerre"],
  Brest: ["Stade Brestois 29", "Stade Brestois"],
  Clermont: ["Clermont Foot 63", "Clermont Foot"],
  "Le Havre": ["Le Havre AC"],
  "Le Mans": ["Le Mans FC"],
  Lens: ["RC Lens", "Racing Club de Lens"],
  Lille: ["Lille OSC", "LOSC Lille"],
  Lorient: ["FC Lorient"],
  Lyon: ["Olympique Lyonnais", "Olympique Lyon"],
  Marseille: ["Olympique de Marseille", "Olympique Marseille"],
  Metz: ["FC Metz"],
  Monaco: ["AS Monaco FC", "AS Monaco"],
  Montpellier: ["Montpellier HSC"],
  Nantes: ["FC Nantes"],
  Nice: ["OGC Nice"],
  "Paris FC": ["Paris FC"],
  "Paris SG": ["Paris Saint-Germain FC", "Paris Saint Germain", "Paris Saint-Germain", "PSG"],
  Reims: ["Stade de Reims"],
  Rennes: ["Stade Rennais FC 1901", "Stade Rennais", "Stade Rennais FC"],
  "St Etienne": ["AS Saint-Étienne", "Saint Etienne", "Saint-Étienne", "Saint-Etienne"],
  Strasbourg: ["RC Strasbourg Alsace", "RC Strasbourg"],
  Toulouse: ["Toulouse FC"],
  Troyes: ["ESTAC Troyes"],
  // La Liga
  Alaves: ["Deportivo Alavés", "Alavés"],
  Almeria: ["UD Almería", "Almería"],
  "Ath Bilbao": ["Athletic Club", "Athletic Bilbao"],
  "Ath Madrid": ["Club Atlético de Madrid", "Atlético Madrid", "Atletico Madrid", "Atleti"],
  Barcelona: ["FC Barcelona"],
  Betis: ["Real Betis Balompié", "Real Betis"],
  Cadiz: ["Cádiz CF", "Cadiz CF"],
  Celta: ["RC Celta de Vigo", "Celta Vigo", "Celta de Vigo"],
  Elche: ["Elche CF"],
  Espanol: ["RCD Espanyol de Barcelona", "Espanyol"],
  Getafe: ["Getafe CF"],
  Girona: ["Girona FC"],
  Granada: ["Granada CF"],
  "La Coruna": ["RC Deportivo La Coruña", "RC Deportivo", "Deportivo La Coruña", "Deportivo La Coruna", "Deportivo"],
  "Las Palmas": ["UD Las Palmas"],
  Leganes: ["CD Leganés", "Leganés"],
  Levante: ["Levante UD"],
  Malaga: ["Málaga CF", "Málaga"],
  Mallorca: ["RCD Mallorca"],
  Osasuna: ["CA Osasuna"],
  Oviedo: ["Real Oviedo"],
  "Real Madrid": ["Real Madrid CF"],
  Santander: ["Real Racing Club de Santander", "Racing Santander", "Racing de Santander"],
  Sevilla: ["Sevilla FC"],
  Sociedad: ["Real Sociedad de Fútbol", "Real Sociedad"],
  Valencia: ["Valencia CF"],
  Valladolid: ["Real Valladolid CF", "Real Valladolid"],
  Vallecano: ["Rayo Vallecano de Madrid", "Rayo Vallecano"],
  Villarreal: ["Villarreal CF"],
};

const NOISE_TOKENS = new Set(["fc", "afc", "cf", "sc", "sco", "ac", "as", "aj", "ogc", "rc", "rcd", "ca", "cd", "ud", "club", "de", "del", "la", "the", "and", "hsc", "osc", "estac"]);

export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/['’.]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function tokens(name: string): Set<string> {
  return new Set(
    normalizeName(name)
      .split(" ")
      .filter((t) => t && !NOISE_TOKENS.has(t) && !/^\d+$/.test(t)),
  );
}

const ALIAS_INDEX: Map<string, string> = (() => {
  const index = new Map<string, string>();
  for (const [canonical, aliases] of Object.entries(KNOWN_ALIASES)) {
    index.set(normalizeName(canonical), canonical);
    for (const alias of aliases) index.set(normalizeName(alias), canonical);
  }
  return index;
})();

function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  if (inter === Math.min(a.size, b.size)) return 0.9; // one is a subset of the other
  return inter / (a.size + b.size - inter);
}

/**
 * Resolve a provider name to a canonical name. Known aliases win (canonical names are
 * unique across leagues, so a newly promoted team resolves before it exists in the DB);
 * otherwise fuzzy-match among `candidates` (teams of the league).
 * Returns null when not confident — the caller must log it rather than guess.
 */
export function resolveTeamName(raw: string, candidates: readonly string[]): string | null {
  const direct = ALIAS_INDEX.get(normalizeName(raw));
  if (direct) return direct;

  const exact = candidates.find((c) => normalizeName(c) === normalizeName(raw));
  if (exact) return exact;

  const rawTokens = tokens(raw);
  const scored = candidates
    .map((c) => ({ c, s: Math.max(similarity(rawTokens, tokens(c)), ...(KNOWN_ALIASES[c] ?? []).map((a) => similarity(rawTokens, tokens(a)))) }))
    .sort((x, y) => y.s - x.s);
  const [best, second] = scored;
  if (best && best.s >= 0.5 && (!second || best.s - second.s >= 0.2)) return best.c;
  return null;
}
