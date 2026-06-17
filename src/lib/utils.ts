import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(dateStr: string): string {
  const date = new Date(dateStr);
  return new Intl.DateTimeFormat("fr-FR", {
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

export function formatOdds(odds: number): string {
  return odds.toFixed(2);
}

export function getConfidenceLabel(confidence: number): string {
  if (confidence >= 75) return "Élevée";
  if (confidence >= 50) return "Moyenne";
  return "Faible";
}

export function getConfidenceColor(confidence: number): string {
  if (confidence >= 75) return "text-green-400";
  if (confidence >= 50) return "text-yellow-400";
  return "text-red-400";
}

export function getResultBadge(result: "W" | "D" | "L" | null): {
  label: string;
  color: string;
} {
  switch (result) {
    case "W":
      return { label: "V", color: "bg-green-500/20 text-green-400" };
    case "D":
      return { label: "N", color: "bg-yellow-500/20 text-yellow-400" };
    case "L":
      return { label: "D", color: "bg-red-500/20 text-red-400" };
    default:
      return { label: "?", color: "bg-slate-500/20 text-slate-400" };
  }
}
