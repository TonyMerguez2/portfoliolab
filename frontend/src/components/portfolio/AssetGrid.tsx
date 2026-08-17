"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactionAvatar from "@/components/ReactionAvatar";
import CarteActif from "@/components/portfolio/CarteActif";
import RailHorizontal from "@/components/portfolio/RailHorizontal";
import { arrange, type GridAsset, type SortKey } from "@/lib/portfolio";
import { FONT, NUM } from "@/lib/typography";
import { CLAIR, RAYONS } from "@/lib/palette";

export type { GridAsset, SortKey };

/**
 * Grille d'actifs à cartes de taille égale.
 *
 * Remplace la treemap pondérée. Le poids se lit désormais en chiffres, en haut
 * de chaque carte, plutôt qu'en surface : l'aire est un encodage faible — on
 * compare mal deux rectangles de proportions différentes — et surtout elle
 * rendait les petites lignes illisibles, alors que ce sont souvent celles
 * qu'on veut inspecter. À taille égale, chaque actif reçoit la même place pour
 * son prix, sa variation et sa courbe.
 *
 * L'habillage vient de TileCard, donc strictement le même que les cartes de la
 * page graphique : fond, bord dégradé, reflet au survol.
 */


const TRIS: Record<SortKey, string> = {
  poids: "Poids", perf: "Performance", valeur: "Valeur", alpha: "Nom",
};

