import { describe, expect, it, vi, afterEach } from "vitest";
import { tracerProgressivement, type Horloge } from "@/lib/chart/traceProgressif";

/**
 * Le tracé progressif.
 *
 * ⚠️ **Ce qui s'éprouve ici est surtout ce qui se retourne si on l'oublie.** Une série
 * incomplète occupe moins de temps et couvre moins de valeurs : sans gel des deux
 * cadrages, on ne voit pas une ligne qui avance mais une ligne courte qui s'étire et se
 * déforme. Et un tracé qui ne finirait pas sur la série entière laisserait la courbe
 * tronquée à l'écran — un défaut bien pire que l'absence d'animation.
 */
describe("tracerProgressivement", () => {
  const points = Array.from({ length: 40 }, (_, i) => ({ time: 1000 + i, value: 100 + i }));

  /** Une horloge à la main : on avance le temps, rien n'attend d'image. */
  function horlogeManuelle() {
    let suivant: ((t: number) => void) | null = null;
    let id = 0;
    const h: Horloge = {
      maintenant: () => 0,
      planifier: f => { suivant = f; return ++id; },
      annuler: () => { suivant = null; },
    };
    return { h, avancer: (t: number) => { const f = suivant; suivant = null; f?.(t); },
      enAttente: () => suivant !== null };
  }

  function serieFactice() {
    const poses: number[] = [], valeurs: number[] = [];
    let opts: Record<string, unknown> = { visible: true, autoscaleInfoProvider: "origine" };
    return {
      poses, valeurs,
      options: () => opts,
      applyOptions: (o: Record<string, unknown>) => { opts = { ...opts, ...o }; },
      setData: (d: unknown[]) => {
        poses.push(d.length);
        /* Ce qui compte n'est plus la longueur mais le nombre de points **portant une
           valeur** : la série garde sa taille du début à la fin. */
        valeurs.push((d as { value?: number }[]).filter(p => typeof p.value === "number").length);
      },
      lu: () => opts,
    };
  }

  /**
   * ⚠️ Le graphique ne sert plus qu'à la signature : depuis que les points non atteints
   * sont laissés vides, l'étendue temporelle ne bouge plus et il n'y a plus de cadrage
   * horizontal à forcer. Une échelle qui explose si on la touche le prouve.
   */
  function chartFactice() {
    return {
      timeScale: () => ({
        getVisibleLogicalRange: () => { throw new Error("le tracé ne doit plus y toucher"); },
        setVisibleLogicalRange: () => { throw new Error("le tracé ne doit plus y toucher"); },
      }),
    };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("pose la série entière d'emblée quand le mouvement est refusé", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const s = serieFactice(), c = chartFactice();
    tracerProgressivement(c as never, s as never, points);
    expect(s.valeurs).toEqual([40]);
  });

  it("pose la série entière d'emblée quand elle est trop courte pour se voir", () => {
    const s = serieFactice(), c = chartFactice();
    tracerProgressivement(c as never, s as never, points.slice(0, 5));
    expect(s.valeurs).toEqual([5]);
  });

  it("part de deux points et croît sans jamais reculer", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    for (const t of [0, 20, 45]) avancer(t);
    expect(s.valeurs[0]).toBe(2);
    for (let i = 1; i < s.valeurs.length; i++) {
      expect(s.valeurs[i]).toBeGreaterThanOrEqual(s.valeurs[i - 1]!);
    }
    /* La série garde sa longueur du premier au dernier instant : c'est ce qui dispense
       de tout cadrage horizontal. */
    expect(new Set(s.poses)).toEqual(new Set([40]));
  });

  it("finit sur la série entière et rend les deux cadrages", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer, enAttente } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    avancer(0);
    expect(s.lu().autoscaleInfoProvider).not.toBe("origine");   // gelée pendant
    avancer(100);
    expect(s.valeurs[s.valeurs.length - 1]).toBe(40);
    expect(s.lu().autoscaleInfoProvider).toBe("origine");        // rendue après
    expect(enAttente()).toBe(false);
  });

  it("ne laisse pas la courbe tronquée quand on l'annule en route", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer } = horlogeManuelle();
    const arreter = tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    avancer(30);
    arreter();
    expect(s.valeurs[s.valeurs.length - 1]).toBe(40);
    expect(s.lu().autoscaleInfoProvider).toBe("origine");
  });

  it("ne masque jamais la série : il n'y a plus rien à mesurer en cachette", () => {
    const s = serieFactice(), c = chartFactice();
    const { h } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    expect(s.lu().visible).toBe(true);
  });
});
