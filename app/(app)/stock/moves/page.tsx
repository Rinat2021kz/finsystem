import Link from "next/link";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { formatQuantity, MOVE_LABEL } from "@/lib/stock";
import { rangeFromSearchParams, rangeToQuery } from "@/lib/range";
import { RangePicker } from "@/components/RangePicker";
import { HelpNote } from "@/components/HelpNote";
import { StockMoveForm } from "../form";
import { deleteStockMoveAction } from "../actions";

export default async function StockMovesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const tenant = await requireTenant();
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId } });
  if (!company?.stockEnabled) redirect("/settings/company");

  const params = await searchParams;
  const range = rangeFromSearchParams(params, "month");
  const productFilter = params.productId ?? "";
  const warehouseFilter = params.warehouseId ?? "";

  const [products, warehouses, projects, moves] = await Promise.all([
    prisma.product.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: [{ productGroup: "asc" }, { name: "asc" }],
    }),
    prisma.warehouse.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    company.projectsEnabled
      ? prisma.project.findMany({
          where: { companyId: tenant.companyId },
          orderBy: { createdAt: "desc" },
        })
      : Promise.resolve([]),
    prisma.stockMove.findMany({
      where: {
        companyId: tenant.companyId,
        date: { gte: range.from, lte: range.to },
        ...(productFilter ? { productId: productFilter } : {}),
        ...(warehouseFilter
          ? { OR: [{ warehouseFromId: warehouseFilter }, { warehouseToId: warehouseFilter }] }
          : {}),
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      include: {
        product: { select: { name: true, unit: true } },
        warehouseFrom: { select: { name: true } },
        warehouseTo: { select: { name: true } },
        project: { select: { projectNumber: true, customerName: true } },
      },
      take: 500,
    }),
  ]);

  const writable = canWrite(tenant.role);
  const query = rangeToQuery(range);

  return (
    <>
      <h1>Движения товара</h1>
      <p className="page-sub">Приход, перемещение, списание и отгрузка</p>

      <div className="tabs">
        <Link href={`/stock?${query}`}>Остатки</Link>
        <Link href="/stock/moves" className="active">
          Движения
        </Link>
        <Link href="/settings/warehouses">Склады</Link>
      </div>

      {params.added === "1" && <div className="alert success">Движение записано</div>}
      {params.error === "closed" && (
        <div className="alert error">
          Месяц закрыт — движения этого периода изменить нельзя. Попросите администратора открыть
          месяц.
        </div>
      )}

      {warehouses.length === 0 && (
        <div className="alert info">
          Сначала заведите склады и точки в{" "}
          <Link href="/settings/warehouses">справочнике складов</Link>.
        </div>
      )}
      {products.length === 0 && (
        <div className="alert info">
          Сначала заведите товары в <Link href="/settings/products">справочнике продуктов</Link>.
        </div>
      )}

      {writable && warehouses.length > 0 && products.length > 0 && (
        <StockMoveForm
          products={products.map((p) => ({
            id: p.id,
            name: p.productGroup ? `${p.productGroup} · ${p.name}` : p.name,
          }))}
          warehouses={warehouses.map((w) => ({ id: w.id, name: w.name }))}
          projects={projects.map((p) => ({
            id: p.id,
            name: [p.projectNumber, p.customerName].filter(Boolean).join(" · ") || "Без номера",
          }))}
        />
      )}

      <RangePicker range={range} action="/stock/moves">
        <label className="field">
          Товар
          <select name="productId" defaultValue={productFilter}>
            <option value="">Все</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Склад
          <select name="warehouseId" defaultValue={warehouseFilter}>
            <option value="">Все</option>
            {warehouses.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </label>
      </RangePicker>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Операция</th>
              <th>Товар</th>
              <th className="num">Кол-во</th>
              <th>Откуда</th>
              <th>Куда</th>
              <th className="num">Цена закупки</th>
              <th>Комментарий</th>
              {writable && <th />}
            </tr>
          </thead>
          <tbody>
            {moves.length === 0 && (
              <tr>
                <td colSpan={9} className="muted">
                  За выбранный период движений нет
                </td>
              </tr>
            )}
            {moves.map((m) => (
              <tr key={m.id}>
                <td>{m.date.toLocaleDateString("ru-RU")}</td>
                <td>
                  <span
                    className={`badge ${
                      m.type === "receipt"
                        ? "green"
                        : m.type === "transfer"
                          ? "gray"
                          : m.type === "writeoff"
                            ? "yellow"
                            : "red"
                    }`}
                  >
                    {MOVE_LABEL[m.type]}
                  </span>
                </td>
                <td>{m.product.name}</td>
                <td className="num">
                  {formatQuantity(Number(m.quantity))}{" "}
                  <span className="muted">{m.product.unit ?? "ед."}</span>
                </td>
                <td className="muted">{m.warehouseFrom?.name ?? "—"}</td>
                <td className="muted">{m.warehouseTo?.name ?? "—"}</td>
                <td className="num">
                  {m.unitCostMinor === null ? (
                    <span className="muted">—</span>
                  ) : (
                    formatMoney(m.unitCostMinor)
                  )}
                </td>
                <td className="muted">
                  {m.project && (
                    <span className="badge gray">
                      {[m.project.projectNumber, m.project.customerName]
                        .filter(Boolean)
                        .join(" · ") || "проект"}
                    </span>
                  )}{" "}
                  {m.comment}
                </td>
                {writable && (
                  <td>
                    <form action={deleteStockMoveAction}>
                      <input type="hidden" name="id" value={m.id} />
                      <button type="submit" className="secondary" title="Удалить движение">
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

      <HelpNote title="Чем эти операции отличаются друг от друга">
        <p>
          <strong>Приход</strong> — товар приехал от поставщика. Здесь указывается цена закупки: она
          создаёт партию. Когда товар продадут, себестоимость возьмётся именно из этой партии, а не
          из карточки продукта. Деньги за закупку проводятся отдельной операцией расхода — товар и
          деньги живут по разным датам, и это нормально.
        </p>
        <p>
          <strong>Перемещение</strong> — товар переехал между складами. Ни доход, ни расход: общий
          остаток компании не меняется, себестоимость тоже. Точно так же, как перевод между
          счетами не меняет общую сумму денег.
        </p>
        <p>
          <strong>Списание</strong> — товар израсходован без продажи: брак, порча, ушёл в
          производство. Его себестоимость становится расходом, а если указан проект — попадает в
          себестоимость этого заказа.
        </p>
        <p>
          <strong>Продажа / отгрузка</strong> — товар ушёл покупателю. Себестоимость проданного
          попадает в ОПУ за месяц отгрузки. Система не даст отгрузить больше, чем есть на складе, —
          сначала оформите приход.
        </p>
      </HelpNote>
    </>
  );
}
