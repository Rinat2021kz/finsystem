"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { loadCalcData } from "@/lib/reports";
import { cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonth } from "@/lib/calc/pnl";
import { monthEnd, monthStart } from "@/lib/period";
import { logAudit } from "@/lib/audit";

/** Закрытие месяца: снимок отчёта + запрет изменений (правило 5). */
export async function closeMonthAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return;

  const period = monthStart(year, month);
  const end = monthEnd(year, month);

  const { txns, accounts } = await loadCalcData(tenant.companyId);
  const cf = cashflowSummary(txns, accounts, period, end);
  const pnl = pnlForMonth(txns, period);

  await prisma.reportSnapshot.upsert({
    where: { companyId_period: { companyId: tenant.companyId, period } },
    create: {
      companyId: tenant.companyId,
      period,
      isClosed: true,
      revenueMinor: pnl.revenueMinor,
      expensesMinor: pnl.revenueMinor - pnl.netProfitMinor,
      netProfitMinor: pnl.netProfitMinor,
      cashInMinor: cf.cashInMinor,
      cashOutMinor: cf.cashOutMinor,
      openingBalanceMinor: cf.openingMinor,
      closingBalanceMinor: cf.closingMinor,
    },
    update: {
      isClosed: true,
      revenueMinor: pnl.revenueMinor,
      expensesMinor: pnl.revenueMinor - pnl.netProfitMinor,
      netProfitMinor: pnl.netProfitMinor,
      cashInMinor: cf.cashInMinor,
      cashOutMinor: cf.cashOutMinor,
      openingBalanceMinor: cf.openingMinor,
      closingBalanceMinor: cf.closingMinor,
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "report_snapshot",
    action: "close_month",
    after: { period: period.toISOString().slice(0, 10) },
  });

  revalidatePath("/reports/pnl");
  revalidatePath("/reports/cashflow");
}

/** Открытие месяца — только админ; фиксируется в журнале. */
export async function reopenMonthAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const year = Number(formData.get("year"));
  const month = Number(formData.get("month"));
  if (!Number.isInteger(year) || !Number.isInteger(month)) return;
  const period = monthStart(year, month);

  await prisma.reportSnapshot.updateMany({
    where: { companyId: tenant.companyId, period },
    data: { isClosed: false },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "report_snapshot",
    action: "reopen_month",
    after: { period: period.toISOString().slice(0, 10) },
  });

  revalidatePath("/reports/pnl");
  revalidatePath("/reports/cashflow");
}
