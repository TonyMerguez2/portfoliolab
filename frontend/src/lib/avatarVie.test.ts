import { describe, expect, it } from "vitest";

import {
  ETATS, POSE_NEUTRE, etatParCle, etatSelonEcartCourbe, etatSelonVariation,
  poseDeLEtat,
} from "./avatarEtats";
import { type EtatVie, type ReglagesVie, VIE_AU_REPOS, creerVie } from "./avatarVie";

/**
 * Une machine à états se vérifie-t-elle autrement qu'à l'œil ?
 *
 * ⚠️ **Oui, et c'est tout l'intérêt d'avoir sorti le temps du rendu.** Durées tenues,
 * retour exact au repos, continuité, bornes : rien de tout cela ne se voit sur une
 * capture d'écran, et tout se rate sur un instant qu'on n'a pas su saisir. Ces tests
 * simulent des minutes entières, image par image.
 *
 * ⚠️ Le tirage au sort est injecté. Une logique de temps qui tire à chaque appel donne
 * un résultat différent à chaque exécution, et un test qui échoue une fois sur vingt
 * finit par être ignoré.
 */

const REGLAGES: ReglagesVie = {
  derive: 3, clignement: true, cadenceClignement: 4, spontane: true, cadenceSpontane: 5,
};
/**
 * Tout coupé.
 *
 * ⚠️ **`spontane: false` en fait partie**, et l'oublier a fait tomber un test : les
 * gestes que le visage se donne tout seul sont, par définition, du mouvement que
 * personne n'a demandé. Un régime dit « calme » qui les laisserait passer ne mesurerait
 * plus l'état qu'on croit isoler.
 */
const CALME: ReglagesVie = {
  derive: 0, clignement: false, cadenceClignement: 4, spontane: false,
};
const FIGE = (v: number) => () => v;

/** Fait tourner la vie à 60 images par seconde et rend toutes les images. */
function simuler(
  vie: ReturnType<typeof creerVie>, secondes: number,
  reglages: ReglagesVie = REGLAGES, depart = 0,
): EtatVie[] {
  const images: EtatVie[] = [];
  for (let t = depart; t <= depart + secondes * 1000; t += 1000 / 60) {
    images.push(vie.avancer(t, reglages));
  }
  return images;
}

/**
 * L'état à son apogée.
 *
 * ⚠️ **Un ponctuel se mesure *pendant*, pas après**, et ma première version l'oubliait :
 * elle laissait tourner deux secondes et demie, si bien que « Surpris » et « Très
 * content » avaient déjà rendu la main au neutre au moment du relevé. Le test disait
 * donc que leurs yeux n'étaient pas écarquillés — ce qui était vrai, et hors sujet.
 */
function poser(cle: string, reglages: ReglagesVie = CALME): EtatVie {
  const etat = etatParCle(cle);
  const quand = etat.nature === "ponctuel" ? (etat.duree ?? 1000) * 0.6 : 2500;
  const vie = creerVie(FIGE(0.99));
  vie.avancer(0, reglages);
  vie.demander(cle, 0);
  let dernier = VIE_AU_REPOS;
  for (let t = 0; t <= quand; t += 16) dernier = vie.avancer(t, reglages);
  return dernier;
}

