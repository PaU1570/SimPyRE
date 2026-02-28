import { useEffect, useState } from "react";
import type {
  AccumulationConfigPayload,
  ScenarioConfig,
  TaxRegionsResponse,
  CountriesResponse,
} from "@/types/simulation";

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_CONFIG: AccumulationConfigPayload = {
  monthly_savings: 1_500,
  annual_increase: 0.02,
  target_value: 500_000,
  initial_portfolio: {
    portfolio_value: 0,
    allocation: { stocks: 0.8, bonds: 0.15, cash: 0.05 },
  },
  rebalance: true,
  scenario_config: {
    scenario_type: "historical",
    scenario_years: 25,
    country: "spain",
    chunk_years: 5,
    shuffle: true,
    randomize_start: false,
    cash_return: 0.01,
  },
  tax_config: {
    country: "spain",
    region: "biscay",
    adjust_brackets_with_inflation: true,
  },
  simulation_years: 25,
  num_simulations: 100,
};

// ── Props ────────────────────────────────────────────────────────

interface AccumulationFormProps {
  onSubmit: (config: AccumulationConfigPayload) => void;
  loading: boolean;
  taxRegions: TaxRegionsResponse | null;
  countries: CountriesResponse | null;
}

// ── Component ────────────────────────────────────────────────────

