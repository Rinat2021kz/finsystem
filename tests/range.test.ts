// Тесты единого периода (lib/range.ts) и накопительного ОПУ.
import { describe, expect, it } from "vitest";
import {
  monthsInRange,
  rangeFromSearchParams,
  rangeToQuery,
  snapToMonths,
} from "@/lib/range";
import { pnlForMonths } from "@/lib/calc/pnl";
import type { CalcTxn } from "@/lib/calc/types";

const iso = (d: Date) => d.toISOString().slice(0, 10);

describe("Разбор периода", () => {
  it("месяц: границы — первый и последний день", () => {
    const r = rangeFromSearchParams({ preset: "month", year: "2026", month: "2" });
    expect(iso(r.from)).toBe("2026-02-01");
    expect(iso(r.to)).toBe("2026-02-28");
    expect(r.label).toBe("Февраль 2026");
  });

  it("квартал: II квартал — апрель…июнь", () => {
    const r = rangeFromSearchParams({ preset: "quarter", year: "2026", part: "2" });
    expect(iso(r.from)).toBe("2026-04-01");
    expect(iso(r.to)).toBe("2026-06-30");
    expect(r.label).toBe("II квартал 2026");
  });

  it("полугодие и 9 месяцев", () => {
    const half = rangeFromSearchParams({ preset: "half", year: "2025", part: "1" });
    expect(iso(half.from)).toBe("2025-01-01");
    expect(iso(half.to)).toBe("2025-06-30");
    const nine = rangeFromSearchParams({ preset: "nine", year: "2025" });
    expect(iso(nine.to)).toBe("2025-09-30");
  });

  it("год: весь календарный год", () => {
    const r = rangeFromSearchParams({ preset: "year", year: "2025" });
    expect(iso(r.from)).toBe("2025-01-01");
    expect(iso(r.to)).toBe("2025-12-31");
  });

  it("произвольный период сохраняет заданные даты", () => {
    const r = rangeFromSearchParams({ preset: "custom", from: "2026-03-17", to: "2026-04-22" });
    expect(iso(r.from)).toBe("2026-03-17");
    expect(iso(r.to)).toBe("2026-04-22");
  });

  it("битые даты не ломают отчёт — откат к месяцу", () => {
    const r = rangeFromSearchParams({ preset: "custom", from: "не дата", to: "" , year: "2026", month: "5" });
    expect(r.preset).toBe("month");
    expect(iso(r.from)).toBe("2026-05-01");
  });

  it("перевёрнутый диапазон (конец раньше начала) не принимается", () => {
    const r = rangeFromSearchParams({
      preset: "custom",
      from: "2026-05-10",
      to: "2026-05-01",
      year: "2026",
      month: "5",
    });
    expect(r.preset).toBe("month");
  });
});

describe("Месяцы периода", () => {
  it("список месяцев через границу года", () => {
    const months = monthsInRange(new Date(Date.UTC(2025, 10, 15)), new Date(Date.UTC(2026, 1, 3)));
    expect(months.map(iso)).toEqual(["2025-11-01", "2025-12-01", "2026-01-01", "2026-02-01"]);
  });

  it("округление произвольного периода до целых месяцев (для ОПУ)", () => {
    const r = snapToMonths(
      rangeFromSearchParams({ preset: "custom", from: "2026-03-17", to: "2026-04-22" })
    );
    expect(iso(r.from)).toBe("2026-03-01");
    expect(iso(r.to)).toBe("2026-04-30");
    expect(r.label).toBe("Март 2026 — Апрель 2026");
  });
});

describe("Период в query-строку", () => {
  it("квартал восстанавливается из своей же ссылки", () => {
    const r = rangeFromSearchParams({ preset: "quarter", year: "2026", part: "3" });
    const back = rangeFromSearchParams(
      Object.fromEntries(new URLSearchParams(rangeToQuery(r)).entries())
    );
    expect(iso(back.from)).toBe(iso(r.from));
    expect(iso(back.to)).toBe(iso(r.to));
  });
});

describe("ОПУ за период больше месяца", () => {
  const txn = (month: number, type: "income" | "expense", amount: bigint): CalcTxn => ({
    type,
    amountMinor: amount,
    dateCashflow: new Date(Date.UTC(2026, month - 1, 10)),
    periodPnl: new Date(Date.UTC(2026, month - 1, 1)),
    accountFromId: null,
    accountToId: null,
    includeInCashflow: true,
    includeInPnl: true,
    pnlGroup: type === "income" ? "revenue" : "fixed",
    affectsPnl: true,
    affectsCashflow: true,
  });

  // январь +500, февраль −100, март +700 → квартал +1 100
  const txns: CalcTxn[] = [
    txn(1, "income", 1_000_00n),
    txn(1, "expense", 500_00n),
    txn(2, "income", 400_00n),
    txn(2, "expense", 500_00n),
    txn(3, "income", 1_200_00n),
    txn(3, "expense", 500_00n),
  ];
  const months = monthsInRange(new Date(Date.UTC(2026, 0, 1)), new Date(Date.UTC(2026, 2, 31)));

  it("прибыль за квартал — сумма месяцев, а не среднее", () => {
    const q = pnlForMonths(txns, months);
    expect(q.netProfitMinor).toBe(1_100_00n);
    expect(q.revenueMinor).toBe(2_600_00n);
  });

  it("рентабельность считается от суммарной выручки", () => {
    const q = pnlForMonths(txns, months);
    expect(q.profitability).toBeCloseTo(1_100 / 2_600, 6);
  });

  it("месяцы вне периода не попадают в итог", () => {
    const q = pnlForMonths(txns, [new Date(Date.UTC(2026, 0, 1))]);
    expect(q.netProfitMinor).toBe(500_00n);
  });

  it("пустой период — нули и «нет данных» вместо ошибки деления", () => {
    const q = pnlForMonths(txns, [new Date(Date.UTC(2030, 0, 1))]);
    expect(q.revenueMinor).toBe(0n);
    expect(q.profitability).toBeNull();
  });
});
