import { describe, expect, it } from "vitest";

import { HAUT_FOND, SKINS, TERRES, contourTerre, skinParCle } from "./avatarSkins";

/**
 * La Terre se lit-elle comme une planète ?
 *
 * ⚠️ **Ce fichier existe parce que la première version ne se lisait pas.** Les terres
 * étaient décrites par un rayon que des harmoniques cabossaient — élégant, dans l'esprit
 * du reste du module, et parfaitement illisible : on obtenait des amibes régulières,
 * jamais un continent. Ce qui fait lire une côte — un golfe profond, une pointe, une île
 * détachée juste à côté — ne s'écrit pas comme une somme de cosinus. Les terres sont
 * donc **composées**, sommet par sommet, et ce qui se mesure ici n'est plus la géométrie
 * d'une formule mais les propriétés d'un dessin : la part d'océan, le débordement du
 * cadre, la largeur du haut-fond, l'ordre des aplats.
 */

const RAYON = 100;

/** Le point est-il dans le polygone ? Parité des traversées. */
function dedans(x: number, y: number, contour: [number, number][]): boolean {
  let n = 0;
  for (let i = 0; i < contour.length; i++) {
    const [ax, ay] = contour[i], [bx, by] = contour[(i + 1) % contour.length];
    if ((ay > y) !== (by > y) && x < ax + ((y - ay) / (by - ay)) * (bx - ax)) n++;
  }
  return n % 2 === 1;
}

describe("le globe", () => {
  it("garde une part de terre qui laisse voir l'océan", () => {
    /**
     * ⚠️ **La mesure qui a rattrapé le défaut signalé.** Les terres couvraient d'abord
     * les sept dixièmes du disque : l'océan se réduisait à des chenaux, et l'image se
     * lisait comme un motif de camouflage plutôt que comme une planète. À l'autre bout,
     * quelques taches sur du bleu donneraient une bille. On échantillonne donc le disque
     * et l'on compte — mesuré, 42 % de terres, ce qui laisse l'eau majoritaire tout en
     * gardant des masses franches.
     */
    const contours = TERRES.map(t => contourTerre(t));
    let dansLeDisque = 0, surTerre = 0;
    for (let i = -RAYON; i <= RAYON; i += 2) {
      for (let j = -RAYON; j <= RAYON; j += 2) {
        if (i * i + j * j > RAYON * RAYON) continue;
        dansLeDisque++;
        if (contours.some(c => dedans(i, j, c))) surTerre++;
      }
    }
    const part = surTerre / dansLeDisque;
    expect(part).toBeGreaterThan(0.3);
    expect(part).toBeLessThan(0.55);
  });

  it("fait déborder les terres du cadre, sauf les îles", () => {
    /**
     * ⚠️ **C'est le débordement qui fait le globe.** Une carte dont toutes les terres
     * flottent à l'intérieur du disque se lit comme des taches posées dessus ; ce qui
     * donne le tour du monde, c'est que les continents *sortent* et sont tranchés par le
     * bord. Les îles, elles, doivent rester dedans — une île à moitié coupée n'est plus
     * une île, c'est un bout de continent.
     */
    let deborde = 0;
    for (const t of TERRES) {
      const contour = contourTerre(t);
      const loin = contour.filter(([x, y]) => Math.hypot(x, y) > RAYON).length;
      const dedansTout = contour.every(([x, y]) => Math.hypot(x, y) < RAYON - HAUT_FOND);
      // Chaque terre est franchement de l'un des deux genres, jamais à cheval : elle sort
      // pour de bon, ou elle tient tout entière au large du bord avec son haut-fond.
      expect(loin > 3 || dedansTout).toBe(true);
      if (loin > 3) deborde++;
    }
    expect(deborde).toBeGreaterThanOrEqual(4);
  });

  it("laisse partout la place du haut-fond entre deux terres", () => {
    /**
     * ⚠️ Le liseré clair est obtenu par un trait épaissi, donc il **grossit** chaque terre
     * vers l'extérieur. Deux côtes trop proches verraient leurs haut-fonds se souder, et
     * le bras de mer qui les sépare disparaîtrait sous une seule bande claire — on
     * perdrait la lecture de deux terres distinctes. On éprouve donc que deux terres sont
     * toujours séparées de plus de deux fois cette largeur.
     */
    const contours = TERRES.map(t => contourTerre(t));
    for (let a = 0; a < contours.length; a++) {
      for (let b = a + 1; b < contours.length; b++) {
        let plusProche = Infinity;
        for (const [x1, y1] of contours[a]) {
          for (const [x2, y2] of contours[b]) {
            plusProche = Math.min(plusProche, Math.hypot(x1 - x2, y1 - y2));
          }
        }
        expect(plusProche).toBeGreaterThan(HAUT_FOND * 2);
      }
    }
  });
});

describe("le skin", () => {
  it("est immobile : ses aplats ne dépendent que de la palette", () => {
    /**
     * ⚠️ **Toutes les décorations sont figées, et c'est une décision de cohérence.** Une
     * découpe peinte sur la sphère tourne juste ; la même transportée sur un triangle ou
     * une capsule s'y étire, parce que ces volumes ne se comportent pas comme une sphère
     * sous la rotation. Les autres formes recevront des habillages et devront y rester
     * fixes : faire tourner celui de la sphère seul aurait donné deux règles pour une même
     * famille de réglages. La signature le garantit — un aplat plat ne reçoit pas
     * d'orientation, donc il ne peut pas en dépendre — et ce test garde la Terre du côté
     * plat, là où une refonte pourrait la ramener sur la surface sans qu'on y pense.
     */
    const s = skinParCle("terre");
    expect(s.motifs(s.palette)).toEqual([]);
    expect(s.plats).toBeDefined();
    expect(s.plats!(s.palette).length).toBe(TERRES.length * 2);
  });

  it("peint les haut-fonds sous les terres, jamais l'inverse", () => {
    /**
     * L'ordre des aplats **est** le dessin : peints après les terres, les haut-fonds les
     * recouvriraient et il ne resterait que des anneaux clairs. Cet ordre ne se lit dans
     * aucune propriété du rendu, il ne tient qu'à la position dans le tableau — donc il se
     * garde ici. Le liseré se reconnaît à ce qu'il porte un trait, la terre à ce qu'elle
     * n'en porte pas.
     */
    const s = skinParCle("terre");
    const plats = s.plats!(s.palette);
    const moitie = plats.length / 2;
    for (let i = 0; i < moitie; i++) {
      expect(plats[i].epaisseur).toBe(HAUT_FOND * 2);
      expect(plats[i + moitie].epaisseur).toBeUndefined();
      // Les deux moitiés tracent la même côte : seule la peinture diffère.
      expect(plats[i].d).toBe(plats[i + moitie].d);
    }
  });

  it("se déclare réservé à la sphère, et reste le seul", () => {
    expect(skinParCle("terre").rond).toBe(true);
    expect(SKINS.filter(s => s.rond).map(s => s.cle)).toEqual(["terre"]);
  });
});
