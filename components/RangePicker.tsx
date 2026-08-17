"use client";

// Единый выбор периода для всех разделов (правило 7).
// GET-форма: выбранный период уезжает в query-параметры страницы,
// поля переключаются в зависимости от типа периода.

import { useState } from "react";
import { MONTH_NAMES_RU } from "@/lib/period";
import { PRESET_LABELS, type PeriodRange, type RangePreset } from "@/lib/range";

const ROMAN = ["I", "II", "III", "IV"] as const;

export function RangePicker({
  range,
  action,
  /** Подсказка для ОПУ и планов: период считается целыми месяцами. */
  monthsOnly = false,
  /** Дополнительные фильтры раздела — попадают в ту же форму, чтобы не терялись. */
  children,
}: {
  range: PeriodRange;
  action: string;
  monthsOnly?: boolean;
  children?: React.ReactNode;
}) {
  const [preset, setPreset] = useState<RangePreset>(range.preset);

  const thisYear = new Date().getFullYear();
  const years = [...new Set([thisYear - 2, thisYear - 1, thisYear, thisYear + 1, range.year])].sort();

  const needsYear = preset !== "custom";
  const needsMonth = preset === "month";
  const needsPart = preset === "quarter" || preset === "half";

  return (
    <form method="get" action={action} className="toolbar no-print">
      <label className="field">
        Период
        <select
          name="preset"
          value={preset}
          onChange={(e) => setPreset(e.target.value as RangePreset)}
        >
          {(Object.keys(PRESET_LABELS) as RangePreset[]).map((p) => (
            <option key={p} value={p}>
              {PRESET_LABELS[p]}
            </option>
          ))}
        </select>
      </label>

      {needsMonth && (
        <label className="field">
          Месяц
          <select name="month" defaultValue={range.month}>
            {MONTH_NAMES_RU.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsPart && (
        <label className="field">
          {preset === "quarter" ? "Квартал" : "Полугодие"}
          <select name="part" defaultValue={range.part}>
            {(preset === "quarter" ? [1, 2, 3, 4] : [1, 2]).map((p) => (
              <option key={p} value={p}>
                {preset === "quarter" ? `${ROMAN[p - 1]} квартал` : `${p}-е полугодие`}
              </option>
            ))}
          </select>
        </label>
      )}

      {needsYear && (
        <label className="field">
          Год
          <select name="year" defaultValue={range.year}>
            {years.map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      )}

      {preset === "custom" && (
        <>
          <label className="field">
            С даты
            <input
              type="date"
              name="from"
              defaultValue={range.from.toISOString().slice(0, 10)}
            />
          </label>
          <label className="field">
            По дату
            <input type="date" name="to" defaultValue={range.to.toISOString().slice(0, 10)} />
          </label>
        </>
      )}

      {children}

      <button type="submit" className="secondary">
        Показать
      </button>

      {monthsOnly && preset === "custom" && (
        <span className="muted" style={{ fontSize: "0.82rem", alignSelf: "center" }}>
          Период будет округлён до целых месяцев
        </span>
      )}
    </form>
  );
}
