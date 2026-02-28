import { useState } from "react";
import type {
  CombinedConfigPayload,
  Allocation,
  ScenarioConfig,
  StrategyConfig,
  StrategyType,
  TaxConfig,
  TaxRegionsResponse,
  CountriesResponse,
} from "@/types/simulation";

// ── Defaults ─────────────────────────────────────────────────────

const DEFAULT_SCENARIO: ScenarioConfig = {
  scenario_type: "historical",
  scenario_years: 25, // will be overwritten on submit
  country: "spain",
  chunk_years: 5,
  shuffle: true,
  randomize_start: false,
  cash_return: 0.01,
};

const DEFAULT_TAX: TaxConfig = {
  country: "spain",
  region: "biscay",
  adjust_brackets_with_inflation: true,
};

const DEFAULT_STRATEGY: StrategyConfig = {
  strategy_type: "fixed_swr" as const,
  withdrawal_rate: 0.04,
  minimum_withdrawal: 30_000,
};

// ── Props ────────────────────────────────────────────────────────

interface CombinedFormProps {
  onSubmit: (config: CombinedConfigPayload) => void;
  loading: boolean;
  taxRegions: TaxRegionsResponse | null;
  countries: CountriesResponse | null;
}

// ── Component ────────────────────────────────────────────────────

