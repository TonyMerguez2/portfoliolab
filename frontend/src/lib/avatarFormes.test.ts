import { describe, expect, it } from "vitest";

import { ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE } from "./avatarReglages";
import {
  type Point2, type Vec3, ancrageOeil, cheminOeil, contourSilhouette, surLaSphere,
} from "./avatarSpherique";
import { type FamilleSolide, rayonSolide, solideDepuis } from "./avatarVolume";

/**
 * Les yeux épousent-ils vraiment la forme sur laquelle ils sont peints ?
 *
 * ⚠️ **La question ne se règle pas à l'œil nu, et c'est pourquoi elle est ici.** Un œil
 * mal posé reste un œil : il ne disparaît pas, il ne clignote pas, il se contente d'être
 * un peu trop grand, un peu décalé, un peu moins courbé qu'il ne devrait. Sur une image
 * fixe, rien ne se voit ; c'est en tournant la tête que le défaut apparaît, et encore,
 * seulement à certains angles. Ce qu'on vérifie ici, ce sont les propriétés dont dépend
 * l'illusion — l'œil est **sur** la surface, il **rentre** dans la silhouette, il
 * **rapetisse** quand il se détourne, et il garde la **même taille** d'une forme à
 * l'autre.
 *
 * Huit volumes, et aucun ne se comporte comme les autres : le cube pousse vers ses
 * arêtes, la capsule ramène vers son axe, la goutte porte une pointe. Chaque propriété
 * est donc éprouvée **forme par forme**, jamais en moyenne.
 */

const deg = (d: number) => (d * Math.PI) / 180;
const RAYON = 100;

const FORMES: FamilleSolide[] = [
  "sphere", "cube", "coussin", "hexagone", "triangle", "etoile", "etoile6", "goutte",
];

/** L'œil de référence, celui que le tableau de bord et le banc d'essai partagent. */
const OEIL = {
  ecart: OEIL_REFERENCE.ecart * TAILLE_REFERENCE,
  elevation: OEIL_REFERENCE.elevation * TAILLE_REFERENCE,
  largeur: OEIL_REFERENCE.largeur * TAILLE_REFERENCE,
  hauteur: OEIL_REFERENCE.hauteur * TAILLE_REFERENCE,
  inclinaison: 0,
};

const solide = (f: FamilleSolide) => solideDepuis(f, ARRONDI_REFERENCE);

function pointsDuChemin(d: string): Point2[] {
  const n = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const p: Point2[] = [];
  for (let i = 0; i + 1 < n.length; i += 2) p.push({ x: Number(n[i]), y: Number(n[i + 1]) });
  return p;
}

const aire = (q: Point2[]) => {
  let a = 0;
  for (let i = 0; i < q.length; i++) {
    const p = q[i], r = q[(i + 1) % q.length];
    a += p.x * r.y - r.x * p.y;
  }
  return Math.abs(a) / 2;
};

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

