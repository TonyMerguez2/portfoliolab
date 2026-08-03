"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart, AreaSeries, CandlestickSeries, ColorType, CrosshairMode, LineStyle,
  type IChartApi, type ISeriesApi, type UTCTimestamp,
} from "lightweight-charts";
import type { HistoryPoint, Period } from "@/lib/chart/portfolioCurve";
import { FONT, NUM } from "@/lib/typography";
import { enTetesAuth } from "@/lib/session";
import { COULEUR_OP, COULEUR_OP_CLAIR } from "@/lib/journal";
import { useModeTheme, resoudreJeton } from "@/lib/theme";
import { RAYONS } from "@/lib/palette";

export type { HistoryPoint, Period };

/**
 * Courbe de valeur du portefeuille.
 *
 * Sur lightweight-charts, comme la page graphique, et non sur un tracé SVG
 * maison : c'est la seule façon d'obtenir *exactement* la même échelle à
 * droite, la même pastille de dernière valeur et la même croix de visée. Deux
 * implémentations auraient divergé au premier réglage, et le même portefeuille
 * se serait lu différemment selon la page.
 *
 * La série vient de `/portfolio-history`, en base 1 au début de la fenêtre.
 * C'est ici qu'on la ramène en euros, en clouant le *dernier* point sur la
 * valeur totale — le seul montant que l'utilisateur connaisse pour de vrai.
 * L'ancrer au début produirait une courbe finissant à côté du chiffre affiché
 * juste au-dessus d'elle.
 */

// Mêmes périodes et mêmes libellés que la page graphique : le même portefeuille
// doit s'interroger avec les mêmes mots d'un écran à l'autre.
const PERIOD_API: Record<Period, string> = {
  "24h": "1d", "1S": "7d", "1M": "1mo", "3M": "3mo",
  "6M": "6mo", "1A": "1y", "3A": "3y", "Max": "max",
};
const PERIODES = Object.keys(PERIOD_API) as Period[];
const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

/** Demi-largeur, en pixels, de la portion de courbe éclairée au survol. */
const HALO = 22;

/**
 * Pictogramme d'une opération.
 *
 * Trois cercles de couleurs différentes demandent de retenir un code ; une
 * flèche montante, un plus et une flèche descendante se lisent sans légende.
 */
function Pictogramme({ type }: { type: string }) {
  const commun = {
    // 10 unités rendues sur 10 pixels : un trait de 2 unités fait exactement
    // 2 pixels, sans lissage. À 9 px, il en faisait 1,8 et bavait.
    width: 10, height: 10, viewBox: "0 0 10 10", fill: "none",
    stroke: "currentColor", strokeWidth: 2,
    strokeLinecap: "round" as const, strokeLinejoin: "round" as const,
    // Sans `display: block`, le SVG reste en ligne et s'aligne sur la ligne de
    // base : il se posait deux pixels sous le centre du cercle.
    style: { display: "block" },
  };
  if (type === "vente") {
    return <svg {...commun}><path d="M5 1.5v7M2 5.5l3 3 3-3" /></svg>;
  }
  if (type === "renforcement") {
    return <svg {...commun}><path d="M5 1.5v7M1.5 5h7" /></svg>;
  }
  return <svg {...commun}><path d="M5 8.5v-7M2 4.5l3-3 3 3" /></svg>;
}

/** Types d'opération jalonnés sur la courbe, dans l'ordre où on les lit. */
const LEGENDE = [
  // `largeur` est déclarée pour que chaque vignette démarre sur un pixel
  // entier : une largeur laissée au texte est fractionnaire, et décale tout ce
  // qui suit.
  { type: "achat",        libelle: "Achat",        largeur: 62 },
  { type: "renforcement", libelle: "Renforcement", largeur: 106 },
  { type: "vente",        libelle: "Vente",        largeur: 62 },
];

/**
 * L'habillage du canevas : texte, grille, réticule.
 *
 * lightweight-charts peint sur un canevas et ne sait pas résoudre `var(...)`.
 * Ces couleurs sont donc écrites en clair, et regroupées ici parce qu'elles
 * servent deux fois — à la création du graphique, et à chaque changement de
 * thème, le graphique n'étant créé qu'une seule fois.
 */
function habillage(clair: boolean) {
  return {
    layout: {
      attributionLogo: false,
      background: { type: ColorType.Solid, color: "transparent" },
      textColor: clair ? "rgba(15,23,42,0.48)" : "rgba(248,249,252,0.42)",
      fontSize: 11,
    },
    grid: {
      vertLines: { visible: false },
      horzLines: {
        color: clair ? "rgba(15,23,42,0.07)" : "rgba(255,255,255,0.045)",
        style: LineStyle.Solid, visible: true,
      },
    },
    crosshair: {
      mode: CrosshairMode.Normal,
      vertLine: { color: clair ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.2)",
                  style: LineStyle.Solid, width: 1 as const,
                  labelBackgroundColor: clair ? "#0F172A" : "#334155" },
      horzLine: { color: clair ? "rgba(15,23,42,0.25)" : "rgba(255,255,255,0.2)",
                  style: LineStyle.Solid, width: 1 as const,
                  labelBackgroundColor: clair ? "#0F172A" : "#334155" },
    },
  };
}

