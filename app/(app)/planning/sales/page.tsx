import { Fragment } from "react";
import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { rowRevenueMinor } from "@/lib/calc/sales";
import { MONTH_NAMES_RU, formatMonthRu } from "@/lib/period";
import {
  generateSalesPlanAction,
  deleteSalesPlanRowAction,
  updateSalesPlanRowAction,
} from "../actions";

export default async function SalesPlanPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const year = Number.parseInt(params.year ?? "", 10) || new Date().getFullYear();

  const [products, rows] = await Promise.all([
    prisma.product.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.salesPlan.findMany({
      where: {
        companyId: tenant.companyId,
        month: { gte: new Date(Date.UTC(year, 0, 1)), lte: new Date(Date.UTC(year, 11, 1)) },
      },
      orderBy: [{ month: "asc" }],
    }),
  ]);
  const productNames = new Map(products.map((p) => [p.id, p.name]));
  const writable = canWrite(tenant.role);
  const currentYear = new Date().getFullYear();

  let yearTotal = 0n;
  const byMonth = new Map<string, typeof rows>();
  for (const r of rows) {
    const key = r.month.toISOString();
    const list = byMonth.get(key) ?? [];
    list.push(r);
    byMonth.set(key, list);
  }

  return (
    <>
      <h1>План продаж</h1>
      <p className="page-sub">
        Плановая выручка: цена × количество, рост количества месяц к месяцу.
        Продукты — в разделе <Link href="/settings/products">Продукты</Link>.
      </p>

      <form method="get" action="/planning/sales" className="toolbar">
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

      {writable && products.length === 0 && (
        <div className="alert info">
          Сначала добавьте продукты в разделе{" "}
          <Link href="/settings/products">Справочники → Продукты</Link>.
        </div>
      )}

      {writable && products.length > 0 && (
        <form action={generateSalesPlanAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Продукт
              <select name="productId" required>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              С месяца
              <select name="startMonth" defaultValue={new Date().getMonth() + 1}>
                {MONTH_NAMES_RU.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Год
              <select name="startYear" defaultValue={year}>
                {[currentYear - 1, currentYear, currentYear + 1, currentYear + 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Месяцев
              <input name="months" type="number" min={1} max={24} defaultValue={12} />
            </label>
            <label className="field">
              Цена, ₸
              <input name="price" required inputMode="numeric" placeholder="10 000" />
            </label>
            <label className="field">
              Количество в 1-й месяц
              <input name="baseQuantity" required inputMode="decimal" placeholder="10" />
            </label>
            <label className="field">
              Рост в месяц, %
              <input name="growth" inputMode="decimal" placeholder="0" />
            </label>
            <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
              <input type="checkbox" name="fractionalUnits" /> Допускать дробные количества
            </label>
            <button type="submit">Построить план</button>
          </div>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
            Повторная генерация по тому же продукту заменяет его строки в выбранном диапазоне.
          </p>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Месяц</th>
              <th>Продукт</th>
              <th className="num">Количество</th>
              <th className="num">Цена</th>
              <th className="num">Сезонность</th>
              <th className="num">Плановая выручка</th>
              {writable && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Плана на {year} год пока нет
                </td>
              </tr>
            )}
            {[...byMonth.entries()].map(([key, list]) => {
              let monthTotal = 0n;
              const cells = list.map((r) => {
                const revenue = rowRevenueMinor({
                  productId: r.productId,
                  month: r.month,
                  plannedPriceMinor: r.plannedPriceMinor,
                  plannedQuantity: Number(r.plannedQuantity),
                  seasonalityFactor: Number(r.seasonalityFactor),
                });
                monthTotal += revenue;
                const formId = `row-${r.id}`;
                return (
                  <tr key={r.id}>
                    <td>{formatMonthRu(r.month)}</td>
                    <td>{r.productId ? (productNames.get(r.productId) ?? "—") : "—"}</td>
                    <td className="num">
                      {writable ? (
                        <input
                          name="quantity"
                          form={formId}
                          defaultValue={Number(r.plannedQuantity)}
                          inputMode="decimal"
                          style={{ width: 80, textAlign: "right" }}
                        />
                      ) : (
                        Number(r.plannedQuantity).toLocaleString("ru-RU")
                      )}
                    </td>
                    <td className="num">
                      {writable ? (
                        <input
                          name="price"
                          form={formId}
                          defaultValue={(r.plannedPriceMinor / 100n).toString()}
                          inputMode="numeric"
                          style={{ width: 110, textAlign: "right" }}
                        />
                      ) : (
                        formatMoney(r.plannedPriceMinor)
                      )}
                    </td>
                    <td className="num">
                      {writable ? (
                        <input
                          name="seasonality"
                          form={formId}
                          defaultValue={Number(r.seasonalityFactor)}
                          inputMode="decimal"
                          title="1 — обычный месяц, 1.3 — сезон +30 %, 0.7 — спад −30 %"
                          style={{ width: 64, textAlign: "right" }}
                        />
                      ) : (
                        Number(r.seasonalityFactor).toLocaleString("ru-RU")
                      )}
                    </td>
                    <td className="num">{formatMoney(revenue)}</td>
                    {writable && (
                      <td style={{ whiteSpace: "nowrap" }}>
                        <form id={formId} action={updateSalesPlanRowAction} style={{ display: "inline" }}>
                          <input type="hidden" name="id" value={r.id} />
                          <button type="submit" className="secondary" title="Сохранить строку">
                            💾
                          </button>
                        </form>{" "}
                        <form action={deleteSalesPlanRowAction} style={{ display: "inline" }}>
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
                    <td colSpan={5}>Итого за {formatMonthRu(list[0].month)}</td>
                    <td className="num">{formatMoney(monthTotal)}</td>
                    {writable && <td />}
                  </tr>
                </Fragment>
              );
            })}
            {rows.length > 0 && (
              <tr className="total">
                <td colSpan={5}>Итого за {year} год</td>
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
