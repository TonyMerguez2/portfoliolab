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
 * **coiffe** le crâne au lieu de le traverser, il **épouse** sa courbe sans le mordre ni
 * flotter devant, il **descend sur le front** comme une casquette et non comme une
 * calotte, et il **tient** d'une seule pièce avec sa visière.
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
  it("coiffe le crâne au lieu de le traverser", () => {
    /**
     * ⚠️ **Un invariant qui ne dépend d'aucun repère, et c'est ce qui fait sa valeur.**
     * Les mesures précédentes comparaient des hauteurs, si bien qu'elles devaient refaire
     * le calcul de l'assise — puis celui de l'inclinaison, puis celui de la plongée du
     * bandeau — et se trompaient à chaque fois que la construction évoluait. Celle-ci ne
     * suppose rien : on parcourt la silhouette et l'on compte les **entrées et sorties**
     * du tissu. Une casquette posée en produit exactement deux, comme tout couvre-chef
     * qui recouvre une calotte du crâne et laisse le reste à l'air. Zéro dirait qu'elle
     * flotte à côté ou qu'elle avale toute la tête ; quatre, qu'elle la traverse.
     *
     * Le sommet doit être dessous, sinon les deux traversées décriraient une mentonnière.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const calotte = pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte);
      let passages = 0;
      for (let i = 0; i < contour.length; i++) {
        const a = dedans(contour[i], calotte);
        const b = dedans(contour[(i + 1) % contour.length], calotte);
        if (a !== b) passages++;
      }
      expect(passages).toBe(2);

      let sommet = contour[0];
      for (const p of contour) if (p.y < sommet.y) sommet = p;
      expect(dedans(sommet, calotte)).toBe(true);
    }
  });

  it("épouse la courbe du crâne sans la mordre ni flotter", () => {
    /**
     * ⚠️ **C'est cette mesure qui dit « posé » plutôt que « autour ».** Le bord du tissu
     * reste entre l'épaisseur voulue et la hauteur de calotte : jamais moins, sinon il
     * mordrait dans la tête ; jamais plus, sinon il flotterait devant. La borne haute
     * n'est pas la basse parce qu'une casquette **monte** au-dessus du crâne — poussée
     * d'une épaisseur uniforme, elle en a exactement la forme et se lit comme un
     * couvercle. Prendre la direction depuis le centre plutôt que la normale au contour
     * donnerait un tissu qui s'épaissit en biais sur les plats : invisible sur la sphère,
     * où les deux directions se confondent, net sur le carré.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const attendu = CASQUETTE_REFERENCE.epaisseur * RAYON;
      const plafond = attendu * (1 + CASQUETTE_REFERENCE.galbe);
      for (const p of cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).tissu) {
        const d = distanceAuContour(p, contour);
        expect(d).toBeGreaterThan(attendu * 0.9);
        expect(d).toBeLessThan(plafond * 1.06);
      }
    }
  });

  it("descend plus bas sur le front que sur la nuque", () => {
    /**
     * ⚠️ **Ce qui sépare une casquette d'une calotte.** Le tour a d'abord été refermé par
     * une corde bombée, symétrique : elle creusait au milieu et **remontait** vers
     * l'arrière, si bien que la visière, qui suit cette ligne, ressortait de sous le tissu
     * en coin par-dessus l'œil. Une vraie casquette plonge continûment vers l'avant. On
     * éprouve donc que le tissu descend franchement plus bas du côté de la visière.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const calotte = pointsDuChemin(cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE).calotte);
      const cote = CASQUETTE_REFERENCE.cote;
      const bas = (signe: number) => Math.max(
        ...calotte.filter(p => Math.sign(p.x) === signe).map(p => p.y));
      const hauteur = Math.max(...calotte.map(p => p.y)) - Math.min(...calotte.map(p => p.y));
      // Un dixième de la hauteur du tissu : en deçà, la plongée ne se verrait pas.
      expect(bas(cote) - bas(-cote)).toBeGreaterThan(hauteur * 0.1);
    }
  });

  it("garde la visière accrochée sous la calotte", () => {
    /**
     * ⚠️ Signalé par la mesure avant de l'être à l'œil : une visière dont la longueur se
     * comptait sur la tête entière partait d'une calotte étroite pour s'avancer très
     * loin, et se lisait comme une planche posée à côté du chapeau. Sa racine doit
     * disparaître **sous** le tissu — c'est ce qui fait le raccord, puisqu'on ne dessine
     * aucune couture — et son bec dépasser de la tête, faute de quoi elle se confondrait
     * avec elle et il ne resterait rien à voir.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const pieces = cheminsCasquette(s, RAYON, CASQUETTE_REFERENCE);
      const calotte = pointsDuChemin(pieces.calotte);
      const visiere = pointsDuChemin(pieces.visiere);
      const contour = contourSilhouette(s, RAYON, 720);

      const couverts = visiere.filter(p => dedans(p, calotte)).length;
      expect(couverts).toBeGreaterThan(visiere.length * 0.1);
      expect(couverts).toBeLessThan(visiere.length * 0.9);

      const dehors = visiere.filter(p => !dedans(p, contour) && !dedans(p, calotte));
      expect(dehors.length).toBeGreaterThan(0);
    }
  });
});

describe("le second ton", () => {
  it("s'écarte toujours assez du premier pour se voir", () => {
    /**
     * ⚠️ **Aux deux extrêmes, un seul sens marche.** Éclaircir marche sur un bleu nuit et
     * ne marche pas sur du blanc ; assombrir, l'inverse. La visière doit se détacher de la
     * calotte quel que soit le choix, y compris si l'on tombe sur du noir ou du blanc.
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
       * moins de place vers le haut — à 133 pour le blanc. On garde 45, assez pour ne
       * jamais tolérer deux tons qui se confondent, assez lâche pour les teintes extrêmes.
       */
      expect(Math.abs(lire(t) - lire(c))).toBeGreaterThan(45);
    }
  });
});
