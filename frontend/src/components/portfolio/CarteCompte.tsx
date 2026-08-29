import { useId } from "react";

import { decalerClarte } from "@/lib/couleur";
import { marqueAvatar } from "@/lib/avatarEtats";
import { CARTE_ACTIF } from "@/components/portfolio/CarteActif";

/**
 * Un compte, dessiné comme un dossier, avec un aperçu de ce qu'il contient.
 *
 * ⚠️ **Une seule découpe, et non une languette posée sur un rectangle.** C'est là que
 * se joue toute la ressemblance au concept : entre la languette et le plan du dossier,
 * le contour ne fait pas un angle droit mais une **double courbure** — un quart de tour
 * convexe puis un quart de tour concave. Deux éléments empilés donnaient un décrochement
 * net, qui se lit comme une barre collée au-dessus d'une carte. Le contour est donc un
 * `clip-path` d'un seul tenant, dans lequel le dégradé passe sans raccord.
 *
 * ⚠️ **La conséquence : les dimensions sont en pixels, pas en pourcentages.** Un
 * `path()` ne s'exprime qu'en unités absolues. La carte a donc une taille fixe — ce
 * qui tombe bien, puisqu'elle doit de toute façon être taillée pour contenir des cartes
 * d'actifs à leur vraie taille. Une grille en `1fr` étirerait la découpe hors de sa
 * boîte : les dossiers se posent en colonnes de `CARTE_COMPTE.largeur`.
 *
 * ⚠️ **L'ombre est un `drop-shadow`, pas un `box-shadow`.** Un `box-shadow` suit la
 * boîte, que le `clip-path` vient justement de tailler : l'ombre débordait dans
 * l'encoche. Le filtre, lui, suit la silhouette réelle.
 */

/**
 * Le rayon des angles : celui d'une carte d'actif, jamais un autre.
 *
 * ⚠️ **Repris et non recopié.** Les dossiers et les cartes se côtoient dans la même rangée,
 * et un dossier plus rond que ce qu'il range se voit immédiatement sans qu'on sache le
 * nommer. J'ai successivement posé vingt-deux puis vingt-six au jugé, en mesurant sur la
 * maquette — le bon nombre était sous la main depuis le début, et il ne peut plus dériver.
 */
const RAYON = CARTE_ACTIF.rayon;
/**
 * La languette : sa largeur, sa hauteur, et le rayon commun à ses deux courbes.
 *
 * ⚠️ **Les trois coins de l'encoche ont le rayon des angles du dossier.** Le coin haut-gauche
 * de la languette *est* un angle du dossier ; le coin haut-droit et le creux qui le suit
 * doivent l'être aussi, faute de quoi trois courbures se succèdent sur quinze centimètres et
 * l'œil voit un raccord bricolé sans savoir le nommer.
 *
 * ⚠️ **Le rayon n'impose pourtant pas la hauteur, et c'est ce que j'avais manqué.** Deux
 * *quarts* de cercle tangents descendent chacun de leur rayon, d'où une languette de deux
 * rayons — trente-six, jugée trop haute à l'usage. Mais rien n'oblige les arcs à être des
 * quarts : deux arcs **plus courts**, de même rayon, restent tangents entre eux et
 * horizontaux à leurs extrémités. La courbure ne change pas — c'est elle qu'on reconnaît —
 * seule la portion parcourue diminue.
 *
 * ⚠️ **C'est alors l'étalement qui se déduit, et il se calcule.** Les deux centres sont
 * distants de deux rayons, l'un à `rayon` sous le bord haut, l'autre à `rayon` au-dessus du
 * plan : Pythagore donne la course horizontale. Écrite à la main, elle aurait cessé d'être
 * juste au premier changement de hauteur, et la tangence se serait perdue sans prévenir —
 * exactement ce qui a produit, tour après tour, une marche, un toboggan, une rampe et un coin
 * pincé.
 */
const LANGUETTE = {
  largeur: 118,
  /** Réglable librement : les arcs s'accourcissent au lieu de changer de rayon. */
  hauteur: 26,
  /** Le rayon des trois courbes — celui des angles du dossier, donc celui des cartes. */
  rayon: RAYON,
  /** La course horizontale du raccord, imposée par les deux précédents. */
  get course() {
    const r = this.rayon;
    return Math.sqrt(4 * r * r - (this.hauteur - 2 * r) ** 2);
  },
};

/**
 * La taille du dossier, déduite de la carte d'actif qu'il doit contenir.
 *
 * ⚠️ **La bande dégagée n'est pas la hauteur d'aperçu.** La languette recouvre celle-ci
 * sur sa moitié gauche, c'est-à-dire précisément là où se trouvent le logo et le nom de
 * la carte : ce qui échappe vraiment au dossier vaut `apercu − languette.hauteur`. Réglé
 * à 54, il n'en dépassait que le pourcentage de poids, tout à droite — un aperçu qui
 * n'apprenait rien.
 *
 * ⚠️ **Et la hauteur totale n'est pas libre** : elle doit valoir celle d'une carte
 * d'actif, sans quoi la courbe au-dessus change de taille selon qu'on regarde les
 * dossiers ou leur contenu.
 */
/**
 * Le paquet de cartes dans le dossier : son retrait, le décalage entre deux cartes.
 *
 * ⚠️ **Le retrait vaut la même chose des deux côtés, et il ne le valait pas.** Mesuré sur les
 * trois dossiers de l'écran : seize pixels avant la première carte, douze après la dernière.
 * Ces deux marges se voient toutes les deux — la bande qui dépasse du plan laisse voir le
 * fond de la page de part et d'autre du paquet —, si bien que l'asymétrie était visible sans
 * être justifiée. Elle venait d'un total posé d'un bloc, cinquante-six, dont personne n'avait
 * redécoupé les termes.
 *
 * ⚠️ **Dix de chaque côté, réglé à l'œil et non déduit.** L'équilibrage s'était d'abord fait
 * à quatorze — la moitié des vingt-huit pixels que l'ancienne répartition dépensait —, ce qui
 * gardait les largeurs inchangées mais laissait le paquet trop au large. À dix, le dossier
 * serre ses cartes et perd huit pixels : 268, 282 et 296 pour une, deux ou trois cartes. La
 * largeur se recalcule d'elle-même, il n'y a rien d'autre à reprendre.
 */
