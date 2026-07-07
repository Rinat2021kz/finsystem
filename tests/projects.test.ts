// Приёмочный тест 5 SPEC (проект с долгом) + защита делений (тесты 4/7 по аналогии).
import { describe, expect, it } from "vitest";
import { projectMetrics } from "@/lib/calc/projects";

describe("Тест 5: проект с долгом", () => {
  // стоимость 500 000, оплачено 200 000, расходы 100 000
  const metrics = projectMetrics(50_000_000n, [
    { type: "income", amountMinor: 20_000_000n },
    { type: "expense", amountMinor: 10_000_000n },
  ]);

  it("долг 300 000", () => {
    expect(metrics.debtMinor).toBe(30_000_000n);
  });
  it("плановая маржа 400 000", () => {
    expect(metrics.plannedMarginMinor).toBe(40_000_000n);
  });
  it("кассовая маржа 100 000", () => {
    expect(metrics.cashMarginMinor).toBe(10_000_000n);
  });
  it("рентабельности считаются", () => {
    expect(metrics.plannedProfitability).toBeCloseTo(0.8);
    expect(metrics.cashProfitability).toBeCloseTo(0.5);
  });
});

describe("Защита от деления на ноль в проектах", () => {
  it("нулевая стоимость договора → плановая рентабельность null", () => {
    const m = projectMetrics(0n, [{ type: "expense", amountMinor: 1_000n }]);
    expect(m.plannedProfitability).toBeNull();
  });
  it("нет оплат → кассовая рентабельность null", () => {
    const m = projectMetrics(50_000_000n, [{ type: "expense", amountMinor: 1_000n }]);
    expect(m.cashProfitability).toBeNull();
  });
  it("переводы не влияют на показатели", () => {
    const m = projectMetrics(50_000_000n, [
      { type: "income", amountMinor: 20_000_000n },
      { type: "transfer", amountMinor: 99_000_000n },
    ]);
    expect(m.paidFactMinor).toBe(20_000_000n);
    expect(m.expensesMinor).toBe(0n);
  });
});
