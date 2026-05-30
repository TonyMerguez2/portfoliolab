"use client";

import { useState } from "react";
import { api } from "@/lib/api";
import type { BacktestRequest, BacktestResponse } from "@/types";

interface UseBacktestReturn {
  data: BacktestResponse | null;
  isLoading: boolean;
  error: string | null;
  run: (req: BacktestRequest) => Promise<void>;
  reset: () => void;
}

export function useBacktest(): UseBacktestReturn {
  const [data, setData] = useState<BacktestResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (req: BacktestRequest) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await api.runBacktest(req);
      setData(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "An unexpected error occurred.";
      setError(msg);
    } finally {
      setIsLoading(false);
    }
  };

  const reset = () => {
    setData(null);
    setError(null);
  };

  return { data, isLoading, error, run, reset };
}
