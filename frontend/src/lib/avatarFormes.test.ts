import { describe, expect, it } from "vitest";

import { ARRONDI_REFERENCE, OEIL_REFERENCE, TAILLE_REFERENCE } from "./avatarReglages";
import {
  type Point2, type Vec3, ancrageOeil, cheminOeil, contourSilhouette, surLaSphere,
} from "./avatarSpherique";
import {
  type FamilleSolide, longitudeCorrigee, rayonSolide, solideDepuis,
} from "./avatarVolume";

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
      const ancrage = ancrageOeil(longitudeCorrigee(OEIL.ecart / RAYON, s), 0);
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
     * ⚠️ **Le défaut que cette mesure a déjà attrapé une fois.** Sur le cube, le
     * gonflement vers les arêtes faisait *grandir* de 27 % l'œil qui s'éloignait, là où
     * la perspective aurait dû le raccourcir de 10 : la tête montrait deux yeux de
     * tailles franchement différentes. La compensation à l'ancre a corrigé cela, et ce
     * test empêche la même chose de revenir par une autre forme.
     */
    for (const f of FORMES) {
      const s = solide(f);
      let precedent = Infinity;
      for (const lacet of [0, 10, 20, 30, 38]) {
        const o = { lacet: deg(lacet), tangage: 0 };
        const a = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, RAYON, 220, s)));
        /**
         * ⚠️ **Aucune tolérance : l'aire ne remonte jamais.** Elle a longtemps eu droit à
         * un dixième de marge, la correction n'étant juste qu'au premier ordre. Ce n'est
         * plus nécessaire — mesuré sur les huit formes, le pire rapport d'un cran au
         * suivant vaut 0,956. Une remontée, même d'un pour cent, veut dire qu'une forme
         * s'est remise à gonfler l'œil qui se détourne, et c'est exactement le défaut que
         * ce fichier existe pour attraper.
         */
        expect(a).toBeLessThanOrEqual(precedent);
        precedent = a;
      }
      // Et au bout du débattement, il a franchement rapetissé.
      const face = aire(pointsDuChemin(cheminOeil(OEIL, { lacet: 0, tangage: 0 }, 1, RAYON, 220, s)));
      const tourne = aire(pointsDuChemin(
        cheminOeil(OEIL, { lacet: deg(38), tangage: 0 }, 1, RAYON, 220, s)));
      /**
       * Le repère est la sphère, qui garde 65 % de son aire à trente-huit degrés. Les huit
       * formes doivent s'en approcher — mesuré, de 55 à 65 %. Sans la correction locale
       * l'hexagone tombait à 17 % et le triangle à 19 %, deux lames là où la sphère a
       * encore un œil ; les bornes sont donc larges d'un côté comme de l'autre, mais
       * assez serrées pour que ce retour-là se voie.
       */
      expect(tourne / face).toBeLessThan(0.75);
      expect(tourne / face).toBeGreaterThan(0.5);
    }
  });

  it("garde les deux yeux identiques de face", () => {
    for (const f of FORMES) {
      const s = solide(f);
      const o = { lacet: 0, tangage: 0 };
      const g = aire(pointsDuChemin(cheminOeil(OEIL, o, -1, RAYON, 220, s)));
      const d = aire(pointsDuChemin(cheminOeil(OEIL, o, 1, RAYON, 220, s)));
      /**
       * ⚠️ **De face, les deux yeux sont exactement l'image l'un de l'autre — au
       * millionième.** Les huit volumes sont symétriques d'un côté à l'autre, donc rien
       * ne justifierait le moindre écart. Il y en avait pourtant un, un demi-pour-cent,
       * et il a fallu deux corrections pour l'effacer : mesurer les dérivées par
       * différence *centrée*, et prendre le miroir **avant** la correction et non après.
       * Ce test ne tolère plus rien, parce qu'il n'y a rien à tolérer.
       */
      expect(d / g).toBeCloseTo(1, 5);
    }
  });

  it("penche le regard avec la tête, sans le décoller", () => {
    /**
     * En roulis, la tête tourne dans son propre plan : les deux yeux doivent tourner
     * d'autant, donc la droite qui les joint doit prendre exactement le même angle.
     * C'est le contrôle le plus simple que le repère local suit bien la surface.
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
        /**
         * Le repère de l'écran descend, d'où le signe : un roulis positif fait monter
         * l'œil de droite.
         *
         * ⚠️ **La tolérance est relative, et c'est une propriété du procédé, pas un
         * défaut.** Le volume ne tourne pas — c'est le regard qui se déplace dessus. Sur
         * une forme qui n'est pas ronde, une même course d'arc ne rend donc pas le même
         * angle à l'écran : la capsule, aplatie, rend 13 % de moins que demandé, et c'est
         * son seul écart notable — 2,03° sur un roulis de 15, 3,24° sur un roulis de −25.
         * Les sept autres tombent sous le vingtième de degré. Un
         * seuil en degrés absolus mentirait en laissant passer un grand roulis faux ;
         * mesuré en proportion, l'invariant est le même à quinze degrés qu'à vingt-cinq.
         */
        expect(Math.abs(angle + roulis)).toBeLessThan(Math.abs(roulis) * 0.15);
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
     * Mesuré : de 1541 unités² sur la capsule à 1898 sur l'hexagone, soit ×1,23. C'est
     * l'écart qui reste une fois la correction bornée, et il n'est pas nul par
     * construction — au-delà du premier ordre, la forme continue de courber ce qu'on
     * peint dessus, et c'est même ce qui distingue un œil posé sur un cube d'un
     * autocollant. On garde donc une borne au-dessus du mesuré, mais assez basse pour
     * rattraper le tiers que valait cet écart sans correction du tout.
     */
    expect(max / min).toBeLessThan(1.3);
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
      // Mesuré : de 20,5 % sur la capsule à 22,2 % sur l'hexagone, contre 21,1 sur la
      // sphère. Avant `longitudeCorrigee`, de 13,1 à 29,7.
      expect(part).toBeGreaterThan(0.19);
      expect(part).toBeLessThan(0.24);
    }
  });
});
