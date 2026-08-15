"use client";
import { useCallback, useEffect, useLayoutEffect, useState, useMemo, useRef, useId, Suspense } from "react";
import type { ReactNode } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useApp } from "@/lib/AppContext";
import AssetLogo from "@/components/AssetLogo";
import TransactionModal from "@/components/TransactionModal";
import TransactionsView from "@/components/portfolio/TransactionsView";
import AnalyseView from "@/components/portfolio/AnalyseView";
import { createPortal } from "react-dom";
import PanneauActivite from "@/components/portfolio/PanneauActivite";
import RepartitionPavee from "@/components/portfolio/RepartitionPavee";
import { classeEnClair } from "@/lib/pavage";
import PanneauProfil from "@/components/portfolio/PanneauProfil";
import PanneauFrais from "@/components/portfolio/PanneauFrais";
import {
  type Analyse, type EtatAnalyse, type Tolerance,
} from "@/lib/analyse";
import { bandeDuScore, pilierLePlusFaible } from "@/lib/portfolio-score/types";
import PerformanceChart from "@/components/portfolio/PerformanceChart";
import AssetGrid from "@/components/portfolio/AssetGrid";
import CarteCompte, { APERCUS_MAX, CARTE_COMPTE } from "@/components/portfolio/CarteCompte";
import CarteActif from "@/components/portfolio/CarteActif";
import FilAriane from "@/components/portfolio/FilAriane";
import RailHorizontal from "@/components/portfolio/RailHorizontal";
import PortfolioTabs from "@/components/portfolio/PortfolioTabs";
import { donutArcs } from "@/lib/donut";
import { operationsDuDossier, repartirEnDossiers } from "@/lib/dossiers";
import { jouerEtalement, releverLesCartes, type Positions } from "@/lib/etalement";
import { assetClass, compteInfere, valoriser, type Enveloppe, type GridAsset } from "@/lib/portfolio";
import { assetExchange } from "@/lib/assets";
import RadarChart from "@/components/charts/RadarChart";
import { enTetesAuth } from "@/lib/session";
import { typesParOperation, COULEUR_OP, LIBELLE_OP, type Tx } from "@/lib/journal";
import { FONT } from "@/lib/typography";
import type { Period } from "@/lib/chart/portfolioCurve";
import { JETONS, CLAIR, RAYON, couleurMontant, RAYONS, styleCadreExterieur, styleCarteInterieure } from "@/lib/palette";
import { hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb } from "@/lib/couleur";
import { resoudreJeton, useTheme } from "@/lib/theme";
import { useClignotement, styleClignotement } from "@/lib/clignotement";
import { CADENCE_COURS_MS } from "@/lib/cadence";
import { useCoursCrypto, symboleBinance } from "@/lib/coursCrypto";
import Cadre from "@/components/ui/Cadre";
import ChiffresRoulants from "@/components/ui/ChiffresRoulants";
import AvatarPortefeuille from "@/components/portfolio/AvatarPortefeuille";
import AvatarParole from "@/components/AvatarParole";
import FormulaireCompte, { type SaisieCompte } from "@/components/portfolio/FormulaireCompte";
import PaletteDossier from "@/components/portfolio/PaletteDossier";
import CarteBancaire from "@/components/portfolio/CarteBancaire";
import {
  type Compte as CompteDeclare, type GenreCompte, creerCompte, fraicheurDuSolde,
  lireComptes, lireGenres, modifierCompte, rattacherOperations, supprimerCompte,
  listerMouvements, enregistrerMouvement, supprimerMouvement, type Mouvement,
} from "@/lib/comptes";
import JournalCompte from "@/components/portfolio/JournalCompte";
import { BASE_COMPACTE, PLACE_COMPACTE, parleEnContexteDense } from "@/lib/avatarDialogue";
import { useParoleStable } from "@/lib/useParoleStable";
import { useSalutArrivee } from "@/lib/useSalutArrivee";
import { skinParCle } from "@/lib/avatarSkins";
import {
  type FormeAvatar, useCouleurAvatar, useFormeAvatar, useSkinAvatar,
} from "@/lib/useCouleurAvatar";
import { useAvatar } from "@/lib/AvatarContext";
import { etatSelonEcartCourbe } from "@/lib/avatarEtats";
import { useAnalyseEvenements } from "@/hooks/useAnalyseEvenements";
import { useImpactTitre } from "@/hooks/useImpactTitre";
import { useObjectifs, type Saisie } from "@/hooks/useObjectifs";
import { useParametresSuggeres } from "@/hooks/useParametresSuggeres";
import { useProjection } from "@/hooks/useProjection";
import { alerteRepartition, avertissementValeur, euros, type Objectif } from "@/lib/objectifs";
import { useTransparence } from "@/hooks/useTransparence";
import { DividendesAVenir, ProchainsResultats } from "@/components/portfolio/TablesEvenements";
import CalendrierEvenements from "@/components/portfolio/CalendrierEvenements";
import CartesObjectifs from "@/components/portfolio/CartesObjectifs";
import ProjectionObjectif from "@/components/portfolio/ProjectionObjectif";
import ProgressionGlobale from "@/components/portfolio/ProgressionGlobale";
import ConstatsObjectif from "@/components/portfolio/ConstatsObjectif";
import FormulaireObjectif from "@/components/portfolio/FormulaireObjectif";
import EvenementsAVenir from "@/components/portfolio/EvenementsAVenir";
import { HistoriqueEvenements, ImpactPotentiel } from "@/components/portfolio/ImpactEvenements";
import { API_URL } from "@/lib/api";

// ── Types ──────────────────────────────────────────────────────────────────────
type PortfolioAsset = { ticker: string; weight: number };
type PortfolioData  = { id: string; name: string; assets: PortfolioAsset[]; color: string; total_value?: number | null; cost_basis?: number | null; image_url?: string | null;
  /** La couleur choisie pour les dossiers déduits, `{genre: "#RRGGBB"}`. Voir `GENRE_DE`. */
  couleurs_comptes?: Record<string, string> | null };
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

/**
 * ⚠️ **Trois façons d'habiller le même anneau, et elles ne sont pas interchangeables.**
 * `nu` ne rend que le cercle, pour qui pose ses propres chiffres à côté ; `chiffreSeul`
 * met la note au centre et laisse « /100 » et la mention au parent ; par défaut, tout est
 * empilé dedans. La carte d'analyse et le bandeau n'ont pas la même place, et un seul
 * habillage aurait obligé l'un des deux à réécrire l'anneau.
 */