const PAQUET = { retrait: 10, decalage: 14 };

/** Le nombre de cartes qu'un dossier laisse voir au plus. */
export const APERCUS_MAX = 3;

export const CARTE_COMPTE = {
  /**
   * La largeur d'un dossier qui laisse voir `n` cartes.
   *
   * ⚠️ **Elle s'ajuste au contenu, parce qu'un dossier de trésorerie n'en range qu'une.**
   * Fixée sur trois cartes, elle laissait quarante pixels de vide en haut à droite d'un
   * compte courant — mesuré — et l'on y voyait le fond de la page à travers la bande qui
   * dépasse du plan. La largeur suit donc le paquet : le retrait, les décalages, la carte,
   * et la marge de droite.
   *
   * ⚠️ **Bornée à une carte au minimum.** Un compte déclaré sans ligne n'en laisse voir
   * aucune ; sans plancher, le dossier se serait rétréci en dessous de ce que son propre
   * texte réclame.
   */
  largeurPour(cartes: number): number {
    const n = Math.min(APERCUS_MAX, Math.max(1, cartes));
    return 2 * PAQUET.retrait + (n - 1) * PAQUET.decalage + CARTE_ACTIF.largeur;
  },
  /**
   * La largeur maximale, celle d'un dossier plein.
   *
   * ⚠️ **C'est elle qui règle le pas du rail, et non la largeur d'un dossier donné.** Un pas
   * qui suivrait chaque dossier ferait atterrir le défilement au milieu du suivant dès que
   * deux dossiers n'ont pas le même contenu.
   */
  get largeur() { return this.largeurPour(APERCUS_MAX); },
  /**
   * Ce qu'on laisse voir des cartes rangées dedans, au-dessus du plan.
   *
   * ⚠️ Ni plus ni moins que la languette plus les 46 pixels de la ligne d'identité :
   * c'est le minimum pour que le logo et le nom échappent à la languette, et tout
   * excédent se prend sur la courbe, au-dessus.
   */
  apercu: LANGUETTE.hauteur + CARTE_ACTIF.identite,
  /**
   * Le plan de devant, celui qui porte le nom.
   *
   * ⚠️ **Ce n'est pas un réglage libre : c'est le complément.** Le dossier doit faire
   * exactement la hauteur d'une carte d'actif, faute de quoi la courbe au-dessus change
   * de taille selon qu'on regarde les dossiers ou leur contenu — un écran qui se réajuste
   * à chaque va-et-vient. Le plan prend donc ce que l'aperçu laisse. Mesuré, son contenu
   * en demande 123 ; en dessous, le nom viendrait toucher le pictogramme.
   */
  panneau: CARTE_ACTIF.hauteur - (LANGUETTE.hauteur + CARTE_ACTIF.identite),
  /**
   * La languette, publiée parce que ce qu'on range dedans doit savoir ce qu'elle cache.
   *
   * ⚠️ **La bande dégagée n'est pas rectangulaire, et c'est ce qui a piégé la carte
   * bancaire.** Une carte posée au-dessus du plan est visible sur toute sa largeur jusqu'à
   * `apercu − languette.hauteur`, soit 46 pixels — puis, de 46 à 68, uniquement à droite de
   * la languette. Dessinée comme un rectangle de 68 de haut, elle perdait son numéro sous
   * le coin gauche du plan. Publier la découpe évite de la redécouvrir à l'œil.
   */
  languette: LANGUETTE,
  /**
   * La hauteur d'un dossier — celle d'une carte d'actif, par construction.
   *
   * ⚠️ **Publiée parce que la page doit pouvoir réserver la place d'un dossier sans en
   * rendre un.** Le temps que le journal des opérations arrive, la rangée n'a rien de vrai
   * à montrer ; laisser le vide ferait gagner 196 pixels à la courbe pour les lui reprendre
   * aussitôt. Recopier le nombre là-bas l'aurait figé le jour où celui-ci change.
   */
  get hauteur() { return this.apercu + this.panneau; },
};
const HAUTEUR = CARTE_COMPTE.apercu + CARTE_COMPTE.panneau;

/**
 * L'air que le plan garde entre son contenu et ses bords.
 *
 * ⚠️ **Les valeurs viennent de la maquette, où le plan respire davantage.** Mesuré au même
 * facteur 2,3 : le pictogramme s'y tient à vingt-et-un pixels du bord et la dernière ligne
 * à vingt-quatre du bas, contre seize et douze auparavant. Le texte y gagne l'air qui le
 * distinguait d'un bloc collé au coin.
 *
 * ⚠️ **Nommé parce que les trois points s'en servent aussi.** Eux sont posés en absolu,
 * hors du flux du plan : ils doivent refaire le calcul du rembourrage à la main. Deux
 * nombres réglés séparément auraient dérivé, et le pictogramme n'aurait plus été à la même
 * hauteur que les points d'en face.
 */
const AIR_PANNEAU = { haut: 10, cote: 18, bas: 18 };

/**
 * Le contour du dossier, languette comprise.
 *
 * Décrit une fois pour toutes puisque la taille est fixe. Le sens de parcours est horaire.
 *
 * ⚠️ **Le raccord de la languette est une Bézier, plus deux arcs.** Deux quarts de cercle
 * accolés donnent bien un S, mais un S dont l'étalement vaut forcément le rayon : la pente
 * était donc à quarante-cinq degrés, sans moyen de l'adoucir sans changer aussi la hauteur de
 * la languette. La cubique part verticale — elle prolonge l'arc du coin sans cassure — et
 * arrive horizontale sur le plan, avec la longueur qu'on lui donne.
 */
