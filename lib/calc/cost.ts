// Рецептура: расчёт переменной себестоимости единицы продукта по составу.
// per_unit: количество × цена за единицу измерения; percent_of_price: % от базовой цены.
// Деньги — bigint (тиын); количество до 3 знаков, процент до 4 знаков.

export type ComponentKind = "per_unit" | "percent_of_price";

export interface ComponentCalc {
  kind: ComponentKind;
  /** Количество в единицах измерения (0.018 кг, 180 мл, 1 шт). */
  quantity: number;
  /** Цена за единицу измерения (₸/кг, ₸/л, ₸/шт) в тиынах. */
  unitCostMinor: bigint;
  /** Доля от цены продажи (0.02 = 2 %) для kind='percent_of_price'. */
  percent: number | null;
}

/** Стоимость одного компонента в тиынах. */
export function componentCostMinor(
  component: ComponentCalc,
  basePriceMinor: bigint
): bigint {
  if (component.kind === "percent_of_price") {
    if (component.percent === null || component.percent <= 0 || basePriceMinor <= 0n) return 0n;
    const pct = BigInt(Math.round(component.percent * 10000));
    return (basePriceMinor * pct) / 10_000n;
  }
  if (component.quantity <= 0 || component.unitCostMinor <= 0n) return 0n;
  const qtyThousandths = BigInt(Math.round(component.quantity * 1000));
  return (component.unitCostMinor * qtyThousandths) / 1_000n;
}

/** Себестоимость проданного объёма: цена единицы × количество (до 2 знаков). */
export function soldGoodsCostMinor(unitCostMinor: bigint, quantity: number): bigint {
  if (unitCostMinor <= 0n || !Number.isFinite(quantity) || quantity <= 0) return 0n;
  const qtyHundredths = BigInt(Math.round(quantity * 100));
  return (unitCostMinor * qtyHundredths) / 100n;
}

/** Средняя фактическая цена единицы: выручка / количество; при нуле — null («нет данных»). */
export function averageUnitPriceMinor(revenueMinor: bigint, quantity: number): bigint | null {
  if (!Number.isFinite(quantity) || quantity <= 0) return null;
  const qtyHundredths = BigInt(Math.round(quantity * 100));
  if (qtyHundredths <= 0n) return null;
  return (revenueMinor * 100n) / qtyHundredths;
}

/** Итоговая себестоимость единицы: сумма компонентов. */
export function unitCostFromComponents(
  components: ComponentCalc[],
  basePriceMinor: bigint
): bigint {
  let total = 0n;
  for (const c of components) total += componentCostMinor(c, basePriceMinor);
  return total;
}
