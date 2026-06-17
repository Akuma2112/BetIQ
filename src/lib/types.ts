export interface Team {
  id: number;
  name: string;
  logo: string;
  country: string;
}

export interface League {
  id: number;
  name: string;
  country: string;
  logo: string;
  flag: string;
  season: number;
  round: string;
}

export interface Fixture {
  id: number;
  date: string;
  venue: string;
  status: "NS" | "1H" | "HT" | "2H" | "FT" | "PST" | "CANC";
  homeTeam: Team;
  awayTeam: Team;
  league: League;
  score: {
    home: number | null;
    away: number | null;
  };
}

export interface Prediction {
  fixtureId: number;
  winner: "home" | "away" | "draw";
  confidence: number;
  advice: string;
  goals: {
    home: string;
    away: string;
  };
  percent: {
    home: string;
    draw: string;
    away: string;
  };
}

export interface Odds {
  fixtureId: number;
  bookmaker: string;
  home: number;
  draw: number;
  away: number;
}

export interface TeamForm {
  result: "W" | "D" | "L";
  homeOrAway: "H" | "A";
  opponent: string;
  score: string;
  date: string;
}

export interface Standing {
  rank: number;
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalsDiff: number;
  points: number;
  form: string;
}

export interface DashboardStats {
  totalPredictions: number;
  correctPredictions: number;
  winRate: number;
  avgOdds: number;
  roi: number;
  streak: number;
}

export interface MatchWithPrediction extends Fixture {
  prediction: Prediction;
  odds: Odds;
  homeForm: TeamForm[];
  awayForm: TeamForm[];
}
