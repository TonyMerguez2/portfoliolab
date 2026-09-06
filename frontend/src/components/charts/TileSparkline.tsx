"use client";
import { useEffect, useRef } from "react";

/**
 * Sparkline des tuiles d'actif.
 *
 * Extraite de LiquidGlassTreemap pour que la grille de la page portefeuille et
 * la treemap tracent la même courbe : deux implémentations auraient divergé au
 * premier ajustement, et la même valeur se serait lue différemment selon la vue.
 *
 * Le halo se déclenche impérativement par `beginElement()` plutôt que par une
 * animation en boucle : il ne doit pulser qu'au moment où le prix change.
 */
/**
 * ⚠️ **`enrichi` est une option, et non le nouveau défaut — parce que cette courbe est
 * partagée.** La répartition pavée la trace aussi, sur des tuiles bien plus petites : des
 * repères et un aplat y encombreraient un dessin de quarante pixels de haut. L'en-tête de ce
 * fichier dit pourquoi les deux vues partagent le même tracé ; l'option ajoute une parure là où
 * il y a la place, sans que la courbe elle-même diffère d'une vue à l'autre.
 */
export function TileSparkline({ pts, color, w, h, updatedAt, enrichi = false }:
  { pts: number[]; color: string; w: number; h: number; updatedAt?: number; enrichi?: boolean }) {
  const animR   = useRef<SVGAnimateElement>(null);
  const animO   = useRef<SVGAnimateElement>(null);

  useEffect(() => {
    if (!updatedAt) return;
    try {
      animR.current?.beginElement();
      animO.current?.beginElement();
    } catch (_) {}
  }, [updatedAt]);

  const n = pts.length;
  const min = Math.min(...pts), max = Math.max(...pts);
  const rng = max - min || 0.01;
  const sx = (i: number) => (i / (n - 1)) * w;
  const sy = (v: number) => h - ((v - min) / rng) * (h - 4) - 2;
  /**
   * Le tracé, en segments droits ou en courbes selon le mode.
   *
   * ⚠️ **La courbe se dessinait en `L`, donc en ligne brisée — et ça se voyait sur les vraies
   * données.** Sur une série de démonstration lisse, personne ne le remarque ; sur des cours
   * réels, bruités, chaque point fait un angle et le tracé paraît hérissé là où la maquette
   * montre une vague. Le défaut n'était pas dans les données, il était dans le tracé.
   *
   * ⚠️ **Les points de contrôle sont **bornés** aux valeurs voisines, ce qui n'est pas un détail
   * cosmétique.** Une courbe de Bézier ordinaire *dépasse* : entre deux points elle peut passer
   * au-dessus du plus haut des deux, et dessiner un sommet que le portefeuille n'a jamais atteint.
   * En serrant chaque poignée dans l'intervalle de ses voisins, la courbe reste lisse **et** ne
   * peut inventer aucun extremum. Un graphique n'a pas le droit d'embellir ce qu'il montre.
   */
  const droit = (v: number, i: number) => `${i === 0 ? "M" : "L"}${sx(i).toFixed(1)},${sy(v).toFixed(1)}`;
  const lisse = () => {
    const X = pts.map((_, i) => sx(i)), Y = pts.map(sy);
    let out = `M${X[0].toFixed(1)},${Y[0].toFixed(1)}`;
    for (let i = 0; i < n - 1; i++) {
      const dx = (X[i + 1] - X[i]) / 3;
      /* La pente locale, lue sur les deux voisins — c'est elle qui donne l'ondulation. */
      const p1 = (Y[i + 1] - Y[Math.max(0, i - 1)]) / 6;
      const p2 = (Y[Math.min(n - 1, i + 2)] - Y[i]) / 6;
      const borne = (y: number) => Math.max(Math.min(Y[i], Y[i + 1]), Math.min(Math.max(Y[i], Y[i + 1]), y));
      out += ` C${(X[i] + dx).toFixed(1)},${borne(Y[i] + p1).toFixed(1)}`
           + ` ${(X[i + 1] - dx).toFixed(1)},${borne(Y[i + 1] - p2).toFixed(1)}`
           + ` ${X[i + 1].toFixed(1)},${Y[i + 1].toFixed(1)}`;
    }
    return out;
  };
  const d = enrichi ? lisse() : pts.map(droit).join(" ");
  const maskId = `tsm-${w}-${h}${enrichi ? "-e" : ""}`;
  const ex = sx(n - 1), ey = sy(pts[n - 1]);
  /* L'aplat referme la courbe sur le bas du cadre : c'est le même tracé, prolongé. */
  const aire = `${d} L${w.toFixed(1)},${h} L0,${h} Z`;

  return (
    <svg width={w} height={h} style={{ display: "block", overflow: "visible" }}>
      <defs>
        {/**
          * ⚠️ **Le fondu de gauche disparaît en mode enrichi, et c'est voulu.** Il estompe le
          * premier tiers de la courbe pour l'adoucir sur une petite tuile ; sur la carte
          * d'actif, où la courbe occupe toute la largeur, il fait paraître le début du tracé
          * effacé — la maquette la montre nette d'un bord à l'autre.
          */}
        <linearGradient id={maskId} x1="0" x2="1" y1="0" y2="0">
          <stop offset="0%"   stopColor="white" stopOpacity={enrichi ? 1 : 0} />
          <stop offset="28%"  stopColor="white" stopOpacity="1" />
          <stop offset="100%" stopColor="white" stopOpacity="1" />
        </linearGradient>
        <mask id={`m-${maskId}`}>
          <rect x="0" y="0" width={w} height={h} fill={`url(#${maskId})`} />
        </mask>
        {enrichi && (
          <linearGradient id={`a-${maskId}`} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%"   stopColor={color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        )}
      </defs>
      {/**
        * ⚠️ **Les repères se dessinent **sous** l'aplat et la courbe.** Passés au-dessus, leurs
        * pointillés hachurent le tracé et on ne lit plus ni l'un ni l'autre.
        *
        * ⚠️ **Trois lignes, pas une graduation.** Elles ne portent aucune valeur — l'échelle
        * d'une courbe de deux centimètres n'a pas de sens chiffré. Elles donnent un fond au
        * dessin ; les espacer selon les prix laisserait croire à des seuils.
        */}
      {enrichi && [0.25, 0.5, 0.75].map(f => (
        <line key={f} x1="0" x2={w} y1={h * f} y2={h * f}
          stroke="rgba(255,255,255,0.09)" strokeWidth="1" strokeDasharray="2 4" />
      ))}
      {enrichi && <path d={aire} fill={`url(#a-${maskId})`} stroke="none" />}
      {/* Glow large + trait fin */}
      <path d={d} fill="none" stroke={color} strokeWidth="5" opacity="0.12"
        strokeLinecap="round" strokeLinejoin="round"
        mask={`url(#m-${maskId})`} style={{ filter: "blur(3px)" }} />
      <path d={d} fill="none" stroke={color} strokeWidth={enrichi ? 1.7 : 1.4}
        strokeLinecap="round" strokeLinejoin="round" opacity={enrichi ? 0.95 : 0.70}
        mask={`url(#m-${maskId})`} />
      {/* Dot fixe */}
      <circle cx={ex} cy={ey} r="2.2" fill={color} opacity="0.95" />
      {/* Halo : begin="indefinite" + beginElement() impératif au changement de prix */}
      <circle cx={ex} cy={ey} r="2.2" fill="none" stroke={color} strokeWidth="1.2" opacity="0">
        <animate ref={animR} attributeName="r"       begin="indefinite" values="2.2;11;11" dur="1.4s" repeatCount="1" />
        <animate ref={animO} attributeName="opacity" begin="indefinite" values="0.85;0;0"  dur="1.4s" repeatCount="1" />
      </circle>
    </svg>
  );
}

export default TileSparkline;
