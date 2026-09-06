"use client";
import { useMemo, useRef, useState } from "react";
import * as d3 from "d3";
import { poidsLisibles, totalDesBlocs, type Bloc } from "@/lib/pavage";
import { CLAIR } from "@/lib/palette";
import { FONT, NUM } from "@/lib/typography";

/**
 * Une carte en arbre : des tuiles dont l'aire vaut la part, et une ligne de lecture au-dessus.
 *
 * ⚠️ **Sortie de « Répartition » pour servir aussi à « Exposition ».** Les deux cartes posent
 * la même question — quelles parts d'un tout — et l'exposition la posait en cinq barres
 * horizontales, c'est-à-dire dans la forme des cinq piliers du score, qui sont eux cinq notes
 * *indépendantes*. Deux questions de natures différentes avaient la même image, et deux
 * questions identiques en avaient deux. La mosaïque tranche : même question, même forme.
 *
 * ⚠️ **Ce qu'elle amène en prime, et qui manquerait à toute autre construction :** le plancher
 * d'aire qui empêche une part de un pour cent de devenir un filet, la règle qui tait le nom
 * d'une tuile trop petite pour le porter en entier, et la ligne de lecture qui nomme au survol
 * ce que les petites tuiles taisent. Trois réglages faits à l'écran, qu'une seconde
 * implémentation aurait redemandés.
 */

/**
 * Une part en pourcentage, avec la précision que sa taille demande.
 *
 * ⚠️ **Une petite ligne ne vaut pas « 0 % ».** La ligne de lecture arrondissait à l'entier :
 * un compte de 400 € sur 88 000 affichait « 0 % », ce qui est faux et se lit comme une
 * absence. Sous 1 %, deux décimales ; sous 10 %, une ; au-dessus, l'entier — le même
 * formateur pour la ligne de lecture et pour les tuiles, sinon la même part s'écrirait
 * deux fois différemment à trois centimètres d'écart.
 */
const pourcentage = (part: number) => {
  const p = part * 100;
  const texte = p >= 10 ? Math.round(p).toString() : p >= 1 ? p.toFixed(1) : p.toFixed(2);
  return `${texte.replace(".", ",")} %`;
};

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

