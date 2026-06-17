import { NextResponse } from "next/server";
import { MOCK_DASHBOARD_STATS } from "@/lib/mock-data";

/* TODO: replace with real API-Football key */
export async function GET() {
  try {
    /* TODO: replace with real API-Football key */
    await new Promise((r) => setTimeout(r, 50));
    return NextResponse.json({ data: MOCK_DASHBOARD_STATS, mock: true });
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer les statistiques" },
      { status: 500 }
    );
  }
}
