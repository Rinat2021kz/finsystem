// Инвестиционный модуль — SPEC раздел 6.7.
// Все деления защищены: доля инвестора и ROI = null при нулевом знаменателе.

import { safeRatio } from "@/lib/money";

/** total_investment = Σ статей (capex + launch + operating_buffer + reserve + other). */
export function totalInvestmentMinor(items: Array<{ totalCostMinor: bigint }>): bigint {
  let total = 0n;
  for (const i of items) total += i.totalCostMinor;
  return total;
}

/** Доля инвестора = инвестиции / оценка компании; null при оценке ≤ 0 (тест 6). */
export function investorShare(
  investmentMinor: bigint,
  companyValuationMinor: bigint
): number | null {
  if (companyValuationMinor <= 0n) return null;
  return safeRatio(investmentMinor, companyValuationMinor);
}

/** Дивиденд инвестора за месяц: net_profit × policy × share; 0 при убытке. */
export function investorDividendMinor(
  netProfitMinor: bigint,
  dividendPolicy: number,
  share: number
): bigint {
  if (netProfitMinor <= 0n || dividendPolicy <= 0 || share <= 0) return 0n;
  const policyScaled = BigInt(Math.round(dividendPolicy * 10000));
  const shareScaled = BigInt(Math.round(share * 10000));
  return (netProfitMinor * policyScaled * shareScaled) / 100_000_000n;
}

export interface InvestmentReturns {
  cumulativeMinor: bigint[];
  /** ROI = совокупный возврат / инвестиции − 1; null при инвестициях ≤ 0 (тест 7). */
  roi: number | null;
  /** Индекс месяца (0-based), в котором возврат покрыл инвестиции; null — не окупается в горизонте. */
  paybackIndex: number | null;
}

/** Совокупный возврат, ROI и срок окупаемости по ряду месячных дивидендов. */
export function investmentReturns(
  dividendsMinor: bigint[],
  investmentMinor: bigint
): InvestmentReturns {
  const cumulative: bigint[] = [];
  let sum = 0n;
  let paybackIndex: number | null = null;
  for (let i = 0; i < dividendsMinor.length; i++) {
    sum += dividendsMinor[i];
    cumulative.push(sum);
    if (paybackIndex === null && investmentMinor > 0n && sum >= investmentMinor) {
      paybackIndex = i;
    }
  }
  const roi =
    investmentMinor > 0n ? (safeRatio(sum, investmentMinor) ?? 0) - 1 : null;
  return { cumulativeMinor: cumulative, roi, paybackIndex };
}
