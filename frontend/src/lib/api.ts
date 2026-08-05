import type {
  BacktestRequest,
  BacktestResponse,
  MonteCarloRequest,
  MonteCarloResult,
} from "@/types";

/**
 * L'adresse du serveur.
 *
 * Elle était aussi écrite en dur à une quarantaine d'endroits. Tant qu'on ouvre
 * le site sur la machine qui l'héberge, cela marche ; depuis un autre appareil
 * du réseau, « localhost » désigne *cet* appareil, et les appels vont chercher
 * un serveur qui n'y est pas.
 *
 * Le repli garde le confort d'avant : sans variable, rien ne change. Pour
 * ouvrir le site depuis un autre poste, poser dans `frontend/.env.local` :
 *
 *     NEXT_PUBLIC_API_URL=http://192.168.1.142:8000
 *
 * puis relancer `npm run dev` — Next lit ces variables au démarrage et les fige
 * dans le code envoyé au navigateur.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
