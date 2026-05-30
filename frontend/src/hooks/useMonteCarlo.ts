"use client";
import { useState } from "react";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface MonteCarloParams {
  assets: { ticker: string; weight: number }[];
  period?: string;
  horizon_years: number;
  n_simulations?: number;
  initial_investment?: number;
  target_value?: number;
  lang?: string;
}

export interface GoalAnalysis {
  target_value: number;
  probability_of_reaching: number;
  reached_by_p5: boolean;
  reached_by_p50: boolean;
  reached_by_p95: boolean;
  years_to_reach_optimistic: number | null;
  years_to_reach_median: number | null;
  years_to_reach_pessimistic: number | null;
}

export interface DistributionBucket {
  range_min: number;
  range_max: number;
  count: number;
  pct: number;
}

export interface CumulativePoint {
  value: number;
  probability: number;
}

export interface MonteCarloResult {
  percentiles: Record<string, { date: string; value: number }[]>;
  probability_of_loss: number;
  expected_final_value: number;
  initial_investment: number;
  final_values_p5: number;
  final_values_p50: number;
  final_values_p95: number;
  goal_analysis: GoalAnalysis | null;
  distribution: DistributionBucket[];
  cumulative_curve: CumulativePoint[];
  robustness_score: number;
  robustness_label: string;
  robustness_color: string;
  robustness_reasons: string[];
  annualized_return: number;
  annualized_volatility: number;
}

export function useMonteCarlo() {
  const [data, setData] = useState<MonteCarloResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (params: MonteCarloParams) => {
    setIsLoading(true);
    setError(null);
    try {
      const url = params.target_value
        ? `${API_URL}/api/v1/monte-carlo-advanced?target=${params.target_value}`
        : `${API_URL}/api/v1/monte-carlo-advanced`;

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...params, period: params.period ?? "5y" }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ detail: "Erreur inconnue" }));
        throw new Error(err.detail ?? "Erreur");
      }
      setData(await res.json());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur inattendue");
    } finally {
      setIsLoading(false);
    }
  };

  return { data, isLoading, error, run };
}
