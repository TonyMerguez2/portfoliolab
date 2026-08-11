"use client";
import { useEffect, useState } from "react";

import Cadre from "@/components/ui/Cadre";
import { observations, type Objectif } from "@/lib/objectifs";
import { FONT } from "@/lib/typography";

/**
 * Des interprétations chiffrées sur l'objectif projeté — jamais des conseils.
 *
 * ⚠️ **Ce panneau occupe l'emplacement des « Recommandations IA » de la maquette**, qui
 * proposait « augmenter votre investissement mensuel à 1 000 € », « réduire l'exposition
 * aux actions à 70 % ». C'est du conseil en investissement personnalisé, que ce logiciel ne
 * produit pas. Ce qui suit est arithmétique, et chaque phrase se recompte à la main.
 *
 * ⚠️ **Le titre nomme la fonction du panneau, pas une parole du logiciel.** « Aide à la
 * décision » est vrai : les lignes servent à trancher — ce que valent cent euros de plus,
 * quel rythme exigerait l'échéance, quel levier commande. « Recommandations » serait faux,
 * puisqu'aucune ne dit quoi faire ; « Insight IA » le serait autrement, puisque rien ici
 * n'est produit par un modèle.
 *
 * ⚠️ **Une aide à la fois, et non une liste.** Quatre phrases empilées se lisent en diagonale
 * et se valent toutes ; une seule, en grand, se lit. La navigation par points rend le nombre
 * visible sans occuper de place, et laisse l'épargnant parcourir à son rythme. Aucun
 * défilement automatique : un texte qui bouge tout seul se lit deux fois moins bien.
 */

/** L'étincelle du titre : un encart à lire, pas une intelligence qui aurait parlé. */
const ETINCELLE = "M16.999 21.744c-1.24-.066-2.862-.835-4.963-2.289l-.039-.026-.036.026c-2.101 "
  + "1.455-3.723 2.224-4.964 2.29l-.174.005c-2.688 0-3.03-2.566-1.681-7.041l.053-.173-.098-.073c"
  + "-5.926-4.508-4.938-7.628 2.5-7.84l.197-.005.113-.317c1.158-3.236 2.374-4.942 3.94-5.046L12 "
  + "1.25c1.638 0 2.894 1.71 4.093 5.051l.111.317.2.005c7.437.212 8.426 3.332 2.498 7.84l-.1.072"
  + ".054.173c1.321 4.386 1.018 6.937-1.523 7.037l-.159.003z";

/**
 * Le ciel du panneau : un fond noir, deux nébuleuses très pâles, et des étoiles.
 *
 * ⚠️ **Les positions sortent d'un générateur à graine fixe, calculé une seule fois au
 * chargement du module.** Un `Math.random()` par rendu redistribuerait le ciel à chaque
 * changement de page, ce qui se verrait comme un scintillement ; un semis figé dans le code
 * serait quarante lignes de coordonnées à maintenir. Une graine constante donne les deux : un
 * ciel stable et une seule ligne à relire.
 *
 * ⚠️ **Le dégradé de couleur qui occupait ce fond a disparu, et avec lui son calcul de
 * contraste.** Il avait fallu assombrir cinq arrêts pastel pour atteindre 5,6 pour 1 ; sur un
 * fond quasi noir, du texte blanc dépasse 15 pour 1 partout. Les nébuleuses restent sous 12 %
 * d'opacité pour ne pas rouvrir la question.
 */
