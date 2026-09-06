import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { recuperer } from "@/lib/requete";

/**
 * La mutualisation des appels.
 *
 * ⚠️ Ce qui s'éprouve ici est précisément ce que la première version ratait : elle comparait
 * l'heure de *départ* à une fenêtre fixe, si bien qu'un appel plus lent que la fenêtre cessait
 * d'être partagé avant même d'avoir répondu — les doublons repartaient donc en double sur les
 * appels les plus lents, ceux qu'il fallait mutualiser en priorité.
 */
describe("recuperer", () => {
  let appels: number;
  /* ⚠️ Une adresse neuve à chaque test : la mutualisation vit dans un module, donc sa table
     survit d'un test à l'autre. Réutiliser « /x » ferait servir le partage d'un test précédent
     et le compteur mesurerait autre chose que ce qu'on croit — ce qui est arrivé. */
  let n = 0;
  const url = (suffixe = "") => `/api/v1/essai-${++n}${suffixe}`;

  beforeEach(() => {
    appels = 0;
    vi.stubGlobal("fetch", vi.fn((_url: string, _init?: RequestInit) => {
      appels += 1;
      return Promise.resolve(new Response(JSON.stringify({ n: appels }),
        { headers: { "Content-Type": "application/json" } }));
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("ne part qu'une fois pour deux appels simultanés", async () => {
    const u = url();
    const [a, b] = await Promise.all([recuperer(u), recuperer(u)]);
    expect(appels).toBe(1);
    expect(await a.json()).toEqual({ n: 1 });
    expect(await b.json()).toEqual({ n: 1 });
  });

  it("partage un appel lent tant qu'il n'a pas répondu", async () => {
    let rendre: (r: Response) => void = () => {};
    vi.stubGlobal("fetch", vi.fn(() => {
      appels += 1;
      return new Promise<Response>(res => { rendre = res; });
    }));
    const lent = url();
    const p1 = recuperer(lent);
    /* Bien après l'ancienne fenêtre de deux secondes, et toujours sans réponse. */
    await new Promise(r => setTimeout(r, 20));
    const p2 = recuperer(lent);
    rendre(new Response("{}"));
    await Promise.all([p1, p2]);
    expect(appels).toBe(1);
  });

  it("chaque adresse garde son propre appel", async () => {
    await Promise.all([recuperer(url()), recuperer(url())]);
    expect(appels).toBe(2);
  });

  it("deux jetons différents ne partagent jamais une réponse", async () => {
    const u = url();
    await Promise.all([
      recuperer(u, { headers: { Authorization: "Bearer moi" } }),
      recuperer(u, { headers: { Authorization: "Bearer toi" } }),
    ]);
    expect(appels).toBe(2);
  });

  it("les écritures ne sont jamais mutualisées", async () => {
    const u = url();
    await Promise.all([
      recuperer(u, { method: "POST", body: "1" }),
      recuperer(u, { method: "POST", body: "1" }),
    ]);
    expect(appels).toBe(2);
  });

  it("un échec n'est pas mémorisé", async () => {
    vi.stubGlobal("fetch", vi.fn(() => { appels += 1; return Promise.reject(new Error("réseau")); }));
    const u = url();
    await recuperer(u).catch(() => {});
    await recuperer(u).catch(() => {});
    expect(appels).toBe(2);
  });
});