const contourDe = (l: number) => {
  const h = CARTE_COMPTE.panneau + LANGUETTE.hauteur;
  const { hauteur: hl, largeur: ll, rayon: r, course } = LANGUETTE;
  return [
    `M ${RAYON},0`,
    `L ${ll},0`,
    // Le bombé, jusqu'au point où les deux arcs se touchent : à mi-course, à mi-hauteur.
    `A ${r},${r} 0 0 1 ${ll + course / 2},${hl / 2}`,
    // Le creux, de même rayon, qui reprend exactement la tangente laissée par le bombé.
    `A ${r},${r} 0 0 0 ${ll + course},${hl}`,
    `L ${l - RAYON},${hl}`,
    `A ${RAYON},${RAYON} 0 0 1 ${l},${hl + RAYON}`,
    `L ${l},${h - RAYON}`,
    `A ${RAYON},${RAYON} 0 0 1 ${l - RAYON},${h}`,
    `L ${RAYON},${h}`,
    `A ${RAYON},${RAYON} 0 0 1 0,${h - RAYON}`,
    `L 0,${RAYON}`,
    `A ${RAYON},${RAYON} 0 0 1 ${RAYON},0`,
    "Z",
  ].join(" ");
};

/**
 * Les contours, calculés une fois par largeur possible.
 *
 * ⚠️ **Trois seulement, donc on les garde plutôt que de les recalculer à chaque rendu.** Le
 * tracé se refait à chaque image sinon, et il change de chaîne à chaque fois — ce qui suffit
 * à faire recalculer la découpe au navigateur pour rien.
 */
const CONTOURS = new Map<number, string>();
const contourPour = (l: number) => {
  const connu = CONTOURS.get(l);
  if (connu) return connu;
  const trace = contourDe(l);
  CONTOURS.set(l, trace);
  return trace;
};

/**
 * Le dossier réduit à sa silhouette, pour qui doit le redessiner ailleurs.
 *
 * ⚠️ **Le tracé et sa boîte, jamais des pixels.** Le contour est écrit dans les unités du
 * vrai dossier — une languette de 118, un plan de `panneau` de haut — et ne se rétrécit donc
 * pas en changeant ses nombres : c'est le `viewBox` de l'appelant qui le met à l'échelle,
 * exactement comme on réduit un dessin sans le redessiner. On rend ce qu'il faut pour poser
 * ce `viewBox`, et rien d'autre.
 *
 * ⚠️ **Publiée le jour où le panneau de création a voulu illustrer l'étape du compte.** Il en
 * avait d'abord fait une version simplifiée — même idée, mesures approchées. Demandé à
 * l'usage que ce soit **exactement** le dossier du tableau de bord : une silhouette
 * ressemblante n'est pas la même silhouette, et deux dossiers qui diffèrent d'un rayon se
 * voient tout de suite sans qu'on sache le nommer.
 *
 * ⚠️ **Le nombre de cartes en aperçu change la largeur, donc les proportions.** Un dossier de
 * trésorerie n'en range qu'une et se lit plus étroit qu'un dossier plein — voir
 * `largeurPour`. L'illustration prend le même argument que la vraie carte pour que les deux
 * puissent parler du même objet.
 */
export function silhouetteDossier(cartes = APERCUS_MAX): {
  d: string; largeur: number; hauteur: number;
} {
  const largeur = CARTE_COMPTE.largeurPour(cartes);
  return {
    d: contourPour(largeur),
    largeur,
    hauteur: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
  };
}

