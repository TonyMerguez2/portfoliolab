import { type Point2, contourSilhouette } from "./avatarSpherique";
import { type Solide } from "./avatarVolume";

/**
 * Ce qu'on pose **sur** la tête, par-dessus tout le reste.
 *
 * ⚠️ **Un accessoire ne tourne pas avec la tête, et c'est un choix, pas un renoncement.**
 * Tout le reste du visage — les yeux, les motifs, le maillage — est *peint sur la
 * surface* : chaque point est transporté sur le volume, tourné, puis reprojeté. Un
 * accessoire, lui, n'est pas peint : il est **posé**. Il a sa propre épaisseur, il
 * dépasse de la silhouette, et rien de la mécanique de surface ne sait représenter cela.
 * Le faire tourner demanderait un second volume, sa propre silhouette et sa propre
 * occlusion contre la tête — un autre projet.
 *
 * ⚠️ **Il se déduit donc de la silhouette, et jamais de la famille.** C'est la seule
 * façon qu'il tienne sur les huit formes sans huit dessins : on mesure le contour
 * réellement tracé, on le coupe à la hauteur voulue, et le bord du chapeau **est** ce
 * morceau de contour, décalé vers l'extérieur de l'épaisseur du tissu. Une casquette
 * ainsi construite épouse le sommet rond de la sphère, le plat du carré et la pointe du
 * triangle sans qu'on ait à les nommer — et une neuvième forme, le jour où elle
 * arrivera, sera coiffée sans qu'on y touche.
 */
export type FamilleAccessoire = "aucun" | "casquette";

/** Les accessoires proposés, avec leur libellé. */
export const ACCESSOIRES: [FamilleAccessoire, string][] = [
  ["aucun", "Aucun"],
  ["casquette", "Casquette"],
];

export type ReglagesCasquette = {
  /**
   * Où le bandeau coupe la tête, en part de sa hauteur depuis le sommet.
   *
   * ⚠️ En part de la hauteur **de la forme**, pas du cadre. Les huit volumes tiennent
   * dans le même carré mais n'ont pas la même hauteur : la capsule ne fait que 124 unités
   * pour 200 de large. Une hauteur absolue lui aurait enfoncé la casquette jusqu'aux
   * yeux pendant qu'elle effleurait le sommet du triangle.
   */
  assise: number;
  /**
   * De combien le bandeau penche, en degrés, vers le côté de la visière.
   *
   * ⚠️ **C'est l'inclinaison qui fait la casquette plutôt que le bonnet.** Une coupe
   * horizontale donne une calotte posée bien à plat, symétrique, qui se lit comme une
   * demi-sphère ; une vraie casquette est portée de travers, et son bandeau descend du
   * côté de la visière. Elle ne complique rien : on tourne le contour de l'angle voulu,
   * on coupe droit dans ce repère-là, et l'on remet tout d'aplomb. À zéro degré, la
   * construction redevient exactement celle d'une coupe horizontale.
   */
  inclinaison: number;
  /** L'épaisseur du tissu, en part du rayon de la tête. */
  epaisseur: number;
  /**
   * La longueur de la visière, en part de la demi-largeur **de la casquette**.
   *
   * ⚠️ **De la casquette et non de la tête, et la différence saute aux yeux.** Rapportée
   * à la tête, la même longueur s'ajoutait à un bandeau large sur la sphère et à un
   * bandeau étroit sur le triangle, où la coupe passe près du sommet : la visière y
   * partait d'une calotte de trente unités pour s'avancer de soixante-six, et se lisait
   * comme une planche plantée à côté du chapeau. Rapportée au bandeau, une petite
   * calotte reçoit une petite visière — la casquette reste une casquette.
   */
  visiere: number;
  /**
   * L'épaisseur de la visière, en part du rayon.
   *
   * ⚠️ **La sienne, et non celle du tissu.** Les deux ont été confondues d'abord, et la
   * visière sortait en fil : le tissu d'une calotte se compte en quelques unités, une
   * visière se lit de loin. Ce sont deux pièces, elles ont deux épaisseurs.
   */
  epaisseurVisiere: number;
  /** De combien la calotte monte au-dessus du crâne, en part de son épaisseur. */
  galbe: number;
  /** Le côté vers lequel la visière pointe. */
  cote: -1 | 1;
};

