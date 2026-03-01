/**
 * Reusable strategy configuration fields.
 *
 * Renders a strategy-type selector and the type-specific parameter inputs
 * for a single StrategyConfig.  Used both in single-strategy mode and
 * for each card in compare-strategies mode.
 */

import type { StrategyConfig, StrategyType } from "@/types/simulation";

// ── Strategy label mapping ───────────────────────────────────────

export const STRATEGY_LABELS: Record<StrategyType, string> = {
  fixed_swr: "Fixed SWR",
  constant_dollar: "Constant Dollar",
  hebeler_autopilot_ii: "Hebeler Autopilot II",
  cash_buffer: "Cash Buffer",
};

// ── Strategy defaults ────────────────────────────────────────────

export function defaultStrategyConfig(type: StrategyType): StrategyConfig {
  switch (type) {
    case "fixed_swr":
      return {
        strategy_type: "fixed_swr",
        withdrawal_rate: 0.04,
        minimum_withdrawal: 30_000,
        maximum_withdrawal: Infinity,
      };
    case "constant_dollar":
      return { strategy_type: "constant_dollar", withdrawal_amount: 30_000 };
    case "hebeler_autopilot_ii":
      return {
        strategy_type: "hebeler_autopilot_ii",
        initial_withdrawal_rate: 0.04,
        previous_withdrawal_weight: 0.75,
        payout_horizon: 50,
        minimum_withdrawal: 30_000,
      };
    case "cash_buffer":
      return {
        strategy_type: "cash_buffer",
        withdrawal_rate_buffer: 0.01,
        subsistence_withdrawal: 30_000,
        standard_withdrawal: 40_000,
        maximum_withdrawal: 60_000,
        buffer_target: 100_000,
      };
  }
}

// ── Props ────────────────────────────────────────────────────────

interface StrategyFieldsProps {
  value: StrategyConfig;
  onChange: (value: StrategyConfig) => void;
  inputCls: string;
  /** Hide the type selector (useful when the parent handles that). */
  hideTypeSelector?: boolean;
}

// ── Component ────────────────────────────────────────────────────

export default function StrategyFields({
  value,
  onChange,
  inputCls,
  hideTypeSelector = false,
}: StrategyFieldsProps) {
  const handleTypeChange = (st: StrategyType) => onChange(defaultStrategyConfig(st));

  return (
    <>
      {/* Strategy type selector */}
      {!hideTypeSelector && (
        <Field label="Strategy">
          <select
            className={inputCls}
            value={value.strategy_type}
            onChange={(e) => handleTypeChange(e.target.value as StrategyType)}
          >
            <option value="fixed_swr">Fixed SWR</option>
            <option value="constant_dollar">Constant Dollar</option>
            <option value="hebeler_autopilot_ii">Hebeler Autopilot II</option>
            <option value="cash_buffer">Cash Buffer</option>
          </select>
        </Field>
      )}

      {/* ── Fixed SWR fields ─────────────────────────────────── */}
      {value.strategy_type === "fixed_swr" && (() => {
        const sc = value;
        return (
          <>
            <Field label="Withdrawal rate">
              <input
                type="number"
                className={inputCls}
                min={0}
                max={1}
                step={0.005}
                value={sc.withdrawal_rate}
                onChange={(e) =>
                  onChange({ ...sc, withdrawal_rate: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Min. withdrawal (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.minimum_withdrawal}
                onChange={(e) =>
                  onChange({ ...sc, minimum_withdrawal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Max. withdrawal (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.maximum_withdrawal === Infinity ? "" : sc.maximum_withdrawal}
                placeholder="∞ (no limit)"
                onChange={(e) =>
                  onChange({
                    ...sc,
                    maximum_withdrawal:
                      e.target.value === "" ? Infinity : Number(e.target.value),
                  })
                }
              />
            </Field>
          </>
        );
      })()}

      {/* ── Constant Dollar fields ───────────────────────────── */}
      {value.strategy_type === "constant_dollar" && (
        <Field label="Withdrawal amount (€)">
          <input
            type="number"
            className={inputCls}
            min={0}
            step={1000}
            value={value.withdrawal_amount}
            onChange={(e) =>
              onChange({
                strategy_type: "constant_dollar" as const,
                withdrawal_amount: Number(e.target.value),
              })
            }
          />
        </Field>
      )}

      {/* ── Hebeler Autopilot II fields ──────────────────────── */}
      {value.strategy_type === "hebeler_autopilot_ii" && (() => {
        const sc = value;
        return (
          <>
            <Field label="Initial withdrawal rate">
              <input
                type="number"
                className={inputCls}
                min={0}
                max={1}
                step={0.005}
                value={sc.initial_withdrawal_rate}
                onChange={(e) =>
                  onChange({ ...sc, initial_withdrawal_rate: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Prev. withdrawal weight">
              <input
                type="number"
                className={inputCls}
                min={0}
                max={1}
                step={0.05}
                value={sc.previous_withdrawal_weight}
                onChange={(e) =>
                  onChange({
                    ...sc,
                    previous_withdrawal_weight: Number(e.target.value),
                  })
                }
              />
            </Field>
            <Field label="Payout horizon (yrs)">
              <input
                type="number"
                className={inputCls}
                min={1}
                step={1}
                value={sc.payout_horizon}
                onChange={(e) =>
                  onChange({ ...sc, payout_horizon: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Min. withdrawal (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.minimum_withdrawal}
                onChange={(e) =>
                  onChange({ ...sc, minimum_withdrawal: Number(e.target.value) })
                }
              />
            </Field>
          </>
        );
      })()}

      {/* ── Cash Buffer fields ───────────────────────────────── */}
      {value.strategy_type === "cash_buffer" && (() => {
        const sc = value;
        return (
          <>
            <Field label="WR buffer (rate)">
              <input
                type="number"
                className={inputCls}
                min={0}
                max={1}
                step={0.005}
                value={sc.withdrawal_rate_buffer}
                onChange={(e) =>
                  onChange({ ...sc, withdrawal_rate_buffer: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Subsistence (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.subsistence_withdrawal}
                onChange={(e) =>
                  onChange({ ...sc, subsistence_withdrawal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Standard (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.standard_withdrawal}
                onChange={(e) =>
                  onChange({ ...sc, standard_withdrawal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Maximum (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={1000}
                value={sc.maximum_withdrawal}
                onChange={(e) =>
                  onChange({ ...sc, maximum_withdrawal: Number(e.target.value) })
                }
              />
            </Field>
            <Field label="Buffer target (€)">
              <input
                type="number"
                className={inputCls}
                min={0}
                step={10000}
                value={sc.buffer_target}
                onChange={(e) =>
                  onChange({ ...sc, buffer_target: Number(e.target.value) })
                }
              />
            </Field>
          </>
        );
      })()}
    </>
  );
}

// ── Sub-components ───────────────────────────────────────────────

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
