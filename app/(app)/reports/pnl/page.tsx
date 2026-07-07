import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { loadCalcData, periodFromSearchParams } from "@/lib/reports";
import { pnlForMonth } from "@/lib/calc/pnl";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthRu, monthStart } from "@/lib/period";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";
import { closeMonthAction, reopenMonthAction } from "../actions";

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const tenant = await requireTenant();
  const { year, month } = periodFromSearchParams(await searchParams);
  const period = monthStart(year, month);

  const { txns } = await loadCalcData(tenant.companyId);
  const pnl = pnlForMonth(txns, period);

  const snapshot = await prisma.reportSnapshot.findUnique({
    where: { companyId_period: { companyId: tenant.companyId, period } },
  });
  const closed = snapshot?.isClosed ?? false;
  const admin = isAdmin(tenant.role);

  const rows: Array<{ label: string; value: bigint; strong?: boolean; negative?: boolean }> = [
    { label: "Выручка", value: pnl.revenueMinor, strong: true },
    { label: "Переменные расходы", value: pnl.variableExpensesMinor, negative: true },
    { label: "Валовая прибыль", value: pnl.grossProfitMinor, strong: true },
    { label: "Постоянные расходы", value: pnl.fixedExpensesMinor, negative: true },
    { label: "Фонд оплаты труда", value: pnl.payrollMinor, negative: true },
    { label: "Прочие расходы", value: pnl.otherExpensesMinor, negative: true },
    { label: "Операционная прибыль", value: pnl.operatingProfitMinor, strong: true },
    { label: "Налоги", value: pnl.taxesMinor, negative: true },
    { label: "Проценты по займам", value: pnl.interestMinor, negative: true },
    { label: "Амортизация", value: pnl.depreciationMinor, negative: true },
    { label: "Чистая прибыль", value: pnl.netProfitMinor, strong: true },
  ];

  return (
    <>
      <h1>ОПУ — прибыли и убытки</h1>
      <p className="page-sub">
        Экономический результат за {formatMonthRu(period)} (по месяцу учёта, не по дате оплаты)
      </p>
      <PeriodPicker year={year} month={month} action="/reports/pnl" />
      <div className="toolbar no-print">
        <a className="btn secondary" href={`/api/export/pnl?year=${year}&month=${month}`}>
          Скачать Excel
        </a>
        <PrintButton />
        {admin && !closed && (
          <form action={closeMonthAction}>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="secondary">
              Закрыть месяц
            </button>
          </form>
        )}
        {admin && closed && (
          <form action={reopenMonthAction}>
            <input type="hidden" name="year" value={year} />
            <input type="hidden" name="month" value={month} />
            <button type="submit" className="danger">
              Открыть месяц
            </button>
          </form>
        )}
      </div>

      {closed && (
        <div className="alert info">
          Месяц закрыт: операции этого периода защищены от изменений, отчёт зафиксирован снимком.
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Статья</th>
              <th className="num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? "total" : ""}>
                <td>{r.label}</td>
                <td className={`num ${r.negative && r.value > 0n ? "expense" : ""}`}>
                  {r.negative && r.value > 0n ? "−" : ""}
                  {formatMoney(r.value)}
                </td>
              </tr>
            ))}
            <tr>
              <td>Рентабельность по чистой прибыли</td>
              <td className="num">
                {pnl.profitability === null ? (
                  <span className="badge gray">нет выручки для расчёта</span>
                ) : (
                  formatPercent(pnl.profitability)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
