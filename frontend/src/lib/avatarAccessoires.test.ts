import { describe, expect, it } from "vitest";

import { CASQUETTE_REFERENCE, cheminsCasquette, contraste } from "./avatarAccessoires";
import { ARRONDI_REFERENCE } from "./avatarReglages";
import { type Point2, contourSilhouette } from "./avatarSpherique";
import { type FamilleSolide, solideDepuis } from "./avatarVolume";

/**
 * Une casquette est-elle vraiment **posée** sur la tête, sur les huit formes ?
 *
 * ⚠️ **La question ne se pose que parce qu'aucune des huit n'est dessinée à part.** Une
 * casquette par volume se vérifierait à l'œil et se corrigerait à la main ; celle-ci se
 * déduit du contour mesuré, ce qui la rend juste partout — ou fausse partout. Ce qu'on
 * éprouve ici, c'est ce qui distingue un chapeau posé d'un aplat collé par-dessus : il
 * **couvre** le crâne sans en laisser dépasser un morceau, il **épouse** sa courbe à
 * distance constante, et il **tient** d'une seule pièce avec sa visière.
 *
 * Le vrai bénéfice est pour la forme suivante : le jour où une neuvième arrive, ces
 * mesures diront tout de suite si elle se coiffe, sans qu'on ait à la regarder.
 */

const RAYON = 100;
const FORMES: FamilleSolide[] = [
  "sphere", "cube", "coussin", "hexagone", "triangle", "etoile", "etoile6", "goutte",
];
const solide = (f: FamilleSolide) => solideDepuis(f, ARRONDI_REFERENCE);

/**
 * Le contour lu dans le repère du bandeau — celui où la coupe est horizontale.
 *
 * ⚠️ **La mesure refait la rotation, elle ne la vérifie donc pas.** C'est assumé : ce
 * qu'on éprouve ici, c'est que le tissu couvre, épouse et tient, propriétés qui sont les
 * mêmes dans tous les repères. Que la casquette penche du bon côté est en revanche une
 * question de convention, pas de géométrie, et cela se voit d'un coup d'œil.
 */
function dansLeRepereDuBandeau(contour: Point2[]): Point2[] {
  const a = (CASQUETTE_REFERENCE.inclinaison * Math.PI) / 180 * CASQUETTE_REFERENCE.cote;
  const ca = Math.cos(a), sa = Math.sin(-a);
  return contour.map(p => ({ x: p.x * ca - p.y * sa, y: p.x * sa + p.y * ca }));
}

/** La hauteur du bandeau, telle que la construction la calcule. */
function assiseDe(contour: Point2[]): number {
  const droit = dansLeRepereDuBandeau(contour);
  const haut = Math.min(...droit.map(p => p.y));
  const bas = Math.max(...droit.map(p => p.y));
  return haut + CASQUETTE_REFERENCE.assise * (bas - haut);
}

function pointsDuChemin(d: string): Point2[] {
  const n = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const p: Point2[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) p.push({ x: Number(n[i]), y: Number(n[i + 1]) });
  return p;
}

/** Le point est-il dans le contour ? Parité des traversées, valable même non convexe. */
function dedans(p: Point2, contour: Point2[]): boolean {
  let n = 0;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    if ((a.y > p.y) !== (b.y > p.y)) {
      const x = a.x + ((p.y - a.y) / (b.y - a.y)) * (b.x - a.x);
      if (x > p.x) n++;
    }
  }
  return n % 2 === 1;
}

/** La distance d'un point au contour, en le prenant segment par segment. */
function distanceAuContour(p: Point2, contour: Point2[]): number {
  let d = Infinity;
  for (let i = 0; i < contour.length; i++) {
    const a = contour[i], b = contour[(i + 1) % contour.length];
    const vx = b.x - a.x, vy = b.y - a.y;
    const l2 = vx * vx + vy * vy;
    const t = l2 < 1e-12 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * vx + (p.y - a.y) * vy) / l2));
    d = Math.min(d, Math.hypot(p.x - (a.x + vx * t), p.y - (a.y + vy * t)));
  }
  return d;
}

