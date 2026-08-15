"use client";
import { useMemo, useRef, useState } from "react";
import * as d3 from "d3";

import AssetLogo from "@/components/AssetLogo";
import Segments from "@/components/ui/Segments";
import {
  blocsDuPortefeuille, poidsLisibles, regrouperLesMiettes, totalDesBlocs,
  type Bloc, type DossierPave, type ModePavage,
} from "@/lib/pavage";
import { decalerClarte } from "@/lib/couleur";
import { brandHex } from "@/lib/tileStyle";
import { CLAIR, RAYONS } from "@/lib/palette";
import { FONT } from "@/lib/typography";

/**
 * La répartition du portefeuille, en pavage.
 *
 * ⚠️ **Un pavage plutôt qu'un camembert, et l'objection est connue.** Une treemap a déjà été
 * retirée de cette application, pour un motif inscrit dans le code : « le poids codé par la
 * surface rendait les petites lignes illisibles ». Mais c'était pour remplacer la **grille
 * d'actifs**, là où l'on vient lire un cours, une variation, un prix de revient sur chaque
 * ligne. Ici le travail est autre : montrer la *forme* du portefeuille d'un coup d'œil. Et
 * le camembert code le poids par un **angle**, qui se compare plus mal encore qu'une aire.
 *
 * ⚠️ **Un mode, un système de couleurs — jamais deux à la fois.** Teinter les groupes à la
 * couleur des dossiers *et* les blocs à celle des titres donnait une image où la couleur ne
 * raconte plus rien. Chaque mode en porte donc un seul : les dossiers en « compte », les
 * cartes en « actif », une roue chromatique en « classe ».
 *
 * ⚠️ **Le tout vaut toujours le portefeuille entier, liquidités comprises.** Voir `pavage.ts`
 * et son invariant : sans cela, une même ligne vaudrait 20 % dans un mode et 34 % dans
 * l'autre — deux chiffres justes dans leur repère et incomparables entre eux.
 */

const MODES: { valeur: ModePavage; libelle: string }[] = [
  { valeur: "compte", libelle: "Compte" },
  { valeur: "actif", libelle: "Actif" },
  { valeur: "classe", libelle: "Classe" },
];

/**
 * Le contraste du texte sur un bloc.
 *
 * ⚠️ **Calculé, jamais choisi.** Les couleurs viennent de trois sources — les dossiers que
 * l'épargnant choisit, les marques des titres, une roue chromatique — et vont du citron au
 * bleu nuit. Une encre fixée en dur serait illisible sur la moitié d'entre elles. La formule
 * est celle de la luminance perçue, où le vert pèse cinq fois le bleu.
 */
function encreSur(hex: string): string {
  const n = hex.replace("#", "");
  const [r, v, b] = [0, 2, 4].map(i => parseInt(n.slice(i, i + 2), 16) || 0);
  const clarte = (0.299 * r + 0.587 * v + 0.114 * b) / 255;
  return clarte > 0.62 ? "rgba(10,14,24,0.88)" : "rgba(255,255,255,0.94)";
}

const EUROS = new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 0 });

