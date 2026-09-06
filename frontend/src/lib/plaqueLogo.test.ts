import { describe, it, expect } from "vitest";
import { couleurActif } from "./tileStyle";
import {
  ECART_MIN, PASTILLE_CLAIRE, PASTILLE_SOMBRE,
  filtreDuDessin, fondPastille, margeDuDessin, retenirPlaque, retenirTeinte,
} from "./couleursLogos";
import { ecartPercu, rvbVersHex } from "./couleur";
import type { RVB } from "./couleur";

const NOIR: RVB = [10, 10, 10];
const BLANC: RVB = [250, 250, 250];
const GRIS: RVB = [128, 128, 128];
import { BRAND_COLORS } from "./assets";

/**
 * ⚠️ **Ces cas viennent de logos réellement mesurés, pas d'exemples inventés.** Plaques et
 * dominantes ont été relevées sur les fichiers servis par Parqet en 256 × 256, par
 * `scripts/audit-teintes.cjs`.
 *
 * ⚠️ **L'invariant le plus important est le dernier, et il m'a fait revenir en arrière.** J'avais
 * mis la plaque du logo devant la table, sur la foi de deux cartes fausses. L'audit du catalogue
 * a montré que vingt-cinq actifs partagent le logo de leur émetteur : la plaque en tête, les sept
 * ETF sectoriels SPDR devenaient le même bleu et les douze iShares le même cyan. On remplaçait
 * quelques couleurs fausses par une famille entière d'indistinguables.
 */
describe("couleurActif : d'où vient la couleur d'une carte", () => {
  it("un ticker retiré de la table prend la plaque de son logo", () => {
    // `JPM` a été retiré : sa plaque est brune, la table lui donnait un bleu invisible sur le logo.
    expect(BRAND_COLORS.JPM).toBeUndefined();
    retenirPlaque("JPM", "#965d3d");
    const brun = couleurActif("JPM");
    // La teinte doit rester dans les bruns et oranges, pas virer au bleu.
    const [r, , b] = [1, 3, 5].map(i => parseInt(brun.slice(i, i + 2), 16));
    expect(r).toBeGreaterThan(b);
  });

  it("une plaque blanche ou noire est refusée : la table garde la main", () => {
    retenirPlaque("MSFT", null);          // plaque blanche, mesurée
    retenirTeinte("MSFT", "#72b200");     // le vert d'un des quatre carrés
    expect(BRAND_COLORS.MSFT).toBeTruthy();
    // Le vert de la dominante ne doit pas l'emporter sur le bleu de la table.
    expect(couleurActif("MSFT")).not.toBe(couleurActif("ZZINCONNU", { extraite: "#72b200" }));
  });

  it("un actif hors table sans plaque retombe sur la dominante de son dessin", () => {
    retenirPlaque("ETZ.PA", null);
    retenirTeinte("ETZ.PA", "#007b46");
    expect(couleurActif("ETZ.PA")).toBe(couleurActif("ETZ.PA", { extraite: "#007b46" }));
  });

  it("ESE.PA et ETZ.PA, même logo et hors table, rendent la même couleur", () => {
    expect(BRAND_COLORS["ESE.PA"]).toBeUndefined();
    retenirPlaque("ESE.PA", null); retenirTeinte("ESE.PA", "#007b46");
    retenirPlaque("ETZ.PA", null); retenirTeinte("ETZ.PA", "#007b46");
    expect(couleurActif("ESE.PA")).toBe(couleurActif("ETZ.PA"));
  });

  it("les ETF au logo d'émetteur commun restent distincts", () => {
    // Les sept SPDR partagent une plaque bleue ; c'est la table qui les sépare.
    const plaqueCommune = "#142bf5";
    const famille = ["SPY", "GLD", "XLE", "XLV", "XLF", "XLK", "XLI"];
    for (const t of famille) retenirPlaque(t, plaqueCommune);
    expect(new Set(famille.map(t => couleurActif(t))).size).toBe(famille.length);
  });
});

/**
 * ⚠️ **Le cas d'origine est `MCD`, signalé « coupé en bas » alors que rien ne l'était.** Le rendu
 * mesuré ne débordait pas et l'image source était entière ; le dessin touchait simplement les
 * quatre bords de sa toile, parce que FMP rogne au ras de l'encre — vingt-six logos détourés sur
 * vingt-huit dans la mesure. Un dessin qui touche le bord se lit comme un dessin coupé.
 */
