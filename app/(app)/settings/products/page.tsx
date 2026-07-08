import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { createProductAction, toggleProductAction } from "../actions";

export default async function ProductsPage() {
  const tenant = await requireTenant();
  const products = await prisma.product.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { name: "asc" },
  });
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Продукты и услуги</h1>
      <p className="page-sub">Что вы продаёте — основа для планирования продаж</p>

      {admin && (
        <form action={createProductAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название
              <input name="name" required placeholder="Например: Консультация" />
            </label>
            <label className="field">
              Единица
              <input name="unit" placeholder="шт / час / заказ" />
            </label>
            <label className="field">
              Базовая цена, ₸
              <input name="basePrice" inputMode="numeric" placeholder="0" />
            </label>
            <label className="field">
              Переменная себестоимость единицы, ₸
              <input name="costPerUnit" inputMode="numeric" placeholder="0" />
            </label>
            <button type="submit">Добавить</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Продукт</th>
              <th>Единица</th>
              <th className="num">Цена</th>
              <th className="num">Себестоимость ед.</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Добавьте первый продукт или услугу
                </td>
              </tr>
            )}
            {products.map((p) => (
              <tr key={p.id}>
                <td>{p.name}</td>
                <td className="muted">{p.unit}</td>
                <td className="num">{formatMoney(p.basePriceMinor)}</td>
                <td className="num">{formatMoney(p.costPerUnitMinor)}</td>
                <td>
                  <span className={`badge ${p.isActive ? "green" : "gray"}`}>
                    {p.isActive ? "Активен" : "Скрыт"}
                  </span>
                </td>
                {admin && (
                  <td>
                    <form action={toggleProductAction}>
                      <input type="hidden" name="id" value={p.id} />
                      <button type="submit" className="secondary">
                        {p.isActive ? "Скрыть" : "Вернуть"}
                      </button>
                    </form>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
