import { describe, expect, it } from "vitest";
import { formatMoney, formatPercent, parseTenge, safeRatio } from "@/lib/money";

describe("parseTenge", () => {
  it("парсит целые тенге в тиыны", () => {
    expect(parseTenge("100000")).toBe(10_000_000n);
    expect(parseTenge("3 750 000")).toBe(375_000_000n);
  });
  it("парсит копейки через запятую и точку", () => {
    expect(parseTenge("1250,50")).toBe(125_050n);
    expect(parseTenge("1250.5")).toBe(125_050n);
  });
  it("отклоняет мусор", () => {
    expect(parseTenge("abc")).toBeNull();
    expect(parseTenge("")).toBeNull();
    expect(parseTenge("12.345")).toBeNull();
  });
});

describe("formatMoney", () => {
  it("форматирует с разрядами и символом тенге", () => {
    expect(formatMoney(375_000_000n)).toBe("3 750 000 ₸");
    expect(formatMoney(0n)).toBe("0 ₸");
  });
  it("отрицательные значения", () => {
    expect(formatMoney(-5_000_000n)).toBe("−50 000 ₸");
  });
});

describe("safeRatio — никаких Excel-ошибок", () => {
  it("обычное деление", () => {
    expect(safeRatio(50n, 200n)).toBe(0.25);
  });
  it("деление на ноль → null, не исключение", () => {
    expect(safeRatio(100n, 0n)).toBeNull();
  });
  it("formatPercent(null) → «нет данных»", () => {
    expect(formatPercent(null)).toBe("нет данных");
    expect(formatPercent(0.253)).toBe("25,3 %");
  });
});
