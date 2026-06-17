import type { Metadata } from "next";
import "./globals.css";
import { Navbar } from "@/components/layout/navbar";

export const metadata: Metadata = {
  title: "BetIQ — Pronostics Football IA",
  description:
    "Analysez les matchs de football avec notre intelligence artificielle et obtenez des pronostics précis basés sur les données.",
  keywords: ["football", "pronostics", "paris sportifs", "analyse", "IA"],
  openGraph: {
    title: "BetIQ — Pronostics Football IA",
    description: "Des pronostics football précis grâce à l'intelligence artificielle",
    type: "website",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="fr">
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6 pb-20 md:pb-6">
          {children}
        </main>
      </body>
    </html>
  );
}
