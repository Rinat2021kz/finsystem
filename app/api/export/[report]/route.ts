// Экспорт отчётов в Excel (SPEC раздел 10).
// Период — в том же формате, что и на страницах отчётов (см. lib/range.ts):
// ?preset=quarter&year=2026&part=2 или ?preset=custom&from=…&to=…

import { NextRequest, NextResponse } from "next/server";
import ExcelJS from "exceljs";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { loadCalcData } from "@/lib/reports";
import { cashflowForAccount, cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonths } from "@/lib/calc/pnl";
import { balanceReport } from "@/lib/calc/balance";
import { monthsInRange, rangeFromSearchParams, snapToMonths } from "@/lib/range";
import { COMPANY_COOKIE } from "@/lib/tenancy";

export const runtime = "nodejs";

// В Excel выгружаем суммы в тенге числом (из тиынов), формат — на уровне ячеек.
const tenge = (minor: bigint): number => Number(minor / 100n) + Number(minor % 100n) / 100;
const MONEY_FMT = "#,##0 \"₸\"";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ report: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Не авторизован" }, { status: 401 });

  // мультитенантность: членство проверяем в БД
  const wanted = req.cookies.get(COMPANY_COOKIE)?.value;
  const memberships = await prisma.companyMember.findMany({ where: { userId } });
  const membership = memberships.find((m) => m.companyId === wanted) ?? memberships[0];
  if (!membership) return NextResponse.json({ error: "Нет компании" }, { status: 403 });
  const companyId = membership.companyId;

  const { report } = await params;
  const sp = req.nextUrl.searchParams;
  const range = rangeFromSearchParams({
    preset: sp.get("preset") ?? undefined,
    year: sp.get("year") ?? undefined,
    month: sp.get("month") ?? undefined,
    part: sp.get("part") ?? undefined,
    from: sp.get("from") ?? undefined,
    to: sp.get("to") ?? undefined,
  });
  const start = range.from;
  const end = range.to;

  const { txns, accounts } = await loadCalcData(companyId);
  const wb = new ExcelJS.Workbook();
  const periodLabel = range.label;
  const fileSuffix = `${start.toISOString().slice(0, 10)}_${end.toISOString().slice(0, 10)}`;

  if (report === "cashflow") {
    const ws = wb.addWorksheet("ДДС");
    ws.columns = [{ width: 36 }, { width: 18 }];
    const cf = cashflowSummary(txns, accounts, start, end);
    ws.addRow([`ДДС за ${periodLabel}`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    for (const [label, v] of [
      ["Остаток на начало", cf.openingMinor],
      ["Поступления", cf.cashInMinor],
      ["Выплаты", cf.cashOutMinor],
      ["Остаток на конец", cf.closingMinor],
    ] as const) {
      const row = ws.addRow([label, tenge(v)]);
      row.getCell(2).numFmt = MONEY_FMT;
    }
    ws.addRow([]);
    const header = ws.addRow(["Счёт", "На начало", "Поступления", "Выплаты", "Переводы +", "Переводы −", "На конец"]);
    header.font = { bold: true };
    ws.columns = [{ width: 24 }, ...Array(6).fill({ width: 16 })];
    for (const a of accounts) {
      const c = cashflowForAccount(txns, a, start, end);
      const row = ws.addRow([
        a.name,
        tenge(c.openingMinor),
        tenge(c.cashInMinor),
        tenge(c.cashOutMinor),
        tenge(c.transferInMinor),
        tenge(c.transferOutMinor),
        tenge(c.closingMinor),
      ]);
      for (let i = 2; i <= 7; i++) row.getCell(i).numFmt = MONEY_FMT;
    }
  } else if (report === "pnl") {
    const ws = wb.addWorksheet("ОПУ");
    ws.columns = [{ width: 36 }, { width: 18 }];
    // ОПУ живёт по экономическим месяцам — период округляем до целых
    const pnlRange = snapToMonths(range);
    const pnl = pnlForMonths(txns, monthsInRange(pnlRange.from, pnlRange.to));
    ws.addRow([`ОПУ за ${pnlRange.label}`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    for (const [label, v] of [
      ["Выручка", pnl.revenueMinor],
      ["Переменные расходы", pnl.variableExpensesMinor],
      ["Валовая прибыль", pnl.grossProfitMinor],
      ["Постоянные расходы", pnl.fixedExpensesMinor],
      ["ФОТ", pnl.payrollMinor],
      ["Прочие расходы", pnl.otherExpensesMinor],
      ["Операционная прибыль", pnl.operatingProfitMinor],
      ["Налоги", pnl.taxesMinor],
      ["Проценты", pnl.interestMinor],
      ["Амортизация", pnl.depreciationMinor],
      ["Чистая прибыль", pnl.netProfitMinor],
    ] as const) {
      const row = ws.addRow([label, tenge(v)]);
      row.getCell(2).numFmt = MONEY_FMT;
    }
    ws.addRow([
      "Рентабельность",
      pnl.profitability === null ? "нет выручки для расчёта" : pnl.profitability,
    ]);
    if (pnl.profitability !== null) ws.lastRow!.getCell(2).numFmt = "0.0%";
  } else if (report === "balance") {
    const ws = wb.addWorksheet("Баланс денег");
    ws.columns = [{ width: 24 }, ...Array(5).fill({ width: 16 })];
    const rep = balanceReport(txns, accounts, start, end);
    ws.addRow([`Баланс денег за ${periodLabel}`]).font = { bold: true, size: 14 };
    ws.addRow([]);
    const header = ws.addRow(["Счёт", "На начало", "Поступления", "Списания", "На конец", "Доля"]);
    header.font = { bold: true };
    for (const r of rep.rows) {
      const acc = accounts.find((a) => a.id === r.accountId);
      const row = ws.addRow([
        acc?.name ?? "—",
        tenge(r.openingMinor),
        tenge(r.cashInMinor),
        tenge(r.cashOutMinor),
        tenge(r.closingMinor),
        r.share === null ? "нет данных" : r.share,
      ]);
      for (let i = 2; i <= 5; i++) row.getCell(i).numFmt = MONEY_FMT;
      if (r.share !== null) row.getCell(6).numFmt = "0.0%";
    }
    const total = ws.addRow(["Итого", "", "", "", tenge(rep.totalClosingMinor), ""]);
    total.font = { bold: true };
    total.getCell(5).numFmt = MONEY_FMT;
  } else {
    return NextResponse.json({ error: "Неизвестный отчёт" }, { status: 404 });
  }

  const buffer = await wb.xlsx.writeBuffer();
  return new NextResponse(buffer, {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${report}-${fileSuffix}.xlsx"`,
    },
  });
}
