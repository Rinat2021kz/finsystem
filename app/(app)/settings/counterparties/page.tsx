import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import {
  createCounterpartyAction,
  deleteCounterpartyAction,
  toggleCounterpartyAction,
  updateCounterpartyAction,
} from "../actions";

const CP_TYPES = ["клиент", "поставщик", "сотрудник", "прочее"];

export default async function CounterpartiesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const counterparties = await prisma.counterparty.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { name: "asc" },
  });
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Контрагенты</h1>
      <p className="page-sub">Клиенты, поставщики и сотрудники</p>

      {params.error === "inuse" && (
        <div className="alert error">
          Контрагента нельзя удалить: на него уже записаны операции. Скройте его — он исчезнет из
          форм, но останется в истории.
        </div>
      )}

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
                {CP_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t[0].toUpperCase() + t.slice(1)}
                  </option>
                ))}
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
            {counterparties.map((c) => {
              const formId = `cp-${c.id}`;
              return (
                <tr key={c.id}>
                  <td>
                    {admin ? (
                      <input name="name" form={formId} defaultValue={c.name} style={{ width: 180 }} />
                    ) : (
                      c.name
                    )}
                  </td>
                  <td className="muted">
                    {admin ? (
                      <select name="type" form={formId} defaultValue={c.type ?? "прочее"}>
                        {CP_TYPES.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    ) : (
                      c.type
                    )}
                  </td>
                  <td className="muted">
                    {admin ? (
                      <input name="contact" form={formId} defaultValue={c.contact ?? ""} style={{ width: 160 }} />
                    ) : (
                      c.contact
                    )}
                  </td>
                  <td>
                    <span className={`badge ${c.isActive ? "green" : "gray"}`}>
                      {c.isActive ? "Активен" : "Скрыт"}
                    </span>
                  </td>
                  {admin && (
                    <td style={{ whiteSpace: "nowrap" }}>
                      <form id={formId} action={updateCounterpartyAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="secondary" title="Сохранить изменения">
                          💾
                        </button>
                      </form>{" "}
                      <form action={toggleCounterpartyAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="secondary">
                          {c.isActive ? "Скрыть" : "Вернуть"}
                        </button>
                      </form>{" "}
                      <form action={deleteCounterpartyAction} style={{ display: "inline" }}>
                        <input type="hidden" name="id" value={c.id} />
                        <button type="submit" className="secondary" title="Удалить (если нет операций)">
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
