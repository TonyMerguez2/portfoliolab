import { describe, expect, it } from "vitest";

import {
  DEBORD_PLAGE, FONDS_CARTE, MOTIFS_PUCE, REPERE_PUCE, fondPour, motifPour,
} from "./pucesCarte";

/**
 * Les sommets d'une plage, retrouvés dans son tracé.
 *
 * ⚠️ **Les points de contrôle des quadratiques *sont* les sommets du polygone.** C'est
 * `polygoneArrondi` qui le garantit : chaque angle s'écrit `Q sommet arrivée`. On peut donc
 * relire la forme sans interpréter les courbes, et raisonner sur le polygone d'avant
 * l'arrondi — qui est celui qu'on a voulu.
 */
function sommets(d: string): [number, number][] {
  return Array.from(d.matchAll(/Q(-?[\d.]+) (-?[\d.]+)/g))
    .map(m => [Number(m[1]), Number(m[2])] as [number, number]);
}

/** Un point est-il dans le polygone ? Lancer de rayon, la méthode habituelle. */
function dedans(p: [number, number], poly: [number, number][]): boolean {
  let dans = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i];
    const [xj, yj] = poly[j];
    if ((yi > p[1]) !== (yj > p[1])
      && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) dans = !dans;
  }
  return dans;
}

describe("les puces", () => {
  /* ⚠️ Six et non huit : le quatrième et le sixième dessins de la planche ont été écartés à
     l'usage. Le nombre est vérifié quand même — une disparition accidentelle passerait
     autrement inaperçue, `motifPour` s'adaptant tout seul au modulo. */
  it("en compte bien six, et aucune sans plage", () => {
    expect(MOTIFS_PUCE).toHaveLength(6);
    for (const m of MOTIFS_PUCE) expect(m.plages.length).toBeGreaterThan(0);
  });

  /**
   * ⚠️ **Le risque propre au dessin en tuiles.** Un sillon tracé au pinceau ne pouvait pas
   * laisser de trou : il partait d'un bord et arrivait à l'autre. Des tuiles posées côte à
   * côte, si — une borne mal recopiée suffit à laisser une bande de substrat traverser la
   * puce. Et cela ne se voit qu'à l'écran, sur un seul des huit dessins, si l'on pense à les
   * regarder tous.
   *
   * ⚠️ **On tolère les sillons, et rien qu'eux.** Un point du repère est acceptable s'il est
   * couvert par une tuile, par un disque, ou s'il se trouve à moins d'un sillon et demi d'une
   * tuile — c'est-à-dire dans une rainure légitime. Ailleurs, c'est un trou.
   */
  it("ne laisse aucun trou de substrat au milieu d'une plage", () => {
    const PAS = 0.5;
    const SILLON_MAX = 1.8;
    MOTIFS_PUCE.forEach((m, n) => {
      const polys = m.plages.map(sommets);
      const trous: string[] = [];
      for (let x = 2; x < REPERE_PUCE.largeur - 2; x += PAS) {
        for (let y = 2; y < REPERE_PUCE.hauteur - 2; y += PAS) {
          const p: [number, number] = [x, y];
          if (polys.some(poly => dedans(p, poly))) continue;
          if (m.disques?.some(c => Math.hypot(x - c.cx, y - c.cy) <= c.r)) continue;
          /**
           * Pas couvert : reste à savoir si l'on est dans un sillon. On l'admet si une tuile
           * passe à portée.
           *
           * ⚠️ **Les huit directions, et pas seulement les quatre droites.** Au croisement de
           * deux sillons — le flanc du cadre coupé par une horizontale, sur le second dessin
           * — les quatre voisins orthogonaux tombent tous dans l'une ou l'autre rainure, et le
           * point passait pour un trou. Ce sont les diagonales qui trouvent la tuile.
           */
          const c = SILLON_MAX / Math.SQRT2;
          const aPortee = polys.some(poly =>
            dedans([x - SILLON_MAX, y], poly) || dedans([x + SILLON_MAX, y], poly)
            || dedans([x, y - SILLON_MAX], poly) || dedans([x, y + SILLON_MAX], poly)
            || dedans([x - c, y - c], poly) || dedans([x + c, y - c], poly)
            || dedans([x - c, y + c], poly) || dedans([x + c, y + c], poly));
          if (!aPortee) trous.push(`(${x}, ${y})`);
        }
      }
      expect(trous.slice(0, 6), `motif ${n + 1}`).toEqual([]);
    });
  });

  /**
   * ⚠️ **Le débord est volontaire et borné.** Les tuiles du pourtour sortent de la boîte pour
   * que la découpe leur donne le rayon du contour ; mais une borne fausse les enverrait au
   * loin sans qu'aucun rendu ne le trahisse, la découpe masquant tout.
   */
  it("garde ses sommets dans le repère débordé", () => {
    const marge = DEBORD_PLAGE + 0.1;
    MOTIFS_PUCE.forEach((m, n) => {
      for (const d of m.plages) {
        for (const [x, y] of sommets(d)) {
          expect(x, `motif ${n + 1}`).toBeGreaterThanOrEqual(-marge);
          expect(x, `motif ${n + 1}`).toBeLessThanOrEqual(REPERE_PUCE.largeur + marge);
          expect(y, `motif ${n + 1}`).toBeGreaterThanOrEqual(-marge);
          expect(y, `motif ${n + 1}`).toBeLessThanOrEqual(REPERE_PUCE.hauteur + marge);
        }
      }
    });
  });

  /** Deux dessins identiques seraient une faute de copie, pas une variante. */
  it("propose des dessins tous distincts", () => {
    const empreintes = MOTIFS_PUCE.map(m =>
      [...m.plages, ...(m.entailles ?? []), JSON.stringify(m.disques ?? [])].join("|"));
    expect(new Set(empreintes).size).toBe(MOTIFS_PUCE.length);
  });
});

