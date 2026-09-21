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
  const points = Array.from({ length: 40 }, (_, i) => ({ value: 100 + i }));

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
    const poses: number[] = [];
    let opts: Record<string, unknown> = { visible: true, autoscaleInfoProvider: "origine" };
    return {
      poses,
      options: () => opts,
      applyOptions: (o: Record<string, unknown>) => { opts = { ...opts, ...o }; },
      setData: (d: unknown[]) => { poses.push(d.length); },
      lu: () => opts,
    };
  }

  function chartFactice() {
    const plages: unknown[] = [];
    return {
      plages,
      timeScale: () => ({
        getVisibleLogicalRange: () => ({ from: 0, to: 39 }),
        setVisibleLogicalRange: (p: unknown) => { plages.push(p); },
      }),
    };
  }

  afterEach(() => vi.unstubAllGlobals());

  it("pose la série entière d'emblée quand le mouvement est refusé", () => {
    vi.stubGlobal("matchMedia", () => ({ matches: true }));
    const s = serieFactice(), c = chartFactice();
    tracerProgressivement(c as never, s as never, points);
    expect(s.poses).toEqual([40]);
  });

  it("pose la série entière d'emblée quand elle est trop courte pour se voir", () => {
    const s = serieFactice(), c = chartFactice();
    tracerProgressivement(c as never, s as never, points.slice(0, 5));
    expect(s.poses).toEqual([5]);
  });

  it("part de deux points et croît sans jamais reculer", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    for (const t of [0, 20, 45]) avancer(t);
    /* La première pose est la mesure de cadrage, la deuxième le point de départ. */
    const apresMesure = s.poses.slice(1);
    expect(apresMesure[0]).toBe(2);
    for (let i = 1; i < apresMesure.length; i++) {
      expect(apresMesure[i]).toBeGreaterThanOrEqual(apresMesure[i - 1]!);
    }
    /* À mi-course l'adoucissement a déjà posé l'essentiel, sans tout poser. */
    const dernier = apresMesure[apresMesure.length - 1]!;
    expect(dernier).toBeGreaterThan(2);
    expect(dernier).toBeLessThanOrEqual(40);
  });

  it("finit sur la série entière et rend les deux cadrages", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer, enAttente } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    avancer(0);
    expect(s.lu().autoscaleInfoProvider).not.toBe("origine");   // gelé pendant
    avancer(100);
    expect(s.poses[s.poses.length - 1]).toBe(40);
    expect(s.lu().autoscaleInfoProvider).toBe("origine");        // rendu après
    expect(enAttente()).toBe(false);
    expect(c.plages.length).toBeGreaterThan(0);                  // plage réimposée
  });

  it("ne laisse pas la courbe tronquée quand on l'annule en route", () => {
    const s = serieFactice(), c = chartFactice();
    const { h, avancer } = horlogeManuelle();
    const arreter = tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    avancer(30);
    arreter();
    expect(s.poses[s.poses.length - 1]).toBe(40);
    expect(s.lu().autoscaleInfoProvider).toBe("origine");
  });

  it("rend la série visible après l'avoir mesurée cachée", () => {
    const s = serieFactice(), c = chartFactice();
    const { h } = horlogeManuelle();
    tracerProgressivement(c as never, s as never, points, { duree: 100, horloge: h });
    expect(s.lu().visible).toBe(true);
  });
});
