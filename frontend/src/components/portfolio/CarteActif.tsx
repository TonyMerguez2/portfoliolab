"use client";
import { useMemo } from "react";

import TileCard from "@/components/TileCard";
import AssetLogo from "@/components/AssetLogo";
import TileSparkline from "@/components/charts/TileSparkline";
import ChiffresRoulants from "@/components/ui/ChiffresRoulants";
import { brandHex } from "@/lib/tileStyle";
import { assetName } from "@/lib/assets";
import type { GridAsset } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { useClignotement, styleClignotement } from "@/lib/clignotement";

/**
 * La carte d'un actif : identité, cours, variation, courbe, valeur détenue.
 *
 * ⚠️ **Sortie de la grille parce qu'elle est désormais montrée à deux endroits.** Les
 * dossiers de compte en donnent un aperçu, à la taille exacte des cartes du rail.
 * Recopiée, elle aurait divergé au premier ajustement — et un aperçu qui ne ressemble
 * plus à ce qu'il annonce ne vaut pas mieux que pas d'aperçu.
 *
 * La largeur reste fixe : c'est elle qui tient toutes les cartes à la même taille dans
 * le rail, et c'est sur elle que le dossier se dimensionne.
 */

/**
 * Les dimensions de la carte, dont le dossier a besoin pour se tailler.
 *
 * ⚠️ `identite` est la hauteur de la ligne du haut — rembourrage plus logo, 14 + 32.
 * C'est la seule partie que le dossier laisse voir de ses cartes, et c'est elle qui
 * fixe sa hauteur d'aperçu. Changer le rembourrage ou la taille du logo ci-dessous
 * sans la corriger ici couperait le nom en deux dans les dossiers.
 */
export const CARTE_ACTIF = {
  largeur: 248, hauteur: 196, identite: 46,
  /**
   * Le rayon des angles, et le rembourrage de la ligne d'identité.
   *
   * ⚠️ **Publiés parce qu'une autre carte doit s'y aligner.** La carte bancaire d'un dossier
   * de trésorerie occupe exactement la place d'une carte d'actif : recopiés chez elle, ces
   * trois nombres auraient divergé au premier ajustement, et deux cartes voisines n'auraient
   * plus eu ni le même arrondi ni les mêmes marges — un décalage de deux pixels que l'œil
   * voit sans savoir le nommer.
   */
  rayon: 18,
  /** Le rembourrage : `haut` place le logo et le titre, `cote` les colle au bord. */
  marge: { haut: 14, cote: 15 },
  /** Le côté du logo, et son propre arrondi. */
  logo: { cote: 32, rayon: 8 },
  /** L'écart entre le logo et le texte de la ligne d'identité. */
  ecartIdentite: 9,
};

const eur = (v: number, dec = 2) =>
  v.toLocaleString("fr-FR", { minimumFractionDigits: dec, maximumFractionDigits: dec }) + " €";

/**
 * Le cours d'une ligne, qui marque le sens de sa dernière variation.
 *
 * Composant à part, et non quelques lignes dans la carte : le clignotement garde une
 * mémoire propre à chaque actif, et un crochet ne s'appelle pas dans un `map`. Deux
 * cartes qui partageraient cet état clignoteraient ensemble au mouvement de l'une.
 */
function Cours({ prix }: { prix: number | null }) {
  const sens = useClignotement(prix);
  return (
    <div style={{
      ...NUM, fontSize: 20, fontWeight: 700, lineHeight: 1.1,
      ...styleClignotement(sens, "rgba(255,255,255,0.94)"),
    }}>
      {prix != null ? <ChiffresRoulants texte={eur(prix)} /> : "—"}
    </div>
  );
}

