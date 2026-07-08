import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { investorShare, totalInvestmentMinor } from "@/lib/calc/investments";
import { formatMoney, formatPercent } from "@/lib/money";
import { MONTH_NAMES_RU, formatMonthRu } from "@/lib/period";
import { createInvestmentModelAction } from "./actions";

export default async function InvestmentsPage() {
  const tenant = await requireTenant();
  const models = await prisma.investmentModel.findMany({
    where: { companyId: tenant.companyId },
    orderBy: { createdAt: "desc" },
  });
  const items = await prisma.investmentItem.findMany({
    where: { companyId: tenant.companyId },
    select: { investmentModelId: true, totalCostMinor: true },
  });
  const admin = isAdmin(tenant.role);
  const currentYear = new Date().getFullYear();

  return (
    <>
      <h1>Инвестиционные сценарии</h1>
      <p className="page-sub">
        Потребность в инвестициях, доля инвестора, дивиденды, ROI и срок окупаемости
      </p>

      {admin && (
        <form action={createInvestmentModelAction} className="panel">
          <div className="form-grid">
            <label className="field">
              Название сценария
              <input name="name" required placeholder="Например: База 2026" />
            </label>
            <label className="field">
              Старт
              <select name="startMonth" defaultValue={new Date().getMonth() + 1}>
                {MONTH_NAMES_RU.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Год
              <select name="startYear" defaultValue={currentYear}>
                {[currentYear, currentYear + 1, currentYear + 2].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Горизонт, месяцев
              <input name="horizonMonths" type="number" min={1} max={60} defaultValue={24} />
            </label>
            <label className="field">
              Оценка компании, ₸
              <input name="valuation" inputMode="numeric" placeholder="40 000 000" />
            </label>
            <label className="field">
              Сумма инвестиций, ₸
              <input name="investment" inputMode="numeric" placeholder="10 000 000" />
            </label>
            <label className="field">
              Доля прибыли на дивиденды, %
              <input name="dividendPolicy" inputMode="decimal" placeholder="50" />
            </label>
            <button type="submit">Создать сценарий</button>
          </div>
        </form>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Сценарий</th>
              <th>Старт / горизонт</th>
              <th className="num">Потребность (статьи)</th>
              <th className="num">Инвестиции</th>
              <th className="num">Оценка</th>
              <th className="num">Доля инвестора</th>
            </tr>
          </thead>
          <tbody>
            {models.length === 0 && (
              <tr>
                <td colSpan={6} className="muted">
                  Создайте первый сценарий в форме выше
                </td>
              </tr>
            )}
            {models.map((m) => {
              const modelItems = items.filter((i) => i.investmentModelId === m.id);
              const need = totalInvestmentMinor(modelItems);
              const share = investorShare(
                m.investmentAmountMinor ?? 0n,
                m.companyValuationMinor ?? 0n
              );
              return (
                <tr key={m.id}>
                  <td>
                    <Link href={`/investments/${m.id}`}>{m.name}</Link>
                  </td>
                  <td className="muted">
                    {formatMonthRu(m.startMonth)} · {m.horizonMonths} мес.
                  </td>
                  <td className="num">{formatMoney(need)}</td>
                  <td className="num">{formatMoney(m.investmentAmountMinor ?? 0n)}</td>
                  <td className="num">{formatMoney(m.companyValuationMinor ?? 0n)}</td>
                  <td className="num">{formatPercent(share)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
