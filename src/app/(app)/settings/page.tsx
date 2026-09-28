import { SettingsForm } from "@/components/settings-form";
import { Card, PageTitle, Stat } from "@/components/ui";
import { signOut } from "@/app/(app)/actions";
import { getGuards, getOddsCredits, getSettings } from "@/lib/data/queries";
import { eur } from "@/lib/format";
import { requireOwner } from "@/lib/supabase/server";

export const metadata = { title: "Réglages · BetIQ" };

export default async function SettingsPage() {
  const { db, user } = await requireOwner();
  const settings = await getSettings(db);
  const [guards, credits] = await Promise.all([getGuards(db, settings), getOddsCredits(db)]);
  const quota = Number(process.env.ODDS_API_MONTHLY_CREDITS ?? 500);

  return (
    <>
      <PageTitle>Réglages</PageTitle>
      <Card className="mb-4 p-4">
        <SettingsForm settings={settings} />
      </Card>
      <Card className="mb-4 grid grid-cols-2 gap-4 p-4 sm:grid-cols-4">
        <Stat label="Mise max actuelle" value={eur(guards.maxStake)} hint={`bankroll effective ${eur(guards.effectiveBankroll)}`} />
        <Stat label="Budget restant" value={eur(guards.budgetRemaining)} />
        <Stat label="Série de pertes" value={`${guards.lossStreak}`} hint={`alerte à ${settings.lossStreakWarning}`} />
        <Stat
          label="Crédits Odds API"
          value={`${credits.remaining ?? quota - credits.used}`}
          hint={`restants · ${credits.used} utilisés ce mois / ${quota}`}
        />
      </Card>
      <form action={signOut} className="flex items-center justify-between text-sm text-muted">
        <span>{user.email}</span>
        <button className="underline">Se déconnecter</button>
      </form>
    </>
  );
}
