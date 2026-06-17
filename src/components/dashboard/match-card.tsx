"use client";

import { useState } from "react";
import Image from "next/image";
import { ChevronDown, ChevronUp, Clock } from "lucide-react";
import { cn, formatDate, formatOdds, getConfidenceColor, getConfidenceLabel, getResultBadge } from "@/lib/utils";
import type { MatchWithPrediction } from "@/lib/types";

interface MatchCardProps {
  match: MatchWithPrediction;
}

export function MatchCard({ match }: MatchCardProps) {
  const [expanded, setExpanded] = useState(false);
  const { prediction, odds, homeForm, awayForm } = match;

  const winnerLabel =
    prediction.winner === "home"
      ? match.homeTeam.name
      : prediction.winner === "away"
      ? match.awayTeam.name
      : "Match nul";

  const confidenceColor = getConfidenceColor(prediction.confidence);
  const confidenceLabel = getConfidenceLabel(prediction.confidence);

  return (
    <article className="rounded-xl border border-slate-700/60 bg-slate-800/50 overflow-hidden hover:border-slate-600 transition-colors">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-slate-900/40 border-b border-slate-700/40">
        <div className="flex items-center gap-2">
          <Image
            src={match.league.flag}
            alt={match.league.country}
            width={16}
            height={12}
            className="rounded-sm object-cover"
            unoptimized
          />
          <span className="text-xs text-slate-400 font-medium">
            {match.league.name} · {match.league.round}
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500">
          <Clock className="h-3 w-3" />
          <span>{formatDate(match.date)}</span>
        </div>
      </div>

      {/* Teams */}
      <div className="p-4 sm:p-5">
        <div className="flex items-center justify-between gap-4">
          {/* Home team */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <div className="relative h-12 w-12">
              <Image
                src={match.homeTeam.logo}
                alt={match.homeTeam.name}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <span className="text-xs font-semibold text-center text-white leading-tight line-clamp-2">
              {match.homeTeam.name}
            </span>
          </div>

          {/* Score / VS */}
          <div className="flex flex-col items-center gap-1 shrink-0">
            <span className="text-lg font-bold text-slate-300 px-3 py-1 bg-slate-900/50 rounded-lg border border-slate-700/40">
              {match.score.home !== null ? `${match.score.home} - ${match.score.away}` : "vs"}
            </span>
          </div>

          {/* Away team */}
          <div className="flex flex-col items-center gap-2 flex-1 min-w-0">
            <div className="relative h-12 w-12">
              <Image
                src={match.awayTeam.logo}
                alt={match.awayTeam.name}
                fill
                className="object-contain"
                unoptimized
              />
            </div>
            <span className="text-xs font-semibold text-center text-white leading-tight line-clamp-2">
              {match.awayTeam.name}
            </span>
          </div>
        </div>

        {/* Prediction bar */}
        <div className="mt-4">
          <div className="flex justify-between text-xs text-slate-400 mb-1.5">
            <span>{prediction.percent.home}</span>
            <span>{prediction.percent.draw}</span>
            <span>{prediction.percent.away}</span>
          </div>
          <div className="flex h-2 rounded-full overflow-hidden gap-0.5">
            <div
              className="bg-blue-500 transition-all"
              style={{ width: prediction.percent.home }}
            />
            <div
              className="bg-slate-500 transition-all"
              style={{ width: prediction.percent.draw }}
            />
            <div
              className="bg-purple-500 transition-all"
              style={{ width: prediction.percent.away }}
            />
          </div>
        </div>

        {/* Prediction + odds */}
        <div className="mt-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className={cn("text-xs font-semibold", confidenceColor)}>
              {confidenceLabel}
            </span>
            <span className="text-xs text-slate-400 truncate">· {winnerLabel}</span>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <OddsBadge label="1" value={formatOdds(odds.home)} active={prediction.winner === "home"} />
            <OddsBadge label="N" value={formatOdds(odds.draw)} active={prediction.winner === "draw"} />
            <OddsBadge label="2" value={formatOdds(odds.away)} active={prediction.winner === "away"} />
          </div>
        </div>
      </div>

      {/* Expand button */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-center gap-1 py-2.5 text-xs text-slate-500 hover:text-slate-300 border-t border-slate-700/40 hover:bg-slate-800/30 transition-colors"
        aria-expanded={expanded}
      >
        {expanded ? (
          <>Réduire <ChevronUp className="h-3 w-3" /></>
        ) : (
          <>Détails & Forme <ChevronDown className="h-3 w-3" /></>
        )}
      </button>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-slate-700/40 p-4 grid grid-cols-2 gap-4">
          <FormSection title={match.homeTeam.name} form={homeForm} />
          <FormSection title={match.awayTeam.name} form={awayForm} />

          <div className="col-span-2 mt-1">
            <p className="text-xs text-slate-400 bg-slate-900/40 rounded-lg p-3 border border-slate-700/30">
              <span className="text-slate-300 font-medium">Analyse :</span>{" "}
              {prediction.advice} — Buts prévus : {prediction.goals.home} / {prediction.goals.away}
            </p>
          </div>
        </div>
      )}
    </article>
  );
}

function OddsBadge({ label, value, active }: { label: string; value: string; active: boolean }) {
  return (
    <div
      className={cn(
        "flex flex-col items-center px-2 py-1 rounded-lg border text-xs transition-colors",
        active
          ? "bg-blue-600/25 border-blue-500/50 text-blue-300"
          : "bg-slate-900/50 border-slate-700/40 text-slate-400"
      )}
    >
      <span className="text-[9px] leading-tight">{label}</span>
      <span className="font-bold leading-tight">{value}</span>
    </div>
  );
}

function FormSection({
  title,
  form,
}: {
  title: string;
  form: MatchWithPrediction["homeForm"];
}) {
  return (
    <div>
      <p className="text-xs font-medium text-slate-400 mb-2 truncate">{title}</p>
      <div className="flex gap-1">
        {form.slice(0, 5).map((f, i) => {
          const badge = getResultBadge(f.result);
          return (
            <div
              key={i}
              title={`${f.homeOrAway === "H" ? "Dom." : "Ext."} vs ${f.opponent} ${f.score}`}
              className={cn(
                "h-6 w-6 rounded flex items-center justify-center text-[10px] font-bold",
                badge.color
              )}
            >
              {badge.label}
            </div>
          );
        })}
      </div>
    </div>
  );
}
