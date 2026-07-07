// Деньги: ТОЛЬКО целые bigint в тиынах (1 ₸ = 100 тиын). Никаких float.

export const TIYN_IN_TENGE = 100n;

/** Парсинг пользовательского ввода в тиыны. Принимает "3 750 000", "1250,50", "1250.50". */
export function parseTenge(input: string): bigint | null {
  const cleaned = input.replace(/[\s ₸]/g, "").replace(",", ".");
  if (cleaned === "" || !/^-?\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  const [whole, frac = ""] = cleaned.split(".");
  const negative = whole.startsWith("-");
  const wholeAbs = BigInt(negative ? whole.slice(1) : whole);
  const fracTiyn = BigInt((frac + "00").slice(0, 2));
  const total = wholeAbs * TIYN_IN_TENGE + fracTiyn;
  return negative ? -total : total;
}

/** Форматирование тиынов: "3 750 000 ₸" (по умолчанию — до целого тенге). */
export function formatMoney(minor: bigint, opts?: { withTiyn?: boolean }): string {
  const negative = minor < 0n;
  const abs = negative ? -minor : minor;
  // округление до тенге: банковское не требуется, обычное к ближайшему
  const tenge = opts?.withTiyn ? abs / TIYN_IN_TENGE : (abs + 50n) / TIYN_IN_TENGE;
  const tiyn = abs % TIYN_IN_TENGE;
  const grouped = tenge
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  const fraction = opts?.withTiyn ? `,${tiyn.toString().padStart(2, "0")}` : "";
  return `${negative ? "−" : ""}${grouped}${fraction} ₸`;
}

/**
 * Защищённое деление (правило: никаких Excel-ошибок).
 * Возвращает null при нулевом/отрицательном знаменателе — UI показывает «нет данных».
 */
export function safeRatio(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  // точности double достаточно для отображения процентов (1-2 знака)
  return Number(numerator) / Number(denominator);
}

/** Проценты для вывода: 0.1234 → "12,3 %"; null → "нет данных". */
export function formatPercent(ratio: number | null, digits = 1): string {
  if (ratio === null || !Number.isFinite(ratio)) return "нет данных";
  return `${(ratio * 100).toFixed(digits).replace(".", ",")} %`;
}