export default function CombinedForm({
  onSubmit,
  loading,
  taxRegions,
  countries,
}: CombinedFormProps) {
  // ── Unified state ──────────────────────────────────────────────
  const [monthlySavings, setMonthlySavings] = useState(1_500);
  const [annualIncrease, setAnnualIncrease] = useState(0.02);
  const [targetValue, setTargetValue] = useState(500_000);
  const [portfolioValue, setPortfolioValue] = useState(0);
  const [allocation, setAllocation] = useState<Allocation>({ stocks: 0.8, bonds: 0.15, cash: 0.05 });
  const [rebalance, setRebalance] = useState(true);
  const [accYears, setAccYears] = useState(25);
  const [retYears, setRetYears] = useState(30);
  const [numSimulations, setNumSimulations] = useState(100);
  const [scenario, setScenario] = useState<ScenarioConfig>(DEFAULT_SCENARIO);
  const [tax, setTax] = useState<TaxConfig>(DEFAULT_TAX);
  const [strategy, setStrategy] = useState<StrategyConfig>(DEFAULT_STRATEGY);

  // ── Helpers ────────────────────────────────────────────────────

  function setScenarioField<K extends keyof ScenarioConfig>(key: K, value: ScenarioConfig[K]) {
    setScenario((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const totalYearsScenario = { ...scenario, scenario_years: accYears + retYears };
    onSubmit({
      accumulation_config: {
        monthly_savings: monthlySavings,
        annual_increase: annualIncrease,
        target_value: targetValue,
        initial_portfolio: { portfolio_value: portfolioValue, allocation },
        rebalance,
        scenario_config: totalYearsScenario,
        tax_config: tax,
        simulation_years: accYears,
        num_simulations: numSimulations,
      },
      withdrawal_config: {
        initial_portfolio: { portfolio_value: 0, allocation },
        rebalance,
        scenario_config: totalYearsScenario,
        strategy_config: strategy,
        tax_config: tax,
        simulation_years: retYears,
        num_simulations: numSimulations,
      },
      scenario_config: totalYearsScenario,
      num_simulations: numSimulations,
    });
  }

  // ── Derived ────────────────────────────────────────────────────

  const taxCountries = taxRegions ? Object.keys(taxRegions) : [];
  const taxRegionList = taxRegions && tax.country in taxRegions ? taxRegions[tax.country]! : [];
  const countryKeys = countries ? Object.keys(countries) : [];
  const scenarioType = scenario.scenario_type;
  const totalYears = accYears + retYears;

  // ── Render ─────────────────────────────────────────────────────

  const inputCls =
    "w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm shadow-sm focus:border-primary-500 focus:outline-none focus:ring-1 focus:ring-primary-500";

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Savings Plan */}
      <Section title="Savings Plan">
        <Field label="Monthly savings (€) in today's money">
          <input type="number" className={inputCls} min={0} step={100} value={monthlySavings} onChange={(e) => setMonthlySavings(Number(e.target.value))} />
        </Field>
        <Field label="Expected annual increase (nominal)">
          <input type="number" className={inputCls} min={0} max={1} step={0.005} value={annualIncrease} onChange={(e) => setAnnualIncrease(Number(e.target.value))} />
        </Field>
        <Field label="Target portfolio value (€, today's money) — 0 = none">
          <input type="number" className={inputCls} min={0} step={10_000} value={targetValue} onChange={(e) => setTargetValue(Number(e.target.value))} />
        </Field>
      </Section>

      {/* Portfolio */}
      <Section title="Initial Portfolio">
        <Field label="Value (€) — existing savings">
          <input type="number" className={inputCls} min={0} step={1000} value={portfolioValue} onChange={(e) => setPortfolioValue(Number(e.target.value))} />
        </Field>
        <div className="grid grid-cols-3 gap-3">
          {(["stocks", "bonds", "cash"] as const).map((asset) => (
            <Field key={asset} label={`${asset} %`}>
              <input type="number" className={inputCls} min={0} max={100} step={1} value={Math.round(allocation[asset] * 100)} onChange={(e) => setAllocation((prev) => ({ ...prev, [asset]: Number(e.target.value) / 100 }))} />
            </Field>
          ))}
        </div>
        <Field label="Rebalance annually">
          <div className="flex items-center h-[38px]">
            <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600" checked={rebalance} onChange={(e) => setRebalance(e.target.checked)} />
          </div>
        </Field>
      </Section>

      {/* Timeline */}
      <Section title="Timeline">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Accumulation years">
            <input type="number" className={inputCls} min={1} max={100} value={accYears} onChange={(e) => setAccYears(Number(e.target.value))} />
          </Field>
          <Field label="Retirement years">
            <input type="number" className={inputCls} min={1} max={100} value={retYears} onChange={(e) => setRetYears(Number(e.target.value))} />
          </Field>
        </div>
        <p className="text-xs text-gray-500">Total simulation: <span className="font-semibold">{totalYears}</span> years</p>
        <Field label="# of runs">
          <input type="number" className={inputCls} min={1} max={10000} value={numSimulations} onChange={(e) => setNumSimulations(Number(e.target.value))} />
        </Field>
      </Section>

      {/* Withdrawal Strategy */}
      <Section title="Withdrawal Strategy">
        <Field label="Type">
          <select className={inputCls} value={strategy.strategy_type} onChange={(e) => {
            const st = e.target.value as StrategyType;
            if (st === "fixed_swr") setStrategy({ strategy_type: "fixed_swr", withdrawal_rate: 0.04, minimum_withdrawal: 30_000 });
            else if (st === "constant_dollar") setStrategy({ strategy_type: "constant_dollar", withdrawal_amount: 60_000 });
            else setStrategy({ strategy_type: "hebeler_autopilot_ii", initial_withdrawal_rate: 0.04, previous_withdrawal_weight: 0.6, payout_horizon: 30, minimum_withdrawal: 30_000 });
          }}>
            <option value="fixed_swr">Fixed SWR</option>
            <option value="constant_dollar">Constant Dollar</option>
            <option value="hebeler_autopilot_ii">Hebeler Autopilot II</option>
          </select>
        </Field>

        {strategy.strategy_type === "fixed_swr" && (() => {
          const sc = strategy;
          return (
            <>
              <Field label="Withdrawal rate">
                <input type="number" className={inputCls} step={0.005} min={0} max={1} value={sc.withdrawal_rate} onChange={(e) => setStrategy({ strategy_type: "fixed_swr" as const, withdrawal_rate: Number(e.target.value), minimum_withdrawal: sc.minimum_withdrawal })} />
              </Field>
              <Field label="Minimum withdrawal (€)">
                <input type="number" className={inputCls} step={1000} min={0} value={sc.minimum_withdrawal} onChange={(e) => setStrategy({ strategy_type: "fixed_swr" as const, withdrawal_rate: sc.withdrawal_rate, minimum_withdrawal: Number(e.target.value) })} />
              </Field>
            </>
          );
        })()}
        {strategy.strategy_type === "constant_dollar" && (
          <Field label="Withdrawal amount (€)">
            <input type="number" className={inputCls} step={1000} min={0} value={strategy.withdrawal_amount} onChange={(e) => setStrategy({ strategy_type: "constant_dollar" as const, withdrawal_amount: Number(e.target.value) })} />
          </Field>
        )}
        {strategy.strategy_type === "hebeler_autopilot_ii" && (() => {
          const sc = strategy;
          return (
            <>
              <Field label="Initial withdrawal rate">
                <input type="number" className={inputCls} step={0.005} min={0} max={1} value={sc.initial_withdrawal_rate} onChange={(e) => setStrategy({ ...sc, initial_withdrawal_rate: Number(e.target.value) })} />
              </Field>
              <Field label="Previous withdrawal weight">
                <input type="number" className={inputCls} step={0.05} min={0} max={1} value={sc.previous_withdrawal_weight} onChange={(e) => setStrategy({ ...sc, previous_withdrawal_weight: Number(e.target.value) })} />
              </Field>
              <Field label="Payout horizon (years)">
                <input type="number" className={inputCls} min={1} max={100} value={sc.payout_horizon} onChange={(e) => setStrategy({ ...sc, payout_horizon: Number(e.target.value) })} />
              </Field>
              <Field label="Minimum withdrawal (€)">
                <input type="number" className={inputCls} step={1000} min={0} value={sc.minimum_withdrawal} onChange={(e) => setStrategy({ ...sc, minimum_withdrawal: Number(e.target.value) })} />
              </Field>
            </>
          );
        })()}
      </Section>

      {/* Scenario (shared) */}
      <Section title="Scenario">
        <Field label="Type">
          <select className={inputCls} value={scenarioType} onChange={(e) => {
            const type = e.target.value as "historical" | "monte_carlo";
            if (type === "historical") {
              setScenario({ scenario_type: "historical", scenario_years: accYears, country: "spain", chunk_years: 5, shuffle: true, randomize_start: false, cash_return: 0.01 });
            } else {
              setScenario({ scenario_type: "monte_carlo", scenario_years: accYears, mean_stock_return: 0.08, std_stock_return: 0.15, mean_bond_return: 0.03, std_bond_return: 0.05, mean_inflation: 0.025, std_inflation: 0.01, cash_return: 0.01 });
            }
          }}>
            <option value="historical">Historical</option>
            <option value="monte_carlo">Monte Carlo</option>
          </select>
        </Field>
        {scenarioType === "historical" && (
          <>
            <Field label="Country">
              <select className={inputCls} value={scenario.scenario_type === "historical" ? scenario.country : ""} onChange={(e) => setScenarioField("country" as never, e.target.value as never)}>
                {countryKeys.length > 0 ? countryKeys.map((c) => <option key={c} value={c}>{c}</option>) : <option value="spain">spain</option>}
              </select>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Chunk years">
                <input type="number" className={inputCls} min={0} value={scenario.scenario_type === "historical" ? scenario.chunk_years ?? 0 : 0} onChange={(e) => setScenarioField("chunk_years" as never, (Number(e.target.value) || null) as never)} />
              </Field>
              <Field label="Shuffle">
                <div className="flex items-center h-[38px]"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600" checked={scenario.scenario_type === "historical" ? scenario.shuffle : false} onChange={(e) => setScenarioField("shuffle" as never, e.target.checked as never)} /></div>
              </Field>
              <Field label="Randomize start">
                <div className="flex items-center h-[38px]"><input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600" checked={scenario.scenario_type === "historical" ? scenario.randomize_start : false} onChange={(e) => setScenarioField("randomize_start" as never, e.target.checked as never)} /></div>
              </Field>
            </div>
          </>
        )}
        {scenarioType === "monte_carlo" && (
          <div className="grid grid-cols-2 gap-3">
            {([["mean_stock_return", "Mean stock ret."], ["std_stock_return", "Std stock ret."], ["mean_bond_return", "Mean bond ret."], ["std_bond_return", "Std bond ret."], ["mean_inflation", "Mean inflation"], ["std_inflation", "Std inflation"]] as const).map(([key, label]) => (
              <Field key={key} label={label}>
                <input type="number" className={inputCls} step={0.001} value={scenario.scenario_type === "monte_carlo" ? scenario[key] : 0} onChange={(e) => setScenarioField(key as never, Number(e.target.value) as never)} />
              </Field>
            ))}
          </div>
        )}
        <Field label="Cash return">
          <input type="number" className={inputCls} step={0.001} value={scenario.cash_return} onChange={(e) => setScenarioField("cash_return" as never, Number(e.target.value) as never)} />
        </Field>
      </Section>

      {/* Tax (shared) */}
      <Section title="Tax">
        <div className="grid grid-cols-2 gap-3">
          <Field label="Country">
            <select className={inputCls} value={tax.country} onChange={(e) => setTax({ ...tax, country: e.target.value, region: "" })}>
              <option value="none">None</option>
              {taxCountries.map((c) => <option key={c} value={c}>{c}</option>)}
            </select>
          </Field>
          <Field label="Region">
            <select className={inputCls} value={tax.region} onChange={(e) => setTax({ ...tax, region: e.target.value })}>
              <option value="">— select —</option>
              {taxRegionList.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
          </Field>
        </div>
        <label className="mt-2 flex items-center gap-2 text-xs font-medium text-gray-700 cursor-pointer">
          <input type="checkbox" className="h-4 w-4 rounded border-gray-300 text-primary-600 focus:ring-primary-500" checked={tax.adjust_brackets_with_inflation} onChange={(e) => setTax({ ...tax, adjust_brackets_with_inflation: e.target.checked })} />
          Adjust tax brackets with inflation
        </label>
      </Section>

      {/* ── Submit ────────────────────────────────────────────── */}
      <button
        type="submit"
        disabled={loading}
        className="w-full rounded-lg bg-primary-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-primary-700 focus:outline-none focus:ring-2 focus:ring-primary-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Running…" : "Run Combined Simulation"}
      </button>
    </form>
  );
}

// ── Sub-components ───────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="space-y-3">
      <legend className="text-sm font-semibold text-gray-800 border-b border-gray-200 pb-1 w-full">{title}</legend>
      {children}
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-xs font-medium text-gray-700">{label}</span>
      {children}
    </label>
  );
}
