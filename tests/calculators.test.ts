// Тесты калькуляторов планирования (SPEC 4.12).
import { describe, expect, it } from "vitest";
import { breakEven, cacLtv, unitEconomics } from "@/lib/calc/calculators";

describe("Юнит-экономика", () => {
  it("чек 10 000, переменные 4 000, CAC 2 000 → маржа 4 000, масштабировать", () => {
    const r = unitEconomics({
      priceMinor: 1_000_000n,
      variableMinor: 400_000n,
      cacMinor: 200_000n,
    });
    expect(r.marginMinor).toBe(400_000n);
    expect(r.marginRatio).toBeCloseTo(0.4);
    expect(r.scale).toBe(true);
  });
  it("отрицательная маржа → не масштабировать", () => {
    const r = unitEconomics({ priceMinor: 100_000n, variableMinor: 80_000n, cacMinor: 50_000n });
    expect(r.scale).toBe(false);
  });
  it("нулевой чек → доля маржи null, без ошибки", () => {
    expect(unitEconomics({ priceMinor: 0n, variableMinor: 0n, cacMinor: 0n }).marginRatio).toBeNull();
  });
});

describe("Точка безубыточности", () => {
  it("постоянные 300 000, маржа 4 000 → 75 продаж", () => {
    expect(breakEven(30_000_000n, 400_000n).unitsToBreakEven).toBe(75);
  });
  it("цель +100 000 → (300 000 + 100 000) / 4 000 = 100 продаж", () => {
    expect(breakEven(30_000_000n, 400_000n, 10_000_000n).unitsForTarget).toBe(100);
  });
  it("неполная продажа округляется вверх", () => {
    expect(breakEven(10_000n, 3_000n).unitsToBreakEven).toBe(4);
  });
  it("маржа ≤ 0 → null, деления на ноль нет", () => {
    const r = breakEven(30_000_000n, 0n);
    expect(r.unitsToBreakEven).toBeNull();
    expect(r.unitsForTarget).toBeNull();
  });
});

describe("CAC / LTV", () => {
  it("бюджет 100 000 на 20 клиентов → CAC 5 000; маржа 4 000 × 3 покупки → LTV 12 000", () => {
    const r = cacLtv(10_000_000n, 20, 400_000n, 3);
    expect(r.cacMinor).toBe(500_000n);
    expect(r.ltvMinor).toBe(1_200_000n);
    expect(r.ltvToCac).toBeCloseTo(2.4);
    expect(r.paybackPurchases).toBe(2); // 5 000 / 4 000 → вторая покупка окупает
  });
  it("ноль клиентов → CAC null, без ошибки", () => {
    const r = cacLtv(10_000_000n, 0, 400_000n, 3);
    expect(r.cacMinor).toBeNull();
    expect(r.ltvToCac).toBeNull();
    expect(r.paybackPurchases).toBeNull();
  });
});
