"use client";

import { useActionState } from "react";
import { createTransactionAction, type TxnFormState } from "./actions";

export interface Option {
  id: string;
  name: string;
}

const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export function TransactionForm({
  type,
  accounts,
  categories,
  counterparties,
  projects = [],
}: {
  type: "income" | "expense" | "transfer";
  accounts: Option[];
  categories: Option[];
  counterparties: Option[];
  projects?: Option[];
}) {
  const [state, action, pending] = useActionState<TxnFormState, FormData>(
    createTransactionAction,
    {}
  );
  const today = new Date().toISOString().slice(0, 10);
  const currentYear = new Date().getFullYear();

  return (
    <form action={action} className="panel">
      {state.error && <div className="alert error">{state.error}</div>}
      <input type="hidden" name="type" value={type} />
      <div className="form-grid">
        <label className="field">
          Сумма, ₸
          <input name="amount" required inputMode="decimal" placeholder="100 000" />
        </label>
        <label className="field">
          Дата оплаты (ДДС)
          <input name="dateCashflow" type="date" required defaultValue={today} />
        </label>

        {type !== "income" && (
          <label className="field">
            {type === "transfer" ? "Со счёта" : "Счёт списания"}
            <select name="accountFromId" required>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {type !== "expense" && (
          <label className="field">
            {type === "transfer" ? "На счёт" : "Счёт зачисления"}
            <select name="accountToId" required defaultValue={accounts[type === "transfer" ? 1 : 0]?.id}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </label>
        )}

        {type !== "transfer" && (
          <>
            <label className="field">
              Категория
              <select name="categoryId" required>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Месяц учёта в ОПУ
              <select name="pnlMonth" defaultValue={new Date().getMonth() + 1}>
                {MONTHS.map((m, i) => (
                  <option key={m} value={i + 1}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              Год ОПУ
              <select name="pnlYear" defaultValue={currentYear}>
                {[currentYear - 1, currentYear, currentYear + 1].map((y) => (
                  <option key={y} value={y}>
                    {y}
                  </option>
                ))}
              </select>
            </label>
            {projects.length > 0 && (
              <label className="field">
                Проект
                <select name="projectId" defaultValue="">
                  <option value="">—</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {counterparties.length > 0 && (
              <label className="field">
                Контрагент
                <select name="counterpartyId" defaultValue="">
                  <option value="">—</option>
                  {counterparties.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </>
        )}

        <label className="field">
          Комментарий
          <input name="comment" placeholder="Необязательно" />
        </label>

        <button type="submit" disabled={pending}>
          {pending
            ? "Сохраняем…"
            : type === "income"
              ? "Добавить доход"
              : type === "expense"
                ? "Добавить расход"
                : "Перевести"}
        </button>
      </div>
      {type === "transfer" && (
        <p className="muted" style={{ margin: "10px 0 0", fontSize: "0.85rem" }}>
          Перевод меняет только остатки счетов — он не попадает в доходы, расходы и ОПУ.
        </p>
      )}
    </form>
  );
}
