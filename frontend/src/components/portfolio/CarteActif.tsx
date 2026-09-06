"use client";
import { useEffect, useMemo, useState } from "react";

import TileCard from "@/components/TileCard";
import AssetLogo from "@/components/AssetLogo";
import TileSparkline from "@/components/charts/TileSparkline";
import ChiffresRoulants from "@/components/ui/ChiffresRoulants";
import { couleurActif } from "@/lib/tileStyle";
import { demanderNom, nomConnu, surNouveauNom } from "@/lib/nomsActifs";
import { BRAND_COLORS } from "@/lib/assets";
import type { GridAsset } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { RAYONS } from "@/lib/palette";
import { melanger } from "@/lib/couleur";
import { useModeTheme } from "@/lib/theme";
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
   *
   * ⚠️ **Pris dans l'échelle des rayons, et non écrit en chiffre.** Il valait `18` en dur, et
   * `RAYONS.lg` vaut la même chose : deux façons d'écrire le même nombre, donc deux nombres
   * qui finiront par différer. Ce rayon voyage loin — la languette du dossier lui emprunte
   * ses trois courbes, et le rail de navigation les siennes. Il lui faut une source, pas une
   * coïncidence.
   */
  rayon: RAYONS.lg,
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
  /**
   * La teinte tirée du logo, pour les actifs que la table de marques ne connaît pas.
   *
   * ⚠️ **Sans elle, cette carte ne pouvait pas égaler celle de la page graphique.** Là-bas,
   * un actif absent de `BRAND_COLORS` prend la couleur extraite de son logo ; ici il prenait un
   * hachage de son ticker. Le même actif portait donc deux couleurs selon la page. Demandé à
   * l'usage que les deux se ressemblent — il fallait pour cela que les deux *cherchent* la même
   * chose, pas seulement qu'elles la mettent en forme pareil.
   *
   * ⚠️ **On ne demande l'extraction que si la table ne répond pas.** Poser le rappel dans tous
   * les cas ferait, sur une grille de vingt cartes, vingt lectures de pixels dont dix-neuf
   * seraient jetées — la table primant de toute façon. C'est la même condition que la page
   * graphique applique, et elle vaut ici pour la même raison.
   */
  const [extraite, setExtraite] = useState<string | null>(null);
  const sansMarque = !BRAND_COLORS[a.ticker];
  const couleur = couleurActif(a.ticker, { extraite, clair: useModeTheme() === "clair" });

  const up = (a.change ?? 0) >= 0;
  const chg = up ? "var(--nv-positif)" : "var(--nv-negatif)";
  /**
   * ⚠️ **Le nom vient du catalogue quand il l'a, du serveur sinon.** `assetName` ne connaît que
   * les cent soixante et un actifs de `TRENDING` : `ETZ.PA` et `PAEJ.PA`, deux lignes d'un vrai
   * PEA, n'y sont pas et leurs cartes restaient **muettes** sous le ticker pendant que leur
   * voisine affichait le sien. L'abonnement redessine la carte quand le nom arrive.
   */
  const [, redessiner] = useState(0);
  useEffect(() => surNouveauNom(() => redessiner(n => n + 1)), []);
  useEffect(() => { demanderNom(a.ticker); }, [a.ticker]);
  const name = nomConnu(a.ticker);

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
      colorHex={couleur}
      onClick={inerte ? undefined : onClick}
      containerStyle={{
        height: CARTE_ACTIF.hauteur, width: CARTE_ACTIF.largeur, flexShrink: 0,
        color: couleur,
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
          fallbackTextColor="#fff" bare
          onColorExtracted={sansMarque ? setExtraite : undefined} />
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
        {/**
          * Le poids de la ligne, en **pastille**.
          *
          * ⚠️ **Une pastille et non un texte nu, parce que ce nombre ne parle pas de l'actif.**
          * Tout le reste de la ligne — sigle, intitulé, cours — décrit le titre ; le poids décrit
          * sa **place dans le portefeuille**. Posé en gris clair à côté du reste, il se lisait
          * comme une donnée de marché de plus. Le cerner le range dans une autre catégorie sans
          * qu'il faille l'expliquer.
          *
          * ⚠️ **`flexShrink: 0` et pas de retour à la ligne :** c'est le seul élément de la
          * rangée qui ne doit jamais céder de place. L'intitulé, lui, s'ellipse — il est déjà
          * tronqué sur deux des trois cartes.
          *
          * ⚠️ **Elle emprunte sa forme aux pastilles de l'application, elle n'en invente pas une.**
          * `3px 8px` de rembourrage et `RAYONS.plein` : c'est ce qu'emploient déjà le filtre de
          * `ImpactEvenements` et celui d'`EvenementsAVenir`. J'avais écrit `borderRadius: 8`, qui
          * n'est même pas sur l'échelle des rayons — une quatrième façon d'arrondir un coin dans
          * une interface qui en avait déjà trois.
          *
          * ⚠️ **Teintée de la couleur de l'actif, et non d'un gris neutre.** La carte entière
          * porte cette teinte ; une pastille grise s'y posait comme une pièce rapportée. Le voile
          * reste léger — c'est un cadre, pas un aplat — et le texte reste clair : sur une carte
          * verte, un chiffre vert sur voile vert ne se lirait plus.
          */}
        <span style={{
          ...NUM, fontSize: 11, fontWeight: 700, flexShrink: 0, whiteSpace: "nowrap",
          /* ⚠️ Le chiffre est teinté, mais **éclairci** de moitié vers le blanc : la couleur
             brute sur son propre voile ne se lirait pas — un vert à 100 % sur un voile vert à
             12 %, c'est deux fois la même teinte. Mélangée au blanc, elle garde la marque et
             retrouve le contraste. */
          color: melanger(couleur, "#ffffff", 0.5),
          padding: "3px 8px", borderRadius: RAYONS.plein,
          background: `${couleur}1F`,
          /* ⚠️ Liseré volontairement ténu : à 35 % il faisait un cadre, à 20 % un bord, à 13 %
             il ne fait plus que **fermer** la forme. C'est le voile qui porte la pastille ; le
             trait n'est là que pour lui donner une arête, pas pour la souligner. */
          border: `1px solid ${couleur}21`,
        }}>
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
          {/**
            * La performance de la ligne **sur la période affichée**, en euros et en part.
            *
            * ⚠️ **Elle montrait le gain depuis l'achat, ce qui contredisait la courbe juste en
            * dessous.** Celle-ci suit maintenant le sélecteur de période ; laisser le chiffre sur
            * toute la détention faisait dire deux choses au même rectangle — le tracé montrait la
            * semaine, le nombre à côté montrait six mois. Les deux parlent désormais de la même
            * fenêtre.
            *
            * ⚠️ **Ce qu'on perd, et pourquoi c'est acceptable :** la plus-value depuis l'achat
            * n'est plus affichée. Le **PRU** reste, lui, et c'est ce qui permet encore de la
            * situer — il ne dépend d'aucune période, contrairement aux deux nombres devant lui.
            *
            * ⚠️ **`change` et `perfEur` viennent du même appel que la courbe**, avec le même
            * `period`. Il n'y a donc pas deux sources à tenir d'accord : c'est la même réponse
            * qui alimente le tracé et le chiffre.
            */}
          {(() => {
            const pct = a.change;
            const gagne = (pct ?? 0) >= 0;
            const col = gagne ? "var(--nv-positif)" : "var(--nv-negatif)";
            return (
              <div style={{ ...NUM, fontSize: 12.5, fontWeight: 600, color: col, marginTop: 3 }}>
                {a.perfEur != null
                  ? `${gagne ? "+" : ""}${Math.round(a.perfEur).toLocaleString("fr-FR")} €`
                  : "—"}
                {/* ⚠️ Même opacité que le montant : les deux disent la **même** performance, l'une
                    en euros et l'autre en part. En atténuer une revenait à la présenter comme
                    secondaire alors qu'elle est souvent celle qu'on lit en premier. */}
                {pct != null && (
                  <span style={{ marginLeft: 5 }}>
                    {gagne ? "+" : ""}{pct.toFixed(1)} %
                  </span>
                )}
                {/* ⚠️ Plus lisible qu'avant mais plus **maigre** que les deux performances :
                    c'est la hiérarchie qui distingue, pas l'effacement. À 0,42 le PRU se
                    devinait ; à 0,60 il se lit, et sa graisse plus fine dit qu'il vient après. */}
                {a.avgCost != null && (
                  <span style={{ opacity: 0.60, marginLeft: 5, fontWeight: 400 }}>
                    · PRU {eur(a.avgCost)}
                  </span>
                )}
              </div>
            );
          })()}
        </div>

        {/* Courbe sur toute la largeur, comme au concept : rangée à
            droite sur la moitié de la carte, elle laissait un vide à
            gauche que rien ne venait occuper. */}
        {/**
          * ⚠️ **La courbe prend la couleur de l'**actif**, pas celle de sa performance.** Elle
          * était verte ou rouge selon le sens du jour, comme le chiffre juste au-dessus. Mais la
          * carte entière est déjà teintée de la marque : une courbe verte sur une carte bleue
          * jurait, et surtout elle répétait une information que le pourcentage donne déjà en
          * toutes lettres. Sur trois lignes toutes en hausse, la maquette montre deux courbes
          * vertes et une **bleue** — c'est l'actif qu'on distingue d'un coup d'œil, pas son
          * signe.
          *
          * ⚠️ **Le sens de la variation reste dit, une fois.** Le montant et le pourcentage
          * gardent `chg` : c'est leur rôle. Le retirer là aussi aurait supprimé l'information au
          * lieu de la déplacer.
          */}
        <div style={{ flex: 1, display: "flex", alignItems: "flex-end", minHeight: 0, marginLeft: -2 }}>
          {a.spark && a.spark.length > 1 && (
            <TileSparkline pts={a.spark} color={couleur} w={222} h={50} updatedAt={a.updatedAt} enrichi />
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
