import type {
  BacktestRequest,
  BacktestResponse,
  MonteCarloRequest,
  MonteCarloResult,
} from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

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
