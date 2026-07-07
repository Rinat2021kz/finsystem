import { requireTenant } from "@/lib/tenancy";
import { loadCalcData, periodFromSearchParams } from "@/lib/reports";
import { cashflowForAccount, cashflowSummary } from "@/lib/calc/cashflow";
import { formatMoney } from "@/lib/money";
import { formatMonthRu, monthEnd, monthStart } from "@/lib/period";
import { PeriodPicker } from "@/components/PeriodPicker";
import { PrintButton } from "@/components/PrintButton";

export default async function CashflowPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const tenant = await requireTenant();
  const { year, month } = periodFromSearchParams(await searchParams);
  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const { txns, accounts } = await loadCalcData(tenant.companyId);
  const summary = cashflowSummary(txns, accounts, start, end);
  const perAccount = accounts.map((a) => ({
    account: a,
    cf: cashflowForAccount(txns, a, start, end),
  }));

  return (
    <>
      <h1>ДДС — движение денег</h1>
      <p className="page-sub">Как двигались деньги за {formatMonthRu(start)}</p>
      <PeriodPicker year={year} month={month} action="/reports/cashflow" />
      <div className="toolbar no-print">
        <a className="btn secondary" href={`/api/export/cashflow?year=${year}&month=${month}`}>
          Скачать Excel
        </a>
        <PrintButton />
      </div>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Показатель</th>
              <th className="num">Сумма</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Остаток на начало периода</td>
              <td className="num">{formatMoney(summary.openingMinor)}</td>
            </tr>
            <tr>
              <td>Поступления</td>
              <td className="num income">+{formatMoney(summary.cashInMinor)}</td>
            </tr>
            <tr>
              <td>Выплаты</td>
              <td className="num expense">−{formatMoney(summary.cashOutMinor)}</td>
            </tr>
            <tr>
              <td className="muted">Переводы между счетами</td>
              <td className="num muted">не меняют общий остаток</td>
            </tr>
            <tr className="total">
              <td>Остаток на конец периода</td>
              <td className="num">{formatMoney(summary.closingMinor)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      <h2>По счетам</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Счёт</th>
              <th className="num">На начало</th>
              <th className="num">Поступления</th>
              <th className="num">Выплаты</th>
              <th className="num">Переводы +</th>
              <th className="num">Переводы −</th>
              <th className="num">На конец</th>
            </tr>
          </thead>
          <tbody>
            {perAccount.map(({ account, cf }) => (
              <tr key={account.id}>
                <td>{account.name}</td>
                <td className="num">{formatMoney(cf.openingMinor)}</td>
                <td className="num income">{formatMoney(cf.cashInMinor)}</td>
                <td className="num expense">{formatMoney(cf.cashOutMinor)}</td>
                <td className="num">{formatMoney(cf.transferInMinor)}</td>
                <td className="num">{formatMoney(cf.transferOutMinor)}</td>
                <td className="num">{formatMoney(cf.closingMinor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
