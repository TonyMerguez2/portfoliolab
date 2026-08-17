import { describe, it, expect } from "vitest";
import {
  hexVersRvb, rvbVersHex, rvbVersTsl, tslVersRvb, pourFondSombre, poidsGroupe,
  CLARTE_MIN, CLARTE_MAX, SATURATION_MIN, luminance, contraste, encreSur,
  decalerClarte, assombrirPourBlanc,
} from "./couleur";

describe("conversions", () => {
  it("hex et rvb font l'aller-retour", () => {
    expect(rvbVersHex(hexVersRvb("#5B8DEF"))).toBe("#5b8def");
  });

  it("tolère l'absence de dièse et la casse", () => {
    expect(hexVersRvb("5b8def")).toEqual([91, 141, 239]);
    expect(hexVersRvb("#5B8DEF")).toEqual([91, 141, 239]);
  });

  it("retombe sur le bleu par défaut si la chaîne est illisible", () => {
    expect(hexVersRvb("pas une couleur")).toEqual([91, 141, 239]);
  });

  it("tsl et rvb font l'aller-retour", () => {
    for (const hex of ["#5b8def", "#e31937", "#76b900", "#70c7ba", "#404040"]) {
      const rvb = hexVersRvb(hex);
      const retour = tslVersRvb(rvbVersTsl(rvb)).map(Math.round);
      expect(retour).toEqual(rvb);
    }
  });

  it("le blanc et le noir n'ont pas de teinte", () => {
    expect(rvbVersTsl([255, 255, 255])[1]).toBe(0);
    expect(rvbVersTsl([0, 0, 0])[1]).toBe(0);
  });
});

describe("pourFondSombre", () => {
  const tsl = (hex: string) => rvbVersTsl(hexVersRvb(hex));

  it("éclaircit une couleur trop sombre", () => {
    // Le brun du pelage de WIF : lisible sur blanc, invisible sur noir.
    const avant = tsl("#4a3220");
    const apres = tsl(pourFondSombre("#4a3220"));
    expect(avant[2]).toBeLessThan(CLARTE_MIN);
    expect(apres[2]).toBeGreaterThanOrEqual(CLARTE_MIN - 1e-6);
  });

  it("assombrit une couleur trop claire", () => {
    const apres = tsl(pourFondSombre("#fff3d0"));
    expect(apres[2]).toBeLessThanOrEqual(CLARTE_MAX + 1e-6);
  });

  it("ne touche pas à la teinte", () => {
    // Mesuré en degrés : l'aller-retour par des entiers 8 bits en déplace une
    // fraction, et un demi-degré ne se voit pas. Exprimer la tolérance en tours
    // la rendait illisible.
    const degres = (t: number) => t * 360;
    for (const hex of ["#4a3220", "#70c7ba", "#e31937", "#fff3d0"]) {
      const ecart = Math.abs(degres(tsl(pourFondSombre(hex))[0]) - degres(tsl(hex)[0]));
      expect(ecart).toBeLessThan(1);
    }
  });

  it("relève une couleur délavée mais colorée", () => {
    // #6b7f9a est un bleu éteint — saturation 0,18, au-dessus du seuil de gris.
    const apres = tsl(pourFondSombre("#6b7f9a"));
    expect(apres[1]).toBeGreaterThanOrEqual(SATURATION_MIN - 1e-6);
  });

  it("un quasi-gris reste sous le seuil et n'est pas coloré", () => {
    // #8a8f96 n'a que 5 % de saturation : le saturer inventerait un bleu.
    expect(tsl("#8a8f96")[1]).toBeLessThan(0.08);
    expect(tsl(pourFondSombre("#8a8f96"))[1]).toBeLessThan(0.08);
  });

  it("laisse un gris gris", () => {
    /**
     * Saturer un gris lui donnerait une teinte tirée du bruit de l'image :
     * deux logos gris deviendraient l'un rouge, l'autre vert, sans raison.
     */
    const apres = tsl(pourFondSombre("#7a7a7a"));
    expect(apres[1]).toBeLessThan(0.08);
  });

  it("laisse intacte une couleur déjà dans les bornes", () => {
    const dedans = "#5b8def";
    const [h, s, l] = tsl(dedans);
    expect(l).toBeGreaterThan(CLARTE_MIN);
    expect(l).toBeLessThan(CLARTE_MAX);
    const apres = tsl(pourFondSombre(dedans));
    expect(apres[0]).toBeCloseTo(h, 5);
    expect(apres[1]).toBeCloseTo(s, 2);
  });

  it("rend toute couleur lisible sur fond sombre", () => {
    for (const hex of ["#000000", "#0a0a0a", "#4a3220", "#1b2a1b", "#ffffff"]) {
      expect(rvbVersTsl(hexVersRvb(pourFondSombre(hex)))[2]).toBeGreaterThanOrEqual(CLARTE_MIN - 1e-6);
    }
  });
});

