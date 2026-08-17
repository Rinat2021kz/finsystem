import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { projectMetrics } from "@/lib/calc/projects";
import { formatMoney, formatPercent } from "@/lib/money";
import { formatDateRu } from "@/lib/period";
import { TrafficDot, trafficBySign, trafficByRatio } from "@/components/Traffic";
import { PrintButton } from "@/components/PrintButton";
import { HelpNote } from "@/components/HelpNote";
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

  // отчёт собирается сам: все операции, привязанные к проекту
  const txns = await prisma.transaction.findMany({
    where: { companyId: tenant.companyId, projectId: id },
    include: { category: true, accountFrom: true, accountTo: true, counterparty: true },
    orderBy: { dateCashflow: "desc" },
  });

  const m = projectMetrics(
    project.contractValueMinor,
    txns.map((t) => ({ type: t.type, amountMinor: t.amountMinor }))
  );
  const writable = canWrite(tenant.role);

  // плановая себестоимость задана — можно сравнить с фактическими расходами
  const costOverrun =
    project.plannedCostMinor > 0n ? m.expensesMinor - project.plannedCostMinor : null;

  const general: Array<{ label: string; value: string }> = [
    { label: "Текущий статус", value: STATUS_LABELS[project.status] ?? project.status },
    { label: "Номер проекта", value: project.projectNumber || "—" },
    { label: "Заказчик", value: project.customerName || "—" },
    { label: "Описание", value: project.description || "—" },
    { label: "Категория", value: project.category || "—" },
    { label: "Дата заказа", value: project.orderDate ? formatDateRu(project.orderDate) : "—" },
    { label: "Дата закрытия", value: project.closeDate ? formatDateRu(project.closeDate) : "—" },
  ];

  return (
    <>
      <p className="steps no-print">
        <Link href="/projects">← Все проекты</Link>
      </p>
      <h1>
        Отчёт по проекту{project.projectNumber ? ` ${project.projectNumber}` : ""}
      </h1>
      <p className="page-sub">
        {project.customerName ? `${project.customerName} · ` : ""}
        {project.description || "Без описания"}
      </p>

      <HelpNote title="Как собирается этот отчёт">
        Отчёт заполняется автоматически. Как только вы привязываете операцию к проекту (поле
        «Проект» в форме дохода или расхода), она попадает сюда — и одновременно в ДДС, в ОПУ и в
        общие отчёты. Вносить расход дважды не нужно: одна операция работает во всех отчётах.
        <br />
        <strong>Оплачено</strong> — сколько денег заказчик уже перевёл, <strong>долг</strong> —
        остаток от стоимости договора. <strong>Кассовая маржа</strong> считается от реально
        полученных денег (оплачено минус расходы), <strong>плановая</strong> — от полной стоимости
        договора: она показывает, сколько проект принесёт, когда заказчик рассчитается полностью.
      </HelpNote>

      <div className="toolbar no-print">
        <PrintButton />
        {writable && (
          <form action={updateProjectStatusAction} className="toolbar" style={{ margin: 0 }}>
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
      </div>

      <h2>Общие данные</h2>
      <div className="table-wrap">
        <table>
          <tbody>
            {general.map((g) => (
              <tr key={g.label}>
                <td style={{ width: "34%" }} className="muted">
                  {g.label}
                </td>
                <td>{g.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Финансы</h2>
      <div className="cards">
        <div className="card">
          <div className="label">Стоимость проекта</div>
          <div className="value">{formatMoney(project.contractValueMinor)}</div>
          <div className="hint">Оплачено: {formatMoney(m.paidFactMinor)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={m.debtMinor > 0n ? "red" : "green"} /> Долг по оплате
          </div>
          <div className="value">{formatMoney(m.debtMinor)}</div>
          <div className="hint">
            {m.debtMinor > 0n ? "Что делать: напомнить заказчику об оплате" : "Долга нет"}
          </div>
        </div>
        <div className="card">
          <div className="label">Расходы на проект</div>
          <div className="value">{formatMoney(m.expensesMinor)}</div>
          <div className="hint">
            {costOverrun === null
              ? "Плановая себестоимость не задана"
              : costOverrun > 0n
                ? `Перерасход к плану: ${formatMoney(costOverrun)}`
                : `Экономия к плану: ${formatMoney(-costOverrun)}`}
          </div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficBySign(m.plannedMarginMinor)} /> Маржа (плановая)
          </div>
          <div className="value">{formatMoney(m.plannedMarginMinor)}</div>
          <div className="hint">Рентабельность: {formatPercent(m.plannedProfitability)}</div>
        </div>
        <div className="card">
          <div className="label">
            <TrafficDot color={trafficByRatio(m.cashProfitability)} /> Маржа (по деньгам)
          </div>
          <div className="value">{formatMoney(m.cashMarginMinor)}</div>
          <div className="hint">
            Рентабельность:{" "}
            {m.cashProfitability === null ? "нет оплат" : formatPercent(m.cashProfitability)}
          </div>
        </div>
      </div>

      <h2>Операции проекта</h2>
      <p className="steps no-print">
        Привязывайте оплаты и расходы к проекту на странице{" "}
        <Link href="/transactions">Операции</Link> — поле «Проект» в форме дохода/расхода.
      </p>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Тип</th>
              <th>Статья</th>
              <th>Счёт</th>
              <th>Контрагент</th>
              <th className="num">Сумма</th>
              <th>Комментарий</th>
            </tr>
          </thead>
          <tbody>
            {txns.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Операций по проекту пока нет — отчёт заполнится сам, как только вы привяжете
                  первую оплату или расход
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
                <td className="muted">{t.counterparty?.name ?? "—"}</td>
                <td className={`num ${t.type === "income" ? "income" : "expense"}`}>
                  {t.type === "expense" ? "−" : "+"}
                  {formatMoney(t.amountMinor)}
                </td>
                <td className="muted">{t.comment}</td>
              </tr>
            ))}
            {txns.length > 0 && (
              <>
                <tr className="total">
                  <td colSpan={5}>Итого оплачено заказчиком</td>
                  <td className="num income">{formatMoney(m.paidFactMinor)}</td>
                  <td />
                </tr>
                <tr className="total">
                  <td colSpan={5}>Итого расходов по проекту</td>
                  <td className="num expense">−{formatMoney(m.expensesMinor)}</td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
