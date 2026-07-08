// Клиентская ссылка (share_links): дашборд компании в режиме просмотра, без аккаунта.
// Токен из URL; проверяются существование и срок действия. Только чтение.

import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { loadCalcData, periodFromSearchParams } from "@/lib/reports";
import { cashflowSummary } from "@/lib/calc/cashflow";
import { pnlForMonth } from "@/lib/calc/pnl";
import { balanceReport } from "@/lib/calc/balance";
import { formatMoney, formatPercent } from "@/lib/money";
import { MONTH_NAMES_RU, formatMonthRu, monthEnd, monthStart } from "@/lib/period";
import { TrafficDot, trafficByRatio, trafficBySign } from "@/components/Traffic";

export default async function SharePage({
  params,
  searchParams,
}: {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({ where: { token } });
  if (!link) notFound();
  if (link.expiresAt && link.expiresAt < new Date()) notFound(); // ссылка истекла

  const company = await prisma.company.findUnique({ where: { id: link.companyId } });
  if (!company) notFound();

  const { year, month } = periodFromSearchParams(await searchParams);
  const start = monthStart(year, month);
  const end = monthEnd(year, month);

  const { txns, accounts } = await loadCalcData(link.companyId);
  const cf = cashflowSummary(txns, accounts, start, end);
  const pnl = pnlForMonth(txns, start);
  const balances = balanceReport(txns, accounts, start, end);

  const config = await prisma.dashboardConfig.findFirst({
    where: { companyId: link.companyId, name: "default" },
  });
  const configJson =
    config && typeof config.configJson === "object" && config.configJson !== null
      ? (config.configJson as Record<string, unknown>)
      : {};
  const consultantComment = String(configJson.consultantComment ?? "");
  const brandLine = String(configJson.brandLine ?? "");

  const netFlow = cf.cashInMinor - cf.cashOutMinor;

  return (
    <div className="main" style={{ margin: "0 auto" }}>
      <h1>{company.name}</h1>
      <p className="page-sub">
        Финансовая сводка за {formatMonthRu(start)} · режим просмотра по ссылке
        {brandLine && (
          <>
            <br />
            <strong>{brandLine}</strong>
          </>
        )}
      </p>

      <form method="get" className="toolbar">
        <select name="month" defaultValue={month}>
          {MONTH_NAMES_RU.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <select name="year" defaultValue={year}>
          {[year - 2, year - 1, year, year + 1].map((y) => (
            <option key={y} value={y}>
              {y}
            </option>
          ))}
        </select>
        <button type="submit" className="secondary">
          Показать
        </button>
      </form>

      {consultantComment && (
        <div className="alert info">
          <strong>Комментарий консультанта:</strong> {consultantComment}
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
            <TrafficDot color={trafficBySign(pnl.netProfitMinor)} /> Чистая прибыль
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
            {pnl.profitability === null ? "Нет выручки для расчёта" : "Чистая прибыль к выручке"}
          </div>
        </div>
      </div>

      <h2>Остатки по счетам</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Счёт</th>
              <th className="num">Остаток</th>
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
              <td />
            </tr>
          </tbody>
        </table>
      </div>

      <p className="muted" style={{ marginTop: 24, fontSize: "0.85rem" }}>
        {brandLine ? `${brandLine} · ` : ""}Данные доступны только для просмотра.
      </p>
    </div>
  );
}
