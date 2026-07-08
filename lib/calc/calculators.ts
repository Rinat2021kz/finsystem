// Калькуляторы планирования «что если» — SPEC раздел 4.12.
// Единое определение маржи во всех калькуляторах: маржа = чек − переменные − CAC.
// Все деления защищены: null → UI показывает «нет данных».

import { safeRatio } from "@/lib/money";

// ---------- Юнит-экономика ----------

export interface UnitEconomicsInput {
  /** Средний чек. */
  priceMinor: bigint;
  /** Переменные затраты на продажу. */
  variableMinor: bigint;
  /** Стоимость привлечения (на продажу или на клиента — задаёт UI). */
  cacMinor: bigint;
}

export interface UnitEconomicsResult {
  /** маржа продажи = чек − переменные − CAC. */
  marginMinor: bigint;
  /** Доля маржи в чеке; null при чеке ≤ 0. */
  marginRatio: number | null;
  /** Вердикт: true — масштабировать, false — сначала чинить экономику. */
  scale: boolean;
}

export function unitEconomics(input: UnitEconomicsInput): UnitEconomicsResult {
  const margin = input.priceMinor - input.variableMinor - input.cacMinor;
  return {
    marginMinor: margin,
    marginRatio: input.priceMinor > 0n ? safeRatio(margin, input.priceMinor) : null,
    scale: margin > 0n,
  };
}

// ---------- Точка безубыточности ----------

export interface BreakEvenResult {
  /** Продаж в месяц для нуля; null, если маржа ≤ 0 (не окупается). */
  unitsToBreakEven: number | null;
  /** Продаж для целевой прибыли; null, если маржа ≤ 0. */
  unitsForTarget: number | null;
}

export function breakEven(
  fixedMinor: bigint,
  marginPerUnitMinor: bigint,
  targetProfitMinor: bigint = 0n
): BreakEvenResult {
  if (marginPerUnitMinor <= 0n) {
    return { unitsToBreakEven: null, unitsForTarget: null };
  }
  // округление вверх: последняя неполная продажа всё равно нужна
  const ceilDiv = (a: bigint, b: bigint): number => Number((a + b - 1n) / b);
  return {
    unitsToBreakEven: fixedMinor <= 0n ? 0 : ceilDiv(fixedMinor, marginPerUnitMinor),
    unitsForTarget:
      fixedMinor + targetProfitMinor <= 0n
        ? 0
        : ceilDiv(fixedMinor + targetProfitMinor, marginPerUnitMinor),
  };
}

// ---------- CAC / LTV ----------

export interface CacLtvResult {
  /** CAC = бюджет / привлечённые; null при нуле привлечённых. */
  cacMinor: bigint | null;
  /** LTV ≈ маржа с покупки × число покупок. */
  ltvMinor: bigint;
  /** LTV / CAC; null, если CAC не посчитан или равен 0. */
  ltvToCac: number | null;
  /** Покупок до окупаемости клиента; null, если маржа ≤ 0 или CAC неизвестен. */
  paybackPurchases: number | null;
}

export function cacLtv(
  budgetMinor: bigint,
  acquiredCount: number,
  marginPerPurchaseMinor: bigint,
  purchasesPerClient: number
): CacLtvResult {
  const cac =
    acquiredCount > 0 ? budgetMinor / BigInt(Math.round(acquiredCount)) : null;
  const purchasesScaled = BigInt(Math.round(Math.max(purchasesPerClient, 0) * 100));
  const ltv = (marginPerPurchaseMinor * purchasesScaled) / 100n;
  const ltvToCac = cac !== null && cac > 0n ? safeRatio(ltv, cac) : null;
  const paybackPurchases =
    cac !== null && marginPerPurchaseMinor > 0n
      ? Number((cac + marginPerPurchaseMinor - 1n) / marginPerPurchaseMinor)
      : null;
  return { cacMinor: cac, ltvMinor: ltv, ltvToCac, paybackPurchases };
}
