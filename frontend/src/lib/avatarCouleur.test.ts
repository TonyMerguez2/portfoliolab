import { describe, expect, it } from "vitest";

import {
  COULEURS_AVATAR, COULEUR_PAR_DEFAUT, contrasteDuRegard, couleurDesYeux,
  estCouleurValide,
} from "./avatarCouleur";
import { rvbVersTsl, hexVersRvb } from "./couleur";

/**
 * Le regard reste-t-il visible, quelle que soit la couleur choisie ?
 *
 * ⚠️ **C'est la seule question qui compte ici, et elle se mesure.** Laisser l'utilisateur
 * poser librement la tête *et* les yeux, c'est lui laisser poser un bleu sombre sur un
 * bleu sombre — l'avatar n'a alors plus de regard, et rien dans l'interface ne le lui
 * dirait. Déduire les yeux de la tête transforme cette liberté en garantie, à condition
 * de la vérifier sur tout le cercle chromatique et pas seulement sur les douze pastilles
 * qu'on propose.
 */

const clarte = (hex: string) => rvbVersTsl(hexVersRvb(hex))[2];

describe("couleurDesYeux", () => {
  it("garde un regard lisible sur les douze couleurs proposées", () => {
    for (const c of COULEURS_AVATAR) {
      expect({ [c.nom]: contrasteDuRegard(c.hex) > 3 })
        .toEqual({ [c.nom]: true });
    }
  });

  it("garde un regard lisible sur tout le cercle chromatique", () => {
    // ⚠️ Les pastilles ne suffisent pas : le champ libre laisse poser n'importe quoi.
    // On balaie donc les teintes, les saturations et les clartés utiles.
    const fautes: string[] = [];
    for (let h = 0; h < 360; h += 15) {
      for (const s of [0.15, 0.5, 0.85]) {
        for (const l of [0.12, 0.3, 0.5, 0.7, 0.88]) {
          const hex = hexDepuisTsl(h / 360, s, l);
          if (contrasteDuRegard(hex) <= 2.6) {
            fautes.push(`${hex} (${contrasteDuRegard(hex).toFixed(2)})`);
          }
        }
      }
    }
    expect(fautes.slice(0, 6)).toEqual([]);
  });

  it("fait des yeux plus sombres que la tête, tant que c'est possible", () => {
    /**
     * ⚠️ **Les yeux sont des trous, pas des pupilles.** Un œil clair sur une tête
     * sombre se lit comme un regard lumineux — c'est un autre personnage. On ne
     * bascule sur du clair que lorsque aucun noir ne se détacherait plus.
     */
    for (const c of COULEURS_AVATAR) {
      const tete = clarte(c.hex);
      // En dessous d'environ 0,36 de clarté, aucun œil sombre n'atteint un contraste
      // suffisant : c'est arithmétique, pas un réglage.
      if (tete < 0.4) continue;
      expect({ [c.nom]: clarte(couleurDesYeux(c.hex)) < tete })
        .toEqual({ [c.nom]: true });
    }
  });

  it("éclaircit le regard quand la tête est déjà très sombre", () => {
    // Sur une tête presque noire, assombrir encore ne détacherait plus rien.
    const tresSombre = "#14161F";
    expect(clarte(couleurDesYeux(tresSombre))).toBeGreaterThan(clarte(tresSombre));
    expect(contrasteDuRegard(tresSombre)).toBeGreaterThan(3);
  });

  it("garde la teinte de la tête, mais retient la saturation", () => {
    // ⚠️ Un noir pur fait un trou mort ; le même noir teinté s'intègre. Mais à pleine
    // saturation, un « noir » violet reste violet.
    const [teinteTete] = rvbVersTsl(hexVersRvb("#8B5CF6"));
    const [teinteYeux, saturationYeux] = rvbVersTsl(hexVersRvb(couleurDesYeux("#8B5CF6")));
    expect(teinteYeux).toBeCloseTo(teinteTete, 2);
    // Le plafond est à 0,45, mais un aller-retour par l'hexadécimal quantifie sur huit
    // bits : la valeur relue dépasse d'un cheveu. On vérifie l'intention, pas l'arrondi.
    expect(saturationYeux).toBeLessThanOrEqual(0.5);
  });

  it("rend toujours une couleur bien formée", () => {
    for (let h = 0; h < 360; h += 7) {
      expect(couleurDesYeux(hexDepuisTsl(h / 360, 0.7, 0.5))).toMatch(/^#[0-9A-Fa-f]{6}$/);
    }
  });
});

describe("estCouleurValide", () => {
  it("n'accepte qu'un hexadécimal à six chiffres", () => {
    // Ce qui sort du stockage local n'est pas forcément ce qu'on y a mis : une version
    // précédente, une main humaine, un autre onglet.
    expect(estCouleurValide(COULEUR_PAR_DEFAUT)).toBe(true);
    expect(estCouleurValide("#abcdef")).toBe(true);
    for (const v of [null, undefined, 42, "", "rouge", "#fff", "#12345", "#1234567", {}]) {
      expect({ [String(v)]: estCouleurValide(v) }).toEqual({ [String(v)]: false });
    }
  });
});

/** Une couleur depuis teinte, saturation, clarté — pour balayer l'espace. */
function hexDepuisTsl(h: number, s: number, l: number): string {
  const f = (n: number) => {
    const k = (n + h * 12) % 12;
    const a = s * Math.min(l, 1 - l);
    const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(v * 255).toString(16).padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}
