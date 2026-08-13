import { describe, expect, it } from "vitest";

import { CASQUETTE_REFERENCE, cheminsCasquette, ombre } from "./avatarAccessoires";
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
      const haut = Math.min(...contour.map(p => p.y));
      const bas = Math.max(...contour.map(p => p.y));
      const assise = haut + CASQUETTE_REFERENCE.assise * (bas - haut);
      for (const p of contour) {
        // Une frange d'une unité sous le bandeau est exclue : c'est la ligne de coupe
        // elle-même, où « dedans » n'a pas de sens à la précision d'un polygone.
        if (p.y > assise - 1) continue;
        expect(dedans(p, calotte)).toBe(true);
      }
    }
  });

  it("épouse la courbe du crâne à épaisseur constante", () => {
    /**
     * ⚠️ **C'est cette mesure qui dit « posé » plutôt que « autour ».** Un tissu suit le
     * crâne : son bord extérieur est partout à la même distance de la tête. Prendre la
     * direction depuis le centre au lieu de la normale au contour donne un chapeau qui
     * s'épaissit en biais sur les plats — invisible sur la sphère, où les deux
     * directions se confondent, et net sur le carré. On mesure donc la distance du bord
     * extérieur au contour, et l'on demande qu'elle ne s'écarte pas de l'épaisseur
     * voulue.
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
      const bord = chemin.slice(1, chemin.length - 1);
      for (const p of bord) {
        // Mesuré sur les huit formes : de 5,40 à 5,51 unités pour 5,50 attendues.
        expect(distanceAuContour(p, contour)).toBeGreaterThan(attendu * 0.95);
        expect(distanceAuContour(p, contour)).toBeLessThan(attendu * 1.05);
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
      const haut = Math.min(...contour.map(p => p.y));
      const bas = Math.max(...contour.map(p => p.y));
      const calotte = pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte);
      const bord = Math.max(...calotte.map(p => p.y));
      expect((bord - haut) / (bas - haut)).toBeCloseTo(CASQUETTE_REFERENCE.assise, 2);
    }
  });
});

describe("la teinte d'ombre", () => {
  it("assombrit sans jamais éclaircir", () => {
    for (const c of ["#F43F5E", "#6366F1", "#FFFFFF", "#101014", "#abc"]) {
      const o = ombre(c);
      const lire = (h: string) => {
        const p = h.replace("#", "");
        const plein = p.length === 3 ? p.split("").map(x => x + x).join("") : p;
        return parseInt(plein, 16);
      };
      const somme = (n: number) => ((n >> 16) & 255) + ((n >> 8) & 255) + (n & 255);
      expect(somme(lire(o))).toBeLessThanOrEqual(somme(lire(c)));
      expect(o).toMatch(/^#[0-9a-f]{6}$/);
    }
  });
});