export default function RepartitionPavee({
  dossiers, onVoirTout,
}: {
  dossiers: DossierPave[];
  onVoirTout?: () => void;
}) {
  const [mode, setMode] = useState<ModePavage>("compte");
  const [survol, setSurvol] = useState<string | null>(null);
  /** Le bloc retenu au clic, qui survit au départ du curseur. */
  const [choisi, setChoisi] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement>(null);
  /**
   * ⚠️ **La taille se mesure, elle ne se suppose pas.** Le pavage a besoin de pixels : posé
   * sur des pourcentages, `d3.treemap` rendrait des rectangles en unités de zéro à un et
   * l'arrondi des bordures se ferait sur des fractions. On observe donc la boîte.
   */
  const [boite, setBoite] = useState({ l: 0, h: 0 });
  const mesurer = (el: HTMLDivElement | null) => {
    if (!el) return;
    zone.current = el;
    const o = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setBoite({ l: Math.round(r.width), h: Math.round(r.height) });
    });
    o.observe(el);
  };

  const blocs = useMemo(() => {
    return regrouperLesMiettes(blocsDuPortefeuille(dossiers, mode, brandHex));
  }, [dossiers, mode]);
  const total = totalDesBlocs(blocs);
  /**
   * ⚠️ **Le survol prime sur la sélection tant qu'il dure.** L'inverse figerait la ligne sur
   * le bloc cliqué pendant qu'on en parcourt d'autres — on lirait un nom en en désignant un
   * second.
   */
  const lu = blocs.find(b => b.cle === (survol ?? choisi)) ?? null;

  /**
   * Les rectangles, posés par d3.
   *
   * ⚠️ **`treemapSquarify` et non le pavage par tranches.** Il cherche les proportions les
   * plus proches du carré : des rectangles allongés se comparent mal entre eux, et c'est
   * précisément le reproche fait à l'ancienne treemap de cette application.
   */
  const rectangles = useMemo(() => {
    /**
     * ⚠️ **Le pavage se dessine dès qu'une bande de texte y tient, et pas seulement quand
     * il est confortable.** Le seuil était à quarante pixels, posé au jugé : sur une fenêtre
     * courte la carte se retrouvait vide **et** silencieuse — ni image, ni message, un cadre
     * gris. Vingt-quatre suffisent pour que les plus gros blocs portent encore leur nom, et
     * une image aplatie dit toujours plus qu'un cadre vide.
     */
    if (blocs.length === 0 || boite.l < 40 || boite.h < 24) return [];

    /**
     * ⚠️ **Une hiérarchie plate, depuis que « compte » ne subdivise plus.** Elle a eu deux
     * niveaux le temps que ce mode découpe chaque dossier par ses lignes ; le second est
     * parti avec lui. Et il coûtait cher en géométrie : `paddingOuter` s'appliquant autour de
     * *chaque* groupe, deux blocs voisins de groupes différents étaient séparés de six pixels
     * quand deux blocs du même groupe l'étaient de deux. Vu à l'écran comme une gouttière au
     * milieu de l'image.
     */
    /**
     * ⚠️ **L'aire suit un poids relevé, jamais la valeur brute.** Un bloc à 2 % voisin d'un
     * bloc à 50 % devient un filet de vingt pixels sur cinquante — c'est de l'arithmétique,
     * pas un défaut de découpe. `poidsLisibles` relève les plus petits jusqu'à un plancher
     * et renormalise : la forme devient lisible, et le pourcentage écrit sur le bloc reste
     * exact. C'est le seul endroit de ce panneau où l'aire et le chiffre peuvent diverger,
     * et cela ne concerne que les blocs trop petits pour qu'on mesure leur aire à l'œil.
     */
    type Noeud = { enfants?: Noeud[]; bloc?: Bloc; poids?: number };
    const racine = d3.hierarchy<Noeud>(
      { enfants: poidsLisibles(blocs).map(({ bloc, poids }) => ({ bloc, poids })) },
      d => d.enfants,
    ).sum(d => d.poids ?? 0)
      /**
       * ⚠️ **Le tri décroissant n'est pas un détail de présentation : sans lui le pavage se
       * défait.** Les algorithmes de d3 supposent des nœuds rangés du plus grand au plus
       * petit — ils posent une bande, y ajoutent tant que les proportions s'améliorent, puis
       * en ouvrent une autre. Nourris dans l'ordre d'arrivée, ils laissent le dernier bloc
       * seul dans une bande pleine hauteur : mesuré sur les proportions signalées, **10
       * pixels sur 206, un rapport de 20,6**. Trié, le même bloc fait 40 sur 59.
       */
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));

    d3.treemap<Noeud>()
      .size([boite.l, boite.h])
      // Un seul écart, partout le même : c'est ce qui fait une grille et non un assemblage.
      .paddingInner(3)
      .round(true)
      /**
       * ⚠️ **`treemapBinary` plutôt que `treemapSquarify`, et c'est la mesure qui tranche.**
       * Squarify optimise la proportion *moyenne* ; ce qu'on veut ici est qu'**aucun** bloc
       * ne soit une barre. Comparés sur quatre répartitions, en pire rapport de côtés :
       * déséquilibrée 2,0 contre 3,6 ; longue de neuf lignes 1,8 contre 2,4 ; à deux blocs
       * égalité ; équilibrée 2,2 contre 1,9 — le seul cas où squarify gagne, d'un dixième.
       * Le plus petit côté ne descend jamais sous trente et un pixels.
       */
      .tile(d3.treemapBinary)(racine);

    return racine.leaves() as d3.HierarchyRectangularNode<Noeud>[];
  }, [blocs, boite]);

  /**
   * Les blocs que l'image ne peut pas nommer.
   *
   * ⚠️ **Le même critère que le rendu, pris au même endroit.** Deux conditions séparées —
   * l'une pour afficher, l'autre pour lister — auraient fini par se contredire : un bloc
   * nommé deux fois, ou pas du tout. Le seuil vit ici, le rendu s'y réfère.
   */
  return (
    <>
      {/**
        * ⚠️ **La rangée s'aligne sur la barre d'outils de la courbe, à sa gauche.** Les deux
        * commandent chacune leur image et se font face à travers l'écran ; décalées, elles se
        * voient sans qu'on sache pourquoi.
        *
        * ⚠️ **Même taille de segments, et non une hauteur imposée par-dessus.** La barre d'en
        * face est en `md` — vingt-six pixels de bouton, trente de piste. En `sm`, la piste
        * n'en faisait que vingt-six : les deux marges, haute et basse, tombaient à deux
        * pixels l'une de l'autre. Forcer la hauteur du conteneur aurait centré les boutons
        * sans leur donner les mêmes bords ; c'est le composant qui doit être au même
        * calibre.
        *
        * ⚠️ **Le retrait négatif reste, et il compense un rembourrage.** La carte est plus
        * généreuse que celle de la courbe : sans lui la rangée descend de cinq pixels.
        */}
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginTop: -5, marginBottom: 5, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Répartition
        </span>
        <Segments ariaLabel="Découper la répartition"
          valeur={mode} onChange={v => setMode(v as ModePavage)}
          options={MODES.map(m => ({ valeur: m.valeur, libelle: m.libelle }))} />
      </div>

      {/**
        * La ligne de lecture du pavage.
        *
        * ⚠️ **Une ligne unique et réservée, et non une légende.** La différence n'est pas de
        * degré : une légende énumère en permanence ce que les blocs portent déjà, et coûte sa
        * place à chaque instant. Celle-ci ne dit qu'une chose — ce qu'on désigne — et c'est
        * la seule réponse au problème qu'aucun réglage ne résout : sous trente-quatre pixels
        * de large, un bloc ne peut rien écrire, quoi qu'on fasse.
        *
        * ⚠️ **Sa hauteur est réservée, occupée ou non.** Apparue au survol, elle pousserait
        * le pavage vers le bas au moment précis où l'on vise un bloc — et le bloc visé
        * bougerait sous le curseur.
        *
        * ⚠️ **Le clic sélectionne, parce que le survol n'existe pas au doigt.** Sans lui, un
        * bloc trop petit pour s'annoncer resterait anonyme sur tout écran tactile. Le second
        * clic désélectionne : rien ne doit rester accroché sans moyen de s'en défaire.
        */}
      <div style={{ height: 17, marginBottom: 8, display: "flex", alignItems: "center",
        gap: 6, minWidth: 0, flexShrink: 0 }}>
        {lu ? (
          <>
            <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
              background: lu.couleur }} />
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: CLAIR.texte,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lu.nom}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue,
              whiteSpace: "nowrap", marginLeft: "auto", flexShrink: 0 }}>
              {EUROS.format(Math.round(lu.valeur))} €
              {" · "}
              {Math.round((total > 0 ? lu.valeur / total : 0) * 100)} %
            </span>
          </>
        ) : (
          /* ⚠️ Un mot plutôt qu'un vide : une bande grise réservée sans rien dedans se lit
             comme un défaut d'affichage, et rien n'apprendrait que les blocs répondent. */
          <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteFaible }}>
            Touchez un bloc pour le détail
          </span>
        )}
      </div>

      {/* ⚠️ **Le pavage prend la place, la légende se réduit à une ligne.** Demandé ainsi, et
          c'est ce qui distingue ce panneau du camembert : l'image *est* l'information. Le
          détail par ligne vit dans l'onglet Analyse, à un clic. */}
      <div ref={mesurer} style={{ flex: 1, minHeight: 0, position: "relative",
        borderRadius: RAYONS.xs, overflow: "hidden" }}>
        {rectangles.map((n) => {
          const b = n.data.bloc!;
          const l = n.x1 - n.x0, h = n.y1 - n.y0;
          const part = total > 0 ? b.valeur / total : 0;
          // ⚠️ Le texte n'apparaît que si le bloc peut le porter en entier. Tronqué, il se
          // lit comme un autre ticker — « ESE… » et « ESG… » se ressemblent trop.
          /**
           * ⚠️ **Un bloc écrit à sa taille normale, ou n'écrit pas — la petite casse a
           * disparu.** Elle existait pour arracher un nom aux blocs les plus étroits, du
           * temps où se taire signifiait n'être nommé nulle part. La ligne de lecture ayant
           * pris ce rôle, tasser du neuf pixels dans une bande de seize ne fait plus que
           * salir l'image pour une information qui est déjà ailleurs, en plus grand.
           *
           * ⚠️ **La part demande une seconde ligne, donc son propre seuil.** Au même que le
           * nom, l'une des deux déborderait — et ce serait le nom, écrit en premier.
           *
           * ⚠️ **Rien n'est jamais tronqué.** « ESE… » et « ESG… » se ressemblent trop : un
           * nom coupé se lit comme un autre nom, ce qui est pire que pas de nom du tout.
           */
          const nomLisible = l >= 52 && h >= 28;
          const partLisible = l >= 52 && h >= 46;
          return (
            <div key={b.cle}
              onMouseEnter={() => setSurvol(b.cle)}
              onMouseLeave={() => setSurvol(s => (s === b.cle ? null : s))}
              onClick={() => setChoisi(c => (c === b.cle ? null : b.cle))}
              title={`${b.nom} — ${EUROS.format(Math.round(b.valeur))} € `
                + `· ${Math.round(part * 100)} %`}
              style={{
                position: "absolute", left: n.x0, top: n.y0, width: l, height: h,
                background: b.couleur, borderRadius: 5, overflow: "hidden",
                display: "flex", flexDirection: "column",
                // Centré quand le bloc ne porte qu'une ligne : collée en bas, elle touche le
                // bord et paraît déborder.
                justifyContent: partLisible ? "flex-end" : "center",
                padding: nomLisible ? "5px 6px" : 0, boxSizing: "border-box",
                // ⚠️ Le survol éclaircit au lieu d'agrandir : une tuile qui grandit
                // recouvre ses voisines et déplace ce qu'on visait.
                boxShadow: lu?.cle === b.cle
                  ? `inset 0 0 0 999px rgba(255,255,255,0.12)` : "none",
                transition: "box-shadow 120ms",
              }}>
              {nomLisible && (
                <span style={{ fontFamily: FONT, fontSize: 10.5, fontWeight: 700,
                  color: encreSur(b.couleur), lineHeight: 1.2,
                  overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {b.nom}
                </span>
              )}
              {partLisible && (
                <span style={{ fontFamily: FONT, fontSize: 9.5, lineHeight: 1.3,
                  color: encreSur(b.couleur), opacity: 0.72 }}>
                  {Math.round(part * 100)} %
                </span>
              )}
            </div>
          );
        })}
        {blocs.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue }}>
            Rien à répartir pour l’instant.
          </div>
        )}
      </div>

      {/* ⚠️ **Plus de légende sous l'image.** Elle donnait le nombre de blocs et le total,
          et prenait vingt-cinq pixels sur un panneau qui en a moins de trois cents : le
          total figure déjà en gros dans le bandeau de tête, et compter les blocs revenait à
          décrire l'image au lieu de la montrer. Ce qu'un bloc vaut se lit au survol. */}
      {/* ⚠️ **Pas de légende sous l'image, et c'est demandé deux fois.** J'en ai remis une
          pour nommer les blocs muets : c'était traiter le symptôme. Un bloc doit parler
          lui-même dès qu'il en a physiquement la place, et se taire seulement quand il n'en
          a pas — le survol reste alors le dernier recours. */}
      {onVoirTout && (
        <button type="button" onClick={onVoirTout}
          style={{
            display: "flex", alignItems: "center", gap: 5, marginTop: 8, flexShrink: 0,
            background: "none", border: "none", cursor: "pointer", padding: 0,
            fontFamily: FONT, fontSize: 11, fontWeight: 500, color: CLAIR.accent,
          }}>
          Voir la répartition détaillée
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M5 12h14M13 6l6 6-6 6" />
          </svg>
        </button>
      )}
    </>
  );
}