describe("margeDuDessin : de l'air autour du dessin, mais pas autour d'une plaque", () => {
  const detoure  = { plaque: null, marque: GRIS, detoure: true, monochrome: true };
  const sombre   = { plaque: null, marque: NOIR, detoure: true, monochrome: true };
  const brune    = { plaque: "#965d3d", marque: BLANC, detoure: false, monochrome: false };
  /** `MSFT` : plaque **blanche**, donc opaque mais refusée comme couleur. Le piège. */
  const blanche  = { plaque: null, marque: GRIS, detoure: false, monochrome: true };
  /** `AAPL` : plaque **noire**, même piège, et une marque sombre par-dessus le marché. */
  const noire    = { plaque: null, marque: NOIR, detoure: false, monochrome: true };

  it("un logo détouré est écarté des bords", () => {
    expect(margeDuDessin(40, detoure)).toBeCloseTo(4);
  });

  it("une marque sombre sur pastille blanche est margée comme les autres", () => {
    // La pastille blanche est un badge : le dessin ne doit surtout pas en toucher le bord.
    expect(margeDuDessin(40, sombre)).toBeGreaterThan(0);
  });

  it("un logo à plaque remplit sa pastille, sinon la tuile apparaîtrait derrière", () => {
    expect(margeDuDessin(40, brune)).toBe(0);
  });

  /**
   * ⚠️ **L'invariant qui a manqué, et qui s'est vu à l'écran avant de se voir ici.** La marge
   * demandait « la plaque est-elle exploitable ? » là où il fallait « le logo est-il détouré ? ».
   * Ces deux plaques opaques rendent `plaque: null` — l'une est blanche, l'autre noire — et se
   * faisaient traiter en détourées : leur carré se mettait à flotter au milieu de la tuile.
   */
  it("une plaque opaque mais achromatique remplit quand même : ni MSFT ni AAPL ne flottent", () => {
    expect(margeDuDessin(40, blanche)).toBe(0);
    expect(margeDuDessin(40, noire)).toBe(0);
  });

  it("avant l'analyse, aucune marge : marger puis démarger ferait sauter les plaques", () => {
    expect(margeDuDessin(40, null)).toBe(0);
  });

  it("la marge suit la taille, pour que le rapport soit le même à toute échelle", () => {
    expect(margeDuDessin(64, detoure) / margeDuDessin(16, detoure)).toBeCloseTo(4);
  });
});

/**
 * ⚠️ **Ces cas viennent de mesures à l'écran sur les cent logos locaux, et de deux erreurs.**
 * La première règle posait un fond blanc sous les dessins de clarté inférieure à 110 — un seuil
 * **absolu**, qui suppose un fond sombre ; sur une carte de chaleur qui recolore ses tuiles du
 * vert vif au rouge vif, `WELL` y tombait à 1,01 de contraste, invisible. La seconde a remplacé
 * ce seuil par le **rapport de contraste** contre la tuile réelle : correct pour du texte, faux
 * pour un logo, parce qu'il ignore la teinte — il réclamait une pastille pour **72 des 99**, dont
 * `NVDA`. Seul l'**écart perçu** classe comme l'œil.
 */
describe("fondPastille : une pastille seulement quand elle répare quelque chose", () => {
  const VERT_VIF = "#00D492";   // la tuile d'une forte hausse
  const ARDOISE  = "#3d4757";   // la tuile d'une variation nulle

  /** Une marque **polychrome** par défaut : c'est le cas où la pastille est la seule issue. */
  const marque = (rvb: RVB) => ({ plaque: null, marque: rvb, detoure: true, monochrome: false });

  it("un dessin qui tranche déjà sur sa tuile reste nu", () => {
    // Marque noire sur tuile vert vif : l'écart perçu y est largement au-dessus du seuil.
    expect(fondPastille(marque(NOIR), VERT_VIF)).toBe("transparent");
  });

  it("un dessin qui se confond avec sa tuile reçoit une pastille", () => {
    // Le cas `MRK`, `ORCL`, `MS` : une marque ardoise sur une tuile ardoise.
    expect(fondPastille(marque([61, 71, 87]), ARDOISE)).not.toBe("transparent");
  });

  /**
   * ⚠️ **Le cas qui a fait abandonner le rapport de contraste.** L'œil vert de `NVDA` sur sa tuile
   * mauve n'y valait que 2,12 et se voyait poser une pastille sombre inutile — vu à l'écran. Les
   * deux couleurs ont des clartés voisines mais des teintes opposées : c'est exactement l'angle
   * mort d'une mesure qui n'examine que la luminance.
   */
  it("une marque de clarté voisine mais de teinte opposée reste nue", () => {
    expect(fondPastille(marque([118, 185, 0]), "#a66a72")).toBe("transparent");
  });

  /**
   * ⚠️ **Le cas que « blanc par défaut » ratait : une marque blanche sur une pastille blanche ne
   * se voit pas.** Dix-sept des cent logos sont quasi blancs après détourage — `AMZN`, `BRK-B`,
   * `V`, `IBM`. La pastille n'est donc pas « blanche quand c'est sombre » mais **la plus éloignée
   * des deux**, ce qui est la même règle vue correctement.
   */
  it("une marque quasi blanche qui a besoin d'une pastille la reçoit sombre", () => {
    expect(fondPastille(marque([245, 245, 245]), "#F2F4F6")).toBe(PASTILLE_SOMBRE);
  });

  it("une marque sombre invisible sur sa tuile obtient une pastille claire", () => {
    expect(fondPastille(marque([12, 14, 20]), "#101820")).toBe(PASTILLE_CLAIRE);
  });

  it("la pastille choisie tient toujours le seuil qu'on lui demande", () => {
    for (const c of [[245, 245, 245], [12, 14, 20], [90, 100, 110], [128, 128, 128]] as RVB[]) {
      const f = fondPastille(marque(c), ARDOISE);
      if (f === "transparent") continue;
      expect(ecartPercu(rvbVersHex(c), f)).toBeGreaterThanOrEqual(ECART_MIN);
    }
  });

  /**
   * ⚠️ **Le seuil absolu de clarté a été retiré, et `PYPL` est le cas qui l'a condamné.** Le bleu
   * moyen de PayPal — (26, 83, 149) — a une luma de 73, donc « sombre » : il recevait un carré
   * blanc sur la fiche d'actif. Or il mesure **ΔE 43,3** contre le fond de l'application, près du
   * double du seuil. Sans fond transmis on suppose désormais la surface sombre du thème, et c'est
   * la même règle que partout ailleurs.
   */
  it("sans fond connu, on suppose la surface sombre et on applique la même règle", () => {
    expect(fondPastille(marque([26, 83, 149]), null)).toBe("transparent");   // PYPL
    expect(fondPastille(marque(BLANC), null)).toBe("transparent");
    expect(fondPastille(marque([14, 20, 34]), null)).toBe(PASTILLE_CLAIRE);  // vraiment confondu
  });

  it("un logo à plaque ne reçoit jamais de pastille : il porte la sienne", () => {
    expect(fondPastille({ plaque: "#965d3d", marque: BLANC, detoure: false, monochrome: false }, VERT_VIF))
      .toBe("transparent");
  });

  it("avant l'analyse, rien — poser un fond par défaut ferait clignoter la pastille", () => {
    expect(fondPastille(null, VERT_VIF)).toBe("transparent");
  });
});