const CIEL = (() => {
  // Générateur congruentiel linéaire — suffisant pour semer des étoiles, et reproductible.
  let graine = 20260811;
  const suivant = () => {
    graine = (graine * 1103515245 + 12345) % 2147483648;
    return graine / 2147483648;
  };
  const couches: string[] = [];
  for (let i = 0; i < 38; i++) {
    const x = (suivant() * 100).toFixed(2);
    const y = (suivant() * 100).toFixed(2);
    // Des calibres inégaux : un ciel dont toutes les étoiles ont la même taille se lit comme
    // une trame, pas comme un ciel.
    const rayon = (0.5 + suivant() * 1.2).toFixed(2);
    const alpha = (0.14 + suivant() * 0.52).toFixed(2);
    couches.push(`radial-gradient(circle ${rayon}px at ${x}% ${y}%, `
      + `rgba(255,255,255,${alpha}) 0%, rgba(255,255,255,0) 100%)`);
  }
  // Deux voiles larges sous les étoiles, pour que le noir ait de la profondeur.
  couches.push("radial-gradient(ellipse 90% 120% at 12% 0%, rgba(96,132,255,0.11) 0%, "
    + "rgba(96,132,255,0) 70%)");
  couches.push("radial-gradient(ellipse 80% 110% at 92% 100%, rgba(186,110,255,0.09) 0%, "
    + "rgba(186,110,255,0) 68%)");
  return couches.join(", ");
})();

/** Le noir de l'espace, sous le ciel. */
const FOND_ESPACE = "#05060B";

/**
 * La navigation entre les aides, en points.
 *
 * ⚠️ Des boutons et non des pastilles décoratives : chacun porte son intitulé pour un lecteur
 * d'écran, et la tabulation les atteint. Une pagination qu'on ne peut pas atteindre au clavier
 * cache purement et simplement les aides suivantes.
 */
function Points({ nombre, courant, onChoisir }: {
  nombre: number; courant: number; onChoisir: (i: number) => void;
}) {
  return (
    <div role="tablist" aria-label="Aides disponibles"
      style={{ display: "flex", alignItems: "center", gap: 5, marginLeft: "auto",
        flexShrink: 0 }}>
      {Array.from({ length: nombre }, (_, i) => {
        const actif = i === courant;
        return (
          <button key={i} type="button" role="tab" aria-selected={actif}
            aria-label={`Aide ${i + 1} sur ${nombre}`}
            title={`Aide ${i + 1} sur ${nombre}`}
            onClick={() => onChoisir(i)}
            style={{
              // Le point actif s'allonge au lieu de seulement s'éclaircir : la position se
              // repère alors du coin de l'œil, sans comparer des luminosités.
              width: actif ? 16 : 6, height: 6, borderRadius: 999,
              border: "none", padding: 0, cursor: "pointer",
              background: actif ? "rgba(255,255,255,0.82)" : "rgba(255,255,255,0.26)",
              transition: "width 220ms, background 220ms",
            }} />
        );
      })}
    </div>
  );
}

