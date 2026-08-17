import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { formatQuantity, loadStockMoves } from "@/lib/stock";
import {
  averageLotCostMinor,
  negativeBalances,
  stockByWarehouse,
  stockValueMinor,
} from "@/lib/calc/stock";
import { HelpNote } from "@/components/HelpNote";

/** Остатки товара: строки — товары, колонки — склады. Как лист «СКЛАД» в таблицах, но без формул. */
export default async function StockPage({
  searchParams,
}: {
  searchParams: Promise<{ date?: string }>;
}) {
  const tenant = await requireTenant();
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId } });
  if (!company?.stockEnabled) redirect("/settings/company");

  const params = await searchParams;
  // отчёт строится на выбранную дату, а не на «сегодня» (правило 7)
  const onDate = params.date ? new Date(`${params.date}T00:00:00.000Z`) : new Date();
  const dateValue = onDate.toISOString().slice(0, 10);

  const [warehouses, products, moves] = await Promise.all([
    prisma.warehouse.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.product.findMany({
      where: { companyId: tenant.companyId },
      orderBy: [{ productGroup: "asc" }, { name: "asc" }],
    }),
    loadStockMoves(tenant.companyId),
  ]);

  const balances = stockByWarehouse(moves, onDate);
  const productById = new Map(products.map((p) => [p.id, p]));

  // товар → склад → количество
  const grid = new Map<string, Map<string, number>>();
  for (const row of balances) {
    const byWarehouse = grid.get(row.productId) ?? new Map<string, number>();
    byWarehouse.set(row.warehouseId, row.quantity);
    grid.set(row.productId, byWarehouse);
  }

  const rows = [...grid.keys()]
    .map((productId) => productById.get(productId))
    .filter((p): p is NonNullable<typeof p> => Boolean(p))
    .sort((a, b) =>
      (a.productGroup ?? "").localeCompare(b.productGroup ?? "") || a.name.localeCompare(b.name)
    );

  const totalValue = stockValueMinor(moves, onDate);
  const negative = negativeBalances(moves, onDate);

  return (
    <>
      <h1>Остатки на складах</h1>
      <p className="page-sub">Что и где лежит на выбранную дату</p>

      <div className="tabs">
        <Link href="/stock" className="active">
          Остатки
        </Link>
        <Link href="/stock/moves">Движения</Link>
        <Link href="/settings/warehouses">Склады</Link>
      </div>

      <form className="toolbar">
        <label className="field">
          Остатки на дату
          <input type="date" name="date" defaultValue={dateValue} />
        </label>
        <button type="submit" style={{ alignSelf: "flex-end" }}>
          Показать
        </button>
      </form>

      {negative.length > 0 && (
        <div className="alert error">
          <strong>Остаток ушёл в минус — где-то не оформлен приход.</strong>
          <br />
          {negative.slice(0, 5).map((n) => {
            const product = productById.get(n.productId);
            const warehouse = warehouses.find((w) => w.id === n.warehouseId);
            return (
              <span key={`${n.productId}-${n.warehouseId}`}>
                {product?.name ?? "товар"} на складе «{warehouse?.name ?? "склад"}»:{" "}
                {formatQuantity(n.quantity)} {product?.unit ?? "ед."}
                <br />
              </span>
            );
          })}
          Минусовой остаток означает, что товар списали или продали раньше, чем оприходовали.
          Себестоимость по таким продажам занижена — добавьте недостающий приход.
        </div>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">Стоимость запаса</div>
          <div className="value">{formatMoney(totalValue)}</div>
          <div className="hint">По ценам закупки тех партий, что ещё не проданы</div>
        </div>
        <div className="card">
          <div className="label">Позиций на остатке</div>
          <div className="value">{rows.length}</div>
          <div className="hint">Товаров с ненулевым остатком</div>
        </div>
        <div className="card">
          <div className="label">Складов и точек</div>
          <div className="value">{warehouses.length}</div>
          <div className="hint">
            <Link href="/settings/warehouses">Изменить список</Link>
          </div>
        </div>
      </div>

      {warehouses.length === 0 ? (
        <div className="alert info">
          Сначала заведите склады и торговые точки в{" "}
          <Link href="/settings/warehouses">справочнике складов</Link>.
        </div>
      ) : rows.length === 0 ? (
        <div className="alert info">
          На эту дату остатков нет. Оформите приход товара на вкладке{" "}
          <Link href="/stock/moves">«Движения»</Link>.
        </div>
      ) : (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Товар</th>
                <th>Ед.</th>
                {warehouses.map((w) => (
                  <th key={w.id} className="num">
                    {w.name}
                  </th>
                ))}
                <th className="num">Всего</th>
                <th className="num">Себестоимость ед.</th>
                <th className="num">Стоимость остатка</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((product) => {
                const byWarehouse = grid.get(product.id) ?? new Map<string, number>();
                const total = [...byWarehouse.values()].reduce((sum, q) => sum + q, 0);
                const unitCost = averageLotCostMinor(moves, product.id, onDate);
                return (
                  <tr key={product.id}>
                    <td>
                      <Link href={`/stock/${product.id}`}>{product.name}</Link>
                      {product.productGroup && (
                        <span className="muted"> · {product.productGroup}</span>
                      )}
                      {!product.isSellable && <span className="badge gray"> материал</span>}
                    </td>
                    <td className="muted">{product.unit ?? "ед."}</td>
                    {warehouses.map((w) => {
                      const qty = byWarehouse.get(w.id);
                      return (
                        <td key={w.id} className={`num ${qty !== undefined && qty < 0 ? "expense" : ""}`}>
                          {qty === undefined ? <span className="muted">—</span> : formatQuantity(qty)}
                        </td>
                      );
                    })}
                    <td className={`num ${total < 0 ? "expense" : ""}`}>
                      <strong>{formatQuantity(total)}</strong>
                    </td>
                    <td className="num">
                      {unitCost === null ? (
                        <span className="muted">нет данных</span>
                      ) : (
                        formatMoney(unitCost)
                      )}
                    </td>
                    <td className="num">
                      {unitCost === null ? (
                        <span className="muted">нет данных</span>
                      ) : (
                        formatMoney((unitCost * BigInt(Math.round(total * 1000))) / 1000n)
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <HelpNote title="Как читать эту таблицу">
        <p>
          <strong>Остаток по складам</strong> показывает, где физически лежит товар. Перемещение
          между складами переносит количество из одной колонки в другую, но колонка «Всего» не
          меняется — это не продажа и не расход.
        </p>
        <p>
          <strong>Себестоимость единицы</strong> — средняя цена закупки тех партий, которые ещё не
          проданы. Она отличается от цены в карточке продукта: если товар дорожал, старые партии
          продолжают числиться по старой цене, пока не закончатся.
        </p>
        <p>
          <strong>«Нет данных»</strong> вместо цены означает, что товар списывали или продавали, не
          оформив приход. Система не подставляет сегодняшнюю цену задним числом — иначе прибыль
          прошлых месяцев была бы выдумана.
        </p>
      </HelpNote>
    </>
  );
}
