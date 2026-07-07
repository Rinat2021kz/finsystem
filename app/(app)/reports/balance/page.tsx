import { requireTenant } from "@/lib/tenancy";
import { loadCalcData, periodFromSearchParams } from "@/lib/reports";
import { balanceReport } from "@/lib/calc/balance";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthRu, monthEnd, monthStart } from "@/lib/period";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const tenant = await requireTenant();
  const { year, month } = periodFromSearchParams(await searchParams);
  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const { txns, accounts } = await loadCalcData(tenant.companyId);
  const report = balanceReport(txns, accounts, start, end);

  return (
    <>
      <h1>Баланс денег</h1>
      <p className="page-sub">Остатки по счетам за {formatMonthRu(start)}</p>
      <PeriodPicker year={year} month={month} action="/reports/balance" />
      <div className="toolbar no-print">
        <a className="btn secondary" href={`/api/export/balance?year=${year}&month=${month}`}>
          Скачать Excel
        </a>
        <PrintButton />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Счёт</th>
              <th className="num">На начало</th>
              <th className="num">Поступления</th>
              <th className="num">Списания</th>
              <th className="num">Переводы (сальдо)</th>
              <th className="num">На конец</th>
              <th className="num">Доля</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((row) => {
              const acc = accounts.find((a) => a.id === row.accountId);
              return (
                <tr key={row.accountId}>
                  <td>{acc?.name ?? "—"}</td>
                  <td className="num">{formatMoney(row.openingMinor)}</td>
                  <td className="num income">{formatMoney(row.cashInMinor)}</td>
                  <td className="num expense">{formatMoney(row.cashOutMinor)}</td>
                  <td className="num">{formatMoney(row.transferInMinor - row.transferOutMinor)}</td>
                  <td className="num">{formatMoney(row.closingMinor)}</td>
                  <td className="num muted">{formatPercent(row.share)}</td>
                </tr>
              );
            })}
            <tr className="total">
              <td>Итого</td>
              <td className="num" colSpan={4} />
              <td className="num">{formatMoney(report.totalClosingMinor)}</td>
              <td className="num" />
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