export default function CarteActif({
  a, onClick, inerte = false,
}: {
  a: GridAsset;
  onClick?: () => void;
  /**
   * Carte d'aperçu : ni clic, ni survol.
   *
   * ⚠️ Sans cela, l'aperçu d'un dossier ajouterait au parcours au clavier des cartes
   * dont on ne voit que le haut, et qui mèneraient là où le dossier mène déjà.
   */
  inerte?: boolean;
}) {
  const up = (a.change ?? 0) >= 0;
  const chg = up ? "var(--nv-positif)" : "var(--nv-negatif)";
  const name = useMemo(() => assetName(a.ticker), [a.ticker]);

  /**
   * ⚠️ **`novac-tile` est portée aussi par les cartes d'aperçu.** Ce n'est pas un simple
   * nom : la classe porte le **bord** de la tuile — un dégradé peint sur un pixel par un
   * pseudo-élément masqué, que rien d'inline ne peut exprimer — et le tramage qui empêche
   * les lavis du fond de se lire en anneaux. Je l'avais retirée en mode aperçu pour garder
   * mes comptages d'éléments propres : les cartes des dossiers se retrouvaient sans
   * liseré, mêmes dimensions mais pas la même arête. Entre une commodité de mesure et la
   * fidélité du rendu, c'est la mesure qui cède.
   */
  return (
    <TileCard ticker={a.ticker} radius={CARTE_ACTIF.rayon} glowStrength={0}
      reflet={false}
      className="novac-tile"
      colorHex={brandHex(a.ticker)}
      onClick={inerte ? undefined : onClick}
      containerStyle={{
        height: CARTE_ACTIF.hauteur, width: CARTE_ACTIF.largeur, flexShrink: 0,
        color: brandHex(a.ticker),
        // Une carte d'aperçu ne se clique pas et ne se survole pas : elle est là pour
        // montrer ce que le dossier contient, et c'est le dossier qu'on ouvre.
        pointerEvents: inerte ? "none" : undefined,
        /**
         * ⚠️ **Et elle ne porte pas d'ombre non plus.** Une tuile pose une ombre noire de
         * quarante-quatre pixels de flou, décalée de quatorze vers le bas : sur la grille
         * elle tombe sur le fond de page et donne son relief à la carte. Dans un dossier,
         * elle tombe sur le **plan du dossier**, qui commence quelques pixels plus bas —
         * une grande tache sombre en travers de la pochette, qu'on remarque bien avant de
         * comprendre d'où elle vient. Relevé à l'écran : `0 14px 44px rgba(0,0,0,0.28)`
         * portée par la carte d'aperçu, pas par le dossier.
         *
         * Le dossier a déjà son propre halo pour se détacher ; les cartes qu'il range n'ont
         * rien à en dire — dans la vie non plus, le contenu d'une pochette n'a pas d'ombre
         * sur sa couverture.
         */
        ...(inerte ? { boxShadow: "none" } : {}),
      }}
      style={{ height: "100%", display: "flex", flexDirection: "column",
        padding: `${CARTE_ACTIF.marge.haut}px ${CARTE_ACTIF.marge.cote}px` }}>

      {/* Identité */}
      <div style={{ display: "flex", alignItems: "center", gap: CARTE_ACTIF.ecartIdentite }}>
        <AssetLogo ticker={a.ticker} type={a.type || "EQUITY"}
          size={CARTE_ACTIF.logo.cote} radius={CARTE_ACTIF.logo.rayon}
          fallbackBg="rgba(255,255,255,0.10)" fallbackBorder="rgba(255,255,255,0.16)"
          fallbackTextColor="#fff" bare />
        <div style={{ minWidth: 0, flex: 1 }}>
          <div style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, color: "rgba(255,255,255,0.94)",
            lineHeight: 1.15, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {a.ticker.replace(/-USD$/, "")}
          </div>
          {name && (
            <div style={{ fontFamily: FONT, fontSize: 11.5, fontWeight: 550, color: "rgba(255,255,255,0.45)",
              lineHeight: 1.2, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {name}
            </div>
          )}
        </div>
        <span style={{ ...NUM, fontSize: 11, fontWeight: 700, color: "rgba(255,255,255,0.50)", flexShrink: 0 }}>
          {a.weight.toFixed(a.weight < 10 ? 1 : 0)}%
        </span>
      </div>

      {/**
        * ⚠️ **L'aperçu s'arrête à la ligne d'identité.** Tout ce qui suit est caché par
        * le plan du dossier, sauf une bande de vingt pixels le long de la languette, où
        * n'apparaissait que la fin du cours : « 3 € » pour 63 493,38 €. On a d'abord
        * éteint la carte en fondu à cet endroit ; c'était troquer un nombre tronqué
        * contre une carte qui paraît translucide. Ne rien dessiner sous le nom règle les
        * deux, et épargne au passage une courbe par carte d'aperçu.
        */}
      {!inerte && (<>
      {/* Cours et variation */}
        <div style={{ marginTop: 10 }}>
          <Cours prix={a.price ?? null} />
          {/* Ce que la ligne a rapporté depuis son achat, et non la
              variation du cours sur la période affichée. Sur la fenêtre
              Max, un ETF né en 2021 annonçait « +520 % · +2 992 € » sur
              une position ouverte en février, qui n'a jamais rapporté
              cela. On retombe sur la variation quand le prix de revient
              est inconnu — portefeuilles sans transactions. */}
          {a.pnlEur != null ? (() => {
            const gagne = a.pnlEur >= 0;
            const col = gagne ? "var(--nv-positif)" : "var(--nv-negatif)";
            return (
              <div style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: col, marginTop: 3 }}>
                {gagne ? "+" : ""}{Math.round(a.pnlEur).toLocaleString("fr-FR")} €
                {a.pnlPct != null && (
                  <span style={{ opacity: 0.62, marginLeft: 5 }}>
                    {gagne ? "+" : ""}{a.pnlPct.toFixed(1)} %
                  </span>
                )}
                {a.avgCost != null && (
                  <span style={{ opacity: 0.42, marginLeft: 5, fontWeight: 500 }}>
                    · PRU {eur(a.avgCost)}
                  </span>
                )}
              </div>
            );
          })() : (
            <div style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: chg, marginTop: 3 }}>
              {a.change != null ? `${up ? "+" : ""}${a.change.toFixed(2)} %` : "—"}
              {a.perfEur != null && (
                <span style={{ opacity: 0.62, marginLeft: 5 }}>
                  {up ? "+" : ""}{Math.round(a.perfEur).toLocaleString("fr-FR")} €
                </span>
              )}
            </div>
          )}
        </div>

        {/* Courbe sur toute la largeur, comme au concept : rangée à
            droite sur la moitié de la carte, elle laissait un vide à
            gauche que rien ne venait occuper. */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", minHeight: 0, marginLeft: -2 }}>
          {a.spark && a.spark.length > 1 && (
            <TileSparkline pts={a.spark} color={chg} w={222} h={42} updatedAt={a.updatedAt} />
          )}
        </div>

        {/* Valeur détenue. Masquée faute de valeur totale au portefeuille :
            une ligne « Valeur — » répétée sur chaque carte n'apprend rien
            et occupe la place d'un trait de séparation utile. */}
        {a.value != null && (
          <div style={{
            display: "flex", alignItems: "baseline", justifyContent: "space-between",
            marginTop: 8, paddingTop: 7, borderTop: "1px solid rgba(255,255,255,0.07)",
          }}>
            <span style={{ fontFamily: FONT, fontSize: 10, color: "rgba(255,255,255,0.38)" }}>Valeur</span>
            <span style={{ ...NUM, fontSize: 12, fontWeight: 700, color: "rgba(255,255,255,0.88)" }}>
              {eur(a.value, 0)}
            </span>
          </div>
        )}
      </>)}
    </TileCard>
);
}
