"use client";

import { useActionState, useState } from "react";
import { createStockMoveAction, type StockFormState } from "./actions";

export interface Option {
  id: string;
  name: string;
}

const TYPES = [
  { value: "receipt", label: "Приход", button: "Оприходовать" },
  { value: "transfer", label: "Перемещение", button: "Переместить" },
  { value: "writeoff", label: "Списание", button: "Списать" },
  { value: "issue", label: "Продажа / отгрузка", button: "Отгрузить" },
] as const;

type MoveType = (typeof TYPES)[number]["value"];

const HINTS: Record<MoveType, string> = {
  receipt:
    "Товар приехал от поставщика. Цена закупки формирует партию: именно по ней посчитается " +
    "себестоимость, когда этот товар будет продан. Деньги за закупку проводите отдельной " +
    "операцией расхода — здесь только товар.",
  transfer:
    "Товар переехал с одного склада на другой. Это не приход и не расход: общий остаток " +
    "компании не меняется, себестоимость тоже. Меняется только то, где товар лежит.",
  writeoff:
    "Товар израсходован не через продажу: брак, порча, ушёл в производство или на заказ. " +
    "Себестоимость списания попадёт в расходы ОПУ, а если указан проект — в себестоимость " +
    "этого проекта.",
  issue:
    "Товар ушёл покупателю. Себестоимость проданного попадёт в ОПУ за месяц отгрузки. " +
    "Выручку по этой продаже проводите операцией дохода.",
};

export function StockMoveForm({
  products,
  warehouses,
  projects = [],
}: {
  products: Option[];
  warehouses: Option[];
  projects?: Option[];
}) {
  const [state, action, pending] = useActionState<StockFormState, FormData>(
    createStockMoveAction,
    {}
  );
  const [type, setType] = useState<MoveType>("receipt");
  const today = new Date().toISOString().slice(0, 10);

  const needsFrom = type !== "receipt";
  const needsTo = type === "receipt" || type === "transfer";
  const current = TYPES.find((t) => t.value === type)!;

  return (
    <form action={action} className="panel">
      {state.error && <div className="alert error">{state.error}</div>}
      <input type="hidden" name="type" value={type} />

      <div className="tabs">
        {TYPES.map((t) => (
          <a
            key={t.value}
            href="#"
            className={t.value === type ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              setType(t.value);
            }}
          >
            {t.label}
          </a>
        ))}
      </div>

      <div className="form-grid">
        <label className="field">
          Дата
          <input type="date" name="date" required defaultValue={today} />
        </label>
        <label className="field">
          Товар или материал
          <select name="productId" required>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          Количество
          <input name="quantity" required inputMode="decimal" placeholder="Например: 100" />
        </label>

        {needsFrom && (
          <label className="field">
            {type === "transfer" ? "Со склада" : "Списать со склада"}
            <select name="warehouseFromId" required>
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {needsTo && (
          <label className="field">
            {type === "transfer" ? "На склад" : "Оприходовать на склад"}
            <select
              name="warehouseToId"
              required
              defaultValue={warehouses[type === "transfer" ? 1 : 0]?.id}
            >
              {warehouses.map((w) => (
                <option key={w.id} value={w.id}>
                  {w.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {type === "receipt" && (
          <label className="field">
            Цена закупки за единицу, ₸
            <input name="unitCost" required inputMode="decimal" placeholder="300" />
          </label>
        )}

        {type === "writeoff" && projects.length > 0 && (
          <label className="field">
            Списать на проект
            <select name="projectId" defaultValue="">
              <option value="">— (общий расход)</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          Комментарий
          <input name="comment" placeholder="Необязательно" />
        </label>

        <button type="submit" disabled={pending || products.length === 0 || warehouses.length === 0}>
          {pending ? "Сохраняем…" : current.button}
        </button>
      </div>

      <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
        {HINTS[type]}
      </p>
    </form>
  );
}
