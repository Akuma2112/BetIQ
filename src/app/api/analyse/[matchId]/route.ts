import Anthropic from "@anthropic-ai/sdk";
import { NextResponse, type NextRequest } from "next/server";
import { ANALYSIS_TOOL, analysisSchema, buildUserPrompt, checkNumbers, inputHash, SYSTEM_PROMPT, type AnalysisInput } from "@/lib/ai/analysis";
import { getGuards, getLatestOdds, getMatch, getPredictions, getRecentForm, getSettings } from "@/lib/data/queries";
import { leagueById, type LeagueId } from "@/lib/leagues";
import { BOOK_LABELS, buildPicks } from "@/lib/picks";
import { logApiCall } from "@/lib/ingest/repo";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireOwner } from "@/lib/supabase/server";

export const maxDuration = 60;

/** POST → cached analysis for the match (regenerated only when its inputs change). */
export async function POST(_req: NextRequest, ctx: RouteContext<"/api/analyse/[matchId]">) {
  const { db } = await requireOwner();
  const id = Number((await ctx.params).matchId);
  const match = await getMatch(db, id);
  const prediction = (await getPredictions(db, [id])).get(id);
  if (!match || !prediction) return NextResponse.json({ error: "Match ou prédiction introuvable." }, { status: 404 });

  const settings = await getSettings(db);
  const picks = buildPicks(prediction, (await getLatestOdds(db, [id])).get(id) ?? [], settings, await getGuards(db, settings));
  const input: AnalysisInput = {
    match: {
      league: leagueById(match.league_id as LeagueId).name,
      home: match.home,
      away: match.away,
      kickoffAt: new Date(match.kickoff_at).toLocaleString("fr-FR", { timeZone: "Europe/Paris", dateStyle: "full", timeStyle: "short" }),
    },
    probabilities: picks
      .filter((p) => p.market !== "btts" || p.outcome === "yes")
      .map((p) => ({
        label: p.label,
        model: p.modelProb,
        sharpMarket: p.marketProb,
        usedForValue: p.prob,
        bestOdds: p.bestOdds,
        bestBook: p.bestBook ? (BOOK_LABELS[p.bestBook] ?? p.bestBook) : null,
        value: p.value,
      })),
    expectedGoals: { home: Number(prediction.lambda_home), away: Number(prediction.lambda_away) },
    form: { home: await getRecentForm(db, match.home, match.kickoff_at), away: await getRecentForm(db, match.away, match.kickoff_at) },
    injuries: null, // no injury feed on the free tier
  };

  const model = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5";
  const hash = inputHash(input, model);
  const { data: cached } = await db.from("analyses").select("content, input_hash, created_at").eq("match_id", id).maybeSingle();
  if (cached && cached.input_hash === hash) return NextResponse.json({ ...cached.content, cached: true, createdAt: cached.created_at });

  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "ANTHROPIC_API_KEY manquante." }, { status: 503 });
  const anthropic = new Anthropic();
  let message;
  try {
    message = await anthropic.messages.create({
      model,
      max_tokens: 1200,
      system: SYSTEM_PROMPT,
      tools: [ANALYSIS_TOOL],
      tool_choice: { type: "tool", name: ANALYSIS_TOOL.name },
      messages: [{ role: "user", content: buildUserPrompt(input) }],
    });
  } catch (err) {
    return NextResponse.json({ error: `Claude indisponible : ${(err as Error).message}` }, { status: 502 });
  }
  await logApiCall(createAdminClient(), { provider: "anthropic", endpoint: `messages:${model}`, httpStatus: 200, creditsUsed: message.usage.input_tokens + message.usage.output_tokens, creditsRemaining: null }, "analyse");

  const block = message.content.find((b) => b.type === "tool_use");
  const parsed = analysisSchema.safeParse(block?.type === "tool_use" ? block.input : null);
  if (!parsed.success) return NextResponse.json({ error: "Réponse de Claude invalide." }, { status: 502 });

  const invented = checkNumbers(parsed.data, input);
  const content = { ...parsed.data, integrity: invented.length ? { ok: false, invented } : { ok: true } };
  // Never cache an answer that invented numbers: it'll be regenerated next time.
  if (!invented.length) {
    await db.from("analyses").upsert({
      match_id: id,
      input_hash: hash,
      model,
      content,
      tokens_in: message.usage.input_tokens,
      tokens_out: message.usage.output_tokens,
      created_at: new Date().toISOString(),
    });
  }
  return NextResponse.json({ ...content, cached: false, createdAt: new Date().toISOString() });
}