describe("répertoire", () => {
  it("porte les quinze états de la V1, moins le clignement", () => {
    // ⚠️ Le clignement n'est pas un état : il se superpose à tous les autres. En faire
    // un état l'aurait rendu incompatible avec eux, alors qu'on cligne en réfléchissant
    // comme en s'étonnant.
    expect(ETATS.map(e => e.cle)).toEqual([
      "neutre", "curieux", "focus", "content", "tres-content", "surpris",
      "preoccupe", "sceptique", "reflexion", "observation", "somnolent",
      "reveil", "erreur", "succes",
    ]);
  });

  it("dit pour chaque état quand l'appeler", () => {
    // La colonne « quand » est de la documentation, mais une documentation vide serait
    // pire que pas de colonne du tout.
    for (const e of ETATS) {
      expect({ [e.cle]: e.quand.length > 8 }).toEqual({ [e.cle]: true });
      expect({ [e.cle]: e.libelle.length > 2 }).toEqual({ [e.cle]: true });
    }
  });

  it("donne une durée à tous les ponctuels, et à eux seuls", () => {
    for (const e of ETATS) {
      expect({ [e.cle]: e.nature === "ponctuel" ? typeof e.duree : e.duree })
        .toEqual({ [e.cle]: e.nature === "ponctuel" ? "number" : undefined });
    }
  });

  it("retombe sur le neutre pour une clé inconnue, au lieu de lever", () => {
    expect(etatParCle("n'existe pas").cle).toBe("neutre");
  });

  it("laisse le neutre au repos complet", () => {
    expect(poseDeLEtat(etatParCle("neutre"))).toEqual(POSE_NEUTRE);
  });
});

describe("machine à états", () => {
  it("garde un état soutenu tant qu'on n'en demande pas un autre", () => {
    /**
     * ⚠️ **La distinction qui structure tout le module.** « Focus » doit tenir pendant
     * tout le calcul ; s'il s'arrêtait au bout d'une seconde, la mimique s'éteindrait
     * en pleine analyse et dirait le contraire de ce qu'elle annonce.
     */
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("focus", 0);
    for (let t = 0; t <= 60000; t += 100) vie.avancer(t, CALME);
    expect(vie.courant()).toBe("focus");
    expect(vie.avancer(60000, CALME).largeur).toBeLessThan(0.8);
  });

  it("rend la main au fond après un ponctuel", () => {
    // « Erreur » se joue une fois. Sans retour, la tête resterait fâchée après un
    // simple refus — et le prochain état ne s'expliquerait plus.
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("focus", 0);
    vie.demander("erreur", 0);
    expect(vie.courant()).toBe("erreur");
    for (let t = 0; t <= 3000; t += 16) vie.avancer(t, CALME);
    expect(vie.courant()).toBe("focus");
    expect(vie.fond()).toBe("focus");
  });

  it("revient exactement au neutre, sans résidu", () => {
    /**
     * ⚠️ **L'invariant le plus important.** Un état qui ne se referme pas tout à fait
     * laisse un résidu ; les résidus s'accumulent et le visage part lentement de
     * travers sans que rien ne le signale — une dérive qu'on ne remarque qu'après
     * plusieurs minutes, quand la tête est déjà penchée.
     */
    for (const e of ETATS) {
      const vie = creerVie(FIGE(0.99));
      vie.avancer(0, CALME);
      vie.demander(e.cle, 0);
      let dernier = VIE_AU_REPOS;
      for (let t = 0; t <= 4000; t += 16) dernier = vie.avancer(t, CALME);
      vie.demander("neutre", 4000);
      for (let t = 4000; t <= 12000; t += 16) dernier = vie.avancer(t, CALME);
      for (const cle of Object.keys(VIE_AU_REPOS) as (keyof EtatVie)[]) {
        expect({ [`${e.cle}.${cle}`]: Math.abs(dernier[cle] - VIE_AU_REPOS[cle]) < 0.01 })
          .toEqual({ [`${e.cle}.${cle}`]: true });
      }
    }
  });

  it("passe d'un état à l'autre sans à-coup", () => {
    // Aucune transition n'est écrite à la main : on rejoint la pose visée depuis la
    // pose courante, quelle qu'elle soit. Encore faut-il que le trajet soit continu.
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("somnolent", 0);
    for (let t = 0; t <= 3000; t += 16) vie.avancer(t, CALME);
    vie.demander("surpris", 3000);
    let precedent = vie.avancer(3000, CALME);
    for (let t = 3016; t <= 5000; t += 16) {
      const e = vie.avancer(t, CALME);
      expect(Math.abs(e.hauteur - precedent.hauteur)).toBeLessThan(0.06);
      expect(Math.abs(e.lacet - precedent.lacet)).toBeLessThan(2.5);
      precedent = e;
    }
  });
});

