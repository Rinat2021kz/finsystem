import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { loadCalcData } from "@/lib/reports";
import { cashflowForAccount } from "@/lib/calc/cashflow";
import { formatMoney } from "@/lib/money";
import { formatDateRu } from "@/lib/period";
import { rangeFromSearchParams } from "@/lib/range";
import { RangePicker } from "@/components/RangePicker";
import { HelpNote } from "@/components/HelpNote";
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

export default async function AccountsPage({
  searchParams,
}: {
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
  // движение по счетам считается по дате платежа — произвольный диапазон корректен
  const range = rangeFromSearchParams(await searchParams);

  const [accountRows, { txns, accounts }] = await Promise.all([
    prisma.account.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: "asc" },
    }),
    loadCalcData(tenant.companyId),
  ]);
  const admin = isAdmin(tenant.role);

  const rows = accountRows.map((a) => {
    const calc = accounts.find((x) => x.id === a.id);
    return {
      account: a,
      cf: calc ? cashflowForAccount(txns, calc, range.from, range.to) : null,
    };
  });

  const totals = rows.reduce(
    (acc, r) => ({
      opening: acc.opening + (r.cf?.openingMinor ?? 0n),
      in: acc.in + (r.cf?.cashInMinor ?? 0n),
      out: acc.out + (r.cf?.cashOutMinor ?? 0n),
      closing: acc.closing + (r.cf?.closingMinor ?? 0n),
    }),
    { opening: 0n, in: 0n, out: 0n, closing: 0n }
  );

  return (
    <>
      <h1>Счета</h1>
      <p className="page-sub">
        Банковские счета, кассы и карты компании — движение за {range.label}
      </p>

      <RangePicker range={range} action="/settings/accounts" />
      <HelpNote title="Как читать таблицу счетов">
        «На начало» — сколько лежало на счёте в первый день выбранного периода (стартовый остаток
        счёта плюс всё движение до периода). Дальше — поступления и выплаты за период, отдельно
        переводы между своими счетами, и «На конец» — сколько осталось в последний день периода.
        Переводы показаны отдельными колонками: они не доход и не расход, но остаток конкретного
        счёта меняют. Итоговая строка складывает все счета — по ней видно общий запас денег.
      </HelpNote>

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
              <th className="num">На начало</th>
              <th className="num">Поступления</th>
              <th className="num">Выплаты</th>
              <th className="num">Переводы +</th>
              <th className="num">Переводы −</th>
              <th className="num">На конец</th>
              <th>Статус</th>
              {admin && <th />}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={admin ? 10 : 9} className="muted">
                  Счетов пока нет — добавьте первый в форме выше
                </td>
              </tr>
            )}
            {rows.map(({ account: a, cf }) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td className="muted">{TYPE_LABELS[a.type] ?? a.type}</td>
                <td className="num">{formatMoney(cf?.openingMinor ?? 0n)}</td>
                <td className="num income">{formatMoney(cf?.cashInMinor ?? 0n)}</td>
                <td className="num expense">{formatMoney(cf?.cashOutMinor ?? 0n)}</td>
                <td className="num muted">{formatMoney(cf?.transferInMinor ?? 0n)}</td>
                <td className="num muted">{formatMoney(cf?.transferOutMinor ?? 0n)}</td>
                <td className="num">{formatMoney(cf?.closingMinor ?? 0n)}</td>
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
            {rows.length > 0 && (
              <tr className="total">
                <td colSpan={2}>Итого по всем счетам</td>
                <td className="num">{formatMoney(totals.opening)}</td>
                <td className="num income">{formatMoney(totals.in)}</td>
                <td className="num expense">{formatMoney(totals.out)}</td>
                <td className="num muted" colSpan={2}>
                  переводы не меняют общий остаток
                </td>
                <td className="num">{formatMoney(totals.closing)}</td>
                <td />
                {admin && <td />}
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <p className="steps">
        Начальные остатки заданы на {accountRows[0] ? formatDateRu(accountRows[0].openingBalanceDate) : "дату начала учёта"}.
        Подробное движение денег — в отчёте <a href="/reports/cashflow">ДДС</a>.
      </p>
    </>
  );
}
