import type {
  BacktestRequest,
  BacktestResponse,
  MonteCarloRequest,
  MonteCarloResult,
} from "@/types";

/**
 * L'adresse du serveur — **vide**, donc l'origine de la page elle-même.
 *
 * ⚠️ Toute adresse écrite ici casse au premier changement de réseau, et c'est un
 * défaut vécu. Une variable `NEXT_PUBLIC_API_URL=http://192.168.1.142:8000`
 * permettait d'ouvrir le site depuis un téléphone, mais Next fige ces variables
 * dans le code envoyé au navigateur : le jour où la machine est passée en partage
 * de connexion, elle ne portait plus que `192.0.0.2`, et chaque appel partait vers
 * une adresse morte. La coquille de la page se chargeait depuis `localhost:3000`,
 * les données non — application vivante et vide.
 *
 * Un second obstacle attendait derrière : le CORS du serveur n'ouvre que les trois
 * plages privées, et `192.0.0.0/24` — la plage réservée d'Apple pour le partage
 * par USB — n'en fait pas partie. Corriger l'adresse n'aurait donc pas suffi.
 *
 * Les deux tombent avec la même mesure : le navigateur n'appelle plus que sa
 * **propre origine**, et Next relaie vers le serveur — voir les `rewrites` de
 * `next.config.js`. Une base vide suffit à cela, les appels étant tous écrits
 * `${API_URL}/api/v1/...`. Plus aucune adresse à tenir à jour, et plus de requête
 * inter-origines donc plus de CORS du tout.
 *
 * La variable reste honorée si elle est posée : c'est ce qui permettra de viser un
 * serveur distinct en production, où le frontal et l'API ne partagent pas
 * forcément un hôte.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "";

class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

async function post<TReq, TRes>(path: string, body: TReq): Promise<TRes> {
  const res = await fetch(`${API_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: "Unknown error" }));
    throw new ApiError(res.status, err.detail ?? "Request failed");
  }

  return res.json() as Promise<TRes>;
}

async function get<TRes>(path: string): Promise<TRes> {
  const res = await fetch(`${API_URL}${path}`);
  if (!res.ok) throw new ApiError(res.status, "Request failed");
  return res.json() as Promise<TRes>;
}

// ─── Public API ────────────────────────────────

export const api = {
  runBacktest: (req: BacktestRequest) =>
    post<BacktestRequest, BacktestResponse>("/api/v1/backtest", req),

  runMonteCarlo: (req: MonteCarloRequest, target?: number) =>
    post<MonteCarloRequest, MonteCarloResult>(
      target && target > 0
        ? `/api/v1/monte-carlo-advanced?target=${target}`
        : "/api/v1/monte-carlo-advanced",
      req,
    ),

  validateTicker: (ticker: string) =>
    get<{ ticker: string; valid: boolean; name?: string }>(`/api/v1/validate-ticker/${ticker}`),

  getBenchmarks: () =>
    get<{ ticker: string; name: string }[]>("/api/v1/benchmarks"),
};
