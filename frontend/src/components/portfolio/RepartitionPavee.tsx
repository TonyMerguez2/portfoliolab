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
   * Les rectangles, posés par d3.
   *
   * ⚠️ **`treemapSquarify` et non le pavage par tranches.** Il cherche les proportions les
   * plus proches du carré : des rectangles allongés se comparent mal entre eux, et c'est
   * précisément le reproche fait à l'ancienne treemap de cette application.
   */
  const rectangles = useMemo(() => {
    if (blocs.length === 0 || boite.l < 40 || boite.h < 40) return [];

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
    ).sum(d => d.poids ?? 0);

    d3.treemap<Noeud>()
      .size([boite.l, boite.h])
      // Un seul écart, partout le même : c'est ce qui fait une grille et non un assemblage.
      .paddingInner(3)
      .round(true)
      .tile(d3.treemapSquarify)(racine);

    return racine.leaves() as d3.HierarchyRectangularNode<Noeud>[];
  }, [blocs, boite]);

  const enAvant = blocs.find(b => b.cle === survol) ?? null;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between",
        gap: 8, marginBottom: 10, flexShrink: 0 }}>
        <span style={{ fontFamily: FONT, fontSize: 12.5, fontWeight: 600, color: CLAIR.texte }}>
          Répartition
        </span>
        <Segments taille="sm" ariaLabel="Découper la répartition"
          valeur={mode} onChange={v => setMode(v as ModePavage)}
          options={MODES.map(m => ({ valeur: m.valeur, libelle: m.libelle }))} />
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
          // ⚠️ Quarante-huit et non cinquante-quatre : mesuré, un bloc de 52 pixels portait
          // « ETZ.PA » sans le tronquer et restait pourtant muet, à deux pixels près.
          const nomLisible = l >= 48 && h >= 30;
          const partLisible = l >= 48 && h >= 46;
          return (
            <div key={b.cle}
              onMouseEnter={() => setSurvol(b.cle)}
              onMouseLeave={() => setSurvol(s => (s === b.cle ? null : s))}
              title={`${b.nom} — ${EUROS.format(Math.round(b.valeur))} € `
                + `· ${Math.round(part * 100)} %`}
              style={{
                position: "absolute", left: n.x0, top: n.y0, width: l, height: h,
                background: b.couleur, borderRadius: 5, overflow: "hidden",
                display: "flex", flexDirection: "column", justifyContent: "flex-end",
                padding: nomLisible ? "5px 6px" : 0, boxSizing: "border-box",
                // ⚠️ Le survol éclaircit au lieu d'agrandir : une tuile qui grandit
                // recouvre ses voisines et déplace ce qu'on visait.
                boxShadow: survol === b.cle
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
