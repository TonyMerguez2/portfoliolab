"use client";
import { createContext, useContext, useState, useEffect, ReactNode } from "react";

export type Asset = { ticker: string; name: string; type?: string; };
export type Portfolio = { id: number; name: string; color: string; assets: { ticker: string; weight: number }[] };

/** Surface style shared by every chart surface in the app. */
export type DisplayMode = "glass" | "black";

type AppContextType = {
  mode: "portfolio" | "asset";
  setMode: (m: "portfolio" | "asset") => void;
  activePortfolio: Portfolio | null;
  setActivePortfolio: (p: Portfolio | null) => void;
  activeAsset: Asset | null;
  setActiveAsset: (a: Asset | null) => void;
  displayMode: DisplayMode;
  toggleDisplayMode: () => void;
};

const AppContext = createContext<AppContextType>({
  mode: "asset",
  setMode: () => {},
  activePortfolio: null,
  setActivePortfolio: () => {},
  activeAsset: null,
  setActiveAsset: () => {},
  displayMode: "glass",
  toggleDisplayMode: () => {},
});

export function AppProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<"portfolio" | "asset">("asset");
  const [activePortfolio, setActivePortfolioState] = useState<Portfolio | null>(null);
  const [activeAsset, setActiveAssetState] = useState<Asset | null>(null);
  const [displayMode, setDisplayModeState] = useState<DisplayMode>("glass");

  useEffect(() => {
    const savedPortfolio = localStorage.getItem("activePortfolio");
    const savedAsset = localStorage.getItem("activeAsset");
    const savedMode = localStorage.getItem("appMode") as "portfolio" | "asset" | null;
    if (savedPortfolio) { setActivePortfolioState(JSON.parse(savedPortfolio)); }
    if (savedAsset) { setActiveAssetState(JSON.parse(savedAsset)); }
    if (savedMode) { setModeState(savedMode); }
    else if (savedPortfolio) { setModeState("portfolio"); }
    // Same key the chart page used when this was a page-local setting, so
    // existing preferences carry over.
    if (localStorage.getItem("novac_chart_display") === "black") setDisplayModeState("black");
  }, []);

  const toggleDisplayMode = () => {
    setDisplayModeState(current => {
      const next: DisplayMode = current === "glass" ? "black" : "glass";
      try { localStorage.setItem("novac_chart_display", next); } catch {}
      return next;
    });
  };

  const setMode = (m: "portfolio" | "asset") => {
    setModeState(m);
    localStorage.setItem("appMode", m);
  };

  const setActivePortfolio = (p: Portfolio | null) => {
    setActivePortfolioState(p);
    if (p) { localStorage.setItem("activePortfolio", JSON.stringify(p)); setMode("portfolio"); }
    else { localStorage.removeItem("activePortfolio"); }
  };

  const setActiveAsset = (a: Asset | null) => {
    setActiveAssetState(a);
    if (a) { localStorage.setItem("activeAsset", JSON.stringify(a)); setMode("asset"); }
    else { localStorage.removeItem("activeAsset"); }
  };

  return (
    <AppContext.Provider value={{ mode, setMode, activePortfolio, setActivePortfolio, activeAsset, setActiveAsset, displayMode, toggleDisplayMode }}>
      {children}
    </AppContext.Provider>
  );
}

export const useApp = () => useContext(AppContext);