export const CASQUETTE_REFERENCE: ReglagesCasquette = {
  assise: 0.27,
  inclinaison: 15,
  epaisseur: 0.1,
  visiere: 0.62,
  epaisseurVisiere: 0.3,
  galbe: 1.15,
  cote: -1,
};

/** Le point d'un segment à la hauteur `y` — pour couper le contour au ras du bandeau. */
function surLaHauteur(a: Point2, b: Point2, y: number): Point2 {
  const t = Math.abs(b.y - a.y) < 1e-9 ? 0 : (y - a.y) / (b.y - a.y);
  return { x: a.x + (b.x - a.x) * t, y };
}

/**
 * Le morceau de silhouette qui passe au-dessus du bandeau.
 *
 * ⚠️ **On part du sommet et on s'étend de part et d'autre, plutôt que de filtrer.** Un
 * simple filtre `y ≤ assise` rendrait les points dans l'ordre du tableau, qui commence à
 * droite et non au sommet : le morceau arriverait coupé en deux, et refermé n'importe
 * comment. Pire, l'étoile à six lobes creuse au-dessus du bandeau — un filtre y
 * ramasserait deux arcs séparés et les joindrait par une corde en travers du chapeau. En
 * partant du point le plus haut, on ne garde que le morceau **continu** qui le contient,
 * qui est exactement celui que le tissu recouvre.
 */
function calotteDuContour(contour: Point2[], assise: number): Point2[] {
  const n = contour.length;
  let sommet = 0;
  for (let i = 1; i < n; i++) if (contour[i].y < contour[sommet].y) sommet = i;

  let debut = sommet, fin = sommet;
  for (let k = 1; k < n; k++) {
    const i = (sommet - k + n) % n;
    if (contour[i].y > assise) break;
    debut = i;
  }
  for (let k = 1; k < n; k++) {
    const i = (sommet + k) % n;
    if (contour[i].y > assise) break;
    fin = i;
  }

  const arc: Point2[] = [];
  // Le point exact où le contour croise le bandeau, pour que le chapeau pose à plat.
  arc.push(surLaHauteur(contour[(debut - 1 + n) % n], contour[debut], assise));
  for (let i = debut; ; i = (i + 1) % n) {
    arc.push(contour[i]);
    if (i === fin) break;
  }
  arc.push(surLaHauteur(contour[(fin + 1) % n], contour[fin], assise));
  return arc;
}

/**
 * Le même arc, poussé vers l'extérieur de `epaisseur`.
 *
 * ⚠️ **Vers l'extérieur du contour, pas vers l'extérieur du centre.** Les deux se
 * confondent sur une sphère et se séparent partout ailleurs : sur le plat du carré, la
 * direction depuis le centre est oblique, et le tissu s'y épaissirait en biais au lieu
 * de rester parallèle au crâne. On prend donc la **normale au contour** — la
 * perpendiculaire à la tangente — dont le signe se décide en la comparant, une fois, à
 * la direction du centre.
 */
function pousser(arc: Point2[], epaisseur: number, galbe: number): Point2[] {
  /**
   * ⚠️ **Les deux extrémités reprennent la normale de leur voisine.** Partout ailleurs la
   * tangente se prend de part et d'autre du point, donc centrée sur lui ; aux deux bouts
   * il n'y a de voisin que d'un côté, et la tangente ainsi mesurée est celle du *milieu*
   * du segment, décalée d'un demi-pas. Sur un contour qui tourne, ce demi-pas suffit à
   * incliner la normale et à amincir le tissu — mesuré, 2,48 unités au lieu de 5,50 sur
   * l'étoile, 4,13 sur le triangle, et toujours exactement au premier ou au dernier
   * point. Copier la normale d'à côté est juste au même ordre que la différence centrée,
   * et rend l'épaisseur constante d'un bout à l'autre.
   */
  const normales = arc.map((p, i) => {
    const j = Math.min(Math.max(i, 1), arc.length - 2);
    const a = arc[j - 1], b = arc[j + 1];
    const tx = b.x - a.x, ty = b.y - a.y;
    const l = Math.hypot(tx, ty);
    if (l < 1e-9) return { x: 0, y: 0 };
    let nx = ty / l, ny = -tx / l;
    if (nx * p.x + ny * p.y < 0) { nx = -nx; ny = -ny; }
    return { x: nx, y: ny };
  });
  /**
   * ⚠️ **Le tissu est plus épais sur le dessus que sur les côtés, et ce n'est pas un
   * caprice.** Poussée d'une épaisseur uniforme, la calotte a exactement la forme du
   * crâne : elle se lit comme un couvercle posé dessus, jamais comme une casquette. Une
   * vraie casquette a une **hauteur de calotte** — le tissu monte au-dessus du crâne et
   * se resserre sur les tempes. On module donc la poussée par la verticalité de la
   * normale : pleine au sommet, nulle aux flancs. La forme du crâne reste lisible sous le
   * tissu, ce qui est le but ; elle est seulement coiffée au lieu d'être recopiée.
   */
  return arc.map((p, i) => {
    const monte = Math.max(0, -normales[i].y);
    const e = epaisseur * (1 + galbe * monte * monte);
    return { x: p.x + normales[i].x * e, y: p.y + normales[i].y * e };
  });
}