describe("poidsGroupe", () => {
  it("une plage vive l'emporte sur une plage terne un peu plus grande", () => {
    // Le pelage brun couvre plus de pixels que la casquette rose, mais c'est
    // la casquette que l'œil retient.
    const pelage    = poidsGroupe(400, 0.20);
    const casquette = poidsGroupe(300, 0.85);
    expect(casquette).toBeGreaterThan(pelage);
  });

  it("à saturation égale, le nombre départage", () => {
    expect(poidsGroupe(500, 0.5)).toBeGreaterThan(poidsGroupe(300, 0.5));
  });

  it("une plage bien plus grande l'emporte malgré une saturation moindre", () => {
    // La pondération corrige un biais, elle ne doit pas l'inverser.
    expect(poidsGroupe(5000, 0.20)).toBeGreaterThan(poidsGroupe(300, 0.95));
  });
});

describe("contraste et encre", () => {
  it("la luminance pondère les canaux selon l'œil", () => {
    // Le vert pèse près de dix fois le bleu. Un modèle qui les traiterait à
    // égalité — la clarté TSL, par exemple — inverserait ces deux-là.
    expect(luminance("#00FF00")).toBeGreaterThan(luminance("#0000FF"));
    expect(luminance("#FFFFFF")).toBeCloseTo(1, 5);
    expect(luminance("#000000")).toBeCloseTo(0, 5);
  });

  it("le contraste va de 1 à 21 et se lit dans les deux sens", () => {
    expect(contraste("#000000", "#FFFFFF")).toBeCloseTo(21, 1);
    expect(contraste("#123456", "#123456")).toBeCloseTo(1, 5);
    expect(contraste("#2177D1", "#FFFFFF")).toBeCloseTo(contraste("#FFFFFF", "#2177D1"), 10);
  });

  it("choisit l'encre lisible, y compris là où l'intuition se trompe", () => {
    // Le jaune est la contre-épreuve : vif, donc perçu comme « fort », mais sa
    // luminance est presque celle du blanc. Il réclame du noir.
    expect(encreSur("#FFE500")).toBe("#0B1220");
    expect(encreSur("#0B1220")).toBe("#FFFFFF");
    expect(encreSur("#6366F1")).toBe("#FFFFFF");
  });

  it("l'encre retenue ne descend jamais sous 4,3:1", () => {
    // 4,33 est le pire cas réel, relevé en balayant tout le cube sRGB : il
    // tombe sur les verts moyens, vers #4B8746. Aucune encre unie ne fait
    // mieux sur un fond de luminance médiane — c'est une propriété de la
    // couleur, pas un défaut. Assez pour du texte large (seuil AA à 3:1),
    // insuffisant pour du texte courant, d'où la mise en garde sur `encreSur`.
    const couleurs = ["#6366F1", "#FFE500", "#00D492", "#EA0B27", "#2177D1",
                      "#808080", "#FFFFFF", "#000000", "#FF8904", "#7A5C3E",
                      "#4B8746"];
    for (const c of couleurs) {
      expect(contraste(c, encreSur(c))).toBeGreaterThanOrEqual(4.3);
    }
  });

  it("le pire cas connu reste au-dessus du seuil du texte large", () => {
    expect(contraste("#4B8746", encreSur("#4B8746"))).toBeGreaterThanOrEqual(3);
  });
});

describe("decalerClarte", () => {
  it("éclaircit et assombrit dans le sens attendu", () => {
    const base = "#4aa8f0";
    expect(luminance(decalerClarte(base, 0.12))).toBeGreaterThan(luminance(base));
    expect(luminance(decalerClarte(base, -0.12))).toBeLessThan(luminance(base));
  });

  it("garde la teinte", () => {
    const [teinte] = rvbVersTsl(hexVersRvb("#4aa8f0"));
    for (const d of [-0.1, -0.05, 0.05, 0.1]) {
      const [apres] = rvbVersTsl(hexVersRvb(decalerClarte("#4aa8f0", d)));
      expect(apres).toBeCloseTo(teinte, 2);
    }
  });

  it("borne aux extrêmes plutôt que de déborder", () => {
    expect(decalerClarte("#ffffff", 0.5)).toBe("#ffffff");
    expect(decalerClarte("#000000", -0.5)).toBe("#000000");
  });

  it("un décalage nul ne change rien", () => {
    expect(decalerClarte("#4aa8f0", 0)).toBe("#4aa8f0");
  });
});

