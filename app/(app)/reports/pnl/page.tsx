import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { loadCalcData } from "@/lib/reports";
import { pnlForMonth, pnlForMonths, type PnlReport } from "@/lib/calc/pnl";
import { cogsInRange } from "@/lib/calc/stock";
import { formatQuantity, loadStockMoves } from "@/lib/stock";
import { formatMoney, formatPercent } from "@/lib/money";
import { MONTH_NAMES_RU } from "@/lib/period";
import { monthsInRange, rangeFromSearchParams, rangeToQuery, snapToMonths } from "@/lib/range";
import { RangePicker } from "@/components/RangePicker";
import { PrintButton } from "@/components/PrintButton";
import { HelpNote } from "@/components/HelpNote";
import { closeMonthAction, reopenMonthAction } from "../actions";

interface PnlRow {
  label: string;
  get: (p: PnlReport) => bigint;
  strong?: boolean;
  negative?: boolean;
  /** Строка показывается только при включённом складском модуле. */
  stockOnly?: boolean;
}

const ROWS: PnlRow[] = [
  { label: "Выручка", get: (p) => p.revenueMinor, strong: true },
  {
    label: "Себестоимость проданных товаров",
    get: (p) => p.goodsCostMinor,
    negative: true,
    stockOnly: true,
  },
  { label: "Переменные расходы", get: (p) => p.variableExpensesMinor, negative: true },
  { label: "Валовая прибыль", get: (p) => p.grossProfitMinor, strong: true },
  { label: "Постоянные расходы", get: (p) => p.fixedExpensesMinor, negative: true },
  { label: "Фонд оплаты труда", get: (p) => p.payrollMinor, negative: true },
  { label: "Прочие расходы", get: (p) => p.otherExpensesMinor, negative: true },
  { label: "Операционная прибыль", get: (p) => p.operatingProfitMinor, strong: true },
  { label: "Налоги", get: (p) => p.taxesMinor, negative: true },
  { label: "Проценты по займам", get: (p) => p.interestMinor, negative: true },
  { label: "Амортизация", get: (p) => p.depreciationMinor, negative: true },
  { label: "Чистая прибыль", get: (p) => p.netProfitMinor, strong: true },
];

