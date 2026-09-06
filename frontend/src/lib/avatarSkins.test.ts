import { describe, expect, it } from "vitest";

import { DALLE_GAMEBOY, PRESETS, SKINS, skinParCle, skinPourForme } from "./avatarSkins";
import { FORMES_AVATAR } from "./useCouleurAvatar";
import { clartePercue, contraste, hexVersRvb } from "./couleur";
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

/**
 * Le plus bas relevé des yeux, sur cinquante images — clignements et regard compris.
 *
 * ⚠️ **Une mesure, pas une estimation.** La valeur vient d'un relevé de l'enveloppe des
 * yeux pendant l'animation : `x ∈ [−38,3 ; 31,3]`, `y ∈ [−35 ; 38,7]`. Elle est écrite ici
 * pour que le jour où quelqu'un rétrécit la dalle afin d'élargir la façade, le test
 * échoue avant que les yeux ne soient rognés à l'écran.
 */
const OEIL_LE_PLUS_BAS = 38.7;

/**
 * La coque et la dalle du Game Boy, retrouvées par leur géométrie et non par leur rang.
 *
 * ⚠️ **La dalle est l'aplat opaque dont le tracé est exactement la région découpée.** C'est
 * la seule caractérisation stable : elle survit à l'insertion d'une couche, alors qu'un
 * index se décale au premier ajout. La coque est le troisième aplat — la face, après le
 * rebord et la rainure.
 */
function couchesDuGameboy(tete = "#D9D3C9") {
  const skin = skinParCle("gameboy");
  const p = { ...skin.palette, tete };
  const plats = skin.plats!(p);
  const region = skin.decoupes!(p)[0].d;
  return {
    coque: plats[2].couleur!,
    dalle: plats.find(m => m.d === region && m.couleur)!.couleur!,
  };
}

