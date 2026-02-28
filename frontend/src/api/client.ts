/**
 * Typed fetch wrappers for the SimPyRE API.
 *
 * In dev mode Vite proxies /api → http://localhost:8000, so we use
 * relative URLs everywhere.
 */

import type {
  SimulationConfigPayload,
  AccumulationConfigPayload,
  CombinedConfigPayload,
  SimulationResponse,
  CombinedResponse,
  TaxRegionsResponse,
  CountriesResponse,
  ValidationResponse,
} from "@/types/simulation";

const BASE = "/api";

// ── Helpers ──────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(
    public status: number,
    public body: unknown,
  ) {
    super(`API ${status}`);
    this.name = "ApiError";
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => res.statusText);
    throw new ApiError(res.status, body);
  }
  return res.json() as Promise<T>;
}

// ── Public API ───────────────────────────────────────────────────

export async function healthCheck(): Promise<{ status: string }> {
  return request(`${BASE}/health`);
}

export async function validateConfig(
  payload: SimulationConfigPayload,
): Promise<ValidationResponse> {
  return request(`${BASE}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function runSimulation(
  payload: SimulationConfigPayload,
): Promise<SimulationResponse> {
  return request(`${BASE}/simulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function fetchTaxRegions(): Promise<TaxRegionsResponse> {
  return request(`${BASE}/tax-regions`);
}

export async function fetchCountries(): Promise<CountriesResponse> {
  return request(`${BASE}/scenarios/countries`);
}

export async function runAccumulation(
  payload: AccumulationConfigPayload,
): Promise<SimulationResponse> {
  return request(`${BASE}/accumulate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export async function runCombined(
  payload: CombinedConfigPayload,
): Promise<CombinedResponse> {
  return request(`${BASE}/combined`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
}

export { ApiError };
