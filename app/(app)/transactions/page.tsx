import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { formatMoney } from "@/lib/money";
import { formatDateRu, formatMonthRu } from "@/lib/period";
import { TransactionForm } from "./form";
import { deleteTransactionAction } from "./actions";

const TYPE_LABEL = { income: "Доход", expense: "Расход", transfer: "Перевод" } as const;

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{
    add?: string;
    from?: string;
    to?: string;
    account?: string;
    category?: string;
    added?: string;
    error?: string;
  }>;
}) {
  const tenant = await requireTenant();
  const params = await searchParams;
  const addType = (["income", "expense", "transfer"] as const).find((t) => t === params.add);

  const [accounts, categories, counterparties, company, projects] = await Promise.all([
    prisma.account.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.category.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: [{ type: "asc" }, { name: "asc" }],
    }),
    prisma.counterparty.findMany({
      where: { companyId: tenant.companyId, isActive: true },
      orderBy: { name: "asc" },
    }),
    prisma.company.findUnique({ where: { id: tenant.companyId } }),
    prisma.project.findMany({
      where: {
        companyId: tenant.companyId,
        status: { notIn: ["cancelled", "done", "paid"] },
      },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // фильтры таблицы
  const where: Parameters<typeof prisma.transaction.findMany>[0] = {
    where: {
      companyId: tenant.companyId,
      ...(params.from ? { dateCashflow: { gte: new Date(params.from) } } : {}),
      ...(params.to
        ? { dateCashflow: { ...(params.from ? { gte: new Date(params.from) } : {}), lte: new Date(params.to) } }
        : {}),
      ...(params.account
        ? { OR: [{ accountFromId: params.account }, { accountToId: params.account }] }
        : {}),
      ...(params.category ? { categoryId: params.category } : {}),
    },
  };
  const txns = await prisma.transaction.findMany({
    ...where,
    include: { category: true, accountFrom: true, accountTo: true, counterparty: true },
    orderBy: [{ dateCashflow: "desc" }, { createdAt: "desc" }],
    take: 200,
  });

  const writable = canWrite(tenant.role);

  return (
    <>
      <h1>Операции</h1>
      <p className="page-sub">Доходы, расходы и переводы между счетами</p>

      {params.added && <div className="alert success">Операция добавлена</div>}
      {params.error === "closed" && (
        <div className="alert error">Месяц закрыт — операцию нельзя изменить или удалить.</div>
      )}

      {writable && (
        <div className="tabs">
          <Link href="/transactions?add=income" className={addType === "income" ? "active" : ""}>
            + Доход
          </Link>
          <Link href="/transactions?add=expense" className={addType === "expense" ? "active" : ""}>
            + Расход
          </Link>
          <Link href="/transactions?add=transfer" className={addType === "transfer" ? "active" : ""}>
            ⇄ Перевод
          </Link>
        </div>
      )}

      {writable && addType && (
        <TransactionForm
          type={addType}
          accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
          categories={categories
            .filter((c) => c.type === addType)
            .map((c) => ({ id: c.id, name: c.name }))}
          counterparties={counterparties.map((c) => ({ id: c.id, name: c.name }))}
          projects={
            company?.projectsEnabled
              ? projects.map((p) => ({
                  id: p.id,
                  name: `${p.projectNumber ? `${p.projectNumber} — ` : ""}${p.customerName ?? "Проект"}`,
                }))
              : []
          }
        />
      )}

      <form method="get" action="/transactions" className="toolbar">
        <label className="field">
          С даты
          <input type="date" name="from" defaultValue={params.from ?? ""} />
        </label>
        <label className="field">
          По дату
          <input type="date" name="to" defaultValue={params.to ?? ""} />
        </label>
        <label className="field">
          Счёт
          <select name="account" defaultValue={params.account ?? ""}>
            <option value="">Все</option>
            {accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Категория
          <select name="category" defaultValue={params.category ?? ""}>
            <option value="">Все</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <button type="submit" className="secondary">
          Фильтровать
        </button>
      </form>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Категория</th>
              <th>Счёт</th>
              <th className="num">Сумма</th>
              <th>Месяц ОПУ</th>
              <th>Комментарий</th>
              {writable && <th />}
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  Операций не найдено
                </td>
              </tr>
            )}
            {txns.map((t) => (
              <tr key={t.id}>
                <td>{formatDateRu(t.dateCashflow)}</td>
                <td>
                  <span
                    className={`badge ${t.type === "income" ? "green" : t.type === "expense" ? "red" : "gray"}`}
                  >
                    {TYPE_LABEL[t.type]}
                  </span>
                </td>
                <td>{t.category?.name ?? (t.type === "transfer" ? "Перевод" : "—")}</td>
                <td className="muted">
                  {t.type === "income" && t.accountTo?.name}
                  {t.type === "expense" && t.accountFrom?.name}
                  {t.type === "transfer" && `${t.accountFrom?.name} → ${t.accountTo?.name}`}
                </td>
                <td className={`num ${t.type === "income" ? "income" : t.type === "expense" ? "expense" : ""}`}>
                  {t.type === "expense" ? "−" : t.type === "income" ? "+" : ""}
                  {formatMoney(t.amountMinor)}
                </td>
                <td className="muted">{t.periodPnl ? formatMonthRu(t.periodPnl) : "не в ОПУ"}</td>
                <td className="muted">{t.comment}</td>
                {writable && (
                  <td>
                    <form action={deleteTransactionAction}>
                      <input type="hidden" name="id" value={t.id} />
                      <button type="submit" className="secondary" title="Удалить">
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
    </>
  );
}
