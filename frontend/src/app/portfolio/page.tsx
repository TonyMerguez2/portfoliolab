"use client";
import { useEffect, useState, useMemo, useRef, useId, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import AssetLogo from "@/components/AssetLogo";
import TransactionModal from "@/components/TransactionModal";
import TransactionsView from "@/components/portfolio/TransactionsView";
import AnalyseView from "@/components/portfolio/AnalyseView";
import { createPortal } from "react-dom";
import PanneauProfil from "@/components/portfolio/PanneauProfil";
import PanneauFrais from "@/components/portfolio/PanneauFrais";
import {
  type Analyse, type EtatAnalyse, type Tolerance,
} from "@/lib/analyse";
import { bandeDuScore, pilierLePlusFaible } from "@/lib/portfolio-score/types";
import PerformanceChart from "@/components/portfolio/PerformanceChart";
import AssetGrid from "@/components/portfolio/AssetGrid";
import AllocationDonut from "@/components/portfolio/AllocationDonut";
import RecentActivity from "@/components/portfolio/RecentActivity";
import PortfolioTabs from "@/components/portfolio/PortfolioTabs";
import { donutArcs } from "@/lib/donut";
import { enveloppe, infobulleEnveloppe, valoriser } from "@/lib/portfolio";
import { assetExchange } from "@/lib/assets";
import PastilleEnveloppe from "@/components/portfolio/PastilleEnveloppe";
import RadarChart from "@/components/charts/RadarChart";
import { enTetesAuth } from "@/lib/session";
import { typesParOperation, COULEUR_OP, LIBELLE_OP, type Tx } from "@/lib/journal";
import { FONT } from "@/lib/typography";
import type { Period } from "@/lib/chart/portfolioCurve";
import { JETONS, CLAIR, RAYON, couleurMontant, RAYONS, styleCadreExterieur, styleCarteInterieure } from "@/lib/palette";
import { hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb } from "@/lib/couleur";
import { resoudreJeton } from "@/lib/theme";
import { useClignotement, styleClignotement } from "@/lib/clignotement";
import { CADENCE_COURS_MS } from "@/lib/cadence";
import { useCoursCrypto, symboleBinance } from "@/lib/coursCrypto";
import Cadre from "@/components/ui/Cadre";
import ChiffresRoulants from "@/components/ui/ChiffresRoulants";
import ImagePortefeuille from "@/components/portfolio/ImagePortefeuille";
import { useAnalyseEvenements } from "@/hooks/useAnalyseEvenements";
import { useImpactTitre } from "@/hooks/useImpactTitre";
import { useObjectifs, type Saisie } from "@/hooks/useObjectifs";
import { useProjection } from "@/hooks/useProjection";
import { alerteRepartition, avertissementValeur, type Objectif } from "@/lib/objectifs";
import { useTransparence } from "@/hooks/useTransparence";
import { DividendesAVenir, ProchainsResultats } from "@/components/portfolio/TablesEvenements";
import CalendrierEvenements from "@/components/portfolio/CalendrierEvenements";
import CartesObjectifs from "@/components/portfolio/CartesObjectifs";
import ProjectionObjectif from "@/components/portfolio/ProjectionObjectif";
import ProgressionGlobale from "@/components/portfolio/ProgressionGlobale";
import ConstatsObjectif from "@/components/portfolio/ConstatsObjectif";
import ScenariosObjectif from "@/components/portfolio/ScenariosObjectif";
import FormulaireObjectif from "@/components/portfolio/FormulaireObjectif";
import EvenementsAVenir from "@/components/portfolio/EvenementsAVenir";
import { HistoriqueEvenements, ImpactPotentiel } from "@/components/portfolio/ImpactEvenements";
import { API_URL } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
type PortfolioAsset = { ticker: string; weight: number };
type PortfolioData  = { id: string; name: string; assets: PortfolioAsset[]; color: string; total_value?: number | null; cost_basis?: number | null; image_url?: string | null };
type PriceData      = { symbol: string; price: number; change: number; series?: number[] };
type Enriched       = PortfolioAsset & {
  price: number | null; change: number | null; type?: string;
  value: number | null; perfEur: number | null;
  /** Renseignés quand la valorisation vient des transactions. */
  quantity?: number | null; avgCost?: number | null; invested?: number | null; pnlEur?: number | null;
};

/** Une ligne de `/positions` : ce que les transactions impliquent réellement. */
type Position = {
  ticker: string; quantity: number; avg_cost: number; invested: number;
  current_price: number | null; current_value: number | null;
  pnl_eur: number | null; pnl_pct: number | null; weight: number | null;
};
type PositionsData = {
  source: "transactions" | "weights";
  positions: Position[];
  total_value: number | null;
  total_invested: number | null;
  total_pnl_eur: number | null;
  total_pnl_pct: number | null;
};


// ── Helpers ────────────────────────────────────────────────────────────────────
function fmtChange(v: number | null) {
  if (v === null) return "—";
  return (v >= 0 ? "+" : "") + v.toFixed(2) + "%";
}

// ── Exposition ─────────────────────────────────────────────────────────────────
const CRYPTO_SET = new Set(["BTC","ETH","BNB","SOL","XRP","ADA","DOGE","AVAX","LINK","UNI","LTC","MATIC","DOT"]);
const ETF_RE     = /^(SPY|QQQ|IWM|VTI|VOO|GLD|TLT|HYG|EEM|VEA|IEFA|ARKK)/i;

function classifyExposition(assets: Enriched[]): Record<string, number> {
  const groups: Record<string, number> = {};
  for (const a of assets) {
    const t = a.ticker.replace(/-USD$/, "").replace(/\.[A-Z]+$/, "").toUpperCase();
    let cat = "Actions";
    if (CRYPTO_SET.has(t) || a.type === "CRYPTOCURRENCY" || a.ticker.endsWith("-USD")) cat = "Crypto";
    else if (ETF_RE.test(t)) cat = "ETF";
    groups[cat] = (groups[cat] ?? 0) + a.weight;
  }
  return groups;
}

const EXPO_COLORS: Record<string, string> = {
  Actions: "var(--nv-accent)", Crypto: CLAIR.attention, ETF: "#a78bfa", Cash: "#34d399",
};

// ── Sparkline ──────────────────────────────────────────────────────────────────
/* Les séries viennent du backend, qui les renvoie avec le prix — même appel,
   aucun coût réseau supplémentaire. Il y avait ici trois générateurs de fausses
   courbes : `seededRand`, `genSparkline` et `initPriceHistory` fabriquaient une
   marche aléatoire à graine fixe entre le cours d'ouverture et le prix courant.
   Le résultat était crédible, stable d'un rendu à l'autre, et faux : une page
   qui affiche des montants en euros ne peut pas dessiner des cours inventés
   juste à côté. */

function Sparkline({ pts, color, w = 48, h = 18, glow = false }: {
  pts: number[]; color: string; w?: number; h?: number; glow?: boolean;
}) {
  const n   = pts.length;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 0.01;
  const x   = (i: number) => (i / (n - 1)) * w;
  const y   = (v: number) => h - ((v - min) / rng) * (h - 2) - 1;
  const d   = pts.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const uid = `sp${color.replace(/\W/g, "")}-${w}-${h}`;
  return (
    <svg width={w} height={h} style={{ display: "block", flexShrink: 0, overflow: "visible" }}>
      <defs>
        <linearGradient id={uid} x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.22" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={`${d} L${w},${h} L0,${h} Z`} fill={`url(#${uid})`} />
      <path d={d} fill="none" stroke={color} strokeWidth={glow ? 1.5 : 1.1}
        strokeLinecap="round" strokeLinejoin="round"
        style={glow ? { filter: `drop-shadow(0 0 4px ${color}88)` } : {}} />
    </svg>
  );
}

// ── Surface card ───────────────────────────────────────────────────────────────
/**
 * Répartit le style d'un appelant entre les deux couches du cadre.
 *
 * Ce qui place la carte dans sa grille va sur le cadre ; ce qui habille son
 * contenu va sur la carte. Le tri est explicite plutôt que déduit : une clé
 * de mise en page appliquée à la couche intérieure la décrocherait de son
 * cadre, et une clé de contenu appliquée à l'extérieure repousserait la carte
 * au lieu du texte.
 */
function SectionLabel({ children }: { children: ReactNode }) {
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, letterSpacing: "0.12em",
      color: CLAIR.texteFaible, fontFamily: FONT,
      display: "block", marginBottom: 10,
    }}>
      {children}
    </span>
  );
}

// ── NOVAC Score circle gauge ───────────────────────────────────────────────────
//
// ⚠️ Les seuils viennent de `BANDES` dans `lib/analyse.ts`, alignés sur ceux du
// serveur. Ils étaient écrits en dur ici, et `scoreLabel` portait un vocabulaire
// que le reste de l'application ignore : « Excellent » au-dessus de 80, « À
// risque » en bas — deux mots restés de l'ancien score local remplacé. Le serveur
// dit « Très bon » et « Très faible ». Deux vocabulaires pour une même note, dont
// un affiché sur l'anneau du bandeau.
function scoreColor(s: number) {
  return s >= 70 ? CLAIR.positif : s >= 50 ? CLAIR.attention : CLAIR.negatif;
}
const scoreLabel = bandeDuScore;

/**
 * Deux teintes pour le dégradé de l'anneau, dérivées de la couleur du score.
 *
 * La couleur vient d'un jeton, donc d'un `var()` que rien ne sait décomposer :
 * il faut la résoudre pour en tirer une seconde nuance. Seule la clarté bouge
 * — la teinte porte le sens, un score vert doit rester vert d'un bout à
 * l'autre de l'arc.
 */
function degradeDuScore(score: number): [string, string] {
  // Mêmes seuils que `scoreColor` et que les bandes du serveur : 70 et 50.
  const jeton = score >= 70 ? "--nv-positif" : score >= 50 ? "--nv-attention" : "--nv-negatif";
  // Le secours doit rester un hexadécimal littéral : c'est la valeur employée
  // quand la feuille de style n'est pas encore lue, et la ligne suivante la
  // décompose en TSL. Y mettre `JETONS.negatif` glisserait un `var()` que le
  // test de format rejette, et l'anneau perdrait son dégradé.
  const secours = score >= 70 ? "#00D492" : score >= 50 ? "#FF8904" : "#FF6467";
  const hex = resoudreJeton(jeton, secours);
  if (!/^#[0-9a-f]{6}$/i.test(hex)) return [hex, hex];
  const [h, sat, l] = rvbVersTsl(hexVersRvb(hex));
  return [
    rvbVersHex(tslVersRvb([h, sat, Math.min(0.78, l + 0.12)])),
    rvbVersHex(tslVersRvb([h, sat, Math.max(0.30, l - 0.10)])),
  ];
}

function CircleScore({ score, size = 88, nu = false }: { score: number; size?: number; nu?: boolean }) {
  const color = scoreColor(score);
  const atteint = Math.max(0, Math.min(100, score));
  const idDegrade = useId();
  const [clair, sombre] = degradeDuScore(score);

  // Un tracé et non des secteurs pleins.
  //
  // Les secteurs donnaient des extrémités coupées net ; un trait accepte
  // `stroke-linecap: round`, qui arrondit les deux bouts de l'arc. C'est ce
  // détail, avec le dégradé, qui fait la différence d'aspect — la géométrie
  // est la même.
  const epaisseur = Math.max(8, size * 0.16);
  const rayon = (size - epaisseur) / 2;
  const perimetre = 2 * Math.PI * rayon;
  // Les bouts arrondis débordent de la longueur du trait, d'une demi-épaisseur
  // de chaque côté. Sans cette retenue, un score de 100 se recouvre lui-même et
  // un score de 0 laisse une pastille là où il ne devrait rien y avoir.
  const rempli = atteint === 0 ? 0 : Math.max(epaisseur, (atteint / 100) * perimetre - epaisseur);

  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
      <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
        <svg width={size} height={size} style={{ display: "block", transform: "rotate(-90deg)" }}>
          <defs>
            <linearGradient id={idDegrade} x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor={clair} />
              <stop offset="100%" stopColor={sombre} />
            </linearGradient>
          </defs>
          <circle cx={size / 2} cy={size / 2} r={rayon} fill="none"
            stroke={CLAIR.bordFort} strokeWidth={epaisseur} />
          {atteint > 0 && (
            <circle cx={size / 2} cy={size / 2} r={rayon} fill="none"
              stroke={`url(#${idDegrade})`} strokeWidth={epaisseur} strokeLinecap="round"
              strokeDasharray={`${rempli} ${perimetre}`}
              style={{ transition: "stroke-dasharray 700ms cubic-bezier(0.4, 0, 0.2, 1)" }} />
          )}
        </svg>
        {!nu && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}>
            <span style={{ fontSize: size * 0.30, fontWeight: 800, fontFamily: FONT, color: CLAIR.texte, lineHeight: 1 }}>{score}</span>
            <span style={{ fontSize: Math.max(8, size * 0.10), color: CLAIR.texteFaible, letterSpacing: "0.04em" }}>/100</span>
          </div>
        )}
      </div>
      {!nu && <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.02em" }}>{scoreLabel(score)}</span>}
    </div>
  );
}

