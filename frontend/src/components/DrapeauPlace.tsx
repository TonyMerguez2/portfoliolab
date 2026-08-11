import DrapeauPays from "@/components/DrapeauPays";
import { paysDeLaPlace } from "@/lib/placesBoursieres";

/**
 * Le drapeau du pays d'une place de cotation, à côté de son nom.
 *
 * ⚠️ **Un composant pour quatre appels, parce que le repli est la partie fragile.**
 * Les quatre rendus — la carte d'un actif, celle de son comparatif, la carte partagée
 * et la liste des titres voisins — testaient chacun `TABLE[code] && <img …>`. Le
 * garde n'est pas une formalité : mesuré sur `CountryFlagRounded`, un code inconnu ne
 * lève pas mais ne dessine **rien**, et un code `null` lève sur `toUpperCase`. Quatre
 * copies d'un garde dont l'oubli fait soit un trou muet soit un écran blanc, c'est
 * trois occasions de se tromper ; ici il n'y en a plus qu'une, et elle est testée
 * dans `placesBoursieres.test.ts` sans avoir à rendre quoi que ce soit.
 *
 * ⚠️ **Un `<svg>` en ligne, plus une image.** Les quatre `<img src="/drapeaux/…">`
 * portaient chacun un avertissement `@next/next/no-img-element`, et ne pouvaient
 * dessiner que les dix-sept pays du dossier. Le jeu du paquet en couvre 261 — donc
 * Taïwan, la Corée, Singapour et les places nordiques, qui s'affichaient sans rien.
 *
 * ⚠️ **Le pays est celui de la place, pas celui de la société.** Nestlé porte le
 * pavillon suisse parce qu'elle cote à Zurich, ce que la pastille annonce juste à
 * côté. Pour le pays de l'émetteur — une autre donnée, un autre sens —, c'est
 * [`DrapeauPays`](./DrapeauPays.tsx) qu'il faut.
 */
export default function DrapeauPlace({ place, taille = 16 }: {
  /** Le code de la place — « PAR », « TAI » —, tel que le fournisseur le rend. */
  place: string | null | undefined;
  /**
   * Le côté du carré, en pixels. 16 dans les pastilles, 10 dans la liste voisine.
   *
   * ⚠️ **Seize et non treize, et c'est une histoire de pixels physiques.** Le drapeau
   * se place après un libellé de largeur fractionnaire, donc son bord gauche tombe
   * entre deux pixels de l'écran. Mesuré sur la carte d'ACA : bord gauche à 976,59
   * pixels physiques, bord droit à 1001,03 — la colonne de gauche est couverte à 41 %,
   * celle de droite à 3 %. Le bord droit s'évanouit au rendu quand le gauche subsiste,
   * et l'œil lit une coupe franche du côté rouge du drapeau français.
   *
   * Aucun réglage CSS ne recale une position fractionnaire héritée de la largeur d'un
   * texte. Ce qui change, c'est le **poids relatif** du pixel perdu : un vingt-quatrième
   * du dessin à 13 px, un trente-deuxième à 16. C'est la raison pour laquelle le même
   * drapeau ne pose aucun problème à 28 px dans la liste des échéances.
   */
  taille?: number;
}) {
  return (
    <DrapeauPays
      pays={paysDeLaPlace(place)}
      taille={taille}
      /*
       * ⚠️ **Rien de plus qu'un écart à gauche.** Ce composant posait auparavant
       * `display: inline-block` et `vertical-align: middle`, ce qui **écrasait** les
       * réglages de `DrapeauPays` — les mêmes que ceux de la liste des échéances, où le
       * drapeau se dessine proprement.
       *
       * Ce n'était pas anodin. En `inline-block`, la position verticale du carré est
       * calculée sur la ligne de texte, donc depuis les métriques de la police : elle
       * tombe à une fraction de pixel. Sur un écran à deux pixels physiques par pixel
       * logique, les bords arrondis ne s'alignent alors plus sur la grille, et un côté
       * perd un cheveu d'antialiasage que l'autre garde — d'où un rayon qui « ne se
       * termine pas proprement à droite » alors que rien n'est rogné.
       *
       * En `block`, la pastille étant en `inline-flex` avec `align-items: center`,
       * c'est le placement en flex qui centre le carré. Même rendu que la page des
       * événements, et pas de contour, pas d'ombre, pas de bordure : `DrapeauPays` n'en
       * pose aucun.
       */
      style={{ marginLeft: 3 }}
    />
  );
  // Le drapeau reste `aria-hidden` — c'est le défaut du composant sans `title`. La
  // pastille dit déjà « Euronext Paris » juste à côté ; l'ancien `aria-label="Pays de
  // la place boursière"` posé sur un `alt=""` faisait annoncer une étiquette qui
  // n'apprenait rien de plus que le texte qu'elle accompagne.
}
