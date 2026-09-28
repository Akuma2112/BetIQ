import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { env } from "@/lib/env";
import { snapshotOdds, syncFixtures, type JobReport } from "@/lib/ingest/jobs";
import { createAdminClient } from "@/lib/supabase/admin";

export const maxDuration = 60;

const JOBS: Record<string, () => Promise<JobReport>> = {
  "sync-fixtures": () => syncFixtures(createAdminClient(), env("FOOTBALL_DATA_ORG_TOKEN")),
  "odds-daily": () => snapshotOdds(createAdminClient(), env("ODDS_API_KEY"), env("ODDS_API_MONTHLY_CREDITS"), "daily"),
  "odds-closing": () => snapshotOdds(createAdminClient(), env("ODDS_API_KEY"), env("ODDS_API_MONTHLY_CREDITS"), "closing"),
};

function authorized(req: NextRequest): boolean {
  const expected = Buffer.from(`Bearer ${env("CRON_SECRET")}`);
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  return got.length === expected.length && timingSafeEqual(got, expected);
}

export async function POST(req: NextRequest, ctx: RouteContext<"/api/cron/[job]">) {
  if (!authorized(req)) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const { job } = await ctx.params;
  const run = JOBS[job];
  if (!run) return NextResponse.json({ error: `unknown job ${job}` }, { status: 404 });
  try {
    return NextResponse.json(await run());
  } catch (err) {
    console.error(`[cron:${job}]`, err);
    return NextResponse.json({ error: (err as Error).message }, { status: 500 });
  }
}
