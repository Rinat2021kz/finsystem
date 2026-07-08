"use client";

// Калькуляторы «что если» (SPEC 4.12). Считают на лету теми же чистыми функциями,
// что и тесты; деньги — bigint (тиын), деления защищены.

import { useState } from "react";
import { breakEven, cacLtv, unitEconomics } from "@/lib/calc/calculators";
import { formatMoney, formatPercent, parseTenge } from "@/lib/money";

function useMoneyInput(initial = "") {
  const [raw, setRaw] = useState(initial);
  const minor = parseTenge(raw.trim() === "" ? "0" : raw);
  return { raw, setRaw, minor: minor !== null && minor >= 0n ? minor : null };
}

function MoneyField({
  label,
  value,
  onChange,
  invalid,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  invalid: boolean;
}) {
  return (
    <label className="field">
      {label}
      <input
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="0"
        style={invalid ? { borderColor: "var(--red)" } : undefined}
      />
    </label>
  );
}

function Verdict({ ok, yes, no }: { ok: boolean | null; yes: string; no: string }) {
  if (ok === null) return <span className="badge gray">нет данных</span>;
  return <span className={`badge ${ok ? "green" : "red"}`}>{ok ? yes : no}</span>;
}

export function UnitEconomicsCard() {
  const price = useMoneyInput("10 000");
  const variable = useMoneyInput("4 000");
  const cac = useMoneyInput("2 000");
  const [cacMode, setCacMode] = useState<"per_sale" | "per_client">("per_sale");

  const valid = price.minor !== null && variable.minor !== null && cac.minor !== null;
  const result = valid
    ? unitEconomics({ priceMinor: price.minor!, variableMinor: variable.minor!, cacMinor: cac.minor! })
    : null;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Юнит-экономика</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Маржа продажи = чек − переменные − затраты на привлечение
      </p>
      <div className="form-grid">
        <MoneyField label="Средний чек, ₸" value={price.raw} onChange={price.setRaw} invalid={price.minor === null} />
        <MoneyField
          label="Переменные затраты на продажу, ₸"
          value={variable.raw}
          onChange={variable.setRaw}
          invalid={variable.minor === null}
        />
        <MoneyField
          label={cacMode === "per_sale" ? "Привлечение (на продажу), ₸" : "Привлечение (на клиента), ₸"}
          value={cac.raw}
          onChange={cac.setRaw}
          invalid={cac.minor === null}
        />
        <label className="field">
          CAC задан
          <select value={cacMode} onChange={(e) => setCacMode(e.target.value as typeof cacMode)}>
            <option value="per_sale">на продажу</option>
            <option value="per_client">на клиента (первая покупка)</option>
          </select>
        </label>
      </div>
      <div className="cards" style={{ marginBottom: 0 }}>
        <div className="card">
          <div className="label">Маржа продажи</div>
          <div className="value">{result ? formatMoney(result.marginMinor) : "нет данных"}</div>
          <div className="hint">Доля в чеке: {result ? formatPercent(result.marginRatio) : "—"}</div>
        </div>
        <div className="card">
          <div className="label">Вердикт</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            <Verdict
              ok={result ? result.scale : null}
              yes="Можно масштабировать"
              no="Сначала чините экономику"
            />
          </div>
          <div className="hint">
            {result && !result.scale
              ? "Что делать: поднять чек, срезать переменные или удешевить привлечение"
              : "Каждая продажа приносит деньги сверх затрат"}
          </div>
        </div>
      </div>
    </div>
  );
}