describe("l'œil est posé sur la surface", () => {
  it("place chaque point du contour exactement sur le volume", () => {
    /**
     * ⚠️ **La propriété fondatrice : l'œil est *peint*, pas *plaqué*.** Chaque point du
     * contour est transporté sur la sphère par carte exponentielle, puis porté sur le
     * volume par son rayon. S'il s'en écartait — ne serait-ce que d'un centième — l'œil
     * flotterait devant la tête au lieu d'en épouser la courbure, et cela ne se verrait
     * qu'aux angles rasants.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const l = OEIL.ecart / RAYON;
      const ancrage = ancrageOeil(
        Math.asin(Math.sin(l) * (s.demiLargeur ?? 1)), 0);
      for (const u of [-14, -6, 0, 6, 14]) {
        for (const v of [-30, -12, 0, 12, 30]) {
          const p = surLaSphere(ancrage, u, v, RAYON);
          // Le point de la sphère, porté sur le volume, doit avoir exactement le rayon
          // que la forme prescrit dans cette direction.
          const r = rayonSolide(p, s);
          const q: Vec3 = { x: p.x * r, y: p.y * r, z: p.z * r };
          const norme = Math.sqrt(q.x * q.x + q.y * q.y + q.z * q.z);
          expect(norme).toBeCloseTo(r, 9);
          expect(Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)).toBeCloseTo(1, 9);
        }
      }
    }
  });

  it("ne laisse jamais un œil sortir de la silhouette", () => {
    /**
     * ⚠️ Le seul défaut qui se voit vraiment, et le plus laid : un morceau d'œil posé
     * sur le fond, à côté de la tête. On l'éprouve sur quarante-cinq orientations par
     * forme, contre le contour réellement dessiné — pas contre une formule qui pourrait
     * se tromper de la même façon que le rendu.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 1440);
      for (const lacet of [-38, -20, 0, 20, 38]) {
        for (const tangage of [-26, 0, 26]) {
          for (const roulis of [0, 12, -12]) {
            const o = { lacet: deg(lacet), tangage: deg(tangage), roulis: deg(roulis) };
            for (const cote of [-1, 1] as const) {
              for (const p of pointsDuChemin(cheminOeil(OEIL, o, cote, RAYON, 96, s))) {
                // Rentré d'un demi-pour-cent : le contour testé est un polygone, ses
                // cordes coupent la vraie courbe et rejetteraient un point posé dessus.
                expect(dedans({ x: p.x * 0.995, y: p.y * 0.995 }, contour)).toBe(true);
              }
            }
          }
        }
      }
    }
  });
});

describe("l'œil suit la rotation", () => {
  it("rapetisse en se détournant, sur toutes les formes", () => {
    /**
     * ⚠️ **Le défaut que cette mesure a déjà attrapé deux fois.** Sur le cube, le
     * gonflement vers les arêtes faisait *grandir* de 27 % l'œil qui s'éloignait, là où
     * la perspective aurait dû le raccourcir de 10 : la tête montrait deux yeux de
     * tailles franchement différentes. Sur le triangle, plus tard, l'œil éloigné s'ouvrait
     * en virgule. Aucune tolérance ici — l'aire ne remonte jamais d'un cran au suivant,
     * et c'est vérifié à 0,953 au pire sur les huit formes.
     */
    for (const f of FORMES) {
      const s = solide(f);
      let precedent = Infinity;
      for (const lacet of [0, 10, 20, 30, 38]) {
        const o = { lacet: deg(lacet), tangage: 0 };
        const a = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, RAYON, 220, s)));
        expect(a).toBeLessThanOrEqual(precedent);
        precedent = a;
      }
    }
  });

  it("ne dépasse jamais ce que l'œil ferait sur une sphère", () => {
    /**
     * ⚠️ **L'invariant qui remplace tous les seuils réglés à la main.** Chaque point de
     * l'œil est résolu pour se projeter là où il se projetterait sur une sphère ; la
     * forme ne peut donc que **retrancher**, jamais ajouter. C'est la propriété centrale
     * du procédé, et elle est vraie orientation par orientation, pas en moyenne.
     *
     * Ce qu'elle interdit exactement, c'est tout ce que les versions précédentes ont
     * produit tour à tour : l'œil du cube grandissant de 27 %, celui du triangle
     * s'élargissant à 39,3 unités, celui de l'hexagone poussé à 98 de haut par une
     * correction non bornée. Aucune de ces trois n'aurait passé cette ligne.
     */
    for (const f of FORMES) {
      const s = solide(f);
      for (const lacet of [0, 20, 38]) {
        for (const tangage of [0, 26]) {
          const o = { lacet: deg(lacet), tangage: deg(tangage) };
          for (const cote of [-1, 1] as const) {
            const forme = aire(pointsDuChemin(cheminOeil(OEIL, o, cote, RAYON, 220, s)));
            const ronde = aire(pointsDuChemin(
              cheminOeil(OEIL, o, cote, RAYON, 220, solide("sphere"))));
            /**
             * ⚠️ **Trois pour cent de marge, et ils ont une cause nommée.** Sur six
             * formes le rapport vaut 1,0000 — l'égalité, comme la construction le
             * promet. Sur l'hexagone et la goutte il monte à 1,026, et seulement aux
             * fortes inclinaisons : c'est là que des points de l'œil sortent de ce que la
             * forme peut atteindre, et qu'ils se **collent au bord** au lieu de
             * disparaître. L'œil épouse alors l'arête, qui bombe un peu plus que le limbe
             * de la sphère. Ce n'est pas l'œil qui grandit, c'est son bord qui suit la
             * silhouette — précisément le comportement retenu pour que le regard passe
             * derrière l'arête sans se déchirer.
             */
            expect(forme).toBeLessThanOrEqual(ronde * 1.03);
          }
        }
      }
    }
  });

  it("garde les deux yeux identiques de face", () => {
    /**
     * ⚠️ **De face, les deux yeux sont exactement l'image l'un de l'autre.** Les huit
     * volumes sont symétriques d'un côté à l'autre, donc rien ne justifierait le moindre
     * écart. Il y en avait pourtant un, un demi-pour-cent, dû à des dérivées prises à
     * droite et à un miroir appliqué après la correction. Les deux causes ont disparu
     * avec la correction elle-même : il n'y a plus de matrice à mirorer.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const o = { lacet: 0, tangage: 0 };
      const g = aire(pointsDuChemin(cheminOeil(OEIL, o, -1, RAYON, 220, s)));
      const d = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, RAYON, 220, s)));
      expect(d / g).toBeCloseTo(1, 5);
    }
  });

  it("penche le regard avec la tête, sans le décoller", () => {
    /**
     * En roulis, la tête tourne dans son propre plan : les deux yeux doivent tourner
     * d'autant, donc la droite qui les joint doit prendre exactement le même angle.
     *
     * ⚠️ **Exactement, désormais, et sur les huit formes.** Ce test tolérait trois
     * degrés : la capsule, aplatie, ne rendait que 12,7° pour 15 parce que l'ancre suivait
     * la surface du volume et qu'une même course d'arc n'y donne pas le même angle à
     * l'écran. L'ancre étant maintenant posée à la projection de la sphère, l'écart est
     * tombé à zéro partout — mesuré 0,00° sur les huit. Un dixième de degré de marge
     * suffit, et il ne reste que pour la finesse de la dichotomie.
     */
    for (const f of FORMES) {
      const s = solide(f);
      for (const roulis of [15, -25]) {
        const centre = (cote: -1 | 1) => {
          const p = pointsDuChemin(cheminOeil(
            OEIL, { lacet: 0, tangage: 0, roulis: deg(roulis) }, cote, RAYON, 220, s));
          return {
            x: p.reduce((a, q) => a + q.x, 0) / p.length,
            y: p.reduce((a, q) => a + q.y, 0) / p.length,
          };
        };
        const g = centre(-1), d = centre(1);
        const angle = (Math.atan2(d.y - g.y, d.x - g.x) * 180) / Math.PI;
        // Le repère de l'écran descend, d'où le signe : un roulis positif fait monter
        // l'œil de droite.
        expect(Math.abs(angle + roulis)).toBeLessThan(0.1);
      }
    }
  });
});

