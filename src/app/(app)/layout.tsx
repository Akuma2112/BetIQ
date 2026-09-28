import Link from "next/link";
import { Nav } from "@/components/nav";
import { Banner } from "@/components/ui";
import { getGuards, getSettings } from "@/lib/data/queries";
import { eur } from "@/lib/format";
import { requireOwner } from "@/lib/supabase/server";

export default async function AppLayout({ children }: LayoutProps<"/">) {
  const { db } = await requireOwner();
  const settings = await getSettings(db);
  const guards = await getGuards(db, settings);

  return (
    <>
      <div className="hidden items-center justify-between border-b border-line px-4 md:flex">
        <Link href="/today" className="font-display text-xl text-gold">
          BetIQ
        </Link>
        <Nav />
      </div>
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 md:pb-10">
        {guards.budgetReached && (
          <Banner tone="danger" title="Budget mensuel atteint">
            Tu as engagé {eur(settings.monthlyBudget)} ce mois-ci. Les mises suggérées sont à 0 jusqu’au 1er du mois prochain.
          </Banner>
        )}
        {guards.pauseSuggested && (
          <Banner tone="warn" title={`${guards.lossStreak} pertes d’affilée — fais une pause`}>
            Une série de pertes est normale, même avec un avantage réel. Ne cherche pas à te refaire : les mises ne sont jamais augmentées
            après des pertes. Reviens dans quelques jours et regarde ta CLV plutôt que ton solde.
          </Banner>
        )}
        {children}
      </main>
      <footer className="mx-auto w-full max-w-3xl px-4 pb-24 text-center text-xs text-muted md:pb-6">
        Jouer comporte des risques : endettement, isolement, dépendance. Pour être aidé, appelez le 09 74 75 13 13 (appel non surtaxé) ·{" "}
        <a href="https://www.joueurs-info-service.fr" target="_blank" rel="noopener noreferrer" className="text-gold underline">
          joueurs-info-service.fr
        </a>
      </footer>
      <div className="md:hidden">
        <Nav />
      </div>
    </>
  );
}
