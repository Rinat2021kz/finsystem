import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { formatQuantity, loadStockMoves, WAREHOUSE_KIND_LABEL } from "@/lib/stock";
import { stockByWarehouse, stockValueMinor } from "@/lib/calc/stock";
import {
  createWarehouseAction,
  deleteWarehouseAction,
  toggleWarehouseAction,
  updateWarehouseAction,
} from "../actions";

export default async function WarehousesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const [company, warehouses, moves] = await Promise.all([
    prisma.company.findUnique({ where: { id: tenant.companyId } }),
    prisma.warehouse.findMany({
      where: { companyId: tenant.companyId },
      orderBy: [{ isActive: "desc" }, { name: "asc" }],
    }),
    loadStockMoves(tenant.companyId),
  ]);
  const admin = isAdmin(tenant.role);

  // сколько позиций и на какую сумму лежит на каждом складе — считаем на лету
  const balances = stockByWarehouse(moves);
  const perWarehouse = new Map<string, { positions: number; quantity: number }>();
  for (const row of balances) {
    const current = perWarehouse.get(row.warehouseId) ?? { positions: 0, quantity: 0 };
    perWarehouse.set(row.warehouseId, {
      positions: current.positions + 1,
      quantity: current.quantity + row.quantity,
    });
  }

  return (
    <>
      <h1>Склады и точки</h1>
      <p className="page-sub">Где физически лежит товар: склад, торговая точка, производство</p>

      {!company?.stockEnabled && (
        <div className="alert error">
          Складской модуль выключен. Включите его в{" "}
          <Link href="/settings/company">настройках компании</Link>, иначе раздел «Склад» не
          появится в меню.
        </div>
      )}

      {params.error === "inuse" && (
        <div className="alert error">
          Склад нельзя удалить: по нему уже есть движения товара. Скройте его — история сохранится.
        </div>
      )}

      <div className="alert info">
        <strong>Зачем это нужно:</strong> остаток товара считается отдельно по каждому складу, а
        себестоимость — в целом по компании, по цене той партии, которой товар был закуплен. Товар,
        перевезённый с офиса на точку, продаётся по своей закупочной цене, а не по средней.
        <br />
        Перемещение между складами — не приход и не расход: общий остаток компании оно не меняет,
        меняется только распределение. Это тот же принцип, что перевод между счетами для денег.
      </div>

      {admin && (
        <form action={createWarehouseAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название
              <input name="name" required placeholder="Например: Точка на Абая" />
            </label>
            <label className="field">
              Тип
              <select name="kind" defaultValue="point">
                {Object.entries(WAREHOUSE_KIND_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Адрес
              <input name="address" placeholder="Необязательно" />
            </label>
            <button type="submit">Добавить</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Склад / точка</th>
              <th>Тип</th>
              <th>Адрес</th>
              <th className="num">Позиций на остатке</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {warehouses.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Добавьте первый склад или торговую точку
                </td>
              </tr>
            )}
            {warehouses.map((w) => {
              const stat = perWarehouse.get(w.id);
              const formId = `wh-${w.id}`;
              return (
                <tr key={w.id}>
                  <td>
                    {admin ? (
                      <input name="name" form={formId} defaultValue={w.name} style={{ width: 180 }} />
                    ) : (
                      w.name
                    )}
                  </td>
                  <td className="muted">
                    {admin ? (
                      <select
                        name="kind"
                        form={formId}
                        defaultValue={w.kind}
                        style={{ width: 160 }}
                      >
                        {Object.entries(WAREHOUSE_KIND_LABEL).map(([value, label]) => (
                          <option key={value} value={value}>
                            {label}
                          </option>
                        ))}
                      </select>
                    ) : (
                      (WAREHOUSE_KIND_LABEL[w.kind as keyof typeof WAREHOUSE_KIND_LABEL] ?? w.kind)
                    )}
                  </td>
                  <td className="muted">
                    {admin ? (
                      <input
                        name="address"
                        form={formId}
                        defaultValue={w.address ?? ""}
                        style={{ width: 160 }}
                      />
                    ) : (
                      (w.address ?? "—")
                    )}
                  </td>
                  <td className="num">
                    {stat ? (
                      <>
                        {stat.positions}
                        <span className="muted"> · {formatQuantity(stat.quantity)} ед.</span>
                      </>
                    ) : (
                      <span className="muted">пусто</span>
                    )}
                  </td>
                  <td>
                    <span className={`badge ${w.isActive ? "green" : "gray"}`}>
                      {w.isActive ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  {admin && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form id={formId} action={updateWarehouseAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="secondary" title="Сохранить изменения">
                          💾
                        </button>
                      </form>{" "}
                      <form action={toggleWarehouseAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={w.id} />
                        <button type="submit" className="secondary">
                          {w.isActive ? "Скрыть" : "Вернуть"}
                        </button>
                      </form>{" "}
                      <form action={deleteWarehouseAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={w.id} />
                        <button
                          type="submit"
                          className="secondary"
                          title="Удалить (если нет движений)"
                        >
                          ✕
                        </button>
                      </form>
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {moves.length > 0 && (
        <p className="muted" style={{ marginTop: 12 }}>
          Всего на складах товара на {formatMoney(stockValueMinor(moves))} по ценам закупки.{" "}
          <Link href="/stock">Смотреть остатки →</Link>
        </p>
      )}
    </>
  );
}