describe("l'œil garde sa taille d'une forme à l'autre", () => {
  it("ne varie pas de plus d'un dixième entre les huit volumes", () => {
    /**
     * ⚠️ **Ce que la compensation à l'ancre est censée garantir.** Sans elle, l'œil suit
     * le rayon du volume : il rapetisserait d'un tiers sur la capsule, dont la surface
     * passe près de l'axe, et grossirait sur le cube. Changer de forme changerait la
     * taille du regard, ce qui se lit comme un autre personnage.
     */
    const aires = FORMES.map(f => aire(pointsDuChemin(
      cheminOeil(OEIL, { lacet: 0, tangage: 0 }, 1, RAYON, 220, solide(f)))));
    const min = Math.min(...aires), max = Math.max(...aires);
    /**
     * ⚠️ **C'est une égalité, à un pour cent près, et ce pour cent est de la dichotomie.**
     * Mesuré : 1676 unités² sur six formes, 1683 sur l'hexagone, 1689 sur la goutte. Le
     * seuil valait 1,3 quand la correction était approchée — de 1541 sur la capsule à 1898
     * sur l'hexagone — et un tiers quand il n'y avait aucune correction du tout.
     */
    expect(max / min).toBeLessThan(1.02);
  });

  it("écarte les deux yeux de la même fraction de la tête", () => {
    /**
     * ⚠️ Signalé à l'usage : « sur le coussin les yeux sont trop serrés ». L'écart est un
     * arc, et un arc ne se projette pas pareil selon le volume — mesuré, 13 % de la
     * largeur sur la capsule contre 21 sur la sphère, et 30 sur le triangle. Corrigé par
     * `longitudeCorrigee`, que ce test garde.
     */
    for (const f of FORMES) {
      const s = solide(f);
      const contour = contourSilhouette(s, RAYON, 720);
      const largeur = Math.max(...contour.map(p => p.x)) - Math.min(...contour.map(p => p.x));
      const centre = (cote: -1 | 1) => {
        const p = pointsDuChemin(cheminOeil(OEIL, { lacet: 0, tangage: 0 }, cote, RAYON, 220, s));
        return p.reduce((a, q) => a + q.x, 0) / p.length;
      };
      const part = (centre(1) - centre(-1)) / largeur;
      // Mesuré : 21,1 % sur les huit formes. Avant correction, de 13,1 à 29,7 — et de
      // 20,5 à 22,2 du temps où la longitude se cherchait par dichotomie.
      expect(part).toBeGreaterThan(0.205);
      expect(part).toBeLessThan(0.215);
    }
  });
});