export default function ConstatsObjectif({
  objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs,
}: {
  objectif: Objectif | null;
  valeurPortefeuille: number | null;
  /**
   * La médiane que le panneau de projection affiche.
   *
   * ⚠️ Transmise pour que les deux panneaux citent le **même** nombre. Sans elle, les
   * constats retombent sur la capitalisation déterministe du serveur, et l'écran montre
   * 373 261 € d'un côté et 362 986 € de l'autre pour la même grandeur.
   */
  medianeProjection?: number | null;
  /**
   * Les autres objectifs du portefeuille.
   *
   * ⚠️ Nécessaires à la seule interprétation qui ne tient pas dans un objectif : un plafond
   * de versements qui saturerait avant que les objectifs qu'il finance n'aboutissent. Ce
   * fait naît de la rencontre de deux cartes, donc aucune ne peut le porter seule.
   */
  tousLesObjectifs?: Objectif[];
}) {
  const constats = objectif
    ? observations(objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs) : [];

  const [page, setPage] = useState(0);

  // ⚠️ **Le retour à la première aide au changement d'objectif est indispensable.** Un
  // objectif de capital en propose quatre, un plafond deux : rester sur la quatrième en
  // basculant vers le plafond laisserait un panneau vide. Le `Math.min` ci-dessous couvre le
  // même risque pendant le rendu, avant que l'effet ne s'exécute.
  useEffect(() => { setPage(0); }, [objectif?.id]);
  const index = Math.min(page, Math.max(0, constats.length - 1));
  const courant = constats.length > 0 ? constats[index] : null;

  return (
    // ⚠️ **Le cadre commun de la page.** Le ciel remplace le seul fond de la carte
    // intérieure ; l'anneau extérieur, son voile et les deux rayons concentriques restent
    // ceux des panneaux voisins. Seul le liseré change : un blanc translucide au lieu du gris
    // opaque, pour que le bord se lise sur un fond noir sans le trancher.
    <Cadre classeCarte="novac-verre" style={{
      flexShrink: 0,
      display: "flex", flexDirection: "column", gap: 10, minHeight: 0,
      background: `${CIEL}, ${FOND_ESPACE}`,
      // ⚠️ Pas de bordure : le liseré de verre est peint par `.novac-verre::before`, et une
      // bordure par-dessus l'aurait doublé d'un trait plat. Le rembourrage compense les
      // trois pixels que l'anneau occupe, pour que le texte ne vienne pas s'y coller.
      border: "none",
      padding: "16px 18px",
    }}>
      <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
        <svg width="19" height="19" viewBox="0 0 24 24" fill="currentColor"
          aria-hidden="true" style={{ color: "rgba(255,255,255,0.92)", flexShrink: 0,
            display: "block" }}>
          <path d={ETINCELLE} />
        </svg>
        <span style={{ fontFamily: FONT, fontSize: 15, fontWeight: 700, flexShrink: 0,
          color: "rgba(255,255,255,0.96)", letterSpacing: "-0.01em" }}>
          Aide à la décision
        </span>
        {objectif && (
          <span style={{ fontFamily: FONT, fontSize: 10.5, minWidth: 0,
            color: "rgba(255,255,255,0.62)", overflow: "hidden",
            textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {objectif.nom}
          </span>
        )}
        {constats.length > 1 && (
          <Points nombre={constats.length} courant={index} onChoisir={setPage} />
        )}
      </div>

      {courant == null ? (
        <p style={{ margin: 0, fontFamily: FONT, fontSize: 12.5, lineHeight: 1.55,
          color: "rgba(255,255,255,0.80)" }}>
          {objectif
            ? "Rien à interpréter sans échéance ni hypothèse de rendement : ce panneau ne "
              + "calcule que ce que vos paramètres permettent."
            : "Choisissez un objectif pour voir ce que vos chiffres impliquent."}
        </p>
      ) : (
        // ⚠️ Une hauteur minimale, pour que le panneau ne saute pas d'une aide à l'autre :
        // les phrases font de deux à quatre lignes selon les montants, et toute la colonne se
        // décalerait à chaque changement de page.
        // 62 et non 60 : mesuré aux quatre pages, la plus longue tient sur trois lignes de
        // 20,25 pixels, soit 60,75 — le panneau gagnait un pixel sur cette page-là.
        <p style={{ margin: 0, minHeight: 62, fontFamily: FONT, fontSize: 13.5,
          lineHeight: 1.5, fontWeight: 500, color: "rgba(255,255,255,0.94)" }}>
          {courant}
        </p>
      )}

      {/* ⚠️ **Une invitation plutôt qu'une dénégation**, et au singulier depuis qu'une seule
          aide s'affiche. La formule précédente — « ce sont des calculs, pas des
          recommandations » — disait le vrai mais en creux, et sous un titre parlant de
          décision elle sonnait comme un dégagement de responsabilité. */}
      {courant != null && (
        <span style={{ marginTop: "auto", fontFamily: FONT, fontSize: 10,
          lineHeight: 1.45, color: "rgba(255,255,255,0.52)" }}>
          Un calcul que vous pouvez refaire. Le choix reste le vôtre.
        </span>
      )}
    </Cadre>
  );
}
