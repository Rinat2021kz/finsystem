import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney, formatPercent, safeRatio } from "@/lib/money";
import { monthStart, monthEnd, toISODate, formatDateRu } from "@/lib/period";
import {
  averageUnitPriceMinor,
  componentCostMinor,
  soldGoodsCostMinor,
  unitCostFromComponents,
} from "@/lib/calc/cost";
import {
  addComponentAction,
  applyComputedCostAction,
  deleteComponentAction,
} from "./actions";

export default async function ProductCostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const tenant = await requireTenant();
  const { id } = await params;
  const sp = await searchParams;

  // мультитенантность: продукт только своей компании
  const product = await prisma.product.findFirst({
    where: { id, companyId: tenant.companyId },
    include: { components: { orderBy: { createdAt: "asc" } } },
  });
  if (!product) notFound();

  const admin = isAdmin(tenant.role);
  const calcComponents = product.components.map((c) => ({
    kind: c.kind === "percent_of_price" ? ("percent_of_price" as const) : ("per_unit" as const),
    quantity: Number(c.quantity),
    unitCostMinor: c.unitCostMinor,
    percent: c.percent === null ? null : Number(c.percent),
  }));
  const total = unitCostFromComponents(calcComponents, product.basePriceMinor);
  const margin = product.basePriceMinor - total;
  const marginRatio = product.basePriceMinor > 0n ? safeRatio(margin, product.basePriceMinor) : null;
  const hasPercentRows = product.components.some((c) => c.kind === "percent_of_price");
  const differsFromCard = total !== product.costPerUnitMinor;

  // Факт за период: продажи по операциям дохода с этим продуктом.
  // Период по умолчанию — текущий месяц (это выбор в UI, расчёт идёт строго по границам).
  const now = new Date();
  const defaultFrom = monthStart(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const defaultTo = monthEnd(now.getUTCFullYear(), now.getUTCMonth() + 1);
  const from = sp.from ? new Date(sp.from) : defaultFrom;
  const to = sp.to ? new Date(sp.to) : defaultTo;
  const fact = await prisma.transaction.aggregate({
    where: {
      companyId: tenant.companyId, // мультитенантность
      productId: product.id,
      type: "income",
      dateCashflow: { gte: from, lte: to },
    },
    _sum: { amountMinor: true, quantity: true },
    _count: true,
  });
  const soldQty = Number(fact._sum.quantity ?? 0);
  const revenueMinor = fact._sum.amountMinor ?? 0n;
  // для факт-оценки берём себестоимость по составу, если рецептура заполнена, иначе — из карточки
  const effectiveUnitCost = product.components.length > 0 ? total : product.costPerUnitMinor;
  const soldCost = soldGoodsCostMinor(effectiveUnitCost, soldQty);
  const avgPrice = averageUnitPriceMinor(revenueMinor, soldQty);
  const grossMargin = revenueMinor - soldCost;
  const grossMarginRatio = revenueMinor > 0n ? safeRatio(grossMargin, revenueMinor) : null;

  return (
    <>
      <p className="steps">
        <Link href="/settings/products">← Все продукты</Link>
      </p>
      <h1>{product.name} — состав себестоимости</h1>
      <p className="page-sub">
        Разложите единицу продукта на составляющие — система посчитает переменную себестоимость и
        маржу. Цена продажи: {formatMoney(product.basePriceMinor)}
        {product.unit ? ` за ${product.unit}` : ""}.
      </p>

      {hasPercentRows && product.basePriceMinor <= 0n && (
        <div className="alert error">
          В составе есть процентные строки, но базовая цена продукта не указана — они считаются
          как 0. Укажите цену в <Link href="/settings/products">карточке продукта</Link>.
        </div>
      )}

      {admin && (
        <form action={addComponentAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Составляющая
              <input name="name" required placeholder="Зерно / упаковка / комиссия Kaspi" />
            </label>
            <label className="field">
              Тип
              <select name="kind" defaultValue="per_unit">
                <option value="per_unit">Количество × цена</option>
                <option value="percent_of_price">Процент от цены продажи</option>
              </select>
            </label>
            <label className="field">
              Количество (для «количество × цена»)
              <input name="quantity" inputMode="decimal" placeholder="0.018" />
            </label>
            <label className="field">
              Ед. измерения
              <input name="unit" placeholder="кг / л / шт" />
            </label>
            <label className="field">
              Цена за единицу, ₸
              <input name="unitCost" inputMode="numeric" placeholder="9 000" />
            </label>
            <label className="field">
              Процент, % (для процентных)
              <input name="percent" inputMode="decimal" placeholder="2" />
            </label>
            <button type="submit">Добавить</button>
          </div>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
            Примеры: зерно — 0.018 кг × 9 000 ₸/кг; молоко — 0.18 л × 600 ₸/л; стакан — 1 шт × 50 ₸;
            комиссия Kaspi — 2 % от цены.
          </p>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Составляющая</th>
              <th className="num">Количество</th>
              <th className="num">Цена за ед.</th>
              <th className="num">Стоимость в единице</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {product.components.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Состав пока пуст — добавьте первую составляющую в форме выше
                </td>
              </tr>
            )}
            {product.components.map((c, i) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="num muted">
                  {c.kind === "percent_of_price"
                    ? `${formatPercent(c.percent === null ? null : Number(c.percent))} от цены`
                    : `${Number(c.quantity).toLocaleString("ru-RU")} ${c.unit ?? ""}`}
                </td>
                <td className="num muted">
                  {c.kind === "percent_of_price" ? "—" : formatMoney(c.unitCostMinor)}
                </td>
                <td className="num">{formatMoney(componentCostMinor(calcComponents[i], product.basePriceMinor))}</td>
                {admin && (
                  <td>
                    <form action={deleteComponentAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="secondary" title="Удалить">
                        ✕
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
            {product.components.length > 0 && (
              <tr className="total">
                <td colSpan={3}>Себестоимость единицы по составу</td>
                <td className="num">{formatMoney(total)}</td>
                {admin && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Себестоимость по составу</div>
          <div className="value">{formatMoney(total)}</div>
          <div className="hint">
            В карточке продукта сейчас: {formatMoney(product.costPerUnitMinor)}
          </div>
        </div>
        <div className="card">
          <div className="label">Маржа с единицы</div>
          <div className="value">{formatMoney(margin)}</div>
          <div className="hint">Доля в цене: {formatPercent(marginRatio)}</div>
        </div>
      </div>

      {admin && product.components.length > 0 && differsFromCard && (
        <form action={applyComputedCostAction} className="toolbar">
          <input type="hidden" name="productId" value={product.id} />
          <button type="submit">
            Записать {formatMoney(total)} в карточку продукта
          </button>
        </form>
      )}
      {product.components.length > 0 && !differsFromCard && (
        <div className="alert success">
          Себестоимость в карточке продукта совпадает с расчётом по составу.
        </div>
      )}

      <h2 style={{ marginTop: 28 }}>Факт за период</h2>
      <p className="page-sub">
        Считается по операциям дохода, где выбран этот продукт и указано количество. Добавляйте их
        на странице <Link href="/transactions?add=income">Операции → Доход</Link>.
      </p>

      <form method="get" action={`/settings/products/${product.id}`} className="toolbar">
        <label className="field">
          С даты
          <input type="date" name="from" defaultValue={toISODate(from)} />
        </label>
        <label className="field">
          По дату
          <input type="date" name="to" defaultValue={toISODate(to)} />
        </label>
        <button type="submit" className="secondary">
          Показать
        </button>
      </form>

      {fact._count === 0 ? (
        <div className="alert info">
          За период {formatDateRu(from)} — {formatDateRu(to)} продаж этого продукта не отмечено —
          нет данных для сравнения.
        </div>
      ) : (
        <>
          <div className="cards">
            <div className="card">
              <div className="label">Продано</div>
              <div className="value">
                {soldQty.toLocaleString("ru-RU")}
                {product.unit ? ` ${product.unit}` : ""}
              </div>
              <div className="hint">Операций дохода: {fact._count}</div>
            </div>
            <div className="card">
              <div className="label">Выручка</div>
              <div className="value">{formatMoney(revenueMinor)}</div>
              <div className="hint">
                Средняя цена: {avgPrice === null ? "нет данных" : formatMoney(avgPrice)}
                {avgPrice !== null && product.basePriceMinor > 0n && avgPrice < product.basePriceMinor
                  ? ` — ниже цены в карточке (${formatMoney(product.basePriceMinor)})`
                  : ""}
              </div>
            </div>
            <div className="card">
              <div className="label">Себестоимость проданного</div>
              <div className="value">{formatMoney(soldCost)}</div>
              <div className="hint">
                {product.components.length > 0
                  ? `По составу: ${formatMoney(effectiveUnitCost)} за единицу`
                  : `Из карточки продукта: ${formatMoney(effectiveUnitCost)} за единицу`}
              </div>
            </div>
            <div className="card">
              <div className="label">Валовая маржа</div>
              <div className={`value ${grossMargin < 0n ? "expense" : ""}`}>
                {formatMoney(grossMargin)}
              </div>
              <div className="hint">Доля в выручке: {formatPercent(grossMarginRatio)}</div>
            </div>
          </div>
          {grossMargin < 0n && (
            <div className="alert error">
              Выручка за период не покрывает расчётную себестоимость — проверьте цену продажи или
              состав рецептуры.
            </div>
          )}
        </>
      )}
    </>
  );
}
