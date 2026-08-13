import { describe, expect, it } from "vitest";

import {
  COULEURS_AVATAR, COULEUR_PAR_DEFAUT, bordCarte, contrasteDuRegard,
  couleurDesYeux, encre, encrePleine, estCouleurValide,
} from "./avatarCouleur";
import { clartePercue, contraste, luminance, rvbVersTsl, hexVersRvb } from "./couleur";

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

describe("l'encre d'une carte teintée du portefeuille", () => {
  /**
   * ⚠️ **Une carte au fond libre est une promesse de contraste, et elle doit être tenue.**
   * L'aide à la décision porte désormais **exactement** la couleur de l'avatar : ce n'est
   * plus un fond réglé une fois par le thème mais onze fonds possibles, plus tout choix
   * libre au champ de couleur. Chaque niveau de texte doit donc rester lisible sur
   * n'importe lequel — c'est le genre de garantie qu'on croit acquise et qui se perd en
   * silence au premier ajout de couleur à la palette.
   */
  const NIVEAUX = [1, 0.88, 0.78, 0.74, 0.72];

  it("garde tous les niveaux de texte au-dessus de trois pour un", () => {
    /**
     * Mesuré sur les onze couleurs proposées : de 3,33 sur l'ardoise — un gris moyen, le
     * fond le plus ingrat, puisque ni le noir ni le blanc n'y portent loin — à 15,8 sur
     * l'encre. Trois pour un est le seuil des grands caractères ; les mentions faibles
     * du panneau sont à 10,5 pixels, donc on vise plus haut qu'il n'est exigé.
     */
    for (const c of COULEURS_AVATAR) {
      for (const part of NIVEAUX) {
        expect(contraste(c.hex, encre(c.hex, part))).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it("choisit l'encre en comparant le noir et le blanc, sans seuil", () => {
    /**
     * ⚠️ **Un seuil de luminance posé à la main s'est trompé, et le test le garde.** À
     * 0,34, le corail partait vers le blanc — 3,67 pour un — alors que le noir y donne
     * 5,8 : sa luminance le classait « sombre » quand sa clarté perçue en fait un fond
     * moyen. Avec deux candidats seulement, la comparaison directe est exacte ; aucun
     * seuil ne peut faire mieux, et tout seuil peut se tromper.
     */
    for (const c of COULEURS_AVATAR) {
      const choisie = encrePleine(c.hex);
      const autre = choisie === "#000000" ? "#FFFFFF" : "#000000";
      expect(contraste(c.hex, choisie)).toBeGreaterThanOrEqual(contraste(c.hex, autre));
    }
  });

});

describe("les deux anneaux d'une carte teintée", () => {
  it("détache son liseré autant que les cartes du thème, à l'œil", () => {
    /**
     * ⚠️ **La grandeur est l'écart de clarté perçue, pas le rapport de contraste — et je
     * m'étais trompé de grandeur.** Le liseré avait d'abord été calé sur le *rapport* du
     * thème sombre, 1,135 pour un. Résultat sur la carte teintée : un rapport de 1,181,
     * donc supérieur à la référence, pour un bord **invisible**. La formule du contraste
     * est très sensible près du noir et très plate ailleurs ; le même rapport vaut six
     * points de clarté sur un fond quasi noir et quatre sur un bleu moyen. Signalé à
     * l'usage — « je te parle des bords ».
     *
     * `L*` est perceptuellement uniforme : un même écart s'y voit pareil partout. Les
     * thèmes en posent 6,3 et 8,4 ; la carte teintée vise sept, et l'atteint sur les onze
     * couleurs sans jamais le dépasser franchement.
     */
    for (const c of COULEURS_AVATAR) {
      const ecart = Math.abs(clartePercue(bordCarte(c.hex)) - clartePercue(c.hex));
      expect(ecart).toBeGreaterThanOrEqual(6.3);
      expect(ecart).toBeLessThan(9);
    }
  });

});
