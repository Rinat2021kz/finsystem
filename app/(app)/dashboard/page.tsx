import { requireTenant, isAdmin } from "@/lib/tenancy";
import { saveDashboardCommentAction } from "../actions";
import { loadCalcData, periodFromSearchParams } from "@/lib/reports";
import { cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonth } from "@/lib/calc/pnl";
import { balanceReport } from "@/lib/calc/balance";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthRu, monthEnd, monthStart } from "@/lib/period";
import { prisma } from "@/lib/db";
import { PeriodPicker } from "@/components/PeriodPicker";
import { TrafficDot, trafficByRatio, trafficBySign } from "@/components/Traffic";

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const tenant = await requireTenant();
  const { year, month } = periodFromSearchParams(await searchParams);
  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const { txns, accounts } = await loadCalcData(tenant.companyId);
  const cf = cashflowSummary(txns, accounts, start, end);
  const pnl = pnlForMonth(txns, start);
  const balances = balanceReport(txns, accounts, start, end);

  // топ-5 расходов месяца по категориям (по ДДС)
  const expensesByCategory = await prisma.transaction.groupBy({
    by: ["categoryId"],
    where: {
      companyId: tenant.companyId,
      type: "expense",
      includeInCashflow: true,
      dateCashflow: { gte: start, lte: end },
    },
    _sum: { amountMinor: true },
    orderBy: { _sum: { amountMinor: "desc" } },
    take: 5,
  });
  const categoryNames = new Map(
    (
      await prisma.category.findMany({
        where: { companyId: tenant.companyId },
        select: { id: true, name: true },
      })
    ).map((c) => [c.id, c.name])
  );

  const netFlow = cf.cashInMinor - cf.cashOutMinor;
  const hasAnyData = txns.length > 0;

  // комментарий консультанта (слой понимания, SPEC 4.11)
  const dashboardConfig = await prisma.dashboardConfig.findFirst({
    where: { companyId: tenant.companyId, name: "default" },
  });
  const consultantComment =
    dashboardConfig &&
    typeof dashboardConfig.configJson === "object" &&
    dashboardConfig.configJson !== null
      ? String((dashboardConfig.configJson as Record<string, unknown>).consultantComment ?? "")
      : "";
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Дашборд</h1>
      <p className="page-sub">Ключевые показатели за {formatMonthRu(start)}</p>
      <PeriodPicker year={year} month={month} action="/dashboard" />

      {consultantComment && (
        <div className="alert info">
          <strong>Комментарий консультанта:</strong> {consultantComment}
        </div>
      )}
      {admin && (
        <details className="panel no-print" style={{ padding: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: "0.9rem" }}>
            {consultantComment ? "Изменить комментарий консультанта" : "Добавить комментарий консультанта"}
          </summary>
          <form action={saveDashboardCommentAction} style={{ marginTop: 10 }}>
            <textarea
              name="comment"
              defaultValue={consultantComment}
              rows={3}
              maxLength={1000}
              style={{ width: "100%", marginBottom: 8 }}
              placeholder="Расшифруйте цифры словами: что происходит и что делать дальше"
            />
            <button type="submit" className="secondary">
              Сохранить
            </button>
          </form>
        </details>
      )}
      {!hasAnyData && (
        <div className="alert info">
          Данных пока нет. Добавьте первые операции на странице «Операции» — отчёты посчитаются
          автоматически.
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficBySign(cf.closingMinor)} /> Деньги на конец периода
          </div>
          <div className="value">{formatMoney(cf.closingMinor)}</div>
          <div className="hint">На начало: {formatMoney(cf.openingMinor)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={netFlow >= 0n ? "green" : "red"} /> Денежный поток
          </div>
          <div className="value">{formatMoney(netFlow)}</div>
          <div className="hint">
            Поступило {formatMoney(cf.cashInMinor)} · ушло {formatMoney(cf.cashOutMinor)}
          </div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficBySign(pnl.netProfitMinor)} /> Чистая прибыль (ОПУ)
          </div>
          <div className="value">{formatMoney(pnl.netProfitMinor)}</div>
          <div className="hint">Выручка: {formatMoney(pnl.revenueMinor)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficByRatio(pnl.profitability)} /> Рентабельность
          </div>
          <div className="value">{formatPercent(pnl.profitability)}</div>
          <div className="hint">
            {pnl.profitability === null
              ? "Нет выручки для расчёта"
              : pnl.profitability < 0
                ? "Что делать: сократить расходы или поднять цены"
                : "Чистая прибыль к выручке"}
          </div>
        </div>
      </div>

      <h2>Остатки по счетам</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Счёт</th>
              <th className="num">Остаток на конец периода</th>
              <th className="num">Доля</th>
            </tr>
          </thead>
          <tbody>
            {balances.rows.map((row) => {
              const acc = accounts.find((a) => a.id === row.accountId);
              return (
                <tr key={row.accountId}>
                  <td>{acc?.name ?? "—"}</td>
                  <td className="num">{formatMoney(row.closingMinor)}</td>
                  <td className="num muted">{formatPercent(row.share)}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Итого</td>
              <td className="num">{formatMoney(balances.totalClosingMinor)}</td>
              <td className="num" />
            </tr>
          </tbody>
        </table>
      </div>

      <h2>Топ-5 расходов за период</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Категория</th>
              <th className="num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {expensesByCategory.length === 0 && (
              <tr>
                <td colSpan={2} className="muted">
                  Нет данных за выбранный период
                </td>
              </tr>
            )}
            {expensesByCategory.map((row) => (
              <tr key={row.categoryId ?? "none"}>
                <td>{row.categoryId ? (categoryNames.get(row.categoryId) ?? "Без категории") : "Без категории"}</td>
                <td className="num expense">{formatMoney(row._sum.amountMinor ?? 0n)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
