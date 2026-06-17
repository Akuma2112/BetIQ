import { cn } from "@/lib/utils";

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn("skeleton h-4 w-full", className)}
      role="status"
      aria-label="Chargement..."
    />
  );
}

export function StatCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-5">
      <Skeleton className="h-3 w-24 mb-3" />
      <Skeleton className="h-8 w-20 mb-2" />
      <Skeleton className="h-3 w-32" />
    </div>
  );
}

export function MatchCardSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4 sm:p-5">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-3 w-28" />
        <Skeleton className="h-5 w-16 rounded-full" />
      </div>
      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex flex-col items-center gap-2 flex-1">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
        <Skeleton className="h-6 w-12" />
        <div className="flex flex-col items-center gap-2 flex-1">
          <Skeleton className="h-10 w-10 rounded-full" />
          <Skeleton className="h-3 w-20" />
        </div>
      </div>
      <div className="border-t border-slate-700 pt-3 mt-3">
        <Skeleton className="h-3 w-full mb-2" />
        <Skeleton className="h-2 w-full rounded-full" />
      </div>
    </div>
  );
}

export function StandingsSkeleton() {
  return (
    <div className="rounded-xl border border-slate-700 bg-slate-800/50 p-4">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 py-3 border-b border-slate-700/50 last:border-0">
          <Skeleton className="h-4 w-4" />
          <Skeleton className="h-7 w-7 rounded-full" />
          <Skeleton className="h-3 w-28 flex-1" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
          <Skeleton className="h-3 w-8" />
        </div>
      ))}
    </div>
  );
}
