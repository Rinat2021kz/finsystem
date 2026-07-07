// ОПУ (отчёт о прибылях и убытках) — SPEC раздел 6.2.
// Считается по period_pnl (экономический месяц), НЕ по дате движения денег.
// Рентабельность при нулевой выручке = null («нет данных»), а не ошибка.

import { safeRatio } from "@/lib/money";
import { sameMonth } from "@/lib/period";
import type { CalcTxn } from "./types";

export interface PnlReport {
  revenueMinor: bigint;
  variableExpensesMinor: bigint;
  grossProfitMinor: bigint;
  fixedExpensesMinor: bigint;
  payrollMinor: bigint;
  operatingProfitMinor: bigint;
  taxesMinor: bigint;
  interestMinor: bigint;
  depreciationMinor: bigint;
  otherExpensesMinor: bigint;
  netProfitMinor: bigint;
  /** net_profit / revenue; null если выручка ≤ 0. */
  profitability: number | null;
}

function inPnl(t: CalcTxn, month: Date): boolean {
  if (!t.includeInPnl || !t.affectsPnl) return false;
  if (t.type === "transfer") return false; // перевод — не доход и не расход
  if (t.periodPnl === null) return false;
  return sameMonth(t.periodPnl, month);
}

/** ОПУ за месяц (month — 1-е число месяца). */
export function pnlForMonth(txns: CalcTxn[], month: Date): PnlReport {
  let revenue = 0n;
  let variable = 0n;
  let fixed = 0n;
  let payroll = 0n;
  let taxes = 0n;
  let interest = 0n;
  let depreciation = 0n;
  let other = 0n;

  for (const t of txns) {
    if (!inPnl(t, month)) continue;
    if (t.type === "income") {
      revenue += t.amountMinor;
      continue;
    }
    // расход: раскладываем по группе категории
    switch (t.pnlGroup) {
      case "variable":
        variable += t.amountMinor;
        break;
      case "payroll":
        payroll += t.amountMinor;
        break;
      case "tax":
        taxes += t.amountMinor;
        break;
      case "interest":
        interest += t.amountMinor;
        break;
      case "depreciation":
        depreciation += t.amountMinor;
        break;
      case "fixed":
        fixed += t.amountMinor;
        break;
      default:
        // категория без группы — считаем прочим постоянным расходом
        other += t.amountMinor;
        break;
    }
  }

  const grossProfit = revenue - variable;
  const operatingProfit = grossProfit - fixed - payroll - other;
  const netProfit = operatingProfit - taxes - interest - depreciation;

  return {
    revenueMinor: revenue,
    variableExpensesMinor: variable,
    grossProfitMinor: grossProfit,
    fixedExpensesMinor: fixed,
    payrollMinor: payroll,
    operatingProfitMinor: operatingProfit,
    taxesMinor: taxes,
    interestMinor: interest,
    depreciationMinor: depreciation,
    otherExpensesMinor: other,
    netProfitMinor: netProfit,
    profitability: revenue > 0n ? safeRatio(netProfit, revenue) : null,
  };
}
