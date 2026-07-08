// План расходов — SPEC раздел 6.6.
// fixed/one_time/payroll/debt_interest = сумма; percent_of_revenue/tax = выручка × процент;
// per_unit = количество × ставка за единицу.

export type ExpensePlanKind =
  | "fixed"
  | "percent_of_revenue"
  | "per_unit"
  | "one_time"
  | "payroll"
  | "tax"
  | "debt_interest";

export interface ExpensePlanRowCalc {
  expenseType: ExpensePlanKind;
  amountMinor: bigint | null;
  /** Доля от выручки, до 4 знаков (0.05 = 5 %). */
  percentOfRevenue: number | null;
  amountPerUnitMinor: bigint | null;
}

export interface ExpensePlanContext {
  /** Плановая выручка месяца (для процентных статей). */
  revenueMinor: bigint;
  /** Плановое количество продаж месяца (для per_unit). */
  units: number;
}

/** Плановая сумма статьи расходов за месяц. */
export function plannedExpenseMinor(
  row: ExpensePlanRowCalc,
  ctx: ExpensePlanContext
): bigint {
  switch (row.expenseType) {
    case "fixed":
    case "one_time":
    case "payroll":
    case "debt_interest":
      return row.amountMinor ?? 0n;
    case "percent_of_revenue":
    case "tax": {
      if (row.percentOfRevenue === null || row.percentOfRevenue <= 0) return 0n;
      const pct = BigInt(Math.round(row.percentOfRevenue * 10000));
      return (ctx.revenueMinor * pct) / 10_000n;
    }
    case "per_unit": {
      if (row.amountPerUnitMinor === null || ctx.units <= 0) return 0n;
      const unitsCents = BigInt(Math.round(ctx.units * 100));
      return (row.amountPerUnitMinor * unitsCents) / 100n;
    }
  }
}

/** Сумма всех статей плана за месяц. */
export function totalPlannedExpensesMinor(
  rows: ExpensePlanRowCalc[],
  ctx: ExpensePlanContext
): bigint {
  let total = 0n;
  for (const r of rows) total += plannedExpenseMinor(r, ctx);
  return total;
}
