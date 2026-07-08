import { Fragment } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import {
  investmentReturns,
  investorDividendMinor,
  investorShare,
  totalInvestmentMinor,
} from "@/lib/calc/investments";
import { plannedRevenueForMonth, plannedUnitsForMonth } from "@/lib/calc/sales";
import { totalPlannedExpensesMinor, type ExpensePlanKind } from "@/lib/calc/expenses";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatMonthRu } from "@/lib/period";
import { TrafficDot } from "@/components/Traffic";
import {
  addInvestmentItemAction,
  deleteInvestmentItemAction,
  deleteInvestmentModelAction,
} from "../actions";

const SECTION_LABELS: Record<string, string> = {
  capex: "Капитальные затраты",
  launch: "Запуск",
  operating_buffer: "Операционный буфер",
  reserve: "Резерв",
  other: "Прочее",
};

export default async function InvestmentModelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tenant = await requireTenant();
  const { id } = await params;

  // мультитенантность: сценарий только своей компании
  const model = await prisma.investmentModel.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!model) notFound();

  const horizonEnd = new Date(
    Date.UTC(
      model.startMonth.getUTCFullYear(),
      model.startMonth.getUTCMonth() + model.horizonMonths - 1,
      1
    )
  );

  const [items, salesRows, expenseRows] = await Promise.all([
    prisma.investmentItem.findMany({
      where: { companyId: tenant.companyId, investmentModelId: id },
      orderBy: [{ section: "asc" }, { itemName: "asc" }],
    }),
    prisma.salesPlan.findMany({
      where: { companyId: tenant.companyId, month: { gte: model.startMonth, lte: horizonEnd } },
    }),
    prisma.expensePlan.findMany({
      where: { companyId: tenant.companyId, month: { gte: model.startMonth, lte: horizonEnd } },
    }),
  ]);

  const salesCalc = salesRows.map((r) => ({
    productId: r.productId,
    month: r.month,
    plannedPriceMinor: r.plannedPriceMinor,
    plannedQuantity: Number(r.plannedQuantity),
    seasonalityFactor: Number(r.seasonalityFactor),
  }));

  const need = totalInvestmentMinor(items);
  const investment = model.investmentAmountMinor ?? 0n;
  const valuation = model.companyValuationMinor ?? 0n;
  const dividendPolicy = Number(model.dividendPolicyPercent ?? 0);
  // доля: задана вручную или считается от оценки (тест 6)
  const manualShare = Number(model.investorShare ?? 0);
  const share = manualShare > 0 ? manualShare : investorShare(investment, valuation);

  // финмодель по месяцам горизонта: плановая прибыль → дивиденды инвестора
  const months = Array.from({ length: model.horizonMonths }, (_v, i) =>
    new Date(Date.UTC(model.startMonth.getUTCFullYear(), model.startMonth.getUTCMonth() + i, 1))
  );
  const monthly = months.map((month) => {
    const revenue = plannedRevenueForMonth(salesCalc, month);
    const units = plannedUnitsForMonth(salesCalc, month);
    const expenses = totalPlannedExpensesMinor(
      expenseRows
        .filter((r) => r.month.getTime() === month.getTime())
        .map((r) => ({
          expenseType: r.expenseType as ExpensePlanKind,
          amountMinor: r.amountMinor,
          percentOfRevenue: r.percentOfRevenue === null ? null : Number(r.percentOfRevenue),
          amountPerUnitMinor: r.amountPerUnitMinor,
        })),
      { revenueMinor: revenue, units }
    );
    const netProfit = revenue - expenses;
    const dividend =
      share === null ? 0n : investorDividendMinor(netProfit, dividendPolicy, share);
    return { month, revenue, expenses, netProfit, dividend };
  });

  const returns = investmentReturns(
    monthly.map((m) => m.dividend),
    investment
  );
  const hasPlanData = monthly.some((m) => m.revenue !== 0n || m.expenses !== 0n);
  const admin = isAdmin(tenant.role);

  const bySection = new Map<string, typeof items>();
  for (const item of items) {
    const list = bySection.get(item.section) ?? [];
    list.push(item);
    bySection.set(item.section, list);
  }

  return (
    <>
      <p className="steps">
        <Link href="/investments">← Все сценарии</Link>
      </p>
      <h1>{model.name}</h1>
      <p className="page-sub">
        Старт: {formatMonthRu(model.startMonth)} · горизонт {model.horizonMonths} мес. · дивиденды:{" "}
        {formatPercent(dividendPolicy)} прибыли
      </p>

      <div className="cards">
        <div className="card">
          <div className="label">Потребность в инвестициях</div>
          <div className="value">{formatMoney(need)}</div>
          <div className="hint">Сумма статей ниже</div>
        </div>
        <div className="card">
          <div className="label">Инвестиции / оценка</div>
          <div className="value">{formatMoney(investment)}</div>
          <div className="hint">Оценка компании: {formatMoney(valuation)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={share === null ? "gray" : "green"} /> Доля инвестора
          </div>
          <div className="value">{formatPercent(share)}</div>
          <div className="hint">
            {share === null ? "Укажите оценку компании" : "Инвестиции ÷ оценка компании"}
          </div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot
              color={returns.paybackIndex !== null ? "green" : hasPlanData ? "red" : "gray"}
            />{" "}
            Окупаемость
          </div>
          <div className="value">
            {returns.paybackIndex !== null
              ? `${returns.paybackIndex + 1} мес.`
              : hasPlanData
                ? "не окупается"
                : "нет данных"}
          </div>
          <div className="hint">
            ROI за горизонт: {returns.roi === null ? "нет данных" : formatPercent(returns.roi)}
          </div>
        </div>
      </div>

      <h2>Статьи инвестиций</h2>
      {admin && (
        <form action={addInvestmentItemAction} className="panel">
          <input type="hidden" name="modelId" value={model.id} />
          <div className="form-grid">
            <label className="field">
              Раздел
              <select name="section" defaultValue="capex">
                {Object.entries(SECTION_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Статья
              <input name="itemName" required placeholder="Например: Оборудование" />
            </label>
            <label className="field">
              Стоимость в месяц, ₸
              <input name="monthlyCost" required inputMode="numeric" placeholder="500 000" />
            </label>
            <label className="field">
              Месяцев
              <input name="monthsCount" type="number" min={1} max={60} defaultValue={1} />
            </label>
            <button type="submit">Добавить статью</button>
          </div>
        </form>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Раздел</th>
              <th>Статья</th>
              <th className="num">В месяц</th>
              <th className="num">Месяцев</th>
              <th className="num">Итого</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Добавьте статьи: оборудование, запуск, операционный буфер, резерв
                </td>
              </tr>
            )}
            {[...bySection.entries()].map(([section, list]) => (
              <Fragment key={section}>
                {list.map((item) => (
                  <tr key={item.id}>
                    <td className="muted">{SECTION_LABELS[section] ?? section}</td>
                    <td>{item.itemName}</td>
                    <td className="num">{formatMoney(item.monthlyCostMinor)}</td>
                    <td className="num">{item.monthsCount}</td>
                    <td className="num">{formatMoney(item.totalCostMinor)}</td>
                    {admin && (
                      <td>
                        <form action={deleteInvestmentItemAction}>
                          <input type="hidden" name="id" value={item.id} />
                          <button type="submit" className="secondary" title="Удалить">
                            ✕
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                ))}
              </Fragment>
            ))}
            {items.length > 0 && (
              <tr className="total">
                <td colSpan={4}>Итого потребность</td>
                <td className="num">{formatMoney(need)}</td>
                {admin && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <h2>Финмодель и возврат инвестору</h2>
      {!hasPlanData && (
        <div className="alert info">
          Финмодель строится из <Link href="/planning/sales">плана продаж</Link> и{" "}
          <Link href="/planning/expenses">плана расходов</Link> на месяцы горизонта — заполните их,
          и таблица посчитается автоматически.
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th className="num">Выручка (план)</th>
              <th className="num">Расходы (план)</th>
              <th className="num">Прибыль (план)</th>
              <th className="num">Дивиденд инвестора</th>
              <th className="num">Возврат накопленно</th>
            </tr>
          </thead>
          <tbody>
            {monthly.map((m, i) => (
              <tr key={m.month.toISOString()}>
                <td>{formatMonthRu(m.month)}</td>
                <td className="num muted">{formatMoney(m.revenue)}</td>
                <td className="num muted">{formatMoney(m.expenses)}</td>
                <td className={`num ${m.netProfit < 0n ? "expense" : ""}`}>
                  {formatMoney(m.netProfit)}
                </td>
                <td className="num income">{formatMoney(m.dividend)}</td>
                <td
                  className={`num ${
                    returns.paybackIndex !== null && i >= returns.paybackIndex ? "income" : ""
                  }`}
                >
                  {formatMoney(returns.cumulativeMinor[i] ?? 0n)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {admin && (
        <form action={deleteInvestmentModelAction} className="toolbar" style={{ marginTop: 18 }}>
          <input type="hidden" name="id" value={model.id} />
          <button type="submit" className="danger">
            Удалить сценарий
          </button>
        </form>
      )}
    </>
  );
}