export default function AccumulationForm({
  onSubmit,
  loading,
  taxRegions,
  countries,
}: AccumulationFormProps) {
  const [config, setConfig] = useState<AccumulationConfigPayload>(DEFAULT_CONFIG);

  // Keep scenario_years in sync with simulation_years
  useEffect(() => {
    setConfig((prev) => ({
      ...prev,
      scenario_config: {
        ...prev.scenario_config,
        scenario_years: prev.simulation_years,
      },
    }));
  }, [config.simulation_years]);

  // ── Helpers ────────────────────────────────────────────────────

  function set<K extends keyof AccumulationConfigPayload>(
    key: K,
    value: AccumulationConfigPayload[K],
  ) {
    setConfig((prev) => ({ ...prev, [key]: value }));
  }

  function setScenario<K extends keyof ScenarioConfig>(
    key: K,
    value: ScenarioConfig[K],
  ) {
    setConfig((prev) => ({
      ...prev,
      scenario_config: { ...prev.scenario_config, [key]: value },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    onSubmit(config);
  }

  const scenarioType = config.scenario_config.scenario_type;

  // ── Tax region options ─────────────────────────────────────────

  const taxCountries = taxRegions ? Object.keys(taxRegions) : [];
  const taxRegionList =
    taxRegions && config.tax_config.country in taxRegions
      ? taxRegions[config.tax_config.country]!
      : [];

  // ── Country options (for historical scenarios) ─────────────────

  const countryKeys = countries ? Object.keys(countries) : [];

  // ── Render ─────────────────────────────────────────────────────

  const inputCls =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* ── Savings ────────────────────────────────────────────── */}
      <Section title="Savings Plan">
        <Field label="Monthly savings (€) in today's money">
          <input
            type="number"
            className={inputCls}
            min={0}
            step={100}
            value={config.monthly_savings}
            onChange={(e) => set("monthly_savings", Number(e.target.value))}
          />
        </Field>
        <Field label="Expected annual increase (nominal)">
          <input
            type="number"
            className={inputCls}
            min={0}
            max={1}
            step={0.005}
            value={config.annual_increase}
            onChange={(e) => set("annual_increase", Number(e.target.value))}
          />
        </Field>
        <Field label="Target portfolio value (€, today's money) — 0 = none">
          <input
            type="number"
            className={inputCls}
            min={0}
            step={10_000}
            value={config.target_value}
            onChange={(e) => set("target_value", Number(e.target.value))}
          />
        </Field>
      </Section>

      {/* ── Portfolio ──────────────────────────────────────────── */}
      <Section title="Portfolio">
        <Field label="Initial value (€) — existing savings">
          <input
            type="number"
            className={inputCls}
            min={0}
            step={1000}
            value={config.initial_portfolio.portfolio_value}
            onChange={(e) =>
              set("initial_portfolio", {
                ...config.initial_portfolio,
                portfolio_value: Number(e.target.value),
              })
            }
          />
        </Field>

        <div className="grid grid-cols-3 gap-3">
          {(["stocks", "bonds", "cash"] as const).map((asset) => (
            <Field key={asset} label={`${asset} %`}>
              <input
                type="number"
                className={inputCls}
                min={0}
                max={100}
                step={1}
                value={Math.round(
                  config.initial_portfolio.allocation[asset] * 100,
                )}
                onChange={(e) => {
                  const pct = Number(e.target.value) / 100;
                  set("initial_portfolio", {
                    ...config.initial_portfolio,
                    allocation: {
                      ...config.initial_portfolio.allocation,
                      [asset]: pct,
                    },
                  });
                }}
              />
            </Field>
          ))}
        </div>
        <Field label="Rebalance annually">
          <div className="flex items-center h-[38px]">
            <input
              type="checkbox"
              className="h-4 w-4 rounded border-gray-300 text-primary-600"
              checked={config.rebalance}
              onChange={(e) => set("rebalance", e.target.checked)}
            />
          </div>
        </Field>
      </Section>

      {/* ── Simulation ────────────────────────────────────────── */}
      <Section title="Simulation">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Years">
            <input
              type="number"
              className={inputCls}
              min={1}
              max={100}
              value={config.simulation_years}
              onChange={(e) => set("simulation_years", Number(e.target.value))}
            />
          </Field>
          <Field label="# of runs">
            <input
              type="number"
              className={inputCls}
              min={1}
              max={10000}
              value={config.num_simulations}
              onChange={(e) => set("num_simulations", Number(e.target.value))}
            />
          </Field>
        </div>
      </Section>

      {/* ── Scenario ──────────────────────────────────────────── */}
      <Section title="Scenario">
        <Field label="Type">
          <select
            className={inputCls}
            value={scenarioType}
            onChange={(e) => {
              const type = e.target.value as "historical" | "monte_carlo";
              if (type === "historical") {
                setConfig((prev) => ({
                  ...prev,
                  scenario_config: {
                    scenario_type: "historical",
                    scenario_years: prev.simulation_years,
                    country: "spain",
                    chunk_years: 5,
                    shuffle: true,
                    randomize_start: false,
                    cash_return: 0.01,
                  },
                }));
              } else {
                setConfig((prev) => ({
                  ...prev,
                  scenario_config: {
                    scenario_type: "monte_carlo",
                    scenario_years: prev.simulation_years,
                    mean_stock_return: 0.08,
                    std_stock_return: 0.15,
                    mean_bond_return: 0.03,
                    std_bond_return: 0.05,
                    mean_inflation: 0.025,
                    std_inflation: 0.01,
                    cash_return: 0.01,
                  },
                }));
              }
            }}
          >
            <option value="historical">Historical</option>
            <option value="monte_carlo">Monte Carlo</option>
          </select>
        </Field>

        {scenarioType === "historical" && (
          <>
            <Field label="Country">
              <select
                className={inputCls}
                value={
                  config.scenario_config.scenario_type === "historical"
                    ? config.scenario_config.country
                    : ""
                }
                onChange={(e) => setScenario("country" as never, e.target.value as never)}
              >
                {countryKeys.length > 0 ? (
                  countryKeys.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))
                ) : (
                  <option value="spain">spain</option>
                )}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Chunk years">
                <input
                  type="number"
                  className={inputCls}
                  min={0}
                  value={
                    config.scenario_config.scenario_type === "historical"
                      ? config.scenario_config.chunk_years ?? 0
                      : 0
                  }
                  onChange={(e) =>
                    setScenario(
                      "chunk_years" as never,
                      (Number(e.target.value) || null) as never,
                    )
                  }
                />
              </Field>
              <Field label="Shuffle">
                <div className="flex items-center h-[38px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    checked={
                      config.scenario_config.scenario_type === "historical"
                        ? config.scenario_config.shuffle
                        : false
                    }
                    onChange={(e) =>
                      setScenario("shuffle" as never, e.target.checked as never)
                    }
                  />
                </div>
              </Field>
              <Field label="Randomize start">
                <div className="flex items-center h-[38px]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-gray-300 text-primary-600"
                    checked={
                      config.scenario_config.scenario_type === "historical"
                        ? config.scenario_config.randomize_start
                        : false
                    }
                    onChange={(e) =>
                      setScenario("randomize_start" as never, e.target.checked as never)
                    }
                  />
                </div>
              </Field>
            </div>
          </>
        )}

        {scenarioType === "monte_carlo" && (
          <div className="grid grid-cols-2 gap-3">
            {(
              [
                ["mean_stock_return", "Mean stock ret."],
                ["std_stock_return", "Std stock ret."],
                ["mean_bond_return", "Mean bond ret."],
                ["std_bond_return", "Std bond ret."],
                ["mean_inflation", "Mean inflation"],
                ["std_inflation", "Std inflation"],
              ] as const
            ).map(([key, label]) => (
              <Field key={key} label={label}>
                <input
                  type="number"
                  className={inputCls}
                  step={0.001}
                  value={
                    config.scenario_config.scenario_type === "monte_carlo"
                      ? config.scenario_config[key]
                      : 0
                  }
                  onChange={(e) =>
                    setScenario(key as never, Number(e.target.value) as never)
                  }
                />
              </Field>
            ))}
          </div>
        )}
        <Field label="Cash return">
          <input
            type="number"
            className={inputCls}
            step={0.001}
            value={config.scenario_config.cash_return}
            onChange={(e) =>
              setScenario("cash_return" as never, Number(e.target.value) as never)
            }
          />
        </Field>
      </Section>

      {/* ── Tax ───────────────────────────────────────────────── */}
      <Section title="Tax">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <select
              className={inputCls}
              value={config.tax_config.country}
              onChange={(e) =>
                set("tax_config", {
                  ...config.tax_config,
                  country: e.target.value,
                  region: "",
                })
              }
            >
              <option value="none">None</option>
              {taxCountries.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Region">
            <select
              className={inputCls}
              value={config.tax_config.region}
              onChange={(e) =>
                set("tax_config", {
                  ...config.tax_config,
                  region: e.target.value,
                })
              }
            >
              <option value="">— select —</option>
              {taxRegionList.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500"
            checked={config.tax_config.adjust_brackets_with_inflation}
            onChange={(e) =>
              set("tax_config", {
                ...config.tax_config,
                adjust_brackets_with_inflation: e.target.checked,
              })
            }
          />
          Adjust tax brackets with inflation
        </label>
      </Section>

      {/* ── Submit ────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Running…" : "Run Simulation"}
      </button>
    </form>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-1 w-full">
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="block text-xs font-medium text-gray-600 mb-1">
        {label}
      </span>
      {children}
    </label>
  );
}