export default async function PnlPage({
  searchParams,
}: {
  searchParams: Promise<{
    preset?: string;
    year?: string;
    month?: string;
    part?: string;
    from?: string;
    to?: string;
  }>;
}) {
  const tenant = await requireTenant();
  // ОПУ живёт по экономическим месяцам — произвольный диапазон округляем до целых
  const range = snapToMonths(rangeFromSearchParams(await searchParams));
  const months = monthsInRange(range.from, range.to);
  const single = months.length === 1;

  const [{ txns }, company] = await Promise.all([
    loadCalcData(tenant.companyId),
    prisma.company.findUnique({ where: { id: tenant.companyId } }),
  ]);

  // Себестоимость товара приходит из складских списаний и признаётся по дате продажи.
  // Без склада она равна нулю, и ОПУ считается ровно как раньше.
  const stock = company?.stockEnabled ?? false;
  const moves = stock ? await loadStockMoves(tenant.companyId) : [];
  const monthEnd = (m: Date) => new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth() + 1, 0));
  const cogsTotal = stock
    ? cogsInRange(moves, months[0], monthEnd(months[months.length - 1]))
    : null;

  const total = pnlForMonths(txns, months, { goodsCostMinor: cogsTotal?.totalMinor ?? 0n });
  const monthly = months.map((m) => ({
    month: m,
    pnl: pnlForMonth(txns, m, {
      goodsCostMinor: stock ? cogsInRange(moves, m, monthEnd(m)).totalMinor : 0n,
    }),
  }));

  const rows = ROWS.filter((r) => !r.stockOnly || stock);

  // закрытие месяца применимо только к одному месяцу
  const snapshot = single
    ? await prisma.reportSnapshot.findUnique({
        where: { companyId_period: { companyId: tenant.companyId, period: months[0] } },
      })
    : null;
  const closed = snapshot?.isClosed ?? false;
  const admin = isAdmin(tenant.role);
  const closeYear = months[0].getUTCFullYear();
  const closeMonth = months[0].getUTCMonth() + 1;

  return (
    <>
      <h1>ОПУ — прибыли и убытки</h1>
      <p className="page-sub">
        Экономический результат за {range.label} (по месяцу учёта, не по дате оплаты)
      </p>
      <RangePicker range={range} action="/reports/pnl" monthsOnly />
      <HelpNote>
        ОПУ отвечает на вопрос <strong>«заработали ли мы?»</strong>. Операции попадают сюда по
        «месяцу учёта», а не по дате оплаты: аренда за январь, оплаченная в декабре, уменьшит
        прибыль января — хотя деньги ушли в декабре (в декабрьском ДДС). Переводы между счетами
        сюда не попадают вовсе. За период больше месяца показатели складываются: колонка «Итого»
        — это накопительный результат, а рентабельность в ней считается от суммарной выручки.
        «Закрыть месяц» фиксирует цифры: после закрытия операции месяца нельзя менять.
        {stock && (
          <>
            {" "}
            <strong>Себестоимость проданных товаров</strong> берётся со склада и признаётся в месяц
            продажи, а не в месяц закупки: товар, купленный впрок в марте и проданный в мае,
            уменьшит прибыль мая. Поэтому закупка товара сама по себе в расходы ОПУ не попадает —
            иначе расход посчитался бы дважды.
          </>
        )}
      </HelpNote>
      <div className="toolbar no-print">
        <a className="btn secondary" href={`/api/export/pnl?${rangeToQuery(range)}`}>
          Скачать Excel
        </a>
        <PrintButton />
        {single && admin && !closed && (
          <form action={closeMonthAction}>
            <input type="hidden" name="year" value={closeYear} />
            <input type="hidden" name="month" value={closeMonth} />
            <button type="submit" className="secondary">
              Закрыть месяц
            </button>
          </form>
        )}
        {single && admin && closed && (
          <form action={reopenMonthAction}>
            <input type="hidden" name="year" value={closeYear} />
            <input type="hidden" name="month" value={closeMonth} />
            <button type="submit" className="danger">
              Открыть месяц
            </button>
          </form>
        )}
      </div>

      {closed && (
        <div className="alert info">
          Месяц закрыт: операции этого периода защищены от изменений, отчёт зафиксирован снимком.
        </div>
      )}
      {!single && (
        <div className="alert info no-print">
          Показан период из {months.length} мес. Закрыть или открыть месяц можно, выбрав его
          отдельно (период «Месяц»).
        </div>
      )}
      {cogsTotal !== null && cogsTotal.uncoveredQuantity > 0 && (
        <div className="alert error">
          {formatQuantity(cogsTotal.uncoveredQuantity)} ед. товара продано или списано без
          оформленного прихода — себестоимость по ним не посчитана, и прибыль в этом отчёте
          завышена. Проверьте <a href="/stock">остатки на складах</a>.
        </div>
      )}

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Статья</th>
              {!single &&
                monthly.map((m) => (
                  <th key={m.month.toISOString()} className="num">
                    {MONTH_NAMES_RU[m.month.getUTCMonth()].slice(0, 3)}{" "}
                    {String(m.month.getUTCFullYear()).slice(2)}
                  </th>
                ))}
              <th className="num">{single ? "Сумма" : "Итого"}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label} className={r.strong ? "total" : ""}>
                <td>{r.label}</td>
                {!single &&
                  monthly.map((m) => {
                    const v = r.get(m.pnl);
                    return (
                      <td
                        key={m.month.toISOString()}
                        className={`num muted ${r.negative && v > 0n ? "expense" : ""}`}
                      >
                        {r.negative && v > 0n ? "−" : ""}
                        {formatMoney(v)}
                      </td>
                    );
                  })}
                <td className={`num ${r.negative && r.get(total) > 0n ? "expense" : ""}`}>
                  {r.negative && r.get(total) > 0n ? "−" : ""}
                  {formatMoney(r.get(total))}
                </td>
              </tr>
            ))}
            <tr>
              <td>Рентабельность по чистой прибыли</td>
              {!single &&
                monthly.map((m) => (
                  <td key={m.month.toISOString()} className="num muted">
                    {m.pnl.profitability === null ? "—" : formatPercent(m.pnl.profitability)}
                  </td>
                ))}
              <td className="num">
                {total.profitability === null ? (
                  <span className="badge gray">нет выручки для расчёта</span>
                ) : (
                  formatPercent(total.profitability)
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </>
  );
}
