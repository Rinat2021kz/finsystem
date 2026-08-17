// Единый период отчётов (правило 7: отчёты — по ВЫБРАННОМУ периоду, без TODAY() в расчётах).
// Один и тот же формат query-параметров работает во всех разделах:
//   ?preset=month&year=2026&month=7      — конкретный месяц
//   ?preset=quarter&year=2026&part=2     — квартал
//   ?preset=half&year=2026&part=1        — полугодие
//   ?preset=nine&year=2026               — 9 месяцев
//   ?preset=year&year=2026               — год
//   ?preset=custom&from=2026-03-01&to=2026-04-22 — произвольный диапазон дат
//
// ВАЖНО про ОПУ: операция относится к ОПУ через period_pnl — экономический МЕСЯЦ.
// Поэтому в ОПУ произвольные даты не имеют смысла (непонятно, включать ли зарплату
// за месяц, попавший в диапазон наполовину): там диапазон округляется до целых месяцев
// функцией snapToMonths. В ДДС и операциях диапазон дат корректен — там дата платежа.

import { MONTH_NAMES_RU, formatDateRu, monthEnd, monthStart } from "./period";

export type RangePreset = "month" | "quarter" | "half" | "nine" | "year" | "custom";

export interface PeriodRange {
  /** Первая дата периода включительно. */
  from: Date;
  /** Последняя дата периода включительно. */
  to: Date;
  preset: RangePreset;
  year: number;
  /** 1..12 — для preset=month. */
  month: number;
  /** Квартал 1..4 или полугодие 1..2 — для preset=quarter/half. */
  part: number;
  label: string;
}

export interface RangeQuery {
  preset?: string;
  year?: string;
  month?: string;
  part?: string;
  from?: string;
  to?: string;
}

const PRESETS: RangePreset[] = ["month", "quarter", "half", "nine", "year", "custom"];
const ROMAN = ["I", "II", "III", "IV"] as const;

export const PRESET_LABELS: Record<RangePreset, string> = {
  month: "Месяц",
  quarter: "Квартал",
  half: "Полугодие",
  nine: "9 месяцев",
  year: "Год",
  custom: "Произвольный период",
};

function clampInt(value: string | undefined, min: number, max: number): number | null {
  if (!value) return null;
  const n = Number.parseInt(value, 10);
  if (!Number.isInteger(n) || n < min || n > max) return null;
  return n;
}

function parseISODate(value: string | undefined): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!m) return null;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Разбор периода из query-параметров страницы.
 * Значения по умолчанию (текущий месяц) — это только выбор UI при первом заходе;
 * сами расчёты всегда получают явные границы from/to.
 */
export function rangeFromSearchParams(
  params: RangeQuery,
  defaultPreset: RangePreset = "month"
): PeriodRange {
  const now = new Date();
  const year = clampInt(params.year, 2000, 2100) ?? now.getUTCFullYear();
  const month = clampInt(params.month, 1, 12) ?? now.getUTCMonth() + 1;
  const preset = PRESETS.find((p) => p === params.preset) ?? defaultPreset;

  if (preset === "custom") {
    const from = parseISODate(params.from);
    const to = parseISODate(params.to);
    // некорректный ввод не должен ломать отчёт — молча возвращаемся к месяцу
    if (from && to && from.getTime() <= to.getTime()) {
      return {
        from,
        to,
        preset: "custom",
        year,
        month,
        part: 1,
        label: `${formatDateRu(from)} — ${formatDateRu(to)}`,
      };
    }
    return buildMonth(year, month);
  }

  if (preset === "quarter") {
    const part = clampInt(params.part, 1, 4) ?? Math.ceil(month / 3);
    const first = (part - 1) * 3 + 1;
    return {
      from: monthStart(year, first),
      to: monthEnd(year, first + 2),
      preset,
      year,
      month,
      part,
      label: `${ROMAN[part - 1]} квартал ${year}`,
    };
  }

  if (preset === "half") {
    const part = clampInt(params.part, 1, 2) ?? (month <= 6 ? 1 : 2);
    const first = part === 1 ? 1 : 7;
    return {
      from: monthStart(year, first),
      to: monthEnd(year, first + 5),
      preset,
      year,
      month,
      part,
      label: `${part}-е полугодие ${year}`,
    };
  }

  if (preset === "nine") {
    return {
      from: monthStart(year, 1),
      to: monthEnd(year, 9),
      preset,
      year,
      month,
      part: 1,
      label: `9 месяцев ${year}`,
    };
  }

  if (preset === "year") {
    return {
      from: monthStart(year, 1),
      to: monthEnd(year, 12),
      preset,
      year,
      month,
      part: 1,
      label: `${year} год`,
    };
  }

  return buildMonth(year, month);
}

function buildMonth(year: number, month: number): PeriodRange {
  return {
    from: monthStart(year, month),
    to: monthEnd(year, month),
    preset: "month",
    year,
    month,
    part: Math.ceil(month / 3),
    label: `${MONTH_NAMES_RU[month - 1]} ${year}`,
  };
}

/**
 * Задан ли период явно в адресе страницы.
 * Нужен там, где по умолчанию показываем всё (например, журнал операций),
 * а фильтр применяем только по выбору пользователя.
 */
export function hasRangeParams(params: RangeQuery): boolean {
  return Boolean(params.preset || params.from || params.to || params.month || params.part);
}

/** Список первых чисел месяцев, которых касается период (для ОПУ и помесячных таблиц). */
export function monthsInRange(from: Date, to: Date): Date[] {
  const months: Date[] = [];
  let y = from.getUTCFullYear();
  let m = from.getUTCMonth();
  const lastY = to.getUTCFullYear();
  const lastM = to.getUTCMonth();
  while (y < lastY || (y === lastY && m <= lastM)) {
    months.push(new Date(Date.UTC(y, m, 1)));
    m += 1;
    if (m > 11) {
      m = 0;
      y += 1;
    }
  }
  return months;
}

/**
 * Округление периода до целых месяцев — для ОПУ и планов, которые живут по месяцам.
 * Произвольный диапазон 17.03–22.04 превращается в «март — апрель» целиком.
 */
export function snapToMonths(range: PeriodRange): PeriodRange {
  const months = monthsInRange(range.from, range.to);
  const first = months[0];
  const last = months[months.length - 1];
  const from = monthStart(first.getUTCFullYear(), first.getUTCMonth() + 1);
  const to = monthEnd(last.getUTCFullYear(), last.getUTCMonth() + 1);
  if (range.preset !== "custom") return { ...range, from, to };

  const label =
    months.length === 1
      ? `${MONTH_NAMES_RU[first.getUTCMonth()]} ${first.getUTCFullYear()}`
      : `${MONTH_NAMES_RU[first.getUTCMonth()]} ${first.getUTCFullYear()} — ${MONTH_NAMES_RU[last.getUTCMonth()]} ${last.getUTCFullYear()}`;
  return { ...range, from, to, label };
}

/** Тот же период в виде query-строки — для ссылок экспорта и переходов между отчётами. */
export function rangeToQuery(range: PeriodRange): string {
  const p = new URLSearchParams({ preset: range.preset });
  if (range.preset === "custom") {
    p.set("from", range.from.toISOString().slice(0, 10));
    p.set("to", range.to.toISOString().slice(0, 10));
  } else {
    p.set("year", String(range.year));
    if (range.preset === "month") p.set("month", String(range.month));
    if (range.preset === "quarter" || range.preset === "half") p.set("part", String(range.part));
  }
  return p.toString();
}
