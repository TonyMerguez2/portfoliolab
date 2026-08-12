import { describe, expect, it } from "vitest";

import { PRESETS, SKINS, skinParCle } from "./avatarSkins";
import {
  RAYON_TETE, type Vec3, carreauCube, cheminSurLaTete, cheminsSurLaTete,
  grandCercle, ruban,
} from "./avatarSpherique";

/**
 * Les habillages tiennent-ils sur la sphère ?
 *
 * ⚠️ Mêmes invariants que pour les yeux, et pour la même raison : un motif qui déborde
 * de la silhouette, se replie sur lui-même ou couvre tout le disque ne se voit qu'à
 * certaines orientations, celles qu'on ne pense pas à essayer. Le balayage remplace
 * l'œil, et il a déjà rattrapé trois pannes que le rendu de face ne montrait pas.
 */

const deg = (d: number) => (d * Math.PI) / 180;
const norme = (v: Vec3) => Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
const DISQUE = Math.PI * RAYON_TETE * RAYON_TETE;

function pointsDuChemin(d: string) {
  const nombres = d.match(/-?\d+(\.\d+)?/g) ?? [];
  const points: { x: number; y: number }[] = [];
  for (let i = 0; i + 1 < nombres.length; i += 2) {
    points.push({ x: Number(nombres[i]), y: Number(nombres[i + 1]) });
  }
  return points;
}

/** L'aire d'un `d` fait d'un ou plusieurs sous-tracés. */
function aire(d: string): number {
  let total = 0;
  for (const bout of d.split("M").slice(1)) {
    const p = pointsDuChemin(bout);
    let somme = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      somme += p[i].x * q.y - q.x * p[i].y;
    }
    total += Math.abs(somme / 2);
  }
  return total;
}

describe("grandCercle", () => {
  it("trace un tour complet sur la sphère, perpendiculaire à son axe", () => {
    for (const axe of [{ x: 0, y: 1, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0.4, y: 0.6, z: -0.7 }]) {
      const c = grandCercle(axe, 64);
      const n = norme(axe);
      for (const p of c) {
        expect(norme(p)).toBeCloseTo(1, 10);
        // Perpendiculaire à l'axe : c'est ce qui en fait un *grand* cercle, celui qui
        // fait le tour entier plutôt qu'un petit parallèle.
        expect((p.x * axe.x + p.y * axe.y + p.z * axe.z) / n).toBeCloseTo(0, 10);
      }
    }
  });
});

describe("ruban", () => {
  const cercle = grandCercle({ x: 0, y: 1, z: 0 }, 96);

  it("garde une largeur constante d'un bout à l'autre", () => {
    /**
     * ⚠️ **La propriété qui a motivé le ruban.** Les coutures étaient d'abord des
     * fuseaux : un fuseau se pince jusqu'à disparaître à ses deux pôles, si bien que
     * les coutures du basket s'évanouissaient en haut et en bas de la tête. Un ruban
     * mesure la même largeur partout, comme une vraie couture.
     */
    const largeur = 0.05;
    const troncons = ruban(cercle, largeur, 8);
    let mini = Infinity, maxi = -Infinity;
    for (const t of troncons) {
      const moitie = (t.length - 1) / 2;
      for (let i = 0; i < moitie; i++) {
        const haut = t[i];
        const bas = t[t.length - 1 - i];
        const angle = Math.acos(Math.min(1, Math.max(-1,
          haut.x * bas.x + haut.y * bas.y + haut.z * bas.z)));
        mini = Math.min(mini, angle); maxi = Math.max(maxi, angle);
      }
    }
    expect(mini).toBeCloseTo(2 * largeur, 3);
    expect(maxi).toBeCloseTo(2 * largeur, 3);
  });

  it("pose tous ses sommets sur la sphère", () => {
    for (const t of ruban(cercle, 0.04, 8)) {
      for (const p of t) expect(norme(p)).toBeCloseTo(1, 9);
    }
  });

  it("se découpe en tronçons qui se tiennent par les arêtes", () => {
    // ⚠️ Un ruban qui fait le tour est un anneau : sans découpe, il n'a pas de contour
    // fermé simple et la coupe de l'hémisphère ne sait pas le traiter. Les tronçons
    // doivent donc se recouvrir exactement d'une arête pour ne pas laisser de trou.
    const troncons = ruban(cercle, 0.04, 8);
    expect(troncons.length).toBeGreaterThan(4);
    for (let i = 0; i < troncons.length; i++) {
      const fin = troncons[i][Math.floor((troncons[i].length - 1) / 2)];
      const debutSuivant = troncons[(i + 1) % troncons.length][0];
      expect(Math.abs(fin.x - debutSuivant.x)
        + Math.abs(fin.y - debutSuivant.y)
        + Math.abs(fin.z - debutSuivant.z)).toBeLessThan(1e-9);
    }
  });
});

describe("carreauCube", () => {
  it("pose ses sommets sur la sphère", () => {
    for (const p of carreauCube(2, 1, -1, -1 / 3, -1, 1)) {
      expect(norme(p)).toBeCloseTo(1, 10);
    }
  });

  it("reste du côté de sa face", () => {
    // Le carreau de la face +z ne doit jamais franchir l'équateur du cube.
    for (const p of carreauCube(2, 1, -1, 1, -1, 1)) {
      expect(p.z).toBeGreaterThan(0);
      expect(p.z).toBeGreaterThanOrEqual(Math.abs(p.x) - 1e-9);
      expect(p.z).toBeGreaterThanOrEqual(Math.abs(p.y) - 1e-9);
    }
  });
});

