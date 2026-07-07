"use client";

import { useActionState } from "react";
import { createProjectAction, type ProjectFormState } from "./actions";

export function ProjectForm() {
  const [state, action, pending] = useActionState<ProjectFormState, FormData>(
    createProjectAction,
    {}
  );
  return (
    <form action={action} className="panel">
      {state.error && <div className="alert error">{state.error}</div>}
      <div className="form-grid">
        <label className="field">
          Номер проекта
          <input name="projectNumber" placeholder="Например: 2026-07" />
        </label>
        <label className="field">
          Заказчик
          <input name="customerName" required placeholder="Название клиента" />
        </label>
        <label className="field">
          Описание
          <input name="description" placeholder="Что делаем" />
        </label>
        <label className="field">
          Стоимость договора, ₸
          <input name="contractValue" required inputMode="numeric" placeholder="500 000" />
        </label>
        <label className="field">
          Плановая себестоимость, ₸
          <input name="plannedCost" inputMode="numeric" placeholder="0" />
        </label>
        <label className="field">
          Дата заказа
          <input name="orderDate" type="date" />
        </label>
        <button type="submit" disabled={pending}>
          {pending ? "Создаём…" : "Добавить проект"}
        </button>
      </div>
    </form>
  );
}
