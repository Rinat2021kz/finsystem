import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney, formatPercent, safeRatio } from "@/lib/money";
import {
  createProductAction,
  deleteProductAction,
  toggleProductAction,
  updateProductAction,
} from "../actions";

export default async function ProductsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const products = await prisma.product.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { name: "asc" },
  });
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Продукты и услуги</h1>
      <p className="page-sub">Что вы продаёте — основа для планирования продаж</p>

      {params.error === "inuse" && (
        <div className="alert error">
          Продукт нельзя удалить: он используется в плане продаж или расходов. Удалите строки
          плана с этим продуктом или просто скройте его.
        </div>
      )}

      <div className="alert info">
        <strong>Как заполнять:</strong>
        <br />• <strong>Базовая цена</strong> — за сколько вы продаёте одну единицу (одну штуку,
        один час, один заказ). Она автоматически подставится в план продаж, если при построении
        плана оставить поле цены пустым.
        <br />• <strong>Переменная себестоимость единицы</strong> — сколько вы тратите на каждую
        проданную единицу: сырьё, упаковка, комиссия платёжной системы, сдельная оплата. Это
        затраты, которые растут вместе с продажами; аренда и оклады сюда не входят — они
        постоянные.
        <br />• <strong>Маржа с единицы</strong> = цена − себестоимость: сколько денег приносит
        каждая продажа. Эту же цифру используйте в калькуляторах (юнит-экономика, точка
        безубыточности) и в плане расходов «на единицу продаж».
      </div>

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
              <th className="num">Маржа с ед.</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {products.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Добавьте первый продукт или услугу
                </td>
              </tr>
            )}
            {products.map((p) => {
              const margin = p.basePriceMinor - p.costPerUnitMinor;
              const marginRatio =
                p.basePriceMinor > 0n ? safeRatio(margin, p.basePriceMinor) : null;
              const formId = `prod-${p.id}`;
              return (
                <tr key={p.id}>
                  <td>
                    {admin ? (
                      <input name="name" form={formId} defaultValue={p.name} style={{ width: 180 }} />
                    ) : (
                      p.name
                    )}
                  </td>
                  <td className="muted">
                    {admin ? (
                      <input name="unit" form={formId} defaultValue={p.unit ?? ""} style={{ width: 70 }} />
                    ) : (
                      p.unit
                    )}
                  </td>
                  <td className="num">
                    {admin ? (
                      <input
                        name="basePrice"
                        form={formId}
                        defaultValue={(p.basePriceMinor / 100n).toString()}
                        inputMode="numeric"
                        style={{ width: 100, textAlign: "right" }}
                      />
                    ) : (
                      formatMoney(p.basePriceMinor)
                    )}
                  </td>
                  <td className="num">
                    {admin ? (
                      <input
                        name="costPerUnit"
                        form={formId}
                        defaultValue={(p.costPerUnitMinor / 100n).toString()}
                        inputMode="numeric"
                        style={{ width: 100, textAlign: "right" }}
                      />
                    ) : (
                      formatMoney(p.costPerUnitMinor)
                    )}
                  </td>
                  <td className={`num ${margin < 0n ? "expense" : ""}`}>
                    {formatMoney(margin)}
                    <span className="muted"> · {formatPercent(marginRatio)}</span>
                    <br />
                    <Link href={`/settings/products/${p.id}`} style={{ fontSize: "0.8rem" }}>
                      состав →
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${p.isActive ? "green" : "gray"}`}>
                      {p.isActive ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  {admin && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form id={formId} action={updateProductAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="secondary" title="Сохранить изменения">
                          💾
                        </button>
                      </form>{" "}
                      <form action={toggleProductAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="secondary">
                          {p.isActive ? "Скрыть" : "Вернуть"}
                        </button>
                      </form>{" "}
                      <form action={deleteProductAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={p.id} />
                        <button type="submit" className="secondary" title="Удалить (если не используется)">
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
    </>
  );
}
