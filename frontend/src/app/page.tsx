"use client";
import { useRouter } from "next/navigation";

const ACTIONS = [
  { ticker: "AAPL", name: "Apple", flag: "🇺🇸" },
  { ticker: "MSFT", name: "Microsoft", flag: "🇺🇸" },
  { ticker: "NVDA", name: "Nvidia", flag: "🇺🇸" },
  { ticker: "ASML", name: "ASML", flag: "🇳🇱" },
  { ticker: "MC.PA", name: "LVMH", flag: "🇫🇷" },
  { ticker: "TSLA", name: "Tesla", flag: "🇺🇸" },
  { ticker: "GOOGL", name: "Google", flag: "🇺🇸" },
  { ticker: "AMZN", name: "Amazon", flag: "🇺🇸" },
  { ticker: "META", name: "Meta", flag: "🇺🇸" },
  { ticker: "OR.PA", name: "L'Oréal", flag: "🇫🇷" },
  { ticker: "SAP", name: "SAP", flag: "🇩🇪" },
  { ticker: "TTE.PA", name: "TotalEnergies", flag: "🇫🇷" },
  { ticker: "NOVO-B.CO", name: "Novo Nordisk", flag: "🇩🇰" },
];

const ETFS = [
  { ticker: "CW8.PA", name: "MSCI World", flag: "🌍" },
  { ticker: "EWLD.PA", name: "EWLD", flag: "🌍" },
  { ticker: "WPEA.PA", name: "WPEA", flag: "🌍" },
  { ticker: "SPY", name: "S&P 500 ETF", flag: "🇺🇸" },
  { ticker: "QQQ", name: "Nasdaq ETF", flag: "🇺🇸" },
  { ticker: "AAXJ", name: "MSCI Asia ex-JP", flag: "🌏" },
  { ticker: "ESEA.PA", name: "MSCI EM", flag: "🌍" },
  { ticker: "PAEEM.PA", name: "MSCI EM ESG", flag: "🌱" },
  { ticker: "GLD", name: "Gold ETF", flag: "🥇" },
  { ticker: "TLT", name: "US Bonds 20Y", flag: "🇺🇸" },
  { ticker: "IEMB.AS", name: "EM Bonds", flag: "🌍" },
  { ticker: "IWDA.AS", name: "iShares World", flag: "🌍" },
  { ticker: "VWCE.DE", name: "Vanguard World", flag: "🌍" },
];

const CRYPTOS = [
  { ticker: "BTC-USD", name: "Bitcoin", flag: "—" },
  { ticker: "ETH-USD", name: "Ethereum", flag: "—" },
  { ticker: "SOL-USD", name: "Solana", flag: "—" },
  { ticker: "BNB-USD", name: "BNB", flag: "—" },
  { ticker: "ADA-USD", name: "Cardano", flag: "—" },
  { ticker: "XRP-USD", name: "XRP", flag: "—" },
  { ticker: "DOT-USD", name: "Polkadot", flag: "—" },
  { ticker: "AVAX-USD", name: "Avalanche", flag: "—" },
  { ticker: "MATIC-USD", name: "Polygon", flag: "—" },
  { ticker: "LINK-USD", name: "Chainlink", flag: "—" },
];

const FEATURES = [
  { icon: "📈", title: "Backtesting", desc: "Analysez les performances historiques sur jusqu'à 10 ans." },
  { icon: "⚡", title: "Analyse du risque", desc: "Volatilité, drawdown, VaR, Sharpe — tous les indicateurs essentiels." },
  { icon: "🎲", title: "Monte Carlo", desc: "Simulez 500 scénarios futurs et calculez vos probabilités." },
  { icon: "🎯", title: "Objectifs financiers", desc: "Définissez un objectif et obtenez la probabilité de l'atteindre." },
  { icon: "📚", title: "Pédagogie intégrée", desc: "Chaque métrique expliquée en mode intermédiaire et avancé." },
  { icon: "🌍", title: "Multi-langues", desc: "Français, anglais, espagnol, chinois et allemand." },
];

function AssetCard({ ticker, name, flag }: { ticker: string; name: string; flag: string }) {
  return (
    <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2 shadow-sm flex-shrink-0 select-none">
      {flag !== "—" && <span className="text-lg leading-none">{flag}</span>}
      <div>
        <p className="text-xs font-bold text-slate-800 font-mono leading-tight text-[11px]">{ticker}</p>
        <p className="text-xs text-slate-400 leading-tight">{name}</p>
      </div>
    </div>
  );
}

