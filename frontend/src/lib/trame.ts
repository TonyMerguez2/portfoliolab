/**
 * La trame animée : sa géométrie, ses forces, son ressort.
 *
 * ⚠️ **Le calcul vit ici et non dans le canvas, parce qu'une animation ne se relit pas.**
 * Un point qui part trop loin, une onde qui ne s'éteint pas, un ressort qui oscille sans
 * fin : à l'œil, tout cela s'appelle « c'est bizarre », et se corrige en tâtonnant sur des
 * constantes. Sorties du dessin, ces quatre fonctions se mesurent — voir `trame.test.ts`.
 *
 * ⚠️ **Rien ici ne connaît le temps réel ni le canvas.** `pasDeRessort` reçoit son `dt` ;
 * c'est la boucle qui décide de le borner. Le jour où la trame serait calculée ailleurs —
 * un worker, un test, une capture image par image — ce fichier suivrait sans rien changer.
 *
 * Les valeurs de référence viennent de `ui-lab/src/lab/components/dot-grid.tsx`, relevées
 * telles quelles ; ce que Novac en change est dit sur `REGLAGES_NOVAC`.
 */

export type ReglagesTrame = {
  /** L'écart entre deux points, en pixels. */
  pas: number;
  /** Le rayon du point au repos. */
  point: number;
  /** Le rayon d'influence du curseur. Au-delà, un point ne sent rien. */
  champ: number;
  /** De combien de pixels le curseur repousse le point le plus proche. */
  poussee: number;
  /** Ce que le point gagne en rayon quand il est pleinement éveillé, en proportion. */
  grossissement: number;
  /** La raideur du ressort qui ramène le point chez lui. */
  raideur: number;
  /** Son amortissement — voir `tauxDAmortissement`. */
  amortissement: number;
  /** La vitesse de l'onde née d'un clic, en pixels par seconde. */
  vitesseAnneau: number;
  /** L'épaisseur de son front. */
  largeurAnneau: number;
  /** Ce qu'elle déplace au passage. */
  pousseeAnneau: number;
};

/** Les valeurs de la référence, au chiffre près. */
export const REGLAGES_REFERENCE: ReglagesTrame = {
  pas: 16,
  point: 1.5,
  champ: 88,
  poussee: 7,
  grossissement: 1.3,
  raideur: 170,
  amortissement: 18,
  vitesseAnneau: 620,
  largeurAnneau: 22,
  pousseeAnneau: 9,
};

/**
 * Les mêmes forces, sur la trame de Novac.
 *
 * ⚠️ **Deux valeurs seulement changent, et ce sont celles du fond existant** : 14 px de pas et
 * 1 px de plein, relevés sur `.nv-points` dans `globals.css`. Elles ne sont pas un goût :
 * le logo, la porte de l'alpha et la trame de page partagent cette maille, et une trame
 * animée qui se poserait à 16 px se verrait glisser d'un demi-point sur le logo juste à côté.
 *
 * Le reste — champ, poussée, ressort, onde — est laissé à la référence tant que l'œil n'a
 * pas tranché. C'est ce que le banc `/trame` sert à décider.
 */
export const REGLAGES_NOVAC: ReglagesTrame = { ...REGLAGES_REFERENCE, pas: 14, point: 1 };

/**
 * L'éveil d'un point de la silhouette du logo : le maximum, et rien d'autre.
 *
 * ⚠️ **Le logo n'a pas de rayon à lui, et c'est tout le sujet.** Il en a eu un — 1,5 px
 * contre 1, à une encre propre — et cela se voyait : des points plus gros que les autres sans
 * raison visible, que le curseur faisait encore grossir en passant dessus. Deux façons d'être
 * gros pour un même point, donc quelque chose d'artificiel.
 *
 * Un point de la silhouette est un point **que le curseur a réveillé**, simplement il l'est
 * en permanence. Son rayon et son encre sont ceux que `attraction` rend à distance nulle,
 * c'est-à-dire 1 — et comme c'est le maximum, la souris qui passe dessus n'a plus rien à lui
 * donner. C'est la condition pour que le logo ne se trahisse pas au survol.
 */
export const EVEIL_DU_LOGO = 1;

/**
 * Le seuil sous lequel un point est considéré posé.
 *
 * ⚠️ **Posé veut dire « à sa cible », pas « chez lui ».** Un curseur immobile tient des
 * milliers de points hors de leur place, et la boucle doit pouvoir s'endormir quand même —
 * sans quoi la trame animerait une image fixe soixante fois par seconde.
 */
export const REPOS = 0.01;

