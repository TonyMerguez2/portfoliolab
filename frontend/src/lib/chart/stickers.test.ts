import { describe, it, expect, beforeEach } from "vitest";
import {
  GLYPHES, TAILLE_DEFAUT, TAILLE_MAX, TAILLE_MIN, bornerTaille, cleStickers,
  coordonneeFine, ecrireStickers, idSticker, lireStickers, logiqueFine,
  logiqueVersTemps, tailleEtiree,
  tempsVersLogique,
} from "./stickers";

/** Un rangement local minimal, absent de l'environnement de test. */
function poserStockage() {
  const carte = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => (carte.has(k) ? carte.get(k)! : null),
    setItem: (k: string, v: string) => { carte.set(k, v); },
    removeItem: (k: string) => { carte.delete(k); },
    clear: () => carte.clear(),
    key: () => null,
    length: 0,
  };
  return carte;
}

describe("cleStickers", () => {
  it("range par portefeuille, pas globalement", () => {
    // Un sticker parle d'un portefeuille à une date : partagé, il poserait des
    // repères sur des courbes sans rapport.
    expect(cleStickers("abc")).not.toBe(cleStickers("def"));
  });

  it("retombe sur une clé unique sans portefeuille", () => {
    expect(cleStickers(null)).toBe(cleStickers(undefined));
  });
});

describe("lireStickers / ecrireStickers", () => {
  beforeEach(() => { poserStockage(); });

  it("rend ce qui a été rangé", () => {
    const l = [{ id: "a", glyphe: "🚀", temps: 1700000000, valeur: 3200, taille: 26 }];
    ecrireStickers("k", l);
    expect(lireStickers("k")).toEqual(l);
  });

  it("rend une liste vide sur une clé absente", () => {
    expect(lireStickers("jamais-ecrit")).toEqual([]);
  });

  it("survit à un contenu illisible", () => {
    localStorage.setItem("k", "{ceci n'est pas du JSON");
    expect(lireStickers("k")).toEqual([]);
  });

  it("survit à un contenu qui n'est pas un tableau", () => {
    localStorage.setItem("k", JSON.stringify({ glyphe: "🚀" }));
    expect(lireStickers("k")).toEqual([]);
  });

  it("écarte les entrées mal formées sans jeter les bonnes", () => {
    // ⚠️ Le rangement local n'est pas de la donnée de confiance : un format
    // antérieur ou une écriture à moitié faite ne doit pas casser le graphique.
    localStorage.setItem("k", JSON.stringify([
      { id: "bon", glyphe: "🔥", temps: 1, valeur: 2 },
      { id: "sansGlyphe", temps: 1, valeur: 2 },
      { id: "tempsTexte", glyphe: "x", temps: "1", valeur: 2 },
      { id: "valeurInfinie", glyphe: "x", temps: 1, valeur: Infinity },
      null,
      "pas un objet",
    ]));
    const out = lireStickers("k");
    expect(out).toHaveLength(1);
    expect(out[0].id).toBe("bon");
  });

  it("écrase la liste au lieu de l'agrandir", () => {
    ecrireStickers("k", [{ id: "a", glyphe: "🚀", temps: 1, valeur: 1, taille: 22 }]);
    ecrireStickers("k", []);
    expect(lireStickers("k")).toEqual([]);
  });
});

describe("idSticker", () => {
  it("ne se répète pas sur une rafale", () => {
    // ⚠️ Sur cinq mille, et non cinq cents. La version d'origine reposait sur un
    // tirage aléatoire parmi un million, ce que cinq cents identifiants ne
    // mettaient en défaut qu'une fois sur douze : le test échouait par
    // intermittence, ce qui l'aurait fait passer pour capricieux alors qu'il
    // désignait un vrai défaut. À cette taille, un identifiant sans compteur
    // échoue à tous les coups.
    const vus = new Set<string>();
    for (let i = 0; i < 5000; i++) vus.add(idSticker());
    expect(vus.size).toBe(5000);
  });
});

describe("GLYPHES", () => {
  it("n'a pas de doublon", () => {
    expect(new Set(GLYPHES).size).toBe(GLYPHES.length);
  });

  it("remplit des rangées entières de six", () => {
    // La grille du panneau a six colonnes ; un reste laisserait un trou.
    expect(GLYPHES.length % 6).toBe(0);
  });
});

describe("bornerTaille", () => {
  it("garde une taille utilisable", () => {
    expect(bornerTaille(30)).toBe(30);
    expect(bornerTaille(2)).toBe(TAILLE_MIN);
    expect(bornerTaille(500)).toBe(TAILLE_MAX);
  });

  it("arrondit, pour ne pas poser un emoji sur un demi-pixel", () => {
    expect(bornerTaille(30.6)).toBe(31);
  });

  it("retombe sur la taille de pose devant une valeur impossible", () => {
    expect(bornerTaille(NaN)).toBe(TAILLE_DEFAUT);
    expect(bornerTaille(Infinity)).toBe(TAILLE_DEFAUT);
  });
});

describe("tailleEtiree", () => {
  it("moyenne les deux axes, la poignée étant au coin", () => {
    // Tirer de 10 px en diagonale agrandit de 10, pas de 20.
    expect(tailleEtiree(22, 10, 10)).toBe(32);
    // Un geste purement vertical compte autant qu'un horizontal, pour moitié.
    expect(tailleEtiree(22, 0, 10)).toBe(27);
    expect(tailleEtiree(22, 10, 0)).toBe(27);
  });

  it("rétrécit quand on tire vers le haut et la gauche", () => {
    expect(tailleEtiree(40, -10, -10)).toBe(30);
  });

  it("reste dans les bornes quel que soit le geste", () => {
    expect(tailleEtiree(22, -900, -900)).toBe(TAILLE_MIN);
    expect(tailleEtiree(22, 900, 900)).toBe(TAILLE_MAX);
  });
});

