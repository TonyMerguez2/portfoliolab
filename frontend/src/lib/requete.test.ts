import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { recuperer, SESSION_EXPIREE, rearmerSession } from "@/lib/requete";

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

/**
 * L'annonce d'une session finie.
 *
 * ⚠️ **Ce qui s'éprouve ici est un silence, pas un message.** Un jeton périmé laissait la
 * page se charger, lancer ses quinze appels, se prendre quinze 401 — relevés dans le journal
 * du serveur — et afficher un tableau de bord vide. Rien à l'écran ne disait qu'il fallait se
 * reconnecter, et le site paraissait en panne. Les trois cas qui ne doivent **pas** déclencher
 * l'annonce comptent autant que celui qui le doit : chacun effacerait une session valide.
 */
describe("session expirée", () => {
  let n = 0;
  const url = (suffixe = "") => `/api/v1/essai-session-${++n}${suffixe}`;
  const AVEC_JETON = { headers: { Authorization: "Bearer perime" } };

  let annonces: number;
  const compter = () => { annonces += 1; };

  const repondre = (statut: number, entetes: Record<string, string> = {}) =>
    vi.stubGlobal("fetch", vi.fn(() => Promise.resolve(new Response("{}", { status: statut, headers: entetes }))));

  /* ⚠️ Ni navigateur ni jsdom ici : la suite tourne sous Node. `EventTarget` et une table
     suffisent à jouer les deux seules choses que le transport touche — l'évènement et le
     stockage —, et cela évite d'installer un faux navigateur entier pour six tests. */
  let sac: Record<string, string>;
  const stockage = {
    getItem: (k: string) => (k in sac ? sac[k] : null),
    setItem: (k: string, v: string) => { sac[k] = v; },
    removeItem: (k: string) => { delete sac[k]; },
  };

  beforeEach(() => {
    annonces = 0;
    sac = { novac_token: "perime" };
    rearmerSession();
    vi.stubGlobal("window", new EventTarget());
    vi.stubGlobal("localStorage", stockage);
    window.addEventListener(SESSION_EXPIREE, compter);
  });
  afterEach(() => {
    window.removeEventListener(SESSION_EXPIREE, compter);
    vi.unstubAllGlobals();
  });

  it("annonce et efface le jeton sur un 401 porté par une session", async () => {
    repondre(401);
    await recuperer(url(), AVEC_JETON);
    expect(annonces).toBe(1);
    expect(sac.novac_token).toBeUndefined();
  });

  it("n'annonce qu'une fois pour une rafale d'appels", async () => {
    repondre(401);
    await Promise.all([1, 2, 3, 4, 5].map(() => recuperer(url(), AVEC_JETON)));
    expect(annonces).toBe(1);
  });

  it("se tait sur la porte de l'alpha, qui répond 401 elle aussi", async () => {
    repondre(401, { "x-novac-porte": "fermee" });
    await recuperer(url(), AVEC_JETON);
    expect(annonces).toBe(0);
    expect(sac.novac_token).toBe("perime");
  });

  it("se tait sur un mauvais mot de passe, qui refermerait la fenêtre ouverte", async () => {
    repondre(401);
    await recuperer("/api/v1/auth/login", { ...AVEC_JETON, method: "POST" });
    expect(annonces).toBe(0);
  });

  it("se tait sur un 401 d'appel sans jeton : il n'y a pas de session à finir", async () => {
    repondre(401);
    await recuperer(url());
    expect(annonces).toBe(0);
    expect(sac.novac_token).toBe("perime");
  });

  it("se tait sur une réponse normale", async () => {
    repondre(200);
    await recuperer(url(), AVEC_JETON);
    expect(annonces).toBe(0);
  });
});
