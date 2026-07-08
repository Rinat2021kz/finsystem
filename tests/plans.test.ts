// Тесты планов продаж (SPEC 6.5) и расходов (SPEC 6.6).
import { describe, expect, it } from "vitest";
import {
  plannedRevenueForMonth,
  plannedUnitsForMonth,
  projectQuantities,
  rowRevenueMinor,
} from "@/lib/calc/sales";
import { plannedExpenseMinor, totalPlannedExpensesMinor } from "@/lib/calc/expenses";
import { monthStart } from "@/lib/period";

describe("План продаж", () => {
  it("рост количества: 100 при +10 % → 100, 110, 121", () => {
    expect(projectQuantities(100, 0.1, 3)).toEqual([100, 110, 121]);
  });
  it("дробные количества в прогнозе", () => {
    expect(projectQuantities(10, 0.05, 3, false)).toEqual([10, 10.5, 11.03]);
  });
  it("выручка строки: 5 000 ₸ × 100 шт × 1.2 = 600 000 ₸", () => {
    const revenue = rowRevenueMinor({
      productId: null,
      month: monthStart(2026, 7),
      plannedPriceMinor: 500_000n,
      plannedQuantity: 100,
      seasonalityFactor: 1.2,
    });
    expect(revenue).toBe(60_000_000n);
  });
  it("выручка и количество месяца суммируются по строкам", () => {
    const july = monthStart(2026, 7);
    const rows = [
      { productId: "a", month: july, plannedPriceMinor: 100_000n, plannedQuantity: 10, seasonalityFactor: 1 },
      { productId: "b", month: july, plannedPriceMinor: 200_000n, plannedQuantity: 5, seasonalityFactor: 1 },
      { productId: "a", month: monthStart(2026, 8), plannedPriceMinor: 100_000n, plannedQuantity: 99, seasonalityFactor: 1 },
    ];
    expect(plannedRevenueForMonth(rows, july)).toBe(2_000_000n);
    expect(plannedUnitsForMonth(rows, july)).toBe(15);
  });
});

describe("План расходов", () => {
  const ctx = { revenueMinor: 100_000_000n, units: 50 }; // выручка 1 000 000 ₸, 50 продаж

  it("фиксированный и разовый — по сумме", () => {
    expect(
      plannedExpenseMinor(
        { expenseType: "fixed", amountMinor: 5_000_000n, percentOfRevenue: null, amountPerUnitMinor: null },
        ctx
      )
    ).toBe(5_000_000n);
  });
  it("процент от выручки: 5 % от 1 000 000 = 50 000 ₸", () => {
    expect(
      plannedExpenseMinor(
        { expenseType: "percent_of_revenue", amountMinor: null, percentOfRevenue: 0.05, amountPerUnitMinor: null },
        ctx
      )
    ).toBe(5_000_000n);
  });
  it("на единицу: 1 000 ₸ × 50 = 50 000 ₸", () => {
    expect(
      plannedExpenseMinor(
        { expenseType: "per_unit", amountMinor: null, percentOfRevenue: null, amountPerUnitMinor: 100_000n },
        ctx
      )
    ).toBe(5_000_000n);
  });
  it("итого по статьям", () => {
    const total = totalPlannedExpensesMinor(
      [
        { expenseType: "fixed", amountMinor: 5_000_000n, percentOfRevenue: null, amountPerUnitMinor: null },
        { expenseType: "tax", amountMinor: null, percentOfRevenue: 0.03, amountPerUnitMinor: null },
      ],
      ctx
    );
    expect(total).toBe(8_000_000n);
  });
  it("нулевая выручка у процентной статьи → 0, без ошибок", () => {
    expect(
      plannedExpenseMinor(
        { expenseType: "tax", amountMinor: null, percentOfRevenue: 0.1, amountPerUnitMinor: null },
        { revenueMinor: 0n, units: 0 }
      )
    ).toBe(0n);
  });
});