function ScrollRow({ items, direction }: { items: typeof ACTIONS; direction: "left" | "right" }) {
  const doubled = [...items, ...items, ...items, ...items, ...items, ...items];
  return (
    <div className="overflow-hidden" style={{ maskImage: "linear-gradient(to right, transparent, black 10%, black 90%, transparent)" }}>
      <div style={{
        display: "flex",
        width: "max-content",
        animation: `scroll-${direction} ${items.length * 6}s linear infinite`,
      }}>
        {doubled.map((a, i) => (
          <div key={i} className="mx-2">
            <AssetCard {...a} />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function LandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-50">
      <style>{`
        @keyframes scroll-left {
          0% { transform: translateX(0); }
          100% { transform: translateX(-50%); }
        }
        @keyframes scroll-right {
          0% { transform: translateX(-50%); }
          100% { transform: translateX(0); }
        }
        .scroll-left:hover, .scroll-right:hover {
          animation-play-state: paused;
        }
      `}</style>

      {/* Nav */}
      <nav className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-6xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-indigo-600 rounded-lg flex items-center justify-center">
              <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"/>
              </svg>
            </div>
            <span className="font-bold text-slate-900 text-base tracking-tight">Quantfolio</span>
          </div>
          <button onClick={() => router.push("/dashboard")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors">
            Commencer gratuitement
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-6xl mx-auto px-6 pt-20 pb-16 text-center">
        <div className="inline-flex items-center gap-2 bg-indigo-50 border border-indigo-200 rounded-full px-4 py-1.5 text-xs font-semibold text-indigo-600 mb-6">
          ✨ Analyse quantitative accessible à tous
        </div>
        <h1 className="text-5xl sm:text-6xl font-bold text-slate-900 mb-6 leading-tight">
          Construisez, analysez et<br/>
          <span className="text-indigo-600">comprenez</span> votre portefeuille.
        </h1>
        <p className="text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-relaxed">
          Backtesting, analyse du risque, simulations Monte Carlo, objectifs financiers et pédagogie intégrée — le tout gratuitement.
        </p>
        <div className="flex items-center justify-center gap-4">
          <button onClick={() => router.push("/dashboard")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-3.5 rounded-xl text-base transition-colors shadow-lg shadow-indigo-200 flex items-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z"/>
            </svg>
            Commencer gratuitement
          </button>
          <a href="https://github.com/TonyMerguez2/portfoliolab" target="_blank"
            className="flex items-center gap-2 text-slate-600 hover:text-slate-900 font-medium text-sm border border-slate-200 hover:border-slate-300 px-5 py-3.5 rounded-xl transition-colors bg-white">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
              <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/>
            </svg>
            GitHub
          </a>
        </div>
      </section>

      {/* Ticker rows */}
      <section className="pb-16">
        <div className="max-w-6xl mx-auto px-6 mb-8 text-center">
          <p className="text-sm font-semibold text-slate-400 uppercase tracking-widest mb-1">Actifs supportés</p>
          <p className="text-slate-600">Actions, ETF et cryptomonnaies du monde entier</p>
        </div>

        <div className="space-y-4">
          <div>
            <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Actions</p>
            <ScrollRow items={ACTIONS} direction="left"/>
          </div>
          <div>
            <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">ETF</p>
            <ScrollRow items={ETFS} direction="right"/>
          </div>
          <div>
            <p className="text-center text-xs font-semibold text-slate-400 uppercase tracking-widest mb-3">Crypto</p>
            <ScrollRow items={CRYPTOS} direction="left"/>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="bg-white border-y border-slate-200 py-16">
        <div className="max-w-6xl mx-auto px-6">
          <p className="text-center text-sm font-semibold text-slate-400 uppercase tracking-widest mb-2">Fonctionnalités</p>
          <h2 className="text-3xl font-bold text-slate-900 text-center mb-12">Tout ce dont vous avez besoin</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {FEATURES.map(f => (
              <div key={f.title} className="p-6 rounded-2xl border border-slate-100 hover:border-indigo-200 hover:shadow-sm transition-all">
                <span className="text-3xl mb-4 block">{f.icon}</span>
                <h3 className="text-base font-semibold text-slate-900 mb-2">{f.title}</h3>
                <p className="text-sm text-slate-500 leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-20 text-center">
        <div className="max-w-2xl mx-auto px-6">
          <h2 className="text-3xl font-bold text-slate-900 mb-4">Prêt à analyser votre portefeuille ?</h2>
          <p className="text-slate-500 mb-8">Gratuit, sans inscription, sans publicité.</p>
          <button onClick={() => router.push("/dashboard")}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold px-8 py-4 rounded-xl text-base transition-colors shadow-lg shadow-indigo-200">
            Commencer maintenant →
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-400">
        <p>Quantfolio — Outil open-source d'analyse de portefeuille</p>
        <p className="mt-1">Données via Yahoo Finance · Les performances passées ne préjugent pas des performances futures</p>
      </footer>
    </div>
  );
}
