import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { createAccountAction, toggleAccountAction } from "../actions";

const TYPE_LABELS: Record<string, string> = {
  bank: "Банковский счёт",
  cash: "Наличные",
  card: "Карта",
  deposit: "Депозит",
  reserve: "Резерв",
  owner_personal: "Личный счёт владельца",
  other: "Другое",
};

export default async function AccountsPage() {
  const tenant = await requireTenant();
  const accounts = await prisma.account.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { createdAt: "asc" },
  });
  const admin = isAdmin(tenant.role);

  return (
    <>
      <h1>Счета</h1>
      <p className="page-sub">Банковские счета, кассы и карты компании</p>

      {admin && (
        <form action={createAccountAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название
              <input name="name" required placeholder="Например: Kaspi Pay" />
            </label>
            <label className="field">
              Тип
              <select name="type" defaultValue="bank">
                {Object.entries(TYPE_LABELS).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Начальный остаток, ₸
              <input name="opening" inputMode="numeric" placeholder="0" />
            </label>
            <button type="submit">Добавить счёт</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Счёт</th>
              <th>Тип</th>
              <th className="num">Начальный остаток</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{TYPE_LABELS[a.type] ?? a.type}</td>
                <td className="num">{formatMoney(a.openingBalanceMinor)}</td>
                <td>
                  <span className={`badge ${a.isActive ? "green" : "gray"}`}>
                    {a.isActive ? "Активен" : "Скрыт"}
                  </span>
                </td>
                {admin && (
                  <td>
                    <form action={toggleAccountAction}>
                      <input type="hidden" name="id" value={a.id} />
                      <button type="submit" className="secondary">
                        {a.isActive ? "Скрыть" : "Вернуть"}
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
