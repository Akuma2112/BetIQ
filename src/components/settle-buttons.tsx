"use client";

import { useTransition } from "react";
import { deleteBet, settleBet } from "@/app/(app)/actions";

export function SettleButtons({ id, status }: { id: number; status: string }) {
  const [pending, start] = useTransition();
  const btn = "rounded border px-2 py-1 text-xs disabled:opacity-40";
  if (status !== "pending")
    return (
      <button disabled={pending} onClick={() => start(async () => void (await settleBet(id, "pending")))} className="text-xs text-muted underline">
        corriger
      </button>
    );
  return (
    <div className="flex gap-1.5">
      <button disabled={pending} onClick={() => start(async () => void (await settleBet(id, "won")))} className={`${btn} border-win text-win`}>
        Gagné
      </button>
      <button disabled={pending} onClick={() => start(async () => void (await settleBet(id, "lost")))} className={`${btn} border-loss text-loss`}>
        Perdu
      </button>
      <button disabled={pending} onClick={() => start(async () => void (await settleBet(id, "void")))} className={`${btn} border-line text-muted`}>
        Remb.
      </button>
      <button
        disabled={pending}
        onClick={() => confirm("Supprimer ce pari ?") && start(async () => void (await deleteBet(id)))}
        className={`${btn} border-transparent text-muted`}
        aria-label="Supprimer"
      >
        ✕
      </button>
    </div>
  );
}