describe("les mimiques disent ce qu'elles annoncent", () => {
  it("arque les yeux du content, et les aplatit pour que ça se voie", () => {
    // ⚠️ La cambrure seule ne suffit pas : elle n'est lisible que sur un œil **plus
    // large que haut**. Sur une capsule dressée, elle ne fait que la gauchir.
    for (const cle of ["content", "tres-content", "succes"]) {
      const e = poser(cle);
      expect({ [cle]: e.courbure > 0.3 }).toEqual({ [cle]: true });
      expect({ [cle]: e.largeur > e.hauteur * 2 }).toEqual({ [cle]: true });
    }
  });

  it("rapproche les yeux du curieux et écarte ceux du surpris", () => {
    expect(poser("curieux").ecart).toBeLessThan(0.9);
    expect(poser("surpris").ecart).toBeGreaterThan(1.1);
  });

  it("affine les yeux du focus et réduit son mouvement", () => {
    const e = poser("focus");
    expect(e.largeur).toBeLessThan(0.8);
    expect(e.suivi).toBeLessThan(0.5);
  });

  it("arrondit les yeux du surpris", () => {
    // « Ronds » veut dire que largeur et hauteur se rapprochent, en partant d'une
    // capsule trois fois plus haute que large.
    const e = poser("surpris");
    expect(e.largeur / e.hauteur).toBeGreaterThan(2);
  });

  it("ne ferme qu'un œil pour le sceptique", () => {
    const e = poser("sceptique");
    expect(Math.abs(e.fermetureDroite - e.fermetureGauche)).toBeGreaterThan(0.3);
  });

  it("baisse les deux paupières du somnolent, également", () => {
    const e = poser("somnolent");
    expect(e.fermetureGauche).toBeGreaterThan(0.4);
    expect(e.fermetureGauche).toBe(e.fermetureDroite);
  });

  it("envoie le regard de la réflexion en haut à droite", () => {
    const e = poser("reflexion");
    expect(e.lacet).toBeGreaterThan(12);
    expect(e.tangage).toBeLessThan(-8);
  });

  it("incline vers l'intérieur les yeux du préoccupé", () => {
    expect(poser("preoccupe").inclinaison).toBeGreaterThan(6);
  });
});

