import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { createCounterpartyAction, toggleCounterpartyAction } from "../actions";

export default async function CounterpartiesPage() {
  const tenant = await requireTenant();
  const counterparties = await prisma.counterparty.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { name: "asc" },
  });
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Контрагенты</h1>
      <p className="page-sub">Клиенты, поставщики и сотрудники</p>

      {admin && (
        <form action={createCounterpartyAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название / имя
              <input name="name" required />
            </label>
            <label className="field">
              Тип
              <select name="type" defaultValue="клиент">
                <option value="клиент">Клиент</option>
                <option value="поставщик">Поставщик</option>
                <option value="сотрудник">Сотрудник</option>
                <option value="прочее">Прочее</option>
              </select>
            </label>
            <label className="field">
              Контакт
              <input name="contact" placeholder="Телефон или e-mail" />
            </label>
            <button type="submit">Добавить</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Название</th>
              <th>Тип</th>
              <th>Контакт</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {counterparties.length === 0 && (
              <tr>
                <td colSpan={5} className="muted">
                  Пока нет контрагентов
                </td>
              </tr>
            )}
            {counterparties.map((c) => (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td className="muted">{c.type}</td>
                <td className="muted">{c.contact}</td>
                <td>
                  <span className={`badge ${c.isActive ? "green" : "gray"}`}>
                    {c.isActive ? "Активен" : "Скрыт"}
                  </span>
                </td>
                {admin && (
                  <td>
                    <form action={toggleCounterpartyAction}>
                      <input type="hidden" name="id" value={c.id} />
                      <button type="submit" className="secondary">
                        {c.isActive ? "Скрыть" : "Вернуть"}
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
