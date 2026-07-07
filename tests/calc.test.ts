// Приёмочные тесты SPEC раздел 14 (сценарии 1–4, 7, 10) для расчётного модуля.
import { describe, expect, it } from "vitest";
import { cashflowForAccount, cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonth } from "@/lib/calc/pnl";
import { accountBalance, balanceReport } from "@/lib/calc/balance";
import type { CalcAccount, CalcTxn } from "@/lib/calc/types";
import { monthEnd, monthStart } from "@/lib/period";

const kaspi: CalcAccount = { id: "kaspi", openingBalanceMinor: 0n };
const halyk: CalcAccount = { id: "halyk", openingBalanceMinor: 0n };
const accounts = [kaspi, halyk];

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

function txn(partial: Partial<CalcTxn> & Pick<CalcTxn, "type" | "amountMinor" | "dateCashflow">): CalcTxn {
  return {
    periodPnl: null,
    accountFromId: null,
    accountToId: null,
    includeInCashflow: true,
    includeInPnl: true,
    pnlGroup: null,
    affectsPnl: true,
    affectsCashflow: true,
    ...partial,
  };
}

// Период отчёта: март 2026 — выбранный, а не «текущий» (приёмочный тест 10).
const start = monthStart(2026, 3);
const end = monthEnd(2026, 3);
const march = monthStart(2026, 3);

describe("Тест 1: доход 100 000 ₸ на Kaspi", () => {
  const txns = [
    txn({ type: "income", amountMinor: 10_000_000n, dateCashflow: d("2026-03-10"), accountToId: "kaspi", periodPnl: march }),
  ];

  it("ДДС: поступления +100 000, остаток вырос", () => {
    const cf = cashflowSummary(txns, accounts, start, end);
    expect(cf.cashInMinor).toBe(10_000_000n);
    expect(cf.closingMinor).toBe(10_000_000n);
  });
  it("остаток Kaspi +100 000", () => {
    expect(accountBalance(txns, kaspi, end)).toBe(10_000_000n);
  });
  it("ОПУ: выручка +100 000 за март", () => {
    expect(pnlForMonth(txns, march).revenueMinor).toBe(10_000_000n);
  });
});

describe("Тест 2: расход 30 000 ₸ с Kaspi", () => {
  const txns = [
    txn({ type: "income", amountMinor: 10_000_000n, dateCashflow: d("2026-03-10"), accountToId: "kaspi", periodPnl: march }),
    txn({ type: "expense", amountMinor: 3_000_000n, dateCashflow: d("2026-03-12"), accountFromId: "kaspi", periodPnl: march, pnlGroup: "fixed" }),
  ];

  it("ДДС: выплаты 30 000, конечный остаток 70 000", () => {
    const cf = cashflowSummary(txns, accounts, start, end);
    expect(cf.cashOutMinor).toBe(3_000_000n);
    expect(cf.closingMinor).toBe(7_000_000n);
  });
  it("Kaspi −30 000", () => {
    expect(accountBalance(txns, kaspi, end)).toBe(7_000_000n);
  });
  it("ОПУ: расход учтён, прибыль ниже выручки", () => {
    const pnl = pnlForMonth(txns, march);
    expect(pnl.fixedExpensesMinor).toBe(3_000_000n);
    expect(pnl.netProfitMinor).toBe(7_000_000n);
  });
});

describe("Тест 3: перевод 50 000 ₸ Kaspi → Halyk", () => {
  const txns = [
    txn({ type: "income", amountMinor: 10_000_000n, dateCashflow: d("2026-03-01"), accountToId: "kaspi", periodPnl: march }),
    txn({ type: "transfer", amountMinor: 5_000_000n, dateCashflow: d("2026-03-15"), accountFromId: "kaspi", accountToId: "halyk" }),
  ];

  it("Kaspi −50 000, Halyk +50 000", () => {
    expect(accountBalance(txns, kaspi, end)).toBe(5_000_000n);
    expect(accountBalance(txns, halyk, end)).toBe(5_000_000n);
  });
  it("общий остаток не изменился", () => {
    const cf = cashflowSummary(txns, accounts, start, end);
    expect(cf.closingMinor).toBe(10_000_000n);
    expect(cf.cashOutMinor).toBe(0n); // перевод — не расход
  });
  it("ОПУ без изменений от перевода", () => {
    const pnl = pnlForMonth(txns, march);
    expect(pnl.revenueMinor).toBe(10_000_000n);
    expect(pnl.fixedExpensesMinor + pnl.variableExpensesMinor + pnl.otherExpensesMinor).toBe(0n);
  });
  it("по одному счёту переводы видны", () => {
    const cf = cashflowForAccount(txns, halyk, start, end);
    expect(cf.transferInMinor).toBe(5_000_000n);
    expect(cf.closingMinor).toBe(5_000_000n);
  });
});

describe("Тест 4: нулевая выручка при наличии расходов", () => {
  const txns = [
    txn({ type: "expense", amountMinor: 2_000_000n, dateCashflow: d("2026-03-05"), accountFromId: "kaspi", periodPnl: march, pnlGroup: "fixed" }),
  ];

  it("прибыль отрицательная, рентабельность = null (без ошибки)", () => {
    const pnl = pnlForMonth(txns, march);
    expect(pnl.netProfitMinor).toBe(-2_000_000n);
    expect(pnl.profitability).toBeNull();
  });
});

describe("Тест 7 (аналог): доли счетов при нулевом общем остатке", () => {
  it("share = null, деления на ноль нет", () => {
    const report = balanceReport([], accounts, start, end);
    expect(report.totalClosingMinor).toBe(0n);
    for (const row of report.rows) expect(row.share).toBeNull();
  });
});

describe("Тест 10: отчёт строится по выбранному периоду", () => {
  const txns = [
    txn({ type: "income", amountMinor: 1_000_000n, dateCashflow: d("2026-02-20"), accountToId: "kaspi", periodPnl: monthStart(2026, 2) }),
    txn({ type: "income", amountMinor: 2_000_000n, dateCashflow: d("2026-03-20"), accountToId: "kaspi", periodPnl: march }),
    txn({ type: "income", amountMinor: 4_000_000n, dateCashflow: d("2026-04-20"), accountToId: "kaspi", periodPnl: monthStart(2026, 4) }),
  ];

  it("в ДДС марта — только мартовская операция, февраль — в начальном остатке", () => {
    const cf = cashflowSummary(txns, accounts, start, end);
    expect(cf.openingMinor).toBe(1_000_000n);
    expect(cf.cashInMinor).toBe(2_000_000n);
    expect(cf.closingMinor).toBe(3_000_000n);
  });
  it("в ОПУ марта — только мартовская выручка", () => {
    expect(pnlForMonth(txns, march).revenueMinor).toBe(2_000_000n);
  });
});

describe("Разделение ДДС и ОПУ (правило 2)", () => {
  it("оплата в марте за апрельский период попадает в ДДС марта и ОПУ апреля", () => {
    const txns = [
      txn({ type: "income", amountMinor: 5_000_000n, dateCashflow: d("2026-03-25"), accountToId: "kaspi", periodPnl: monthStart(2026, 4) }),
    ];
    expect(cashflowSummary(txns, accounts, start, end).cashInMinor).toBe(5_000_000n);
    expect(pnlForMonth(txns, march).revenueMinor).toBe(0n);
    expect(pnlForMonth(txns, monthStart(2026, 4)).revenueMinor).toBe(5_000_000n);
  });
});
