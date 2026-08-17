import { requireTenant } from "@/lib/tenancy";
import { loadCalcData } from "@/lib/reports";
import { balanceReport } from "@/lib/calc/balance";
import { formatMoney, formatPercent } from "@/lib/money";
import { rangeFromSearchParams, rangeToQuery } from "@/lib/range";
import { RangePicker } from "@/components/RangePicker";
import { PrintButton } from "@/components/PrintButton";
import { HelpNote } from "@/components/HelpNote";

export default async function BalancePage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    year?: string;
    month?: string;
    part?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const tenant = await requireTenant();
  const range = rangeFromSearchParams(await searchParams);
  const start = range.from;
  const end = range.to;

  const { txns, accounts } = await loadCalcData(tenant.companyId);
  const report = balanceReport(txns, accounts, start, end);

  return (
    <>
      <h1>Баланс денег</h1>
      <p className="page-sub">Остатки по счетам за {range.label}</p>
      <RangePicker range={range} action="/reports/balance" />
      <HelpNote>
        Сколько денег лежит на каждом счёте на начало и конец периода: стартовый остаток счёта
        плюс все поступления, минус выплаты, с учётом переводов. Если остаток в системе не
        совпадает с реальным банком — скорее всего, какая-то операция не внесена или внесена
        дважды: сверьте список операций за период по этому счёту.
      </HelpNote>
      <div className="toolbar no-print">
        <a className="btn secondary" href={`/api/export/balance?${rangeToQuery(range)}`}>
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
