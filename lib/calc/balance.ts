// Баланс денег — SPEC разделы 6.3 и 4.6.
// Остаток по счёту: opening + доходы − расходы + переводы_на − переводы_со.
// Доли счетов защищены от деления на ноль (null → «нет данных»).

import { safeRatio } from "@/lib/money";
import { cashflowForAccount } from "./cashflow";
import type { CalcAccount, CalcTxn } from "./types";

export interface AccountBalanceRow {
  accountId: string;
  openingMinor: bigint;
  cashInMinor: bigint;
  cashOutMinor: bigint;
  transferInMinor: bigint;
  transferOutMinor: bigint;
  closingMinor: bigint;
  /** Доля счёта в общем положительном остатке; null, если общий остаток ≤ 0. */
  share: number | null;
}

export interface BalanceReport {
  rows: AccountBalanceRow[];
  totalClosingMinor: bigint;
}

/** Текущий остаток счёта на дату asOf (включительно). */
export function accountBalance(txns: CalcTxn[], account: CalcAccount, asOf: Date): bigint {
  const cf = cashflowForAccount(txns, account, new Date(Date.UTC(1970, 0, 1)), asOf);
  return cf.closingMinor;
}

/** Баланс денег по всем счетам за период. */
export function balanceReport(
  txns: CalcTxn[],
  accounts: CalcAccount[],
  periodStart: Date,
  periodEnd: Date
): BalanceReport {
  const rows = accounts.map((account) => {
    const cf = cashflowForAccount(txns, account, periodStart, periodEnd);
    return {
      accountId: account.id,
      openingMinor: cf.openingMinor,
      cashInMinor: cf.cashInMinor,
      cashOutMinor: cf.cashOutMinor,
      transferInMinor: cf.transferInMinor,
      transferOutMinor: cf.transferOutMinor,
      closingMinor: cf.closingMinor,
      share: null as number | null,
    };
  });

  let total = 0n;
  for (const r of rows) total += r.closingMinor;

  for (const r of rows) {
    r.share = total > 0n ? safeRatio(r.closingMinor, total) : null;
  }

  return { rows, totalClosingMinor: total };
}