describe("les états qui bougent", () => {
  it("fait alterner l'observation entre deux zones, en s'y arrêtant", () => {
    /**
     * ⚠️ **Un regard qui compare s'arrête sur chaque zone.** Un aller-retour sinusoïdal
     * passe son temps entre les deux et donne l'air de balayer, pas de comparer. On
     * vérifie donc que le regard séjourne aux extrémités bien plus qu'au milieu.
     */
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("observation", 0);
    const lacets = simuler(vie, 12, CALME).map(i => i.lacet);
    const ampl = Math.max(...lacets.map(Math.abs));
    expect(ampl).toBeGreaterThan(15);
    const auxBords = lacets.filter(l => Math.abs(l) > ampl * 0.8).length;
    const auMilieu = lacets.filter(l => Math.abs(l) < ampl * 0.3).length;
    expect(auxBords).toBeGreaterThan(auMilieu * 2);
  });

  it("secoue la tête horizontalement pour l'erreur, puis s'arrête", () => {
    const vie = creerVie(FIGE(0.99));
    vie.avancer(0, CALME);
    vie.demander("erreur", 0);
    const images = simuler(vie, 3, CALME);
    const lacets = images.map(i => i.lacet);
    // Un vrai « non » : plusieurs changements de sens, pas un simple écart.
    let changements = 0;
    for (let i = 2; i < lacets.length; i++) {
      const a = lacets[i - 1] - lacets[i - 2], b = lacets[i] - lacets[i - 1];
      if (a * b < 0 && Math.abs(a) > 0.05) changements++;
    }
    expect(changements).toBeGreaterThanOrEqual(4);
    expect(Math.abs(lacets[lacets.length - 1])).toBeLessThan(0.5);
  });

  it("fait rebondir la tête sur le succès et l'écrase sur le très content", () => {
    // Deux joies, deux gestes : l'une part vers le haut, l'autre s'écrase. Les
    // confondre reviendrait à n'avoir qu'un seul état.
    const succes = simuler(demanderEt("succes"), 2, CALME).map(i => i.echelleY);
    const tres = simuler(demanderEt("tres-content"), 2, CALME).map(i => i.echelleY);
    expect(Math.max(...succes)).toBeGreaterThan(1.02);
    expect(Math.min(...tres)).toBeLessThan(0.98);
  });

  it("ne laisse aucune échelle devenir absurde", () => {
    for (const e of ETATS) {
      for (const i of simuler(demanderEt(e.cle), 4, REGLAGES)) {
        expect({ [e.cle]: i.echelleX > 0.85 && i.echelleX < 1.2 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.echelleY > 0.85 && i.echelleY < 1.2 })
          .toEqual({ [e.cle]: true });
      }
    }
  });

  it("ne rend jamais une hauteur d'œil négative", () => {
    // ⚠️ La fermeture de fond et le clignement se combinent par le maximum, pas par une
    // somme : sur un dormeur qui cligne, une somme aurait dépassé un.
    for (const e of ETATS) {
      for (const i of simuler(demanderEt(e.cle), 20, REGLAGES)) {
        expect({ [e.cle]: i.fermetureGauche >= 0 && i.fermetureGauche <= 1 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.fermetureDroite >= 0 && i.fermetureDroite <= 1 })
          .toEqual({ [e.cle]: true });
        expect({ [e.cle]: i.hauteur > 0 }).toEqual({ [e.cle]: true });
      }
    }
  });
});

function demanderEt(cle: string) {
  const vie = creerVie(FIGE(0.99));
  vie.avancer(0, CALME);
  vie.demander(cle, 0);
  return vie;
}

describe("dérive et clignement", () => {
  it("ne laisse jamais le visage parfaitement immobile", () => {
    // ⚠️ C'est *la* différence entre un visage et une icône. Un avatar strictement figé
    // se lit comme une image, quelle que soit la qualité des mimiques.
    const vie = creerVie(FIGE(0.99));
    const images = simuler(vie, 20, { derive: 3, clignement: false, cadenceClignement: 4, spontane: false });
    const distincts = new Set(images.map(i => i.lacet.toFixed(4)));
    expect(distincts.size).toBeGreaterThan(images.length * 0.9);
  });

  it("s'éteint complètement quand tout est coupé", () => {
    for (const i of simuler(creerVie(FIGE(0.99)), 10, CALME)) {
      expect(i).toEqual(VIE_AU_REPOS);
    }
  });

  it("ralentit les clignements du focus et les espace pour le somnolent", () => {
    const compter = (cle: string) => {
      const vie = demanderEt(cle);
      const images = simuler(vie, 120, { ...CALME, clignement: true });
      let n = 0;
      for (let i = 1; i < images.length; i++) {
        if (images[i - 1].fermetureGauche < images[i].fermetureGauche
          && images[i - 1].fermetureGauche === 0) n++;
      }
      return n;
    };
    const neutre = compter("neutre");
    expect(compter("focus")).toBeLessThan(neutre);
    expect(compter("somnolent")).toBeLessThan(neutre);
  });

  it("ferme les deux yeux ensemble sur un clignement ordinaire", () => {
    const vie = creerVie(FIGE(0.99));
    const images = simuler(vie, 40, { ...CALME, clignement: true, cadenceClignement: 3 });
    expect(images.some(i => i.fermetureGauche > 0.9)).toBe(true);
    for (const i of images) expect(i.fermetureGauche).toBe(i.fermetureDroite);
  });
});