/** La couleur d'un type d'opération, selon le thème. */
function couleurOp(type: string, clair: boolean): string {
  const t = type as keyof typeof COULEUR_OP;
  return (clair ? COULEUR_OP_CLAIR : COULEUR_OP)[t] ?? (clair ? "#0B63E7" : "var(--nv-accent)");
}

/**
 * Regroupe la série en bougies.
 *
 * L'ouverture, le sommet, le creux et la clôture sont tirés des **valeurs
 * réelles du portefeuille** contenues dans chaque paquet. C'est important :
 * composer la bougie à partir des plus hauts de chaque ligne donnerait une
 * borne supérieure et non un vrai sommet — AAPL peut culminer à 10 h et NVDA à
 * 15 h, le portefeuille n'a jamais valu la somme des deux.
 *
 * La contrepartie est que le sommet vaut celui des points échantillonnés : sur
 * une série de clôtures journalières, les extrêmes intraday manquent. C'est la
 * limite ordinaire de toute bougie construite sur des clôtures.
 */
function agregerEnBougies(
  data: { time: UTCTimestamp; value: number }[],
  cible = 60,
): { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] {
  if (data.length < 2) return [];
  const taille = Math.max(1, Math.ceil(data.length / cible));
  const out: { time: UTCTimestamp; open: number; high: number; low: number; close: number }[] = [];
  for (let i = 0; i < data.length; i += taille) {
    const paquet = data.slice(i, i + taille);
    const valeurs = paquet.map(p => p.value);
    out.push({
      time: paquet[0].time,
      open: valeurs[0],
      high: Math.max(...valeurs),
      low: Math.min(...valeurs),
      close: valeurs[valeurs.length - 1],
    });
  }
  return out;
}

/** Abrégé des grands nombres, comme sur la page graphique. */
function fmtPct(pct: number): string {
  const signe = pct >= 0 ? "+" : "";
  const abs = Math.abs(pct);
  if (abs >= 10000) return `${signe}${(pct / 1000).toFixed(0)}k%`;
  if (abs >= 1000) return `${signe}${pct.toFixed(0)}%`;
  return `${signe}${pct.toFixed(1)}%`;
}

/** Fenêtres en secondes, pour découper la série Max période par période. */
const PERIOD_SECS: Record<Period, number | null> = {
  "24h": 86400, "1S": 604800, "1M": 2592000, "3M": 7862400,
  "6M": 15811200, "1A": 31536000, "3A": 94608000, "Max": null,
};

