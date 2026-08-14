"use client";

import CarteConstats from "@/components/portfolio/CarteConstats";
import { aideALaDecision, type Contexte, type Insight } from "@/lib/aideDecision";
import { type Objectif } from "@/lib/objectifs";
import { type FormeAvatar } from "@/lib/useCouleurAvatar";

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
 * ⚠️ **La mise en page a quitté ce fichier**, pour `CarteConstats`. Le portefeuille a
 * demandé exactement la même carte : la recopier aurait dupliqué trois cent soixante-dix
 * lignes, dont des compensations d'encre mesurées au canevas, et les deux se seraient
 * séparées au premier ajustement. Ne reste ici que ce qui parle d'un objectif — le contexte
 * du calcul, et le texte à dire quand il n'y a rien à dire.
 */
export default function ConstatsObjectif({
  objectif, valeurPortefeuille, medianeProjection, tousLesObjectifs,
  sommeDesParts, volatilite, volatiliteSource, seancesMesurees,
  couleurAvatar, formeAvatar, skinAvatar,
}: {
  objectif: Objectif | null;
  couleurAvatar?: string;
  formeAvatar?: FormeAvatar;
  skinAvatar?: string;
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
   * de versements qui saturerait avant que les objectifs qu'il finance n'aboutissent.
   */
  tousLesObjectifs?: Objectif[];
  sommeDesParts?: number | null;
  volatilite?: number | null;
  volatiliteSource?: string | null;
  seancesMesurees?: number | null;
}) {
  const contexte: Contexte = {
    valeurPortefeuille, sommeDesParts, autres: tousLesObjectifs,
    volatilite, volatiliteSource, seancesMesurees, mediane: medianeProjection,
  };
  const aides: Insight[] = aideALaDecision(objectif, contexte);

  return (
    <CarteConstats
      titre="Aide à la décision"
      etiquette={objectif?.nom}
      aides={aides}
      /* ⚠️ Un objectif de capital propose quatre aides, un plafond deux : rester sur la
         quatrième en changeant d'objectif laisserait la carte vide. */
      cleReinit={objectif?.id ?? null}
      texteVide={objectif
        ? "Rien à interpréter sans échéance ni hypothèse de rendement : ce panneau ne "
          + "calcule que ce que vos paramètres permettent."
        : "Choisissez un objectif pour voir ce que vos chiffres impliquent."}
      couleurAvatar={couleurAvatar}
      formeAvatar={formeAvatar}
      skinAvatar={skinAvatar}
    />
  );
}
