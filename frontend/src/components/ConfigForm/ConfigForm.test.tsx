/**
 * Tests for ConfigForm strategy management.
 *
 * With the new design there is no "Compare" checkbox.
 * Strategy cards are always shown and the user can add/remove strategies
 * freely (min 1, max 4).
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import ConfigForm from "@/components/ConfigForm";

describe("ConfigForm strategy management", () => {
  const defaultProps = {
    onSubmit: vi.fn(),
    loading: false,
    taxRegions: null,
    countries: null,
  };

  it("shows Strategy 1 card by default", () => {
    render(<ConfigForm {...defaultProps} />);
    expect(screen.getByText("Strategy 1")).toBeInTheDocument();
  });

  it("shows Add strategy button by default", () => {
    render(<ConfigForm {...defaultProps} />);
    expect(
      screen.getByText("+ Add strategy to compare"),
    ).toBeInTheDocument();
  });

  it("does not show Remove when only one strategy exists", () => {
    render(<ConfigForm {...defaultProps} />);
    expect(screen.queryByText("Remove")).not.toBeInTheDocument();
  });

  it("can add a strategy card", () => {
    render(<ConfigForm {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    expect(screen.getByText("Strategy 1")).toBeInTheDocument();
    expect(screen.getByText("Strategy 2")).toBeInTheDocument();
  });

  it("shows Remove buttons when multiple strategies exist", () => {
    render(<ConfigForm {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    // Both cards get a Remove button
    expect(screen.getAllByText("Remove").length).toBe(2);
  });

  it("can remove a strategy", () => {
    render(<ConfigForm {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    expect(screen.getByText("Strategy 2")).toBeInTheDocument();
    // Click the first Remove button
    fireEvent.click(screen.getAllByText("Remove")[0]!);
    // Should still have one strategy
    expect(screen.getByText("Strategy 1")).toBeInTheDocument();
    expect(screen.queryByText("Strategy 2")).not.toBeInTheDocument();
  });

  it("can add up to 4 strategies total", () => {
    render(<ConfigForm {...defaultProps} />);
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    expect(screen.getByText("Strategy 4")).toBeInTheDocument();
    // Add button should be gone (max 4)
    expect(
      screen.queryByText("+ Add strategy to compare"),
    ).not.toBeInTheDocument();
  });

  it("submits strategy_configs when multiple strategies exist", () => {
    const onSubmit = vi.fn();
    render(<ConfigForm {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("+ Add strategy to compare"));
    fireEvent.click(screen.getByText("Run Simulation"));
    expect(onSubmit).toHaveBeenCalledOnce();
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.strategy_configs).toBeDefined();
    expect(payload.strategy_configs.length).toBe(2);
    expect(payload.strategy_config).toBeUndefined();
  });

  it("submits strategy_config (singular) when only one strategy", () => {
    const onSubmit = vi.fn();
    render(<ConfigForm {...defaultProps} onSubmit={onSubmit} />);
    fireEvent.click(screen.getByText("Run Simulation"));
    expect(onSubmit).toHaveBeenCalledOnce();
    const payload = onSubmit.mock.calls[0]![0];
    expect(payload.strategy_config).toBeDefined();
    expect(payload.strategy_configs).toBeUndefined();
  });
});
