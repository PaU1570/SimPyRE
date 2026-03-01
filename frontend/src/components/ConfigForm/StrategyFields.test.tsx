/**
 * Tests for the StrategyFields component.
 *
 * Verifies:
 * - Renders strategy type selector by default
 * - Shows correct fields for each strategy type
 * - Calls onChange when values are modified
 * - hideTypeSelector prop works
 * - defaultStrategyConfig factory returns correct defaults
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import StrategyFields, {
  defaultStrategyConfig,
  STRATEGY_LABELS,
} from "@/components/ConfigForm/StrategyFields";
import type { StrategyConfig } from "@/types/simulation";

const inputCls = "test-input";

describe("STRATEGY_LABELS", () => {
  it("has labels for all 4 strategy types", () => {
    expect(STRATEGY_LABELS.fixed_swr).toBe("Fixed SWR");
    expect(STRATEGY_LABELS.constant_dollar).toBe("Constant Dollar");
    expect(STRATEGY_LABELS.hebeler_autopilot_ii).toBe("Hebeler Autopilot II");
    expect(STRATEGY_LABELS.cash_buffer).toBe("Cash Buffer");
  });
});

describe("defaultStrategyConfig", () => {
  it("returns a valid fixed_swr config", () => {
    const cfg = defaultStrategyConfig("fixed_swr");
    expect(cfg.strategy_type).toBe("fixed_swr");
    expect("withdrawal_rate" in cfg).toBe(true);
  });

  it("returns a valid constant_dollar config", () => {
    const cfg = defaultStrategyConfig("constant_dollar");
    expect(cfg.strategy_type).toBe("constant_dollar");
    expect("withdrawal_amount" in cfg).toBe(true);
  });

  it("returns a valid hebeler_autopilot_ii config", () => {
    const cfg = defaultStrategyConfig("hebeler_autopilot_ii");
    expect(cfg.strategy_type).toBe("hebeler_autopilot_ii");
    expect("initial_withdrawal_rate" in cfg).toBe(true);
    expect("payout_horizon" in cfg).toBe(true);
  });

  it("returns a valid cash_buffer config", () => {
    const cfg = defaultStrategyConfig("cash_buffer");
    expect(cfg.strategy_type).toBe("cash_buffer");
    expect("buffer_target" in cfg).toBe(true);
    expect("subsistence_withdrawal" in cfg).toBe(true);
  });
});

describe("StrategyFields", () => {
  const fixedSwr: StrategyConfig = {
    strategy_type: "fixed_swr",
    withdrawal_rate: 0.04,
    minimum_withdrawal: 30000,
    maximum_withdrawal: Infinity,
  };

  it("renders a strategy type selector by default", () => {
    render(
      <StrategyFields value={fixedSwr} onChange={vi.fn()} inputCls={inputCls} />,
    );
    const select = screen.getByDisplayValue("Fixed SWR");
    expect(select).toBeInTheDocument();
  });

  it("hides the type selector when hideTypeSelector is true", () => {
    render(
      <StrategyFields
        value={fixedSwr}
        onChange={vi.fn()}
        inputCls={inputCls}
        hideTypeSelector
      />,
    );
    expect(screen.queryByDisplayValue("Fixed SWR")).not.toBeInTheDocument();
  });

  it("shows fixed_swr fields", () => {
    render(
      <StrategyFields value={fixedSwr} onChange={vi.fn()} inputCls={inputCls} />,
    );
    expect(screen.getByText("Withdrawal rate")).toBeInTheDocument();
    expect(screen.getByText("Min. withdrawal (€)")).toBeInTheDocument();
    expect(screen.getByText("Max. withdrawal (€)")).toBeInTheDocument();
  });

  it("shows constant_dollar fields", () => {
    const cfg: StrategyConfig = {
      strategy_type: "constant_dollar",
      withdrawal_amount: 40000,
    };
    render(
      <StrategyFields value={cfg} onChange={vi.fn()} inputCls={inputCls} />,
    );
    expect(screen.getByText("Withdrawal amount (€)")).toBeInTheDocument();
  });

  it("shows hebeler_autopilot_ii fields", () => {
    const cfg: StrategyConfig = {
      strategy_type: "hebeler_autopilot_ii",
      initial_withdrawal_rate: 0.04,
      previous_withdrawal_weight: 0.75,
      payout_horizon: 50,
      minimum_withdrawal: 30000,
    };
    render(
      <StrategyFields value={cfg} onChange={vi.fn()} inputCls={inputCls} />,
    );
    expect(screen.getByText("Initial withdrawal rate")).toBeInTheDocument();
    expect(screen.getByText("Prev. withdrawal weight")).toBeInTheDocument();
    expect(screen.getByText("Payout horizon (yrs)")).toBeInTheDocument();
  });

  it("shows cash_buffer fields", () => {
    const cfg: StrategyConfig = {
      strategy_type: "cash_buffer",
      withdrawal_rate_buffer: 0.01,
      subsistence_withdrawal: 20000,
      standard_withdrawal: 40000,
      maximum_withdrawal: 60000,
      buffer_target: 100000,
    };
    render(
      <StrategyFields value={cfg} onChange={vi.fn()} inputCls={inputCls} />,
    );
    expect(screen.getByText("WR buffer (rate)")).toBeInTheDocument();
    expect(screen.getByText("Subsistence (€)")).toBeInTheDocument();
    expect(screen.getByText("Buffer target (€)")).toBeInTheDocument();
  });

  it("calls onChange when strategy type is changed", () => {
    const onChange = vi.fn();
    render(
      <StrategyFields value={fixedSwr} onChange={onChange} inputCls={inputCls} />,
    );
    const select = screen.getByDisplayValue("Fixed SWR");
    fireEvent.change(select, { target: { value: "constant_dollar" } });
    expect(onChange).toHaveBeenCalledOnce();
    const newConfig = onChange.mock.calls[0]![0] as StrategyConfig;
    expect(newConfig.strategy_type).toBe("constant_dollar");
  });

  it("calls onChange when a numeric field is changed", () => {
    const onChange = vi.fn();
    render(
      <StrategyFields value={fixedSwr} onChange={onChange} inputCls={inputCls} />,
    );
    const rateInput = screen.getByDisplayValue("0.04");
    fireEvent.change(rateInput, { target: { value: "0.05" } });
    expect(onChange).toHaveBeenCalledOnce();
  });
});
