// Загрузка данных для расчётного модуля. ВСЕ выборки — строго по company_id.

import { prisma } from "@/lib/db";
import type { CalcAccount, CalcTxn } from "@/lib/calc/types";

export interface AccountInfo extends CalcAccount {
  name: string;
  type: string;
  isActive: boolean;
}

export async function loadCalcData(companyId: string): Promise<{
  txns: CalcTxn[];
  accounts: AccountInfo[];
}> {
  const [rows, accounts] = await Promise.all([
    prisma.transaction.findMany({
      where: { companyId },
      include: { category: { select: { pnlGroup: true, affectsPnl: true, affectsCashflow: true } } },
      orderBy: { dateCashflow: "asc" },
    }),
    prisma.account.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } }),
  ]);

  const txns: CalcTxn[] = rows.map((t) => ({
    type: t.type,
    amountMinor: t.amountMinor,
    dateCashflow: t.dateCashflow,
    periodPnl: t.periodPnl,
    accountFromId: t.accountFromId,
    accountToId: t.accountToId,
    includeInCashflow: t.includeInCashflow,
    includeInPnl: t.includeInPnl,
    pnlGroup: t.category?.pnlGroup ?? null,
    affectsPnl: t.category?.affectsPnl ?? true,
    affectsCashflow: t.category?.affectsCashflow ?? true,
  }));

  return {
    txns,
    accounts: accounts.map((a) => ({
      id: a.id,
      openingBalanceMinor: a.openingBalanceMinor,
      name: a.name,
      type: a.type,
      isActive: a.isActive,
    })),
  };
}

/** Выбранный период отчёта из query-параметров (?year=2026&month=3). Без TODAY() в расчётах:
 *  значение по умолчанию — только выбор UI, сами расчёты всегда получают явный период. */
export function periodFromSearchParams(params: {
  year?: string;
  month?: string;
}): { year: number; month: number } {
  const now = new Date();
  const year = clampInt(params.year, 2000, 2100) ?? now.getUTCFullYear();
  const month = clampInt(params.month, 1, 12) ?? now.getUTCMonth() + 1;
  return { year, month };
}

function clampInt(value: string | undefined, min: number, max: number): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}