describe("skins", () => {
  it("propose l'uni, les trois ballons, la Terre, l'astronaute, le chevalier, le classique et le Game Boy", () => {
    /* ⚠️ Plus de « terminal » : retiré à la demande. Un portefeuille qui l'avait enregistré
       retombe sur l'uni par `skinParCle`, sans lever. */
    expect(SKINS.map(s => s.cle))
      .toEqual(["uni", "basket", "volley", "tennis", "terre",
                "astronaute", "chevalier", "classique", "gameboy"]);
    expect(skinParCle("terminal").cle).toBe("uni");
  });

  /**
   * ⚠️ **Le classique est un appareil, comme le Game Boy : carré seulement.** Sa dalle a
   * ses propres retraits et sa propre forme, mais la même garde sous les yeux.
   */
  it("réserve le classique au carré et borne ses yeux à la dalle", () => {
    const s = skinParCle("classique");
    expect(skinPourForme(s, "carre")).toBe(true);
    expect(skinPourForme(s, "sphere")).toBe(false);
    expect(s.yeux!(s.palette).decoupe).toBe("dalle");
    // ⚠️ Les yeux s'allument depuis l'accent : sur le site, `yeux` est la couleur des trous
    // d'un visage uni, sombre — lue telle quelle, elle éteignait l'écran.
    const sombre = { ...s.palette, yeux: "#121214" };
    expect(s.yeux!(sombre).couleur).not.toBe("#121214");
    expect(s.yeux!(sombre).couleur).toBe(s.yeux!(s.palette).couleur);
    expect(s.decoupes!(s.palette).map(d => d.id)).toEqual(["dalle", "pomme"]);
    // Les six bandes de la pomme sont là, détourées par le fruit ; rien d'écrit sur la dalle.
    const plats = s.plats!(s.palette);
    expect(plats.filter(m => m.decoupe === "pomme")).toHaveLength(6);
    expect(plats.some(m => m.decoupe === "dalle" && m.couleur === s.palette.accent)).toBe(false);
  });

  /**
   * ⚠️ **Les appareils sont réservés au carré arrondi.** Un écran, une façade et des boutons
   * sont composés pour une surface à peu près carrée ; détourés par un triangle ou une
   * goutte, ils ne racontent plus l'objet. Les laisser partout produirait des images fausses
   * sur sept formes pour en servir une.
   */
  it("réserve le Game Boy et l'astronaute au carré arrondi", () => {
    expect(skinPourForme(skinParCle("gameboy"), "carre")).toBe(true);
    expect(skinPourForme(skinParCle("astronaute"), "carre")).toBe(true);
    for (const f of ["sphere", "coussin", "hexagone", "triangle", "etoile", "goutte"]) {
      expect(skinPourForme(skinParCle("astronaute"), f)).toBe(false);
      expect(skinPourForme(skinParCle("gameboy"), f)).toBe(false);
    }
    /**
     * ⚠️ **Le nom de la géométrie compte autant que celui des réglages.** Le carré
     * s'appelle `cube` côté solides, et le banc d'essai parle cette langue-là : sans la
     * table de synonymes, le skin y était introuvable — constaté à l'écran, aucun message.
     */
    expect(skinPourForme(skinParCle("gameboy"), "cube")).toBe(true);
  });

  /**
   * ⚠️ Les clés de forme ne sont pas vérifiées par le compilateur — voir la note sur
   * `Skin.formes`. Ce test tient ce rôle : une faute de frappe rendrait le skin
   * introuvable sur toutes les formes, sans qu'aucune erreur ne le signale.
   */
  it("ne nomme que des formes qui existent", () => {
    for (const s of SKINS) {
      for (const f of s.formes ?? []) expect(FORMES_AVATAR).toContain(f);
    }
  });

  /**
   * ⚠️ **La coque suit la couleur réglée, la dalle non.** C'est la règle qui permet à la
   * console d'être grise, bleue ou noire sans qu'on y retouche : un skin qui poserait ses
   * propres teintes rendrait le réglage de couleur sans effet. La dalle, elle, tient à
   * l'accent — un cristal liquide ne change pas de vert avec la coque.
   */
  it("accorde la coque à la couleur choisie, et la dalle à l'accent", () => {
    const gris = couchesDuGameboy("#D9D3C9");
    const bleu = couchesDuGameboy("#4A6FD9");
    expect(gris.coque).not.toBe(bleu.coque);
    expect(gris.dalle).toBe(bleu.dalle);
  });

  it("garde la dalle du Game Boy sombre et ses yeux lumineux", () => {
    const { dalle } = couchesDuGameboy();
    const skin = skinParCle("gameboy");
    const yeux = skin.yeux!(skin.palette).couleur;
    expect(clartePercue(yeux)).toBeGreaterThan(clartePercue(dalle) + 40);
  });

  it("rend la coque du Game Boy nettement plus claire que sa dalle", () => {
    const { coque, dalle } = couchesDuGameboy();
    expect(contraste(coque, dalle)).toBeGreaterThanOrEqual(2);
    expect(clartePercue(coque)).toBeGreaterThan(clartePercue(dalle));
  });

  it("laisse la dalle du Game Boy déborder sous les yeux", () => {
    /* Le repère va de −100 à 100 : le bas de la dalle est à 100 moins son retrait. */
    expect(100 - DALLE_GAMEBOY.bas).toBeGreaterThan(OEIL_LE_PLUS_BAS + 10);
  });

  it("garde la coque de l'astronaute claire et sa visière noire", () => {
    const skin = skinParCle("astronaute");
    const p = { tete: "#4FA3E3", accent: "#000000", yeux: "#000000" };
    const plats = skin.plats!(p);
    const region = skin.decoupes!(p).find(c => c.id === "visiere")!.d;
    const coque = plats[0].couleur!;
    const visiere = plats.find(m => m.d === region && m.couleur)!.couleur!;
    expect(clartePercue(coque)).toBeGreaterThan(80);
    expect(clartePercue(visiere)).toBeLessThan(12);
    /* Les yeux doivent se détacher du verre : c'est le seul objet lumineux du casque. */
    expect(contraste(skin.yeux!(p).couleur, visiere)).toBeGreaterThan(6);
  });

  /**
   * ⚠️ **Une couleur presque grise doit donner un casque presque gris.** Les matières de
   * l'astronaute *imposent* leur saturation au lieu d'en garder une fraction — sans quoi
   * l'ivoire du modèle était inatteignable à clarté 0,86, la chroma y étant déjà bornée par
   * le modèle TSL. Mais une teinte reste définie même pour un neutre : `#8E8E93` est
   * « bleu » à 3 %, et l'imposer à 26 % l'amplifierait huit fois. Le plafond à quatre fois
   * la saturation d'origine retient les gris ; ce test le vérifie, parce qu'une constante
   * de ce genre se supprime facilement en croyant simplifier.
   */
  it("ne colore pas le casque quand la couleur réglée est presque neutre", () => {
    const skin = skinParCle("astronaute");
    const coque = (tete: string) =>
      skin.plats!({ tete, accent: "#000000", yeux: "#000000" })[0].couleur!;
    const ecartAuGris = (hex: string) => {
      const [r, v, b] = hexVersRvb(hex);
      return Math.max(r, v, b) - Math.min(r, v, b);
    };
    /* Le gris reste sage, la couleur franche atteint bien son pigment. */
    expect(ecartAuGris(coque("#8E8E93"))).toBeLessThan(10);
    expect(ecartAuGris(coque("#C09A4A"))).toBeGreaterThan(15);
  });

  /**
   * ⚠️ **Le reflet de vitre est partagé entre le casque et le classique, et absent du Game
   * Boy.** Les deux premiers ont une vitre ; le troisième a un cristal liquide mat, que le
   * concept montre sans le moindre reflet. Un reflet posé dessus l'aurait fait lire comme
   * un écran de verre.
   */
  it("pose le reflet de vitre devant le regard, sur le casque comme sur le classique", () => {
    const couche = (cle: string) => {
      const s = skinParCle(cle);
      return s.plats!(s.palette).find(m => m.degrade === "reflet")!;
    };
    expect(couche("astronaute").d).toBe(couche("classique").d);
    expect(couche("astronaute").devant).toBe(true);
    expect(couche("classique").devant).toBe(true);
    const gb = skinParCle("gameboy");
    expect(gb.plats!(gb.palette).some(m => m.degrade === "reflet")).toBe(false);
  });

  /**
   * ⚠️ **Un regard derrière une vitre est borné par la vitre, pas par la tête.** Sur un
   * visage, détourer les yeux par la silhouette suffit : ils ne peuvent pas en sortir. Sur
   * un appareil c'est faux dès que la tête tourne un peu — l'œil glissait sur le cerclage et
   * venait se poser *par-dessus* le métal, comme collé sur le boîtier.
   *
   * ⚠️ **La seconde assertion est la seule qui attrape une faute de frappe.** Un `decoupe`
   * mal orthographié désigne un détourage qui n'existe pas ; le navigateur n'avertit de
   * rien et se contente de ne plus rien peindre. Les yeux disparaîtraient entièrement, sans
   * message, sur le seul skin concerné — le genre de panne qu'on ne trouve qu'à l'œil.
   */
  it("enferme le regard des appareils dans leur vitre", () => {
    for (const [cle, region] of [["gameboy", "dalle"], ["astronaute", "visiere"],
                                 ["chevalier", "fente"], ["classique", "dalle"]] as const) {
      const skin = skinParCle(cle);
      expect(skin.yeux!(skin.palette).decoupe).toBe(region);
      expect(skin.decoupes!(skin.palette).map(c => c.id)).toContain(region);
    }
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