export default function Mosaique({ blocs, invite, vide, montant, dessin }: {
  blocs: Bloc[];
  /** Ce que dit la ligne de lecture quand rien n'est survolé. */
  invite?: string;
  /** Ce qui s'affiche à la place de l'image quand il n'y a rien à découper. */
  vide?: string;
  /**
   * Le montant d'un bloc, en clair — écrit sous sa part et dans la ligne de lecture.
   *
   * ⚠️ **Absent quand il n'y a pas de montant à dire.** Les parts d'exposition sont des
   * pourcentages sans euros derrière : leur inventer un montant reviendrait à valoriser une
   * ventilation qui n'est pas une somme d'argent.
   */
  montant?: (b: Bloc) => string;
  /**
   * Un dessin posé devant le nom, dans la tuile comme dans la ligne de lecture.
   *
   * ⚠️ **Pour le drapeau des zones, mis en évidence sur la tuile.** Il a d'abord précédé le
   * nom en petit, puis rempli le fond de la tuile — trop chargé, et le texte demandait un
   * voile pour rester lisible. Il est maintenant posé seul au-dessus du nom, à la taille que
   * la tuile permet : assez grand pour nommer le pays sans un mot, sur un fond resté uni.
   * Dans la ligne de lecture il remplace la pastille de couleur, qui n'identifie rien qu'un
   * pavillon n'identifie mieux.
   */
  dessin?: (b: Bloc, cote: number) => React.ReactNode;
}) {
  const [survol, setSurvol] = useState<string | null>(null);
  /* Le bloc retenu au clic, pour lire une tuile sans garder le doigt dessus. */
  const [choisi, setChoisi] = useState<string | null>(null);
  const zone = useRef<HTMLDivElement>(null);
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

  const total = totalDesBlocs(blocs);
  const lu = blocs.find(b => b.cle === (survol ?? choisi)) ?? null;

  const rectangles = useMemo(() => {
    if (blocs.length === 0 || boite.l < 40 || boite.h < 24) return [];
    type Noeud = { enfants?: Noeud[]; bloc?: Bloc; poids?: number };
    const racine = d3.hierarchy<Noeud>(
      { enfants: poidsLisibles(blocs).map(({ bloc, poids }) => ({ bloc, poids })) },
      d => d.enfants,
    ).sum(d => d.poids ?? 0)
      .sort((a, b) => (b.value ?? 0) - (a.value ?? 0));
    d3.treemap<Noeud>()
      .size([boite.l, boite.h])
      // Un seul écart, partout le même : c'est ce qui fait une grille et non un assemblage.
      .paddingInner(3)
      .round(true)
      .tile(d3.treemapBinary)(racine);
    return racine.leaves() as d3.HierarchyRectangularNode<Noeud>[];
  }, [blocs, boite]);

  return (
    <>
      {/**
        * La ligne de lecture : ce que nomme la tuile sous le curseur.
        *
        * ⚠️ **Sa hauteur est réservée même vide**, sans quoi l'image sauterait de dix-sept
        * pixels au premier survol. Et un mot y remplace le vide : une bande grise sans rien
        * dedans se lit comme un défaut d'affichage, et rien n'apprendrait que les blocs
        * répondent.
        */}
      <div style={{ height: 17, marginBottom: 8, display: "flex", alignItems: "center",
        gap: 6, minWidth: 0, flexShrink: 0 }}>
        {lu ? (
          <>
            {dessin?.(lu, 14) ?? (
              <span style={{ width: 8, height: 8, borderRadius: 2, flexShrink: 0,
                background: lu.couleur }} />
            )}
            <span style={{ fontFamily: FONT, fontSize: 11, fontWeight: 600, color: CLAIR.texte,
              overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {lu.nom}
            </span>
            <span style={{ fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue,
              whiteSpace: "nowrap", marginLeft: "auto", flexShrink: 0 }}>
              {montant && <>{montant(lu)}{" · "}</>}
              {pourcentage(total > 0 ? lu.valeur / total : 0)}
            </span>
          </>
        ) : (
          <span style={{ fontFamily: FONT, fontSize: 10.5, color: CLAIR.texteFaible }}>
            {invite ?? "Touchez un bloc pour le détail"}
          </span>
        )}
      </div>

      {/* ⚠️ Pas d'arrondi sur le cadre : il rognait les quatre coins extérieurs de la
          mosaïque, et les tuiles d'angle paraissaient arrondies alors qu'elles ne le sont
          plus. Signalé après le retrait du rayon des tuiles elles-mêmes. */}
      <div ref={mesurer} style={{ flex: 1, minHeight: 0, position: "relative", overflow: "hidden" }}>
        {rectangles.map((n) => {
          const b = n.data.bloc!;
          const l = n.x1 - n.x0, h = n.y1 - n.y0;
          const part = total > 0 ? b.valeur / total : 0;
          /**
           * ⚠️ **Les corps sont fixes, quelle que soit la tuile ; ce qui ne tient pas ne
           * s'écrit pas.** La même information doit se lire au même corps partout, et une
           * tuile qui ne peut pas porter une ligne entière s'en passe — la ligne de lecture
           * la porte au survol. Rien n'est jamais tronqué : « ESE… » et « ESG… » se
           * ressemblent trop, un nom coupé se lit comme un autre nom.
           */
          const TAILLE_NOM = 10.5, TAILLE_PART = 20;
          /**
           * ⚠️ **Le dessin passe au-dessus du nom, en grand, sur un fond resté uni.** Il a
           * rempli le fond de la tuile une version : l'image mangeait la couleur qui porte la
           * lecture, et le texte demandait un voile pour rester lisible. Sa taille suit la
           * tuile, bornée pour qu'un grand bloc ne se transforme pas en affiche.
           */
          const cote = Math.max(16, Math.min(30, Math.round(Math.min(l, h) * 0.22)));
          const emblemeLisible = !!dessin && l >= 72 && h >= 74;
          const encre = encreSur(b.couleur);
          const nomLisible = l >= 72 && h >= 52;
          const partLisible = nomLisible;
          const montantLisible = !!montant && nomLisible && l >= 78 && h >= 70;
          return (
            <div key={b.cle}
              onMouseEnter={() => setSurvol(b.cle)}
              onMouseLeave={() => setSurvol(s => (s === b.cle ? null : s))}
              onClick={() => setChoisi(c => (c === b.cle ? null : b.cle))}
              /* ⚠️ **Pas de `title` : l'infobulle du navigateur est bannie du site.** La ligne
                 de lecture nomme la tuile, au même endroit à chaque fois et sans attendre. */
              style={{
                position: "absolute", left: n.x0, top: n.y0, width: l, height: h,
                /* ⚠️ **Un arrondi léger, après deux allers-retours.** Cinq pixels faisaient une
                   mosaïque de galets et l'arrondi a été retiré ; à zéro, l'image devenait dure.
                   Trois adoucissent l'angle sans détacher les tuiles les unes des autres. */
                background: b.couleur, borderRadius: 3, overflow: "hidden",
                display: "flex", flexDirection: "column", gap: 1,
                /* ⚠️ En haut à gauche, toujours — y compris quand la tuile ne porte que son
                   nom : un nom centré à côté de tuiles qui écrivent en haut se lit comme mal
                   posé, deux règles d'alignement dans la même image. */
                justifyContent: "flex-start",
                padding: nomLisible ? "6px 7px" : 0, boxSizing: "border-box",
                // ⚠️ Le survol éclaircit au lieu d'agrandir : une tuile qui grandit recouvre
                // ses voisines et déplace ce qu'on visait.
                boxShadow: lu?.cle === b.cle ? "inset 0 0 0 999px rgba(255,255,255,0.12)" : "none",
                transition: "box-shadow 120ms",
              }}>
              {emblemeLisible && (
                <span style={{ display: "block", marginBottom: 3 }}>{dessin!(b, cote)}</span>
              )}
              {nomLisible && (
                <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0,
                  fontFamily: FONT, fontSize: TAILLE_NOM, fontWeight: 600,
                  color: encre, lineHeight: 1.2, opacity: 0.9 }}>
                  {/* Sur une tuile trop basse pour l'emblème, le dessin revient devant le nom. */}
                  {!emblemeLisible && dessin?.(b, 13)}
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {b.nom}
                  </span>
                </span>
              )}
              {partLisible && (
                <span style={{ ...NUM, fontSize: TAILLE_PART, fontWeight: 800, lineHeight: 1.1,
                  letterSpacing: "-0.02em", color: encre }}>
                  {pourcentage(part)}
                </span>
              )}
              {montantLisible && (
                /* ⚠️ Même corps, même graisse et même encre que le nom : le montant est une
                   information de même rang, et se lit à sa suite. */
                <span style={{ ...NUM, fontSize: TAILLE_NOM, fontWeight: 600, lineHeight: 1.2,
                  color: encre, opacity: 0.9 }}>
                  {montant!(b)}
                </span>
              )}
            </div>
          );
        })}
        {blocs.length === 0 && (
          <div style={{ position: "absolute", inset: 0, display: "flex",
            alignItems: "center", justifyContent: "center",
            fontFamily: FONT, fontSize: 11, color: CLAIR.texteAttenue }}>
            {vide ?? "Rien à répartir pour l’instant."}
          </div>
        )}
      </div>
    </>
  );
}