describe("skins", () => {
  it("propose l'uni, le basket, le volley et le tennis", () => {
    expect(SKINS.map(s => s.cle)).toEqual(["uni", "basket", "volley", "tennis"]);
  });

  it("retombe sur l'uni pour une clé inconnue, au lieu de lever", () => {
    expect(skinParCle("n'existe pas").cle).toBe("uni");
  });

  it("laisse la tête nue pour l'uni", () => {
    expect(skinParCle("uni").motifs(skinParCle("uni").palette)).toEqual([]);
  });

  it("donne au volley dix-huit lames, six faces de trois", () => {
    const skin = skinParCle("volley");
    const m = skin.motifs(skin.palette);
    let lames = 0;
    for (const motif of m) lames += motif.morceaux.length;
    expect(lames).toBe(18);
    // Trois teintes, une par paire de faces opposées.
    expect(m.length).toBe(3);
  });

  it("pave la sphère entière en volley, sans trou ni recouvrement", () => {
    /**
     * ⚠️ **L'exigence explicite : le motif doit couvrir toute la sphère.** Les aires
     * visibles des dix-huit lames totalisent le disque à chaque orientation ; moins
     * voudrait dire un trou par lequel le fond apparaît, plus voudrait dire deux lames
     * qui se marchent dessus. C'est le même chiffre qui a dénoncé, sur la version
     * précédente, un panneau qui se refermait du mauvais côté.
     */
    const skin = skinParCle("volley");
    const motifs = skin.motifs(skin.palette);
    for (let lacet = -55; lacet <= 55; lacet += 5) {
      for (let tangage = -42; tangage <= 42; tangage += 6) {
        let total = 0;
        for (const m of motifs) {
          total += aire(cheminsSurLaTete(
            m.morceaux, { lacet: deg(lacet), tangage: deg(tangage) }));
        }
        expect({ [`${lacet}/${tangage}`]: Math.abs(total / DISQUE - 1) < 0.015 })
          .toEqual({ [`${lacet}/${tangage}`]: true });
      }
    }
  });

  it("garde les coutures fines, à toutes les orientations", () => {
    /**
     * ⚠️ **Le test qui a manqué le plus longtemps.** Une couture qui se referme du
     * mauvais côté reste *dans* la tête — donc le contrôle de débordement la laisse
     * passer — mais elle peint tout le disque. Mesuré avant correction : 99,9 % à
     * −1°/−10°, c'est-à-dire en plein dans la zone que le suivi de la souris balaie
     * en permanence, et sur un motif clair par-dessus le fond.
     */
    for (const cle of ["basket", "tennis"]) {
      const skin = skinParCle(cle);
      const motifs = skin.motifs(skin.palette);
      let pire = { part: 0, ou: "" };
      for (let lacet = -55; lacet <= 55; lacet += 5) {
        for (let tangage = -42; tangage <= 42; tangage += 3) {
          for (const m of motifs) {
            const part = aire(cheminsSurLaTete(
              m.morceaux, { lacet: deg(lacet), tangage: deg(tangage) })) / DISQUE;
            if (part > pire.part) pire = { part, ou: `${lacet}°/${tangage}°` };
          }
        }
      }
      expect({ [cle]: pire.part < 0.3, ou: pire.ou }).toEqual({ [cle]: true, ou: pire.ou });
    }
  });

  it("ne laisse aucun motif sortir de la tête, sur toute la plage de rotation", () => {
    const fautes: string[] = [];
    for (const skin of SKINS) {
      for (const motif of skin.motifs(skin.palette)) {
        for (let lacet = -55; lacet <= 55; lacet += 11) {
          for (let tangage = -42; tangage <= 42; tangage += 14) {
            for (const morceau of motif.morceaux) {
              const pts = pointsDuChemin(cheminSurLaTete(
                morceau, { lacet: deg(lacet), tangage: deg(tangage) }));
              for (const p of pts) {
                const r = Math.sqrt(p.x * p.x + p.y * p.y);
                if (r > RAYON_TETE + 0.01) {
                  fautes.push(`${skin.cle} ${lacet}°/${tangage}° → ${r.toFixed(2)}`);
                }
              }
            }
          }
        }
      }
    }
    expect(fautes.slice(0, 5)).toEqual([]);
  });

  it("garde chaque habillage visible quelle que soit l'orientation", () => {
    // Un motif qui disparaîtrait à certains angles trahirait une coupe trop gourmande —
    // l'inverse du débordement, et tout aussi silencieux.
    for (const skin of SKINS) {
      const motifs = skin.motifs(skin.palette);
      if (motifs.length === 0) continue;
      for (const lacet of [-55, -20, 0, 20, 55]) {
        for (const tangage of [-42, 0, 42]) {
          let dessine = 0;
          for (const m of motifs) {
            if (cheminsSurLaTete(m.morceaux,
              { lacet: deg(lacet), tangage: deg(tangage) }).length > 0) dessine++;
          }
          expect({ [`${skin.cle} ${lacet}/${tangage}`]: dessine > 0 })
            .toEqual({ [`${skin.cle} ${lacet}/${tangage}`]: true });
        }
      }
    }
  });
});

describe("palettes toutes faites", () => {
  it("propose des couleurs lisibles et bien formées", () => {
    expect(PRESETS.length).toBeGreaterThanOrEqual(4);
    for (const p of PRESETS) {
      expect(p.tete).toMatch(/^#[0-9A-Fa-f]{6}$/);
      expect(p.accent).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });

  it("ne touche pas à la couleur des yeux", () => {
    // Les yeux sont des trous : une teinte vive en ferait des pupilles peintes, donc
    // un autre personnage plutôt qu'un autre coloris.
    for (const p of PRESETS) expect("yeux" in p).toBe(false);
  });
});