describe("etatSelonVariation", () => {
  it("traduit un résultat en mimique, au lieu de toujours dire « curieux »", () => {
    /**
     * ⚠️ **C'est ce qui sépare un avatar utile d'un avatar décoratif.** Survoler une
     * ligne ne dit rien ; survoler une ligne *qui a pris neuf pour cent* est une
     * information, et le visage la reprend avant qu'on ait lu le chiffre.
     */
    expect(etatSelonVariation(12)).toBe("surpris");
    expect(etatSelonVariation(3.4)).toBe("content");
    expect(etatSelonVariation(0.2)).toBe("curieux");
    expect(etatSelonVariation(-2)).toBe("sceptique");
    expect(etatSelonVariation(-9)).toBe("preoccupe");
  });

  it("ne s'étonne pas d'une chute — elle inquiète", () => {
    // ⚠️ Le seuil de l'inhabituel n'est pas symétrique dans son intention : une hausse
    // de neuf pour cent surprend, une baisse du même ordre appelle l'inquiétude.
    expect(etatSelonVariation(9)).toBe("surpris");
    expect(etatSelonVariation(-9)).not.toBe("surpris");
  });

  it("retombe sur « curieux » quand la variation manque", () => {
    // Un prix indisponible ne doit pas rendre le visage inquiet : l'absence de donnée
    // n'est pas une mauvaise nouvelle.
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: etatSelonVariation(v as number) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });

  it("ne nomme que des états qui existent", () => {
    for (const v of [50, 9, 3, 0, -0.5, -3, -12, -80]) {
      expect({ [v]: etatParCle(etatSelonVariation(v)).cle })
        .toEqual({ [v]: etatSelonVariation(v) });
    }
  });
});

describe("gestes spontanés", () => {
  it("bouge de lui-même en neutre, au lieu de seulement dériver", () => {
    /**
     * ⚠️ **La régression que ce test fige.** En passant à la machine à états, les gestes
     * spontanés avaient disparu : hors réaction de l'application, le visage ne faisait
     * plus que dériver et cligner. Or c'est en « neutre » qu'il passe le plus clair de
     * son temps — et un neutre sans initiative propre se lit comme une icône, si
     * soignées que soient les mimiques qu'on ne voit jamais.
     */
    const vie = creerVie(Math.random);
    const sansDerive = { ...CALME, spontane: true, cadenceSpontane: 3 };
    const images = simuler(vie, 60, sansDerive);
    const bouge = images.filter(i =>
      Math.abs(i.lacet) > 3 || Math.abs(i.roulis) > 3
      || i.hauteur < 0.8 || i.hauteur > 1.1);
    expect(bouge.length).toBeGreaterThan(images.length * 0.15);
  });

  it("rend la main à l'état de fond, sans le remplacer", () => {
    // Un coup d'œil pendant « Préoccupé » revient sur « Préoccupé ». Un geste qui
    // écraserait l'état effacerait ce que l'application vient d'annoncer.
    const vie = creerVie(Math.random);
    const avec = { ...CALME, spontane: true, cadenceSpontane: 1 };
    vie.avancer(0, avec);
    vie.demander("preoccupe", 0);
    for (let t = 0; t <= 40000; t += 16) vie.avancer(t, avec);
    expect(vie.fond()).toBe("preoccupe");
  });

  it("laisse le dormeur dormir et le concentré travailler", () => {
    // ⚠️ Un dormeur qui jette des coups d'œil ne dort pas. La tolérance de l'état décide,
    // et « Observation » — qui a déjà son mouvement propre — n'en accepte aucun.
    const compter = (cle: string) => {
      const vie = creerVie(Math.random);
      const avec = { ...CALME, spontane: true, cadenceSpontane: 2 };
      vie.avancer(0, avec);
      vie.demander(cle, 0);
      let gestes = 0;
      let precedent = "";
      for (let t = 0; t <= 120000; t += 16) {
        vie.avancer(t, avec);
        const c = vie.courant();
        if (c !== precedent && c !== cle) gestes++;
        precedent = c;
      }
      return gestes;
    };
    const neutre = compter("neutre");
    expect(neutre).toBeGreaterThan(4);
    expect(compter("somnolent")).toBeLessThan(neutre);
    expect(compter("observation")).toBe(0);
  });

  it("s'arrête net quand on les coupe", () => {
    const vie = creerVie(Math.random);
    for (const i of simuler(vie, 90, CALME)) expect(i).toEqual(VIE_AU_REPOS);
  });
});