export default function CarteCompte({
  nom, compte, couleur, icone, apercu, annonce, onClick, onModifier, variation,
}: {
  nom: string;
  /**
   * Ce que la carte annonce sous le nom — « 4 actifs », ou le montant d'un compte de
   * trésorerie.
   *
   * ⚠️ **Un nœud et non une chaîne, parce que les deux ne pèsent pas pareil.** « 3 actifs »
   * est une mention ; sur un livret, le montant *est* l'information de la carte, et il doit
   * s'afficher en conséquence. Contraint au texte, il aurait fallu un second champ, donc
   * deux mises en page à tenir à jour pour une seule ligne.
   */
  compte: React.ReactNode;
  couleur: string;
  icone: React.ReactNode;
  /**
   * Les cartes rangées dans le dossier, la première devant.
   *
   * ⚠️ **De vraies cartes d'actifs, à leur taille.** Des vignettes réduites auraient
   * demandé une seconde mise en page à tenir à jour, et n'auraient plus rien annoncé
   * de fidèle. Le dossier n'en laisse voir que le haut — le logo et le nom — ce qui
   * suffit à savoir ce qu'il contient sans l'ouvrir.
   */
  apercu?: React.ReactNode[];
  /**
   * Ce que le lecteur d'écran annonce, en toutes lettres.
   *
   * ⚠️ **Parce que `compte` est un nœud et qu'un nœud ne se concatène pas.** L'étiquette
   * était bâtie avec ` Ouvrir ${nom}, ${compte} ` : depuis que le panneau porte un montant
   * et une mention plutôt qu'une chaîne, elle annonçait littéralement « Ouvrir PEA,
   * [object Object] ». Le défaut ne se voyait pas à l'écran — c'est justement pour cela
   * qu'il a duré.
   */
  annonce?: string;
  onClick?: () => void;
  /**
   * Ouvre la correction du compte, depuis les trois points en haut à droite.
   *
   * ⚠️ **Absent quand il n'y a rien à corriger, et c'est ce qui décide de l'affichage.** Un
   * dossier déduit — PEA, compte-titres, crypto — n'a pas été déclaré : il n'existe que
   * parce que des lignes s'y rangent, et rien en lui ne se modifie. Lui poser les trois
   * points quand même ouvrirait sur un formulaire vide ou sur rien.
   *
   * ⚠️ **Il double le clic de la carte, à dessein.** Sur un compte de trésorerie, cliquer le
   * dossier ouvre déjà sa correction — mais rien ne l'annonce : une carte qui ouvre un
   * formulaire est une promesse qu'elle ne fait pas. Les trois points la disent.
   */
  onModifier?: () => void;
  /**
   * Ce que le dossier a fait sur la période, en pourcentage — pour le visage du bandeau.
   *
   * ⚠️ **Une variation et non une clé d'état.** La carte n'a pas à connaître le répertoire
   * d'expressions : elle donne son chiffre, `marqueAvatar` le traduit, et le jour où les
   * seuils bougent aucun composant n'est à rouvrir. C'est la même séparation que partout
   * ailleurs — la géométrie ne connaît pas l'application, l'application ne connaît pas la
   * géométrie.
   *
   * ⚠️ **`null` est le cas normal, pas un oubli.** Un compte courant ou un livret ne varie
   * pas avec les marchés ; il retombe alors sur « curieux » sans publier de chiffre.
   */
  variation?: number | null;
}) {
  /** Un identifiant par instance : deux dossiers voisins partageraient sinon le dégradé. */
  const idBord = useId().replace(/:/g, "");
  /** La largeur suit ce que le dossier laisse voir, jamais moins d'une carte. */
  const largeur = CARTE_COMPTE.largeurPour((apercu ?? []).length);
  const CONTOUR = contourPour(largeur);
  /**
   * La teinte du liseré : celle du dossier, à peine relevée.
   *
   * ⚠️ **Le peu de clarté est volontaire, l'intensité se règle à l'opacité.** Éclaircie de
   * trente-deux pour cent, elle virait au blanc sur les teintes vives — un détourage plutôt
   * qu'une arête. Deux réglages pour un seul effet finissent toujours par se contredire :
   * la teinte reste de la famille du dossier, et c'est le dégradé qui décide où elle se voit.
   */
  const ARETE = decalerClarte(couleur, 0.14);
  /**
   * La teinte du liseré **du côté éclairé**, plus haute que celle du côté sombre.
   *
   * ⚠️ **Un liseré ne se voit que s'il est plus clair que ce qu'il borde.** Le panneau
   * tourne du clair au sombre en diagonale : il vaut `tresClair`, soit +0,19, dans le coin
   * haut-gauche. Le liseré à +0,14 y était donc *plus sombre que son fond* — l'arête
   * existait, elle était simplement invisible, et seul le bas-droit paraissait ourlé.
   * Signalé à l'usage.
   *
   * ⚠️ **+0,26 et pas davantage.** Le commentaire ci-dessus retient la leçon d'un essai à
   * +0,32, qui virait au blanc sur les teintes vives et détourait la carte au lieu de
   * l'ourler. Il faut passer au-dessus de 0,19 pour se détacher, et rester en deçà de 0,32
   * pour rester de la famille du dossier.
   */
  const ARETE_CLAIRE = decalerClarte(couleur, 0.26);
  const tresClair = decalerClarte(couleur, 0.19);
  const clair = decalerClarte(couleur, 0.10);
  const sombre = decalerClarte(couleur, -0.16);
  const cartes = apercu ?? [];
  /**
   * Le dossier a-t-il un intérieur à montrer ?
   *
   * ⚠️ **L'absence de `onClick` en décide, plutôt qu'un drapeau de plus.** Un dossier de
   * trésorerie n'a rien derrière son plan : ni ligne, ni cours, ni écran « intérieur d'un
   * livret » qui aurait quelque chose à dire. C'est l'appelant qui le sait — lui seul
   * connaît le genre du compte —, et ne rien lui passer est déjà la façon de le dire.
   *
   * ⚠️ **Trois choses en découlent ensemble, et c'est pour cela qu'une seule condition les
   * commande.** Le chevron promet un intérieur : il disparaît. Le plan cesse d'être un
   * bouton : un bouton sans action est un piège au clavier. Et les cartes ne se soulèvent
   * plus au survol, ce soulèvement étant l'annonce d'une ouverture. Réglées séparément, les
   * trois auraient fini par se contredire. Demandé à l'usage : « rends interactif juste les
   * trois petits points ».
   *
   * ⚠️ **Ce qui reste actionnable, ce sont les trois points** — et ils suffisent, puisque
   * cliquer un dossier de trésorerie ouvrait de toute façon sa correction. On ne perd donc
   * aucun geste : on retire une promesse que la carte ne tenait pas.
   */
  const ouvrable = onClick != null;
  /* ⚠️ Une balise variable, écrite ainsi parce que TypeScript refuserait `type="button"`
     sur un `div` : la valeur est calculée, le type reste celui du cas complet, et les
     attributs propres au bouton sont ajoutés conditionnellement juste en dessous. */
  const Plan = (ouvrable ? "button" : "div") as "button";

  return (
    /**
     * ⚠️ **Une enveloppe autour du dossier, parce qu'un bouton n'en contient pas un autre.**
     * Le dossier *est* un bouton — c'est ce qui lui donne le clavier et le rôle sans rien
     * réécrire — et les trois points en sont un second. Imbriqués, le balisage est invalide
     * et le navigateur défait l'imbrication à sa façon : le clic intérieur remonte au
     * dossier, qui s'ouvre. Ils sont donc frères, superposés par l'enveloppe.
     *
     * ⚠️ **C'est elle qui porte le survol, désormais.** La classe `novac-dossier-carte`
     * remplace `novac-dossier` dans le sélecteur qui soulève les cartes : sur le bouton, le
     * simple fait de glisser la souris vers les trois points sortait du survol et laissait
     * les cartes retomber au moment précis où l'on visait.
     */
    <div
      /* ⚠️ **Le soulèvement des cartes vaut pour tous les dossiers, y compris ceux qui ne
         s'ouvrent pas.** Je l'avais retiré des dossiers de trésorerie en le prenant pour
         l'annonce d'une ouverture ; il ne l'est pas. C'est la matière qui répond au regard —
         un paquet de cartes qu'on effleure —, et une carte bancaire mérite ce mouvement
         autant qu'une carte d'actif. Redemandé à l'usage. */
      className="novac-dossier-carte"
      /**
       * ⚠️ **`display: flex`, et ce n'est pas indifférent — sept pixels en dépendent.** Un
       * `<button>` est de niveau ligne : posé dans un bloc, il s'assoit sur la ligne de base
       * et laisse sous lui la place des jambages. Mesuré : l'enveloppe faisait 203 pixels
       * pour un dossier de 196, et la rangée entière avec elle — or sa hauteur doit valoir
       * exactement celle d'une carte d'actif, faute de quoi la courbe change de taille selon
       * qu'on regarde les dossiers ou leur contenu.
       */
      style={{ position: "relative", width: largeur, flexShrink: 0, display: "flex" }}>
    <Plan
      {...(ouvrable
        ? { type: "button" as const, onClick, "aria-label": `Ouvrir ${annonce ?? nom}` }
        : {})}
      className="novac-dossier"
      /* ⚠️ **Le personnage se penche sur ce qu'on survole, et ne dit rien.** Un survol
         change au rythme du curseur : c'est le bon registre pour une mimique, qu'on
         remarque à peine, et le mauvais pour un mot, qui clignoterait. Mesuré une fois
         déjà, sur « Je regarde ». L'attribut suffit — aucun abonnement, un seul écouteur
         sur le document. Voir `AvatarContext`. */
      /**
       * ⚠️ **Il dit maintenant *ce que le dossier fait*, là où il disait « curieux » pour
       * tout le monde.** Relevé sur la vue générale : huit éléments expressifs, huit fois
       * la même clé — le visage ne pouvait rien exprimer d'autre au survol, et la colère y
       * était injoignable faute de chiffre publié. Les dossiers sont ce qu'on y survole le
       * plus ; ce sont donc eux qui parlent.
       *
       * ⚠️ **Un dossier sans cours retombe exactement sur l'ancien comportement.** Un compte
       * courant, un livret : `variation` y vaut `null`, et `marqueAvatar` rend alors
       * « curieux » sans publier de chiffre. Le cas par défaut est donc inchangé, ce qui
       * évite de faire dire à une enveloppe d'épargne qu'elle s'effondre.
       */
      {...marqueAvatar(variation)}
      // ⚠️ Pas d'`aria-expanded` : le dossier ne se déplie pas sous lui-même, il
      // remplace la vue. Annoncer un dépliement ferait attendre un contenu juste en
      // dessous, alors que c'est toute la zone qui change.
      style={{
        position: "relative", width: largeur, height: HAUTEUR,
        padding: 0, border: 0, background: "none",
        cursor: ouvrable ? "pointer" : "default",
        textAlign: "left", flexShrink: 0,
      }}
    >
      {/**
        * L'ombre du dossier, dessinée **avant** les cartes.
        *
        * ⚠️ Portée par le plan lui-même, elle se peignait par-dessus l'aperçu : un halo
        * de la couleur du compte, étalé sur les cartes, qui les faisait paraître
        * translucides. L'ordre de peinture suit l'ordre du document, et un filtre
        * s'applique après le contenu de son élément — il fallait donc séparer les deux.
        * Ce double, de forme identique, est entièrement recouvert par le vrai plan.
        */}
      <div aria-hidden="true" style={{
        position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
        width: largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
        clipPath: `path("${CONTOUR}")`, background: couleur,
        /**
         * ⚠️ **Le halo est de la couleur du dossier, et c'est lui qui le décolle du fond.**
         * Sur la maquette, chaque dossier pose une lueur de sa propre teinte sous lui : sans
         * elle, il reste un aplat collé à la page. Trois ombres empilées plutôt qu'une —
         * une lueur large et diffuse qui porte la couleur, une ombre courte qui donne
         * l'épaisseur, un contact serré qui pose l'objet. Une seule ombre ne peut pas faire
         * les trois : large elle flotte, courte elle ne rayonne pas.
         *
         * ⚠️ **`drop-shadow` et non `box-shadow`.** Le second suit la boîte, que le
         * `clip-path` vient justement de tailler : l'ombre débordait dans l'encoche. Le
         * filtre, lui, suit la silhouette réelle.
         *
         * ⚠️ **La portée de l'ombre est bornée par la marge de la page, et non l'inverse.**
         * Elle valait 16 de décalage et 34 de flou, soit cinquante pixels sous la
         * silhouette. Or un rail tranche à l'horizontale, et la colonne qui le contient
         * aussi : lui ménager cinquante pixels revenait à les prendre à la courbe, seule à
         * porter un `flex: 1` — la courbe a visiblement rétréci, et c'était le bon reproche.
         * L'ombre tient donc désormais dans `MARGE`, la marge que la page applique déjà sur
         * ses côtés. Ce qui dépasse encore — deux pixels — y est à moins de deux pour cent
         * d'opacité, là où l'ancienne y était près de son maximum : c'est cette coupe-là,
         * en pleine force, qui donnait le trait net sous le dossier.
         */
        /**
         * ⚠️ **Un quatrième halo, en encre de thème, et il ne sert qu'à une couleur sur
         * dix-neuf.** Les trois ombres ci-dessus portent la teinte du dossier ou du noir :
         * sur une teinte proche du fond de page, aucune des trois ne se voit, et la
         * silhouette disparaît. Mesuré, en thème sombre, contre `#030712` : le citron est à
         * 10,5 de contraste, le bleu à 5,5, l'ardoise à 4,2 — et l'encre `#1E2233` à **1,28**.
         * Ce n'est donc pas la palette qui est en cause, c'est une valeur aberrante. Relevé à
         * l'usage : « le dossier en mode sombre se voit pas très bien ».
         *
         * ⚠️ **Un halo plutôt qu'une correction de la couleur.** Remonter la teinte jusqu'à
         * un contraste minimal aurait marché — et aurait retiré à l'épargnant le dossier
         * sombre qu'il a choisi, celui qui va avec la carte noire qu'il trouve parfaite. Le
         * halo dessine le contour sans toucher à l'aplat.
         *
         * ⚠️ **`--nv-encre-rvb` et non du blanc : le défaut s'inverse en thème clair.** Là,
         * c'est un dossier *pâle* qui se perd sur fond blanc, et il lui faut un halo sombre.
         * Le jeton vaut blanc sur fond noir et encre sur fond blanc — le même code sert les
         * deux cas.
         *
         * ⚠️ **Sur les dix-huit autres il est invisible**, et c'est voulu : un bord déjà
         * cinq fois plus clair que la page ne gagne rien à un halo à seize pour cent.
         */
        filter: `drop-shadow(0 2px 9px ${couleur}59)`
          + ` drop-shadow(0 1px 3px ${couleur}3D)`
          + ` drop-shadow(0 1px 2px rgba(4,10,24,0.38))`
          + ` drop-shadow(0 0 1px rgba(var(--nv-encre-rvb), 0.16))`,
      }} />

      {/* Le paquet de cartes, décalé vers la droite.
          ⚠️ Rendu à l'envers : la première du tableau doit passer *devant* les autres,
          et rien n'ordonne l'empilement ici sinon l'ordre du document.

          ⚠️ Décalage latéral et non vertical : les cartes sont alignées en haut pour que
          leur ligne d'identité tombe dans la bande dégagée, celle qui échappe à la
          languette. Décalées vers le bas, elles auraient enfoncé le logo derrière elle.
          Ce sont donc leurs tranches de droite qui dépassent — et c'est ce dépassement,
          pas un compteur, qui dit qu'il y en a plusieurs. */}
      {cartes.map((c, i) => i).reverse().map(i => (
        <div key={i} aria-hidden="true" className="novac-dossier-paquet" style={{
          position: "absolute", left: PAQUET.retrait + i * PAQUET.decalage, top: 0,
          pointerEvents: "none",
        }}>
          {cartes[i]}
        </div>
      ))}

      {/* Le plan du dossier, par-dessus les cartes. */}
      <div style={{
        position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
        width: largeur, height: CARTE_COMPTE.panneau + LANGUETTE.hauteur,
      }}>
        <div style={{
          width: "100%", height: "100%",
          clipPath: `path("${CONTOUR}")`,
          /**
           * ⚠️ **Le dégradé s'étire davantage, parce qu'un aplat ne se lit pas comme un
           * objet.** Il allait du clair au sombre en passant par la teinte à mi-course ;
           * comparé à la maquette, il manquait de course — le dossier paraissait plat là où
           * le modèle a une surface qui tourne. Les deux extrêmes s'écartent donc, et le
           * point de bascule remonte : la lumière frappe le haut-gauche sur près de la
           * moitié du trajet, puis la surface s'enfonce.
           */
          /**
           * ⚠️ **Deux couches, parce qu'un dégradé linéaire ne fait pas une surface.** Il
           * décrit une pente régulière : la couleur y varie du même pas d'un bout à l'autre,
           * et l'œil lit un aplat incliné plutôt qu'un objet éclairé. Sur la maquette, la
           * lumière est **localisée** — elle frappe le haut-gauche et s'éteint en s'en
           * éloignant, ce qui est un dégradé radial, pas linéaire. On garde donc le linéaire
           * pour la teinte de fond, qui doit tourner du clair au sombre, et l'on pose
           * par-dessus une tache lumineuse qui donne le relief.
           *
           * ⚠️ **La tache est blanche, jamais teintée.** Le dossier prend l'une des onze
           * couleurs de l'épargnant : une lumière colorée aurait été juste sur une et fausse
           * sur les dix autres. Du blanc à quatorze pour cent éclaircit n'importe quelle
           * teinte sans en introduire une seconde.
           */
          /**
           * ⚠️ **La lumière rentre vers l'intérieur, sinon elle mange le liseré.** Centrée
           * sur le coin haut-gauche, elle éclaircissait le plan exactement là où passe
           * l'arête blanche : les deux se confondaient, et le liseré paraissait absent sur
           * toute la languette. Deux effets blancs superposés ne s'additionnent pas, ils
           * s'annulent — celui du dessous doit laisser le bord tranquille.
           */
          background: `radial-gradient(88% 78% at 26% 12%,`
            + ` rgba(255,255,255,0.11) 0%, rgba(255,255,255,0) 62%),`
            + ` linear-gradient(148deg, ${tresClair} 0%, ${clair} 26%,`
            + ` ${couleur} 58%, ${sombre} 100%)`,
        }}>
          <div style={{
            position: "relative", height: "100%",
            padding: `${LANGUETTE.hauteur + AIR_PANNEAU.haut}px ${AIR_PANNEAU.cote}px`
              + ` ${AIR_PANNEAU.bas}px`,
            display: "flex", flexDirection: "column", justifyContent: "space-between",
          }}>
            {/* L'identité du dossier : le repère de l'établissement, puis son nom. */}
            <div>
            <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between" }}>
              {/**
                * ⚠️ **Le pictogramme se pose sur le dossier, sans plaque sous lui.** Il
                * tenait dans un carré blanc de trente-six pixels : une pastille de plus dans
                * une carte qui en a déjà une à droite, et surtout un objet blanc posé sur un
                * dossier coloré, donc un troisième plan là où il n'y a que deux matières.
                *
                * ⚠️ **Blanc, comme le nom et le montant — et je l'avais d'abord écrit
                * l'inverse.** Le raisonnement paraissait solide : le plan est clair à cette
                * hauteur, un blanc devait s'y dissoudre, et une teinte assombrie aurait tenu
                * sur toute la palette. Comparé à l'écran sur le dossier le plus clair qu'elle
                * contienne — le citron —, c'est faux : le blanc y reste net, et la teinte
                * assombrie, elle, paraissait terne. La raison est que le pictogramme
                * n'appartient pas au plan mais au bloc d'identité, dont le nom et le montant
                * sont déjà blancs ; le peindre autrement en faisait un objet à part.
                *
                * ⚠️ **Vingt-huit pixels, la hauteur exacte de la pastille d'en face.** Sans
                * plaque, plus rien ne donnait sa mesure à la rangée d'identité ; les deux
                * bouts s'alignent désormais l'un sur l'autre. Le pictogramme gagne au passage
                * le bord gauche du texte, dont le carré l'écartait de huit pixels et demi.
                */}
              <span style={{
                width: 28, height: 28, flexShrink: 0, color: "rgba(255,255,255,0.95)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                {icone}
              </span>
              {/**
                * ⚠️ **Plus de pastille comptant les lignes.** Un rond blanc portant « 3 »
                * répondait à une question que la carte pose déjà deux lignes plus bas, en
                * toutes lettres — « 3 actifs » —, et il le faisait avec le poids visuel d'un
                * bouton. Le coin haut-droit revient à ce qui s'y actionne vraiment.
                */}
            </div>
              {/**
                * ⚠️ **Le nom passe sous le pictogramme, et rapetisse.** Il partageait le bas
                * de la carte avec le montant, deux lignes de poids voisin qui se disputaient
                * la lecture. En tête, sous le repère de l'établissement, il devient ce qu'il
                * est — une étiquette — et laisse le bas au seul chiffre qui compte.
                */}
              <div style={{
                marginTop: 9, fontSize: 15, fontWeight: 650, color: "rgba(255,255,255,0.95)",
                lineHeight: 1.2, letterSpacing: "-0.005em",
                overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
              }}>
                {nom}
              </div>
            </div>

            <div>
              <div style={{
                display: "flex", alignItems: "flex-end", justifyContent: "space-between",
              }}>
                <div style={{ fontSize: 12.5, color: "rgba(255,255,255,0.82)", minWidth: 0 }}>
                  {compte}
                </div>
                {/**
                  * ⚠️ **Le chevron ne paraît que s'il mène quelque part.** Il pointe à
                  * droite, comme sur la référence, et ne pivote pas : il ne déplie rien sous
                  * la carte, il mène *dans* le dossier. Sur un dossier de trésorerie il n'y a
                  * pas de dedans — il promettait alors un écran qui n'existe pas. Relevé à
                  * l'usage.
                  */}
                {ouvrable && (
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none"
                    stroke="rgba(255,255,255,0.9)" strokeWidth={2.4} strokeLinecap="round"
                    strokeLinejoin="round" aria-hidden="true">
                    <path d="m9 18 6-6-6-6" />
                  </svg>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/**
        * Le liseré du pourtour.
        *
        * ⚠️ **Un tracé SVG, parce qu'aucun `border` ne suit une découpe.** La silhouette du
        * dossier vient d'un `clip-path` : un `border` en épouserait la *boîte*, donc un
        * rectangle, et traverserait l'encoche de part en part. Le même chemin, tracé sans
        * remplissage, colle exactement au bord — encoche et pente comprises.
        *
        * ⚠️ **Il est de la couleur du dossier, éclaircie — pas blanc.** Trois versions blanches ont
        * échoué avant de comprendre la demande. Un blanc posé sur une teinte ne décrit pas une
        * arête, il décrit un reflet : il paraît juste sur un dossier sombre et se dissout sur
        * un clair, et sur aucun il ne donne l'impression d'un bord *taillé dans la matière*.
        * Éclaircir la teinte du dossier, en revanche, fait toujours la même chose quelle que
        * soit la couleur choisie — le bord reste de la famille, et l'objet paraît épais plutôt
        * que verni.
        *
        * ⚠️ **Il faut le poser franchement, et c'est une mesure qui l'a tranché.** Je l'ai cru
        * absent alors qu'il était peint : repassé en rouge de quatre pixels le temps d'un
        * essai, il est apparu net et exactement sur la silhouette. Ce n'était donc ni un
        * problème d'ordre de rendu ni de découpe, mais d'intensité — un blanc qui descend à
        * vingt-six pour cent sur un pixel et demi ne se distingue pas d'un plan dont le
        * dégradé éclaircit déjà le haut. Deux pixels, et rien sous trente-huit pour cent.
        *
        * ⚠️ **Il ne fait pas le tour, il s'allume sur deux coins opposés — comme celui des
        * cartes d'actifs.** Posé sur tout le contour et à pleine opacité, il cernait le
        * dossier d'un trait continu et clair : sur une teinte vive, cela ne se lit plus
        * comme une arête mais comme un détourage. Les cartes voisines, elles, portent depuis
        * toujours un bord qui s'éteint en chemin (`.novac-tile::before` dans `globals.css`) ;
        * deux traitements différents dans la même rangée se voient sans qu'on sache les
        * nommer.
        *
        * ⚠️ **La bande éteinte est centrée sur cinquante pour cent, et ce n'est pas un
        * réglage à l'œil.** Le dégradé va d'un coin à l'autre en unités de boîte : la valeur
        * en un point y vaut la projection sur la diagonale, soit `(x + y) / 2`. Le coin
        * haut-droit et le coin bas-gauche tombent donc tous deux exactement à 0,5, quelles
        * que soient les proportions. Un creux symétrique autour de 50 % les éteint tous les
        * deux à la fois — là où la version CSS de la tuile doit calculer 44,1 % et 55,9 %
        * pour son format, et n'y arrive que sur des tuiles proches du carré.
        *
        * ⚠️ **La teinte est plus sourde qu'avant, et c'est un retour en arrière assumé.**
        * Éclaircie de 32 % et opaque, elle « se voyait trop » sur un dossier vif. Elle est
        * maintenant portée par l'opacité plutôt que par la clarté : une teinte à peine
        * relevée, jamais au-delà de la moitié. L'arête se devine au lieu de se déclarer.
        *
        * ⚠️ **Il se peint en dernier, après le plan.** Placé avant, il était recouvert par
        * le plan qu'il est censé cerner — invisible, et je l'ai cru absent avant de
        * regarder l'ordre de rendu.
        *
        * ⚠️ **Un demi-pixel de retrait, et il se calcule par axe.** Un trait centré sur le
        * chemin déborde de moitié hors de la silhouette, là où le SVG et le `clip-path` du
        * plan l'ont déjà coupé. Le ramener à l'intérieur demande de rentrer le tracé d'un
        * demi-pixel **des quatre côtés** : un `translate` de 0,5 s'occupe du haut et de la
        * gauche, une échelle du bas et de la droite. Une échelle *unique* ne peut pas faire
        * les deux, puisque le dossier n'est pas carré — réglée sur la largeur (0,9967), elle
        * envoyait le bord bas à 150,005 sur un SVG haut de 150. Le trait y était donc centré
        * **sur** la limite du dessin, coupé de moitié, et signalé à l'écran comme « encore un
        * peu coupé ». D'où deux facteurs, `(côté − 1) / côté`, exacts pour les trois largeurs
        * possibles. L'anisotropie qu'ils introduisent vaut trois millièmes : le rayon de 18
        * devient 17,94 dans un sens et 17,88 dans l'autre.
        */}
      <svg width={largeur} height={CARTE_COMPTE.panneau + LANGUETTE.hauteur}
        aria-hidden="true" style={{
          position: "absolute", left: 0, top: CARTE_COMPTE.apercu - LANGUETTE.hauteur,
          pointerEvents: "none",
        }}>
        <defs>
          {/* Les arrêts reprennent ceux de `.novac-tile::before`, à l'opacité près : mêmes
              paliers, même creux de 38 à 62 %, pour que les deux objets s'éteignent au même
              endroit de leur diagonale. */}
          <linearGradient id={`bord-${idBord}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor={ARETE_CLAIRE} stopOpacity={0.75} />
            <stop offset="20%" stopColor={ARETE_CLAIRE} stopOpacity={0.5} />
            <stop offset="32%" stopColor={ARETE_CLAIRE} stopOpacity={0.18} />
            <stop offset="38%" stopColor={ARETE} stopOpacity={0} />
            <stop offset="62%" stopColor={ARETE} stopOpacity={0} />
            <stop offset="68%" stopColor={ARETE} stopOpacity={0.15} />
            <stop offset="80%" stopColor={ARETE} stopOpacity={0.38} />
            <stop offset="100%" stopColor={ARETE} stopOpacity={0.5} />
          </linearGradient>
        </defs>
        {/* ⚠️ Un pixel, comme l'arête d'une carte bancaire : deux dossiers et une carte
            voisins doivent porter le même trait, sinon le plus épais paraît plus proche. */}
        <path d={CONTOUR} fill="none" stroke={`url(#bord-${idBord})`} strokeWidth={1}
          transform={`translate(0.5, 0.5) scale(${(largeur - 1) / largeur}, ${
            (CARTE_COMPTE.panneau + LANGUETTE.hauteur - 1) / (CARTE_COMPTE.panneau + LANGUETTE.hauteur)
          })`} />
      </svg>
    </Plan>

    {/**
      * Les trois points, à la place qu'occupait la pastille.
      *
      * ⚠️ **Posé en absolu sur les coordonnées du panneau, et non dans son flux.** Il est
      * frère du dossier, pas son enfant : il faut donc refaire ici le calcul que le
      * rembourrage faisait tout seul. `apercu` est ce que le dossier laisse dépasser
      * au-dessus du plan, `AIR_PANNEAU.haut` l'air que le plan garde sous sa languette —
      * leur somme est exactement la hauteur à laquelle commence la rangée d'identité.
      * D'où la constante partagée : réglés séparément, les deux auraient dérivé d'un pixel
      * et le pictogramme n'aurait plus été à la même hauteur que les points d'en face.
      */}
    {onModifier && (
      <button type="button" className="novac-dossier-modifier"
        aria-label={`Réglages de ${nom}`}
        onClick={onModifier}
        style={{
          position: "absolute", top: CARTE_COMPTE.apercu + AIR_PANNEAU.haut,
          right: AIR_PANNEAU.cote, width: 28, height: 28, borderRadius: "50%",
          display: "flex", alignItems: "center", justifyContent: "center",
          padding: 0, border: 0, cursor: "pointer",
        }}>
        {/**
          * ⚠️ **Trois curseurs plutôt que trois points.** Les points ne disent rien : ils
          * annoncent « il y a autre chose », charge à vous de deviner quoi. Ce bouton ouvre
          * des *réglages* — le nom, le genre, la couleur d'un dossier —, et depuis que le
          * dossier de trésorerie ne s'ouvre plus, il en est la seule commande. Le seul geste
          * d'un objet mérite d'être nommé par son dessin.
          *
          * ⚠️ **Seize et non dix-sept.** Le tracé est bien plus dense que trois disques : à
          * la même taille, il pesait plus lourd que le pictogramme d'établissement qui lui
          * fait face à l'autre bout de la rangée.
          */}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <path d="M13.944 3.25c.774 0 1.516.308 2.063.854.31.31.54.685.683 1.09h3.088a.972.972 0 0 1 0 1.945H16.69c-.143.406-.373.78-.683 1.09a2.916 2.916 0 0 1-4.125 0c-.31-.31-.54-.684-.683-1.09H4.222a.972.972 0 0 1 0-1.945H11.2c.143-.405.373-.78.683-1.09a2.92 2.92 0 0 1 2.062-.854M10.173 9.938a2.916 2.916 0 0 0-4.124 0c-.31.31-.54.684-.684 1.09H4.222a.972.972 0 0 0 0 1.944h1.143c.144.406.374.78.684 1.09a2.916 2.916 0 0 0 4.124 0c.31-.31.54-.684.684-1.09h8.92a.972.972 0 0 0 0-1.944h-8.92a2.9 2.9 0 0 0-.684-1.09M16.861 14.917c.774 0 1.515.307 2.062.854.31.31.54.684.684 1.09h.17a.972.972 0 0 1 0 1.945h-.17c-.144.405-.373.78-.684 1.09a2.916 2.916 0 0 1-4.124 0c-.31-.31-.54-.685-.684-1.09H4.222a.972.972 0 0 1 0-1.945h9.893c.144-.406.374-.78.684-1.09a2.92 2.92 0 0 1 2.062-.854" />
        </svg>
      </button>
    )}
    </div>
  );
}
