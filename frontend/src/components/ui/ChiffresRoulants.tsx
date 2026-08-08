"use client";
import { useEffect, useRef, useState } from "react";
import { crans } from "@/lib/roulement";

/**
 * Un nombre dont les chiffres défilent quand ils changent.
 *
 * Chaque rang porte une bande verticale de chiffres qu'on fait glisser jusqu'au
 * bon, avec un flou qui culmine en cours de route. Le flou n'est pas décoratif :
 * il donne au déplacement l'aspect d'un mouvement plutôt que d'un saut, et c'est
 * lui qui rend le défilement lisible malgré sa brièveté.
 *
 * Seuls les chiffres roulent. Les espaces, la virgule et le symbole monétaire
 * restent fixes — les faire défiler ferait bouger toute la ligne à chaque
 * centime, pour rien.
 */

/** Assez court pour ne pas retarder la lecture, assez long pour se voir. */
const DUREE_MS = 420;

/**
 * La bande compte deux séries de chiffres, et non une.
 *
 * Un compteur ne revient pas en arrière : passer de 9 à 0 doit avancer d'un
 * cran, pas reculer de neuf. On avance donc toujours, ce qui peut mener au-delà
 * du dixième chiffre — d'où la seconde série. La position est ramenée dans la
 * première une fois le mouvement fini, sans transition, ce qui ne se voit pas
 * puisque les deux séries montrent le même chiffre au même endroit.
 */
const BANDE = Array.from({ length: 20 }, (_, i) => i % 10);


function Rang({ chiffre }: { chiffre: number }) {
  const [position, setPosition] = useState(chiffre);
  const [roule, setRoule] = useState(false);
  const precedent = useRef(chiffre);
  /** Le minuteur du roulement en cours, ou `null` s'il n'y en a pas. */
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const avant = precedent.current;
    if (avant === chiffre) return;
    precedent.current = chiffre;

    // ⚠️ Un changement pendant qu'un roulement court : on se pose sur le
    // chiffre, sans transition, plutôt que d'empiler.
    //
    // La version précédente ajoutait `crans` à la position et ne la ramenait
    // modulo 10 qu'à la fin du roulement — dont le minuteur était annulé par le
    // changement suivant. Sur des valeurs qui défilent vite, la position
    // s'empilait donc sans borne : 5, 12, 19, 26… quand la bande ne compte que
    // vingt rangs. Passé le dix-neuvième, le rang défilait dans le vide. Et
    // chaque changement poussait deux états par chiffre, soit une vingtaine par
    // nombre affiché — de quoi épuiser la profondeur de mise à jour de React.
    //
    // À cette cadence le roulement ne se verrait pas de toute façon : 420 ms de
    // trajet pour une valeur qui change toutes les cinquante.
    if (minuterie.current !== null) {
      setRoule(false);
      setPosition(chiffre);
      return;
    }

    setRoule(true);
    // Le `% 10` borne la position : la première série au plus, plus une avance
    // de neuf crans au plus, donc jamais au-delà du dix-huitième rang.
    setPosition(p => (p % 10) + crans(avant, chiffre));

    minuterie.current = setTimeout(() => {
      minuterie.current = null;
      setRoule(false);
      // Retour dans la première série, transition coupée le temps du saut.
      setPosition(p => p % 10);
    }, DUREE_MS);
  }, [chiffre]);

  // Le minuteur ne s'annule qu'au démontage. L'annuler à chaque changement de
  // chiffre — ce que faisait le nettoyage de l'effet — laissait le roulement en
  // cours sans personne pour le clore, et c'est de là que venait l'empilement.
  useEffect(() => () => {
    if (minuterie.current !== null) clearTimeout(minuterie.current);
  }, []);

  return (
    <span aria-hidden="true" style={{
      display: "inline-block", overflow: "hidden", height: "1em",
      verticalAlign: "bottom", lineHeight: 1,
      // Le flou est posé sur le rang et non sur la bande : appliqué à un
      // élément qui défile, il suivrait le déplacement au lieu de le rendre.
      animation: roule ? `nv-roule-flou ${DUREE_MS}ms ease` : undefined,
    }}>
      <span style={{
        display: "block",
        transform: `translateY(-${position}em)`,
        transition: roule ? `transform ${DUREE_MS}ms cubic-bezier(0.22, 1, 0.36, 1)` : "none",
      }}>
        {BANDE.map((d, i) => (
          <span key={i} style={{ display: "block", height: "1em", lineHeight: 1 }}>{d}</span>
        ))}
      </span>
    </span>
  );
}

export default function ChiffresRoulants({ texte }: { texte: string }) {
  return (
    // Le nombre est porté par le libellé, et les bandes sont masquées aux
    // technologies d'assistance. Sans cela, chaque rang expose ses vingt
    // chiffres : un lecteur d'écran annonçait « zéro un deux trois… » vingt
    // fois de suite, et un copier-coller ramenait la même bouillie.
    <span role="text" aria-label={texte}
      style={{ display: "inline-flex", alignItems: "baseline", fontVariantNumeric: "tabular-nums" }}>
      {texte.split("").map((c, i) =>
        /\d/.test(c)
          // La clé est le rang, non le caractère : c'est ce qui fait qu'un
          // chiffre remplacé anime la bande existante au lieu d'en monter une
          // neuve, laquelle apparaîtrait déjà à la bonne valeur.
          ? <Rang key={i} chiffre={Number(c)} />
          // Espace fine insécable : sans `pre`, le navigateur la mange.
          : <span key={i} aria-hidden="true" style={{ whiteSpace: "pre" }}>{c}</span>,
      )}
    </span>
  );
}
