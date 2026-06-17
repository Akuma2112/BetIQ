import { AlertTriangle, RefreshCw } from "lucide-react";

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export function ErrorState({
  message = "Une erreur est survenue",
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <AlertTriangle className="h-10 w-10 text-yellow-400 mb-3" />
      <p className="text-slate-300 text-sm mb-4">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="flex items-center gap-2 text-xs bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
        >
          <RefreshCw className="h-3 w-3" />
          Réessayer
        </button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string }) {
  return (
    <div className="flex items-center gap-2 text-red-400 text-xs p-3 bg-red-500/10 rounded-lg border border-red-500/20">
      <AlertTriangle className="h-3 w-3 flex-shrink-0" />
      <span>{message}</span>
    </div>
  );
}
