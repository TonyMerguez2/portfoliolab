import { CountryFlagCircle, CountryFlagRounded } from "@appica/country-flags-react";

import { codePaysDrapeau } from "@/lib/drapeauPays";

/**
 * Le drapeau d'un pays, désigné par son code ou par son nom.
 *
 * ⚠️ **Le seul point de rendu d'un drapeau de pays**, et c'est ce qui le rend utile :
 * le garde est la partie fragile. Mesuré sur `CountryFlagRounded`, un code inconnu ne
 * lève pas mais ne dessine **rien** — un avertissement en console et un vide de la
 * taille demandée, qui décale la ligne — et un code `null` lève sur `toUpperCase`.
 * Recopier ce test à chaque appel, c'est autant d'occasions de l'oublier ; ici il est
 * unique et vérifié dans `drapeauPays.test.ts` sans avoir à rendre quoi que ce soit.
 *
 * Rend `null` quand le libellé n'est pas un pays — « Marchés émergents », « Monde
 * développé ». C'est voulu : voir `drapeauPays.ts`.
 */
export default function DrapeauPays({ pays, taille = 14, forme = "arrondi", style }: {
  /** Un code (« US », « ch ») ou un nom (« Switzerland », « Japon »). */
  pays: string | null | undefined;
  /** Le côté du carré, en pixels. */
  taille?: number;
  /**
   * Carré arrondi, ou disque.
   *
   * ⚠️ **Le disque n'est pas un caprice : il répond à une mesure.** Sur un petit
   * format posé sur un fond de couleur, les coins d'un carré arrondi laissent voir le
   * fond — c'est leur rôle. Mesuré sur le drapeau français dans la pastille verte de
   * la carte d'actif : les quatre coins rendent exactement le même pixel, mais le coin
   * rouge est à 214 unités du rouge pur là où le coin bleu n'est qu'à 171 du bleu pur.
   * Le rouge et le vert étant complémentaires, ce mélange se lit comme une morsure
   * dans la bande rouge, alors que bleu sur vert passe pour un arrondi — d'où
   * l'impression, tenace et légitime, d'un drapeau rogné à droite et intact à gauche.
   *
   * Un disque n'a pas de coin à faire paraître mordu. Sur un fond sombre et peu saturé
   * — la liste des échéances, la vue des expositions — le carré arrondi ne pose aucun
   * problème et reste la forme par défaut.
   */
  forme?: "arrondi" | "cercle";
  /** De quoi composer la marge au cas par cas : les appelants n'ont pas le même écart. */
  style?: React.CSSProperties;
}) {
  const code = codePaysDrapeau(pays);
  if (!code) return null;
  const Drapeau = forme === "cercle" ? CountryFlagCircle : CountryFlagRounded;
  return (
    <Drapeau
      code={code}
      size={taille}
      style={{
        // ⚠️ Aucune bordure ni ombre, et rien n'en pose sur un `<svg>` en ligne : le
        // liseré déjà signalé dans les coins venait des anciennes balises `<img>`.
        // `max-width` non plus n'a à être neutralisé — la règle globale de Tailwind ne
        // vise que `img` et `video`, ce qui écrasait autrefois l'image à zéro de large
        // dans un conteneur en flex.
        flexShrink: 0,
        display: "block",
        /*
         * ⚠️ **`overflow: visible`, et c'est LE correctif.** Tout `<svg>` rogne son
         * contenu à son viewport — c'est la valeur par défaut de l'agent utilisateur,
         * pas une décision de ce projet. Or ce viewport ne tombe pas sur la grille des
         * pixels : mesuré ici, 12,9987 px de large pour une taille demandée de 13. Le
         * dessin, lui, occupe le viewBox de bord à bord. Le bord gauche part de zéro,
         * donc aligné ; le bord droit tombe à 12,9987 et perd la dernière fraction de
         * pixel — le tracé s'y trouve tranché net.
         *
         * D'où un symptôme qui a résisté à trois séries de mesures : la bande droite
         * paraît coupée alors que le dessin est symétrique au millième, que rien dans
         * la chaîne des ancêtres ne rogne, et que les quatre coins rendent le même
         * pixel. Je cherchais un rogneur dans la page ; il était dans le `<svg>`.
         *
         * Visible, la fraction de tracé qui dépasse est peinte au lieu d'être coupée.
         * Rien ne déborde pour autant : le dessin ne sort du viewBox que d'un
         * antialiasage.
         */
        overflow: "visible",
        ...style,
      }}
    />
  );
}
