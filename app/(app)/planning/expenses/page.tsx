import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { formatMoney, formatPercent } from "@/lib/money";
import { plannedExpenseMinor, type ExpensePlanKind } from "@/lib/calc/expenses";
import { plannedRevenueForMonth, plannedUnitsForMonth } from "@/lib/calc/sales";
import { MONTH_NAMES_RU, formatMonthRu } from "@/lib/period";
import { addExpensePlanRowAction, deleteExpensePlanRowAction } from "../actions";

const TYPE_LABELS: Record<ExpensePlanKind, string> = {
  fixed: "Фиксированный",
  percent_of_revenue: "% от выручки",
  per_unit: "На единицу продаж",
  one_time: "Разовый",
  payroll: "ФОТ",
  tax: "Налог (% от выручки)",
  debt_interest: "Проценты по займам",
};

export default async function ExpensePlanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? "", 10) || new Date().getFullYear();
  const range = { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 1)) };

  const [rows, salesRows, categories] = await Promise.all([
    prisma.expensePlan.findMany({
      where: { companyId: tenant.companyId, month: range },
      orderBy: [{ month: "asc" }],
    }),
    prisma.salesPlan.findMany({ where: { companyId: tenant.companyId, month: range } }),
    prisma.category.findMany({
      where: { companyId: tenant.companyId, type: "expense", isActive: true },
      orderBy: { name: "asc" },
    }),
  ]);

  const salesCalc = salesRows.map((r) => ({
    productId: r.productId,
    month: r.month,
    plannedPriceMinor: r.plannedPriceMinor,
    plannedQuantity: Number(r.plannedQuantity),
    seasonalityFactor: Number(r.seasonalityFactor),
  }));
  const categoryNames = new Map(categories.map((c) => [c.id, c.name]));
  const writable = canWrite(tenant.role);
  const currentYear = new Date().getFullYear();

  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.month.toISOString();
    const list = byMonth.get(key) ?? [];
    list.push(r);
    byMonth.set(key, list);
  }
  let yearTotal = 0n;

  return (
    <>
      <h1>План расходов</h1>
      <p className="page-sub">
        Фиксированные, процентные и сдельные статьи. Процент считается от{" "}
        <Link href="/planning/sales">плана продаж</Link> того же месяца.
      </p>

      <form method="get" action="/planning/expenses" className="toolbar">
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

      {writable && (
        <form action={addExpensePlanRowAction} className="panel">
          <div className="form-grid">
            <label className="field">
              С месяца
              <select name="month" defaultValue={new Date().getMonth() + 1}>
                {MONTH_NAMES_RU.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Год
              <select name="year" defaultValue={year}>
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Месяцев подряд
              <input name="applyMonths" type="number" min={1} max={24} defaultValue={12} />
            </label>
            <label className="field">
              Категория
              <select name="categoryId" defaultValue="">
                <option value="">—</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Формат
              <select name="expenseType" defaultValue="fixed">
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Сумма, ₸ (для фикс./разовых/ФОТ/процентов по займам)
              <input name="amount" inputMode="numeric" placeholder="0" />
            </label>
            <label className="field">
              Процент, % (для процентных и налога)
              <input name="percent" inputMode="decimal" placeholder="0" />
            </label>
            <label className="field">
              Ставка за единицу, ₸ (для сдельных)
              <input name="perUnit" inputMode="numeric" placeholder="0" />
            </label>
            <button type="submit">Добавить статью</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Категория</th>
              <th>Формат</th>
              <th className="num">База</th>
              <th className="num">Плановая сумма</th>
              {writable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Плана расходов на {year} год пока нет
                </td>
              </tr>
            )}
            {[...byMonth.entries()].map(([key, list]) => {
              const month = list[0].month;
              const ctx = {
                revenueMinor: plannedRevenueForMonth(salesCalc, month),
                units: plannedUnitsForMonth(salesCalc, month),
              };
              let monthTotal = 0n;
              const cells = list.map((r) => {
                const row = {
                  expenseType: r.expenseType as ExpensePlanKind,
                  amountMinor: r.amountMinor,
                  percentOfRevenue: r.percentOfRevenue === null ? null : Number(r.percentOfRevenue),
                  amountPerUnitMinor: r.amountPerUnitMinor,
                };
                const planned = plannedExpenseMinor(row, ctx);
                monthTotal += planned;
                const base =
                  row.percentOfRevenue !== null
                    ? formatPercent(row.percentOfRevenue)
                    : row.amountPerUnitMinor !== null
                      ? `${formatMoney(row.amountPerUnitMinor)}/ед.`
                      : formatMoney(row.amountMinor ?? 0n);
                return (
                  <tr key={r.id}>
                    <td>{formatMonthRu(r.month)}</td>
                    <td>{r.categoryId ? (categoryNames.get(r.categoryId) ?? "—") : "Без категории"}</td>
                    <td className="muted">{TYPE_LABELS[row.expenseType]}</td>
                    <td className="num muted">{base}</td>
                    <td className="num">{formatMoney(planned)}</td>
                    {writable && (
                      <td>
                        <form action={deleteExpensePlanRowAction}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="secondary" title="Удалить">
                            ✕
                          </button>
                        </form>
                      </td>
                    )}
                  </tr>
                );
              });
              yearTotal += monthTotal;
              return (
                <Fragment key={key}>
                  {cells}
                  <tr className="total">
                    <td colSpan={4}>Итого за {formatMonthRu(month)}</td>
                    <td className="num">{formatMoney(monthTotal)}</td>
                    {writable && <td />}
                  </tr>
                </Fragment>
              );
            })}
            {rows.length > 0 && (
              <tr className="total">
                <td colSpan={4}>Итого за {year} год</td>
                <td className="num">{formatMoney(yearTotal)}</td>
                {writable && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
