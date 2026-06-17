import { NextResponse } from "next/server";
import { MOCK_STANDINGS } from "@/lib/mock-data";

/* TODO: replace with real API-Football key */
export async function GET() {
  try {
    /* TODO: replace with real API-Football key */
    await new Promise((r) => setTimeout(r, 80));
    return NextResponse.json({ data: MOCK_STANDINGS, mock: true });
  } catch {
    return NextResponse.json(
      { error: "Impossible de récupérer le classement" },
      { status: 500 }
    );
  }
}
