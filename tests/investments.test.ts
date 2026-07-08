// Приёмочные тесты 6 и 7 SPEC + формулы раздела 6.7.
import { describe, expect, it } from "vitest";
import {
  investmentReturns,
  investorDividendMinor,
  investorShare,
  totalInvestmentMinor,
} from "@/lib/calc/investments";

describe("Тест 6: доля инвестора", () => {
  it("10 000 000 при оценке 40 000 000 → 25 %", () => {
    expect(investorShare(1_000_000_000n, 4_000_000_000n)).toBe(0.25);
  });
  it("нулевая оценка → null, деления на ноль нет", () => {
    expect(investorShare(1_000_000_000n, 0n)).toBeNull();
  });
});

describe("Тест 7: ROI при нулевых инвестициях", () => {
  it("ROI = null, не ошибка", () => {
    const r = investmentReturns([100_000n, 100_000n], 0n);
    expect(r.roi).toBeNull();
    expect(r.paybackIndex).toBeNull();
  });
});

describe("Формулы 6.7", () => {
  it("total_investment суммирует статьи", () => {
    expect(
      totalInvestmentMinor([{ totalCostMinor: 100n }, { totalCostMinor: 250n }])
    ).toBe(350n);
  });
  it("дивиденд: прибыль 1 000 000 ₸ × политика 50 % × доля 25 % = 125 000 ₸", () => {
    expect(investorDividendMinor(100_000_000n, 0.5, 0.25)).toBe(12_500_000n);
  });
  it("дивиденд при убытке = 0", () => {
    expect(investorDividendMinor(-100_000_000n, 0.5, 0.25)).toBe(0n);
  });
  it("окупаемость: инвестиции 300, дивиденды по 100 → 3-й месяц (индекс 2), ROI 1/3", () => {
    const r = investmentReturns([100n, 100n, 100n, 100n], 300n);
    expect(r.paybackIndex).toBe(2);
    expect(r.cumulativeMinor).toEqual([100n, 200n, 300n, 400n]);
    expect(r.roi).toBeCloseTo(400 / 300 - 1);
  });
  it("не окупается в горизонте → paybackIndex null", () => {
    const r = investmentReturns([100n], 1_000n);
    expect(r.paybackIndex).toBeNull();
  });
});
