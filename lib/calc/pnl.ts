// ОПУ (отчёт о прибылях и убытках) — SPEC раздел 6.2.
// Считается по period_pnl (экономический месяц), НЕ по дате движения денег.
// Рентабельность при нулевой выручке = null («нет данных»), а не ошибка.

import { safeRatio } from "@/lib/money";
import type { CalcTxn } from "./types";

export interface PnlReport {
  revenueMinor: bigint;
  /**
   * Себестоимость проданных и списанных товаров за период (из складского модуля).
   * Признаётся в момент продажи, а не в момент закупки: закупленный впрок товар
   * не должен обваливать прибыль того месяца, когда за него заплатили.
   */
  goodsCostMinor: bigint;
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

/** Порядковый номер месяца — для сравнения периодов без учёта дня. */
function monthKey(d: Date): number {
  return d.getUTCFullYear() * 12 + d.getUTCMonth();
}

function inPnl(t: CalcTxn, months: Set<number>): boolean {
  if (!t.includeInPnl || !t.affectsPnl) return false;
  if (t.type === "transfer") return false; // перевод — не доход и не расход
  if (t.periodPnl === null) return false;
  return months.has(monthKey(t.periodPnl));
}

export interface PnlOptions {
  /** Себестоимость проданных товаров за тот же период — из lib/calc/stock.ts. */
  goodsCostMinor?: bigint;
}

/** ОПУ за месяц (month — 1-е число месяца). */
export function pnlForMonth(txns: CalcTxn[], month: Date, opts?: PnlOptions): PnlReport {
  return pnlForMonths(txns, [month], opts);
}

/**
 * ОПУ за несколько месяцев — квартал, полугодие, год, произвольный диапазон месяцев.
 * Накопительный итог: показатели суммируются, рентабельность считается от суммарной выручки
 * (а не как среднее помесячных — это разные числа).
 */
export function pnlForMonths(txns: CalcTxn[], months: Date[], opts?: PnlOptions): PnlReport {
  const keys = new Set(months.map(monthKey));
  const goodsCost = opts?.goodsCostMinor ?? 0n;
  let revenue = 0n;
  let variable = 0n;
  let fixed = 0n;
  let payroll = 0n;
  let taxes = 0n;
  let interest = 0n;
  let depreciation = 0n;
  let other = 0n;

  for (const t of txns) {
    if (!inPnl(t, keys)) continue;
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

  // себестоимость товара — такой же переменный расход, но приходит не из операций,
  // а из складских списаний: она привязана к дате продажи, а не к дате оплаты закупки
  const grossProfit = revenue - variable - goodsCost;
  const operatingProfit = grossProfit - fixed - payroll - other;
  const netProfit = operatingProfit - taxes - interest - depreciation;

  return {
    revenueMinor: revenue,
    goodsCostMinor: goodsCost,
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
