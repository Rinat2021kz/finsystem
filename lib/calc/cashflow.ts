// ДДС (движение денежных средств) — SPEC раздел 6.1.
// Правила: считаем по date_cashflow; переводы в сводном отчёте не меняют общий остаток;
// по одному счёту переводы учитываются как transfer_in / transfer_out.

import type { CalcAccount, CalcTxn } from "./types";

export interface CashflowSummary {
  openingMinor: bigint;
  cashInMinor: bigint;
  cashOutMinor: bigint;
  closingMinor: bigint;
}

export interface AccountCashflow extends CashflowSummary {
  transferInMinor: bigint;
  transferOutMinor: bigint;
}

function inCashflow(t: CalcTxn): boolean {
  return t.includeInCashflow && t.affectsCashflow;
}

/** Сводный ДДС по всем счетам за период [periodStart; periodEnd]. */
export function cashflowSummary(
  txns: CalcTxn[],
  accounts: CalcAccount[],
  periodStart: Date,
  periodEnd: Date
): CashflowSummary {
  let opening = 0n;
  for (const a of accounts) opening += a.openingBalanceMinor;

  let cashIn = 0n;
  let cashOut = 0n;

  for (const t of txns) {
    if (!inCashflow(t)) continue;
    if (t.type === "transfer") continue; // перевод не меняет общий остаток
    if (t.dateCashflow < periodStart) {
      // операции до начала периода формируют начальный остаток
      if (t.type === "income") opening += t.amountMinor;
      else opening -= t.amountMinor;
    } else if (t.dateCashflow <= periodEnd) {
      if (t.type === "income") cashIn += t.amountMinor;
      else cashOut += t.amountMinor;
    }
  }

  return {
    openingMinor: opening,
    cashInMinor: cashIn,
    cashOutMinor: cashOut,
    closingMinor: opening + cashIn - cashOut,
  };
}

/** ДДС по одному счёту: переводы учитываются. */
export function cashflowForAccount(
  txns: CalcTxn[],
  account: CalcAccount,
  periodStart: Date,
  periodEnd: Date
): AccountCashflow {
  let opening = account.openingBalanceMinor;
  let cashIn = 0n;
  let cashOut = 0n;
  let transferIn = 0n;
  let transferOut = 0n;

  for (const t of txns) {
    if (!inCashflow(t)) continue;
    const touchesTo = t.accountToId === account.id;
    const touchesFrom = t.accountFromId === account.id;
    if (!touchesTo && !touchesFrom) continue;

    const before = t.dateCashflow < periodStart;
    const inPeriod = !before && t.dateCashflow <= periodEnd;
    if (!before && !inPeriod) continue;

    if (t.type === "income" && touchesTo) {
      if (before) opening += t.amountMinor;
      else cashIn += t.amountMinor;
    } else if (t.type === "expense" && touchesFrom) {
      if (before) opening -= t.amountMinor;
      else cashOut += t.amountMinor;
    } else if (t.type === "transfer") {
      if (touchesTo) {
        if (before) opening += t.amountMinor;
        else transferIn += t.amountMinor;
      }
      if (touchesFrom) {
        if (before) opening -= t.amountMinor;
        else transferOut += t.amountMinor;
      }
    }
  }

  return {
    openingMinor: opening,
    cashInMinor: cashIn,
    cashOutMinor: cashOut,
    transferInMinor: transferIn,
    transferOutMinor: transferOut,
    closingMinor: opening + cashIn - cashOut + transferIn - transferOut,
  };
}