describe("lireStickers, compatibilité de format", () => {
  beforeEach(() => { poserStockage(); });

  it("donne une taille par défaut aux entrées qui n'en ont pas", () => {
    // Les premiers stickers ont été rangés avant que la taille n'existe.
    localStorage.setItem("k", JSON.stringify([{ id: "a", glyphe: "🚀", temps: 1, valeur: 2 }]));
    expect(lireStickers("k")[0].taille).toBe(TAILLE_DEFAUT);
  });

  it("borne une taille rangée hors limites", () => {
    localStorage.setItem("k", JSON.stringify([{ id: "a", glyphe: "🚀", temps: 1, valeur: 2, taille: 9999 }]));
    expect(lireStickers("k")[0].taille).toBe(TAILLE_MAX);
  });
});

describe("logiqueVersTemps / tempsVersLogique", () => {
  // Trois barres régulièrement espacées d'une heure.
  const T = [1000, 4600, 8200];

  it("interpole entre deux barres au lieu d'accrocher à la plus proche", () => {
    // ⚠️ C'est tout l'objet : à l'indice 0,25 la date n'existe pas dans la série,
    // et c'est ce qui laisse le sticker là où on l'a lâché.
    expect(logiqueVersTemps(0.25, T)).toBe(1900);
    expect(logiqueVersTemps(1.5, T)).toBe(6400);
  });

  it("rend la date exacte sur un indice entier", () => {
    expect(logiqueVersTemps(0, T)).toBe(1000);
    expect(logiqueVersTemps(1, T)).toBe(4600);
    expect(logiqueVersTemps(2, T)).toBe(8200);
  });

  it("cale sur la borne hors série, sans extrapoler", () => {
    // Extrapoler placerait le sticker à une date que le graphique ne pourra
    // jamais réafficher.
    expect(logiqueVersTemps(-5, T)).toBe(1000);
    expect(logiqueVersTemps(99, T)).toBe(8200);
  });

  it("survit à une série vide ou d'un seul point", () => {
    expect(logiqueVersTemps(1, [])).toBeNull();
    expect(logiqueVersTemps(1, [42])).toBe(42);
  });

  it("fait l'aller-retour sans dérive", () => {
    for (const l of [0, 0.25, 0.5, 1, 1.75, 2]) {
      const t = logiqueVersTemps(l, T)!;
      expect(tempsVersLogique(t, T)).toBeCloseTo(l, 9);
    }
  });

  it("rend null pour une date hors de la série", () => {
    // Le sticker est alors simplement hors cadre — ce qui arrive dès qu'on
    // change de période — et non supprimé.
    expect(tempsVersLogique(1, T)).toBeNull();
    expect(tempsVersLogique(99999, T)).toBeNull();
  });

  it("trouve le bon intervalle sur une série longue et irrégulière", () => {
    // Dichotomie : la série peut compter des centaines de points, et le calcul
    // est refait par sticker à chaque trame de zoom.
    const longue: number[] = [];
    let t = 0;
    for (let i = 0; i < 500; i++) { t += 1 + (i % 7); longue.push(t); }
    for (const l of [0, 3.5, 128.25, 499]) {
      expect(tempsVersLogique(logiqueVersTemps(l, longue)!, longue)).toBeCloseTo(l, 9);
    }
  });
});

describe("logiqueFine / coordonneeFine", () => {
  // Un graphique imaginaire : barre 0 à x = 100, puis 8 px par barre, 5 barres.
  const pos = (l: number) => (l < 0 || l > 4 ? null : 100 + l * 8);

  it("rend un indice fractionnaire là où la bibliothèque ne rend qu'un entier", () => {
    // ⚠️ C'est la correction du réalignement : x = 102 est au quart de la barre 0.
    expect(logiqueFine(102, 0, pos)).toBeCloseTo(0.25);
    expect(logiqueFine(112, 1, pos)).toBeCloseTo(1.5);
  });

  it("accepte une abscisse à gauche du centre de sa barre", () => {
    // L'accrochage donne la barre 1 pour x = 106, qui est pourtant avant elle.
    expect(logiqueFine(106, 1, pos)).toBeCloseTo(0.75);
  });

  it("mesure l'écart sur la barre précédente au bout de la série", () => {
    // Il n'y a pas de barre 5 : l'écart se prend entre 3 et 4.
    expect(logiqueFine(136, 4, pos)).toBeCloseTo(4.5);
  });

  it("fait l'aller-retour au pixel près", () => {
    for (const x of [100, 103.5, 117, 128, 131.25]) {
      const l = logiqueFine(x, Math.min(4, Math.max(0, Math.round((x - 100) / 8))), pos)!;
      expect(coordonneeFine(l, pos)).toBeCloseTo(x, 9);
    }
  });

  it("rend null hors du domaine des barres", () => {
    expect(logiqueFine(100, 99, pos)).toBeNull();
    expect(coordonneeFine(99, pos)).toBeNull();
  });

  it("survit à un graphique d'une seule barre", () => {
    const seule = (l: number) => (l === 0 ? 100 : null);
    expect(logiqueFine(150, 0, seule)).toBe(0);
    expect(coordonneeFine(0, seule)).toBe(100);
  });
});
