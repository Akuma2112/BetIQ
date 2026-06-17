import { cn } from "@/lib/utils";
import type { LucideIcon } from "lucide-react";

interface StatCardProps {
  label: string;
  value: string;
  subLabel?: string;
  icon: LucideIcon;
  trend?: "up" | "down" | "neutral";
  trendValue?: string;
  color?: "blue" | "green" | "yellow" | "red";
}

const colorMap = {
  blue: {
    bg: "bg-blue-500/15",
    icon: "text-blue-400",
    border: "border-blue-500/20",
  },
  green: {
    bg: "bg-green-500/15",
    icon: "text-green-400",
    border: "border-green-500/20",
  },
  yellow: {
    bg: "bg-yellow-500/15",
    icon: "text-yellow-400",
    border: "border-yellow-500/20",
  },
  red: {
    bg: "bg-red-500/15",
    icon: "text-red-400",
    border: "border-red-500/20",
  },
};

export function StatCard({
  label,
  value,
  subLabel,
  icon: Icon,
  trend,
  trendValue,
  color = "blue",
}: StatCardProps) {
  const colors = colorMap[color];

  return (
    <div className="rounded-xl border border-slate-700/60 bg-slate-800/50 p-5 hover:bg-slate-800/70 transition-colors">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs font-medium text-slate-400 uppercase tracking-wider">
          {label}
        </span>
        <div className={cn("p-2 rounded-lg", colors.bg, `border ${colors.border}`)}>
          <Icon className={cn("h-4 w-4", colors.icon)} />
        </div>
      </div>

      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        {trend && trendValue && (
          <span
            className={cn(
              "text-xs font-medium mb-0.5",
              trend === "up" && "text-green-400",
              trend === "down" && "text-red-400",
              trend === "neutral" && "text-slate-400"
            )}
          >
            {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"} {trendValue}
          </span>
        )}
      </div>

      {subLabel && (
        <p className="text-xs text-slate-500 mt-1">{subLabel}</p>
      )}
    </div>
  );
}
