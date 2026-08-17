import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney, formatPercent, safeRatio } from "@/lib/money";
import { formatDateRu, toISODate } from "@/lib/period";
import { rangeFromSearchParams } from "@/lib/range";
import {
  averageUnitPriceMinor,
  componentCostMinor,
  costAtDate,
  soldGoodsCostMinor,
  unitCostFromComponents,
} from "@/lib/calc/cost";
import { RangePicker } from "@/components/RangePicker";
import { HelpNote } from "@/components/HelpNote";
import {
  addComponentAction,
  addCostHistoryAction,
  applyComputedCostAction,
  deleteComponentAction,
  deleteCostHistoryAction,
} from "./actions";

export default async function ProductCostPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
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
  const { id } = await params;
  const range = rangeFromSearchParams(await searchParams, "year");

  // мультитенантность: продукт только своей компании
  const product = await prisma.product.findFirst({
    where: { id, companyId: tenant.companyId },
    include: {
      components: { orderBy: { createdAt: "asc" } },
      costHistory: { orderBy: { validFrom: "desc" } },
    },
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

  const history = product.costHistory.map((h) => ({
    validFrom: h.validFrom,
    unitCostMinor: h.unitCostMinor,
  }));

  // Факт за период: каждая продажа считается по себестоимости, действовавшей на её дату
  const sales = await prisma.transaction.findMany({
    where: {
      companyId: tenant.companyId, // мультитенантность
      productId: product.id,
      type: "income",
      dateCashflow: { gte: range.from, lte: range.to },
    },
    orderBy: { dateCashflow: "asc" },
  });

  let soldQty = 0;
  let revenueMinor = 0n;
  let soldCostMinor = 0n;
  let salesWithoutCost = 0;
  for (const s of sales) {
    const qty = Number(s.quantity ?? 0);
    soldQty += qty;
    revenueMinor += s.amountMinor;
    const unitCost = costAtDate(history, s.dateCashflow);
    if (unitCost === null) {
      salesWithoutCost += 1; // продажа раньше первой записи истории — «нет данных»
      continue;
    }
    soldCostMinor += soldGoodsCostMinor(unitCost, qty);
  }
  const avgPrice = averageUnitPriceMinor(revenueMinor, soldQty);
  const grossMargin = revenueMinor - soldCostMinor;
  const grossMarginRatio = revenueMinor > 0n ? safeRatio(grossMargin, revenueMinor) : null;

  const today = toISODate(new Date());
  const firstOfMonth = today.slice(0, 8) + "01";

  return (
    <>
      <p className="steps">
        <Link href="/settings/products">← Все продукты</Link>
      </p>
      <h1>{product.name} — себестоимость</h1>
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

      <h2>Состав себестоимости (рецептура)</h2>
      {admin && (
        <form action={addComponentAction} className="panel">
          <input type="hidden" name="productId" value={product.id} />
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
                <td className="num">
                  {formatMoney(componentCostMinor(calcComponents[i], product.basePriceMinor))}
                </td>
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
            Действует сейчас (в карточке): {formatMoney(product.costPerUnitMinor)}
          </div>
        </div>
        <div className="card">
          <div className="label">Маржа с единицы</div>
          <div className="value">{formatMoney(margin)}</div>
          <div className="hint">Доля в цене: {formatPercent(marginRatio)}</div>
        </div>
      </div>

      {admin && product.components.length > 0 && (
        <form action={applyComputedCostAction} className="panel">
          <input type="hidden" name="productId" value={product.id} />
          <div className="form-grid">
            <label className="field">
              Действует с даты
              <input type="date" name="validFrom" defaultValue={firstOfMonth} />
            </label>
            <button type="submit">
              Записать {formatMoney(total)} в историю и карточку
            </button>
          </div>
          <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
            {differsFromCard
              ? "Расчёт по составу отличается от действующей себестоимости — запишите новую цену с даты, когда она вступила в силу."
              : "Себестоимость в карточке совпадает с расчётом по составу."}
          </p>
        </form>
      )}

      <h2>История себестоимости</h2>
      <HelpNote title="Зачем нужна история">
        Закупки идут в разные периоды, и цена меняется: в январе зерно стоило 8 000 ₸/кг, в марте
        9 500 ₸, в июле 11 000 ₸. Если хранить только одну текущую себестоимость, маржа прошлых
        месяцев будет посчитана по сегодняшней цене — и январь покажет неправду. Поэтому каждая
        цена записывается с датой, <strong>с которой она действует</strong>, а продажа считается по
        цене, действовавшей в день продажи. В карточке продукта показывается последняя по дате
        запись — та, что действует сейчас.
      </HelpNote>

      {admin && (
        <form action={addCostHistoryAction} className="panel">
          <input type="hidden" name="productId" value={product.id} />
          <div className="form-grid">
            <label className="field">
              Действует с даты
              <input type="date" name="validFrom" required defaultValue={firstOfMonth} />
            </label>
            <label className="field">
              Себестоимость единицы, ₸
              <input name="unitCost" required inputMode="numeric" placeholder="350" />
            </label>
            <label className="field">
              Комментарий
              <input name="comment" placeholder="Новая закупка зерна" />
            </label>
            <button type="submit">Добавить в историю</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Действует с</th>
              <th className="num">Себестоимость единицы</th>
              <th>Комментарий</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {product.costHistory.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  История пуста — продажи будут показаны без себестоимости. Добавьте первую запись
                  с даты начала учёта.
                </td>
              </tr>
            )}
            {product.costHistory.map((h, i) => (
              <tr key={h.id}>
                <td>
                  {formatDateRu(h.validFrom)}
                  {i === 0 && <span className="badge green" style={{ marginLeft: 8 }}>действует</span>}
                </td>
                <td className="num">{formatMoney(h.unitCostMinor)}</td>
                <td className="muted">{h.comment}</td>
                {admin && (
                  <td>
                    <form action={deleteCostHistoryAction}>
                      <input type="hidden" name="id" value={h.id} />
                      <button type="submit" className="secondary" title="Удалить">
                        ✕
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Факт продаж за период</h2>
      <RangePicker range={range} action={`/settings/products/${product.id}`} />
      <HelpNote title="Как считается факт">
        Сюда попадают операции дохода, в которых указан этот продукт и количество. Себестоимость
        проданного берётся из истории <strong>на дату каждой продажи</strong>: январские продажи
        считаются по январской цене, июльские — по июльской. Средняя цена — это выручка, делённая
        на количество: если она ниже базовой цены, значит были скидки или акции.
      </HelpNote>

      {sales.length === 0 ? (
        <div className="alert info">
          За {range.label} продаж с этим продуктом не отмечено. Указывайте продукт и количество в
          операциях дохода на странице <Link href="/transactions">Операции</Link> — тогда система
          сверит план с фактом.
        </div>
      ) : (
        <>
          {salesWithoutCost > 0 && (
            <div className="alert error">
              У {salesWithoutCost} продаж(и) нет себестоимости: они произошли раньше первой записи
              в истории. Добавьте запись с более ранней датой, иначе маржа завышена.
            </div>
          )}
          <div className="cards">
            <div className="card">
              <div className="label">Продано</div>
              <div className="value">{soldQty.toLocaleString("ru-RU")}</div>
              <div className="hint">
                {product.unit ?? "единиц"} · операций: {sales.length}
              </div>
            </div>
            <div className="card">
              <div className="label">Выручка</div>
              <div className="value">{formatMoney(revenueMinor)}</div>
              <div className="hint">
                Средняя цена: {avgPrice === null ? "нет данных" : formatMoney(avgPrice)} (базовая{" "}
                {formatMoney(product.basePriceMinor)})
              </div>
            </div>
            <div className="card">
              <div className="label">Себестоимость проданного</div>
              <div className="value">{formatMoney(soldCostMinor)}</div>
              <div className="hint">По ценам, действовавшим на дату каждой продажи</div>
            </div>
            <div className="card">
              <div className="label">Валовая маржа</div>
              <div className="value">{formatMoney(grossMargin)}</div>
              <div className="hint">Доля в выручке: {formatPercent(grossMarginRatio)}</div>
            </div>
          </div>
        </>
      )}
    </>
  );
}
