import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { formatQuantity, loadStockMoves, MOVE_LABEL } from "@/lib/stock";
import { fifo, productLedger, stockByWarehouse } from "@/lib/calc/stock";
import { HelpNote } from "@/components/HelpNote";

/** Карточка товара на складе: остатки по складам, открытые партии и вся история движений. */
export default async function ProductStockPage({
  params,
  searchParams,
}: {
  params: Promise<{ productId: string }>;
  searchParams: Promise<{ warehouseId?: string }>;
}) {
  const tenant = await requireTenant();
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId } });
  if (!company?.stockEnabled) redirect("/settings/company");

  const { productId } = await params;
  const { warehouseId } = await searchParams;

  const [product, warehouses, moves] = await Promise.all([
    prisma.product.findFirst({ where: { id: productId, companyId: tenant.companyId } }),
    prisma.warehouse.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { name: "asc" },
    }),
    loadStockMoves(tenant.companyId, productId),
  ]);
  if (!product) notFound();

  const warehouseName = new Map(warehouses.map((w) => [w.id, w.name]));
  const balances = stockByWarehouse(moves).filter((b) => b.productId === productId);
  const result = fifo(moves);
  const lots = result.lots.filter((l) => l.productId === productId);
  const ledger = productLedger(moves, productId, warehouseId || undefined).reverse();

  const unit = product.unit ?? "ед.";
  const totalQuantity = balances.reduce((sum, b) => sum + b.quantity, 0);
  const totalValue = lots.reduce(
    (sum, l) => sum + (l.unitCostMinor * BigInt(Math.round(l.quantity * 1000))) / 1000n,
    0n
  );

  return (
    <>
      <h1>{product.name}</h1>
      <p className="page-sub">
        {product.productGroup ? `${product.productGroup} · ` : ""}
        {product.isSellable ? "товар" : "материал"} · измеряется в «{unit}»
      </p>

      <div className="tabs">
        <Link href="/stock">← Остатки</Link>
        <Link href={`/stock/moves?productId=${product.id}`}>Движения</Link>
        <Link href={`/settings/products/${product.id}`}>Карточка продукта</Link>
      </div>

      <div className="cards">
        <div className="card">
          <div className="label">Остаток всего</div>
          <div className={`value ${totalQuantity < 0 ? "expense" : ""}`}>
            {formatQuantity(totalQuantity)} {unit}
          </div>
          <div className="hint">По всем складам на сегодня</div>
        </div>
        <div className="card">
          <div className="label">Стоимость остатка</div>
          <div className="value">{formatMoney(totalValue)}</div>
          <div className="hint">По ценам непроданных партий</div>
        </div>
        <div className="card">
          <div className="label">Продано и списано</div>
          <div className="value">{formatMoney(result.totalCostMinor)}</div>
          <div className="hint">Себестоимость всех расходов за всю историю</div>
        </div>
      </div>

      {result.uncoveredQuantity > 0 && (
        <div className="alert error">
          {formatQuantity(result.uncoveredQuantity)} {unit} было продано или списано без прихода —
          себестоимость по этой части неизвестна и в отчётах не учтена. Прибыль по таким продажам
          завышена. Добавьте недостающий приход, чтобы цифры сошлись.
        </div>
      )}

      <h2>Остатки по складам</h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Склад / точка</th>
              <th className="num">Остаток</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {balances.length === 0 && (
              <tr>
                <td colSpan={3} className="muted">
                  Остатков нет
                </td>
              </tr>
            )}
            {balances.map((b) => (
              <tr key={b.warehouseId}>
                <td>{warehouseName.get(b.warehouseId) ?? "Склад удалён"}</td>
                <td className={`num ${b.quantity < 0 ? "expense" : ""}`}>
                  {formatQuantity(b.quantity)} <span className="muted">{unit}</span>
                </td>
                <td>
                  <Link href={`/stock/${product.id}?warehouseId=${b.warehouseId}`}>
                    история этого склада →
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Открытые партии</h2>
      <p className="muted" style={{ marginTop: -8 }}>
        Закупки, которые ещё не проданы целиком. Списываются в порядке поступления: первым уходит
        то, что куплено раньше.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата закупки</th>
              <th className="num">Осталось</th>
              <th className="num">Цена закупки за ед.</th>
              <th className="num">Стоимость остатка партии</th>
            </tr>
          </thead>
          <tbody>
            {lots.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Непроданных партий нет
                </td>
              </tr>
            )}
            {lots.map((lot) => (
              <tr key={lot.moveId}>
                <td>{lot.date.toLocaleDateString("ru-RU")}</td>
                <td className="num">
                  {formatQuantity(lot.quantity)} <span className="muted">{unit}</span>
                </td>
                <td className="num">{formatMoney(lot.unitCostMinor)}</td>
                <td className="num">
                  {formatMoney(
                    (lot.unitCostMinor * BigInt(Math.round(lot.quantity * 1000))) / 1000n
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>
        История движений
        {warehouseId && (
          <span className="muted" style={{ fontSize: "0.9rem", fontWeight: 400 }}>
            {" "}
            · только «{warehouseName.get(warehouseId) ?? "склад"}» ·{" "}
            <Link href={`/stock/${product.id}`}>показать все</Link>
          </span>
        )}
      </h2>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Операция</th>
              <th>Откуда</th>
              <th>Куда</th>
              <th className="num">Изменение</th>
              <th className="num">Остаток после</th>
            </tr>
          </thead>
          <tbody>
            {ledger.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Движений нет
                </td>
              </tr>
            )}
            {ledger.map((row) => (
              <tr key={row.move.id}>
                <td>{row.move.date.toLocaleDateString("ru-RU")}</td>
                <td>{MOVE_LABEL[row.move.type]}</td>
                <td className="muted">
                  {row.move.warehouseFromId
                    ? (warehouseName.get(row.move.warehouseFromId) ?? "—")
                    : "—"}
                </td>
                <td className="muted">
                  {row.move.warehouseToId
                    ? (warehouseName.get(row.move.warehouseToId) ?? "—")
                    : "—"}
                </td>
                <td className={`num ${row.delta < 0 ? "expense" : row.delta > 0 ? "income" : ""}`}>
                  {row.delta > 0 ? "+" : ""}
                  {formatQuantity(row.delta)}
                </td>
                <td className="num">{formatQuantity(row.balance)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <HelpNote title="Почему остаток по компании не меняется при перемещении">
        <p>
          Перемещение между складами показано в истории с изменением 0: товар никуда не делся, он
          просто переехал. Если открыть историю конкретного склада, то же перемещение будет видно
          как расход у одного склада и приход у другого.
        </p>
        <p>
          Себестоимость при перемещении тоже не меняется. Роза, купленная в офис по 300 ₸ и увезённая
          на точку, продаётся с себестоимостью 300 ₸ — независимо от того, по какой цене закупались
          розы позже.
        </p>
      </HelpNote>
    </>
  );
}
