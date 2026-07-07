import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { projectMetrics } from "@/lib/calc/projects";
import { formatMoney, formatPercent } from "@/lib/money";
import { ProjectForm } from "./form";
import { STATUS_BADGE, STATUS_LABELS } from "./status";

export default async function ProjectsPage() {
  const tenant = await requireTenant();

  const [projects, txns] = await Promise.all([
    prisma.project.findMany({
      where: { companyId: tenant.companyId },
      orderBy: { createdAt: "desc" },
    }),
    prisma.transaction.findMany({
      where: { companyId: tenant.companyId, projectId: { not: null } },
      select: { projectId: true, type: true, amountMinor: true },
    }),
  ]);

  const byProject = new Map<string, { type: "income" | "expense" | "transfer"; amountMinor: bigint }[]>();
  for (const t of txns) {
    if (!t.projectId) continue;
    const list = byProject.get(t.projectId) ?? [];
    list.push({ type: t.type, amountMinor: t.amountMinor });
    byProject.set(t.projectId, list);
  }

  const writable = canWrite(tenant.role);

  return (
    <>
      <h1>Проекты</h1>
      <p className="page-sub">
        Заказы и проекты: оплата, долг, расходы и маржа считаются по привязанным операциям
      </p>

      {writable && <ProjectForm />}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Проект</th>
              <th>Статус</th>
              <th className="num">Стоимость</th>
              <th className="num">Оплачено</th>
              <th className="num">Долг</th>
              <th className="num">Расходы</th>
              <th className="num">Кассовая маржа</th>
              <th className="num">Рент.</th>
            </tr>
          </thead>
          <tbody>
            {projects.length === 0 && (
              <tr>
                <td colSpan={8} className="muted">
                  Проектов пока нет — добавьте первый в форме выше
                </td>
              </tr>
            )}
            {projects.map((p) => {
              const m = projectMetrics(p.contractValueMinor, byProject.get(p.id) ?? []);
              return (
                <tr key={p.id}>
                  <td>
                    <Link href={`/projects/${p.id}`}>
                      {p.projectNumber ? `${p.projectNumber} — ` : ""}
                      {p.customerName ?? "Без названия"}
                    </Link>
                  </td>
                  <td>
                    <span className={`badge ${STATUS_BADGE[p.status] ?? "gray"}`}>
                      {STATUS_LABELS[p.status] ?? p.status}
                    </span>
                  </td>
                  <td className="num">{formatMoney(p.contractValueMinor)}</td>
                  <td className="num income">{formatMoney(m.paidFactMinor)}</td>
                  <td className={`num ${m.debtMinor > 0n ? "expense" : ""}`}>
                    {formatMoney(m.debtMinor)}
                  </td>
                  <td className="num">{formatMoney(m.expensesMinor)}</td>
                  <td className="num">{formatMoney(m.cashMarginMinor)}</td>
                  <td className="num muted">{formatPercent(m.cashProfitability)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
