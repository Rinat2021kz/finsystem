"use client";

import { useActionState, useState } from "react";
import { createCompanyAction, type OnboardingState } from "./actions";

interface TemplateOption {
  id: string;
  label: string;
  accounts: string[];
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function OnboardingForm({ templates }: { templates: TemplateOption[] }) {
  const [state, action, pending] = useActionState<OnboardingState, FormData>(
    createCompanyAction,
    {}
  );
  const [templateId, setTemplateId] = useState(templates[0]?.id ?? "universal");
  const template = templates.find((t) => t.id === templateId) ?? templates[0];
  const currentYear = new Date().getFullYear();

  return (
    <form action={action}>
      {state.error && <div className="alert error">{state.error}</div>}

      <label className="field">
        Название бизнеса
        <input name="companyName" required placeholder="Например: Кофейня «Тандем»" />
      </label>

      <label className="field">
        Отрасль (шаблон справочников)
        <select name="industry" value={templateId} onChange={(e) => setTemplateId(e.target.value)}>
          {templates.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
      </label>

      <div className="form-grid">
        <label className="field">
          Месяц начала учёта
          <select name="startMonth" defaultValue={new Date().getMonth() + 1}>
            {MONTHS.map((m, i) => (
              <option key={m} value={i + 1}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Год
          <select name="startYear" defaultValue={currentYear}>
            {[currentYear - 2, currentYear - 1, currentYear, currentYear + 1].map((y) => (
              <option key={y} value={y}>
                {y}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="steps" style={{ margin: "8px 0 0" }}>
        Валюта — тенге (₸). Стартовые счета и остатки на дату начала учёта:
      </p>
      {template.accounts.map((name, i) => (
        <label className="field" key={name}>
          {name} — остаток, ₸
          <input name={`opening_${i}`} inputMode="numeric" placeholder="0" />
        </label>
      ))}

      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
        <input type="checkbox" name="projectsEnabled" /> Вести учёт по проектам/заказам
      </label>
      <label style={{ display: "flex", gap: 8, alignItems: "center", fontSize: "0.9rem" }}>
        <input type="checkbox" name="investmentsEnabled" /> Нужен инвестиционный модуль
      </label>

      <button type="submit" disabled={pending}>
        {pending ? "Создаём компанию…" : "Создать компанию"}
      </button>
    </form>
  );
}