describe("somnolent", () => {
  it("penche la tête au lieu de seulement fermer les yeux", () => {
    /**
     * ⚠️ **Des paupières basses sur une tête droite se lisent comme un regard méfiant**,
     * pas comme l'assoupissement. C'est l'inclinaison qui fait la différence : le menton
     * descend, la tête roule sur le côté — le mouvement de celui qui pique du nez.
     */
    const e = poser("somnolent");
    expect(e.fermetureGauche).toBeGreaterThan(0.45);
    expect(e.tangage).toBeGreaterThan(8);
    expect(Math.abs(e.roulis)).toBeGreaterThan(6);
  });
});

describe("etatSelonEcartCourbe", () => {
  it("emploie des paliers bien plus larges qu'une variation de cours", () => {
    /**
     * ⚠️ **Le défaut que ce test fige, signalé à l'usage.** Une courbe se parcourt en
     * continu — chaque pixel déplace la valeur — là où l'on passe d'une carte à l'autre
     * par sauts. Avec les seuils d'`etatSelonVariation`, un simple glissement traversait
     * quatre bandes et le visage changeait sans arrêt de mimique.
     */
    // ⚠️ Ce qui compte n'est pas le nombre d'états atteignables — ma première version
    // les comptait, et trouvait quatre dans les deux cas — mais le nombre de fois où
    // le visage **change** quand le curseur balaie la courbe. C'est cela qu'on voit.
    const changements = (f: (v: number) => string) => {
      let n = 0, precedent = f(-40);
      for (let v = -40; v <= 40; v += 0.25) {
        const c = f(v);
        if (c !== precedent) n++;
        precedent = c;
      }
      return n;
    };
    expect(changements(etatSelonEcartCourbe))
      .toBeLessThan(changements(etatSelonVariation));
  });

  it("ne dit rien de neuf tant que l'écart reste modeste", () => {
    for (const v of [-9, -4, 0, 2, 3.9]) {
      expect({ [v]: etatSelonEcartCourbe(v) }).toEqual({ [v]: "curieux" });
    }
  });

  it("s'éclaire sur un sommet et s'assombrit dans un creux", () => {
    expect(etatSelonEcartCourbe(6)).toBe("content");
    expect(etatSelonEcartCourbe(30)).toBe("surpris");
    expect(etatSelonEcartCourbe(-14)).toBe("preoccupe");
  });

  it("n'emploie jamais « sceptique » sur un point de mesure", () => {
    // ⚠️ Un œil plus fermé que l'autre exprime un doute sur une hypothèse ; il ne veut
    // rien dire sur une valeur relevée.
    // ⚠️ Un tableau et non un `Set` étalé : la cible de compilation du projet n'itère
    // pas un itérateur sans drapeau supplémentaire — le calendrier a déjà buté dessus.
    const vus: string[] = [];
    for (let v = -80; v <= 80; v += 0.5) {
      const c = etatSelonEcartCourbe(v);
      if (vus.indexOf(c) < 0) vus.push(c);
    }
    expect(vus.indexOf("sceptique")).toBe(-1);
    expect(vus.slice().sort()).toEqual(["content", "curieux", "preoccupe", "surpris"]);
  });

  it("ne nomme que des états qui existent, et reste calme sans donnée", () => {
    for (const v of [-100, -10, 0, 10, 100]) {
      expect(etatParCle(etatSelonEcartCourbe(v)).cle).toBe(etatSelonEcartCourbe(v));
    }
    for (const v of [null, undefined, NaN, Infinity]) {
      expect({ [String(v)]: etatSelonEcartCourbe(v as number) })
        .toEqual({ [String(v)]: "curieux" });
    }
  });
});
