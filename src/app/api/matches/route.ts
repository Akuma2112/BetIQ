import { NextResponse } from "next/server";
import { MOCK_MATCHES } from "@/lib/mock-data";

/* TODO: replace with real API-Football key */
// const API_FOOTBALL_KEY = process.env.API_FOOTBALL_KEY;
// const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";

export async function GET() {
  try {
    /* TODO: replace with real API-Football key */
    // Real implementation would be:
    // const res = await fetch(`${API_FOOTBALL_BASE}/fixtures?next=10`, {
    //   headers: { "x-apisports-key": API_FOOTBALL_KEY! },
    //   next: { revalidate: 300 },
    // });
    // const data = await res.json();

    await new Promise((r) => setTimeout(r, 100)); // simulate network
    return NextResponse.json({ data: MOCK_MATCHES, mock: true });
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer les matchs" },
      { status: 500 }
    );
  }
}
