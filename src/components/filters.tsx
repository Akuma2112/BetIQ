"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const selectCls = "rounded-md border border-line bg-surface px-2 py-1.5 text-sm text-fg outline-none focus:border-gold";

export function TodayFilters({ defaultMin }: { defaultMin: number }) {
  const router = useRouter();
  const path = usePathname();
  const params = useSearchParams();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`${path}?${next}`, { scroll: false });
  };
  return (
    <div className="mb-5 flex flex-wrap items-center gap-2">
      <select aria-label="Value minimum" className={selectCls} value={params.get("min") ?? String(defaultMin)} onChange={(e) => set("min", e.target.value)}>
        {[0, 2, 3, 5, 8, 10, 15].map((v) => (
          <option key={v} value={v}>
            Value ≥ {v} %
          </option>
        ))}
      </select>
      <select aria-label="Championnat" className={selectCls} value={params.get("league") ?? ""} onChange={(e) => set("league", e.target.value)}>
        <option value="">Tous</option>
        <option value="L1">Ligue 1</option>
        <option value="EPL">Premier League</option>
        <option value="LIGA">La Liga</option>
      </select>
      <select aria-label="Marché" className={selectCls} value={params.get("market") ?? ""} onChange={(e) => set("market", e.target.value)}>
        <option value="">1N2 + ±2.5</option>
        <option value="h2h">1N2</option>
        <option value="totals_2_5">±2.5 buts</option>
        <option value="btts">Les 2 marquent</option>
      </select>
      <label className="ml-auto flex items-center gap-2 text-sm text-muted">
        <input type="checkbox" className="accent-[#c9a84c]" checked={params.get("v") === "1"} onChange={(e) => set("v", e.target.checked ? "1" : "")} />
        Value uniquement
      </label>
    </div>
  );
}
