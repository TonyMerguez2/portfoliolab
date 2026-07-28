import type { Metadata } from "next";
import { AppProvider } from "@/lib/AppContext";
import { Inter } from "next/font/google";
import "./globals.css";
import GlobalHeader from "@/components/GlobalHeader";
import SideNav from "@/components/SideNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "NOVAC — Analyse de Portefeuille",
  description: "Construisez, analysez et comprenez votre portefeuille d'investissement.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body className={inter.className}>
        <AppProvider>
          <SideNav/>
          <div className="novac-shell">
            <GlobalHeader/>
            {children}
          </div>
        </AppProvider>
      </body>
    </html>
  );
}
