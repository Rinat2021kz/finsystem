// Выбор периода отчёта (правило 7: отчёты — по выбранному периоду).
// GET-форма: год и месяц попадают в query-параметры страницы.

import { MONTH_NAMES_RU } from "@/lib/period";

export function PeriodPicker({
  year,
  month,
  action,
}: {
  year: number;
  month: number;
  action: string;
}) {
  const years: number[] = [];
  for (let y = year - 3; y <= year + 1; y++) years.push(y);
  if (!years.includes(new Date().getFullYear())) years.push(new Date().getFullYear());

  return (
    <form method="get" action={action} className="toolbar no-print">
      <select name="month" defaultValue={month}>
        {MONTH_NAMES_RU.map((m, i) => (
          <option key={m} value={i + 1}>
            {m}
          </option>
        ))}
      </select>
      <select name="year" defaultValue={year}>
        {[...new Set(years)].sort().map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
      <button type="submit" className="secondary">
        Показать
      </button>
    </form>
  );
}