describe("assombrirPourBlanc", () => {
  /**
   * ⚠️ **La promesse tient sur tout le cube, pas sur trois exemples.** Le pire cas de
   * `encreSur` — 4,33:1 sur les verts moyens — n'a été trouvé qu'en balayant toutes les
   * couleurs ; se contenter d'un jaune et d'un bleu ici laisserait passer la même
   * famille de fonds médians, qui est exactement celle qui pose problème.
   */
  it("rend un fond qui porte du blanc, quelle que soit la couleur de départ", () => {
    for (let r = 0; r < 256; r += 17) {
      for (let v = 0; v < 256; v += 17) {
        for (let b = 0; b < 256; b += 17) {
          const depart = rvbVersHex([r, v, b]);
          expect(contraste(assombrirPourBlanc(depart), "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
  });

  it("ne touche pas une couleur déjà assez sombre", () => {
    // Le bleu marine de l'avatar par défaut porte déjà du blanc : rien à corriger.
    const marine = "#24446F";
    expect(contraste(marine, "#FFFFFF")).toBeGreaterThanOrEqual(4.5);
    expect(assombrirPourBlanc(marine)).toBe(marine);
  });

  /**
   * ⚠️ **Ce test-là vient d'un défaut vu à l'écran, pas d'une exigence théorique.**
   * Un balayage par pas de un centième satisfaisait le contraste mais dépassait la
   * cible : sur l'indigo d'un avatar, il rendait 4,71 au lieu de 4,50 et s'éloignait
   * de ΔE 3,59 — assez pour qu'on remarque que le bouton n'a « pas exactement » la
   * couleur choisie. Atteindre le seuil ne suffit donc pas : il faut l'atteindre en
   * bougeant le moins possible.
   */
  it("s'arrête au seuil au lieu de le dépasser", () => {
    for (const depart of ["#6366F1", "#4B8746", "#0EA5E9", "#A0A0C8"]) {
      // ⚠️ Ces quatre-là sont trop clairs au départ : ce sont eux que la fonction doit
      // corriger, et donc les seuls sur qui la minimalité veut dire quelque chose. Une
      // couleur déjà lisible — #E11D48 est à 4,70 — est rendue telle quelle, et lui
      // demander de descendre sous 4,57 reviendrait à exiger qu'on l'abîme.
      expect(contraste(depart, "#FFFFFF")).toBeLessThan(4.5);

      const c = contraste(assombrirPourBlanc(depart), "#FFFFFF");
      expect(c).toBeGreaterThanOrEqual(4.5);
      /**
       * ⚠️ La borne vient d'un balayage, pas d'un chiffre rond. Le dépassement maximal
       * mesuré vaut 4,563 — sur #A0A0C8 — soit 1,4 % au-dessus de la cible. Ce reliquat
       * est celui de la quantification sur huit bits, pas de la recherche : la clarté
       * exacte est trouvée, c'est l'hexadécimal qui ne sait pas la dire. À comparer aux
       * 4,71 du balayage par pas de un centième, qui était, lui, évitable.
       */
      expect(c).toBeLessThan(4.57);
    }
  });

  it("rend intacte une couleur déjà lisible plutôt que de la corriger", () => {
    // ⚠️ Le pendant du test précédent : ne rien faire est parfois la bonne réponse.
    expect(assombrirPourBlanc("#E11D48")).toBe("#E11D48");
  });

  it("garde la teinte en descendant la clarté", () => {
    // ⚠️ Un jaune vif doit rester jaune : c'est la couleur choisie par l'épargnant, et
    // seule sa profondeur change. La teinte est conservée à un degré près.
    const [teinteAvant] = rvbVersTsl(hexVersRvb("#FFD400"));
    const [teinteApres] = rvbVersTsl(hexVersRvb(assombrirPourBlanc("#FFD400")));
    expect(Math.abs(teinteApres - teinteAvant)).toBeLessThan(1 / 360);
  });
});
