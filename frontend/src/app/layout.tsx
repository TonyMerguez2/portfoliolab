import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { LangProvider } from "@/lib/LangContext";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "PortfolioLab — Backtesting Engine",
  description: "Professional-grade portfolio backtesting with performance, risk, and diversification analytics.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={inter.className}>
        <LangProvider>{children}</LangProvider>
      </body>
    </html>
  );
}