export default function AssetGrid({
  assets, onAssetClick, view, titre = "Vos actifs", action,
}: {
  assets: GridAsset[];
  onAssetClick?: (ticker: string) => void;
  /** Vue courante. La bascule visible est retirée ; le rail se masque encore
   *  si le parent bascule en liste par un autre chemin. */
  view?: "carte" | "liste";
  /**
   * Ce que la grille annonce à sa gauche.
   *
   * ⚠️ **Un nœud et non une chaîne, parce que la grille ne montre pas toujours tout.**
   * Quand elle affiche le contenu d'un dossier, ce n'est plus un titre qui va là mais
   * le chemin — avec de quoi remonter. Laisser « Vos actifs » ferait lire une grille
   * amputée comme le portefeuille entier, et n'offrirait aucun retour.
   */
  titre?: React.ReactNode;
  /**
   * Une commande propre au contenu montré, posée à droite avant le tri.
   *
   * ⚠️ **Ici plutôt que dans la rangée de dossiers, parce que les deux se remplacent.** Le
   * bouton « Ajouter un compte » n'existe qu'à la racine ; dès qu'un dossier est ouvert,
   * c'est cette rangée-ci qui occupe la place, et son coin droit est libre.
   */
  action?: React.ReactNode;
}) {
  const [sort, setSort] = useState<SortKey>("poids");
  const [menuTri, setMenuTri] = useState(false);

  /**
   * ⚠️ **Le filtre par classe est parti, et sa mécanique avec lui.** Il restait sinon un
   * état `filter` que plus personne ne changeait, la liste des classes présentes, et la
   * garde qui ramenait à « Tous » quand le choix perdait son sens — trois rouages entiers
   * pour une valeur devenue constante. Du code mort ne protège de rien et se relit comme
   * une intention.
   *
   * `arrange` garde son paramètre : il sert au tri, et « Tous » y veut dire « ne retire
   * personne ». La grille montre donc tout le dossier, qui est déjà un filtre à lui seul.
   */
  const shown = useMemo(() => arrange(assets, "Tous", sort), [assets, sort]);

  /**
   * La variation moyenne des lignes montrées, qui sert de repère à l'avatar.
   *
   * Simple moyenne et non moyenne pondérée : on compare des **lignes** entre elles,
   * pas leur contribution au portefeuille. Une petite ligne qui s'envole doit
   * surprendre autant qu'une grosse.
   */
  const moyenneChange = useMemo(() => {
    const v = shown.map(a => a.change).filter((c): c is number => typeof c === "number");
    return v.length ? v.reduce((s, c) => s + c, 0) / v.length : null;
  }, [shown]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {/* Une seule ligne : titre, filtres, puis le tri à droite — comme au
          concept. Le titre vivait au-dessus, dans une barre séparée qui
          portait aussi une infobulle et un bouton d'ajout absents du concept. */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10, flexShrink: 0 }}>
        {/**
          * ⚠️ **Le filtre par classe est retiré, à la demande.** Il proposait « Tous »,
          * « Actions », « ETF », « Crypto » à côté du chemin. Ce qu'on perd est réel — sur
          * un dossier mêlant actions et crypto, il n'y a plus de façon de n'en voir qu'une
          * — mais un dossier est déjà un filtre, et deux découpages superposés dans la
          * même barre demandaient de comprendre lequel commande l'autre. La grille montre
          * donc tout le dossier, et le tri reste pour l'ordonner.
          */}
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.surFond,
                       whiteSpace: "nowrap", minWidth: 0 }}>
          {titre}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 6, position: "relative", flexShrink: 0 }}>
          {/**
            * ⚠️ **L'action tient dans les 26 pixels de cette rangée, et ce n'est pas
            * négociable.** Cette hauteur est celle du bouton de tri d'à côté, et elle est
            * aussi celle de l'en-tête de la rangée de dossiers : les deux écrans se
            * remplacent l'un l'autre, et si l'un est plus haut, la courbe au-dessus gagne
            * des pixels à la vue des dossiers pour les reperdre à l'ouverture de l'un
            * d'eux. Un contenu plus long change la largeur, jamais la hauteur.
            */}
          {action}
          <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.surFondAttenue, whiteSpace: "nowrap" }}>
            Trier par
          </span>
          <button type="button" onClick={() => setMenuTri(v => !v)}
            aria-haspopup="listbox" aria-expanded={menuTri}
            className="novac-lisere"
            /**
             * ⚠️ **Même fabrication que la pilule d'ajout, teinte à part.** Rayon plein,
             * 26 pixels, le liseré des tuiles : les deux se ressemblent assez pour se lire
             * comme une même famille. Mais le fond reste celui d'une carte et l'encre
             * normale, parce qu'une action qui *crée* et un réglage qui *ordonne* ne
             * doivent pas peser pareil à l'œil. Tranché avec l'épargnant.
             *
             * ⚠️ L'angle du liseré suit les proportions : ~86 × 26 donne
             * 180° − atan(26/86) = 163°. Voir le calcul dans `globals.css`.
             */
            style={{
              display: "flex", alignItems: "center", gap: 6, height: 26, padding: "0 12px",
              borderRadius: RAYONS.plein, cursor: "pointer", border: "none",
              ["--nv-lisere-angle" as string]: "163deg",
              background: menuTri ? CLAIR.carteCreuse : CLAIR.carte,
              color: CLAIR.texte, fontFamily: FONT, fontSize: 11.5, fontWeight: 500,
              transition: "background 140ms",
            }}>
            {TRIS[sort]}
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor"
              strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round"
              style={{ opacity: 0.5, transform: menuTri ? "rotate(180deg)" : "none", transition: "transform 160ms" }}>
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {menuTri && (
            <>
              <div style={{ position: "fixed", inset: 0, zIndex: 40 }} onClick={() => setMenuTri(false)} />
              {/**
                * ⚠️ **Le bord est celui des cartes, pas un gris plus clair.** La liste
                * portait `bordFort` — rgb(30,41,57) — quand tout panneau de la page porte
                * `bord`, rgb(16,24,40). Le fond, lui, était déjà le bon : c'est le seul
                * trait qui la désignait comme venue d'ailleurs. Un menu qui s'ouvre est un
                * conteneur de plus, il n'a pas à s'annoncer par une arête plus vive.
                */}
              <div role="listbox" style={{
                position: "absolute", top: "calc(100% + 5px)", right: 0, zIndex: 41, minWidth: 132,
                background: CLAIR.carte, border: `1px solid ${CLAIR.bord}`,
                borderRadius: RAYONS.md, padding: 4, boxShadow: CLAIR.ombre,
              }}>
                {(Object.keys(TRIS) as SortKey[]).map(k => (
                  <button key={k} type="button" role="option" aria-selected={k === sort}
                    onClick={() => { setSort(k); setMenuTri(false); }}
                    style={{
                      display: "flex", alignItems: "center", justifyContent: "space-between", width: "100%",
                      height: 28, padding: "0 9px", borderRadius: RAYONS.xs, border: "none", cursor: "pointer",
                      background: k === sort ? CLAIR.accentDoux : "transparent",
                      color: k === sort ? CLAIR.texte : CLAIR.texteSecondaire,
                      fontFamily: FONT, fontSize: 11.5, fontWeight: k === sort ? 600 : 500, textAlign: "left",
                    }}
                    onMouseEnter={e => { if (k !== sort) e.currentTarget.style.background = CLAIR.carteCreuse; }}
                    onMouseLeave={e => { if (k !== sort) e.currentTarget.style.background = "transparent"; }}>
                    {TRIS[k]}
                    {k === sort && (
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                        strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round">
                        <path d="M20 6L9 17l-5-5" />
                      </svg>
                    )}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Les cartes gardent une largeur fixe — c'est ce qui les maintient toutes à la
          même taille — et le rail défile. */}
      <RailHorizontal cache={view === "liste"}>
        {shown.map(a => {
          /**
           * ⚠️ **L'avatar réagit à l'écart au portefeuille, pas à la variation brute.**
           * `change` est la variation sur la **période affichée** : sur la fenêtre Max
           * elle atteint des centaines de pour cent, si bien que toutes les lignes
           * franchissaient le seuil de l'étonnement — le visage était surpris en
           * permanence, donc ne disait plus rien, et sursautait à chaque carte
           * survolée. Comparée à la moyenne des lignes, la même donnée redevient
           * lisible : cette ligne fait-elle mieux ou moins bien que les autres ?
           */
          const ecart = a.change != null && moyenneChange != null
            ? a.change - moyenneChange : null;
          return (
            <ReactionAvatar key={a.ticker} variation={ecart}>
            <CarteActif a={a}
              onClick={onAssetClick ? () => onAssetClick(a.ticker) : undefined} />
            </ReactionAvatar>
          );
        })}
      </RailHorizontal>

    </div>
  );
}