/**
 * ⚠️ **Le défaut signalé : « Apple, il y a toujours un fond blanc, pas juste le logo ».** La pomme
 * détourée est un aplat noir de saturation **0,000** ; sur la fiche d'actif — bleu nuit — elle
 * disparaissait nue, et recevait donc une plaque blanche. Mais un dessin sans couleur ne perd
 * rien à changer de ton : le blanc sur fond sombre est la variante que ces marques publient.
 * Mesuré sur les cent logos : 21 monochromes, dont **6 sombres** — `AAPL GS INTC MS PLTR SYK`.
 */
describe("filtreDuDessin : recolorer un monochrome plutot que lui glisser une plaque", () => {
  const NUIT = "#0B1220";
  const mono = (rvb: RVB) => ({ plaque: null, marque: rvb, detoure: true, monochrome: true });
  const poly = (rvb: RVB) => ({ plaque: null, marque: rvb, detoure: true, monochrome: false });

  it("la pomme noire sur fond sombre passe au blanc, et sans pastille", () => {
    expect(filtreDuDessin(mono(NOIR), NUIT)).toBe("brightness(0) invert(1)");
    expect(fondPastille(mono(NOIR), NUIT)).toBe("transparent");
  });

  it("sans fond connu, on suppose sombre — c'est le cas de toutes les autres surfaces", () => {
    expect(filtreDuDessin(mono(NOIR), null)).toBe("brightness(0) invert(1)");
    expect(fondPastille(mono(NOIR), null)).toBe("transparent");
  });

  it("un monochrome clair sur une surface claire passe au noir, pas au blanc", () => {
    expect(filtreDuDessin(mono(BLANC), "#F2F4F6")).toBe("brightness(0)");
  });

  it("un monochrome qui se voit deja n'est pas touche", () => {
    expect(filtreDuDessin(mono(BLANC), NUIT)).toBe("none");
    expect(filtreDuDessin(mono(NOIR), "#F2F4F6")).toBe("none");
  });

  /** ⚠️ L'invariant qui empeche la regle de deborder : recolorer un logo de marque le denature. */
  it("un dessin polychrome n'est jamais recolore, meme invisible", () => {
    expect(filtreDuDessin(poly([12, 14, 20]), NUIT)).toBe("none");
    expect(fondPastille(poly([12, 14, 20]), NUIT)).not.toBe("transparent");
  });

  it("un logo a plaque n'est jamais recolore non plus", () => {
    expect(filtreDuDessin({ plaque: "#965d3d", marque: NOIR, detoure: false, monochrome: true }, NUIT))
      .toBe("none");
  });

  it("avant l'analyse, aucun filtre", () => {
    expect(filtreDuDessin(null, NUIT)).toBe("none");
  });
});
