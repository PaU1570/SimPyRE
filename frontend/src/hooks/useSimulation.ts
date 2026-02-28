import { useCallback, useState } from "react";
import {
  runSimulation,
  runAccumulation,
  runCombined,
  fetchTaxRegions,
  fetchCountries,
  ApiError,
} from "@/api/client";
import type {
  SimulationConfigPayload,
  AccumulationConfigPayload,
  CombinedConfigPayload,
  SimulationResponse,
  CombinedResponse,
  TaxRegionsResponse,
  CountriesResponse,
} from "@/types/simulation";

// ── useSimulation ────────────────────────────────────────────────

interface UseSimulationReturn {
  data: SimulationResponse | null;
  loading: boolean;
  error: string | null;
  run: (config: SimulationConfigPayload) => Promise<void>;
  reset: () => void;
}

export function useSimulation(): UseSimulationReturn {
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config: SimulationConfigPayload) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await runSimulation(config);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail =
          typeof err.body === "object" && err.body !== null && "detail" in err.body
            ? JSON.stringify((err.body as { detail: unknown }).detail)
            : String(err.body);
        setError(`Validation error: ${detail}`);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, run, reset };
}

// ── useTaxRegions ────────────────────────────────────────────────

export function useTaxRegions() {
  const [regions, setRegions] = useState<TaxRegionsResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (regions) return; // already loaded
    setLoading(true);
    try {
      setRegions(await fetchTaxRegions());
    } finally {
      setLoading(false);
    }
  }, [regions]);

  return { regions, loading, load };
}

// ── useCountries ─────────────────────────────────────────────────

export function useCountries() {
  const [countries, setCountries] = useState<CountriesResponse | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (countries) return;
    setLoading(true);
    try {
      setCountries(await fetchCountries());
    } finally {
      setLoading(false);
    }
  }, [countries]);

  return { countries, loading, load };
}

// ── useAccumulation ──────────────────────────────────────────────

interface UseAccumulationReturn {
  data: SimulationResponse | null;
  loading: boolean;
  error: string | null;
  run: (config: AccumulationConfigPayload) => Promise<void>;
  reset: () => void;
}

export function useAccumulation(): UseAccumulationReturn {
  const [data, setData] = useState<SimulationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config: AccumulationConfigPayload) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await runAccumulation(config);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail =
          typeof err.body === "object" && err.body !== null && "detail" in err.body
            ? JSON.stringify((err.body as { detail: unknown }).detail)
            : String(err.body);
        setError(`Validation error: ${detail}`);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, run, reset };
}

// ── useCombined ──────────────────────────────────────────────────

interface UseCombinedReturn {
  data: CombinedResponse | null;
  loading: boolean;
  error: string | null;
  run: (config: CombinedConfigPayload) => Promise<void>;
  reset: () => void;
}

export function useCombined(): UseCombinedReturn {
  const [data, setData] = useState<CombinedResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async (config: CombinedConfigPayload) => {
    setLoading(true);
    setError(null);
    setData(null);
    try {
      const result = await runCombined(config);
      setData(result);
    } catch (err) {
      if (err instanceof ApiError) {
        const detail =
          typeof err.body === "object" && err.body !== null && "detail" in err.body
            ? JSON.stringify((err.body as { detail: unknown }).detail)
            : String(err.body);
        setError(`Validation error: ${detail}`);
      } else {
        setError(err instanceof Error ? err.message : "Unknown error");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setData(null);
    setError(null);
  }, []);

  return { data, loading, error, run, reset };
}
