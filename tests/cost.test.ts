// Тесты рецептуры (расчёт себестоимости по составу).
import { describe, expect, it } from "vitest";
import {
  averageUnitPriceMinor,
  componentCostMinor,
  soldGoodsCostMinor,
  unitCostFromComponents,
} from "@/lib/calc/cost";

describe("Компонент per_unit", () => {
  it("зерно: 0.018 кг × 9 000 ₸/кг = 162 ₸", () => {
    expect(
      componentCostMinor(
        { kind: "per_unit", quantity: 0.018, unitCostMinor: 900_000n, percent: null },
        0n
      )
    ).toBe(16_200n);
  });
  it("стакан: 1 шт × 50 ₸ = 50 ₸", () => {
    expect(
      componentCostMinor(
        { kind: "per_unit", quantity: 1, unitCostMinor: 5_000n, percent: null },
        0n
      )
    ).toBe(5_000n);
  });
  it("нулевое количество или цена → 0", () => {
    expect(
      componentCostMinor({ kind: "per_unit", quantity: 0, unitCostMinor: 5_000n, percent: null }, 0n)
    ).toBe(0n);
  });
});

describe("Компонент percent_of_price", () => {
  it("комиссия 2 % от цены 1 500 ₸ = 30 ₸", () => {
    expect(
      componentCostMinor(
        { kind: "percent_of_price", quantity: 1, unitCostMinor: 0n, percent: 0.02 },
        150_000n
      )
    ).toBe(3_000n);
  });
  it("нулевая цена продажи → 0, деления на ноль нет", () => {
    expect(
      componentCostMinor(
        { kind: "percent_of_price", quantity: 1, unitCostMinor: 0n, percent: 0.02 },
        0n
      )
    ).toBe(0n);
  });
});

describe("Итог по составу", () => {
  it("капучино: зерно 162 + молоко 108 + стакан 50 + комиссия 30 = 350 ₸", () => {
    const total = unitCostFromComponents(
      [
        { kind: "per_unit", quantity: 0.018, unitCostMinor: 900_000n, percent: null },
        { kind: "per_unit", quantity: 0.18, unitCostMinor: 60_000n, percent: null },
        { kind: "per_unit", quantity: 1, unitCostMinor: 5_000n, percent: null },
        { kind: "percent_of_price", quantity: 1, unitCostMinor: 0n, percent: 0.02 },
      ],
      150_000n
    );
    expect(total).toBe(35_000n);
  });
  it("пустой состав → 0", () => {
    expect(unitCostFromComponents([], 150_000n)).toBe(0n);
  });
});

describe("Факт-проверка себестоимости", () => {
  it("себестоимость проданного: 350 ₸ × 120 шт = 42 000 ₸", () => {
    expect(soldGoodsCostMinor(35_000n, 120)).toBe(4_200_000n);
  });
  it("дробное количество: 350 ₸ × 2.5 = 875 ₸", () => {
    expect(soldGoodsCostMinor(35_000n, 2.5)).toBe(87_500n);
  });
  it("нулевое количество или себестоимость → 0", () => {
    expect(soldGoodsCostMinor(35_000n, 0)).toBe(0n);
    expect(soldGoodsCostMinor(0n, 10)).toBe(0n);
  });
  it("средняя цена: 180 000 ₸ выручки / 120 шт = 1 500 ₸", () => {
    expect(averageUnitPriceMinor(18_000_000n, 120)).toBe(150_000n);
  });
  it("ноль продаж → null, не ошибка деления", () => {
    expect(averageUnitPriceMinor(18_000_000n, 0)).toBeNull();
  });
});