describe("la casquette est posée sur la tête", () => {
  it("ne laisse aucun morceau de crâne dépasser au-dessus du bandeau", () => {
    /**
     * ⚠️ **Le défaut qui trahirait tout de suite un chapeau plaqué.** Si la calotte est
     * dessinée d'après le cadre plutôt que d'après le contour, elle passe *à côté* des
     * formes qui n'emplissent pas leur carré — un coin de crâne ressort alors du tissu, et
     * la casquette flotte devant la tête au lieu d'être dessus. On éprouve donc chaque
     * point du contour situé au-dessus du bandeau : tous doivent être dans la calotte.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const calotte = pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte);
      const assise = assiseDe(contour);
      const droit = dansLeRepereDuBandeau(contour);
      for (let i = 0; i < contour.length; i++) {
        // Une frange sous le bandeau est exclue : c'est la ligne de coupe elle-même, que
        // le tour bombé fait descendre, et où « dedans » n'a pas de sens.
        if (droit[i].y > assise - 30) continue;
        expect(dedans(contour[i], calotte)).toBe(true);
      }
    }
  });

  it("épouse la courbe du crâne à épaisseur constante", () => {
    /**
     * ⚠️ **C'est cette mesure qui dit « posé » plutôt que « autour ».** Le tissu suit le
     * crâne : son bord extérieur reste entre l'épaisseur du tissu et la hauteur de
     * calotte, jamais moins — sinon il mordrait dans la tête — jamais plus — sinon il
     * flotterait devant. La borne haute n'est pas la basse parce qu'une casquette *monte*
     * au-dessus du crâne : poussée d'une épaisseur uniforme, elle a exactement la forme
     * de la tête et se lit comme un couvercle. Prendre la direction depuis le centre au
     * lieu de la normale au contour donnerait un chapeau qui s'épaissit en biais sur les
     * plats — invisible sur la sphère, où les deux directions se confondent, net sur le
     * carré.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const attendu = CASQUETTE_REFERENCE.epaisseur * RAYON;
      /**
       * ⚠️ **Les deux premiers et derniers points sont écartés, et ce n'est pas une
       * commodité.** Le chemin s'écrit « coin, bord extérieur…, coin » : les deux coins
       * ferment la calotte à plat sur la ligne du bandeau et n'appartiennent pas au
       * tissu — ils n'ont donc aucune raison d'être à son épaisseur. Écrit d'abord avec
       * un filtre sur la distance, ce test accusait la casquette de s'amincir à 2,46
       * unités sur l'étoile ; le défaut était dans la mesure, et les points fautifs
       * étaient à chaque fois, exactement, le premier ou le dernier.
       */
      const chemin = pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte);
      // Le tour de casquette — les cinquante premiers points, le bombé — repose sur la
      // ligne du bandeau et non sur le crâne : il n'a pas à être à l'épaisseur du tissu.
      const bord = chemin.slice(50, chemin.length - 1);
      const plafond = attendu * (1 + CASQUETTE_REFERENCE.galbe);
      for (const p of bord) {
        const d = distanceAuContour(p, contour);
        expect(d).toBeGreaterThan(attendu * 0.9);
        expect(d).toBeLessThan(plafond * 1.06);
      }
    }
  });

  it("garde la visière accrochée au bandeau", () => {
    /**
     * ⚠️ Signalé par la mesure avant de l'être à l'œil : une visière dont la longueur se
     * comptait sur la tête entière partait d'une calotte étroite pour s'avancer très
     * loin, et se lisait comme une planche posée à côté du chapeau. Sa racine doit
     * toucher la calotte, et sa longueur rester du même ordre que le bandeau qui la
     * porte.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const pieces = cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE);
      const calotte = pointsDuChemin(pieces.calotte);
      const visiere = pointsDuChemin(pieces.visiere);
      // Au moins un point de la visière est franchement dans la calotte : elles se
      // recouvrent, donc le raccord ne peut pas s'ouvrir.
      expect(visiere.filter(p => dedans(p, calotte)).length).toBeGreaterThan(0);

      const largeurCalotte = Math.max(...calotte.map(p => p.x)) - Math.min(...calotte.map(p => p.x));
      const largeurVisiere = Math.max(...visiere.map(p => p.x)) - Math.min(...visiere.map(p => p.x));
      expect(largeurVisiere).toBeLessThan(largeurCalotte);
    }
  });

  it("coiffe chaque forme à sa propre échelle", () => {
    /**
     * ⚠️ **La propriété qui justifie de tout déduire du contour.** Les huit volumes
     * tiennent dans le même carré mais n'ont ni la même hauteur ni la même largeur : la
     * capsule est deux fois plus large que haute. Une casquette réglée en unités absolues
     * lui serait tombée sur les yeux pendant qu'elle effleurait le sommet du triangle. On
     * vérifie donc que le bandeau coupe bien chaque forme à la même *part* de sa hauteur.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const droit = dansLeRepereDuBandeau(contour);
      const haut = Math.min(...droit.map(p => p.y));
      const bas = Math.max(...droit.map(p => p.y));
      // Le premier point du chemin est le départ du tour, pris pile sur l'assise.
      const depart = dansLeRepereDuBandeau(
        [pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte)[0]])[0];
      expect((depart.y - haut) / (bas - haut)).toBeCloseTo(CASQUETTE_REFERENCE.assise, 2);
    }
  });
});

describe("le second ton", () => {
  it("s'écarte toujours assez du premier pour se voir", () => {
    /**
     * ⚠️ **Aux deux extrêmes, un seul sens marche.** Éclaircir marche sur un bleu nuit et
     * ne marche pas sur du blanc ; assombrir, l'inverse. La visière doit se détacher de
     * la calotte quel que soit le choix, y compris si l'on tombe sur du noir ou du blanc.
     */
    for (const c of ["#F43F5E", "#1E2340", "#FFFFFF", "#000000", "#101014", "#abc"]) {
      const t = contraste(c);
      expect(t).toMatch(/^#[0-9a-f]{6}$/);
      const lire = (h: string) => {
        const p = h.replace("#", "");
        const plein = p.length === 3 ? p.split("").map(x => x + x).join("") : p;
        const n = parseInt(plein, 16);
        return ((n >> 16 & 255) * 299 + (n >> 8 & 255) * 587 + (n & 255) * 114) / 1000;
      };
      /**
       * Mesuré sur les six : de 63 points d'écart pour le rose vif — celui qui laisse le
       * moins de place — à 133 pour le blanc. Un sixième de l'échelle suffit largement à
       * séparer deux aplats voisins ; on garde 45 pour laisser respirer les teintes
       * extrêmes sans jamais tolérer deux tons qui se confondent.
       */
      expect(Math.abs(lire(t) - lire(c))).toBeGreaterThan(45);
    }
  });
});