export function BreakEvenCard() {
  const fixed = useMoneyInput("300 000");
  const margin = useMoneyInput("4 000");
  const target = useMoneyInput("");

  const valid = fixed.minor !== null && margin.minor !== null && target.minor !== null;
  const result = valid ? breakEven(fixed.minor!, margin.minor!, target.minor!) : null;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>Точка безубыточности</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Сколько продаж в месяц закрывает постоянные расходы. Маржа — та же, что в юнит-экономике.
      </p>
      <div className="form-grid">
        <MoneyField
          label="Постоянные расходы в месяц, ₸"
          value={fixed.raw}
          onChange={fixed.setRaw}
          invalid={fixed.minor === null}
        />
        <MoneyField
          label="Маржа с одной продажи, ₸"
          value={margin.raw}
          onChange={margin.setRaw}
          invalid={margin.minor === null}
        />
        <MoneyField
          label="Целевая прибыль, ₸ (необязательно)"
          value={target.raw}
          onChange={target.setRaw}
          invalid={target.minor === null}
        />
      </div>
      <div className="cards" style={{ marginBottom: 0 }}>
        <div className="card">
          <div className="label">Продаж до нуля</div>
          <div className="value">
            {result === null || result.unitsToBreakEven === null
              ? "нет данных"
              : result.unitsToBreakEven.toLocaleString("ru-RU")}
          </div>
          <div className="hint">
            {result !== null && result.unitsToBreakEven === null
              ? "Маржа нулевая или отрицательная — бизнес не окупается при любом объёме"
              : "Ниже этого объёма месяц убыточен"}
          </div>
        </div>
        <div className="card">
          <div className="label">Продаж для цели</div>
          <div className="value">
            {result === null || result.unitsForTarget === null
              ? "нет данных"
              : result.unitsForTarget.toLocaleString("ru-RU")}
          </div>
          <div className="hint">Постоянные + целевая прибыль, делённые на маржу</div>
        </div>
      </div>
    </div>
  );
}

export function CacLtvCard() {
  const budget = useMoneyInput("100 000");
  const [clientsRaw, setClientsRaw] = useState("20");
  const margin = useMoneyInput("4 000");
  const [purchasesRaw, setPurchasesRaw] = useState("3");

  const clients = Number.parseFloat(clientsRaw.replace(",", "."));
  const purchases = Number.parseFloat(purchasesRaw.replace(",", "."));
  const valid =
    budget.minor !== null &&
    margin.minor !== null &&
    Number.isFinite(clients) &&
    clients >= 0 &&
    Number.isFinite(purchases) &&
    purchases >= 0;
  const result = valid ? cacLtv(budget.minor!, clients, margin.minor!, purchases) : null;

  return (
    <div className="panel">
      <h2 style={{ marginTop: 0 }}>CAC / LTV</h2>
      <p className="muted" style={{ marginTop: 0, fontSize: "0.9rem" }}>
        Сколько стоит клиент и сколько он приносит за всё время
      </p>
      <div className="form-grid">
        <MoneyField
          label="Рекламный бюджет, ₸"
          value={budget.raw}
          onChange={budget.setRaw}
          invalid={budget.minor === null}
        />
        <label className="field">
          Привлечено клиентов
          <input
            inputMode="numeric"
            value={clientsRaw}
            onChange={(e) => setClientsRaw(e.target.value)}
          />
        </label>
        <MoneyField
          label="Маржа с одной покупки, ₸"
          value={margin.raw}
          onChange={margin.setRaw}
          invalid={margin.minor === null}
        />
        <label className="field">
          Покупок на клиента (в среднем)
          <input
            inputMode="decimal"
            value={purchasesRaw}
            onChange={(e) => setPurchasesRaw(e.target.value)}
          />
        </label>
      </div>
      <div className="cards" style={{ marginBottom: 0 }}>
        <div className="card">
          <div className="label">CAC — стоимость клиента</div>
          <div className="value">
            {result === null || result.cacMinor === null ? "нет данных" : formatMoney(result.cacMinor)}
          </div>
          <div className="hint">Бюджет ÷ привлечённые клиенты</div>
        </div>
        <div className="card">
          <div className="label">LTV — ценность клиента</div>
          <div className="value">{result ? formatMoney(result.ltvMinor) : "нет данных"}</div>
          <div className="hint">Маржа × среднее число покупок</div>
        </div>
        <div className="card">
          <div className="label">LTV / CAC</div>
          <div className="value" style={{ fontSize: "1.1rem" }}>
            <Verdict
              ok={result === null || result.ltvToCac === null ? null : result.ltvToCac >= 3}
              yes={`${result?.ltvToCac?.toFixed(1).replace(".", ",")} — здоровая экономика`}
              no={`${result?.ltvToCac?.toFixed(1).replace(".", ",")} — привлечение дорогое`}
            />
          </div>
          <div className="hint">Ориентир: LTV ≥ 3 × CAC</div>
        </div>
        <div className="card">
          <div className="label">Окупаемость клиента</div>
          <div className="value">
            {result === null || result.paybackPurchases === null
              ? "нет данных"
              : `${result.paybackPurchases}-я покупка`}
          </div>
          <div className="hint">Когда маржа покрывает затраты на привлечение</div>
        </div>
      </div>
    </div>
  );
}
