// Показатели проекта — SPEC раздел 6.4.
// paid_fact = Σ доходов проекта; debt = стоимость − оплачено;
// расходы проекта; плановая и кассовая маржа; рентабельности с защитой деления.

import { safeRatio } from "@/lib/money";

export interface ProjectTxn {
  type: "income" | "expense" | "transfer";
  amountMinor: bigint;
}

export interface ProjectMetrics {
  paidFactMinor: bigint;
  debtMinor: bigint;
  /** Все расходы проекта: деньгами + материалами со склада. */
  expensesMinor: bigint;
  /** Из них — себестоимость материалов, списанных на проект со склада. */
  materialsCostMinor: bigint;
  plannedMarginMinor: bigint;
  cashMarginMinor: bigint;
  /** planned_margin / contract_value; null если стоимость договора ≤ 0. */
  plannedProfitability: number | null;
  /** cash_margin / paid_fact; null если оплат ещё не было. */
  cashProfitability: number | null;
}

/**
 * @param materialsCostMinor Себестоимость материалов, списанных на проект со склада.
 *   Это реальные затраты заказа, за которые деньги ушли раньше — при закупке.
 */
export function projectMetrics(
  contractValueMinor: bigint,
  txns: ProjectTxn[],
  materialsCostMinor: bigint = 0n
): ProjectMetrics {
  let paid = 0n;
  let cashExpenses = 0n;
  for (const t of txns) {
    if (t.type === "income") paid += t.amountMinor;
    else if (t.type === "expense") cashExpenses += t.amountMinor;
    // переводы не влияют на показатели проекта
  }

  const expenses = cashExpenses + materialsCostMinor;
  const plannedMargin = contractValueMinor - expenses;
  const cashMargin = paid - expenses;

  return {
    paidFactMinor: paid,
    debtMinor: contractValueMinor - paid,
    expensesMinor: expenses,
    materialsCostMinor,
    plannedMarginMinor: plannedMargin,
    cashMarginMinor: cashMargin,
    plannedProfitability:
      contractValueMinor > 0n ? safeRatio(plannedMargin, contractValueMinor) : null,
    cashProfitability: paid > 0n ? safeRatio(cashMargin, paid) : null,
  };
}