export default function PerformanceChart({
  assets, totalValue, period, onPeriodChange, color = "var(--nv-accent)", height,
  portfolioId, surTransactions = false, operations = [], onOperationClick,
}: {
  assets: { ticker: string; weight: number }[];
  totalValue: number | null;
  period: Period;
  onPeriodChange: (p: Period) => void;
  color?: string;
  height?: number;
  /**
   * Portefeuille dont on trace la trajectoire réelle. Sans lui, la courbe
   * simule un achat-conservation aux pondérations courantes.
   */
  portfolioId?: string;
  /**
   * Vrai quand les positions viennent des transactions. La courbe part alors
   * de la première opération, au lieu de remonter à la création du plus ancien
   * fonds — un PEA ouvert en février affichait sinon « +371 % sur tout
   * l'historique ».
   */
  surTransactions?: boolean;
  /**
   * Opérations à jalonner sur la courbe. Une pastille par écriture, à sa date,
   * de la couleur de son type — un versement ne se lit pas sur la courbe seule,
   * qui monte aussi bien parce qu'on a versé que parce que le marché a monté.
   */
  operations?: { id: number; ticker: string; executed_at: string; type: string; couleur: string; libelle: string }[];
  /** Appelé au clic sur un repère, avec l'identifiant de l'écriture. */
  onOperationClick?: (id: number) => void;
}) {
  // Le thème se lit à la source plutôt que de descendre en props : le
  // graphique est utilisé par la vue générale et par l'onglet Transactions, et
  // les deux n'avaient aucune raison de le lui rappeler.
  const clair = useModeTheme() === "clair";
  const boxRef = useRef<HTMLDivElement>(null);
  const plotRef = useRef<HTMLDivElement>(null);
  const glowRef = useRef<HTMLCanvasElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const serieRef = useRef<ISeriesApi<"Area"> | null>(null);
  const bougieRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const colorRef = useRef(color);
  const clairRef = useRef(clair);

  const [points, setPoints] = useState<HistoryPoint[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("loading");
  const [survol, setSurvol] = useState<{ valeur: number; date: string } | null>(null);
  const [mode, setMode] = useState<"ligne" | "bougie">("ligne");
  /** Date de la première transaction, quand la courbe en vient. */
  const [origine, setOrigine] = useState<string | null>(null);
  /** Titres détenus dont le cours n'a pas pu être établi. */
  const [sansCours, setSansCours] = useState<string[]>([]);
  /** Position à l'écran de chaque repère d'opération, en pixels du cadre. */
  useEffect(() => {
    clairRef.current = clair;
    // Le graphique n'est créé qu'une fois : sans cette réapplication, la
    // grille et le réticule resteraient dans les couleurs du thème de départ.
    chartRef.current?.applyOptions(habillage(clair));
  }, [clair]);

  const [pastilles, setPastilles] = useState<{ id: number; x: number; y: number; titre: string; nombre: number; type: string }[]>([]);

  // ── Données ────────────────────────────────────────────────────────────────
  const key = assets.map(a => `${a.ticker}:${a.weight}`).join(",");
  useEffect(() => {
    if (!assets.length) { setPoints([]); setState("idle"); return; }
    let cancelled = false;
    setState("loading");
    const tickers = assets.map(a => a.ticker).join(",");
    const weights = assets.map(a => a.weight).join(",");
    const url = surTransactions && portfolioId
      ? `${API}/api/v1/portfolios/${portfolioId}/history?period=${PERIOD_API[period]}`
      : `${API}/api/v1/portfolio-history?tickers=${encodeURIComponent(tickers)}&weights=${encodeURIComponent(weights)}&period=${PERIOD_API[period]}`;
    fetch(url, { headers: enTetesAuth() })
      .then(r => r.json())
      .then((d: { points?: HistoryPoint[]; start?: string | null; sans_cours?: string[] }) => {
        if (cancelled) return;
        const pts = Array.isArray(d.points) ? d.points : [];
        setPoints(pts);
        if (d.start) setOrigine(d.start);
        // Le serveur refuse de tracer plutôt que d'omettre un titre dont le
        // cours manque : il vaudrait alors zéro dans la somme, et la courbe
        // montrerait une perte inexistante. On dit lequel.
        setSansCours(Array.isArray(d.sans_cours) ? d.sans_cours : []);
        setState(pts.length ? "idle" : "error");
      })
      .catch(() => { if (!cancelled) { setPoints([]); setState("error"); } });
    return () => { cancelled = true; };
  }, [key, period, portfolioId, surTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Rendements par période ─────────────────────────────────────────────────
  //
  // Un appel par période, et non une seule série Max qu'on découperait.
  //
  // La tentation était forte — un appel au lieu de huit — mais les deux ne
  // décrivent pas le même portefeuille. La série renvoyée pour une fenêtre
  // applique les pondérations courantes *au début de cette fenêtre* ; découper
  // la série Max donne, elle, ce qu'un achat-conservation de 2020 vaut
  // aujourd'hui, poids dérivés compris. Mesuré sur douze lignes : +10,2 % sur
  // un an par appel direct, -25,3 % par découpe de Max. Signes opposés.
  //
  // Et c'est bien le premier qu'il faut afficher, puisque c'est la série que
  // la courbe trace au-dessus du chiffre.
  const [rendements, setRendements] = useState<Record<Period, number | null>>(
    () => Object.fromEntries(PERIODES.map(p => [p, null])) as Record<Period, number | null>);

  useEffect(() => {
    if (!assets.length) return;
    let cancelled = false;
    const tickers = encodeURIComponent(assets.map(a => a.ticker).join(","));
    const weights = encodeURIComponent(assets.map(a => a.weight).join(","));
    Promise.all(PERIODES.map(p => {
      const u = surTransactions && portfolioId
        ? `${API}/api/v1/portfolios/${portfolioId}/history?period=${PERIOD_API[p]}`
        : `${API}/api/v1/portfolio-history?tickers=${tickers}&weights=${weights}&period=${PERIOD_API[p]}`;
      return fetch(u, { headers: enTetesAuth() })
        .then(r => r.json())
        // Sur transactions, c'est le TWR qu'il faut lire : `change` compterait
        // les versements de la période comme performance.
        .then((d: { change?: number | null; twr_pct?: number | null }) => {
          const v = surTransactions ? d.twr_pct : d.change;
          return [p, typeof v === "number" ? v : null] as const;
        })
        .catch(() => [p, null] as const);
    })).then(paires => {
      if (!cancelled) setRendements(Object.fromEntries(paires) as Record<Period, number | null>);
    });
    return () => { cancelled = true; };
  }, [key, portfolioId, surTransactions]); // eslint-disable-line react-hooks/exhaustive-deps

  /**
   * Place les pastilles d'opération au-dessus de la courbe.
   *
   * Recalculé à chaque déplacement ou redimensionnement : les coordonnées sont
   * des pixels, elles ne survivent pas à un changement de fenêtre. Une
   * opération hors de la plage visible n'a pas de coordonnée — elle disparaît,
   * ce qui est juste.
   */
  useEffect(() => {
    const chart = chartRef.current, serie = serieRef.current, el = plotRef.current;
    if (!chart || !serie || !el || !operations.length || !points.length) { setPastilles([]); return; }

    const dernier = points[points.length - 1].value || 1;
    const echelle = (totalValue ?? 0) > 0 ? totalValue! / dernier : 1;
    const valeurAu = new Map(points.map(p => [p.date.slice(0, 10), p.value * echelle]));
    const jours = points.map(p => p.date.slice(0, 10));

    const calculer = () => {
      // Regroupement par jour et par type.
      //
      // Quatre renforcements le même jour partagent date et valeur : leurs
      // pastilles se posaient exactement l'une sur l'autre, indiscernables
      // d'une seule mais quatre fois plus opaques. Une pastille par groupe,
      // qui dit combien d'opérations elle couvre.
      const groupes = new Map<string, { op: typeof operations[number]; jour: string; n: number; tickers: Set<string> }>();
      for (const op of operations) {
        const jour = op.executed_at.slice(0, 10);
        // Le premier jour coté à partir de la date de l'opération : une
        // écriture passée un samedi n'a pas de point à elle.
        const cible = valeurAu.has(jour) ? jour : jours.find(j => j >= jour);
        if (!cible) continue;
        const cle = `${cible}|${op.type}`;
        const g = groupes.get(cle);
        if (g) { g.n += 1; g.tickers.add(op.ticker); }
        else groupes.set(cle, { op, jour: cible, n: 1, tickers: new Set([op.ticker]) });
      }

      const out: { id: number; x: number; y: number; titre: string; nombre: number; type: string }[] = [];
      for (const g of Array.from(groupes.values())) {
        const t = Math.floor(new Date(g.jour + "T00:00:00Z").getTime() / 1000) as UTCTimestamp;
        const x = chart.timeScale().timeToCoordinate(t);
        const v = valeurAu.get(g.jour);
        const y = v == null ? null : serie.priceToCoordinate(v);
        if (x == null || y == null) continue;
        const quand = new Date(g.op.executed_at).toLocaleDateString("fr-FR");
        out.push({
          // Coordonnées entières.
          //
          // La bibliothèque rend des positions fractionnaires — 462,443 px. Le
          // contour de 2 px et le pictogramme se répartissaient alors sur deux
          // rangées de pixels : le cerne paraissait plus épais d'un côté et le
          // signe décentré, alors qu'il est géométriquement au milieu.
          id: g.op.id, x: Math.round(x), y: Math.round(y),
          nombre: g.n, type: g.op.type,
          titre: g.n === 1
            ? `${g.op.libelle} ${g.op.ticker} — ${quand}`
            : `${g.n} ${g.op.libelle.toLowerCase()}s (${Array.from(g.tickers).join(", ")}) — ${quand}`,
        });
      }
      setPastilles(out);
    };

    calculer();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(calculer);
    const ro = new ResizeObserver(calculer);
    ro.observe(el);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(calculer);
      ro.disconnect();
    };
  }, [operations, points, totalValue, mode]);

  // ── Création du graphique ──────────────────────────────────────────────────
  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const chart = createChart(el, {
      autoSize: true,
      ...habillage(clairRef.current),
      // Échelle à droite, sans bordure et avec les mêmes marges que la page
      // graphique : c'est là que lightweight-charts pose la pastille de
      // dernière valeur.
      rightPriceScale: { borderVisible: false, scaleMargins: { top: 0.12, bottom: 0.08 } },
      // Bords fixés : sans eux, la molette emmène la courbe dans le vide, des
      // mois de blanc à droite ou à gauche de données qui n'existent pas.
      // Compatible avec le cadrage en [0,5 ; n−1,5], qui reste à l'intérieur
      // de la plage réelle.
      timeScale: {
        borderVisible: false, timeVisible: false, secondsVisible: false,
        fixLeftEdge: true, fixRightEdge: true,
      },
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: { time: true, price: true } },
    });

    const serie = chart.addSeries(AreaSeries, {
      lineColor: colorRef.current,
      topColor: colorRef.current + "55",
      bottomColor: colorRef.current + "00",
      lineWidth: 2,
      lastValueVisible: true,
      priceLineVisible: false,
      crosshairMarkerVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    // Série bougies, créée d'emblée et laissée vide : la basculer revient
    // ainsi à échanger des données, pas à détruire et recréer une série — ce
    // qui emporterait le cadrage avec elle.
    const bougies = chart.addSeries(CandlestickSeries, {
      // Le canevas ne résout pas var() : on lui passe la valeur calculée.
      upColor: resoudreJeton("--nv-positif", "#00D492"),
      downColor: resoudreJeton("--nv-negatif", "#FF6467"),
      borderUpColor: resoudreJeton("--nv-positif", "#00D492"),
      borderDownColor: resoudreJeton("--nv-negatif", "#FF6467"),
      wickUpColor: resoudreJeton("--nv-positif", "#00D492"),
      wickDownColor: resoudreJeton("--nv-negatif", "#FF6467"),
      lastValueVisible: true, priceLineVisible: false,
      priceFormat: { type: "price", precision: 0, minMove: 1 },
    });

    chartRef.current = chart;
    serieRef.current = serie;
    bougieRef.current = bougies;

    // Halo de survol : la portion de courbe sous le curseur est repeinte en
    // flou coloré puis d'un trait blanc fin, découpée à une fenêtre autour du
    // curseur et estompée sur ses bords. Repris de la page graphique.
    chart.subscribeCrosshairMove(param => {
      const cv = glowRef.current;
      const ctx = cv?.getContext("2d");
      if (!cv || !ctx) return;
      ctx.clearRect(0, 0, cv.width, cv.height);

      const data = (param.seriesData.get(serie) ?? param.seriesData.get(bougies)) as { value?: number; close?: number } | undefined;
      const val = data?.value ?? data?.close;
      if (!param.point || !param.time || val == null) { setSurvol(null); return; }
      setSurvol({ valeur: val, date: new Date((param.time as number) * 1000).toISOString() });

      const cx = param.point.x;
      // `data()` renvoie un tableau en lecture seule mêlant points et blancs :
      // on ne garde que ceux qui portent une valeur.
      const pts = (serie.data() as readonly { time: unknown; value?: number }[])
        .filter((p): p is { time: number; value: number } => typeof p.value === "number");
      if (pts.length < 2) return;

      const seg: [number, number][] = [];
      let gauche: [number, number] | null = null;
      let droitePosee = false;
      for (const p of pts) {
        const sx = chart.timeScale().timeToCoordinate(p.time as UTCTimestamp);
        const sy = serie.priceToCoordinate(p.value);
        if (sx == null || sy == null || !isFinite(sx) || !isFinite(sy)) continue;
        // Un point de part et d'autre de la fenêtre est conservé : sans eux le
        // halo commencerait et finirait dans le vide au lieu de suivre la
        // courbe jusqu'au bord de la découpe.
        if (sx < cx - HALO) gauche = [sx, sy];
        else if (sx <= cx + HALO) seg.push([sx, sy]);
        else if (!droitePosee) { seg.push([sx, sy]); droitePosee = true; }
      }
      if (gauche) seg.unshift(gauche);
      if (seg.length < 2) return;

      const trace = () => {
        ctx.beginPath();
        ctx.moveTo(seg[0][0], seg[0][1]);
        for (let i = 1; i < seg.length; i++) ctx.lineTo(seg[i][0], seg[i][1]);
      };

      ctx.save();
      ctx.beginPath();
      ctx.rect(cx - HALO, 0, HALO * 2, cv.height);
      ctx.clip();

      ctx.save();
      ctx.filter = "blur(1.5px)";
      trace();
      ctx.strokeStyle = colorRef.current + "80";
      ctx.lineWidth = 3; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      trace();
      ctx.strokeStyle = clairRef.current ? "rgba(15,23,42,0.75)" : "rgba(255,255,255,0.9)";
      ctx.lineWidth = 1.5; ctx.lineCap = "round"; ctx.lineJoin = "round";
      ctx.stroke();
      ctx.restore();

      // Estompage des deux bords, pour que la découpe ne se voie pas.
      ctx.globalCompositeOperation = "destination-in";
      const fondu = ctx.createLinearGradient(cx - HALO, 0, cx + HALO, 0);
      fondu.addColorStop(0, "rgba(0,0,0,0)");
      fondu.addColorStop(0.2, "rgba(0,0,0,1)");
      fondu.addColorStop(0.8, "rgba(0,0,0,1)");
      fondu.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fondu;
      ctx.fillRect(0, 0, cv.width, cv.height);
      ctx.globalCompositeOperation = "source-over";
    });

    // Le canevas du halo suit la taille du graphique, en pixels physiques.
    const ro = new ResizeObserver(() => {
      const cv = glowRef.current;
      if (!cv) return;
      cv.width = el.clientWidth;
      cv.height = el.clientHeight;
    });
    ro.observe(el);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      serieRef.current = null;
    };
  }, []);

  // ── Alimentation ───────────────────────────────────────────────────────────
  useEffect(() => {
    const serie = serieRef.current, chart = chartRef.current;
    if (!serie || !chart) return;

    if (!points.length) { serie.setData([]); return; }
    const dernier = points[points.length - 1].value || 1;
    const echelle = (totalValue ?? 0) > 0 ? totalValue! / dernier : 1;

    const data = points
      .map(p => ({
        time: Math.floor(new Date(p.date).getTime() / 1000) as UTCTimestamp,
        value: p.value * echelle,
      }))
      .filter(d => isFinite(d.time) && isFinite(d.value))
      // lightweight-charts exige un temps strictement croissant : deux points
      // au même horodatage font lever la série entière.
      .filter((d, i, arr) => i === 0 || d.time > arr[i - 1].time);

    const bougies = mode === "bougie" ? agregerEnBougies(data) : [];
    if (mode === "bougie") {
      serie.setData([]);
      bougieRef.current?.setData(bougies);
    } else {
      bougieRef.current?.setData([]);
      serie.setData(data);
    }
    // Le cadrage porte sur la série réellement affichée : les bougies sont
    // agrégées, donc bien moins nombreuses que les points de la ligne. Régler
    // la fenêtre sur le compte de la ligne tassait soixante bougies dans le
    // premier vingtième du tracé.
    const nbBarres = mode === "bougie" ? bougies.length : data.length;
    // Cadrage sur les horodatages réels plutôt que `fitContent()`.
    //
    // `fitContent` encadre les *barres*, pas les points : il ajoute une demi-barre
    // de marge de chaque côté. Sur la page graphique cela ne se voit pas, ses
    // séries comptant plusieurs centaines de points — la demi-barre y vaut deux
    // pixels. Ici, 27 points intraday sur 860 px donnent des barres de 32 px,
    // donc 16 px de vide entre le dernier point et la pastille de valeur.
    // En fixant la fenêtre aux horodatages extrêmes, la courbe touche les deux
    // bords quel que soit le nombre de points.
    if (nbBarres > 1) {
      // Cadrage sur [0,5 ; n−1,5], et non [0 ; n−1].
      //
      // La bibliothèque répartit la largeur sur `to − from + 1` barres, puis
      // dessine le point i au *centre* de la sienne. Demander [0 ; n−1] laisse
      // donc une demi-barre de vide de chaque côté. Invisible sur la fenêtre
      // Max — 5 500 points, la demi-barre vaut un dixième de pixel — mais
      // énorme sur 1 semaine : mesuré à 70 px pour 6 points, la courbe se
      // détachait visiblement de l'échelle et de la marge gauche.
      //
      // Décaler les deux bornes d'une demi-barre place le premier et le
      // dernier point exactement sur les bords : mesuré à 1 px après coup.
      //
      // Différé d'une trame : appliqué dans la foulée de `setData`, le cadrage
      // est écrasé par la mise en page que la bibliothèque enchaîne.
      const cadrer = () => {
        try {
          // Zoom arrière borné à la vue d'ensemble : au-delà, on ne montre que
          // du blanc. L'espacement minimal est celui qui fait tenir toute la
          // série dans le cadre, recalculé à chaque changement de données ou
          // de largeur.
          const w = plotRef.current?.clientWidth ?? 0;
          if (w > 0 && nbBarres > 1) {
            chart.timeScale().applyOptions({ minBarSpacing: w / nbBarres });
          }
          chart.timeScale().applyOptions({ rightOffset: 0 });
          chart.timeScale().setVisibleLogicalRange({ from: 0.5, to: nbBarres - 1.5 });
        } catch { /* graphique démonté entre-temps */ }
      };
      const id = requestAnimationFrame(cadrer);

      // Recadrer quand le cadre prend enfin ses dimensions.
      //
      // L'onglet Transactions est monté masqué : le graphique s'y crée dans un
      // conteneur de largeur nulle, et le cadrage calculé alors ne vaut rien —
      // à l'affichage, la courbe se retrouvait tassée sur le cinquième droit.
      const el = plotRef.current;
      let largeur = el?.clientWidth ?? 0;
      const ro = el ? new ResizeObserver(() => {
        const w = el.clientWidth;
        if (w > 0 && w !== largeur) { largeur = w; cadrer(); }
      }) : null;
      if (el && ro) ro.observe(el);

      return () => { cancelAnimationFrame(id); ro?.disconnect(); };
    }
    chart.timeScale().fitContent();
  }, [points, totalValue, mode, operations]);

  // L'heure ne s'affiche que sur la journée. Sur une série journalière,
  // `timeVisible` intercalait des numéros de jour entre les noms de mois —
  // « nov. 2026 mars avr. juin 5 » sur la fenêtre d'un an.
  useEffect(() => {
    chartRef.current?.timeScale().applyOptions({ timeVisible: period === "24h" });
  }, [period]);

  // Couleur et mode s'appliquent à la série existante. En mode ligne, le
  // dégradé est simplement rendu transparent.
  const encre = color;
  // Le halo de survol lit la couleur dans une référence, mise à jour ici :
  // la déclaration de `colorRef` précède celle de l'état de teinte.
  colorRef.current = encre;
  useEffect(() => {
    serieRef.current?.applyOptions({
      lineColor: encre,
      topColor: encre + "55",
      bottomColor: encre + "00",
    });
  }, [encre, mode]);

  const eur = (v: number) => v.toLocaleString("fr-FR", { maximumFractionDigits: 0 }) + " €";
  const dernier = points.length && totalValue ? totalValue : null;

  return (
    <div ref={boxRef} style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }}>
      {/* Périodes reprises de la page graphique : libellé, rendement de la
          période dessous, et un filet sous celle qui est active. Les huit
          pourcentages sont tirés d'une seule série — celle de la fenêtre Max —
          plutôt que d'un appel par période : sinon un même intervalle pourrait
          annoncer un chiffre une fois sélectionné et un autre au repos. */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, marginBottom: 4 }}>
        <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
          {PERIODES.map(p => {
            const actif = p === period;
            const pct = rendements[p];
            // Une fenêtre plus ancienne que le portefeuille se replie sur son
            // origine et répète le chiffre de Max. Trois nombres identiques
            // laissent croire à trois mesures : mieux vaut les éteindre.
            const secs = PERIOD_SECS[p];
            const anterieure = !!origine && secs != null
              && Date.now() - secs * 1000 < new Date(origine).getTime();
            return (
              <div key={p} onClick={() => { if (!anterieure) onPeriodChange(p); }}
                title={anterieure ? `Le portefeuille n'existe que depuis le ${new Date(origine!).toLocaleDateString("fr-FR")}` : undefined}
                style={{ position: "relative", paddingBottom: 4, textAlign: "center", width: 46,
                         cursor: anterieure ? "default" : "pointer", flex: "none",
                         opacity: anterieure ? 0.3 : 1 }}>
                <div style={{ fontFamily: FONT, fontSize: 12, fontWeight: 600, color: actif ? encre : (clair ? "rgba(15,23,42,0.45)" : "#94a3b8") }}>{p}</div>
                {pct != null && !anterieure && (
                  <div style={{
                    ...NUM, fontSize: 11, fontWeight: 700,
                    // Sur blanc, var(--nv-positif) ne donne que 2,5:1 : il faut un vert
                    // plus sombre pour rester lisible.
                    color: pct >= 0
                      ? (clair ? "#0F7B3D" : "var(--nv-positif)")
                      : (clair ? "#C81E1E" : "var(--nv-negatif)"),
                  }}>
                    {fmtPct(pct)}
                  </div>
                )}
                {actif && (
                  <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 2, borderRadius: RAYONS.plein, background: encre }} />
                )}
              </div>
            );
          })}
        </div>

        {/* Courbe / bougies, même bouton que la page graphique. */}
        <button type="button" onClick={() => setMode(m => (m === "ligne" ? "bougie" : "ligne"))}
          title={mode === "ligne" ? "Passer en bougies" : "Passer en courbe"}
          style={{
            background: clair
              ? (mode === "bougie" ? "rgba(11,99,231,0.10)" : "#F4F7FB")
              : (mode === "bougie" ? "rgba(155,185,255,0.16)" : "rgba(255,255,255,0.06)"),
            backdropFilter: clair ? "none" : "blur(10px) saturate(1.5)",
            WebkitBackdropFilter: clair ? "none" : "blur(10px) saturate(1.5)",
            border: `1px solid ${clair
              ? (mode === "bougie" ? "rgba(11,99,231,0.28)" : "rgba(15,23,42,0.10)")
              : (mode === "bougie" ? "rgba(155,185,255,0.40)" : "rgba(255,255,255,0.12)")}`,
            borderRadius: RAYONS.sm, width: 30, height: 30, cursor: "pointer", flexShrink: 0,
            display: "flex", alignItems: "center", justifyContent: "center",
            color: clair
              ? (mode === "bougie" ? "#0B63E7" : "rgba(15,23,42,0.55)")
              : (mode === "bougie" ? "#9BB9FF" : "rgba(255,255,255,0.50)"),
            boxShadow: clair ? "none" : (mode === "bougie"
              ? "0 0 12px rgba(155,185,255,0.16), inset 0 1px 0 rgba(255,255,255,0.10)"
              : "0 1px 3px rgba(0,0,0,0.20), inset 0 1px 0 rgba(255,255,255,0.07)"),
          }}>
          {mode === "ligne" ? (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <rect x="3" y="4" width="3" height="6" rx="0.5" />
              <line x1="4.5" y1="2" x2="4.5" y2="4" />
              <line x1="4.5" y1="10" x2="4.5" y2="14" />
              <rect x="10" y="6" width="3" height="5" rx="0.5" />
              <line x1="11.5" y1="3" x2="11.5" y2="6" />
              <line x1="11.5" y1="11" x2="11.5" y2="13" />
            </svg>
          ) : (
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
              <polyline points="1,12 4,8 7,10 10,5 13,7 15,4" />
            </svg>
          )}
        </button>
      </div>

      <div style={{ position: "relative", flex: height ? undefined : 1, height, minHeight: 0 }}>
        <div ref={plotRef} style={{ position: "absolute", inset: 0 }} />
        {/* Repères d'opération, en surcouche.
            Le greffon de la bibliothèque les fait entrer dans l'échelle des
            prix : sur un portefeuille parti de zéro, loger les pastilles sous
            la courbe descendait l'axe à −1 000 €, une valeur que le
            portefeuille n'a jamais eue. Positionnées ici à la main, elles
            flottent au-dessus du tracé sans rien déformer. */}
        {pastilles.map(p => (
          // Pastille reliée à la courbe par une tige, comme si l'opération en
          // sortait. Détachée, elle flottait sans qu'on sache à quel point du
          // tracé elle se rapportait — sur une courbe en escalier, l'écart
          // d'un jour se lit.
          <button key={p.id} title={p.titre} type="button"
            onClick={onOperationClick ? () => onOperationClick(p.id) : undefined}
            style={{
              // Centré sur le point de la courbe : le repère en sort au lieu
              // de flotter au-dessus. Une tige le rattachait, mais douze pixels
              // plus haut il semblait encore posé à côté.
              position: "absolute", left: p.x, top: p.y,
              transform: "translate(-50%,-50%)",
              width: 18, height: 18, borderRadius: "50%", padding: 0,
              // Plein, et non cerclé : sur un tracé de la même teinte, un
              // cercle évidé se confondait avec la courbe qui le traverse.
              background: couleurOp(p.type, clair),
              border: `2px solid ${clair ? "#FFFFFF" : "rgba(6,20,42,0.96)"}`,
              display: "flex", alignItems: "center", justifyContent: "center",
              color: clair ? "#FFFFFF" : "rgba(6,20,42,0.96)", flexShrink: 0,
              zIndex: 6,
              cursor: onOperationClick ? "pointer" : "default",
              pointerEvents: onOperationClick ? "auto" : "none",
            }}>
            <Pictogramme type={p.type} />
          </button>
        ))}
        <canvas ref={glowRef} style={{
          position: "absolute", inset: 0, pointerEvents: "none",
          // Repris de la page graphique. Sans z-index, le canevas passait sous
          // ceux que la bibliothèque empile elle-même : le halo était peint
          // mais invisible. Le mode « screen » le fait rayonner sur la courbe
          // au lieu de la recouvrir d'un trait opaque.
          zIndex: 5, mixBlendMode: "screen",
        }} />
        {(state === "loading" && !points.length) || state === "error" ? (
          <div style={{
            position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center",
            fontFamily: FONT, fontSize: 12, color: clair ? "rgba(15,23,42,0.42)" : "rgba(248,249,252,0.35)", pointerEvents: "none",
          }}>
            {state !== "error"
              ? "Chargement…"
              : sansCours.length
                ? `Cours indisponible pour ${sansCours.join(", ")} — courbe masquée pour ne pas afficher une valeur fausse`
                : "Historique indisponible pour cette période"}
          </div>
        ) : null}
      </div>

      {/* Légende sous le cadre, et non dedans : posée en surcouche, elle
          recouvrait les libellés de l'axe des dates. */}
      {operations.length > 0 && (
        // Hauteur de ligne fixée à celle de la vignette, et largeurs entières.
        //
        // Sans cela la ligne prend une hauteur impaire — le cercle de 14 px s'y
        // centrait à 502,5 px — et chaque entrée démarre à l'abscisse fractionnaire
        // laissée par la précédente. Le contour et le trait du signe se
        // répartissaient alors sur deux rangées de pixels : le pictogramme
        // paraissait décentré alors qu'il est à 2 px des quatre bords.
        <div style={{ display: "flex", gap: 16, paddingTop: 6, flexShrink: 0, height: 14 }}>
          {LEGENDE.map(l => (
            <span key={l.libelle} style={{
              display: "flex", alignItems: "center", gap: 5,
              width: l.largeur, height: 14, lineHeight: "14px",
              fontFamily: FONT, fontSize: 10, color: clair ? "rgba(15,23,42,0.55)" : "rgba(255,255,255,0.45)",
            }}>
              {/* Même vignette que sur la courbe, en réduction : une puce ronde
                  n'annoncerait plus rien une fois les pictogrammes posés. */}
              <span style={{
                width: 14, height: 14, borderRadius: "50%",
                background: couleurOp(l.type, clair),
                display: "flex", alignItems: "center", justifyContent: "center",
                color: clair ? "#FFFFFF" : "rgba(6,20,42,0.96)", flexShrink: 0,
              }}>
                <Pictogramme type={l.type} />
              </span>
              {l.libelle}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
