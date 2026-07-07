// Общие типы расчётного модуля. Функции чистые: на вход — данные, на выход — результат.
// Деньги — bigint (тиын). Модуль не зависит от Prisma — строковые литералы совместимы
// с enum'ами сгенерированного клиента.

export type TxnKind = "income" | "expense" | "transfer";

export type PnlGroup =
  | "revenue"
  | "variable"
  | "fixed"
  | "payroll"
  | "tax"
  | "interest"
  | "depreciation"
  | "other";

/** Операция в том виде, в котором её потребляют расчёты (подмножество Transaction). */
export interface CalcTxn {
  type: TxnKind;
  amountMinor: bigint;
  /** Дата движения денег — ДДС. */
  dateCashflow: Date;
  /** Экономический месяц (1-е число) — ОПУ. null = не участвует в ОПУ. */
  periodPnl: Date | null;
  accountFromId: string | null;
  accountToId: string | null;
  includeInCashflow: boolean;
  includeInPnl: boolean;
  /** Группа категории для ОПУ; null — категория не указана. */
  pnlGroup: PnlGroup | null;
  /** Категория участвует в ОПУ. */
  affectsPnl: boolean;
  /** Категория участвует в ДДС. */
  affectsCashflow: boolean;
}

export interface CalcAccount {
  id: string;
  openingBalanceMinor: bigint;
}
