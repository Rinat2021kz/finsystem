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
  expensesMinor: bigint;
  plannedMarginMinor: bigint;
  cashMarginMinor: bigint;
  /** planned_margin / contract_value; null если стоимость договора ≤ 0. */
  plannedProfitability: number | null;
  /** cash_margin / paid_fact; null если оплат ещё не было. */
  cashProfitability: number | null;
}

export function projectMetrics(
  contractValueMinor: bigint,
  txns: ProjectTxn[]
): ProjectMetrics {
  let paid = 0n;
  let expenses = 0n;
  for (const t of txns) {
    if (t.type === "income") paid += t.amountMinor;
    else if (t.type === "expense") expenses += t.amountMinor;
    // переводы не влияют на показатели проекта
  }

  const plannedMargin = contractValueMinor - expenses;
  const cashMargin = paid - expenses;

  return {
    paidFactMinor: paid,
    debtMinor: contractValueMinor - paid,
    expensesMinor: expenses,
    plannedMarginMinor: plannedMargin,
    cashMarginMinor: cashMargin,
    plannedProfitability:
      contractValueMinor > 0n ? safeRatio(plannedMargin, contractValueMinor) : null,
    cashProfitability: paid > 0n ? safeRatio(cashMargin, paid) : null,
  };
}
