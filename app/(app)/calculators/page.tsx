import { requireTenant } from "@/lib/tenancy";
import { BreakEvenCard, CacLtvCard, UnitEconomicsCard } from "./client";

export default async function CalculatorsPage() {
  await requireTenant(); // доступ только участникам компании

  return (
    <>
      <h1>Калькуляторы</h1>
      <p className="page-sub">
        Быстрые расчёты «что если» — без сохранения, считают сразу при вводе. Маржа везде
        определяется одинаково: чек − переменные − привлечение.
      </p>
      <UnitEconomicsCard />
      <BreakEvenCard />
      <CacLtvCard />
    </>
  );
}