/**
 * Les points, posés en réseau centré dans la surface donnée.
 *
 * ⚠️ **Centré, et non calé en haut à gauche.** Le reste de la division est réparti de part
 * et d'autre : les marges se valent sur les quatre bords, ce qui est la seule façon qu'une
 * trame de fond ne paraisse pas décadrée quand la fenêtre change de taille.
 *
 * ⚠️ **L'origine est calée sur la grille physique de l'écran, d'où `densite`.** Le centrage
 * tombe presque toujours sur une fraction de pixel — 7,5 px sur une fenêtre de 1015 — et un
 * disque de deux pixels centré sur une fraction s'étale sur trois : son bord s'adoucit des
 * deux côtés et le point se lit flou. Arrondir la seule origine suffit, et ne coûte rien à la
 * régularité : tant que le pas fait un nombre entier de pixels physiques — 14 à densité 2 en
 * fait 28 — tous les points suivent sur la grille. Le décentrage introduit vaut au pire un
 * demi-pixel physique, soit le quart de ce qu'on gagne.
 */
export function poserLaTrame(largeur: number, hauteur: number, pas: number, densite = 1) {
  const colonnes = Math.max(0, Math.floor(largeur / pas));
  const lignes = Math.max(0, Math.floor(hauteur / pas));
  const nombre = colonnes * lignes;
  const x = new Float32Array(nombre);
  const y = new Float32Array(nombre);
  const surLaGrille = (v: number) => Math.round(v * densite) / densite;
  const departX = surLaGrille((largeur - (colonnes - 1) * pas) / 2);
  const departY = surLaGrille((hauteur - (lignes - 1) * pas) / 2);
  for (let ligne = 0, i = 0; ligne < lignes; ligne++) {
    for (let colonne = 0; colonne < colonnes; colonne++, i++) {
      x[i] = departX + colonne * pas;
      y[i] = departY + ligne * pas;
    }
  }
  return { colonnes, lignes, nombre, x, y };
}

/**
 * Ce qu'un point ressent du curseur, entre 0 et 1.
 *
 * ⚠️ **Quadratique et non linéaire.** La même chute en droite ligne donne un halo à bord
 * net, qu'on lit comme un disque posé sur la page ; au carré, le bord se dissout et c'est
 * le centre qui porte l'effet. C'est aussi la retombée du masque de `.nv-points`, qui n'a
 * pas été réglée autrement.
 */
export function attraction(distance: number, champ: number): number {
  if (distance >= champ || champ <= 0) return 0;
  return (1 - distance / champ) ** 2;
}

/**
 * Le front de l'onde : une cloche centrée sur son rayon courant.
 *
 * Un point ne bouge que lorsque l'onde passe **sur** lui — pas avant, pas après. C'est ce
 * qui la fait lire comme un anneau et non comme un disque qui grandit.
 */
export function bandeDeLAnneau(distance: number, rayon: number, largeur: number): number {
  return Math.exp(-(((distance - rayon) / largeur) ** 2));
}

/**
 * Ce qu'il reste de l'onde à mesure qu'elle s'étend, comme d'une vraie secousse.
 *
 * Sans cet affaiblissement, l'anneau frapperait le bord de l'écran aussi fort qu'il est
 * parti du curseur — un cercle parfait qui traverse la page, donc un effet, pas une matière.
 */
export function affaiblissementDeLAnneau(rayon: number, portee: number): number {
  return Math.max(0, 1 - rayon / portee);
}

/**
 * Un pas du ressort : rend la nouvelle valeur et la nouvelle vitesse.
 *
 * ⚠️ **Euler semi-implicite** — la vitesse est mise à jour d'abord, et la position s'appuie
 * sur la nouvelle. C'est ce que fait la référence, et ce qui tient sous des pas de temps
 * irréguliers là où l'Euler explicite gagne de l'énergie à chaque image longue.
 */
export function pasDeRessort(
  valeur: number, vitesse: number, cible: number, dt: number,
  raideur: number, amortissement: number,
): [valeur: number, vitesse: number] {
  const v = vitesse + (raideur * (cible - valeur) - amortissement * vitesse) * dt;
  return [valeur + v * dt, v];
}

/**
 * Le taux d'amortissement du ressort : 1 est le retour le plus rapide sans dépassement.
 *
 * ⚠️ **On le veut sous 1, et c'est tout le caractère de la trame.** À 170 de raideur et 18
 * d'amortissement il vaut 0,69 : le point dépasse sa place, revient, et cette hésitation est
 * ce qui distingue une matière d'un décor qui glisse. Exposé ici pour que le banc l'affiche,
 * plutôt que de laisser deux nombres sans rapport apparent régler une sensation.
 */
export function tauxDAmortissement(raideur: number, amortissement: number): number {
  return amortissement / (2 * Math.sqrt(raideur));
}