function CircleScore({ score, size = 88, nu = false, chiffreSeul = false }: { score: number; size?: number; nu?: boolean; chiffreSeul?: boolean }) {
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
        {(!nu || chiffreSeul) && (
          <div style={{
            position: "absolute", inset: 0, display: "flex", flexDirection: "column",
            alignItems: "center", justifyContent: "center", pointerEvents: "none",
          }}>
            <span style={{ fontSize: size * 0.30, fontWeight: 800, fontFamily: FONT, color: CLAIR.texte, lineHeight: 1 }}>{score}</span>
            {!chiffreSeul && (
              <span style={{ fontSize: Math.max(8, size * 0.10), color: CLAIR.texteFaible, letterSpacing: "0.04em" }}>/100</span>
            )}
          </div>
        )}
      </div>
      {!nu && !chiffreSeul && <span style={{ fontSize: 11, fontWeight: 700, color, letterSpacing: "0.02em" }}>{scoreLabel(score)}</span>}
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

/**
 * Un montant en euros, aux centimes près.
 *
 * ⚠️ **`euros()` arrondit, et c'est juste pour ce qu'il sert — pas ici.** Il habille des
 * valorisations, qui bougent à chaque cours et dont le centime n'a pas de sens. Un solde de
 * compte est un montant exact que l'épargnant a recopié, et la décomposition d'un total doit
 * pouvoir se vérifier à l'addition. Vu à l'écran : « 4 548 € de titres · 12 451 € de
 * liquidités » sous un total de 16 998,72 €, alors que la somme des deux fait 16 999.
 */
/** La hauteur de l'avatar du portefeuille. */
const DIAMETRE_ROND = 63;

/**
 * Le diamètre de l'anneau de score, **calculé pour ne pas grandir la rangée**.
 *
 * ⚠️ **Ce n'est pas un choix esthétique mais une contrainte de hauteur.** Depuis que la
 * maquette place l'anneau *sous* l'intitulé plutôt qu'à côté, il s'ajoute au titre au lieu
 * de se ranger en face : à 63 px, le bloc mesurait 86 et tirait tout le bandeau de treize
 * pixels — la courbe en dessous perdait d'autant. Le titre fait 17 px et sa marge 6 ; il
 * reste donc 50 px pour tenir dans les 73 du plus haut des autres blocs.
 *
 * ⚠️ **Il ne suit plus l'avatar, et c'est assumé.** Les deux ronds ne se font plus face
 * depuis que l'un est passé sous son titre : les égaler ne rangeait plus rien et coûtait
 * la hauteur du bandeau.
 */
const DIAMETRE_ANNEAU_SCORE = 50;

/**
 * La pastille de la maquette : un aplat plein, encré de la couleur du bandeau.
 *
 * ⚠️ **Pleine, et son texte prend le fond du bandeau plutôt qu'un blanc.** Un blanc fixe
 * aurait tenu sur le vert et le rouge mais serait devenu criard sur l'orange d'une note
 * moyenne ; reprendre la couleur de la carte donne un texte qui semble découpé dans
 * l'aplat, et qui reste juste quel que soit le thème puisqu'il suit le même jeton.
 *
 * ⚠️ **La teinte vient de ce que la pastille dit** — vert pour un gain, rouge pour une
 * perte, orange pour une note à revoir. L'écrire trois fois pour une seule géométrie
 * aurait garanti qu'elles finissent par diverger.
 */
const pastille = (couleur: string): React.CSSProperties => ({
  fontFamily: FONT, fontSize: 11.5, fontWeight: 700, color: CLAIR.carte,
  background: couleur, borderRadius: 999, padding: "3px 9px",
  whiteSpace: "nowrap", lineHeight: 1.2,
  display: "inline-flex", alignItems: "center", gap: 4,
});

/**
 * Le triangle de tendance qui précède le signe dans la pastille de performance.
 *
 * ⚠️ **Il double le signe, et c'est voulu.** Un « + » et un « − » se distinguent mal du
 * coin de l'œil, surtout à 11,5 px : la forme, elle, se lit avant le caractère. La couleur
 * dit déjà la même chose, mais elle seule ne suffit pas — un daltonisme rouge-vert touche
 * environ un homme sur douze, et c'est précisément ce couple-là que la pastille emploie.
 *
 * ⚠️ `currentColor` : le triangle prend l'encre du texte qui l'entoure, donc la couleur du
 * bandeau. Il n'a pas à connaître le sens de la variation, seulement sa forme.
 */
function FlecheTendance({ hausse }: { hausse: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" width={11} height={11} aria-hidden="true"
      style={{ flexShrink: 0 }}>
      {hausse ? (
        <path d="M11.95 2.25c-.49 0-.971.124-1.398.359a2.8 2.8 0 0 0-1.038.984L1.59 16.553a2.75 2.75 0 0 0-.02 2.782c.246.425.601.78 1.03 1.028s.919.382 1.417.387h15.856a2.9 2.9 0 0 0 1.416-.381c.43-.246.787-.599 1.035-1.022a2.75 2.75 0 0 0-.005-2.781L14.386 3.598a2.8 2.8 0 0 0-1.038-.987 2.9 2.9 0 0 0-1.399-.361" />
      ) : (
        <path d="M19.932 3.25H4.077a2.9 2.9 0 0 0-1.416.381c-.43.246-.787.599-1.035 1.022a2.75 2.75 0 0 0 .006 2.781l7.93 12.97c.254.41.611.75 1.038.986a2.9 2.9 0 0 0 2.796.002 2.8 2.8 0 0 0 1.04-.983L22.36 7.45a2.75 2.75 0 0 0 .02-2.785 2.8 2.8 0 0 0-1.032-1.028 2.9 2.9 0 0 0-1.416-.386" />
      )}
    </svg>
  );
}

const montantExact = (v: number): string =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €";

/**
 * Ce que l'œil barré remplace : la même chose partout.
 *
 * ⚠️ **Un seul motif pour tous les montants cachés.** Le grand chiffre du bandeau et les
 * montants des dossiers étaient masqués par deux écritures indépendantes — la première
 * existait, la seconde manquait, et le geste ne cachait donc que la moitié de l'écran.
 * Les faire passer par la même fonction est ce qui empêche qu'un montant soit oublié la
 * prochaine fois qu'on en ajoute un.
 *
 * ⚠️ **Toujours quatre points, quel que soit le montant.** Un masque proportionnel au
 * nombre de chiffres dirait l'ordre de grandeur — cacher 12 € et 1 200 000 € par des
 * traînées de longueurs différentes revient à ne pas les cacher.
 */
const MONTANT_MASQUE = "•••• €";
const montantSelonMasque = (v: number, masque: boolean): string =>
  masque ? MONTANT_MASQUE : montantExact(v);

/**
 * Ce qu'un dossier annonce sur son panneau : une somme, puis ce qu'elle recouvre.
 *
 * ⚠️ **Écrit une fois pour les deux sortes de dossiers.** Un compte déclaré annonce son
 * solde, un compte déduit la valeur de ses lignes — mais les deux tiennent la même place
 * dans la même rangée, et deux jeux de styles recopiés auraient divergé au premier
 * ajustement. Une rangée où le même rôle se dit en deux tailles se lit comme deux objets
 * différents.
 *
 * ⚠️ **`tabular-nums` sur le montant.** Les dossiers sont côte à côte : sans chasse fixe,
 * les chiffres de l'un ne s'alignent pas sur ceux de l'autre, et la rangée tremble à chaque
 * cours qui bouge.
 */
const ANNONCE_DOSSIER = {
  montant: {
    fontFamily: FONT, fontSize: 21, fontWeight: 700,
    color: "#FFFFFF", letterSpacing: "-0.015em", lineHeight: 1.15,
    fontVariantNumeric: "tabular-nums",
  },
  mention: { fontSize: 11, color: "rgba(255,255,255,0.68)", marginTop: 1 },
} as const;

/**
 * L'écart entre le personnage, sa parole et le nom du portefeuille, en pixels.
 *
 * ⚠️ **Nommé parce qu'il sert deux fois et doit rester le même.** Il espace la rangée
 * d'identité *et* il est le retrait intérieur de la case où la parole s'ouvre : sans quoi,
 * cette case apparaîtrait collée à la tête ou décalerait le nom d'un pixel de plus qu'avant.
 * Deux valeurs séparées auraient divergé au premier ajustement.
 */
const ECART_IDENTITE = 11;
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
  /**
   * La couleur de l'avatar, tenue par la page.
   *
   * ⚠️ **Une seule source pour deux usages** : la tête du personnage et la courbe de
   * performance. Deux couleurs pour un même portefeuille sur un même écran se liraient
   * comme un défaut, et deux états séparés auraient fini par diverger.
   */
  const [couleurAvatar, choisirCouleurAvatar] = useCouleurAvatar(portfolio);
  // ⚠️ La forme ne va qu'à l'avatar, là où la couleur va aussi à la courbe : une courbe
  // ne peut pas être carrée, et rien d'autre sur la page ne porte de silhouette.
  const [formeAvatar, choisirFormeAvatar] = useFormeAvatar(portfolio);
  const [skinAvatar, choisirSkinAvatar] = useSkinAvatar(portfolio);

  /**
   * ⚠️ **Changer de forme retire l'habillage qui n'y survivrait pas.** La Terre est un
   * dessin plat détouré par la silhouette : détourée par un triangle, elle n'est plus un
   * globe. Le panneau la retire de ses choix, mais le réglage peut déjà être posé — il
   * faut donc aussi le défaire, sinon la tête garderait une carte du monde impossible.
   */
  /**
   * ⚠️ **Choisir un habillage *propose* sa couleur, comme sur le banc d'essai.** La
   * pastille du panneau montre le globe dans son bleu ; sans cette proposition, on
   * cliquerait une planète bleue pour obtenir une planète rose — la mer prenant la
   * couleur du portefeuille. Ce n'est qu'une proposition : la palette reste ouverte
   * juste au-dessus, et l'uni ne touche à rien puisqu'il n'habille pas.
   */
  const choisirSkin = useCallback((v: string) => {
    choisirSkinAvatar(v);
    const s = skinParCle(v);
    if (v !== "uni") choisirCouleurAvatar(s.palette.tete);
  }, [choisirSkinAvatar, choisirCouleurAvatar]);

  const choisirForme = useCallback((v: FormeAvatar) => {
    choisirFormeAvatar(v);
    if (v !== "sphere" && skinParCle(skinAvatar).rond) choisirSkinAvatar("uni");
  }, [choisirFormeAvatar, choisirSkinAvatar, skinAvatar]);

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
  /**
   * Les comptes **déclarés**, à côté de ceux que l'on devine.
   *
   * ⚠️ **Les deux coexistent, et il faut que les deux coexistent.** `comptes` plus bas
   * range les lignes par déduction, d'après leur place de cotation ; aucun portefeuille
   * existant n'a de compte déclaré, et les priver de ce rangement les laisserait en vrac
   * du jour au lendemain. Ce qui est déclaré s'affiche en plus, pas à la place.
   */
  const [comptesDeclares, setComptesDeclares] = useState<CompteDeclare[]>([]);
  const [genresCompte,    setGenresCompte]    = useState<GenreCompte[]>([]);
  const [formCompte,      setFormCompte]      = useState(false);
  /** Le compte en cours de correction, ou `null` quand on en déclare un nouveau. */
  const [renomme,         setRenomme]         = useState(false);
  const [nomSaisi,        setNomSaisi]        = useState("");
  const [compteEdite,     setCompteEdite]     = useState<CompteDeclare | null>(null);
  /**
   * Le dossier **déduit** dont on règle la couleur, désigné par sa clé préfixée.
   *
   * ⚠️ **La clé, et non le dossier lui-même.** Les dossiers se reconstruisent à chaque
   * cours reçu : garder l'objet aurait figé une copie, et la palette aurait montré la
   * couleur d'il y a quinze secondes après un premier choix.
   */
  const [dossierAColorer, setDossierAColorer] = useState<string | null>(null);
  /**
   * Ce que le formulaire porte quand il sert à **déclarer un dossier deviné** : les valeurs
   * de départ, et les opérations à ranger dans le compte une fois créé.
   *
   * ⚠️ **Séparé de `compteEdite`, qui ne désigne qu'une correction.** Confondre les deux
   * aurait fait proposer de supprimer un compte qui n'existe pas encore.
   */
  const [prereglage,      setPrereglage]      = useState<SaisieCompte | null>(null);
  /** La saisie a-t-elle été ouverte **depuis** un dossier, ou depuis l'onglet Transactions ? */
  const [saisieDansLeDossier, setSaisieDansLeDossier] = useState(false);
  const [aRattacher,      setARattacher]      = useState<number[]>([]);
  const [compteEnCours,   setCompteEnCours]   = useState(false);
  const [erreurCompte,    setErreurCompte]    = useState<string | null>(null);
  /**
   * Le journal de trésorerie du compte en cours de correction.
   *
   * ⚠️ **Chargé à l'ouverture de l'écran, pas avec les comptes.** Les comptes sont relus à
   * chaque cours reçu, toutes les dix secondes ; y accrocher un appel par compte aurait
   * multiplié les requêtes pour une liste que personne ne regarde la plupart du temps.
   */
  const [journal,         setJournal]         = useState<Mouvement[]>([]);
  const [journalEnCours,  setJournalEnCours]  = useState(false);
  const [erreurJournal,   setErreurJournal]   = useState<string | null>(null);
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
  /**
   * Le journal brut, gardé entier plutôt que réduit tout de suite aux repères.
   *
   * ⚠️ **Il portait déjà le rangement des lignes, et on le jetait au `.map`.** Chaque
   * écriture dit son `compte_id` depuis toujours ; l'effet n'en retenait que la date, le
   * type et le montant pour la courbe. Savoir quelle ligne appartient à quel dossier ne
   * coûte donc aucune requête de plus — seulement de ne plus perdre ce qui est déjà là.
   */
  const [ecritures, setEcritures] = useState<Tx[]>([]);
  /**
   * Le journal est-il arrivé ?
   *
   * ⚠️ **Sans lui, aucune ligne ne *paraît* rattachée — et ce n'est pas la même chose que
   * de ne pas l'être.** Une liste vide se lit comme « rien n'est rangé » : les comptes
   * déclarés s'affichent alors à « Aucun actif » et les dossiers devinés reparaissent à
   * côté d'eux, pleins. Vu à l'écran quelques secondes après chaque rechargement, un
   * compte déclaré vide en vis-à-vis du dossier deviné qu'il venait de remplacer. Une
   * répartition qu'on va contredire deux secondes plus tard vaut moins que pas de
   * répartition du tout.
   */
  const [journalArrive, setJournalArrive] = useState(false);
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
  /** Ce que le portefeuille permet de proposer au formulaire — mesures seulement. */
  const suggestions = useParametresSuggeres(portfolio?.id);

  /** Écriture désignée en cliquant un repère du graphique. */
  const [operationVisee, setOperationVisee] = useState<number | null>(null);

  useEffect(() => {
    const id = portfolio?.id;
    // ⚠️ Un portefeuille valorisé en poids n'a aucune écriture : la liste vide est le fait
    // juste, et non un chargement manqué. Tout y est rangé par déduction, et le journal
    // compte comme arrivé d'emblée.
    if (!id || !surTransactions) { setEcritures([]); setJournalArrive(true); return; }
    setJournalArrive(false);
    let annule = false;
    fetch(`${API_URL}/api/v1/portfolios/${id}/transactions`, { headers: enTetesAuth() })
      .then(r => (r.ok ? r.json() : null))
      .then((d) => {
        if (annule) return;
        setEcritures(Array.isArray(d) ? d : (d?.transactions ?? []));
        setJournalArrive(true);
      })
      // ⚠️ Un journal qu'on n'a pas pu lire compte comme arrivé : sinon la rangée resterait
      // en attente pour toujours, et l'on ne verrait plus aucun dossier du tout.
      .catch(() => { if (!annule) { setEcritures([]); setJournalArrive(true); } });
    return () => { annule = true; };
  }, [portfolio?.id, surTransactions, txRefreshKey]);

  /**
   * Les repères posés sur la courbe, dérivés du journal.
   *
   * ⚠️ **Dérivés et non stockés.** Deux états à tenir d'accord — le journal et sa
   * réduction — se seraient désynchronisés au premier chemin d'erreur qui vide l'un sans
   * l'autre. Le calcul est celui d'avant, déplacé.
   */
  const reperesOperations = useMemo(() => {
    const types = typesParOperation(ecritures);
    return ecritures.map(t => ({
      id: t.id, ticker: t.ticker, executed_at: t.executed_at,
      // ⚠️ Le compte accompagne le repère : en vue par compte, le graphique ne montre
      // que les écritures du compte regardé. Sans lui, un achat fait au CTO se serait
      // posé sur la courbe du PEA.
      compte_id: t.compte_id ?? null,
      type: types[t.id], couleur: COULEUR_OP[types[t.id]], libelle: LIBELLE_OP[types[t.id]],
      // Quantité, prix et frais : lus par l'encart de survol du graphique, qui détaille
      // l'écriture sous le curseur. Sans eux il ne pourrait annoncer qu'un libellé et une date.
      quantity: t.quantity, unit_price: t.unit_price, fees: t.fees ?? 0,
    }));
  }, [ecritures]);

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
  /**
   * Ce que valent les **titres**, et rien d'autre.
   *
   * ⚠️ **C'est cette grandeur, et non le total, qui mesure une performance.** Le gain vaut
   * « valeur moins prix de revient » : y verser les liquidités d'un livret ferait passer
   * cinq mille euros d'épargne pour cinq mille euros de plus-value. La variation du jour a
   * le même défaut à l'envers — des espèces ne varient pas, et les compter au dénominateur
   * diluerait la performance des titres sans que rien ne le dise. Le nom porte donc la
   * distinction : tout ce qui compare, escompte ou projette lit celle-ci.
   */
  const valeurTitres = valeurTotaleBrute != null ? valeurTotaleBrute + ecartCrypto : null;

  /**
   * Les liquidités déclarées sur les comptes de ce portefeuille.
   *
   * ⚠️ **Seulement celles qu'on a dites.** Un compte sans solde saisi n'en déclare pas
   * zéro : il n'en déclare aucune, et le serveur distingue les deux. Les additionner comme
   * des zéros reviendrait à affirmer qu'un PEA n'a pas d'espèces parce qu'on ne les a pas
   * renseignées.
   *
   * ⚠️ **Aucun double compte.** Sur un compte à titres, le champ est explicitement les
   * *espèces non investies* : elles ne sont dans aucune ligne, donc dans aucune
   * valorisation. Sur un compte de trésorerie, il n'y a pas de ligne du tout.
   */
  const liquiditesDeclarees = useMemo(
    () => comptesDeclares.reduce((s, c) => s + (c.solde ?? 0), 0),
    [comptesDeclares],
  );

  /**
   * Ce que vaut le patrimoine du portefeuille : les titres **plus** les liquidités.
   *
   * ⚠️ **Le grand chiffre de la bande, et lui seul.** C'est ce qu'on possède, ce qui est la
   * question que pose « Valeur totale ». Tout le reste — gains, variation, projection —
   * continue de lire `valeurTitres`, faute de quoi l'épargne se lirait comme un résultat.
   */
  const valeurTotale = valeurTitres != null
    ? valeurTitres + liquiditesDeclarees
    : (liquiditesDeclarees > 0 ? liquiditesDeclarees : null);

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
  /** Le dossier déplié, ou `null` quand la grille montre tout. */
  const [compteOuvert, setCompteOuvert] = useState<string | null>(null);

  /**
   * La couleur retenue pour chaque dossier déduit, telle que le serveur la garde.
   *
   * ⚠️ **Dérivée du portefeuille, et non copiée dans un état.** Un second état aurait dû
   * se resynchroniser à chaque rechargement, et c'est le genre de fil qui se casse
   * silencieusement : l'écran garderait une couleur que le serveur a oubliée. Le repli sur
   * `{}` est mémorisé, faute de quoi il rendrait un objet neuf à chaque rendu et
   * recalculerait les dossiers pour rien.
   */
  const couleursChoisies = useMemo<Record<string, string>>(
    () => portfolio?.couleurs_comptes ?? {},
    [portfolio?.couleurs_comptes],
  );

  /**
   * Les dossiers de la rangée : les comptes déclarés, puis ce qui reste à deviner.
   *
   * ⚠️ **Une seule liste, d'une seule forme.** Les deux sortes vivaient dans deux `.map`
   * du rendu, aux propriétés différentes — et rien n'empêchait une ligne rattachée de
   * rester dans son dossier deviné, comptée des deux côtés. Le rangement est parti dans
   * `dossiers.ts`, où un test exige que la somme des dossiers redonne la valeur totale.
   *
   * ⚠️ **La couleur d'un dossier deviné vient du portefeuille, celle d'un compte déclaré
   * de sa propre colonne.** Deux sources pour deux objets qui peuvent tous deux s'appeler
   * « PEA » — d'où une couleur **déjà résolue** ici plutôt qu'un choix laissé au rendu.
   *
   * ⚠️ **Le côté deviné reste typé sur `Enveloppe` jusqu'ici.** C'est ce qui fait refuser
   * la compilation si `compteInfere` gagne une quatrième enveloppe sans dossier : sans
   * cela, des actifs quitteraient la page en silence. Seul le résultat s'élargit.
   */
  const dossiers = useMemo(
    () => repartirEnDossiers({
      lignes: enriched,
      ecritures,
      declares: comptesDeclares,
      deduire: t => compteInfere(t, assetExchange),
      couleurDeduite: e => couleursChoisies[GENRE_DE[e as Enveloppe]]
        ?? HABILLAGE_COMPTES[e as Enveloppe].couleur,
      nomDeduit: e => e,
      genreDeduit: e => GENRE_DE[e as Enveloppe],
      ordreDeduits: ORDRE_COMPTES,
    }),
    [enriched, ecritures, comptesDeclares, couleursChoisies],
  );

  /**
   * Les lignes que la page montre : le dossier ouvert, ou tout.
   *
   * ⚠️ **Calculé une fois, pas à chaque endroit qui affiche des lignes.** La grille en
   * cartes et le tableau en liste montrent le même portefeuille sous deux formes ; le
   * filtre appliqué à la seule grille aurait fait mentir la bascule — on ouvre un
   * dossier, on passe en liste, et les autres comptes reviennent sans prévenir.
   */
  /**
   * Le dossier réellement ouvert.
   *
   * ⚠️ **Dérivé, parce que les dossiers se recalculent sous lui.** Vendre la dernière ligne
   * d'un dossier deviné le fait disparaître de la liste ; l'état, lui, continuerait de le
   * désigner, et la page afficherait un chemin vers un dossier qui n'existe plus, au-dessus
   * d'une grille vide. On retombe alors sur la rangée.
   *
   * ⚠️ **La garde a changé de sens depuis que les comptes déclarés sont là.** Elle valait
   * aussi « le dossier n'est pas vide », puisqu'un dossier deviné vide n'est jamais
   * construit. Un compte déclaré vide, lui, existe et s'ouvre légitimement : l'épargnant
   * l'a déclaré. La garde ne protège donc plus que contre la **disparition** — un compte
   * supprimé pendant qu'il était ouvert.
   */
  const dossierActif = compteOuvert != null
    ? (dossiers.find(d => d.cle === compteOuvert) ?? null) : null;
  const compteActif = dossierActif?.cle ?? null;

  /**
   * Les cartes telles qu'elles étaient **avant** le changement d'écran.
   *
   * ⚠️ **Relevées dans le gestionnaire de clic, pas dans un effet.** Ouvrir un dossier
   * remplace la rangée par la grille : le temps qu'un effet s'exécute, l'ancien écran
   * n'existe plus et il n'y a plus rien à mesurer. Le seul instant où les deux positions
   * sont connaissables est celui du geste — juste avant de changer d'état.
   *
   * ⚠️ **Une référence et non un état** : la remplir ne doit provoquer aucun rendu, sans
   * quoi on mesurerait le nouvel écran au lieu de l'ancien.
   */
  const cartesAvant = useRef<Positions>(new Map());
  const zoneDesCartes = useRef<HTMLDivElement>(null);

  /** Retient où sont les cartes, puis laisse l'appelant changer d'écran. */
  const releverPuis = useCallback((suite: () => void) => {
    cartesAvant.current = releverLesCartes(zoneDesCartes.current);
    suite();
  }, []);

  /**
   * ⚠️ **`useLayoutEffect`, et non `useEffect`.** L'animation part de la position d'avant :
   * jouée après que le navigateur a peint, on verrait d'abord les cartes à leur place
   * définitive, puis sauter en arrière pour revenir. C'est exactement le défaut qu'on
   * cherche à supprimer.
   *
   * ⚠️ **Le relevé se vide après usage.** Sans cela, un rendu ultérieur — un cours qui
   * bouge, un tri qu'on change — rejouerait l'étalement à partir de positions périmées.
   */
  useLayoutEffect(() => {
    if (cartesAvant.current.size === 0) return;
    jouerEtalement(cartesAvant.current, zoneDesCartes.current);
    cartesAvant.current = new Map();
  }, [compteActif]);

  /**
   * La nature de chaque titre, prise dans le journal.
   *
   * ⚠️ **Le champ `type` d'une ligne n'est jamais rempli, et personne ne s'en apercevait.**
   * `enriched` le déclare mais aucune source ne l'alimente : les positions du serveur ne le
   * portent pas. Toute la page retombait donc sur `assetClass`, qui reconnaît les fonds à
   * une liste de tickers écrite en dur — sans un seul ETF européen. Vu à l'écran : un
   * portefeuille de trois trackers de Paris annoncé « Actions 100 % ».
   *
   * ⚠️ **Le journal, lui, le sait** : c'est la nature choisie au moment de la saisie, et
   * elle est déjà chargée. Un portefeuille valorisé en poids n'a pas d'écritures et retombe
   * sur la déduction, ce qui est le mieux qu'on puisse faire pour lui.
   */
  const typeParTicker = useMemo(() => {
    const par: Record<string, string> = {};
    for (const e of ecritures) if (e.asset_type) par[e.ticker] ??= e.asset_type;
    return par;
  }, [ecritures]);

  const lignesMontrees = useMemo(
    () => (dossierActif ? dossierActif.lignes : enriched),
    [dossierActif, enriched],
  );

  const [survolCourbe, setSurvolCourbe] =
    useState<{ valeur: number; date: string; investi?: number; liquidites?: number } | null>(null);

  /**
   * La valeur des seuls titres à la date survolée.
   *
   * ⚠️ **Le gain se calcule sur ce qui a travaillé, jamais sur le patrimoine.** La courbe
   * trace titres plus épargne déclarée ; retrancher de ce total le seul capital investi en
   * titres faisait passer les liquidités pour une performance — relevé à l'écran,
   * « +5 623,41 € (+145,44 %) » sur un portefeuille qui n'avait rien gagné de tel. C'est
   * exactement ce que le projet refuse : verser sur un livret n'est pas un résultat.
   */
  const titresSurvoles = survolCourbe
    ? survolCourbe.valeur - (survolCourbe.liquidites ?? 0)
    : null;

  /**
   * L'avatar réagit au point de la courbe qu'on survole.
   *
   * ⚠️ **À l'écart avec la performance du jour, pas à la performance absolue.** Sur une
   * fenêtre longue, tout point vaut des dizaines de pour cent : mesurée dans l'absolu,
   * la courbe serait « étonnante » d'un bout à l'autre et le visage ne distinguerait
   * plus rien. Comparé à là où le portefeuille en est aujourd'hui, le même chiffre
   * redevient parlant — le regard s'éclaire sur les sommets et s'assombrit dans les
   * creux, ce qui est précisément ce qu'on cherche en promenant le curseur.
   *
   * ⚠️ Passe par `pointer` et non par un attribut `data-avatar` : celui-ci n'est relu
   * qu'à l'**entrée** dans un élément, alors qu'ici le pointeur reste sur le même
   * graphique pendant que la valeur change sous lui. Et par un canal distinct de
   * `exprimer`, pour ne pas effacer la mimique d'une carte survolée en même temps.
   */
  const { pointer, expression, exprimer } = useAvatar();
  /**
   * ⚠️ **La parole attend que l'état se pose ; la mimique, non.** Le visage peut changer
   * vite — c'est ce qui le fait vivre. Des mots au même rythme se lisent comme un défaut :
   * mesuré ici, la relecture des cours met l'avatar au travail quatre cents millisecondes
   * toutes les quinze secondes, et « zzZ » cédait la place à « Je regarde » puis la
   * reprenait en boucle. Voir `useParoleStable`, qui laisse passer les ponctuels aussitôt et
   * fait patienter les soutenus.
   */
  const expressionParlee = useParoleStable(expression.cle);
  /**
   * Le salut de l'arrivée : il ne vient pas du répertoire d'expressions, parce qu'arriver
   * n'est pas un état du visage. Voir `useSalutArrivee`.
   */
  const { salue, nom: nomCompte } = useSalutArrivee();
  /**
   * Ce que le personnage dit, s'il dit quelque chose.
   *
   * ⚠️ **L'événement passe devant la politesse.** Si le personnage a une réaction à donner —
   * une erreur, un succès — au moment même où il saluait, c'est elle qui compte : un bonjour
   * qui recouvrirait un échec serait la pire des deux paroles. Le salut n'occupe donc que le
   * silence.
   */
  const paroleAffichee = parleEnContexteDense(expressionParlee)
    ? { cle: expressionParlee, nom: null as string | null }
    : salue ? { cle: "content", nom: nomCompte }
    : null;
  /**
   * ⚠️ **Le thème est lu ici parce que la parole se corrige dans les deux sens.** La couleur
   * du personnage doit s'éclaircir sur un fond sombre et s'assombrir sur un fond clair ; et
   * son ton retenu se calibre en mesurant son contraste avec le fond *réel* de la carte, pas
   * avec une supposition.
   */
  const theme = useTheme();

  useEffect(() => {
    if (!survolCourbe || survolCourbe.investi == null || survolCourbe.investi <= 0) {
      pointer(null);
      return;
    }
    // ⚠️ Les liquidités sont retranchées ici aussi : sans cela, l'avatar réagissait à une
    // performance qui n'existait pas, celle de l'épargne comptée comme un gain.
    const titres = survolCourbe.valeur - (survolCourbe.liquidites ?? 0);
    const pctSurvol = (titres - survolCourbe.investi) / survolCourbe.investi * 100;
    const pctActuel = prixDeRevient != null && prixDeRevient > 0 && valeurTitres != null
      ? (valeurTitres - prixDeRevient) / prixDeRevient * 100 : 0;
    pointer(etatSelonEcartCourbe(pctSurvol - pctActuel));
  }, [survolCourbe, valeurTitres, prixDeRevient, pointer]);

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
      : (valeurTitres != null && weightedChange != null
          ? {
              eur: weightedChange > -100
                ? valeurTitres - valeurTitres / (1 + weightedChange / 100)
                : valeurTitres,
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

  /**
   * Une ligne du portefeuille, telle qu'une carte d'actif l'attend.
   *
   * ⚠️ Sortie de la boucle de la grille parce que l'aperçu des dossiers montre les
   * mêmes cartes : deux conversions séparées auraient fini par afficher deux valeurs
   * différentes pour la même ligne.
   */
  const versCarte = useCallback((a: typeof enriched[number]): GridAsset => ({
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
  }), [sparkHistory, assetSparks, priceUpdatedAt]);

  /**
   * ⚠️ **Le personnage ne parle que de ce qui aboutit, et il faut donc savoir si ça aboutit.**
   * L'appel avalait son échec — `.catch(() => {})` — et posait la valeur locale dans tous les
   * cas. Branché tel quel, l'avatar aurait annoncé « C'est fait ! » sur un enregistrement
   * refusé : la seule chose pire que se taire est de rassurer à tort. On lit donc `ok`.
   *
   * ⚠️ **Ce qui reste et qu'il faut savoir : la valeur locale est toujours posée, même en
   * échec.** C'était le comportement d'avant, et le corriger demande de décider ce que
   * l'écran montre entre-temps — ce n'est pas le sujet ici. En attendant, « Aïe. » est le
   * seul endroit de l'interface qui dise que rien n'a été enregistré.
   */
  /**
   * ⚠️ **Les deux lectures sont indépendantes, et un échec ne doit pas emporter l'autre.**
   * Les genres sont une constante publique ; les comptes demandent une session. Hors
   * session, la seconde échoue et c'est normal — l'écran retombe alors sur le rangement par
   * déduction, qui n'a jamais eu besoin de compte. Les enchaîner aurait fait disparaître le
   * formulaire pour tout le monde dès que la liste des comptes n'arrive pas.
   */
  useEffect(() => {
    let vivant = true;
    lireGenres().then(g => { if (vivant) setGenresCompte(g); }).catch(() => {});
    return () => { vivant = false; };
  }, []);

  const idPortefeuille = portfolio?.id;
  const rechargerComptes = useCallback(() => {
    if (!idPortefeuille) return;
    lireComptes(String(idPortefeuille))
      .then(setComptesDeclares)
      .catch(() => setComptesDeclares([]));
  }, [idPortefeuille]);

  useEffect(() => { rechargerComptes(); }, [rechargerComptes]);

  /**
   * Recolorer un dossier déduit.
   *
   * ⚠️ **La carte entière part, pas la seule teinte qui change.** Le serveur remplace le
   * champ au lieu de le fusionner — c'est ce qui permet de *retirer* une couleur, en
   * renvoyant la carte sans elle. Un envoi partiel n'aurait jamais rien su effacer.
   *
   * ⚠️ **L'écran change d'abord, et se dédit si l'envoi échoue.** Une pastille qui attend
   * l'aller-retour paraît morte ; une pastille qui ment est pire. On garde donc l'état
   * précédent pour le remettre, plutôt que de laisser l'écran affirmer ce que le serveur
   * ignore.
   */
  const recolorerLeDossier = useCallback(async (genre: string, hex: string | null) => {
    const id = portfolio?.id;
    if (!id) return;
    const avant = couleursChoisies;
    const suivantes = { ...avant };
    if (hex) suivantes[genre] = hex;
    else delete suivantes[genre];
    setPortfolio(p => (p ? { ...p, couleurs_comptes: suivantes } : p));
    try {
      const r = await fetch(`${API_URL}/api/v1/portfolios/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...enTetesAuth() },
        body: JSON.stringify({ couleurs_comptes: suivantes }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      setPortfolio(p => (p ? { ...p, couleurs_comptes: avant } : p));
    }
  }, [portfolio?.id, couleursChoisies]);

  /**
   * Ouvrir la correction d'un compte déclaré.
   *
   * ⚠️ **Une fabrique, parce que deux commandes mènent au même écran.** La carte entière et
   * les trois points de son coin ouvrent la même correction ; deux fermetures recopiées
   * auraient fini par diverger — l'une remettant l'erreur à zéro, l'autre non, selon
   * laquelle on aurait touchée en dernier.
   */
  const ouvrirLaCorrection = useCallback((c: CompteDeclare) => () => {
    setErreurCompte(null);
    setCompteEdite(c);
    // ⚠️ Le préréglage d'une déclaration se défait ici. Vu à l'écran : après avoir déclaré
    // le PEA, rouvrir sa correction affichait encore « Déclarer votre PEA » en titre. Un
    // état qu'on ne pose qu'à l'ouverture doit se retirer à toutes les autres.
    setPrereglage(null);
    setARattacher([]);
    setFormCompte(true);
  }, []);

  const enregistrerLeCompte = useCallback(async (saisie: SaisieCompte) => {
    if (!idPortefeuille) return;
    setCompteEnCours(true);
    setErreurCompte(null);
    try {
      /**
       * ⚠️ **Corriger et déclarer suivent le même chemin, à la route près.** Deux fonctions
       * auraient divergé sur le rechargement, sur la fermeture — et c'est précisément la
       * moitié rarement exercée qui aurait pris du retard.
       */
      if (compteEdite) {
        await modifierCompte(String(idPortefeuille), compteEdite.id, saisie);
      } else {
        const cree = await creerCompte(String(idPortefeuille), saisie);
        /**
         * ⚠️ **Le rattachement suit la création, en deux appels, et son échec se dit.** Le
         * second peut manquer après le succès du premier : on aurait alors un compte déclaré
         * vide à côté du dossier deviné toujours plein, ce qui se rattrape — mais pas si
         * personne ne l'apprend. Le formulaire reste donc ouvert avec le message. Tout
         * fondre dans la création aurait supprimé ce cas, au prix d'une route qui fait deux
         * choses et d'un rattachement qu'il faut de toute façon pouvoir demander seul.
         */
        if (aRattacher.length > 0) {
          try {
            await rattacherOperations(String(idPortefeuille), cree.id, aRattacher);
          } catch {
            rechargerComptes();
            setTxRefreshKey(k => k + 1);
            setErreurCompte(
              "Le compte a été créé, mais ses lignes n'ont pas pu y être rattachées.");
            return;
          }
          setTxRefreshKey(k => k + 1);
        }
      }
      rechargerComptes();
      setFormCompte(false);
      setCompteEdite(null);
      setPrereglage(null);
      setARattacher([]);
    } catch (e) {
      setErreurCompte(e instanceof Error ? e.message : "Le compte n'a pas pu être enregistré.");
    } finally {
      setCompteEnCours(false);
    }
  }, [idPortefeuille, compteEdite, aRattacher, rechargerComptes]);

  /**
   * Déclarer un dossier deviné : le formulaire s'ouvre prérempli, et retiendra ses lignes.
   *
   * ⚠️ **Les identifiants d'opération sont figés à l'ouverture, pas relus à l'envoi.** Le
   * journal se recharge sous le formulaire ; rattacher ce qu'il contient au moment de
   * valider prendrait des lignes que l'épargnant n'a pas vu annoncer — la palette lui a dit
   * « ses 3 lignes seront rattachées », et c'est ces trois-là qui doivent partir.
   */
  /**
   * Déclare un dossier deviné sans passer par le formulaire, et rend l'identifiant du
   * compte créé.
   *
   * ⚠️ **Le même geste que le formulaire, sans l'écran.** La saisie d'une opération propose
   * les dossiers devinés : les choisir doit les déclarer sur place, faute de quoi il
   * faudrait sortir de la saisie, déclarer, et y revenir. Le nom retenu est celui de
   * l'enveloppe — « PEA » — et se corrige ensuite par les trois points ; c'est dit à
   * l'écran avant l'enregistrement.
   *
   * ⚠️ **Si le rattachement échoue, on garde quand même le compte.** L'opération qu'on est
   * en train de saisir a besoin d'un compte : refuser ici la ferait perdre. Les lignes non
   * rattachées restent devinées, ce qui se rattrape en déclarant à nouveau.
   */
  const declarerMaintenant = useCallback(async (cle: string): Promise<string> => {
    const d = dossiers.find(x => x.cle === cle);
    if (!d) throw new Error("Ce dossier n'existe plus.");
    const cree = await creerCompte(String(idPortefeuille), {
      nom: d.nom, genre: d.genre, couleur: d.couleur, solde: null,
    });
    const operations = operationsDuDossier(d, ecritures);
    if (operations.length > 0) {
      try {
        await rattacherOperations(String(idPortefeuille), cree.id, operations);
      } catch { /* le compte existe : l'opération en cours a de quoi se ranger */ }
    }
    rechargerComptes();
    return cree.id;
  }, [dossiers, ecritures, idPortefeuille, rechargerComptes]);

  const declarerLeDossier = useCallback((cle: string) => {
    const d = dossiers.find(x => x.cle === cle);
    if (!d) return;
    setARattacher(operationsDuDossier(d, ecritures));
    setPrereglage({ nom: d.nom, genre: d.genre, couleur: d.couleur, solde: null });
    setDossierAColorer(null);
    setErreurCompte(null);
    setCompteEdite(null);
    setFormCompte(true);
  }, [dossiers, ecritures]);

  /**
   * Le journal du compte en correction : chargé à l'ouverture, vidé à la fermeture.
   *
   * ⚠️ **Seulement pour un compte qui a un solde.** Un mouvement se retranche du solde
   * actuel pour remonter le temps ; le serveur refuse d'en enregistrer un sans solde, et
   * afficher un journal vide sous un champ vide n'aurait proposé qu'une impasse.
   */
  useEffect(() => {
    if (!idPortefeuille || !compteEdite || compteEdite.solde == null) {
      setJournal([]); setErreurJournal(null);
      return;
    }
    let annule = false;
    listerMouvements(idPortefeuille, compteEdite.id)
      .then(m => { if (!annule) setJournal(m); })
      .catch(() => { if (!annule) setJournal([]); });
    return () => { annule = true; };
  }, [idPortefeuille, compteEdite]);

  /**
   * Enregistre un versement ou un retrait.
   *
   * ⚠️ **Le compte rendu par la route remplace celui qu'on éditait.** Son solde a changé —
   * c'est tout l'intérêt du geste — et sans cette reprise, le champ « solde » du
   * formulaire aurait continué d'afficher l'ancien montant juste au-dessus du mouvement
   * qui vient de le démentir.
   */
  const verserSurLeCompte = useCallback(async (
    m: { date: string; montant: number; note: string | null },
  ) => {
    if (!idPortefeuille || !compteEdite) return;
    setJournalEnCours(true); setErreurJournal(null);
    try {
      const r = await enregistrerMouvement(idPortefeuille, compteEdite.id, m);
      setJournal(j => [r.mouvement, ...j]);
      setCompteEdite(r.compte);
      rechargerComptes();
    } catch (e) {
      setErreurJournal(e instanceof Error ? e.message : "Le mouvement n'a pas pu être enregistré.");
    } finally {
      setJournalEnCours(false);
    }
  }, [idPortefeuille, compteEdite, rechargerComptes]);

  const retirerUnMouvement = useCallback(async (id: string) => {
    if (!idPortefeuille || !compteEdite) return;
    setJournalEnCours(true); setErreurJournal(null);
    try {
      const r = await supprimerMouvement(idPortefeuille, compteEdite.id, id);
      setJournal(j => j.filter(x => x.id !== id));
      setCompteEdite(r.compte);
      rechargerComptes();
    } catch (e) {
      setErreurJournal(e instanceof Error ? e.message : "Le mouvement n'a pas pu être supprimé.");
    } finally {
      setJournalEnCours(false);
    }
  }, [idPortefeuille, compteEdite, rechargerComptes]);

  /**
   * Enregistre le nouveau nom du portefeuille.
   *
   * ⚠️ **Le nom est posé à l'écran avant la réponse du serveur.** Renommer est un geste
   * dont on connaît déjà le résultat ; attendre l'aller-retour aurait laissé l'ancien nom
   * une demi-seconde de trop, juste après l'avoir corrigé. Si l'appel échoue, on remet
   * celui d'avant — c'est le seul cas où le nom doit reculer sous les yeux.
   *
   * ⚠️ **Un nom vide est refusé sans le dire.** Il n'y a rien à expliquer : le champ se
   * referme sur l'ancien nom, et l'on comprend seul qu'un portefeuille en a besoin d'un.
   */
  const validerLeNom = useCallback(async () => {
    setRenomme(false);
    const propre = nomSaisi.trim();
    if (!idPortefeuille || !propre || propre === portfolio?.name) return;
    const avant = portfolio?.name;
    setPortfolio(p => (p ? { ...p, name: propre } : p));
    try {
      const r = await fetch(`${API_URL}/api/v1/portfolios/${idPortefeuille}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", ...enTetesAuth() },
        body: JSON.stringify({ name: propre }),
      });
      if (!r.ok) throw new Error(String(r.status));
    } catch {
      setPortfolio(p => (p && avant ? { ...p, name: avant } : p));
    }
  }, [nomSaisi, idPortefeuille, portfolio?.name]);

  const supprimerLeCompte = useCallback(async () => {
    if (!idPortefeuille || !compteEdite) return;
    setCompteEnCours(true);
    setErreurCompte(null);
    try {
      await supprimerCompte(String(idPortefeuille), compteEdite.id);
      rechargerComptes();
      setFormCompte(false);
      setCompteEdite(null);
    } catch (e) {
      setErreurCompte(e instanceof Error ? e.message : "Le compte n'a pas pu être supprimé.");
    } finally {
      setCompteEnCours(false);
    }
  }, [idPortefeuille, compteEdite, rechargerComptes]);

  const saveTotalValue = async () => {
    if (!portfolio) return;
    const v = parseFloat(valueInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingValue(false); return; }
    const ok = await fetch(`${API_URL}/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ total_value: v }),
    }).then(r => r.ok).catch(() => false);
    setPortfolio(p => p ? { ...p, total_value: v } : p);
    setEditingValue(false);
    exprimer(ok ? "succes" : "erreur");
  };

  /** Même règle que pour la valeur totale : on lit le résultat avant de le dire. */
  const saveCostBasis = async () => {
    if (!portfolio) return;
    const v = parseFloat(costInput.replace(/\s/g, "").replace(",", "."));
    if (isNaN(v) || v <= 0) { setEditingCost(false); return; }
    const ok = await fetch(`${API_URL}/api/v1/portfolios/${portfolio.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json", ...enTetesAuth() },
      body: JSON.stringify({ cost_basis: v }),
    }).then(r => r.ok).catch(() => false);
    exprimer(ok ? "succes" : "erreur");
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
      {/**
        * ⚠️ **Les blocs s'alignent par le haut, et non par le milieu.** Leurs quatre
        * titres — « Valeur totale », « Gains / pertes », « Comparaison », « Santé du
        * portefeuille » — partagent police, graisse et couleur : l'œil les lit comme une
        * rangée d'intitulés de section et attend donc une ligne. Centrés, ils flottaient
        * à trois hauteurs différentes, mesurées à 83, 87 et 101 px, parce que les blocs
        * n'ont pas la même hauteur de contenu — 38 px pour les gains, 73 pour la valeur.
        * Rien ne le nomme quand on regarde, mais la rangée paraît bricolée.
        *
        * ⚠️ **Le premier bloc garde son centrage.** Il porte l'avatar, une forme et non
        * un titre : aligné par le haut, il montait de cinq pixels au-dessus d'une rangée
        * de textes, et c'est lui qui aurait alors paru décalé.
        */}
      <Cadre style={{ padding: "13px 18px", flexShrink: 0, display: "flex", alignItems: "flex-start", gap: 22, flexWrap: "wrap" }}>
        {/* Identité du portefeuille. La maquette met ici une illustration
            décorative ; elle ne dit rien qu'on ne sache déjà. Ces pixels
            répondent plutôt à une question que la mise en page a fait
            disparaître : depuis que la pastille est partie à droite du
            bandeau, la bande n'indiquait plus de quel portefeuille il s'agit.
            Les logos empilés montrent en plus ce qu'il contient. */}
        {/* ⚠️ `alignSelf: center` sur le bloc d'identité : il porte l'avatar, une forme et
            non un titre. La rangée s'aligne par le haut pour que les quatre intitulés de
            section tiennent sur une ligne ; l'avatar, lui, n'appartient pas à cette
            ligne-là et se serait mis à flotter au-dessus d'elle. */}
        {portfolio && (
          <div style={{ display: "flex", alignItems: "center", alignSelf: "center", gap: ECART_IDENTITE, minWidth: 0, flexShrink: 0 }}>
            {/* Le personnage et ce qu'il dit ne font qu'une case pour la rangée : un seul
                écart avant le nom, que la parole soit ouverte ou fermée. */}
            <div style={{ display: "flex", alignItems: "center", flexShrink: 0 }}>
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
            {/* ⚠️ **La pastille d'enveloppe est retirée de l'avatar.** Elle chevauchait
                son angle haut-droit ; sur une tête ronde et bombée, un jeton clair posé
                dessus se lisait comme un défaut de dessin plutôt que comme une mention.
                Le calcul lui-même reste entier dans `lib/portfolio` — `enveloppe()` et
                `infobulleEnveloppe()` — et `PastilleEnveloppe` sert encore le menu
                déroulant du bandeau. La remettre ailleurs est donc une affaire de deux
                lignes, le jour où on lui trouve une place qui ne morde pas le visage. */}
            <span style={{ display: "inline-flex", flexShrink: 0 }}>
              {/* ⚠️ **L'avatar remplace la vignette du portefeuille.** Ce qu'on perd,
                  et il faut le savoir : `ImagePortefeuille` était aussi le téléverseur
                  d'image, recadrage compris. Le composant reste entier dans le code —
                  rien ne l'appelle plus ici, c'est tout. */}
              <AvatarPortefeuille portefeuille={portfolio} taille={DIAMETRE_ROND}
                couleur={couleurAvatar} onCouleur={choisirCouleurAvatar}
                forme={formeAvatar} onForme={choisirForme}
                skin={skinAvatar} onSkin={choisirSkin} />
            </span>

            {/**
              * Ce que le personnage a à dire, quand il a quelque chose à dire.
              *
              * ⚠️ **Au repos, rien — et c'est ce qui la rend acceptable ici.** Sur le banc,
              * toutes les expressions parlent : c'est une vitrine. Un « Bonjour » permanent
              * posé contre le nom du portefeuille ferait un bandeau qui salue, pas un
              * personnage qui parle. `parleEnContexteDense` écarte aussi les états du
              * curseur — le défilement, le survol, la valeur pointée changent au rythme de la
              * souris, et un texte branché dessus clignoterait à chaque mouvement. Restent le
              * sommeil, le calcul en cours et les réactions ponctuelles.
              *
              * ⚠️ **Elle se tient contre le personnage, et pousse le nom.** Placée d'abord
              * après le nom, elle en était détachée : rien ne la rattachait plus à la tête que
              * sa couleur. Contre lui, elle lui appartient — au prix du décalage du nom et du
              * décompte, qui est le comportement voulu.
              *
              * ⚠️ **Elle prend son rang dans la rangée au lieu de flotter par-dessus.** La
              * géométrie de cette bande est mesurée au pixel — 19 en haut, 19 en bas, 19 à
              * gauche, et c'est le bloc de la valeur totale qui en commande la hauteur. Une
              * parole posée en absolu aurait recouvert le nom ; posée dans le flux, elle
              * consomme le mou qui reste à droite (mesuré : plus de quatre cents pixels) et ne
              * pousse rien hors du cadre. Elle ne peut pas non plus grandir la bande : deux
              * lignes de 19/27,5 font 48 pixels, contre 63 à la vignette.
              *
              * ⚠️ **Un registre compact, mais jamais en dessous de la taille de lecture.**
              * L'avatar mesure ici 63 pixels contre 390 au banc ; suivre sa taille aurait
              * donné trois pixels et demi. C'est la densité typographique du bandeau qui
              * décide — un nom en 13, une valeur en 32 —, pas la taille du personnage.
              *
              * ⚠️ **Elle s'ouvre en glissant plutôt que de réserver sa place.** Une largeur
              * tenue en permanence laisserait, au repos, un trou de cent quatre pixels entre
              * une tête et le nom qu'elle porte : cela se lit comme un défaut de mise en page,
              * pas comme une réserve. Reste le défaut mesuré la première fois — apparue d'un
              * coup, elle poussait « Valeur totale » et toute la suite d'un seul cran, sous
              * les yeux de quelqu'un en train de lire un montant. Étalé sur deux cent soixante
              * millisecondes, le même déplacement se lit comme quelque chose qui s'insère. Et
              * il est devenu rare : `useParoleStable` a écarté le pouls des cours, qui le
              * déclenchait toutes les quinze secondes.
              *
              * ⚠️ **Le retrait est porté par la case, pas par l'écart de la rangée.** Une case
              * de largeur nulle dans une rangée espacée coûte quand même son écart : au repos,
              * le nom se serait retrouvé onze pixels plus loin qu'avant l'ajout. Le personnage
              * et sa parole forment donc leur propre rangée, sans écart, et le retrait vit
              * dans le remplissage de la case — qu'`overflow: hidden` escamote avec le reste.
              */}
            <div
              style={{
                width: paroleAffichee ? PLACE_COMPACTE + ECART_IDENTITE : 0,
                /**
                 * ⚠️ **Le retrait se referme avec la case, sinon il survit à zéro.** Sous
                 * `border-box`, une largeur inférieure au remplissage ne le rogne pas : la
                 * boîte s'arrête à la taille du remplissage. Mesuré, la case fermée occupait
                 * donc onze pixels et le nom se tenait à vingt-deux du personnage au lieu de
                 * onze — exactement le décalage que ce montage devait éviter.
                 */
                paddingLeft: paroleAffichee ? ECART_IDENTITE : 0,
                boxSizing: "border-box", flexShrink: 0,
                /**
                 * ⚠️ **On coupe les côtés, pas le haut — et `overflow` ne sait pas faire la
                 * différence.** Il ferme les deux axes à la fois : la parole restait bien
                 * dans sa case pendant le glissement, mais le grand « Z » du dodo, qui monte
                 * de vingt-deux pixels au-dessus de sa ligne, y arrivait **tranché net**.
                 * Vu à l'écran, mesuré à quatre pixels d'encre coupée.
                 *
                 * ⚠️ **Et rehausser la boîte n'y suffisait pas.** Un envol est une
                 * `transform` : il déplace le dessin sans rien dire à la mise en page, donc
                 * aucun remplissage calculé depuis la hauteur montée ne referme l'écart —
                 * essayé, il restait quatre pixels. `clip-path` pose la question autrement :
                 * on désigne la fenêtre, et on la laisse ouverte en haut et en bas.
                 */
                clipPath: "inset(-40px 0 -40px 0)",
                transition: "width 260ms cubic-bezier(0.2, 0.7, 0.3, 1),"
                  + " padding-left 260ms cubic-bezier(0.2, 0.7, 0.3, 1)",
              }}
            >
              {paroleAffichee && (
                <AvatarParole
                  etat={paroleAffichee.cle} pseudo={paroleAffichee.nom}
                  couleur={couleurAvatar}
                  fond={theme.surfaceSolid} clair={!theme.isDark}
                  base={BASE_COMPACTE} largeur={PLACE_COMPACTE}
                />
              )}
            </div>
            </div>
            {/* ⚠️ **Centré en hauteur face à l'avatar.** Le nom et son compte d'actifs
                forment un couple court à côté d'un rond de 63 px : alignés en haut, ils
                pendaient dans le vide sous leur propre ligne. L'écart entre les deux
                lignes ne change pas — c'est le couple entier qui se recentre. */}
            <div style={{ minWidth: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignSelf: "stretch" }}>
              {/* Le nom seul. Une pastille de la couleur du portefeuille le
                  précédait ; elle est retirée. Elle était le dernier endroit du
                  bandeau où cette couleur paraissait — la vignette ne s'en teinte
                  plus depuis qu'elle a pris le cuir de la palette — donc elle ne
                  distinguait plus rien de rien. */}
              {/**
                * Le nom se corrige sur place, d'un double-clic.
                *
                * ⚠️ **Sur place, et non dans un formulaire.** Renommer un portefeuille est
                * un geste d'un mot : ouvrir une fenêtre pour un champ unique aurait coûté
                * plus de clics que la correction elle-même. Le champ prend exactement la
                * place du titre, si bien que rien ne bouge autour — le bandeau garde sa
                * hauteur, et la courbe en dessous ne se recadre pas.
                *
                * ⚠️ **Double-clic et non simple clic.** Le nom est au milieu d'un bandeau
                * qu'on parcourt à la souris ; un simple clic aurait ouvert un champ à
                * chaque passage distrait, et la première frappe suivante aurait renommé le
                * portefeuille sans qu'on l'ait voulu.
                *
                * ⚠️ **Entrée valide, Échap renonce, et perdre le focus valide aussi.** Un
                * champ qu'on quitte en cliquant ailleurs doit garder ce qu'on vient d'y
                * écrire : l'inverse jette une saisie sans le dire.
                */}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {renomme ? (
                  <input
                    autoFocus
                    value={nomSaisi}
                    onChange={e => setNomSaisi(e.target.value)}
                    onBlur={validerLeNom}
                    onKeyDown={e => {
                      if (e.key === "Enter") { e.preventDefault(); validerLeNom(); }
                      if (e.key === "Escape") { e.preventDefault(); setRenomme(false); }
                    }}
                    maxLength={60}
                    aria-label="Nom du portefeuille"
                    style={{
                      fontFamily: "inherit", fontSize: 13, fontWeight: 700,
                      color: CLAIR.texte, background: CLAIR.carteCreuse,
                      border: `1px solid ${CLAIR.bordFort}`, borderRadius: 6,
                      padding: "1px 6px", outline: "none", width: "100%", minWidth: 0,
                    }}
                  />
                ) : (
                  <span
                    onDoubleClick={() => { setNomSaisi(portfolio.name); setRenomme(true); }}
                    title="Double-cliquez pour renommer"
                    style={{ fontSize: 13, fontWeight: 700, color: CLAIR.texte, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", cursor: "text" }}>
                    {portfolio.name}
                  </span>
                )}
              </div>
              {/* ⚠️ **Une pastille de la couleur du portefeuille devant le compte d'actifs.**
                  Elle avait été retirée de devant le nom, où elle ne distinguait plus rien
                  depuis que la vignette avait pris le cuir de la palette. Ici elle
                  raccroche la ligne à l'avatar qui la précède : c'est le seul endroit du
                  bandeau où la couleur choisie pour ce portefeuille reparaît. */}
              <span style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: CLAIR.texteAttenue }}>
                {/* ⚠️ `couleurAvatar` et non `portfolio.color` : ce sont deux teintes
                    distinctes. L'épargnant choisit celle de son avatar dans la palette de
                    la vignette, quand `color` reste celle du portefeuille en base — celle
                    de la courbe. Les deux coïncident tant qu'on n'a rien choisi, ce qui
                    rendait l'erreur invisible ici et fausse partout ailleurs. */}
                <span aria-hidden="true" style={{
                  width: 6, height: 6, borderRadius: "50%", flexShrink: 0,
                  background: couleurAvatar,
                }} />
                {enriched.length} actif{enriched.length > 1 ? "s" : ""}
              </span>
            </div>
          </div>
        )}
        <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
        {/* ⚠️ Étiré comme le bloc de performance, et pour la même raison : sa dernière
            ligne doit finir à la hauteur des deux autres. Laissé à sa taille naturelle,
            il s'arrêtait un demi-pixel plus haut — invisible seul, mais c'est ce
            demi-pixel qui faisait mesurer 14,5 en bas contre 14 en haut. */}
        <div style={{ minWidth: 200, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
    {/* VALEUR TOTALE + édition inline */}
    {/* ⚠️ Aucune marge sous l'intitulé : comme dans le bloc de performance, elle vivrait
        hors du partage des marges automatiques et se lirait comme deux pixels de plus
        au-dessus du chiffre qu'en dessous. */}
    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
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
        // ⚠️ Marges automatiques hautes et basses : le nombre tient le milieu entre son
        // intitulé et la ligne du capital investi, comme celui de la performance à sa
        // droite. Il se posait sous le titre et laissait tout le vide en dessous.
        lineHeight: 1, marginTop: "auto", marginBottom: "auto", fontVariantNumeric: "tabular-nums",
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
    {/**
      * ⚠️ **La composition du total ne s'écrit plus ici, et ce n'est pas un oubli.** Une
      * ligne « 5 325,29 € de titres · 5 400,00 € de liquidités » s'intercalait sous le grand
      * chiffre dès qu'un compte de trésorerie était déclaré. Elle répondait à une vraie
      * question — déclarer un livret de cinq mille euros ajoute cinq mille euros au total,
      * et l'écart avec la veille est sinon inexplicable — mais elle la posait au plus mauvais
      * endroit : une troisième ligne dans un bandeau qui en tient deux, donc un en-tête qui
      * grandit pour tout le monde, tous les jours, à cause d'un doute d'un seul jour.
      *
      * ⚠️ **La question reste ouverte, elle attend juste un meilleur endroit.** Le total
      * n'annonce plus ce qui le compose ; les dossiers de compte, eux, portent chacun leur
      * solde. Si le doute revient, c'est là — ou au survol du total — qu'il faudra répondre,
      * pas en ajoutant une ligne au bandeau. */}
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
      // La mention reste le dernier enfant du bloc étiré : ce sont les marges du nombre
      // au-dessus qui absorbent le vide, elle n'a plus à le faire.
      <div style={{ fontSize: 11, fontFamily: FONT, color: CLAIR.texteAttenue }}>
        {masque ? "•••• €" : `${prixDeRevient.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`} investis
        {/* ⚠️ Un point médian entre le capital et la date : ce sont deux faits distincts,
            et « 4 959,91 € investis depuis fév. 2026 » se lisait comme une seule phrase où
            la somme semblait porter sur la période plutôt que sur le total. */}
        {origine && <><span style={{ opacity: 0.5 }}> · </span>{libellePeriode.toLowerCase()}</>}
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
        {/* ⚠️ **Le bloc s'étire pour que sa dernière ligne tombe au même niveau que les
            deux autres.** « Depuis le début », le capital investi et le bas de l'anneau
            sont trois mentions de même rang : posées à trois hauteurs, elles faisaient
            trois blocs qui se terminent au hasard de leur contenu. Le bloc prend donc
            toute la rangée et sa mention descend d'elle-même. */}
        <div style={{ minWidth: 150, alignSelf: "stretch", display: "flex", flexDirection: "column" }}>
          {/**
            * ⚠️ **La période est écrite dans le titre, comme celle d'à côté.** Ce bloc et
            * « Comparaison » répondent tous deux à « combien ai-je gagné » et affichaient
            * deux nombres différents — relevé à l'écran : −1 220 € ici, −958 € là, sans
            * que rien n'explique l'écart. La cause est que les deux ne couvrent pas la
            * même durée : celui-ci compte depuis la première opération, l'autre sur la
            * fenêtre choisie sous le graphique.
            *
            * ⚠️ **L'explication existait déjà, mais dans un survol.** Un écart qui ne se
            * lève qu'en pointant la souris n'est pas expliqué : il est caché à qui ne
            * pense pas à survoler, c'est-à-dire à qui se pose justement la question. Le
            * dire dans le titre coûte quatre mots et se lit sans geste.
            */}
          {/* ⚠️ **« Performance », et la durée passe en dessous.** Le titre portait sa
              période en incise — « Gains / pertes · depuis le début » — ce qui faisait
              une ligne longue au-dessus d'un chiffre court. Sous le montant, la mention
              se lit après lui, ce qui est l'ordre dans lequel on se pose la question. */}
          {/**
            * ⚠️ **Aucune marge sous l'intitulé, parce que le montant se centre.** Ce bloc
            * ne pose plus son chiffre sous le titre comme celui de gauche : il le place à
            * mi-hauteur entre le titre et la mention du bas, par deux marges automatiques.
            * Or celles-ci ne partagent que l'espace du conteneur qui les porte — une marge
            * ici resterait en dehors du partage et se lirait comme deux pixels de plus
            * au-dessus du chiffre qu'en dessous. Mesuré : 7,3 contre 5,3.
            */}
          <p style={{ margin: 0, fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>
            Performance
          </p>
    {/* P&L total depuis achat */}
    {valeurTitres != null && (() => {
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
        ? { eur: (titresSurvoles ?? survolCourbe.valeur) - survolCourbe.investi,
            base: survolCourbe.investi }
        : null;
      const plEur = survolGain ? survolGain.eur : valeurTitres - cb;
      const plPct = (plEur / (survolGain ? survolGain.base : cb)) * 100;
      const plCol = plEur >= 0 ? CLAIR.positif : CLAIR.negatif;
      /**
       * ⚠️ **Le gain passe devant la note, et c'était l'inverse.** Mesuré dans le
       * bandeau : le score de santé s'affichait en 20 px de graisse 800, le gain en
       * 11 px — le deuxième élément le plus voyant de la rangée était donc une note
       * dérivée, presque deux fois plus grosse que ce que l'épargnant a réellement
       * gagné. Or après « combien je possède », la question suivante est « combien
       * j'ai gagné », pas « quelle note ai-je ».
       *
       * ⚠️ **Le pourcentage reste petit à côté du montant.** Deux nombres de même
       * taille se disputeraient le regard ; l'euro est la grandeur qu'on vient
       * chercher, le pourcentage la précise.
       */
      return (
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
        {/* ⚠️ **Deux marges automatiques, donc un centrage et non un empilement.** Le
            montant se posait sous l'intitulé et laissait tout le vide entre lui et la
            mention du bas. Les marges hautes et basses en `auto` se partagent l'espace
            libre à parts égales : le chiffre se place au milieu de ce qui reste entre le
            titre et « Depuis le début », quelle que soit la hauteur de la rangée. */}
        <div style={{ marginTop: "auto", marginBottom: "auto", fontSize: 18, fontFamily: FONT, color: plCol, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
          {/* Deux décimales, comme la valeur totale juste au-dessus. Arrondi à
              l'euro, ce gain ne se recoupait pas avec elle : 3 447,92 € moins
              3 256,73 € de capital font 191,19 €, pas 191. */}
          {/* ⚠️ **Le montant se masque, le pourcentage reste.** Un pourcentage ne dit rien
              de ce qu'on possède : on peut montrer sa performance sans montrer sa
              fortune, et c'est exactement ce que l'œil barré sert à faire. Le cacher
              aussi n'aurait rien protégé de plus et aurait vidé le bloc. */}
          <span>{masque ? MONTANT_MASQUE
            : `${plEur >= 0 ? "+" : ""}${plEur.toLocaleString("fr-FR", {
                minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`}</span>
          {/* ⚠️ **Le pourcentage devient une pastille.** Entre parenthèses et en gris, il
              se lisait comme une précision de bas de page ; enfermé dans son fond teinté,
              il devient une donnée à part entière sans disputer sa taille au montant. */}
          <span style={pastille(plCol)}>
            <FlecheTendance hausse={plPct >= 0} />
            {plPct >= 0 ? "+" : ""}{plPct.toFixed(2)} %
          </span>
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
        {/* ⚠️ **La durée sous le montant, comme le capital investi sous la valeur.** Les
            deux blocs se répondent alors : un grand chiffre, puis la phrase qui dit de
            quoi il parle. Au survol, la mention change de question — ce n'est plus
            « depuis quand » mais « quand ». */}
        {/* La mention reste le dernier enfant du bloc étiré, donc au bas de la rangée et
            sur la même ligne que le capital investi à sa gauche. Elle n'a plus besoin de
            `marginTop: auto` : ce sont les marges du montant qui absorbent le vide. */}
        {/* ⚠️ Aucun rembourrage haut : il s'ajoutait à l'espace sous le montant et faussait
            le partage des marges automatiques — 5 px au-dessus du chiffre contre 3 en
            dessous, alors qu'elles sont censées être égales par construction. */}
        <div style={{ fontSize: 11, fontFamily: FONT, color: CLAIR.texteAttenue }}>
          {survolGain ? "À cette date" : "Depuis le début"}
        </div>
        </div>
      );
    })()}
        </div>
        {/* ⚠️ **Le bloc « Comparaison » est retiré, à la demande.** Il posait face aux
            gains un second chiffre répondant à la même question sur une autre durée, et
            l'écart entre les deux demandait une phrase d'explication que le bandeau n'a
            pas la place de porter. Le repère lui-même n'est pas perdu : la simulation de
            l'indice reste calculée par `/history` et reste lisible ailleurs. Le jour où
            il revient, c'est la question du cadre qu'il faudra reprendre, pas la
            place. */}
        {scoreSante != null && <>
          <div style={{ width: 1, alignSelf: "stretch", background: CLAIR.carteCreuse }} />
          {/* Santé du patrimoine : le titre chiffré passe en tête, la carte
              de droite ne garde que le détail par critère. */}
          {/**
            * ⚠️ **L'anneau se centre dans la rangée, le titre reste sur sa ligne.** Les deux
            * exigences se contredisent si le bloc s'aligne d'un seul tenant : centré, son
            * titre descendait sous les trois autres ; aligné en haut, l'anneau montait au
            * ras du bord. Le bloc s'étire donc sur toute la hauteur de la rangée, et
            * chacun de ses deux enfants prend l'alignement qui lui convient — l'anneau au
            * milieu, comme l'avatar qui lui fait face à l'autre bout ; le texte en haut,
            * avec les intitulés de section.
            */}
          <div style={{ display: "flex", alignSelf: "stretch", alignItems: "flex-start", gap: 12, minWidth: 170 }}>
            <div>
              <p style={{ margin: "0 0 6px", fontSize: 11.5, fontWeight: 500, color: CLAIR.texteSecondaire }}>Santé du patrimoine</p>
              {/* ⚠️ **La note est dans l'anneau, « /100 » et la mention dehors.** L'anneau
                  dit déjà la proportion ; y empiler le dénominateur et le qualificatif
                  aurait demandé trois tailles de texte dans soixante-trois pixels. */}
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <CircleScore score={scoreSante} size={DIAMETRE_ANNEAU_SCORE} nu chiffreSeul />
                {/* ⚠️ **La colonne s'étire sur la hauteur de l'anneau et écarte ses deux
                    lignes.** « /100 » se pose alors en haut du cercle et la pastille au
                    ras de son bas : les deux formes se terminent sur la même ligne au
                    lieu de flotter au gré de l'écart choisi. */}
                <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", alignSelf: "stretch", alignItems: "flex-start" }}>
                  <span style={{ fontSize: 12, color: CLAIR.texteFaible, fontFamily: FONT }}>/100</span>
                  <span style={pastille(scoreColor(scoreSante))}>
                    {bandeSante ?? scoreLabel(scoreSante)}
                  </span>
                </div>
              </div>
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
      {/**
        * ⚠️ **Le bas rejoint les côtés : `MARGE`, comme partout ailleurs.** Il valait zéro,
        * et cela se voyait doublement. La rangée du bas finissait collée à l'arête de la
        * zone de défilement, ce qui se lit comme une troncature ; et les deux rails de cette
        * vue — les dossiers, puis les cartes une fois un dossier ouvert — dépassent de
        * `RESERVE_RAIL.bas` sous eux pour laisser leur ombre finir, dépassement qui devenait
        * du défilement fantôme faute d'un rembourrage pour l'accueillir.
        *
        * ⚠️ **Cette place est prise à la courbe, donc elle se compte.** L'unique enfant de
        * la colonne est en `flex: 1`, et la courbe est la seule à l'être à l'intérieur : tout
        * rembourrage posé ici la raccourcit d'autant. C'est pourquoi le bas vaut la marge de
        * la page et rien de plus — j'y avais d'abord mis les cinquante pixels que réclamait
        * l'ombre des dossiers, et la courbe les a perdus pour une lueur. C'est l'ombre qui a
        * été retaillée.
        *
        * ⚠️ **Ici et non sur la rangée des dossiers**, où elle serait devenue
        * conditionnelle : la courbe aurait changé de hauteur à l'ouverture d'un dossier, ce
        * que la rangée s'échine justement à éviter en se calant sur les 26 pixels de
        * l'en-tête de la grille. */}
      <div style={{ display: dashView === "resume" ? "flex" : "none", flexDirection: "column", height: "100%", gap: 8, padding: `8px ${MARGE}px ${MARGE}px`, overflowY: "auto", overflowX: "hidden" }}>

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
              /* ⚠️ Les titres seuls : la courbe met une performance à l'échelle d'un
                 montant, et des espèces ne performent pas. Le total y ferait monter et
                 descendre une somme qui, elle, n'a pas bougé. */
              /* ⚠️ Le patrimoine, et non les seuls titres : c'est le chiffre du bandeau,
                 et c'est sur lui que le graphique cale la fin de sa courbe. Les deux ne
                 sont pas deux valeurs qui se ressemblent, c'est la même à deux endroits. */
              totalValue={valeurTotale}
              period={period}
              onPeriodChange={setPeriod}
              // ⚠️ La courbe prend la couleur de l'avatar, pas celle que l'API garde :
              // c'est la seule que l'utilisateur a choisie, et deux couleurs pour un
              // même portefeuille sur un même écran se liraient comme un défaut.
              color={couleurAvatar}
              portfolioId={portfolio?.id}
              surTransactions={surTransactions}
              operations={reperesOperations}
              onOperationClick={(id) => { setOperationVisee(id); setDashView("transactions"); }}
              onSurvol={setSurvolCourbe}
              masque={masque}
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
            {/* ⚠️ **Les comptes sont *déduits*, pas déclarés.** Chaque ligne est rangée
                par `compteInfere`, la même inférence qu'`enveloppe` prise titre par
                titre. Cela peuple les dossiers dès le premier chargement, sans rien à
                saisir — mais une action parisienne détenue en compte-titres ordinaire
                ira dans « PEA » et rien ne le dira. Le jour où une route acceptera de
                ranger un titre à la main, c'est ici que la correction se branchera.

                ⚠️ **Un compte vide n'est pas affiché.** Un dossier « Crypto » à zéro
                ligne sur un portefeuille qui n'en contient pas promettrait un rangement
                qui n'existe pas.

                ⚠️ **Les dossiers occupent la place des cartes, ils ne s'y ajoutent pas.**
                Empilés au-dessus d'elles, ils prenaient 230 pixels de haut à un écran qui
                les retirait à la courbe, pour montrer deux fois la même chose : le dossier
                d'un côté, son contenu déjà déplié de l'autre. On navigue donc comme dans
                un explorateur de fichiers — les dossiers, puis leur contenu à leur place,
                le chemin servant de retour. Le prix à connaître : sans dossier ouvert, il
                n'y a plus d'écran qui montre toutes les lignes ensemble. */}
            {/* ⚠️ La zone commune aux deux écrans : c'est elle qu'on mesure avant et après
                le remplacement, puisque la rangée de dossiers et la grille s'y succèdent. */}
            <div ref={zoneDesCartes} style={{ flexShrink: 0 }}>
              {compteActif == null ? (
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {/* ⚠️ Même hauteur que l'en-tête de la grille — 26 pixels, ceux de son
                      bouton de tri. Un simple libellé en fait 18, et la courbe au-dessus
                      gagnait huit pixels à la vue des dossiers pour les reperdre à
                      l'ouverture de l'un d'eux. */}
                  <div style={{ height: 26, display: "flex", alignItems: "center", flexShrink: 0 }}>
                    <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.surFond }}>
                      Vos comptes
                    </span>
                    {/**
                      * ⚠️ **Le bouton tient dans les 26 pixels de la rangée, et ce n'est pas
                      * négociable.** Cette hauteur est celle du bouton de tri de la grille ;
                      * la dépasser rendrait la vue des dossiers plus haute que celle d'un
                      * dossier ouvert, et la courbe au-dessus gagnerait huit pixels pour les
                      * reperdre au premier clic. Voir la note juste au-dessus.
                      *
                      * ⚠️ **Poussé au bout de la rangée par une marge automatique.** La
                      * rangée s'arrête à dix pixels de la carte d'activité récente : le
                      * bouton s'y range donc de lui-même, sans qu'on ait à connaître la
                      * largeur de la colonne.
                      *
                      * ⚠️ **Il ouvrait la saisie d'une opération, faute de mieux.** Il
                      * n'existait alors aucun compte dans les données : `Enveloppe` valait
                      * PEA, CTO ou Crypto et chaque ligne y était *déduite* de sa place de
                      * cotation, si bien qu'un compte n'apparaissait qu'en y détenant
                      * quelque chose — et qu'un compte courant, qui ne détient aucun titre,
                      * ne pouvait pas exister du tout. Les comptes se déclarent désormais.
                      */}
                    <button type="button" onClick={() => { setErreurCompte(null); setFormCompte(true); }}
                      title="Déclarer un compte : son genre, sa couleur, son logo."
                      style={{
                        marginLeft: "auto", height: 22, display: "flex", alignItems: "center",
                        gap: 5, padding: "0 9px", borderRadius: RAYONS.xs,
                        background: CLAIR.carteCreuse, border: `1px solid ${CLAIR.bord}`,
                        color: CLAIR.texteSecondaire, fontFamily: FONT, fontSize: 11,
                        fontWeight: 500, cursor: "pointer", flexShrink: 0,
                        transition: "color 150ms, border-color 150ms",
                      }}
                      onMouseEnter={e => {
                        e.currentTarget.style.color = CLAIR.texte;
                        e.currentTarget.style.borderColor = CLAIR.bordFort;
                      }}
                      onMouseLeave={e => {
                        e.currentTarget.style.color = CLAIR.texteSecondaire;
                        e.currentTarget.style.borderColor = CLAIR.bord;
                      }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
                        aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Ajouter un compte
                    </button>
                  </div>
                  {/**
                    * ⚠️ **Un rail sur une seule ligne, et non une grille qui se replie.**
                    * Les dossiers ont une largeur fixe — la découpe est un tracé en pixels
                    * qu'une colonne élastique déformerait — si bien qu'à trois comptes sur
                    * cette largeur, la grille passait à la ligne : mesuré, 485 pixels de
                    * haut au lieu de 248, et une courbe réduite à 66 pixels. Les cartes
                    * d'actifs défilent déjà ainsi, à la même place.
                    */}
                  <RailHorizontal pasMinimal={CARTE_COMPTE.largeur + 16}>
                    {/**
                      * ⚠️ **Les comptes déclarés passent avant ceux que l'on devine, et par
                      * le même composant.** Un second dessin pour « les vrais » aurait fait
                      * deux langages dans une même rangée ; ils portent la même carte, avec
                      * leur couleur et leur logo à la place de l'habillage par défaut.
                      *
                      * ⚠️ **Ils n'ont pas encore d'aperçu, et c'est exact plutôt que
                      * flatteur.** Une ligne n'entre dans un compte déclaré que si son
                      * opération y est rattachée ; rien ne le permet encore depuis l'écran.
                      * Y afficher les lignes devinées du même genre aurait montré un
                      * contenu que la donnée ne dit pas — précisément la confusion que ces
                      * comptes servent à lever.
                      */}
                    {/**
                      * ⚠️ **Rien tant que le journal n'est pas là.** Le rangement des lignes
                      * se lit dans les opérations ; avant leur arrivée, aucune ne paraît
                      * rattachée. La rangée montrait alors les comptes déclarés à « Aucun
                      * actif » et faisait reparaître à côté d'eux les dossiers devinés
                      * qu'ils venaient de remplacer — pendant les deux secondes de la
                      * requête, à chaque rechargement. Une répartition qu'on va contredire
                      * ne vaut pas mieux que pas de répartition.
                      *
                      * ⚠️ **La place est gardée, pas seulement le contenu retiré.** Sans ce
                      * bloc de la hauteur d'un dossier, la courbe au-dessus gagnerait 196
                      * pixels le temps du chargement pour les reperdre aussitôt : on
                      * remplacerait un clignotement par un soubresaut. */}
                    {!journalArrive ? (
                      <div style={{ height: CARTE_COMPTE.hauteur, flexShrink: 0 }} />
                    ) : dossiers.map(d => {
                      const compte = d.compteId
                        ? comptesDeclares.find(c => c.id === d.compteId) : undefined;
                      const depuis = compte ? fraicheurDuSolde(compte.mis_a_jour_le) : null;
                      /**
                        * ⚠️ **Le dossier annonce ce qu'il vaut, pas seulement ce qu'il
                        * contient.** « 3 actifs » ne dit rien du poids du compte : deux
                        * dossiers de trois lignes peuvent porter cent euros et cinquante
                        * mille.
                        *
                        * ⚠️ **Les centimes partout, et j'avais tranché l'inverse.**
                        * J'arrondissais les valorisations à l'euro au motif qu'elles suivent
                        * les cours et n'ont pas la précision affichée. L'argument reste vrai
                        * et il ne suffit pas : deux montants côte à côte, dans le même style,
                        * dont l'un porte ses centimes et l'autre non, se lisent comme deux
                        * natures de chiffre.
                        *
                        * ⚠️ **La mention dit d'abord ce que le dossier contient, puis ses
                        * espèces s'il en a.** Un compte à titres vaut ses lignes *plus* la
                        * poche non investie ; taire la seconde ferait un montant qu'aucune
                        * addition visible ne retrouve. Sur un compte de trésorerie, il n'y a
                        * pas de lignes du tout : la date de saisie prend la place, parce que
                        * ce chiffre entre dans le total comme s'il était mesuré alors qu'il a
                        * été tapé un jour donné.
                        */
                      const mention = !d.porteDesTitres
                        ? (depuis && `Solde déclaré ${depuis}`)
                        : [
                            d.lignes.length === 0
                              ? "Aucun actif"
                              : `${d.lignes.length} actif${d.lignes.length > 1 ? "s" : ""}`,
                            d.especes != null && d.especes !== 0
                              && `${montantSelonMasque(d.especes, masque)} d’espèces`,
                          ].filter(Boolean).join(" · ");
                      return (
                        <CarteCompte key={d.cle} nom={d.nom} couleur={d.couleur}
                          icone={ICONE_PAR_GENRE[d.genre] ?? ICONE_BANQUE}
                          annonce={`${d.nom}, ${montantSelonMasque(d.montant, masque)}${mention ? `, ${mention}` : ""}`}
                          compte={
                            <>
                              <div style={ANNONCE_DOSSIER.montant}>
                                {montantSelonMasque(d.montant, masque)}
                              </div>
                              {mention && (
                                <div style={ANNONCE_DOSSIER.mention}>{mention}</div>
                              )}
                            </>
                          }
                          /**
                            * ⚠️ **Ce qui dépasse d'un dossier dit ce qu'il range.** Des lignes
                            * d'actifs pour un compte à titres, une carte bancaire pour un
                            * compte de trésorerie — dont le vide se lisait « à remplir », alors
                            * qu'il ne recevra jamais de ligne.
                            */
                          apercu={!d.porteDesTitres
                            ? [<CarteBancaire key="carte" couleur={d.couleur}
                                intitule={compte?.libelle_genre ?? d.nom} />]
                            : [...d.lignes]
                                .sort((a, b) => b.weight - a.weight)
                                .slice(0, APERCUS_PAR_DOSSIER)
                                .map(a => <CarteActif key={a.ticker} a={versCarte(a)} inerte />)}
                          /* ⚠️ **Un compte de trésorerie s'ouvre sur sa correction, faute
                             d'intérieur à montrer.** Son solde entre dans le total et
                             vieillit tout seul ; sans moyen de le reprendre, le déclarer
                             reviendrait à le graver. Deux sens du clic cohabitent donc dans
                             la rangée — dette assumée, faute d'un écran « intérieur d'un
                             livret » qui aurait quelque chose à dire. */
                          onClick={compte && !d.porteDesTitres
                            ? ouvrirLaCorrection(compte)
                            : () => releverPuis(() => setCompteOuvert(d.cle))}
                          onModifier={compte
                            ? ouvrirLaCorrection(compte)
                            /* Un dossier deviné n'a pas été saisi : son nom vient de
                               l'enveloppe et son contenu des lignes. Seule son apparence se
                               règle — et c'est de là qu'on le déclare. */
                            : () => setDossierAColorer(d.cle)} />
                      );
                    })}
                  </RailHorizontal>
                </div>
              ) : (
                <AssetGrid
                  assets={lignesMontrees.map(versCarte)}
                  onAssetClick={ticker => router.push(`/chart?ticker=${encodeURIComponent(ticker)}`)}
                  view={view}
                  titre={
                    /* ⚠️ Le chemin porte le **nom** du dossier, pas sa clé : celle-ci est
                       préfixée (`deduit:PEA`) pour qu'un compte déclaré nommé « PEA » et le
                       dossier deviné du même nom ne s'ouvrent pas l'un pour l'autre. */
                    <FilAriane racine="Vos comptes" courant={dossierActif?.nom ?? ""}
                      couleur={dossierActif?.couleur}
                      /* Le rassemblement est l'étalement joué dans l'autre sens : mêmes
                         cartes, mêmes places, mesures inversées. */
                      onRacine={() => releverPuis(() => setCompteOuvert(null))} />
                  }
                  /**
                    * ⚠️ **Seulement dans un dossier **déclaré** à titres.** Un dossier deviné
                    * ne peut pas tenir la promesse : la ligne saisie irait où sa place de
                    * cotation l'envoie, si bien qu'un achat d'AAPL fait depuis le PEA
                    * atterrirait dans le CTO et disparaîtrait sous les yeux de celui qui
                    * vient de le saisir. C'est pour lever cela que le dossier se déclare.
                    */
                  action={dossierActif?.declare && dossierActif.porteDesTitres && (
                    <button type="button"
                      onClick={() => { setSaisieDansLeDossier(true); setShowTxModal(true); }}
                      title={`Saisir une opération dans ${dossierActif.nom}`}
                      style={{
                        display: "flex", alignItems: "center", gap: 5, height: 26,
                        padding: "0 10px", borderRadius: RAYONS.sm, cursor: "pointer",
                        border: "none", background: CLAIR.carte, color: CLAIR.texte,
                        fontFamily: FONT, fontSize: 11.5, fontWeight: 500,
                        whiteSpace: "nowrap", flexShrink: 0,
                      }}>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none"
                        stroke="currentColor" strokeWidth={2.2} strokeLinecap="round"
                        aria-hidden="true">
                        <path d="M12 5v14M5 12h14" />
                      </svg>
                      Ajouter une opération
                    </button>
                  )}
                />
              )}
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
                {[...lignesMontrees].sort((a, b) => b.weight - a.weight).flatMap(a => [
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


          {/* « Mouvements » vivait ici : les trois plus fortes hausses et
              baisses en contribution. Retiré — chaque carte d'actif affiche
              déjà sa variation et sa contribution en euros, et le tri par
              performance de la grille refait le classement à la demande. Sa
              place revient à l'allocation, dont la légende était rognée. */}
          {/* Allocation. Remplace l'exposition sectorielle, qui rangeait
              tout un portefeuille d'actions dans une barre unique à 100 %. */}
          {/**
            * ⚠️ **La répartition prend tout ce que l'activité ne prend pas.** Les deux
            * panneaux ont partagé la colonne en parts égales un temps ; l'activité descend
            * désormais au niveau de la rangée des dossiers, et le pavage récupère la
            * différence — soit soixante pixels de plus, là où une image en profite plus
            * qu'une liste de trois lignes.
            */}
          <Cadre style={{ padding: "13px 15px", flex: "1 1 0", minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            {/**
              * ⚠️ **Les liquidités entrent dans le pavage, alors que le camembert les
              * excluait.** Il divisait chaque ligne par la seule valeur des titres : y
              * ajouter les espèces aurait laissé un manquant invisible, la somme des parts
              * n'atteignant plus cent. Le pavage, lui, leur donne un bloc — c'est la
              * différence entre une part qu'on ne peut pas dessiner et une part qu'on
              * dessine.
              */}
            <RepartitionPavee
              dossiers={dossiers.map(d => ({
                cle: d.cle, nom: d.nom, couleur: d.couleur, especes: d.especes,
                lignes: d.lignes.map(l => ({
                  ticker: l.ticker, value: l.value,
                  classe: classeEnClair(typeParTicker[l.ticker], assetClass(l.ticker)),
                })),
              }))}
              onVoirTout={() => setDashView("analyse")}
            />
          </Cadre>
          {/**
            * ⚠️ **Sa hauteur est celle de la rangée des dossiers, pour que les deux se
            * touchent à la même ligne.** Les deux colonnes portent le même écart de huit
            * pixels sous leur premier bloc : à hauteur égale, le haut de cette carte tombe
            * exactement sur le haut de « Vos comptes », et le bas du pavage sur celui de la
            * courbe. Un nombre écrit ici aurait cessé d'être vrai au premier ajustement de
            * l'en-tête ou de la carte — il se déduit donc des deux.
            */}
          <Cadre style={{ padding: "13px 15px", flex: "0 0 auto", height: HAUTEUR_DOSSIERS, display: "flex", flexDirection: "column", overflow: "hidden" }}>
            <PanneauActivite
              portfolioId={portfolio?.id}
              refreshKey={txRefreshKey}
              onVoirTout={() => setDashView("evenements")}
            />
          </Cadre>
        </div>
        </div>
      </div>{/* fin Vue Résumé */}

      {/* ══ VUE ANALYSE ═════════════════════════════════════════════════════════ */}
      <div style={{ display: dashView === "analyse" ? "flex" : "none", height: "100%", flexDirection: "column", overflow: "hidden" }}>
        {/**
          * ⚠️ **Les deux entrées du score vivent ici, et elles ont bien failli disparaître.**
          * Elles étaient logées dans le panneau latéral du résumé — d'abord « Détail du
          * score », puis « Constats » — et en étaient le **seul** point d'accès. En vidant
          * ce panneau pour la troisième fois, on les aurait emportées : le profil de risque
          * serait resté indéclarable et les frais insaisissables, deux piliers du score
          * muets pour toujours, sans qu'aucun écran ne le dise.
          *
          * ⚠️ **Ici plutôt qu'ailleurs, parce que c'est l'écran qui explique la note.** On y
          * vient pour comprendre pourquoi elle vaut ce qu'elle vaut ; c'est le moment exact
          * où l'on veut lui donner ce qui lui manque.
          */}
        <div style={{ padding: `0 ${MARGE}px 10px`, flexShrink: 0 }}>

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
                        <span style={{ color: CLAIR.texte, fontWeight: 600 }}>
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
                        <span style={{ color: CLAIR.texte, fontWeight: mesure ? 500 : 600 }}>
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
                          fontFamily: FONT, fontSize: 10.5, color: CLAIR.texte,
                        }}>Modifier</button>
                    </p>
                  )}
                  {/* ⚠️ **Le lien « Voir le détail du score » a disparu avec le
                      déménagement, et c'est heureux.** Il menait à cet onglet-ci : resté en
                      place, il aurait proposé d'aller là où l'on se trouve déjà. Les sept
                      barres de facteurs qu'il desservait sont juste en dessous. */}
                </>
              );
            })()}
        </div>
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
        // ⚠️ Rembourrage bas à zéro, comme « Vue générale » — il valait dix.
        flexDirection: "column", padding: "14px 14px 0", gap: 12, overflow: "hidden" }}>

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
      {/* ⚠️ **Tout tient d'un coup d'œil sur un écran de taille courante, et la page
          défile en dernier recours.** La maquette regroupe l'information sur un écran, et
          une page qui défile cache ce qu'on est venu comparer : les quatre rangées ont donc
          été resserrées jusqu'à tenir dans 765 pixels, contre 1 044 au départ.

          Mais **comprimer sans plancher a produit pire** : en laissant la courbe absorber
          tout ce qui restait, elle est tombée à quarante pixels sur un écran plus court que
          celui où j'ai réglé — illisible, étiquettes en pâté. Chaque panneau garde donc une
          hauteur minimale, et si la fenêtre ne suffit pas, on défile. Une courbe illisible
          est pire qu'une barre de défilement. */}
      <div style={{ display: dashView === "objectifs" ? "flex" : "none",
        // ⚠️ Écarts à 8 pixels et non 10 : les trois interstices rendent six pixels, soit
        // exactement ce qui manquait aux constats. Le dernier réglage d'un ajustement où
        // chaque panneau se disputait la même hauteur.
        // ⚠️ **Rembourrage bas à zéro, comme « Vue générale ».** Mesuré sur les cinq
        // onglets : Vue générale et Analyse finissent à zéro, Événements à dix, Objectifs à
        // huit. Trois marges différentes pour la même page, dont aucune ne s'était décidée —
        // chacune venait d'un réglage local. C'est celle de Vue générale qui fait foi.
        // ⚠️ **`hidden` et non `auto` : plus de barre de défilement de page sur cet onglet.**
        // Elle apparaissait dès que la fenêtre descendait sous environ 900 pixels de haut,
        // parce que le panneau de projection refuse de comprimer sa courbe sous 150 pixels —
        // à juste titre. Le débordement est donc renvoyé **dans** les deux panneaux de la
        // rangée, qui défilent chacun chez eux. C'est le principe déjà posé ici pour les
        // constats : un panneau qui défile vaut mieux qu'un écran qui défile.
        flexDirection: "column", height: "100%", padding: "12px 14px 0", gap: 8,
        overflow: "hidden" }}>

        {/* ── Rangée 1 : les objectifs ──────────────────────────────────────── */}
        {/* ⚠️ **Ni titre « MES OBJECTIFS » ni bouton « + Nouvel objectif » ici.** Les deux
            ont été retirés pour rendre leur hauteur aux cartes, sur un onglet dont toute la
            mise en page est contrainte par la tenue en un écran. Le titre nommait ce que les
            cartes montrent déjà ; le bouton doublait la tuile « Ajouter un objectif » que la
            grille porte en dernière position, laquelle est visible dans tous les cas — y
            compris quand il n'y a encore aucun objectif, là où ce bouton-ci disparaissait. */}
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
            {/* ⚠️ **L'alerte de répartition a quitté le haut de l'onglet, elle n'a pas
                disparu.** Elle avertit d'un vrai défaut — au-delà de cent pour cent, le même
                euro compte pour plusieurs objectifs, et le total « Déjà constitué » compte
                alors deux fois le portefeuille. La supprimer laisserait un chiffre
                silencieusement gonflé. Elle est donc descendue dans « Progression globale »,
                au pied du nombre qu'elle concerne : c'est là qu'elle sert, et non en bandeau
                au-dessus de cartes qui, elles, sont justes. */}
            <div style={{ flexShrink: 0 }}>
              <CartesObjectifs objectifs={listeObjectifs}
                onAjouter={() => setSaisieObjectif({ mode: "creation" })}
                onModifier={o => setSaisieObjectif({ mode: "edition", o })} />
            </div>
          </>
        )}

        {/* ── Rangée 2 : projection à gauche, deux cartes à droite ──────────── */}
        {/* ⚠️ **La rangée absorbe toute la hauteur restante, au lieu de la subir.** Elle
            était en `flexShrink: 0` : chaque panneau prenait sa hauteur naturelle et leur
            somme décidait s'il fallait défiler — d'où les réglages au pixel de tout cet
            onglet, refaits à chaque changement de contenu. En `flex: 1` avec `minHeight: 0`,
            c'est la fenêtre qui décide et la courbe qui s'adapte : elle mesure déjà son
            conteneur et refuse de descendre sous 150 pixels. L'onglet tient donc par
            construction, à n'importe quelle hauteur d'écran. */}
        <div style={{ display: "grid", gap: 10, flex: 1, minHeight: 0,
          // ⚠️ 1,7 pour 1 et non 2 pour 1 : chaque retour à la ligne évité dans la
          // colonne de droite lui rend une quinzaine de pixels, et c'est là que le
          // contenu manquait de place. La courbe y perd quarante pixels de large, ce
          // qu'elle absorbe sans rien perdre.
          gridTemplateColumns: "minmax(0, 1.7fr) minmax(0, 1fr)" }}>
          {/* ⚠️ `overflowY: auto` avec `minHeight: 0` : c'est ce panneau qui absorbe le
              manque de place, puisque c'est lui qui a un plancher — la courbe ne descend pas
              sous 150 pixels. Sur une fenêtre courte, ce sont ses mentions du bas qui passent
              sous la ligne de flottaison, pas la moitié de l'onglet. */}
          <Cadre style={{ padding: "14px 16px", display: "flex",
            flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
            <ProjectionObjectif
              objectifs={listeObjectifs}
              choisi={projeteEffectif}
              onChoisir={setObjectifProjete}
              projection={projection.projection}
              etat={projection.etat}
              onParametres={o => setSaisieObjectif({ mode: "edition", o })} />
          </Cadre>

          {/* ⚠️ La colonne ne défile pas : c'est « Progression globale » qui absorbe, juste
              en dessous. Mesuré à 780 pixels de fenêtre : avec le défilement ici, les
              83 pixels manquants poussaient le bas de l'aide à la décision hors de vue — or
              c'est le panneau qu'on vient lire. */}
          <div style={{ display: "flex", flexDirection: "column", gap: 10,
            minWidth: 0, minHeight: 0, overflow: "hidden" }}>
            {/* ⚠️ **La progression prend sa hauteur naturelle, les constats absorbent le
                reste** — et cet ordre a été inversé une fois. Avec un partage à parts
                égales, la progression manquait de deux pixels et affichait une barre de
                défilement pour rien ; avec la progression en premier servi mais son
                contenu d'origine, c'était l'inverse et les constats tombaient à leur seul
                titre. Après compression des deux, la progression tient en 150 pixels et il
                en reste plus de 200 pour les constats, qui en réclament 185. */}
            {/* ⚠️ **C'est ce panneau qui cède, et le choix est délibéré.** Son contenu est le
                plus variable de la colonne — trois mises en garde qui apparaissent selon les
                données — et l'aide à la décision, à hauteur fixe depuis qu'elle ne montre
                qu'une aide à la fois, doit rester entière. `flexShrink` implicite à 1, donc,
                et un défilement interne en dernier recours. */}
            {/* ⚠️ **Elle grandit désormais, en plus de céder.** L'aide à la décision
                absorbait toute la hauteur libre de la colonne et se retrouvait avec des
                centaines de pixels de vide à l'intérieur ; elle prend maintenant sa hauteur
                juste. Sans ce `flexGrow`, la place ainsi rendue s'ouvrirait en trou au bas
                de la colonne. La progression a de quoi l'employer — elle défile dès que son
                contenu dépasse — et elle reste celle qui cède quand la place manque, son
                `flexShrink` implicite étant inchangé. */}
            <Cadre style={{ padding: "14px 16px", display: "flex", flexGrow: 1,
              flexDirection: "column", minHeight: 0, overflowY: "auto" }}>
              <ProgressionGlobale objectifs={listeObjectifs}
                sommeDesParts={objectifs.donnees?.somme_des_parts ?? null} />
            </Cadre>
            {/* ⚠️ **Le panneau porte son propre `Cadre`**, contrairement à ses deux voisins
                qui reçoivent le leur ici. Son dégradé remplace le fond de la carte
                intérieure, et il ne peut le faire qu'en ayant la main sur le cadre. Le
                résultat est identique de l'extérieur : mêmes rayons, même anneau, même
                liseré gris.

                ⚠️ Seule carte à défiler, et c'est un arbitrage assumé : les constats sont
                du texte, leur nombre varie avec les paramètres saisis, et les laisser
                pousser la rangée ferait défiler la page entière. Un panneau qui défile
                vaut mieux qu'un écran qui défile. */}
            {/* ⚠️ Le contexte du portefeuille descend jusqu'ici : la somme des parts décide de
                l'insight de chevauchement, la volatilité mesurée de ceux de risque. Sans eux,
                deux familles sur neuf se taisent — et c'est justement celles qui portent les
                priorités « critique ». */}
            <ConstatsObjectif
              couleurAvatar={couleurAvatar}
              formeAvatar={formeAvatar}
              skinAvatar={skinAvatar}
              objectif={listeObjectifs.find(o => o.id === projeteEffectif) ?? null}
              valeurPortefeuille={objectifs.donnees?.valeur_portefeuille ?? null}
              medianeProjection={projection.projection?.possible
                ? projection.projection.mediane : null}
              tousLesObjectifs={listeObjectifs}
              sommeDesParts={objectifs.donnees?.somme_des_parts ?? null}
              volatilite={projection.projection?.possible
                ? projection.projection.volatilite : null}
              volatiliteSource={projection.projection?.possible
                ? projection.projection.volatilite_source : null}
              seancesMesurees={projection.projection?.possible
                ? projection.projection.seances_mesurees : null} />
          </div>
        </div>

        {/* ⚠️ **La rangée « Dispersion des tirages » a été retirée.** Elle détaillait les
            trois centiles en trois cartes, ce que la courbe au-dessus dessine déjà avec sa
            bande et sa légende ; elle coûtait cent cinquante-cinq pixels, soit la moitié de
            ce qui manquait pour que l'onglet tienne sur un écran. Le composant
            `ScenariosObjectif` reste dans le dépôt : c'est lui qui portait aussi la
            comparaison des rythmes de versement pour un plafond, et l'y remettre demandera
            de décider où, non de le réécrire. */}

      </div>{/* fin Vue Objectifs */}

      {/* ⚠️ Monté hors des vues : un formulaire rendu à l'intérieur d'un onglet caché
          par `display: none` reste dans l'arbre mais invisible, et la saisie paraîtrait
          perdue. Ici il se superpose à la page, quelle que soit la vue active. */}
      {saisieObjectif && objectifs.donnees && (
        <FormulaireObjectif
          initial={saisieObjectif.mode === "edition" ? saisieObjectif.o : null}
          anneeNaissanceConnue={objectifs.donnees.annee_naissance_connue}
          suggestions={suggestions}
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

      {formCompte && (
        <FormulaireCompte
          /* ⚠️ La clé remonte le formulaire d'un compte à l'autre : ses champs sont un état
             local initialisé au montage, et sans elle on rouvrirait « Livret A » rempli avec
             les valeurs du compte regardé juste avant.

             ⚠️ **Le solde entre dans la clé, et ce n'est pas un raffinement.** Enregistrer un
             versement change le solde côté serveur ; le champ, lui, gardait la valeur du
             montage — 5 000 € affichés au-dessus d'un journal annonçant +500 €. Le danger
             n'était pas l'affichage : c'était qu'un clic sur « Enregistrer » réécrive
             l'ancien montant et annule le versement en silence. Vu à l'écran. */
          key={`${compteEdite?.id ?? prereglage?.nom ?? "nouveau"}:${compteEdite?.solde ?? ""}`}
          genres={genresCompte} initial={compteEdite}
          prerempli={prereglage ?? undefined}
          titre={prereglage ? `Déclarer votre ${prereglage.nom}` : undefined}
          mention={aRattacher.length > 0
            ? (aRattacher.length === 1
                ? "L\u2019opération de ce dossier sera rattachée à ce compte."
                : `Les ${aRattacher.length} opérations de ce dossier seront rattachées à ce compte.`)
            : undefined}
          enCours={compteEnCours} erreur={erreurCompte}
          onEnregistrer={enregistrerLeCompte}
          onSupprimer={compteEdite ? supprimerLeCompte : undefined}
          /* ⚠️ Réservé à la correction d'un compte qui a un solde : on ne peut pas verser
             sur un compte qui n'existe pas encore, ni sur un compte dont on n'a jamais
             saisi les liquidités. */
          journal={compteEdite && compteEdite.solde != null ? (
            <JournalCompte
              mouvements={journal}
              enCours={journalEnCours}
              erreur={erreurJournal}
              onEnregistrer={verserSurLeCompte}
              onSupprimer={retirerUnMouvement}
            />
          ) : undefined}
          onFermer={() => {
            setFormCompte(false); setCompteEdite(null); setErreurCompte(null);
            setPrereglage(null); setARattacher([]);
          }}
        />
      )}
      {/* ⚠️ Retrouvé dans la liste vivante plutôt que gardé en copie : les dossiers se
          reconstruisent à chaque cours reçu, et une copie aurait montré la couleur d'avant
          le premier choix. S'il a disparu entre-temps, la palette se ferme d'elle-même. */}
      {(() => {
        const d = dossiers.find(x => x.cle === dossierAColorer);
        if (!d) return null;
        return (
          <PaletteDossier
            nom={d.nom}
            couleur={d.couleur}
            surMesure={couleursChoisies[d.genre] != null}
            lignes={d.lignes.length}
            /* ⚠️ La palette ne se referme pas sur le choix. Comparer deux teintes demande de
               les essayer l'une après l'autre : refermer à chaque clic obligerait à rouvrir
               pour changer d'avis, et le dossier n'est de toute façon visible qu'en fermant. */
            onChoisir={hex => recolorerLeDossier(d.genre, hex)}
            onReinitialiser={() => recolorerLeDossier(d.genre, null)}
            onDeclarer={() => declarerLeDossier(d.cle)}
            onFermer={() => setDossierAColorer(null)}
          />
        );
      })()}
      {showTxModal && (
        <TransactionModal
          portfolioId={portfolio?.id ?? ""}
          isOpen={showTxModal}
          onClose={() => { setShowTxModal(false); setSaisieDansLeDossier(false); }}
          onSuccess={() => {
            setShowTxModal(false); setSaisieDansLeDossier(false);
            setTxRefreshKey(k => k + 1);
          }}
          /* ⚠️ Les comptes de trésorerie sont écartés : sur un livret, le solde *est* la
             valeur, et y ranger un achat compterait la somme deux fois. Le serveur le
             refuse, mais un choix impossible n'a pas à être proposé. */
          /**
            * ⚠️ **Les dossiers devinés figurent dans la liste, aux côtés des comptes
            * déclarés.** L'écran montre « PEA » et « CTO » : répondre à la saisie « vous
            * n'avez déclaré aucun compte » revenait à nier ce qu'il venait d'afficher, et à
            * n'offrir que d'en créer un — signalé à l'usage, à juste titre.
            *
            * ⚠️ **Les dossiers de trésorerie sont écartés des deux côtés.** Sur un livret,
            * le solde *est* la valeur, et y ranger un achat compterait la somme deux fois.
            */
          comptes={dossiers.filter(d => d.porteDesTitres).map(d => ({
            id: d.compteId ?? d.cle,
            nom: d.nom,
            couleur: d.couleur,
            aDeclarer: !d.declare,
            lignes: d.lignes.length,
          }))}
          resoudreLeCompte={async (choix) => (
            choix.startsWith("deduit:") ? declarerMaintenant(choix) : choix
          )}
          /**
            * ⚠️ **Imposé seulement quand la saisie part d'un dossier, pas parce qu'un
            * dossier est resté ouvert.** `dossierActif` survit au changement d'onglet :
            * ouvrir la saisie depuis Transactions aurait alors rangé l'opération dans le
            * dossier qu'on regardait sur la vue générale, sans l'avoir demandé.
            */
          compteImpose={saisieDansLeDossier && dossierActif?.declare && dossierActif.porteDesTitres
            ? { id: dossierActif.compteId!, nom: dossierActif.nom, couleur: dossierActif.couleur }
            : undefined}
          onDeclarerCompte={() => {
            setShowTxModal(false);
            setErreurCompte(null); setCompteEdite(null);
            setPrereglage(null); setARattacher([]);
            setFormCompte(true);
          }}
        />
      )}
    </div>
  );
}

/**
 * Les pictogrammes des dossiers, par nature de compte.
 *
 * ⚠️ **Un seul jeu pour les comptes déclarés et pour les comptes déduits.** Les deux
 * sortes se côtoient dans la même rangée : un PEA deviné et un PEA déclaré doivent porter
 * le même signe, sinon la rangée raconte une différence qui n'a de sens que pour le code.
 * Trois dessins servaient auparavant les comptes déduits et un quatrième, à part, les
 * comptes déclarés — ils avaient déjà divergé.
 *
 * ⚠️ **Le PEA et le compte-titres partagent le leur.** Ce sont deux enveloppes fiscales
 * sur la même chose, des titres : leur différence est un régime d'imposition, pas une
 * nature d'objet, et aucun pictogramme ne sait dessiner un plafond de versement. Le nom
 * du dossier suffit à les distinguer.
 *
 * ⚠️ **Ils tiennent tous dans la boîte de 24, et se rendent à 28.** Les tracés viennent
 * d'un même jeu et partagent donc leur graisse optique ; en mélanger d'autres origines
 * donnerait des traits d'épaisseurs différentes à la même taille.
 */
const TAILLE_ICONE = 28;

const ICONE_BANQUE = (
  <svg width={TAILLE_ICONE} height={TAILLE_ICONE} viewBox="0 0 24 24" fill="none"
    stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
    aria-hidden="true">
    <path d="M3 21h18M3 10h18M5 6l7-3 7 3M4 10v11m16-11v11M8 14v3m4-3v3m4-3v3" />
  </svg>
);

const ICONE_TITRES = (
  <svg width={TAILLE_ICONE} height={TAILLE_ICONE} viewBox="0 0 24 24" fill="currentColor"
    aria-hidden="true">
    <path d="M19.5 2.25a.75.75 0 0 1 .75.75v3h-1.5V4.856l-.008.01c-.002 0 .002-.003 0 0l-.009.008a24 24 0 0 1-2.603 2.169c-2.373 1.731-6.067 3.894-11.393 5.669a.75.75 0 0 1-.474-1.424c5.174-1.725 8.73-3.812 10.982-5.456a23 23 0 0 0 2.47-2.06l.021-.022H16.5a.75.75 0 0 1 0-1.5zM7.238 20.099c.012-.171.012-.376.012-.599v-3c0-.223 0-.428-.012-.599a1.8 1.8 0 0 0-.12-.57 1.75 1.75 0 0 0-.948-.948 1.8 1.8 0 0 0-.571-.121A9 9 0 0 0 5 14.25c-.223 0-.428 0-.599.012a1.8 1.8 0 0 0-.57.12 1.75 1.75 0 0 0-.948.948 1.8 1.8 0 0 0-.121.571c-.012.171-.012.376-.012.599v3c0 .223 0 .428.012.599.012.177.039.373.12.57.178.43.52.77.948.948.198.082.394.11.571.121.171.012.376.012.599.012s.428 0 .599-.012c.177-.012.373-.039.57-.12a1.75 1.75 0 0 0 .948-.948 1.8 1.8 0 0 0 .121-.571M14.25 19.5c0 .223 0 .428-.012.599a1.8 1.8 0 0 1-.12.57 1.75 1.75 0 0 1-.948.948 1.8 1.8 0 0 1-.571.121c-.171.012-.376.012-.599.012s-.428 0-.599-.012a1.8 1.8 0 0 1-.57-.12 1.75 1.75 0 0 1-.948-.948 1.8 1.8 0 0 1-.121-.571 9 9 0 0 1-.012-.599V14c0-.223 0-.428.012-.599a1.8 1.8 0 0 1 .12-.57 1.75 1.75 0 0 1 .948-.948c.198-.082.394-.11.571-.121.171-.012.376-.012.599-.012s.428 0 .599.012c.177.012.373.039.57.12.43.178.77.52.948.948.082.198.11.394.121.571.012.171.012.376.012.599zM21.238 20.099c.012-.171.012-.376.012-.599v-9c0-.223 0-.428-.012-.599a1.8 1.8 0 0 0-.12-.57 1.75 1.75 0 0 0-.948-.948 1.8 1.8 0 0 0-.571-.121A9 9 0 0 0 19 8.25c-.223 0-.428 0-.599.012a1.8 1.8 0 0 0-.57.12 1.75 1.75 0 0 0-.948.948 1.8 1.8 0 0 0-.121.571 9 9 0 0 0-.012.599v9c0 .223 0 .428.012.599.012.177.039.373.12.57.178.43.52.77.948.948.198.082.394.11.571.121.171.012.376.012.599.012s.428 0 .599-.012c.177-.012.373-.039.57-.12a1.75 1.75 0 0 0 .948-.948c.082-.198.11-.394.121-.571" />
  </svg>
);

const ICONE_CRYPTO = (
  <svg width={TAILLE_ICONE} height={TAILLE_ICONE} viewBox="0 0 24 24" fill="currentColor"
    aria-hidden="true">
    <path d="M16.875 3.556A9.75 9.75 0 1 1 2.25 12l.005-.316a9.75 9.75 0 0 1 14.62-8.128m-3.9 2.594a.975.975 0 0 0-.975.975h-.975a.975.975 0 1 0-1.95 0 .975.975 0 1 0 0 1.95v5.85a.975.975 0 1 0 0 1.95c0 1.3 1.95 1.3 1.95 0H12a.975.975 0 1 0 1.95 0v-.146c1.138-.385 1.95-1.49 1.95-2.78l-.005-.17a3 3 0 0 0-.715-1.781c.448-.519.72-1.202.72-1.948 0-1.29-.812-2.395-1.95-2.779v-.146a.975.975 0 0 0-.975-.975m.088 6.825c.48 0 .887.426.887.975s-.407.975-.887.975h-2.038v-1.95zm0-3.9c.48 0 .887.426.887.975 0 .509-.351.913-.786.968l-.101.007h-2.038v-1.95z" />
  </svg>
);

/**
 * Le pictogramme d'un compte **déclaré**, d'après son genre.
 *
 * ⚠️ **Indexé sur `string` et non sur une union, parce que les genres viennent du
 * serveur.** Une union figerait ici une liste que `GENRES_COMPTE` peut allonger sans
 * toucher au client ; le compilateur garantirait une exhaustivité qui n'existe pas. D'où
 * le repli sur la banque à l'usage : un genre inconnu porte le signe le plus neutre plutôt
 * que pas de signe du tout.
 */
const ICONE_PAR_GENRE: Record<string, React.ReactNode> = {
  courant: ICONE_BANQUE,
  epargne: ICONE_BANQUE,
  pea: ICONE_TITRES,
  cto: ICONE_TITRES,
  crypto: ICONE_CRYPTO,
};

/**
 * Les comptes, dans l'ordre où on les montre, avec leur couleur et leur pictogramme.
 *
 * ⚠️ **L'ordre est fiscal, pas alphabétique** : le PEA d'abord parce que c'est
 * l'enveloppe contrainte — celle dont on veut vérifier le contenu — puis le
 * compte-titres qui accepte tout, puis la crypto qui n'est ni l'un ni l'autre.
 *
 * ⚠️ **Un `Record` sur `Enveloppe`, et non une liste de clés libres.** Une quatrième
 * enveloppe ajoutée à `compteInfere` sans dossier ici ferait *disparaître* des actifs
 * de la page sans rien signaler ; le `Record` refuse de compiler tant qu'elle n'a pas
 * sa couleur et son pictogramme. L'ordre, lui, reste indicatif — voir `comptes`, qui
 * range en queue tout compte que cette liste aurait oublié plutôt que de le perdre.
 */
/**
 * Le genre serveur qui correspond à une enveloppe déduite.
 *
 * ⚠️ **La couture entre deux vocabulaires, et il vaut mieux qu'elle soit visible.** Le
 * client range les lignes dans des `Enveloppe` — « PEA », « CTO », « Crypto » — que lui
 * seul connaît, puisqu'elles sont déduites d'une place de cotation. Le serveur, lui, ne
 * connaît que ses `GENRES_COMPTE` en minuscules, et c'est sur eux qu'il valide les couleurs
 * qu'on lui confie. Écrire `cle.toLowerCase()` aurait marché sur les trois d'aujourd'hui et
 * cassé au premier nom composé, sans rien dire.
 */
const GENRE_DE: Record<Enveloppe, string> = { PEA: "pea", CTO: "cto", Crypto: "crypto" };

/**
 * La hauteur de la rangée des dossiers, en-tête compris.
 *
 * ⚠️ **Déduite des trois nombres qui la composent, jamais écrite.** Vingt-six pixels
 * d'en-tête — ceux du bouton de tri de la grille —, dix d'écart, puis la carte elle-même.
 * Un 232 posé en dur aurait cessé d'être vrai au premier de ces trois qui bouge, et le
 * désalignement se serait vu sans qu'on sache d'où il vient.
 *
 * ⚠️ **Elle vaut aussi pour la grille d'un dossier ouvert**, dont l'en-tête fait les mêmes
 * vingt-six pixels et les cartes la même hauteur : c'est l'invariant qui empêche la courbe
 * de changer de taille quand on ouvre un dossier.
 */
const HAUTEUR_DOSSIERS = 26 + 10 + CARTE_COMPTE.hauteur;

const HABILLAGE_COMPTES: Record<Enveloppe, { couleur: string; icone: React.ReactNode }> = {
  PEA: { couleur: "#5B6CF0", icone: ICONE_TITRES },
  CTO: { couleur: "#9B5BD6", icone: ICONE_TITRES },
  Crypto: { couleur: "#E0A23C", icone: ICONE_CRYPTO },
};

/**
 * Combien de cartes le dossier laisse voir.
 *
 * Trois : au-delà, les tranches empilées se confondent en une masse, et la troisième
 * ne dépasse déjà que de sept pixels. Le compte exact reste sur la pastille.
 */
/**
 * ⚠️ **Le plafond vient du dossier, il n'est pas redécidé ici.** La largeur d'un dossier se
 * déduit du nombre de cartes qu'il laisse voir : une seconde constante aurait pu la
 * contredire, et le dossier aurait alors rogné ses propres aperçus ou gardé du vide.
 */
const APERCUS_PAR_DOSSIER = APERCUS_MAX;

/** L'ordre d'affichage, indicatif : ce qui n'y figure pas passe en queue, pas à la trappe. */
const ORDRE_COMPTES: Enveloppe[] = ["PEA", "CTO", "Crypto"];

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
