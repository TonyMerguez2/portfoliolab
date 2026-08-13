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
  /** Le côté vers lequel la visière pointe. */
  cote: -1 | 1;
};

export const CASQUETTE_REFERENCE: ReglagesCasquette = {
  assise: 0.30,
  epaisseur: 0.055,
  visiere: 0.72,
  epaisseurVisiere: 0.2,
  cote: 1,
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
function pousser(arc: Point2[], epaisseur: number): Point2[] {
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
  return arc.map((p, i) => ({
    x: p.x + normales[i].x * epaisseur,
    y: p.y + normales[i].y * epaisseur,
  }));
}

/**
 * La teinte d'ombre d'un accessoire — sa visière, son bouton.
 *
 * ⚠️ **Dérivée de la couleur choisie, et non ajoutée à la palette.** Une casquette porte
 * deux tons, et les demander tous les deux à l'utilisateur, c'est deux réglages qui
 * peuvent se contredire — une visière plus claire que sa calotte ne ressemble à rien.
 * Un seul ton se choisit, l'autre s'en déduit : le second est toujours le plus sombre.
 */
export function ombre(couleur: string, part = 0.44): string {
  const h = couleur.replace("#", "");
  const plein = h.length === 3 ? h.split("").map(c => c + c).join("") : h;
  const n = parseInt(plein, 16);
  if (!isFinite(n)) return couleur;
  const f = (d: number) => Math.round(((n >> d) & 255) * (1 - part));
  return "#" + [16, 8, 0].map(d => f(d).toString(16).padStart(2, "0")).join("");
}

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
  const contour = contourSilhouette(solide, rayon, 720);
  let haut = Infinity, bas = -Infinity, large = 0;
  for (const p of contour) {
    if (p.y < haut) haut = p.y;
    if (p.y > bas) bas = p.y;
    if (Math.abs(p.x) > large) large = Math.abs(p.x);
  }
  const assise = haut + reglages.assise * (bas - haut);
  const epaisseur = reglages.epaisseur * rayon;

  const dedans = calotteDuContour(contour, assise);
  const dehors = pousser(dedans, epaisseur);

  /**
   * ⚠️ **La calotte se referme droit, sur la ligne du bandeau.** Elle est faite de l'arc
   * extérieur et d'un segment qui le referme : le dessous n'a aucune raison de suivre le
   * crâne, puisqu'il ne se voit pas. C'est aussi ce qui fait que le chapeau *couvre* au
   * lieu de border — dessiné après la tête, il en cache le sommet.
   */
  let calotte = `M ${bout({ x: dehors[0].x, y: assise })}`;
  for (const p of dehors) calotte += ` L ${bout(p)}`;
  calotte += ` L ${bout({ x: dehors[dehors.length - 1].x, y: assise })} Z`;

  /**
   * La visière : une pièce balayée le long d'une ligne, et non un contour dessiné.
   *
   * ⚠️ **Sa racine est prise sur le contour, pas sur le cadre.** Posée à la demi-largeur
   * de la tête, elle décollerait de toutes les formes qui sont plus étroites à hauteur du
   * bandeau — le triangle s'en écarte de trente unités, la goutte de vingt. On mesure
   * donc le contour **à la hauteur du bandeau**, et la visière part de là.
   *
   * ⚠️ **Balayée, parce qu'un contour écrit à la main ne se règle pas.** Une visière
   * dessinée en quatre courbes tient à une seule taille : changer sa longueur en tord le
   * galbe, et changer l'épaisseur du tissu la décolle. Ici on décrit une **ligne
   * moyenne** — qui part du bandeau, s'avance et retombe un peu — et une **demi-épaisseur
   * qui s'éteint au bout**. La pièce se déduit des deux, donc elle garde sa forme à
   * toutes les longueurs. Le profil en `√(1 − t⁴)` reste plein presque jusqu'au bout puis
   * s'arrondit d'un coup : c'est ce qui donne un bout rond plutôt qu'une pointe.
   */
  const c = reglages.cote;
  let bordX = 0;
  for (const p of contour) {
    if (Math.abs(p.y - assise) <= 0.8 && p.x * c > bordX * c) bordX = p.x;
  }
  // La racine rentre sous la calotte : le raccord se cache au lieu de se voir.
  const demi = reglages.epaisseurVisiere * rayon * 0.5;
  const x0 = bordX - c * epaisseur * 1.2, y0 = assise - demi * 0.15;
  const longueur = reglages.visiere * Math.abs(bordX);
  const tombee = demi * 1.5;
  const dessus: Point2[] = [], dessous: Point2[] = [];
  const PAS = 40;
  for (let i = 0; i <= PAS; i++) {
    const t = i / PAS;
    // Ligne moyenne : une quadratique qui part à plat et retombe vers le bout.
    const u = 1 - t;
    const cx = x0 + c * longueur * 0.58, cy = y0 - tombee * 0.28;
    const x = u * u * x0 + 2 * u * t * cx + t * t * (x0 + c * longueur);
    const y = u * u * y0 + 2 * u * t * cy + t * t * (y0 + tombee);
    // La normale à cette ligne, pour poser l'épaisseur perpendiculairement.
    const dx = 2 * u * (cx - x0) + 2 * t * (x0 + c * longueur - cx);
    const dy = 2 * u * (cy - y0) + 2 * t * (y0 + tombee - cy);
    const l = Math.hypot(dx, dy) || 1;
    const e = demi * Math.sqrt(Math.max(0, 1 - t * t * t * t));
    dessus.push({ x: x + (dy / l) * e * c, y: y - (dx / l) * e * c });
    dessous.push({ x: x - (dy / l) * e * c, y: y + (dx / l) * e * c });
  }
  let visiere = `M ${bout(dessus[0])}`;
  for (let i = 1; i < dessus.length; i++) visiere += ` L ${bout(dessus[i])}`;
  for (let i = dessous.length - 1; i >= 0; i--) visiere += ` L ${bout(dessous[i])}`;
  visiere += " Z";

  // Le bouton coiffe le sommet **du tissu**, pas celui du crâne.
  let sommet = dehors[0];
  for (const p of dehors) if (p.y < sommet.y) sommet = p;
  return { calotte, visiere, bouton: sommet };
}