// ── Radar chart SVG ────────────────────────────────────────────────────────────
// ── Main page ──────────────────────────────────────────────────────────────────
// Les périodes viennent du module partagé : la page et le graphique doivent
// parler des mêmes fenêtres, et les libellés sont ceux de la page graphique.
const PERIODS: Period[] = ["24h", "1S", "1M", "3M", "6M", "1A", "3A", "Max"];

/** Retrait latéral commun à la bande, aux onglets et au contenu. */
const MARGE = 10;
const PERIOD_MAP: Record<Period, string> = {
  "24h": "1d", "1S": "7d", "1M": "1mo", "3M": "3mo",
  "6M": "6mo", "1A": "1y", "3A": "3y", "Max": "max",
};
const PERIOD_LABEL: Record<Period, string> = {
  "24h": "24h", "1S": "1 semaine", "1M": "1 mois", "3M": "3 mois",
  "6M": "6 mois", "1A": "1 an", "3A": "3 ans", "Max": "tout l'historique",
};

function PortfolioPageInner() {
  const { activePortfolio, setActivePortfolio, setMode } = useApp();
  const searchParams = useSearchParams();
  const router       = useRouter();

  const [portfolio,     setPortfolio]     = useState<PortfolioData | null>(null);
  const [prices,        setPrices]        = useState<Record<string, PriceData>>({});
  const [loading,       setLoading]       = useState(true);
  const [view,          setView]          = useState<"carte" | "liste">("carte");
  const [period,        setPeriod]        = useState<Period>("Max")   // Vue d'ensemble en arrivant : une journée ne dit rien d'un portefeuille;
  const [mounted,       setMounted]       = useState(false);
  const [sparkHistory,    setSparkHistory]    = useState<Record<string, number[]>>({});
  const [priceUpdatedAt,  setPriceUpdatedAt]  = useState<Record<string, number>>({});
  const [editingValue,    setEditingValue]    = useState(false);
  const [valueInput,      setValueInput]      = useState("");
  const [editingCost,     setEditingCost]     = useState(false);
  const [costInput,       setCostInput]       = useState("");
  const [spyChange,       setSpyChange]       = useState<number | null>(null);
  const [dashView,        setDashView]        = useState<"resume"|"analyse"|"evenements"|"objectifs"|"transactions">("resume");
  const [activeTooltip,   setActiveTooltip]   = useState<string | null>(null);
  const [showTxModal,     setShowTxModal]     = useState(false);
  const [txRefreshKey,    setTxRefreshKey]    = useState(0);
  const [positions,       setPositions]       = useState<PositionsData | null>(null);
  const [prenom,          setPrenom]          = useState<string | null>(null);
  const [masque,          setMasque]          = useState(false);

  // Lu après montage : le lire pendant le rendu ferait diverger serveur et client.
  useEffect(() => {
    try {
      const brut = localStorage.getItem("novac_user");
      if (!brut) return;
      const u = JSON.parse(brut);
      const nom = (u?.username || u?.email || "").trim();
      if (nom) setPrenom(nom.split(/[\s@]/)[0]);
    } catch { /* stockage refusé ou contenu illisible */ }
  }, []);

  useEffect(() => { const t = setTimeout(() => setMounted(true), 60); return () => clearTimeout(t); }, []);

  useEffect(() => {
    const idFromUrl = searchParams.get("id");
    fetch(`${API_URL}/api/v1/portfolios`, { headers: enTetesAuth() })
      .then(r => r.json())
      .then((list: PortfolioData[]) => {
        if (!Array.isArray(list) || !list.length) { setLoading(false); return; }
        const target = idFromUrl
          ? list.find(p => p.id === idFromUrl)
          : activePortfolio
            ? list.find(p => p.id === String(activePortfolio.id))
            : list[0];
        const p = target ?? list[0];
        setPortfolio(p);
        // Le contexte type l'identifiant en number, l'API le renvoie en UUID.
        // La désactivation ESLint qui était ici visait une règle absente de la
        // configuration, ce qui faisait échouer le lint du fichier au lieu de
        // taire quoi que ce soit.
        setActivePortfolio({ id: p.id as unknown as number, name: p.name, assets: p.assets, color: p.color });
        setMode("portfolio");
      })
      .catch(() => setLoading(false));
  }, [searchParams]); // eslint-disable-line

  // Réagit aux changements de portefeuille depuis le GlobalHeader.
  //
  // Le contexte ne transporte que { id, name, assets, color }. S'en contenter,
  // comme on le faisait, perdait `total_value` et `cost_basis` : changer de
  // portefeuille par le menu affichait « Valeur — » sur chaque carte, « Non
  // défini » en tête, et retirait au graphique son échelle en euros — jusqu'au
  // prochain rechargement complet de la page, seul endroit qui les relisait.
  // On repasse donc par l'API, en gardant l'objet partiel comme affichage
  // provisoire pour que la page ne se vide pas pendant l'aller-retour.
  useEffect(() => {
    if (!activePortfolio) return;
    const id = String(activePortfolio.id);
    setPortfolio(prev => prev?.id === id ? prev : {
      id,
      name:   activePortfolio.name,
      assets: (activePortfolio.assets || []) as PortfolioAsset[],
      color:  activePortfolio.color || "var(--nv-accent)",
    });

    let cancelled = false;
    fetch(`${API_URL}/api/v1/portfolios`, { headers: enTetesAuth() })
      .then(r => r.json())
      .then((list: PortfolioData[]) => {
        if (cancelled || !Array.isArray(list)) return;
        const complet = list.find(p => String(p.id) === id);
        if (complet) setPortfolio(complet);
      })
      .catch(() => { /* l'objet partiel reste affiché */ });
    return () => { cancelled = true; };
  }, [activePortfolio?.id]); // eslint-disable-line

  // Positions réelles, déduites des transactions.
  //
  // C'est la valorisation juste : quantité détenue × cours du jour, et un prix
  // de revient issu des écritures. Le calcul par les poids qui suit ne vaut
  // qu'à défaut — il suppose une valeur totale saisie à la main et des poids
  // qui n'ont pas dérivé depuis, deux hypothèses fausses dès le premier
  // mouvement de marché.
  //
  // Relancé à chaque écriture ajoutée : `txRefreshKey` est déjà le signal
  // qu'utilise « Activité récente ».
  useEffect(() => {
    const id = portfolio?.id;
    if (!id) { setPositions(null); return; }
    const auth = enTetesAuth();
    if (!auth.Authorization) { setPositions(null); return; }   // hors session : repli sur les poids

    let cancelled = false;
    const relire = () =>
      fetch(`${API_URL}/api/v1/portfolios/${id}/positions`, { headers: auth })
        .then(r => (r.ok ? r.json() : null))
        .then((d: PositionsData | null) => { if (!cancelled) setPositions(d); })
        .catch(() => { if (!cancelled) setPositions(null); });

    relire();
    // Même cadence que les cours, et pour la même raison : la valeur totale est
    // une valorisation aux cours du moment. Sans ce tour, elle restait celle du
    // chargement de la page — les cartes d'actifs avançaient pendant que le
    // grand chiffre au-dessus d'elles ne bougeait plus, et le clignotement
    // ajouté pour le signaler n'avait jamais rien à signaler.
    const battement = setInterval(relire, CADENCE_COURS_MS);
    return () => { cancelled = true; clearInterval(battement); };
  }, [portfolio?.id, txRefreshKey]);

  /** Vrai quand la page valorise sur les écritures plutôt que sur les poids. */
  const surTransactions =
    positions?.source === "transactions" && positions.positions.length > 0;

  /**
   * Rendement du portefeuille sur la période, en TWR.
   *
   * `weightedChange` est la moyenne pondérée des variations d'actifs : sur la
   * fenêtre Max, il rend la performance des fonds depuis leur création, et non
   * celle de l'épargnant. Un PEA ouvert en février affichait ainsi « +417 %
   * sur tout l'historique » à côté d'un « Total +175 € » exact.
   */
  const [twr, setTwr] = useState<number | null>(null);
  /** Rendement du S&P 500 sur exactement la même fenêtre. */
  const [repere, setRepere] = useState<number | null>(null);
  /** Ce que l'argent versé a rapporté sur la période : gain en euros et en %. */
  const [gain, setGain] = useState<{ eur: number; pct: number | null } | null>(null);
  /**
   * Les écritures jalonnées sur la courbe, comme dans l'onglet Transactions.
   *
   * La même courbe sur deux onglets voisins doit porter les mêmes repères :
   * sans eux, on ne distingue pas une hausse due au marché d'une hausse due à
   * un versement.
   */
  const [reperesOperations, setReperesOperations] = useState<
    {
      id: number; ticker: string; executed_at: string; type: string;
      couleur: string; libelle: string;
      quantity: number; unit_price: number; fees: number;
    }[]
  >([]);
  /**
   * L'analyse des publications, obtenue **une fois** ici puis distribuée.
   *
   * ⚠️ Les deux panneaux qui s'en servent l'appelaient chacun de leur côté : la
   * route la plus coûteuse de l'écran partait donc deux fois — celle qui va
   * chercher, par titre, les publications passées *et* l'historique des cours qui
   * les entoure. C'est le défaut que j'avais écarté pour le calendrier et laissé
   * s'installer ici.
   */
  const analyseEvts = useAnalyseEvenements(portfolio?.id);

  /**
   * Les échéances du portefeuille, obtenues une fois par la liste et relues par le
   * calendrier et les deux tableaux. Deux appels de la même route auraient pu se
   * contredire d'une échéance selon l'instant.
   */
  const [evtsReponse, setEvtsReponse] = useState<{
    evenements: {
      nature: "resultats" | "dividende" | "economique";
      date: string; libelle: string; ticker: string | null;
      moment: string | null; jours: number | null;
      montant: number | null; devise: string | null;
      rendement: number | null; eps_estime: number | null;
    }[];
    sans_donnees: string[];
    peremption_macro: string | null;
  } | null>(null);
  /**
   * Les échéances vues **par transparence** : les publications des sociétés que
   * portent les fonds du portefeuille.
   *
   * ⚠️ Sans elles, un portefeuille d'ETF n'a aucun événement propre — un ETF ne
   * publie pas de résultats, et un ETF capitalisant ne détache jamais de dividende.
   * Chargées à part parce que la route coûte cher : la liste s'affiche d'abord, ces
   * lignes s'y ajoutent.
   */
  const transparence = useTransparence(portfolio?.id);

  /**
   * Le jour retenu dans le calendrier, ou `null` pour la liste entière.
   *
   * Vit ici parce que deux panneaux le partagent : le calendrier le montre, la
   * liste le respecte. Le confiner à l'un des deux aurait obligé l'autre à le
   * connaître par un chemin détourné.
   */
  const [jourChoisi, setJourChoisi] = useState<string | null>(null);

  const echeances = useMemo(
    () => [...(evtsReponse?.evenements ?? []), ...(transparence.donnees?.evenements ?? [])]
      .sort((a, b) => a.date.localeCompare(b.date)),
    [evtsReponse, transparence.donnees]);

  /**
   * Le titre retenu dans une liste d'échéances, dont l'impact est détaillé à droite.
   *
   * ⚠️ Son impact est demandé au serveur ligne par ligne, et non pris dans
   * `analyseEvts` : cette analyse ne couvre que les lignes détenues en direct.
   * Cliquer NVIDIA vue par transparence dans un PEA d'ETF n'y trouverait rien, alors
   * que le portefeuille y est bel et bien exposé.
   *
   * Remis à zéro au changement de portefeuille, sinon un titre du précédent resterait
   * détaillé sur un portefeuille qui ne le détient pas.
   */
  const [tickerChoisi, setTickerChoisi] = useState<string | null>(null);
  const impactTitre = useImpactTitre(portfolio?.id, tickerChoisi);

  useEffect(() => { setTickerChoisi(null); }, [portfolio?.id]);

  /**
   * Les objectifs d'épargne du portefeuille, et la saisie en cours.
   *
   * ⚠️ Remplacent trois objectifs écrits dans le code — « Retraite 2035 », « Achat
   * immobilier », « Indépendance financière » — dont les cibles étaient choisies au
   * hasard et le montant courant obtenu en multipliant la valeur du portefeuille par
   * 0,42 et 0,28. Rien n'appartenait à personne.
   */
  const objectifs = useObjectifs(portfolio?.id);
  const [saisieObjectif, setSaisieObjectif] =
    useState<{ mode: "creation" } | { mode: "edition"; o: Objectif } | null>(null);

  /**
   * L'objectif dont la projection est affichée.
   *
   * ⚠️ Retenu ici et non dans le panneau : le premier objectif fait office de défaut, et
   * il n'existe qu'une fois la liste chargée. Un état interne au panneau serait resté
   * vide au premier rendu, donc sans projection jusqu'à ce qu'on touche au menu.
   */
  const [objectifProjete, setObjectifProjete] = useState<string | null>(null);
  const listeObjectifs = objectifs.donnees?.objectifs ?? [];
  const projeteEffectif = objectifProjete
    && listeObjectifs.some(o => o.id === objectifProjete)
      ? objectifProjete
      : (listeObjectifs[0]?.id ?? null);
  const projection = useProjection(portfolio?.id, projeteEffectif);

  /** Écriture désignée en cliquant un repère du graphique. */
  const [operationVisee, setOperationVisee] = useState<number | null>(null);

  useEffect(() => {
    const id = portfolio?.id;
    if (!id || !surTransactions) { setReperesOperations([]); return; }
    let annule = false;
    fetch(`${API_URL}/api/v1/portfolios/${id}/transactions`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        const liste: Tx[] = Array.isArray(d) ? d : (d?.transactions ?? []);
        const types = typesParOperation(liste);
        setReperesOperations(liste.map(t => ({
          id: t.id, ticker: t.ticker, executed_at: t.executed_at,
          type: types[t.id], couleur: COULEUR_OP[types[t.id]], libelle: LIBELLE_OP[types[t.id]],
          // Quantité, prix et frais : lus par l'encart de survol du graphique,
          // qui détaille l'écriture sous le curseur. Sans eux il ne pourrait
          // annoncer qu'un libellé et une date.
          quantity: t.quantity, unit_price: t.unit_price, fees: t.fees ?? 0,
        })));
      })
      .catch(() => { if (!annule) setReperesOperations([]); });
    return () => { annule = true; };
  }, [portfolio?.id, surTransactions, txRefreshKey]);

  /** Les mêmes versements rejoués sur le S&P 500, aux mêmes dates. */
  const [simRepere, setSimRepere] = useState<{ value: number; gain_eur: number; gain_pct: number } | null>(null);
  /** Date de la première transaction — l'origine du portefeuille. */
  const [origine, setOrigine] = useState<string | null>(null);

  useEffect(() => {
    const id = portfolio?.id;
    if (!id || !surTransactions) { setTwr(null); return; }
    let annule = false;
    fetch(`${API_URL}/api/v1/portfolios/${id}/history?period=${PERIOD_MAP[period]}`,
          { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d: {
        twr_pct?: number | null; benchmark_pct?: number | null; start?: string | null;
        gain_eur?: number | null; gain_pct?: number | null;
        benchmark_sim?: { value: number | null; gain_eur: number | null; gain_pct: number | null };
      } | null) => {
        if (annule) return;
        setTwr(typeof d?.twr_pct === "number" ? d.twr_pct : null);
        setRepere(typeof d?.benchmark_pct === "number" ? d.benchmark_pct : null);
        setOrigine(d?.start ?? null);
        setGain(typeof d?.gain_eur === "number"
          ? { eur: d.gain_eur, pct: typeof d.gain_pct === "number" ? d.gain_pct : null }
          : null);
        const sim = d?.benchmark_sim;
        setSimRepere(sim && typeof sim.value === "number" && typeof sim.gain_eur === "number"
          && typeof sim.gain_pct === "number"
          ? { value: sim.value, gain_eur: sim.gain_eur, gain_pct: sim.gain_pct }
          : null);
      })
      .catch(() => { if (!annule) { setTwr(null); setRepere(null); setGain(null); setSimRepere(null); } });
    return () => { annule = true; };
  }, [portfolio?.id, surTransactions, period, txRefreshKey]);

  /**
   * Les lignes crypto détenues, suivies en direct plutôt qu'au sondage.
   *
   * Tirées des positions et non de l'allocation cible : c'est la quantité
   * réellement détenue qui sert à revaloriser, et une ligne visée mais non
   * achetée n'a rien à revaloriser.
   */
  const tickersCrypto = useMemo(
    () => (positions?.positions ?? []).map(p => p.ticker).filter(t => symboleBinance(t)),
    [positions]);
  const prixCrypto = useCoursCrypto(tickersCrypto);

  /**
   * Ce que le direct ajoute au total calculé par le serveur.
   *
   * On corrige au lieu de recalculer : le total sert aussi de repli hors
   * transactions, et le refaire ligne à ligne ferait diverger les deux
   * chemins au premier arrondi.
   */
  const ecartCrypto = useMemo(() => {
    if (!surTransactions) return 0;
    return positions!.positions.reduce((s, p) => {
      const vif = prixCrypto[p.ticker];
      return vif != null && p.current_price != null && p.quantity != null
        ? s + p.quantity * (vif - p.current_price)
        : s;
    }, 0);
  }, [surTransactions, positions, prixCrypto]);

  const valeurTotaleBrute = surTransactions ? positions!.total_value : (portfolio?.total_value ?? null);
  const valeurTotale = valeurTotaleBrute != null ? valeurTotaleBrute + ecartCrypto : null;
  /** Sens de la dernière variation de la valeur totale, pour le clignotement. */
  const clignoteValeur = useClignotement(valeurTotale);
  const prixDeRevient = surTransactions ? positions!.total_invested : (portfolio?.cost_basis  ?? null);

  const isFirstLoad = useRef(true);

  // Union allocation ∪ positions : un actif détenu hors allocation cible doit
  // avoir un cours, sans quoi il s'affiche sans prix ni variation.
  const tickersSuivis = useMemo(() => {
    const set = new Set<string>((portfolio?.assets ?? []).map(a => a.ticker));
    if (surTransactions) positions!.positions.forEach(p => set.add(p.ticker));
    return Array.from(set);
  }, [portfolio, surTransactions, positions]);

  /**
   * La date du premier achat de chaque ligne, alignée sur `tickersSuivis`.
   *
   * Elle borne les courbes des cartes. Sans elle, la fenêtre « Max » rendait
   * l'historique du fonds depuis sa création : un ETF né en 2016 dessinait une
   * multiplication par six sous une carte annonçant +6 %, la courbe parlant du
   * fonds et le chiffre de la position.
   *
   * Par ligne et non par portefeuille : un actif acheté en mai ne doit pas
   * montrer une courbe qui commence en février. Une ligne sans date connue
   * laisse un champ vide, que le serveur traite comme « pas de borne ».
   */
  const depuisParTicker = useMemo(() => {
    const premier: Record<string, string> = {};
    for (const op of reperesOperations) {
      const jour = op.executed_at.slice(0, 10);
      if (!premier[op.ticker] || jour < premier[op.ticker]) premier[op.ticker] = jour;
    }
    return tickersSuivis.map(t => premier[t] ?? "").join(",");
  }, [reperesOperations, tickersSuivis]);

  useEffect(() => {
    if (!tickersSuivis.length) return;
    const tickers = tickersSuivis.join(",");
    if (isFirstLoad.current) {
      setLoading(true);
      setSparkHistory({});
    }

    const fetchPrices = () =>
      fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(tickers)}&period=${PERIOD_MAP[period]}`)
        .then(r => r.json())
        .then((list: PriceData[]) => {
          const map: Record<string, PriceData> = {};
          list.forEach(p => { if (p.symbol) map[p.symbol] = p; });
          // Mis à jour à chaque tour, pas seulement au premier. La condition
          // `isInit` gelait prix et variation au chargement pendant que la
          // sparkline, elle, continuait d'avancer : la courbe montait à côté
          // d'un montant qui ne bougeait plus.
          setPrices(map);

          // Ce tour n'apporte que le prix courant : la série de fond vient de
          // l'appel voisin, et ne dépend pas de la période. On lui ajoute le
          // dernier prix, qui bouge plus vite que le pas historique.
          const newUpdatedAt: Record<string, number> = {};
          setSparkHistory(prev => {
            const next = { ...prev };
            list.forEach(p => {
              if (p.price == null) return;
              const serie = next[p.symbol];
              if (!serie) {
                next[p.symbol] = [p.price];
                newUpdatedAt[p.symbol] = Date.now();
                return;
              }
              if (Math.abs(p.price - serie[serie.length - 1]) > 0.0001) {
                next[p.symbol] = [...serie, p.price].slice(-60);
                newUpdatedAt[p.symbol] = Date.now(); // prix réellement changé
              }
            });
            return next;
          });
          if (Object.keys(newUpdatedAt).length)
            setPriceUpdatedAt(prev => ({ ...prev, ...newUpdatedAt }));
        })
        .catch(() => {});

    fetchPrices().finally(() => { setLoading(false); isFirstLoad.current = false; });

    const interval = setInterval(() => fetchPrices(), CADENCE_COURS_MS);
    return () => clearInterval(interval);
  }, [tickersSuivis, period]);

  /**
   * La série de fond des courbes de carte : depuis le premier achat, toujours.
   *
   * Elle ne suit pas la période, contrairement au graphique du haut. Une carte
   * porte un gain calculé sur le prix de revient, donc figé sur toute la
   * détention ; une courbe qui, elle, se recadrait sur 24 h faisait raconter
   * deux histoires différentes au même rectangle — le tracé montrait la
   * journée, le chiffre à côté montrait six mois.
   *
   * D'où un appel distinct de celui des prix, et bien plus rare : cette série
   * ne bouge qu'au changement de portefeuille ou d'achat, quand les prix sont
   * relus tous les quarts de minute.
   */
  useEffect(() => {
    if (!tickersSuivis.length) return;
    let annule = false;
    const tickers = tickersSuivis.join(",");
    fetch(`${API_URL}/api/v1/prices?tickers=${encodeURIComponent(tickers)}`
        + `&period=max&depuis=${encodeURIComponent(depuisParTicker)}`)
      .then(r => r.json())
      .then((list: PriceData[]) => {
        if (annule) return;
        setSparkHistory(prev => {
          const next = { ...prev };
          list.forEach(p => { if (p.series?.length) next[p.symbol] = p.series; });
          return next;
        });
      })
      .catch(() => {});
    return () => { annule = true; };
  }, [tickersSuivis, depuisParTicker]);

  // Benchmark SPY — fetch séparé, silencieux en cas d'échec
  useEffect(() => {
    fetch(`${API_URL}/api/v1/prices?tickers=SPY&period=${PERIOD_MAP[period]}`)
      .then(r => r.json())
      .then((list: PriceData[]) => {
        const spy = list.find(p => p.symbol === "SPY");
        setSpyChange(spy?.change ?? null);
      })
      .catch(() => setSpyChange(null));
  }, [period]);

  const enriched: Enriched[] = useMemo(() => {
    if (!portfolio) return [];

    // Sur transactions, la liste des lignes vient des positions, pas de
    // l'allocation cible : un actif entièrement vendu n'est plus détenu, et un
    // actif acheté hors allocation l'est bel et bien. Partir des poids
    // afficherait le portefeuille voulu au lieu du portefeuille réel.
    if (surTransactions) {
      const base = valoriser(positions!.positions, prices);
      return base.map((a, i) => {
        const p = positions!.positions[i];
        // Le cours poussé prime sur le prix sondé, et entraîne avec lui la
        // valeur de la ligne et son gain. S'en tenir au prix ferait bouger le
        // seul chiffre du haut de la carte pendant que la valeur et le gain
        // en dessous resteraient sur le dernier sondage.
        const vif = prixCrypto[a.ticker];
        const suit = vif != null && p.quantity != null;
        const value = suit ? p.quantity! * vif : a.value;
        return {
          ...a,
          price:    vif ?? a.price,
          value,
          quantity: p.quantity,
          avgCost:  p.avg_cost,
          invested: p.invested,
          pnlEur:   suit && p.invested != null && value != null ? value - p.invested : p.pnl_eur,
        };
      });
    }

    return portfolio.assets.map(a => {
      const price  = prices[a.ticker]?.price  ?? null;
      const change = prices[a.ticker]?.change ?? null;
      const tv     = portfolio.total_value ?? null;
      const value  = tv != null ? (a.weight / 100) * tv : null;
      // Gain sur la période, à partir de la valeur d'*aujourd'hui*.
      //
      // `valeur × variation` était faux : il suppose que la valeur actuelle
      // était déjà celle du début de période. Le bon calcul est
      // V − V/(1+r), c'est-à-dire ce que la ligne vaut aujourd'hui moins ce
      // qu'elle valait alors. L'écart passait inaperçu sur 24 h ; sur la
      // fenêtre Max il annonçait des millions d'euros de plus-value sur un
      // portefeuille de cinq mille.
      const perfEur = value != null && change != null && change > -100
        ? value - value / (1 + change / 100)
        : null;
      return { ...a, price, change, value, perfEur };
    });
  }, [portfolio, prices, surTransactions, positions, prixCrypto]);

  const totalWeight    = enriched.reduce((s, a) => s + a.weight, 0);

  /**
   * Le point de la courbe sous le curseur, remonté par le graphique.
   *
   * Il remplace le total et le gain de la bande de tête le temps du survol. Le
   * total est le chiffre auquel on se fie pour « combien j'ai maintenant » : le
   * rendre transitoire n'est acceptable qu'accompagné de sa date, affichée juste
   * en dessous. Sans elle, on ne saurait pas si le nombre lu est celui de
   * l'instant ou celui d'un mardi de juin.
   */
  const [survolCourbe, setSurvolCourbe] =
    useState<{ valeur: number; date: string; investi?: number } | null>(null);

  /** L'enveloppe déduite du contenu. Voir `enveloppe`, et sa mise en garde. */
  const enveloppePortefeuille = useMemo(
    () => enveloppe(enriched.map(a => a.ticker), assetExchange),
    [enriched]);

  const weightedChange = enriched.reduce((s, a) => {
    if (a.change === null) return s;
    return s + (a.weight / totalWeight) * a.change;
  }, 0);
  /**
   * Le rendement à afficher : celui du portefeuille quand on le connaît, la
   * moyenne pondérée des actifs à défaut.
   */
  const perfPeriode = surTransactions ? twr : weightedChange;
  const isUp       = (perfPeriode ?? 0) >= 0;
  const perfColor  = isUp ? CLAIR.positif : CLAIR.negatif;

  /**
   * Repère de comparaison, mesuré sur la même fenêtre que le portefeuille.
   *
   * Il était relevé à part, sur la période nominale : « Max » donnait au S&P
   * 500 ses trente ans d'historique face à six mois de détention, d'où un
   * « vs S&P 500 −2 500 % » qui ne comparait rien.
   */
  const reperePeriode = surTransactions ? repere : spyChange;

  /**
   * Gain de l'épargnant sur la période — ce qu'il a réellement encaissé.
   *
   * Hors transactions, on n'a que la variation moyenne des actifs ; on en
   * déduit le gain comme avant, en retranchant la valeur de début de période.
   */
  const gainAffiche: { eur: number; pct: number | null } | null =
    surTransactions
      ? gain
      : (valeurTotale != null && weightedChange != null
          ? {
              eur: weightedChange > -100
                ? valeurTotale - valeurTotale / (1 + weightedChange / 100)
                : valeurTotale,
              pct: weightedChange,
            }
          : null);

  /**
   * Libellé de la période.
   *
   * « Sur tout l'historique » laissait entendre une profondeur que le
   * portefeuille n'a pas : sur Max, la fenêtre commence à la première
   * transaction. Autant la nommer.
   */
  const libellePeriode = period === "24h"
    ? "Aujourd'hui"
    : period === "Max" && origine
      ? `Depuis le ${new Date(origine).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })}`
      : `Sur ${PERIOD_LABEL[period]}`;

  const topPerformers    = [...enriched].filter(a => a.change !== null)
    .sort((a, b) => (b.change ?? 0) - (a.change ?? 0)).slice(0, 5);
  const bottomPerformers = [...enriched].filter(a => a.change !== null)
    .sort((a, b) => (a.change ?? 0) - (b.change ?? 0)).slice(0, 5);

  const exposition = useMemo(() => classifyExposition(enriched), [enriched]);
  /**
   * L'analyse du portefeuille : la **seule** source du score de santé.
   *
   * ⚠️ Chargée ici et non dans l'onglet Analyse, qui la lisait pour lui seul.
   * Le bandeau tire désormais sa note du même appel, ce qui garantit qu'un
   * portefeuille n'a qu'un score — et évite deux requêtes vers une route qui
   * télécharge un an d'historique et les fiches sectorielles.
   *
   * L'appel remplace celui qui relevait les variations à trois mois : il n'avait
   * d'autre usage que d'alimenter l'ancien score local, disparu avec lui.
   */
  const [analyse, setAnalyse] = useState<Analyse | null>(null);
  const [etatAnalyse, setEtatAnalyse] = useState<EtatAnalyse>("charge");

  useEffect(() => {
    const id = portfolio?.id;
    if (!id) { setAnalyse(null); setEtatAnalyse("vide"); return; }
    let annule = false;
    // ⚠️ On ne remet pas l'état à « charge » : la route met plusieurs secondes,
    // et vider la note à chaque rafraîchissement des écritures l'aurait fait
    // clignoter. Elle reste affichée jusqu'à son remplacement.
    fetch(`${API_URL}/api/v1/portfolios/${id}/analysis`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d: Analyse | null) => {
        if (annule) return;
        setAnalyse(d);
        setEtatAnalyse(d && d.score != null ? "prêt" : "vide");
      })
      .catch(() => { if (!annule) { setAnalyse(null); setEtatAnalyse("vide"); } });
    return () => { annule = true; };
  }, [portfolio?.id, txRefreshKey]);

  const scoreSante = analyse?.score ?? null;
  const bandeSante = analyse?.bande ?? null;

  /**
   * Où poser l'infobulle d'un facteur, en coordonnées de fenêtre.
   *
   * ⚠️ En portail et en position fixe, comme les autres panneaux de cette page, et
   * non en `position: absolute` dans la ligne survolée. Cette dernière forme ne
   * peignait ni fond, ni liseré, ni rembourrage : mesuré, les propriétés de
   * peinture disparaissaient dès que `position: absolute` et
   * `pointer-events: none` coexistaient sur un élément hors flux placé au-dessus
   * de son conteneur. Le texte de l'infobulle se mêlait alors à celui des lignes
   * voisines, illisible.
   *
   * La position fixe règle aussi deux choses au passage : la carte ne peut plus la
   * rogner, et l'infobulle du dernier facteur ne sort plus du cadre.
   */

  const [profilOuvert, setProfilOuvert] = useState(false);
  const [ancreProfil, setAncreProfil] = useState<{ droite: number; haut: number } | null>(null);
  const [fraisOuvert, setFraisOuvert] = useState(false);
  const [ancreFrais, setAncreFrais] = useState<{ droite: number; haut: number } | null>(null);

  /**
   * Enregistre le profil, puis relit l'analyse.
   *
   * ⚠️ La relecture est nécessaire, pas cosmétique : la cible de volatilité est
   * calculée côté serveur, donc ce facteur passe de « mesuré » à « noté » et la
   * note globale change. Sans elle, l'écran garderait l'ancienne note tout en
   * affichant le nouveau profil.
   */
  const enregistrerProfil = async (horizon: number, tolerance: Tolerance) => {
    const id = portfolio?.id;
    if (!id) return;
    try {
      await fetch(`${API_URL}/api/v1/portfolios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...enTetesAuth() },
        body: JSON.stringify({ horizon_annees: horizon, tolerance }),
      });
    } catch { /* réseau indisponible : le profil vaut pour la prochaine fois */ }
    setTxRefreshKey(k => k + 1);
  };

  /**
   * Enregistre les frais courants saisis, puis relit l'analyse.
   *
   * ⚠️ Le seul moyen de mesurer ce facteur pour un portefeuille européen : le
   * fournisseur de cours ne publie pas le TER des ETF domiciliés en Europe. Sur un
   * vrai PEA, un seul des trois fonds l'annonçait — 10 % du portefeuille, sous le
   * seuil de couverture, donc aucune note.
   *
   * La relecture est nécessaire comme pour le profil : la moyenne pondérée et le
   * contrôle de couverture se font côté serveur.
   */
  const enregistrerFrais = async (frais: Record<string, number>) => {
    const id = portfolio?.id;
    if (!id) return;
    try {
      await fetch(`${API_URL}/api/v1/portfolios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...enTetesAuth() },
        body: JSON.stringify({ frais_lignes: frais }),
      });
    } catch { /* réseau indisponible : la saisie vaut pour la prochaine fois */ }
    setTxRefreshKey(k => k + 1);
  };

  const top3Conc   = [...enriched].sort((a, b) => b.weight - a.weight)
    .slice(0, 3).reduce((s, a) => s + a.weight, 0);
  const gainCount  = enriched.filter(a => (a.change ?? 0) > 0).length;
  const lossCount  = enriched.filter(a => (a.change ?? 0) < 0).length;

  // Repli le temps que la série arrive : un segment plat entre les deux seules
  // valeurs connues, plutôt qu'une courbe inventée qui aurait l'air d'un cours.
  const assetSparks = useMemo(() => {
    const map: Record<string, number[]> = {};
    enriched.forEach(a => {
      if (a.price == null) return;
      const start = a.change != null ? a.price / (1 + a.change / 100) : a.price;
      map[a.ticker] = [start, a.price];
    });
    return map;
  }, [enriched]);

  const saveTotalValue = async () => {
    if (!portfolio) return;
    const v = parseFloat(valueInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingValue(false); return; }
    await fetch(`${API_URL}/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ total_value: v }),
    }).catch(() => {});
    setPortfolio(p => p ? { ...p, total_value: v } : p);
    setEditingValue(false);
  };

  const saveCostBasis = async () => {
    if (!portfolio) return;
    const v = parseFloat(costInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingCost(false); return; }
    await fetch(`${API_URL}/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ cost_basis: v }),
    }).catch(() => {});
    setPortfolio(p => p ? { ...p, cost_basis: v } : p);
    setEditingCost(false);
  };

  const anim = (delay: number): React.CSSProperties => ({
    opacity:    mounted ? 1 : 0,
    transform:  mounted ? "translateY(0)" : "translateY(8px)",
    transition: `opacity 440ms ease ${delay}ms, transform 440ms ease ${delay}ms`,
  });

  if (!portfolio && !loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "transparent", color: CLAIR.surFondAttenue,
        fontSize: 14, flexDirection: "column", gap: 16 }}>
        <div>Aucun portefeuille sélectionné.</div>
        <button onClick={() => router.push("/build")}
          style={{ padding: "8px 20px", borderRadius: RAYONS.sm,
            border: `1px solid ${JETONS.accentBord}`,
            background: CLAIR.accentDoux, color: CLAIR.accent,
            cursor: "pointer", fontSize: 12 }}>
          Créer un portefeuille
        </button>
      </div>
    );
  }

  return (
    <div style={{
      height: "100vh", display: "flex", flexDirection: "column",
      background: "transparent", color: CLAIR.texte,
      fontFamily: FONT, boxSizing: "border-box",
      paddingTop: 62, overflow: "hidden",
    }}>

      {/* ── Bande de tête ─────────────────────────────────────────────────
          Les trois chiffres que la maquette met en avant. Ceux qu'elle
          montrait en plus — rendement TWR, cash disponible — n'ont aucune
          source : ni calcul au backend, ni champ au modèle. Les afficher
          à vide aurait donné trois cases vides plutôt qu'un tableau de bord.

          Le retrait latéral vaut MARGE, comme les onglets et le contenu :
          remontée au niveau de la page, la bande avait perdu le retrait de la
          vue Résumé et touchait les deux bords. */}
      <div style={{ padding: `0 ${MARGE}px`, flexShrink: 0 }}>
      <Cadre style={{ padding: "13px 18px", flexShrink: 0, display: "flex", alignItems: "center", gap: 22, flexWrap: "wrap" }}>
        {/* Identité du portefeuille. La maquette met ici une illustration
            décorative ; elle ne dit rien qu'on ne sache déjà. Ces pixels
            répondent plutôt à une question que la mise en page a fait
            disparaître : depuis que la pastille est partie à droite du
            bandeau, la bande n'indiquait plus de quel portefeuille il s'agit.
            Les logos empilés montrent en plus ce qu'il contient. */}
        {portfolio && (
          <div style={{ display: "flex", alignItems: "center", gap: 11, minWidth: 0, flexShrink: 0 }}>
            {/* L'identité du portefeuille : son image, ou à défaut un
                portefeuille de cuir portant une carte par actif, dans les
                couleurs des cartes visibles plus bas. `enriched` et non
                `portfolio.assets` : c'est la source du compte affiché juste en
                dessous, et les deux doivent se répondre.

                La taille égalise les trois marges qui l'entourent : autant de
                pixels au-dessus, au-dessous et à gauche.

                À gauche, l'écart vaut 19 — le retrait de 18 de `Cadre` et son
                liseré d'un pixel — et il ne se négocie pas, c'est celui de tout
                le contenu de la bande. Restent le haut et le bas, qui se
                partagent également puisque la rangée centre ses éléments : il
                faut donc que la bande dépasse la vignette de 38.

                ⚠️ Et pour cela, il faut que la vignette **cesse d'être
                l'élément le plus haut de la rangée**. À 88 elle l'était, et
                commandait la hauteur de la bande : ses marges hautes valaient
                alors la moitié des 28 de retrait, soit 14, contre 19 à gauche —
                impossible à égaliser en grandissant. Sous 73, c'est le bloc de
                la valeur totale qui commande, avec ses 72,8 : la bande retombe
                à 100,8, et 100,8 − 38 donne 62,8. Mesuré à 63 : 19 en haut, 19
                en bas, 19 à gauche.

                ⚠️ À revoir si le bloc de la valeur totale change de hauteur :
                c'est lui qui fixe désormais celle de la bande. */}
            {/* Le conteneur relatif n'existe que pour la pastille d'enveloppe,
                qui chevauche l'angle haut-droit de la vignette. Elle vit ici et
                non dans `ImagePortefeuille` : ce composant sert aussi le menu
                déroulant et la page de construction, où l'enveloppe n'a rien à
                faire — et il n'a pas à connaître la fiscalité. */}
            <span style={{ position: "relative", display: "inline-flex", flexShrink: 0 }}>
              <ImagePortefeuille portefeuille={portfolio} actifs={enriched} taille={63} onChange={setPortfolio} />
              {enveloppePortefeuille && (
                <PastilleEnveloppe enveloppe={enveloppePortefeuille}
                  infobulle={infobulleEnveloppe(enveloppePortefeuille)} />
              )}
            </span>
            <div style={{ minWidth: 0 }}>
              {/* Le nom seul. Une pastille de la couleur du portefeuille le
                  précédait ; elle est retirée. Elle était le dernier endroit du
                  bandeau où cette couleur paraissait — la vignette ne s'en teinte
                  plus depuis qu'elle a pris le cuir de la palette — donc elle ne
                  distinguait plus rien de rien. */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: CLAIR.texte, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                  {portfolio.name}
                </span>
              </div>
              <span style={{ fontSize: 10.5, color: CLAIR.texteAttenue }}>
                {enriched.length} actif{enriched.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
        <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
        <div style={{ minWidth: 200 }}>
    {/* VALEUR TOTALE + édition inline */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
      <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
        <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>Valeur totale</p>
        <button onClick={() => setMasque(v => !v)} title={masque ? "Afficher les montants" : "Masquer les montants"}
          aria-label={masque ? "Afficher les montants" : "Masquer les montants"}
          style={{ background: "none", border: "none", cursor: "pointer", padding: 0, display: "flex", color: CLAIR.texteFaible }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round">
            {masque
              ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19M1 1l22 22"/><path d="M9.9 9.9a3 3 0 1 0 4.2 4.2"/></>
              : <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></>}
          </svg>
        </button>
      </span>
    </div>
    {/* Les cours sont relus toutes les quinze secondes ; le clignotement dit
          dans quel sens la valeur vient de bouger. Sans lui, la seule trace
          d'une mise à jour est un chiffre qui change au milieu d'une page
          dense, ce que personne ne voit. `tabular-nums` évite que les
          chiffres se déplacent latéralement à chaque rafraîchissement, ce qui
          attirerait l'œil pour une mauvaise raison. */}
    {editingValue ? (
      <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 4 }}>
        <input autoFocus value={valueInput} onChange={e => setValueInput(e.target.value)}
          onKeyDown={e => { if (e.key === "Enter") saveTotalValue(); if (e.key === "Escape") setEditingValue(false); }}
          onBlur={saveTotalValue} placeholder="Ex: 10000" type="number"
          style={{ width: 100, background: CLAIR.carteCreuse, border: `1px solid ${JETONS.accentBord}`, borderRadius: RAYONS.xs, padding: "3px 8px", color: CLAIR.texte, fontSize: 11, outline: "none", fontFamily: FONT }} />
        <span style={{ fontSize: 11, color: CLAIR.texteAttenue }}>€</span>
      </div>
    ) : (
      <div style={{
        fontSize: 32, fontWeight: 600, fontFamily: FONT, letterSpacing: "-0.02em",
        lineHeight: 1, marginBottom: 5, fontVariantNumeric: "tabular-nums",
        // Pas de clignotement sous le curseur : le vert et le rouge disent
        // « ça vient de monter », or rien ne monte — c'est la souris qui se
        // déplace. Le défilement des chiffres, lui, est conservé : il dit
        // seulement que le nombre a changé, ce qui est le cas.
        ...styleClignotement(masque || survolCourbe != null ? null : clignoteValeur, CLAIR.texte),
      }}>
        {masque
          ? "•••• €"
          : survolCourbe != null
            // Le point survolé prend la place du total, et la ligne du dessous
            // en donne la date : sans elle, rien ne dirait si ce nombre est
            // celui de maintenant ou celui d'un mardi de juin.
            ? <ChiffresRoulants texte={survolCourbe.valeur.toLocaleString("fr-FR", {
                minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"} />
          : valeurTotale != null
            // Les centimes d'un seul tenant avec les euros, même corps et même
            // encre. `toLocaleString` arrondit le nombre entier, ce qui laisse
            // la retenue remonter : découper avant d'arrondir donnerait
            // « 3 466,100 » dès que la décimale dépasse 99,5 centimes.
            ? <ChiffresRoulants texte={valeurTotale.toLocaleString("fr-FR", {
                minimumFractionDigits: 2, maximumFractionDigits: 2,
              }) + " €"} />
            : <span style={{ fontSize: 13, color: CLAIR.texteFaible }}>Non défini</span>}
      </div>
    )}
    {/* Sous la valeur : le capital engagé et depuis quand.
        Le gain figurait ici *et* dans « Gains / pertes », deux fois le même
        nombre à quatre centimètres d'écart. Ce qui manquait, c'était ce
        qu'on a mis pour arriver à cette valeur. */}
    {survolCourbe != null ? (
      /* Le capital engagé **à cette date**, et la date elle-même.
         Les trois chiffres de la bande — valeur, capital, gain — décrivent alors
         le même instant. Laisser le capital d'aujourd'hui sous une valeur d'hier
         donnait un couple qui ne se recoupait pas, et dont l'écart se lisait
         comme un gain qu'on n'avait pas.
         La date reste : c'est elle qui empêche le total du dessus d'être pris
         pour celui du moment. */
      <div style={{ fontSize: 11, fontFamily: FONT, color: CLAIR.accent, fontWeight: 500 }}>
        {survolCourbe.investi != null && (
          <>{masque ? "•••• €" : `${survolCourbe.investi.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} investis
            <span style={{ opacity: 0.5 }}> · </span></>
        )}
        {new Date(survolCourbe.date).toLocaleString("fr-FR", {
          day: "numeric", month: "short", year: "numeric",
          ...(survolCourbe.date.includes("T") && period === "24h"
            ? { hour: "2-digit", minute: "2-digit" } : {}),
        })}
      </div>
    ) : surTransactions && prixDeRevient != null ? (
      <div style={{ fontSize: 11, fontFamily: FONT, color: CLAIR.texteAttenue }}>
        {masque ? "•••• €" : `${prixDeRevient.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} investis
        {origine && ` ${libellePeriode.toLowerCase()}`}
      </div>
    ) : gainAffiche != null && (
      <div style={{ fontSize: 11, fontFamily: FONT, color: gainAffiche.eur >= 0 ? CLAIR.positif : CLAIR.negatif, fontWeight: 600 }}>
        {libellePeriode}&nbsp;
        <span>
          {gainAffiche.eur >= 0 ? "+" : ""}
          {Math.round(gainAffiche.eur).toLocaleString("fr-FR")} €
        </span>
        {gainAffiche.pct != null && (
          <span style={{ opacity: 0.55, marginLeft: 4 }}>({fmtChange(gainAffiche.pct)})</span>
        )}
      </div>
    )}
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
        <div style={{ minWidth: 150 }}>
          <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>Gains / pertes</p>
    {/* P&L total depuis achat */}
    {valeurTotale != null && (() => {
      const cb = prixDeRevient;
      if (cb == null) {
        return (
          <div style={{ marginTop: 3 }}>
            {editingCost ? (
              <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
                <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                  onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                  onBlur={saveCostBasis} placeholder="Prix de revient" type="number"
                  style={{ width: 110, background: CLAIR.carteCreuse, border: `1px solid ${JETONS.accentBord}`, borderRadius: RAYONS.xs, padding: "3px 8px", color: CLAIR.texte, fontSize: 10, outline: "none", fontFamily: FONT }} />
                <span style={{ fontSize: 10, color: CLAIR.texteAttenue }}>€</span>
              </div>
            ) : (
              <button onClick={() => { setCostInput(""); setEditingCost(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 10, color: CLAIR.texteFaible, padding: 0, textDecoration: "underline dotted", fontFamily: FONT, transition: "color 150ms" }}
                onMouseEnter={e => (e.currentTarget.style.color = CLAIR.texteSecondaire)}
                onMouseLeave={e => (e.currentTarget.style.color = CLAIR.texteFaible)}>
                + Définir prix de revient
              </button>
            )}
          </div>
        );
      }
      /* Sous le curseur, le gain se recalcule à la date survolée : valeur du
         point moins le capital engagé ce jour-là. Sans ce second terme on
         afficherait le gain d'aujourd'hui sous une valeur d'hier, et l'écart
         entre les deux serait pris pour une perte. Le capital manque parfois —
         la route ne le donne pas sur toutes les fenêtres — et on garde alors le
         total, faute de mieux que de mentir. */
      const survolGain = survolCourbe != null && survolCourbe.investi != null
        ? { eur: survolCourbe.valeur - survolCourbe.investi, base: survolCourbe.investi }
        : null;
      const plEur = survolGain ? survolGain.eur : valeurTotale - cb;
      const plPct = (plEur / (survolGain ? survolGain.base : cb)) * 100;
      const plCol = plEur >= 0 ? CLAIR.positif : CLAIR.negatif;
      return (
        <div style={{ marginTop: 3, fontSize: 11, fontFamily: FONT, color: plCol, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
          {survolGain ? "À cette date" : "Total"}
          {/* Deux décimales, comme la valeur totale juste au-dessus. Arrondi à
              l'euro, ce gain ne se recoupait pas avec elle : 3 447,92 € moins
              3 256,73 € de capital font 191,19 €, pas 191. */}
          <span>{plEur >= 0 ? "+" : ""}{plEur.toLocaleString("fr-FR", {
            minimumFractionDigits: 2, maximumFractionDigits: 2 })} €</span>
          <span style={{ opacity: 0.55 }}>({plPct >= 0 ? "+" : ""}{plPct.toFixed(2)}%)</span>
          {/* Le crayon disparaît dès que le prix de revient vient des
              écritures : la valeur saisie serait enregistrée puis ignorée,
              le calcul repartant des transactions au rafraîchissement. */}
          {!surTransactions && (
            <button onClick={() => { setCostInput(cb.toString()); setEditingCost(true); }}
              style={{ background: "none", border: "none", cursor: "pointer", fontSize: 9, color: CLAIR.texteFaible, padding: 0, transition: "color 150ms" }}
              onMouseEnter={e => (e.currentTarget.style.color = CLAIR.texteSecondaire)}
              onMouseLeave={e => (e.currentTarget.style.color = CLAIR.texteFaible)}>✏</button>
          )}
          {editingCost && !surTransactions && (
            <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
              <input autoFocus value={costInput} onChange={e => setCostInput(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter") saveCostBasis(); if (e.key === "Escape") setEditingCost(false); }}
                onBlur={saveCostBasis} type="number"
                style={{ width: 90, background: CLAIR.carteCreuse, border: `1px solid ${JETONS.accentBord}`, borderRadius: RAYONS.xs, padding: "2px 7px", color: CLAIR.texte, fontSize: 10, outline: "none", fontFamily: FONT }} />
              <span style={{ fontSize: 10, color: CLAIR.texteAttenue }}>€</span>
            </div>
          )}
        </div>
      );
    })()}
        </div>
        <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
        <div style={{ minWidth: 120 }}>
          {/* La période est nommée dans le titre.
              Ce bloc suit la période choisie sous le graphique, quand « Gains
              / pertes », à sa gauche, compte toujours depuis l'origine. Rien
              ne le disait : voir « Total +325 € » à côté d'un « vous » à
              +247 € donnait deux gains inconciliables pour le même
              portefeuille, alors que l'un couvrait trois mois et l'autre six.
              Le libellé repris est celui des boutons — « 3M », « Max » — pour
              qu'on reconnaisse celui sur lequel on vient de cliquer. */}
          <p style={{ margin: "0 0 4px", fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>
            Comparaison
            <span style={{ marginLeft: 5, fontWeight: 400, opacity: 0.65 }}>· {period}</span>
          </p>
    {/* Le repère, rejoué avec les mêmes versements aux mêmes dates.
        Opposer deux pourcentages laissait ouvert ce que l'épargnant aurait
        réellement eu ; en euros, la question ne se pose plus. */}
    {simRepere != null && gain != null ? (() => {
      // L'écart se calcule sur les montants *affichés*, arrondis, et non sur
      // les valeurs exactes : sinon « 85 € » moins « 77 € » peut s'accompagner
      // d'un « 9 € de mieux », et le lecteur qui refait la soustraction trouve
      // huit.
      //
      // L'arrondi est passé au centime avec le reste de la bande, et la
      // propriété tient toujours : c'est la même quantification appliquée aux
      // trois nombres avant qu'on les soustraie.
      const auCentime = (v: number) => Math.round(v * 100) / 100;
      const mien = auCentime(gain.eur);
      const sien = auCentime(simRepere.gain_eur);
      const ecart = auCentime(mien - sien);
      const col   = ecart >= 0 ? CLAIR.positif : CLAIR.negatif;
      return (
        <div style={{ position: "relative", marginTop: 3 }}
          onMouseEnter={() => setActiveTooltip("spy")}
          onMouseLeave={() => setActiveTooltip(null)}>
          {/* Les deux termes, puis l'écart.
              Le bloc ne montrait que le repère et la différence : le lecteur
              reconstituait le troisième nombre en le prenant dans « Gains /
              pertes », à quatre centimètres de là. Or ces deux mesures ne sont
              pas la même — l'une est la plus-value latente, l'autre le gain
              total, réalisé compris — et leur écart vaut exactement le
              résultat des ventes. Soustraire l'une de l'autre donnait donc un
              nombre qui ne collait pas, sans que rien n'explique pourquoi.
              Le bloc porte maintenant ses trois nombres. */}
          <div style={{
            display: "grid", gridTemplateColumns: "auto auto", columnGap: 10, rowGap: 2,
            fontSize: 10, fontFamily: FONT, color: CLAIR.texteAttenue, cursor: "default",
          }}>
            <span>Vous</span>
            <span style={{ color: CLAIR.texteSecondaire, fontWeight: 600, justifySelf: "end" }}>
              {mien >= 0 ? "+" : ""}{mien.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <span>Sur S&amp;P 500</span>
            <span style={{ color: CLAIR.texteSecondaire, fontWeight: 600, justifySelf: "end" }}>
              {sien >= 0 ? "+" : ""}{sien.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
            </span>
            <span style={{ gridColumn: "1 / -1", marginTop: 1 }}>
              <span style={{ color: col, fontWeight: 700 }}>
                {ecart >= 0 ? "+" : "−"}{Math.abs(ecart).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €
              </span>
              <span style={{ marginLeft: 3, opacity: 0.8 }}>{ecart >= 0 ? "de mieux" : "de moins"}</span>
            </span>
          </div>
          {activeTooltip === "spy" && (
            <div style={{
              position: "absolute", bottom: "calc(100% + 6px)", left: 0, zIndex: 50, width: 252,
              background: "rgba(4,17,36,0.97)", border: `1px solid ${CLAIR.bordFort}`,
              borderRadius: RAYONS.sm, padding: "9px 11px", boxShadow: "0 8px 24px rgba(0,0,0,0.50)",
              pointerEvents: "none",
            }}>
              <span style={{ fontSize: 10, color: CLAIR.texteSecondaire, lineHeight: 1.6 }}>
                Si vous aviez versé les mêmes sommes, aux mêmes dates, sur le
                S&amp;P 500, vous auriez{" "}
                <b style={{ color: CLAIR.texte }}>
                  {Math.round(simRepere.value).toLocaleString("fr-FR")} €
                </b>{" "}
                au lieu de{" "}
                <b style={{ color: CLAIR.texte }}>
                  {valeurTotale != null ? Math.round(valeurTotale).toLocaleString("fr-FR") : "—"} €
                </b>.
                <br />
                Le repère est libellé en dollars : le change n&apos;est pas neutralisé.
                {/* Ce qui sépare ce gain de celui de « Gains / pertes ».
                    Une première version attribuait l'écart au résultat des
                    ventes. C'était faux : un portefeuille sans aucune vente
                    montre le même écart, parce que la vraie cause est
                    ailleurs — les deux blocs ne couvrent pas la même période.
                    Le calcul d'un « réalisé » par simple soustraction ne
                    valait donc que sur « Max », et racontait n'importe quoi
                    partout ailleurs. */}
                <br />
                Ce gain porte sur la période choisie sous le graphique
                {period !== "Max" && <> — <b style={{ color: CLAIR.texte }}>{PERIOD_LABEL[period]}</b></>}.
                « Gains / pertes » compte, lui, depuis la première opération.
              </span>
            </div>
          )}
        </div>
      );
    })() : reperePeriode != null && perfPeriode != null && (() => {
      // Sans transactions, on ne peut pas rejouer de versements : on retombe
      // sur l'écart de pourcentages.
      const diff    = perfPeriode - reperePeriode;
      const diffCol = diff >= 0 ? CLAIR.positif : CLAIR.negatif;
      return (
        <div style={{ marginTop: 3, fontSize: 10, color: CLAIR.texteAttenue, fontFamily: FONT }}>
          vs S&amp;P 500&nbsp;
          <span style={{ color: diffCol, fontWeight: 700 }}>{diff >= 0 ? "+" : ""}{diff.toFixed(2)}%</span>
        </div>
      );
    })()}
        </div>
        {scoreSante != null && <>
          <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
          {/* Santé du portefeuille : le titre chiffré passe en tête, la carte
              de droite ne garde que le détail par critère. */}
          <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 170 }}>
            <CircleScore score={scoreSante} size={64} nu />
            <div>
              <p style={{ margin: "0 0 3px", fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>Santé du portefeuille</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                <span style={{ fontSize: 20, fontWeight: 800, fontFamily: FONT, color: CLAIR.texte, lineHeight: 1 }}>{scoreSante}</span>
                <span style={{ fontSize: 10, color: CLAIR.texteFaible }}>/100</span>
              </div>
              <span style={{ fontSize: 11, fontWeight: 600, color: scoreColor(scoreSante) }}>
                {bandeSante ?? scoreLabel(scoreSante)}
              </span>
            </div>
          </div>
        </>}
      </Cadre>
      </div>

      {/* Navigation des sections, sous la bande de valeur : on lit d'abord
          combien on a, puis on choisit ce qu'on veut en voir.
          Au niveau de la page et non dans la vue Résumé — laissée dedans,
          elle disparaissait dès qu'on changeait d'onglet, donc sans retour. */}
      <div style={{ padding: `8px ${MARGE}px 0`, flexShrink: 0, ...anim(40) }}>
        <PortfolioTabs active={dashView} onChange={setDashView} />
      </div>

      {/* ── MAIN ────────────────────────────────────────────────────────────── */}
      <div style={{ flex: 1, minHeight: 0, overflow: "hidden", position: "relative" }}>

      {/* ══ VUE RÉSUMÉ ══════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "resume" ? "flex" : "none", flexDirection: "column", height: "100%", gap: 8, padding: `8px ${MARGE}px 0`, overflowY: "auto", overflowX: "hidden" }}>

        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 0, alignItems: "stretch" }}>

        {/* Treemap / Liste */}
        <div style={{ flex: 1, minWidth: 0, minHeight: 0, display: "flex", flexDirection: "column", gap: 8, ...anim(80) }}>
          {/* Performance du portefeuille — l'élément central de la maquette, et
              le seul qui manquait entièrement. La période est celle de la page :
              un unique sélecteur commande la courbe, les tuiles et les chiffres,
              plutôt que deux réglages qui se contredisent. */}
          {/* Conteneur repris à l'identique de la page graphique : même rayon de
              30 px, même bord, même fond, même rembourrage, et la même couche
              de halo interne. Un `Cadre` générique donnait un cadre visiblement
              différent pour le même objet. */}
          {/* Panneau blanc comme les autres. La classe « verre » et sa couche
              de halo appartenaient au fond sombre : sur blanc, le flou ne
              produit qu'un voile gris. */}
          <div style={{ ...styleCadreExterieur(), flex: 1, minHeight: 150 }}>
          <div style={{
            ...styleCarteInterieure(),
            padding: "8px 12px 6px",
            display: "flex", flexDirection: "column",
            position: "relative", overflow: "hidden",
          }}>
            <div style={{ position: "relative", zIndex: 1, display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }}>
            <PerformanceChart
              assets={enriched.map(a => ({ ticker: a.ticker, weight: a.weight }))}
              totalValue={valeurTotale}
              period={period}
              onPeriodChange={setPeriod}
              color={portfolio?.color || "var(--nv-accent)"}
              portfolioId={portfolio?.id}
              surTransactions={surTransactions}
              operations={reperesOperations}
              onOperationClick={(id) => { setOperationVisee(id); setDashView("transactions"); }}
              onSurvol={setSurvolCourbe}
            />
            </div>
          </div>
          </div>

          {/* Le titre, les filtres et le tri tenaient sur deux lignes, avec
              une infobulle de légende et un bouton d'ajout que le concept n'a
              pas. Tout est descendu dans la grille, sur une seule ligne. */}
          {loading ? (
            <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", color: CLAIR.texteFaible, fontSize: 12 }}>
              Chargement…
            </div>
          ) : (<>
            {/* Grille à cartes égales. La treemap pondérée codait le poids
                par la surface : les petites lignes en devenaient illisibles,
                et deux rectangles de proportions différentes se comparent mal.
                Le poids se lit maintenant en chiffres sur chaque carte. */}
            <div style={{ flexShrink: 0 }}>
              <AssetGrid
                assets={enriched.map(a => ({
                  ticker: a.ticker, weight: a.weight,
                  change: a.change, type: a.type, price: a.price,
                  spark:     sparkHistory[a.ticker] ?? assetSparks[a.ticker],
                  updatedAt: priceUpdatedAt[a.ticker],
                  value:     a.value,
                  perfEur:   a.perfEur,
                  pnlEur:    a.pnlEur,
                  pnlPct:    a.invested && a.pnlEur != null ? (a.pnlEur / a.invested) * 100 : null,
                  avgCost:   a.avgCost,
                  quantity:  a.quantity,
                }))}
                onAssetClick={ticker => router.push(`/chart?ticker=${encodeURIComponent(ticker)}`)}
                view={view}
              />
            </div>
            {/* Liste — toujours monté */}
            <div style={{ overflowY: "auto", flex: 1, borderRadius: RAYONS.sm, border: `1px solid ${CLAIR.bord}`, display: view === "liste" ? "block" : "none" }}>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 70px 100px 70px" }}>
                {/* La dernière colonne suit la période, comme les libellés de
                    la bande de tête : figée sur « 24h », elle annonçait une
                    variation d'un an comme celle de la journée. */}
                {["Actif", "Poids", "Prix", PERIOD_LABEL[period]].map(h => (
                  <div key={h} style={{ padding: "8px 14px", fontSize: 9, fontWeight: 700,
                    color: CLAIR.texteFaible, letterSpacing: "0.10em",
                    borderBottom: `1px solid ${CLAIR.bord}` }}>{h}</div>
                ))}
                {[...enriched].sort((a, b) => b.weight - a.weight).flatMap(a => [
                  <div key={`${a.ticker}-n`} style={{ display: "flex", alignItems: "center", gap: 9, padding: "9px 14px", borderBottom: `1px solid ${CLAIR.bord}` }}>
                    <AssetLogo ticker={a.ticker} type="EQUITY" size={22} radius={5}
                      fallbackBg={CLAIR.carteCreuse} fallbackBorder={CLAIR.bord} fallbackTextColor={CLAIR.texteSecondaire}
                      bare/>
                    <span style={{ fontSize: 12, fontWeight: 500 }}>{a.ticker.replace(/-USD$/, "")}</span>
                  </div>,
                  <div key={`${a.ticker}-w`} style={{ padding: "9px 14px", fontSize: 11, color: CLAIR.texteSecondaire, borderBottom: `1px solid ${CLAIR.bord}`, display: "flex", alignItems: "center" }}>{a.weight.toFixed(1)}%</div>,
                  <div key={`${a.ticker}-p`} style={{ padding: "9px 14px", fontSize: 11, color: CLAIR.texteSecondaire, borderBottom: `1px solid ${CLAIR.bord}`, display: "flex", alignItems: "center", fontFamily: FONT }}>
                    {a.price !== null ? `${a.price.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €` : "—"}
                  </div>,
                  <div key={`${a.ticker}-c`} style={{ padding: "9px 14px", fontSize: 11, fontWeight: 700, borderBottom: `1px solid ${CLAIR.bord}`, display: "flex", alignItems: "center", fontFamily: FONT, color: a.change === null ? CLAIR.texteFaible : a.change >= 0 ? CLAIR.positif : CLAIR.negatif }}>
                    {fmtChange(a.change)}
                  </div>,
                ])}
              </div>
            </div>
          </>)}

          {/* La bande « À surveiller » vivait ici — mouvements notables,
              repères de marché, sentiment. Retirée : le concept arrête la
              colonne sur « Voir tous les actifs ». Les cartes « Risque » et
              « Bilan journalier » l'avaient précédée au même endroit. */}
        </div>

        {/* ── Right sidebar ─────────────────────────────────────────────────── */}
        <div style={{
          width: 296, flexShrink: 0,
          display: "flex", flexDirection: "column", gap: 8,
          paddingLeft: 10, overflow: "hidden",
          ...anim(160),
        }}>

          {/* Santé du portefeuille. La valeur totale est remontée dans la
              bande de tête : elle y est le premier chiffre qu'on cherche, et
              son départ rend une centaine de pixels à cette colonne. */}
          <Cadre style={{ padding: "14px 16px", flexShrink: 0 }}>
            {fraisOuvert && ancreFrais && (
              <PanneauFrais
                lignes={(analyse?.poids ?? []).map(p => ({ ticker: p.ticker, part: p.part }))}
                valeurs={analyse?.frais_lignes ?? {}}
                surFrais={enregistrerFrais}
                fermer={() => setFraisOuvert(false)}
                ancre={ancreFrais}
              />
            )}
            {profilOuvert && ancreProfil && (
              <PanneauProfil
                profil={analyse?.profil ?? null}
                surProfil={enregistrerProfil}
                fermer={() => setProfilOuvert(false)}
                ancre={ancreProfil}
              />
            )}
            {etatAnalyse === "charge" && (
              <p style={{ margin: 0, fontSize: 11.5, color: CLAIR.texteFaible }}>Analyse en cours…</p>
            )}
            {etatAnalyse === "vide" && (
              // Dire **pourquoi** il n'y a pas de note. Un cours manquant et un
              // portefeuille vide n'appellent pas la même action, et les confondre
              // enverrait ajouter des transactions à qui en a déjà.
              analyse?.source === "incomplet" ? (
                <p style={{ margin: 0, fontSize: 11.5, color: CLAIR.texteFaible, lineHeight: 1.5 }}>
                  Score indisponible : le cours de{" "}
                  <span style={{ color: CLAIR.texte, fontWeight: 600 }}>
                    {(analyse.sans_cours ?? []).join(", ")}
                  </span>{" "}
                  n&apos;a pas pu être lu. Noter sans cette ligne reviendrait à la
                  retirer du portefeuille.
                </p>
              ) : (
                <p style={{ margin: 0, fontSize: 11.5, color: CLAIR.texteFaible, lineHeight: 1.5 }}>
                  Pas encore de score : ajoutez des transactions, ou une composition
                  et une valeur totale.
                </p>
              )
            )}
            {etatAnalyse === "prêt" && analyse && (() => {
              /**
               * Le nom des facteurs qui **font** la note, pour l'infobulle du titre.
               *
               * ⚠️ Réduit à des noms depuis que les barres ont quitté cette vue. Il
               * portait aussi les notes, les lectures et les explications ; les garder
               * aurait laissé croire que le panneau les affiche encore.
               *
               * Les indicatifs en sont écartés : ce panneau s'appelle « Détail du
               * score », et y citer des facteurs qui n'y entrent pas serait à
               * contresens. Ils vivent dans l'onglet Analyse.
               *
               * La liste est **dérivée** et non écrite à la main. Celle qui vivait ici
               * citait la corrélation, la sensibilité au marché et la liquidité :
               * trois facteurs qui ne notaient déjà plus, et deux qui n'existent plus.
               */
              const piliers = analyse.novac?.piliers ?? [];
              const nomsNotants = piliers
                .filter(pil => pil.poids_effectif > 0)
                .map(pil => pil.libelle.toLowerCase());
              // ⚠️ La couverture compte les **piliers** mesurés, non les métriques :
              // c'est l'unité que l'écran affiche à côté de la note, et mélanger les
              // deux granularités donnerait « 9/11 » sans qu'on sache de quoi.
              const couverture = {
                mesures: piliers.filter(pil => pil.score != null).length,
                total: piliers.length,
              };
              const faible = pilierLePlusFaible(piliers);
              // ⚠️ La confiance n'est **pas** la note : elle dit la qualité des
              // données. « 76, confiance 58 % » signifie « ce portefeuille semble
              // correct, mais je connais mal ce qu'il contient ».
              const confiance = analyse.novac?.confiance ?? null;
              return (
                <>
                  <div style={{ display: "flex", alignItems: "center", gap: 5, marginBottom: 10 }}>
                    <p style={{ margin: 0, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte,
                                whiteSpace: "nowrap" }}>Détail du score</p>
                    {/* ⚠️ La liste est **dérivée**, plus écrite à la main. Celle qui
                        vivait ici citait la corrélation, la sensibilité au marché et
                        la liquidité : trois facteurs qui ne notaient déjà plus quand
                        je l'ai lue, et deux qui n'existent plus du tout. Une
                        énumération figée décrit tôt ou tard un calcul qui n'a plus
                        lieu, et rien ne le signale. */}
                    <span title={`Moyenne des cinq piliers mesurés : ${
                      nomsNotants.join(", ")
                    }. ${couverture.mesures} sur ${couverture.total} mesurés — les autres sont ignorés plutôt que comptés zéro, et leur poids se répartit sur les piliers disponibles.${
                      analyse.novac ? ` Méthodologie ${analyse.novac.version_methodologie}.` : ""
                    }`}
                      style={{ display: "flex", color: CLAIR.texteFaible, cursor: "help" }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
                        <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" strokeLinecap="round" />
                      </svg>
                    </span>
                    {/* ⚠️ La confiance s'affiche **à côté** de la couverture, jamais à
                        la place de la note. Ce sont deux chiffres de natures
                        différentes : la note dit la qualité du portefeuille, la
                        confiance celle des données qui ont servi à la calculer. Sans
                        elle, une note portée par trois piliers ressemble à une note
                        portée par cinq. */}
                    {/* ⚠️ `whiteSpace: nowrap` et libellés courts. Trois éléments sur
                        une ligne de 240 px repliaient chacun sur deux lignes : le titre
                        « Détail du / score », puis « 5/5 / piliers » et « confiance / 100
                        % ». L'en-tête faisait trois hauteurs de ligne pour deux chiffres.
                        « 5/5 » suffit — le mot « piliers » est dans l'infobulle. */}
                    <span style={{ marginLeft: "auto", display: "flex", alignItems: "baseline",
                                   gap: 8, fontSize: 10, color: CLAIR.texteFaible,
                                   whiteSpace: "nowrap", flexShrink: 0 }}>
                      <span title={`${couverture.mesures} des ${couverture.total} piliers sont mesurés.`}
                        style={{ cursor: "help" }}>
                        {couverture.mesures}/{couverture.total}
                      </span>
                      {confiance != null && (
                        <span title={
                          "La qualité des données, non celle du portefeuille. Les manques "
                          + "sur une grosse position pèsent plus lourd que sur une petite."
                          + (analyse.novac?.donnees_manquantes.length
                            ? ` Absent : ${analyse.novac.donnees_manquantes.join(" · ")}.`
                            : "")}
                          style={{ cursor: "help",
                                   color: confiance >= 80 ? CLAIR.texteFaible : CLAIR.attentionFort }}>
                          {confiance} %
                        </span>
                      )}
                    </span>
                  </div>
                  {(() => {
                    /**
                     * L'invite à déclarer son profil, quand il manque.
                     *
                     * ⚠️ Sans elle, la volatilité se tait et rien ne le dit :
                     * l'utilisateur voit seulement une note calculée sur moins de
                     * critères, sans savoir qu'il lui manque une réponse à donner.
                     * « Ce facteur attend votre profil » est actionnable ; une note
                     * discrètement plus basse ne l'est pas.
                     *
                     * Le nombre vient de `FACTEURS_DU_PROFIL` et le texte s'accorde
                     * seul : ils étaient trois avant l'audit — bêta supprimé, perte
                     * maximale passée en indicatif — et un libellé écrit en dur
                     * aurait menti sans que rien n'échoue.
                     */
                    // Les piliers qui n'ont aucun sens sans intention déclarée :
                    // juger un niveau de risque dans l'absolu revient à décréter le
                    // projet de l'épargnant à sa place.
                    const enAttente = piliers.filter(
                      pil => (pil.cle === "risque" || pil.cle === "adequation")
                             && pil.score == null);
                    if (!enAttente.length) return null;
                    return (
                      <button type="button"
                        onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setAncreProfil({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
                          setProfilOuvert(true);
                        }}
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          margin: "0 0 9px", padding: "7px 8px", cursor: "pointer",
                          borderRadius: RAYONS.xs, background: CLAIR.carteCreuse,
                          border: `1px solid ${JETONS.bord}`,
                          fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue,
                          lineHeight: 1.45,
                        }}>
                        <span style={{ color: CLAIR.accent, fontWeight: 600 }}>
                          Déclarez votre profil de risque
                        </span>{" "}
                        pour que {enAttente.length === 1 ? "ce pilier soit noté" : `ces ${enAttente.length} piliers soient notés`} :{" "}
                        {enAttente.map(pil => pil.libelle.toLowerCase()).join(", ")}.
                      </button>
                    );
                  })()}
                  {(() => {
                    /**
                     * L'invite à saisir les frais courants, quand ils manquent.
                     *
                     * ⚠️ C'est le **seul** facteur qui ne se rétablit jamais seul. Le
                     * fournisseur de cours ne publie pas le TER des ETF domiciliés en
                     * Europe : mesuré sur un vrai PEA, un seul des trois fonds
                     * l'annonçait, soit 10 % du portefeuille — sous le seuil de
                     * couverture, donc aucune note, définitivement.
                     *
                     * Sans cette invite, l'utilisateur voit « — » sans savoir qu'il
                     * peut y remédier lui-même, et que le chiffre est sur le document
                     * d'information de chacun de ses fonds. Les frais sont le facteur
                     * le plus prédictif du résultat relatif sur vingt ans, et le seul
                     * qui soit certain : ne pas les mesurer est le manque le plus
                     * coûteux du score.
                     */
                    const f = piliers
                      .flatMap(pil => pil.metriques)
                      .find(m => m.cle === "frais_fonds");
                    // Poids nul : aucun fonds détenu, donc aucun frais courant à
                    // saisir. Proposer la saisie serait inviter à un geste impossible.
                    if (!f || f.poids <= 0 || !(analyse.poids ?? []).length) return null;
                    // Mesurés, les frais restent modifiables : l'invite devient un
                    // simple lien, pour ne pas encombrer un panneau où tout va bien.
                    const mesure = f.score != null;
                    return (
                      <button type="button"
                        onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setAncreFrais({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
                          setFraisOuvert(true);
                        }}
                        /* ⚠️ Encadré seulement quand il y a quelque chose à faire.
                           Une fois les frais saisis, ce bloc bleu restait le plus
                           voyant du panneau — au-dessus du profil et de la cause de la
                           note — pour une action secondaire déjà accomplie. Il devient
                           alors un simple lien. */
                        style={{
                          display: "block", width: "100%", textAlign: "left",
                          margin: mesure ? "0 0 6px" : "0 0 9px",
                          padding: mesure ? 0 : "7px 8px", cursor: "pointer",
                          borderRadius: RAYONS.xs,
                          background: mesure ? "none" : CLAIR.carteCreuse,
                          border: mesure ? "none" : `1px solid ${JETONS.bord}`,
                          fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteAttenue,
                          lineHeight: 1.45,
                        }}>
                        <span style={{ color: CLAIR.accent, fontWeight: mesure ? 500 : 600 }}>
                          {mesure ? "Modifier les frais des fonds" : "Saisissez les frais de vos fonds"}
                        </span>
                        {!mesure && (
                          <> pour que ce facteur soit noté : le fournisseur de cours ne
                          publie pas le TER des ETF européens.</>
                        )}
                      </button>
                    );
                  })()}
                  {analyse.profil && (
                    <p style={{ margin: "0 0 9px", fontSize: 10.5, color: CLAIR.texteAttenue, lineHeight: 1.45 }}>
                      Profil : <span style={{ color: CLAIR.texte, fontWeight: 600 }}>
                        {analyse.profil.horizon_annees} ans, {analyse.profil.tolerance}
                      </span>{" "}
                      — cible {analyse.profil.volatilite.toFixed(0)} % de volatilité.{" "}
                      <button type="button"
                        onClick={e => {
                          const r = e.currentTarget.getBoundingClientRect();
                          setAncreProfil({ droite: window.innerWidth - r.right, haut: r.bottom + 6 });
                          setProfilOuvert(true);
                        }}
                        style={{
                          background: "none", border: "none", padding: 0, cursor: "pointer",
                          fontFamily: FONT, fontSize: 10.5, color: CLAIR.accent,
                        }}>Modifier</button>
                    </p>
                  )}
                  {faible && (
                    // Nommer la cause : un score sans motif se subit au lieu de
                    // se corriger.
                    // ⚠️ La mesure accompagne la note, parce que cette ligne est
                    // devenue la seule information par facteur de la vue générale.
                    // « diversification (65/100) » se subit ; « 5,6 secteurs
                    // équivalents » se vérifie et se corrige.
                    <p style={{ margin: "0 0 9px", fontSize: 10.5, color: CLAIR.texteAttenue, lineHeight: 1.45 }}>
                      Ce qui pèse le plus : <span style={{ color: CLAIR.texte, fontWeight: 600 }}>{faible.libelle.toLowerCase()}</span>{" "}
                      ({faible.score}/100)
                      {(() => {
                        // La métrique la plus faible **à l'intérieur** du pilier, avec
                        // sa lecture brute : « diversification 76 » ne dit pas quoi
                        // corriger, « 0,91 au plus entre deux lignes » le dit.
                        const pire = faible.metriques
                          .filter(m => m.score != null && m.poids > 0)
                          .sort((x, y) => x.score! - y.score!)[0];
                        return pire ? <> — {pire.lecture}</> : null;
                      })()}.
                    </p>
                  )}
                  {/* ⚠️ Les sept barres de facteurs ne sont **plus ici**.
                      Elles vivent dans l'onglet Analyse, avec leurs explications.

                      La vue générale répond à « comment je vais, et qu'est-ce qui
                      pèse » ; le détail facteur par facteur répond à « pourquoi »,
                      et c'est une autre question. Sept lignes plus leurs libellés
                      portaient ce panneau à une hauteur qui écrasait la colonne,
                      pour une information qu'un clic suffit à atteindre.

                      Ce qui reste suffit à ne pas subir la note : la couverture
                      dit sur combien de facteurs elle est calculée, et la cause
                      principale est nommée avec sa mesure. */}
                  <button type="button" onClick={() => setDashView("analyse")}
                    style={{
                      display: "flex", alignItems: "center", gap: 5, marginTop: 10,
                      background: "none", border: "none", cursor: "pointer", padding: 0,
                      fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
                    }}>
                    Voir le détail du score
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                      strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <path d="M5 12h14M13 6l6 6-6 6" />
                    </svg>
                  </button>
                </>
              );
            })()}
          </Cadre>

          {/* « Mouvements » vivait ici : les trois plus fortes hausses et
              baisses en contribution. Retiré — chaque carte d'actif affiche
              déjà sa variation et sa contribution en euros, et le tri par
              performance de la grille refait le classement à la demande. Sa
              place revient à l'allocation, dont la légende était rognée. */}
          {/* Allocation. Remplace l'exposition sectorielle, qui rangeait
              tout un portefeuille d'actions dans une barre unique à 100 %. */}
          <Cadre style={{ padding: "13px 15px", flexShrink: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <AllocationDonut
              assets={enriched.map(a => ({
                ticker: a.ticker, weight: a.weight, price: a.price,
                change: a.change, value: a.value, perfEur: a.perfEur,
              }))}
              totalValue={valeurTotale}
              onSeeAll={() => setDashView("analyse")}
            />
          </Cadre>
          {/* Activité récente. Le « Voir toute l'activité → » de la maquette
              n'avait aucune destination ; il mène à l'onglet Transactions,
              qui porte déjà le tableau complet. */}
          <Cadre style={{ padding: "13px 15px", flex: 1, minHeight: 128, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <RecentActivity
              portfolioId={portfolio?.id}
              refreshKey={txRefreshKey}
              onSeeAll={() => setDashView("transactions")}
            />
          </Cadre>
        </div>
        </div>
      </div>{/* fin Vue Résumé */}

      {/* ══ VUE ANALYSE ═════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "analyse" ? "flex" : "none", height: "100%", flexDirection: "column", overflow: "hidden" }}>
        {portfolio && (
          <AnalyseView analyse={analyse} etat={etatAnalyse} />
        )}
      </div>

{/* ⚠️ **Deux rangées de trois, et non trois colonnes.**
          La disposition précédente empilait quatre cartes dans la colonne de
          droite : la première en `flex: 1`, les trois suivantes à contenu fixe.
          Résultat, « Événements à venir » était écrasée à quelques pixels — une
          tache grise en haut de colonne, sans rien de lisible. C'est le défaut
          rapporté, et il vient de là.
          La maquette, elle, pose deux rangées de trois cadres : chaque rangée
          partage la hauteur, et aucune carte ne dépend du contenu de ses voisines.
          Les échéances passent du coup à droite du calendrier, comme demandé. */}
      <div style={{ display: dashView === "evenements" ? "flex" : "none", height: "100%",
        flexDirection: "column", padding: "14px 14px 10px", gap: 12, overflow: "hidden" }}>

        {/* ── Rangée haute : quand, quoi, combien ─────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 12 }}>
          {/* Le calendrier, nourri de la même liste que le panneau voisin, et
              cliquable : choisir un jour n'affiche que ses échéances. */}
          {/* ⚠️ Plus de `overflowY: auto` ici. Un mois se lit d'un coup d'œil : une barre
              de défilement sur un calendrier oblige à faire défiler pour voir la dernière
              semaine, ce qui en détruit l'intérêt. La grille s'adapte désormais à la
              hauteur offerte — voir `CalendrierEvenements` — donc il n'y a plus rien à
              faire défiler. Le cadre devient une colonne pour que le calendrier puisse
              le remplir. */}
          <Cadre style={{ width: 300, flexShrink: 0, padding: "16px 18px",
            display: "flex", flexDirection: "column", minHeight: 0 }}>
            <CalendrierEvenements evenements={echeances}
              selection={jourChoisi} onJour={setJourChoisi} />
          </Cadre>

          {/* ⚠️ Ce panneau était **entièrement fabriqué** : il listait les actifs
              du portefeuille en leur collant « Résultats trimestriels » et un
              « J+3, J+6, J+9 » calculé depuis l'indice de la boucle. Aucune de ces
              dates n'existait, et rien ne le disait. */}
          <Cadre style={{ flex: 1, minWidth: 0, padding: "16px 18px",
            display: "flex", flexDirection: "column", minHeight: 0 }}>
            <EvenementsAVenir portfolioId={portfolio?.id} onEvenements={setEvtsReponse}
              analyse={analyseEvts.donnees}
              supplement={transparence.donnees?.evenements ?? []}
              jour={jourChoisi} onEffacerJour={() => setJourChoisi(null)}
              tickerChoisi={tickerChoisi} onChoisirTicker={setTickerChoisi} />
          </Cadre>

          <Cadre style={{ width: 340, flexShrink: 0, padding: "16px 18px", overflowY: "auto" }}>
            <ImpactPotentiel donnees={analyseEvts.donnees} etat={analyseEvts.etat}
              ticker={tickerChoisi} detail={impactTitre.impact}
              etatDetail={impactTitre.etat}
              onEffacer={() => setTickerChoisi(null)} />
          </Cadre>
        </div>

        {/* ── Rangée basse : ce qui s'est passé, et les deux vues détaillées ── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, gap: 12 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", gap: 10, minHeight: 0 }}>
            <Cadre style={{ flex: 1, padding: "16px 18px", display: "flex", flexDirection: "column", minHeight: 0 }}>
              <HistoriqueEvenements donnees={analyseEvts.donnees} etat={analyseEvts.etat} />
            </Cadre>
          </div>

          <Cadre style={{ width: 300, flexShrink: 0, padding: "16px 18px",
            display: "flex", flexDirection: "column", minHeight: 0 }}>
            <DividendesAVenir evenements={echeances} />
          </Cadre>

          <Cadre style={{ width: 340, flexShrink: 0, padding: "16px 18px",
            display: "flex", flexDirection: "column", minHeight: 0 }}>
            <ProchainsResultats evenements={echeances} analyse={analyseEvts.donnees}
              tickerChoisi={tickerChoisi} onChoisirTicker={setTickerChoisi} />
          </Cadre>
        </div>
      </div>{/* fin Vue Événements */}

      {/* Les insights, retirés de l'onglet Événements : ils n'y avaient pas de
          place dans la maquette, et c'est une lecture de l'instant là où cet onglet
          ne porte que des dates. Ils restent affichés dans la vue Résumé. */}

      {/* ══ VUE OBJECTIFS ═══════════════════════════════════════════════════════ */}
      {/* ⚠️ **La répartition suit la maquette, pas la grille de trois colonnes d'avant.**
          Trois rangées empilées : les cartes d'objectifs en pleine largeur et **hors de
          tout panneau** — la maquette les pose à même la page, un cadre autour aurait
          ajouté un contenant que le dessin n'a pas ; puis la projection sur deux tiers
          avec, à sa droite, deux cartes empilées ; puis la dispersion en pleine largeur.

          ⚠️ « Meilleurs contributeurs » et « Répartition par classe » ont quitté cet
          onglet : la maquette ne les y met pas, et la vue générale liste déjà chaque
          ligne avec sa performance. Ils y restaient d'un état antérieur de la page. */}
      {/* ⚠️ **Aucun défilement : tout doit tenir d'un coup d'œil.** La maquette regroupe
          l'information sur un écran, et une page qui défile cache ce qu'on est venu
          comparer. Mesuré avant correction : 1 044 pixels de contenu pour 765 de
          disponibles. Les deux rangées de bord gardent leur hauteur naturelle, la
          projection absorbe le reste, et ses panneaux rétrécissent avec elle. */}
      <div style={{ display: dashView === "objectifs" ? "flex" : "none",
        // ⚠️ Écarts à 8 pixels et non 10 : les trois interstices rendent six pixels, soit
        // exactement ce qui manquait aux constats. Le dernier réglage d'un ajustement où
        // chaque panneau se disputait la même hauteur.
        flexDirection: "column", height: "100%", padding: "12px 14px 8px", gap: 8,
        overflow: "hidden" }}>

        {/* ── Rangée 1 : les objectifs ──────────────────────────────────────── */}
        <div style={{ display: "flex", alignItems: "center",
          justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
          <SectionLabel>MES OBJECTIFS</SectionLabel>
          {objectifs.donnees && objectifs.donnees.objectifs.length > 0 && (
            <button type="button" onClick={() => setSaisieObjectif({ mode: "creation" })}
              style={{ padding: "5px 12px", borderRadius: RAYONS.plein, cursor: "pointer",
                border: `1px solid ${JETONS.accent}`, background: JETONS.accentVoile,
                color: CLAIR.accent, fontFamily: FONT, fontSize: 10.5, fontWeight: 700 }}>
              + Nouvel objectif
            </button>
          )}
        </div>

        {objectifs.etat === "charge" && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
            Chargement des objectifs…
          </p>
        )}
        {objectifs.etat === "erreur" && (
          <p style={{ margin: 0, fontFamily: FONT, fontSize: 11, color: CLAIR.texteFaible }}>
            Objectifs indisponibles pour le moment.
          </p>
        )}
        {objectifs.etat === "pret" && objectifs.donnees && (
          <>
            {avertissementValeur(objectifs.donnees.source_valeur,
              objectifs.donnees.lignes_valorisees, objectifs.donnees.lignes_totales) && (
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 10, lineHeight: 1.5,
                color: JETONS.attention }}>
                {avertissementValeur(objectifs.donnees.source_valeur,
                  objectifs.donnees.lignes_valorisees, objectifs.donnees.lignes_totales)}
              </p>
            )}
            {alerteRepartition(objectifs.donnees.somme_des_parts) && (
              <p style={{ margin: 0, fontFamily: FONT, fontSize: 10, lineHeight: 1.5,
                color: JETONS.attention }}>
                {alerteRepartition(objectifs.donnees.somme_des_parts)}
              </p>
            )}
            <div style={{ flexShrink: 0 }}>
              <CartesObjectifs objectifs={listeObjectifs}
                onAjouter={() => setSaisieObjectif({ mode: "creation" })}
                onModifier={o => setSaisieObjectif({ mode: "edition", o })} />
            </div>
          </>
        )}

        {/* ── Rangée 2 : projection à gauche, deux cartes à droite ──────────── */}
        <div style={{ display: "grid", gap: 10, flex: 1, minHeight: 0,
          // ⚠️ 1,7 pour 1 et non 2 pour 1 : chaque retour à la ligne évité dans la
          // colonne de droite lui rend une quinzaine de pixels, et c'est là que le
          // contenu manquait de place. La courbe y perd quarante pixels de large, ce
          // qu'elle absorbe sans rien perdre.
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)" }}>
          <Cadre style={{ padding: "14px 16px", display: "flex",
            flexDirection: "column", minHeight: 0 }}>
            <ProjectionObjectif
              objectifs={listeObjectifs}
              choisi={projeteEffectif}
              onChoisir={setObjectifProjete}
              projection={projection.projection}
              etat={projection.etat}
              onParametres={o => setSaisieObjectif({ mode: "edition", o })} />
          </Cadre>

          <div style={{ display: "flex", flexDirection: "column", gap: 10,
            minWidth: 0, minHeight: 0 }}>
            {/* ⚠️ **La progression prend sa hauteur naturelle, les constats absorbent le
                reste** — et cet ordre a été inversé une fois. Avec un partage à parts
                égales, la progression manquait de deux pixels et affichait une barre de
                défilement pour rien ; avec la progression en premier servi mais son
                contenu d'origine, c'était l'inverse et les constats tombaient à leur seul
                titre. Après compression des deux, la progression tient en 150 pixels et il
                en reste plus de 200 pour les constats, qui en réclament 185. */}
            <Cadre style={{ padding: "14px 16px", display: "flex",
              flexDirection: "column", flexShrink: 0 }}>
              <ProgressionGlobale objectifs={listeObjectifs} />
            </Cadre>
            {/* ⚠️ Seule carte à défiler, et c'est un arbitrage assumé : les constats sont
                du texte, leur nombre varie avec les paramètres saisis, et les laisser
                pousser la rangée ferait défiler la page entière. Un panneau qui défile
                vaut mieux qu'un écran qui défile. */}
            <Cadre style={{ padding: "14px 16px", display: "flex",
              flexDirection: "column", flex: 1, minHeight: 0, overflowY: "auto" }}>
              <ConstatsObjectif
                objectif={listeObjectifs.find(o => o.id === projeteEffectif) ?? null}
                valeurPortefeuille={objectifs.donnees?.valeur_portefeuille ?? null}
                medianeProjection={projection.projection?.possible
                  ? projection.projection.mediane : null} />
            </Cadre>
          </div>
        </div>

        {/* ── Rangée 3 : la dispersion des tirages ──────────────────────────── */}
        <Cadre style={{ padding: "12px 16px", display: "flex", flexDirection: "column",
          flexShrink: 0 }}>
          <ScenariosObjectif projection={projection.projection} />
        </Cadre>

      </div>{/* fin Vue Objectifs */}

      {/* ⚠️ Monté hors des vues : un formulaire rendu à l'intérieur d'un onglet caché
          par `display: none` reste dans l'arbre mais invisible, et la saisie paraîtrait
          perdue. Ici il se superpose à la page, quelle que soit la vue active. */}
      {saisieObjectif && objectifs.donnees && (
        <FormulaireObjectif
          initial={saisieObjectif.mode === "edition" ? saisieObjectif.o : null}
          anneeNaissanceConnue={objectifs.donnees.annee_naissance_connue}
          erreur={objectifs.erreurEcriture}
          onFermer={() => setSaisieObjectif(null)}
          onEnregistrer={async (saisie: Saisie) => {
            const ok = saisieObjectif.mode === "edition"
              ? await objectifs.modifier(saisieObjectif.o.id, saisie)
              : await objectifs.creer(saisie);
            // ⚠️ On ne ferme que si le serveur a accepté : refermer sur un refus
            // effacerait la saisie et le motif du refus du même geste.
            if (ok) setSaisieObjectif(null);
          }}
          onSupprimer={saisieObjectif.mode === "edition" ? async () => {
            if (await objectifs.supprimer(saisieObjectif.o.id)) setSaisieObjectif(null);
          } : undefined}
        />
      )}

      {/* ══ VUE TRANSACTIONS ════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "transactions" ? "flex" : "none", height: "100%", flexDirection: "column", overflow: "hidden" }}>
        {portfolio && (
          <TransactionsView
            portfolioId={portfolio.id}
            refreshKey={txRefreshKey}
            onNewTransaction={() => setShowTxModal(true)}
            selectionDemandee={operationVisee}
          />
        )}
      </div>

      </div>{/* fin MAIN wrapper */}

      {/* Bottom padding */}
      <div style={{ height: 10, flexShrink: 0 }} />

      {showTxModal && (
        <TransactionModal
          portfolioId={portfolio?.id ?? ""}
          isOpen={showTxModal}
          onClose={() => setShowTxModal(false)}
          onSuccess={() => { setShowTxModal(false); setTxRefreshKey(k => k + 1); }}
        />
      )}
    </div>
  );
}

export default function PortfolioPage() {
  return (
    <Suspense fallback={
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center",
        height: "100vh", background: "var(--novac-bg, #040F22)",
        color: CLAIR.texteFaible, fontSize: 12 }}>
        Chargement…
      </div>
    }>
      <PortfolioPageInner />
    </Suspense>
  );
}
