// Работа с периодами. Месяц храним как 1-е число месяца (UTC-полночь, DATE в БД).
// Отчёты строятся ТОЛЬКО по выбранному периоду — никаких зависимостей от текущей даты в расчётах.

/** 1-е число месяца в UTC. */
export function monthStart(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12 - 1, 1));
}

/** Последний день месяца в UTC. */
export function monthEnd(year: number, month1to12: number): Date {
  return new Date(Date.UTC(year, month1to12, 0));
}

/** Нормализация произвольной даты к 1-му числу её месяца (UTC). */
export function toMonthStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

export function sameMonth(a: Date, b: Date): boolean {
  return a.getUTCFullYear() === b.getUTCFullYear() && a.getUTCMonth() === b.getUTCMonth();
}

export const MONTH_NAMES_RU = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
] as const;

export function formatMonthRu(d: Date): string {
  return `${MONTH_NAMES_RU[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateRu(d: Date): string {
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  return `${dd}.${mm}.${d.getUTCFullYear()}`;
}

/** ISO-строка YYYY-MM-DD для value у <input type="date">. */
export function toISODate(d: Date): string {
  return d.toISOString().slice(0, 10);
}
