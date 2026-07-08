import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenancy";
import { loadCalcData } from "@/lib/reports";
import { pnlForMonth } from "@/lib/calc/pnl";
import { plannedRevenueForMonth, plannedUnitsForMonth } from "@/lib/calc/sales";
import { totalPlannedExpensesMinor, type ExpensePlanKind } from "@/lib/calc/expenses";
import { formatMoney } from "@/lib/money";
import { MONTH_NAMES_RU, monthStart } from "@/lib/period";

export default async function ComparePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? "", 10) || new Date().getFullYear();
  const range = { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 1)) };

  const [{ txns }, salesRows, expenseRows] = await Promise.all([
    loadCalcData(tenant.companyId),
    prisma.salesPlan.findMany({ where: { companyId: tenant.companyId, month: range } }),
    prisma.expensePlan.findMany({ where: { companyId: tenant.companyId, month: range } }),
  ]);

  const salesCalc = salesRows.map((r) => ({
    productId: r.productId,
    month: r.month,
    plannedPriceMinor: r.plannedPriceMinor,
    plannedQuantity: Number(r.plannedQuantity),
    seasonalityFactor: Number(r.seasonalityFactor),
  }));

  const currentYear = new Date().getFullYear();
  const months = Array.from({ length: 12 }, (_v, i) => monthStart(year, i + 1));

  const rows = months.map((month) => {
    const planRevenue = plannedRevenueForMonth(salesCalc, month);
    const units = plannedUnitsForMonth(salesCalc, month);
    const planExpenses = totalPlannedExpensesMinor(
      expenseRows
        .filter((r) => r.month.getTime() === month.getTime())
        .map((r) => ({
          expenseType: r.expenseType as ExpensePlanKind,
          amountMinor: r.amountMinor,
          percentOfRevenue: r.percentOfRevenue === null ? null : Number(r.percentOfRevenue),
          amountPerUnitMinor: r.amountPerUnitMinor,
        })),
      { revenueMinor: planRevenue, units }
    );
    const pnl = pnlForMonth(txns, month);
    const factExpenses = pnl.revenueMinor - pnl.netProfitMinor;
    return {
      month,
      planRevenue,
      factRevenue: pnl.revenueMinor,
      planExpenses,
      factExpenses,
      planProfit: planRevenue - planExpenses,
      factProfit: pnl.netProfitMinor,
    };
  });

  const hasAny = rows.some(
    (r) => r.planRevenue !== 0n || r.factRevenue !== 0n || r.planExpenses !== 0n || r.factExpenses !== 0n
  );

  const totals = rows.reduce(
    (acc, r) => ({
      planRevenue: acc.planRevenue + r.planRevenue,
      factRevenue: acc.factRevenue + r.factRevenue,
      planExpenses: acc.planExpenses + r.planExpenses,
      factExpenses: acc.factExpenses + r.factExpenses,
      planProfit: acc.planProfit + r.planProfit,
      factProfit: acc.factProfit + r.factProfit,
    }),
    { planRevenue: 0n, factRevenue: 0n, planExpenses: 0n, factExpenses: 0n, planProfit: 0n, factProfit: 0n }
  );

  return (
    <>
      <h1>План / факт</h1>
      <p className="page-sub">
        Сравнение планов (<Link href="/planning/sales">продажи</Link>,{" "}
        <Link href="/planning/expenses">расходы</Link>) с фактом из ОПУ за {year} год
      </p>

      <form method="get" action="/planning/compare" className="toolbar">
        <select name="year" defaultValue={year}>
          {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="submit" className="secondary">
          Показать
        </button>
      </form>

      {!hasAny && (
        <div className="alert info">
          Нет данных за {year} год: заполните план продаж/расходов и вносите операции — сравнение
          построится автоматически.
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="num">Выручка план</th>
              <th className="num">Выручка факт</th>
              <th className="num">Расходы план</th>
              <th className="num">Расходы факт</th>
              <th className="num">Прибыль план</th>
              <th className="num">Прибыль факт</th>
              <th className="num">Δ прибыли</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const delta = r.factProfit - r.planProfit;
              const empty =
                r.planRevenue === 0n && r.factRevenue === 0n && r.planExpenses === 0n && r.factExpenses === 0n;
              return (
                <tr key={r.month.toISOString()}>
                  <td>{MONTH_NAMES_RU[r.month.getUTCMonth()]}</td>
                  {empty ? (
                    <td colSpan={7} className="muted">
                      нет данных
                    </td>
                  ) : (
                    <>
                      <td className="num muted">{formatMoney(r.planRevenue)}</td>
                      <td className="num">{formatMoney(r.factRevenue)}</td>
                      <td className="num muted">{formatMoney(r.planExpenses)}</td>
                      <td className="num">{formatMoney(r.factExpenses)}</td>
                      <td className="num muted">{formatMoney(r.planProfit)}</td>
                      <td className="num">{formatMoney(r.factProfit)}</td>
                      <td className={`num ${delta < 0n ? "expense" : "income"}`}>
                        {delta > 0n ? "+" : ""}
                        {formatMoney(delta)}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
            <tr className="total">
              <td>Итого</td>
              <td className="num muted">{formatMoney(totals.planRevenue)}</td>
              <td className="num">{formatMoney(totals.factRevenue)}</td>
              <td className="num muted">{formatMoney(totals.planExpenses)}</td>
              <td className="num">{formatMoney(totals.factExpenses)}</td>
              <td className="num muted">{formatMoney(totals.planProfit)}</td>
              <td className="num">{formatMoney(totals.factProfit)}</td>
              <td className="num" />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
