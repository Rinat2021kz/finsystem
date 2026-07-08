// План продаж — SPEC раздел 6.5.
// quantity[n] = quantity[n-1] × (1 + growth_rate); revenue = price × quantity × seasonality.
// Деньги — bigint (тиын); количество и коэффициенты — десятичные с фиксированной точностью.

export interface SalesPlanRowCalc {
  productId: string | null;
  /** 1-е число месяца. */
  month: Date;
  plannedPriceMinor: bigint;
  /** Количество, до 2 знаков. */
  plannedQuantity: number;
  /** Коэффициент сезонности, до 4 знаков (1 = без сезонности). */
  seasonalityFactor: number;
}

/** Выручка строки плана: price × quantity × seasonality, целочисленно в тиынах. */
export function rowRevenueMinor(row: SalesPlanRowCalc): bigint {
  // количество ×100, сезонность ×10000 — деление в конце, без float в деньгах
  const qtyCents = BigInt(Math.round(row.plannedQuantity * 100));
  const factor = BigInt(Math.round(row.seasonalityFactor * 10000));
  if (qtyCents <= 0n || factor <= 0n || row.plannedPriceMinor <= 0n) return 0n;
  return (row.plannedPriceMinor * qtyCents * factor) / 1_000_000n;
}

/**
 * Ряд количеств на horizon месяцев с ростом growth_rate.
 * По умолчанию округляем до целого (операционный план); wholeUnits=false — до 2 знаков (прогноз).
 */
export function projectQuantities(
  baseQuantity: number,
  growthRate: number,
  months: number,
  wholeUnits = true
): number[] {
  const result: number[] = [];
  let q = baseQuantity;
  for (let i = 0; i < months; i++) {
    result.push(wholeUnits ? Math.round(q) : Math.round(q * 100) / 100);
    q = q * (1 + growthRate);
  }
  return result;
}

/** Суммарная плановая выручка за месяц по всем строкам плана. */
export function plannedRevenueForMonth(rows: SalesPlanRowCalc[], month: Date): bigint {
  let total = 0n;
  for (const r of rows) {
    if (
      r.month.getUTCFullYear() === month.getUTCFullYear() &&
      r.month.getUTCMonth() === month.getUTCMonth()
    ) {
      total += rowRevenueMinor(r);
    }
  }
  return total;
}

/** Суммарное плановое количество за месяц (для расходов per_unit). */
export function plannedUnitsForMonth(rows: SalesPlanRowCalc[], month: Date): number {
  let total = 0;
  for (const r of rows) {
    if (
      r.month.getUTCFullYear() === month.getUTCFullYear() &&
      r.month.getUTCMonth() === month.getUTCMonth()
    ) {
      total += r.plannedQuantity;
    }
  }
  return total;
}