/**
 * La teinte d'ombre d'un accessoire — sa visière, son bouton.
 *
 * ⚠️ **Dérivée de la couleur choisie, et non ajoutée à la palette.** Une casquette porte
 * deux tons, et les demander tous les deux à l'utilisateur, c'est deux réglages qui
 * peuvent se contredire — une visière plus claire que sa calotte ne ressemble à rien.
 * Un seul ton se choisit, l'autre s'en déduit : le second est toujours le plus sombre.
 */
function composantes(couleur: string): [number, number, number] | null {
  const h = couleur.replace("#", "");
  const plein = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(plein, 16);
  if (!isFinite(n) || plein.length !== 6) return null;
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const enHexa = (c: number[]) =>
  "#" + c.map(v => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("");

/**
 * Le second ton d'un accessoire — sa visière, son bouton.
 *
 * ⚠️ **Il s'éloigne du premier, dans le sens où il reste de la place.** Une casquette
 * porte deux tons et demander les deux, c'est deux réglages qui peuvent se contredire :
 * une visière plus sombre qu'une calotte déjà noire ne se voit plus. On dérive donc le
 * second, en éclaircissant une teinte foncée et en assombrissant une teinte claire. Le
 * contraste est garanti quel que soit le choix, y compris aux deux extrêmes.
 */
export function contraste(couleur: string, part = 0.52): string {
  const c = composantes(couleur);
  if (!c) return couleur;
  /**
   * ⚠️ **On décide sur le canal le plus fort, pas sur la luminance.** Un rose vif comme
   * `#F43F5E` a une luminance de 121 — sous la moitié, donc « foncé » au sens usuel — et
   * pourtant son rouge est déjà à 244 : il n'y a plus rien à monter, et l'éclaircir par
   * un facteur revenait à le *ternir* de dix-huit pour cent. Le canal le plus fort dit ce
   * qui reste de place vers le haut, ce qui est exactement la question posée.
   */
  const fort = Math.max(c[0], c[1], c[2], 1);
  if (fort > 165) return enHexa(c.map(v => v * (1 - part)));
  /**
   * ⚠️ **Une teinte foncée s'éclaircit en montant, pas en blanchissant.** Mélanger vers
   * le blanc désature : un bleu nuit y devient gris, et la visière perdait la couleur de
   * la casquette au lieu d'en être le ton clair. On multiplie donc les trois canaux d'un
   * même facteur — ce qui laisse leurs rapports intacts, donc la teinte — jusqu'à ce que
   * le plus fort atteigne sa cible. Le mélange vers le blanc ne sert plus qu'au repêchage
   * des teintes si sombres qu'aucun facteur raisonnable ne les relèverait.
   */
  const monte = c.map(v => v * Math.min(200 / fort, 4));
  const reste = (200 - Math.max(monte[0], monte[1], monte[2])) / 255;
  return enHexa(monte.map(v => v + (255 - v) * Math.max(0, reste) * part));
}


/** Une rotation autour du centre de la tête — l'aller et le retour du repère du bandeau. */
const pivoter = (p: Point2, cos: number, sin: number): Point2 =>
  ({ x: p.x * cos - p.y * sin, y: p.x * sin + p.y * cos });

/**
 * De combien le tour de la casquette se creuse, en part de sa largeur.
 *
 * ⚠️ C'est ce creux qui donne le volume : sans lui la calotte est un couvercle, avec lui
 * elle enveloppe. Un dixième suffit — au-delà, le bandeau descend au milieu du visage.
 */
const BOMBEMENT_BANDEAU = 0.13;

/**
 * De combien la visière dépasse le bord de la tête, en part de la demi-largeur.
 *
 * ⚠️ **Très peu, et c'est contraire à l'intuition.** Une visière paraît s'avancer loin ;
 * mesuré sur la référence, son bec ne sort du crâne que d'un cinquième du rayon. Ce qui
 * la fait paraître grande, c'est son **étendue** — elle barre presque toute la face
 * avant — et non son dépassement. Il faut malgré tout qu'elle sorte : à plat, la part qui
 * couvre la tête se confond avec elle, et seul le bec dit qu'il y a une visière. Les deux premières versions l'ont
 * confondu : rallongées vers l'extérieur, elles donnaient un bec de vingt unités posé à
 * côté du chapeau au lieu d'une visière.
 */
const DEPASSEMENT_VISIERE = 0.26;

const bout = (p: Point2) => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;

/**
 * Les trois pièces d'une casquette posée sur une forme quelconque.
 *
 * La calotte suit le crâne, la visière part du bandeau et le bouton coiffe le sommet.
 * Aucune des trois ne connaît la famille du volume : toutes se déduisent du contour.
 */
export function cheminsCasquette(
  solide: Solide, rayon: number, reglages: ReglagesCasquette,
): { calotte: string; visiere: string; bouton: Point2 } {
  const c = reglages.cote;
  /**
   * ⚠️ **Tout se construit dans le repère du bandeau, puis se remet d'aplomb.** Couper
   * une silhouette suivant une droite oblique demanderait de reprendre le parcours du
   * contour, la poussée du tissu et l'assise de la visière — trois endroits où l'oblique
   * s'infiltrerait. En tournant le contour de l'angle voulu, la coupe redevient
   * horizontale et la construction est celle, simple, qu'on avait déjà ; il ne reste qu'à
   * rendre les points à l'endroit. La casquette penche du côté de sa visière, comme une
   * vraie.
   */
  const angle = (reglages.inclinaison * Math.PI) / 180 * c;
  const ca = Math.cos(angle), sa = Math.sin(angle);
  const contour = contourSilhouette(solide, rayon, 720)
    .map(p => pivoter(p, ca, -sa));
  const droit = (p: Point2) => pivoter(p, ca, sa);

  let haut = Infinity, bas = -Infinity;
  for (const p of contour) {
    if (p.y < haut) haut = p.y;
    if (p.y > bas) bas = p.y;
  }
  const assise = haut + reglages.assise * (bas - haut);
  const epaisseur = reglages.epaisseur * rayon;

  const dedans = calotteDuContour(contour, assise);
  const dehors = pousser(dedans, epaisseur, reglages.galbe);

  /**
   * ⚠️ **La calotte se referme droit, sur la ligne du bandeau.** Elle est faite de l'arc
   * extérieur et d'un segment qui le referme : le dessous n'a aucune raison de suivre le
   * crâne, puisqu'il ne se voit pas. C'est aussi ce qui fait que le chapeau *couvre* au
   * lieu de border — dessiné après la tête, il en cache le sommet.
   */
  /**
   * ⚠️ **Le bandeau bombe, il ne coupe pas droit.** Refermée par un segment, la calotte
   * se lit comme un couvercle posé de biais : une corde droite est exactement ce qu'on ne
   * voit jamais sur une tête, parce que le tour d'une casquette est un cercle vu en
   * perspective, donc une ellipse — qui descend là où elle s'approche de nous et remonte
   * sur les côtés. On referme donc par une courbe, creusée du côté de la visière puisque
   * c'est ce côté-là qui vient vers l'œil.
   */
  const gauche = { x: dehors[0].x, y: assise };
  const droite = { x: dehors[dehors.length - 1].x, y: assise };
  const avant = gauche.x * c > droite.x * c ? gauche : droite;
  const bombe = Math.abs(droite.x - gauche.x) * BOMBEMENT_BANDEAU;
  const ferme: Point2[] = [];
  const PAS_BANDEAU = 48;
  for (let i = 0; i <= PAS_BANDEAU; i++) {
    const t = i / PAS_BANDEAU, u = 1 - t;
    // Le point de contrôle est décalé vers l'avant : le creux n'est pas au milieu.
    const kx = (droite.x + gauche.x) / 2 + (avant.x - (droite.x + gauche.x) / 2) * 0.55;
    ferme.push({
      x: u * u * droite.x + 2 * u * t * kx + t * t * gauche.x,
      y: assise + 2 * u * t * bombe * 2,
    });
  }
  const bordCalotte: Point2[] = [...ferme, ...dehors, ferme[0]];
  let calotte = `M ${bout(droit(bordCalotte[0]))}`;
  for (let i = 1; i < bordCalotte.length; i++) calotte += ` L ${bout(droit(bordCalotte[i]))}`;
  calotte += " Z";

  /**
   * La visière : le bandeau lui-même, décalé vers le bas et prolongé.
   *
   * ⚠️ **Elle se déduit du bandeau, elle n'est pas dessinée à côté.** Écrite comme une
   * courbe indépendante, elle vivait sa vie : le tour de casquette bombe de vingt-cinq
   * unités quand la visière n'en fait que seize d'épaisseur, si bien que la calotte —
   * peinte par-dessus — l'avalait entièrement. En prenant **la ligne du bandeau** et en
   * la décalant, l'accord est vrai par construction, à toutes les valeurs de bombement et
   * sur les huit formes : la visière est cousue au bord, elle ne peut plus s'en séparer.
   *
   * ⚠️ **Elle se prolonge par la tangente, pas par la courbe.** Prolonger la quadratique
   * du bandeau au-delà de son extrémité la fait repartir vers le haut — une visière qui
   * se relève en crochet. La tangente, elle, continue le mouvement : le bec s'avance dans
   * la direction que le tour de tête avait prise.
   */
  const versAvant = ferme[ferme.length - 1].x * c > ferme[0].x * c;
  const ligne = versAvant ? ferme.slice() : ferme.slice().reverse();
  const demi = reglages.epaisseurVisiere * rayon * 0.5;
  const dernier = ligne[ligne.length - 1], avantDernier = ligne[ligne.length - 2];
  // Le bec se compte sur le bord même de la casquette, là où il pousse.
  const bec = Math.abs(dernier.x) * DEPASSEMENT_VISIERE;
  const tx = dernier.x - avantDernier.x, ty = dernier.y - avantDernier.y;
  const lt = Math.hypot(tx, ty) || 1;
  const PROLONGE = 14;
  for (let i = 1; i <= PROLONGE; i++) {
    const k = (bec * i) / PROLONGE;
    ligne.push({ x: dernier.x + (tx / lt) * k, y: dernier.y + (ty / lt) * k });
  }
  // Le début se perd sous la calotte : la visière ne commence pas au bord opposé.
  const debut = Math.floor(ligne.length * (1 - reglages.visiere));
  const arc = ligne.slice(Math.max(0, debut));

  const dessus: Point2[] = [], dessous: Point2[] = [];
  for (let i = 0; i < arc.length; i++) {
    const t = i / (arc.length - 1);
    /**
     * ⚠️ **Le profil s'éteint aux deux bouts, et c'est ce qui en fait une visière.** Plein
     * dès la racine, il donne une bande d'épaisseur constante qui traverse le visage en
     * écharpe. Une visière est un **croissant** : effilée là où elle rejoint la calotte,
     * pleine au milieu, arrondie au bec.
     */
    const e = demi
      * Math.min(1, Math.pow(t / 0.34, 0.75))
      // ⚠️ Une racine carrée au bout, et non une puissance douce : c'est elle qui donne
      // un bec **rond**. Tout exposant supérieur à un demi y laisse une pointe.
      * Math.sqrt(Math.max(0, 1 - Math.pow(t, 8)));
    const y = arc[i].y + demi * 0.72;
    dessus.push(pivoter({ x: arc[i].x, y: y - e }, ca, sa));
    dessous.push(pivoter({ x: arc[i].x, y: y + e }, ca, sa));
  }
  let visiere = `M ${bout(dessus[0])}`;
  for (let i = 1; i < dessus.length; i++) visiere += ` L ${bout(dessus[i])}`;
  for (let i = dessous.length - 1; i >= 0; i--) visiere += ` L ${bout(dessous[i])}`;
  visiere += " Z";

  /**
   * Le bouton coiffe le sommet du tissu.
   *
   * ⚠️ **Le sommet une fois la casquette remise d'aplomb, pas avant.** Cherché dans le
   * repère penché, il désigne le point le plus haut *du bandeau incliné* — qui, redressé,
   * tombe sur le côté. Le bouton se posait alors à mi-pente.
   */
  const surTete = bordCalotte.map(droit);
  let sommet = surTete[0];
  for (const p of surTete) if (p.y < sommet.y) sommet = p;
  return { calotte, visiere, bouton: sommet };
}
