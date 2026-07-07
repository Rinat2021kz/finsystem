import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { projectMetrics } from "@/lib/calc/projects";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDateRu } from "@/lib/period";
import { TrafficDot, trafficBySign, trafficByRatio } from "@/components/Traffic";
import { updateProjectStatusAction } from "../actions";
import { STATUS_LABELS } from "../status";

export default async function ProjectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const tenant = await requireTenant();
  const { id } = await params;

  // мультитенантность: проект только своей компании
  const project = await prisma.project.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!project) notFound();

  const txns = await prisma.transaction.findMany({
    where: { companyId: tenant.companyId, projectId: id },
    include: { category: true, accountFrom: true, accountTo: true },
    orderBy: { dateCashflow: "desc" },
  });

  const m = projectMetrics(
    project.contractValueMinor,
    txns.map((t) => ({ type: t.type, amountMinor: t.amountMinor }))
  );
  const writable = canWrite(tenant.role);

  return (
    <>
      <p className="steps">
        <Link href="/projects">← Все проекты</Link>
      </p>
      <h1>
        {project.projectNumber ? `${project.projectNumber} — ` : ""}
        {project.customerName ?? "Проект"}
      </h1>
      <p className="page-sub">
        {project.description || "Без описания"}
        {project.orderDate ? ` · заказ от ${formatDateRu(project.orderDate)}` : ""}
      </p>

      {writable && (
        <form action={updateProjectStatusAction} className="toolbar">
          <input type="hidden" name="id" value={project.id} />
          <label className="field">
            Статус
            <select name="status" defaultValue={project.status}>
              {Object.entries(STATUS_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="secondary">
            Сохранить статус
          </button>
        </form>
      )}

      <div className="cards">
        <div className="card">
          <div className="label">Стоимость договора</div>
          <div className="value">{formatMoney(project.contractValueMinor)}</div>
          <div className="hint">Оплачено: {formatMoney(m.paidFactMinor)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={m.debtMinor > 0n ? "red" : "green"} /> Долг заказчика
          </div>
          <div className="value">{formatMoney(m.debtMinor)}</div>
          <div className="hint">
            {m.debtMinor > 0n ? "Что делать: напомнить заказчику об оплате" : "Долга нет"}
          </div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficBySign(m.plannedMarginMinor)} /> Плановая маржа
          </div>
          <div className="value">{formatMoney(m.plannedMarginMinor)}</div>
          <div className="hint">Рентабельность: {formatPercent(m.plannedProfitability)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficByRatio(m.cashProfitability)} /> Кассовая маржа
          </div>
          <div className="value">{formatMoney(m.cashMarginMinor)}</div>
          <div className="hint">
            Расходы: {formatMoney(m.expensesMinor)} · рентабельность:{" "}
            {formatPercent(m.cashProfitability)}
          </div>
        </div>
      </div>

      <h2>Операции проекта</h2>
      <p className="steps">
        Привязывайте оплаты и расходы к проекту на странице{" "}
        <Link href="/transactions">Операции</Link> — поле «Проект» в форме дохода/расхода.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Категория</th>
              <th>Счёт</th>
              <th className="num">Сумма</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Операций по проекту пока нет
                </td>
              </tr>
            )}
            {txns.map((t) => (
              <tr key={t.id}>
                <td>{formatDateRu(t.dateCashflow)}</td>
                <td>
                  <span className={`badge ${t.type === "income" ? "green" : "red"}`}>
                    {t.type === "income" ? "Оплата" : "Расход"}
                  </span>
                </td>
                <td>{t.category?.name ?? "—"}</td>
                <td className="muted">{t.accountTo?.name ?? t.accountFrom?.name ?? "—"}</td>
                <td className={`num ${t.type === "income" ? "income" : "expense"}`}>
                  {t.type === "expense" ? "−" : "+"}
                  {formatMoney(t.amountMinor)}
                </td>
                <td className="muted">{t.comment}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