describe("l'attribution d'une puce", () => {
  it("rend toujours un rang existant", () => {
    for (const cle of ["", "a", "PEA Bourso", "42", "x".repeat(500)]) {
      const n = motifPour(cle);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(MOTIFS_PUCE.length);
    }
  });

  /**
   * ⚠️ **Le point de toute la fonction.** Un `Math.random()` aurait regravé la carte à chaque
   * rendu — en changeant d'onglet, en survolant un dossier, au rechargement. « Au hasard »
   * veut dire imprévisible, pas instable.
   */
  it("rend toujours le même dessin pour la même clé", () => {
    for (const cle of ["17", "PEA Bourso", "Livret A"]) {
      expect(motifPour(cle)).toBe(motifPour(cle));
    }
  });

  /**
   * ⚠️ **Des noms de comptes se ressemblent beaucoup**, et c'est le cas défavorable : ils
   * partagent leur début, leur longueur, parfois les deux. Une fonction qui ne regarderait
   * que le premier caractère ou la longueur donnerait la même puce à tous les PEA.
   */
  it("sépare des clés voisines", () => {
    const voisines = ["PEA Bourso", "PEA Trade Republic", "PEA Fortuneo", "PEA Degiro"];
    expect(new Set(voisines.map(motifPour)).size).toBeGreaterThan(1);

    const suite = Array.from({ length: 40 }, (_, i) => String(i + 1));
    expect(new Set(suite.map(motifPour)).size).toBe(MOTIFS_PUCE.length);
  });
});

/**
 * ⚠️ **Ce qu'on grave sur une carte est un *couple*, jamais une puce ni un fond seuls.**
 * Deux tirages irréprochables pris séparément peuvent s'accorder mal : c'est arrivé en
 * passant les fonds de cinq à trois. Trois divise six, et sur une clé d'un seul caractère les
 * deux sommes valent chacune « une constante plus le code du caractère » — donc affines en un
 * même nombre. `% 3` est alors une fonction de `% 6` : la puce déterminait entièrement le
 * fond, six couples au lieu de dix-huit, et rien dans les tests d'alors ne s'en plaignait.
 *
 * ⚠️ **Les deux propriétés ci-dessous ne se déduisent pas l'une de l'autre**, et c'est
 * pourquoi il en faut deux. Un tirage peut couvrir toutes les combinaisons tout en posant
 * deux cartes jumelles côte à côte (mesuré : c'est ce que faisait une passe d'avalanche, sur
 * les comptes 3 et 4). Un autre peut ne jamais répéter deux voisines tout en n'explorant
 * qu'un tiers des couples. La première se voit à l'écran, la seconde à l'usage.
 */
describe("le couple puce × fond", () => {
  const carte = (n: number) => {
    const cle = String(n);
    return `${motifPour(cle)}-${fondPour(cle)}`;
  };

  it("rend toujours un fond existant, et le même pour la même clé", () => {
    for (const cle of ["", "a", "PEA Bourso", "42", "x".repeat(500)]) {
      const n = fondPour(cle);
      expect(Number.isInteger(n)).toBe(true);
      expect(n).toBeGreaterThanOrEqual(0);
      expect(n).toBeLessThan(FONDS_CARTE);
      expect(fondPour(cle)).toBe(n);
    }
  });

  /**
   * ⚠️ **Les identifiants se suivent, et les dossiers aussi.** Les comptes s'affichent dans
   * l'ordre où ils ont été créés : deux cartes identiques ne resteront pas cachées au fond du
   * jeu, elles seront voisines à l'écran. C'est le seul défaut de tirage qui se voie vraiment.
   */
  it("ne pose jamais deux cartes identiques côte à côte", () => {
    const jumelles: string[] = [];
    for (let n = 2; n <= 60; n++) {
      if (carte(n) === carte(n - 1)) jumelles.push(`${n - 1} et ${n}`);
    }
    expect(jumelles).toEqual([]);
  });

  /** ⚠️ Toutes les combinaisons doivent servir, sans quoi des dessins sont morts-nés. */
  it("finit par montrer les dix-huit combinaisons", () => {
    const vues = new Set(Array.from({ length: 200 }, (_, i) => carte(i + 1)));
    expect(vues.size).toBe(MOTIFS_PUCE.length * FONDS_CARTE);
  });
});
