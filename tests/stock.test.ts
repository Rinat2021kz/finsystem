// Тесты складского учёта: остатки по складам, FIFO-себестоимость, перемещения.
import { describe, expect, it } from "vitest";
import {
  availableQuantity,
  averageLotCostMinor,
  cogsInRange,
  fifo,
  negativeBalances,
  productLedger,
  stockByProduct,
  stockByWarehouse,
  stockValueMinor,
  type StockMoveCalc,
} from "@/lib/calc/stock";
import { pnlForMonth } from "@/lib/calc/pnl";
import type { CalcTxn } from "@/lib/calc/types";

const OFFICE = "wh-office";
const POINT = "wh-point";
const ROSE = "prod-rose";
const GLASS = "prod-glass";

let seq = 0;
function move(partial: Partial<StockMoveCalc> & Pick<StockMoveCalc, "type" | "quantity">): StockMoveCalc {
  seq += 1;
  return {
    id: `m${seq.toString().padStart(3, "0")}`,
    date: new Date(Date.UTC(2025, 0, 1)),
    createdAt: new Date(Date.UTC(2025, 0, 1, 0, 0, seq)),
    productId: ROSE,
    warehouseFromId: null,
    warehouseToId: null,
    unitCostMinor: null,
    projectId: null,
    ...partial,
  };
}

const d = (year: number, month: number, day: number) => new Date(Date.UTC(year, month - 1, day));

describe("Остатки по складам", () => {
  it("приход увеличивает остаток склада получения", () => {
    const moves = [
      move({ type: "receipt", quantity: 1000, warehouseToId: OFFICE, unitCostMinor: 30_000n }),
    ];
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: OFFICE })).toBe(1000);
  });

  it("перемещение не меняет общий остаток компании, но меняет остатки складов", () => {
    const moves = [
      move({ type: "receipt", quantity: 1000, warehouseToId: OFFICE, unitCostMinor: 30_000n }),
      move({ type: "transfer", quantity: 300, warehouseFromId: OFFICE, warehouseToId: POINT }),
    ];
    expect(stockByProduct(moves)).toEqual([{ productId: ROSE, quantity: 1000 }]);
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: OFFICE })).toBe(700);
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: POINT })).toBe(300);
  });

  it("продажа и списание уменьшают остаток склада отгрузки", () => {
    const moves = [
      move({ type: "receipt", quantity: 100, warehouseToId: POINT, unitCostMinor: 30_000n }),
      move({ type: "issue", quantity: 30, warehouseFromId: POINT }),
      move({ type: "writeoff", quantity: 10, warehouseFromId: POINT }),
    ];
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: POINT })).toBe(60);
  });

  it("остаток считается на выбранную дату, а не на сегодня", () => {
    const moves = [
      move({ type: "receipt", quantity: 100, warehouseToId: OFFICE, date: d(2025, 3, 10), unitCostMinor: 30_000n }),
      move({ type: "issue", quantity: 40, warehouseFromId: OFFICE, date: d(2025, 5, 20) }),
    ];
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: OFFICE, onDate: d(2025, 4, 30) })).toBe(100);
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: OFFICE, onDate: d(2025, 6, 30) })).toBe(60);
  });

  it("дробные количества (м², кг) не теряют точность", () => {
    const moves = [
      move({ type: "receipt", quantity: 10.5, warehouseToId: OFFICE, unitCostMinor: 250_000n }),
      move({ type: "issue", quantity: 0.125, warehouseFromId: OFFICE }),
      move({ type: "issue", quantity: 0.375, warehouseFromId: OFFICE }),
    ];
    expect(availableQuantity(moves, { productId: ROSE, warehouseId: OFFICE })).toBe(10);
  });

  it("продажа сверх остатка даёт отрицательный остаток — это предупреждение, а не ошибка", () => {
    const moves = [
      move({ type: "receipt", quantity: 10, warehouseToId: POINT, unitCostMinor: 30_000n }),
      move({ type: "issue", quantity: 25, warehouseFromId: POINT }),
    ];
    const negative = negativeBalances(moves);
    expect(negative).toHaveLength(1);
    expect(negative[0].quantity).toBe(-15);
  });

  it("нулевые остатки не попадают в отчёт", () => {
    const moves = [
      move({ type: "receipt", quantity: 10, warehouseToId: POINT, unitCostMinor: 30_000n }),
      move({ type: "issue", quantity: 10, warehouseFromId: POINT }),
    ];
    expect(stockByWarehouse(moves)).toEqual([]);
  });
});

describe("FIFO-себестоимость", () => {
  // розы дорожали: сначала 1000 шт по 300 ₸, потом 500 шт по 500 ₸
  const purchases = [
    move({
      type: "receipt",
      quantity: 1000,
      warehouseToId: OFFICE,
      date: d(2025, 1, 10),
      unitCostMinor: 30_000n,
    }),
    move({
      type: "receipt",
      quantity: 500,
      warehouseToId: OFFICE,
      date: d(2025, 3, 15),
      unitCostMinor: 50_000n,
    }),
  ];

  it("первой списывается старая партия", () => {
    const moves = [
      ...purchases,
      move({ type: "issue", quantity: 400, warehouseFromId: OFFICE, date: d(2025, 4, 1) }),
    ];
    // 400 × 300 ₸ = 120 000 ₸
    expect(fifo(moves).totalCostMinor).toBe(12_000_000n);
  });

  it("расход на границе партий берёт цену из обеих", () => {
    const moves = [
      ...purchases,
      move({ type: "issue", quantity: 1200, warehouseFromId: OFFICE, date: d(2025, 4, 1) }),
    ];
    // 1000 × 300 + 200 × 500 = 300 000 + 100 000 = 400 000 ₸
    expect(fifo(moves).totalCostMinor).toBe(40_000_000n);
  });

  it("расход без партии не выдумывает себестоимость, а помечает непокрытое количество", () => {
    const moves = [
      move({ type: "issue", quantity: 50, warehouseFromId: OFFICE, date: d(2025, 1, 5) }),
    ];
    const result = fifo(moves);
    expect(result.totalCostMinor).toBe(0n);
    expect(result.uncoveredQuantity).toBe(50);
  });

  it("частично покрытый расход считает только покрытую часть", () => {
    const moves = [
      move({ type: "receipt", quantity: 10, warehouseToId: OFFICE, date: d(2025, 1, 1), unitCostMinor: 30_000n }),
      move({ type: "issue", quantity: 25, warehouseFromId: OFFICE, date: d(2025, 2, 1) }),
    ];
    const result = fifo(moves);
    expect(result.totalCostMinor).toBe(300_000n); // 10 × 300 ₸
    expect(result.issues[0].uncoveredQuantity).toBe(15);
  });

  it("перемещение между складами не создаёт себестоимости", () => {
    const moves = [
      ...purchases,
      move({ type: "transfer", quantity: 800, warehouseFromId: OFFICE, warehouseToId: POINT, date: d(2025, 4, 1) }),
    ];
    expect(fifo(moves).totalCostMinor).toBe(0n);
  });

  it("товар, купленный на одном складе, продаётся с другого по своей закупочной цене", () => {
    const moves = [
      ...purchases,
      move({ type: "transfer", quantity: 800, warehouseFromId: OFFICE, warehouseToId: POINT, date: d(2025, 4, 1) }),
      move({ type: "issue", quantity: 800, warehouseFromId: POINT, date: d(2025, 5, 1) }),
    ];
    expect(fifo(moves).totalCostMinor).toBe(24_000_000n); // 800 × 300 ₸
  });

  it("остаток партий после расходов — основа стоимости склада", () => {
    const moves = [
      ...purchases,
      move({ type: "issue", quantity: 1100, warehouseFromId: OFFICE, date: d(2025, 4, 1) }),
    ];
    // осталось 400 шт по 500 ₸ = 200 000 ₸
    expect(stockValueMinor(moves)).toBe(20_000_000n);
    expect(averageLotCostMinor(moves, ROSE)).toBe(50_000n);
  });

  it("стоимость склада на дату не учитывает более поздние закупки", () => {
    const moves = purchases;
    // на 1 февраля куплена только первая партия: 1000 × 300 ₸
    expect(stockValueMinor(moves, d(2025, 2, 1))).toBe(30_000_000n);
  });

  it("средняя себестоимость без остатка — null, а не деление на ноль", () => {
    expect(averageLotCostMinor([], ROSE)).toBeNull();
  });

  it("порядок движений в один день определяется порядком ввода", () => {
    const early = move({
      type: "receipt", quantity: 10, warehouseToId: OFFICE,
      date: d(2025, 1, 1), createdAt: new Date(Date.UTC(2025, 0, 1, 9)), unitCostMinor: 10_000n,
    });
    const late = move({
      type: "receipt", quantity: 10, warehouseToId: OFFICE,
      date: d(2025, 1, 1), createdAt: new Date(Date.UTC(2025, 0, 1, 18)), unitCostMinor: 20_000n,
    });
    const sale = move({
      type: "issue", quantity: 10, warehouseFromId: OFFICE,
      date: d(2025, 1, 2), createdAt: new Date(Date.UTC(2025, 0, 2, 9)),
    });
    // сначала гасится партия, введённая раньше, независимо от порядка в массиве
    expect(fifo([late, sale, early]).totalCostMinor).toBe(100_000n);
  });
});

describe("Себестоимость проданных товаров за период", () => {
  const moves = [
    move({ type: "receipt", quantity: 100, warehouseToId: OFFICE, date: d(2025, 1, 10), unitCostMinor: 30_000n }),
    move({ type: "receipt", quantity: 100, warehouseToId: OFFICE, date: d(2025, 3, 10), unitCostMinor: 50_000n }),
    move({ type: "issue", quantity: 60, warehouseFromId: OFFICE, date: d(2025, 2, 5) }),
    move({ type: "issue", quantity: 60, warehouseFromId: OFFICE, date: d(2025, 4, 5) }),
  ];

  it("в период попадает только себестоимость расходов этого периода", () => {
    // февраль: 60 × 300 ₸
    const february = cogsInRange(moves, d(2025, 2, 1), d(2025, 2, 28));
    expect(february.totalMinor).toBe(1_800_000n);
  });

  it("расход в апреле знает про остаток январской партии — FIFO идёт с начала истории", () => {
    // апрель: 40 шт остатка по 300 + 20 шт по 500 = 12 000 + 10 000 = 22 000 ₸
    const april = cogsInRange(moves, d(2025, 4, 1), d(2025, 4, 30));
    expect(april.totalMinor).toBe(2_200_000n);
  });

  it("себестоимость раскладывается по товарам", () => {
    const withGlass = [
      ...moves,
      move({ type: "receipt", quantity: 10, productId: GLASS, warehouseToId: OFFICE, date: d(2025, 4, 1), unitCostMinor: 800_000n }),
      move({ type: "writeoff", quantity: 2, productId: GLASS, warehouseFromId: OFFICE, date: d(2025, 4, 20) }),
    ];
    const april = cogsInRange(withGlass, d(2025, 4, 1), d(2025, 4, 30));
    expect(april.byProduct.get(GLASS)).toBe(1_600_000n); // 2 × 8 000 ₸
    expect(april.byProduct.get(ROSE)).toBe(2_200_000n);
  });

  it("списание материалов на проект попадает в себестоимость проекта", () => {
    const withProject = [
      move({ type: "receipt", quantity: 10, productId: GLASS, warehouseToId: OFFICE, date: d(2025, 4, 1), unitCostMinor: 800_000n }),
      move({ type: "writeoff", quantity: 4, productId: GLASS, warehouseFromId: OFFICE, date: d(2025, 4, 20), projectId: "prj-53" }),
    ];
    const april = cogsInRange(withProject, d(2025, 4, 1), d(2025, 4, 30));
    expect(april.byProject.get("prj-53")).toBe(3_200_000n); // 4 × 8 000 ₸
  });

  it("непокрытые расходы попадают в предупреждение периода", () => {
    const orphan = [move({ type: "issue", quantity: 7, warehouseFromId: OFFICE, date: d(2025, 4, 5) })];
    expect(cogsInRange(orphan, d(2025, 4, 1), d(2025, 4, 30)).uncoveredQuantity).toBe(7);
  });
});

describe("Себестоимость товара в ОПУ", () => {
  const march = new Date(Date.UTC(2025, 2, 1));
  const may = new Date(Date.UTC(2025, 4, 1));

  // выручка мая 500 000 ₸, аренда мая 100 000 ₸
  const txns: CalcTxn[] = [
    {
      type: "income", amountMinor: 50_000_000n, periodPnl: may,
      dateCashflow: may, includeInPnl: true, includeInCashflow: true,
      affectsPnl: true, affectsCashflow: true, pnlGroup: "revenue",
      accountFromId: null, accountToId: "acc",
    },
    {
      type: "expense", amountMinor: 10_000_000n, periodPnl: may,
      dateCashflow: may, includeInPnl: true, includeInCashflow: true,
      affectsPnl: true, affectsCashflow: true, pnlGroup: "fixed",
      accountFromId: "acc", accountToId: null,
    },
  ];

  it("товар, купленный в марте и проданный в мае, уменьшает прибыль мая", () => {
    // закупка 100 шт по 2 000 ₸ в марте, продажа 50 шт в мае → себестоимость 100 000 ₸
    const moves = [
      move({ type: "receipt", quantity: 100, warehouseToId: OFFICE, date: march, unitCostMinor: 200_000n }),
      move({ type: "issue", quantity: 50, warehouseFromId: OFFICE, date: d(2025, 5, 12) }),
    ];
    const marchCogs = cogsInRange(moves, march, d(2025, 3, 31)).totalMinor;
    const mayCogs = cogsInRange(moves, may, d(2025, 5, 31)).totalMinor;

    expect(marchCogs).toBe(0n); // в марте только заплатили, ничего не продали
    expect(mayCogs).toBe(10_000_000n);

    const mayPnl = pnlForMonth(txns, may, { goodsCostMinor: mayCogs });
    // 500 000 − 100 000 себестоимости = 400 000 валовой
    expect(mayPnl.goodsCostMinor).toBe(10_000_000n);
    expect(mayPnl.grossProfitMinor).toBe(40_000_000n);
    // минус аренда 100 000 → чистая 300 000
    expect(mayPnl.netProfitMinor).toBe(30_000_000n);
  });

  it("без складского модуля ОПУ считается ровно как раньше", () => {
    const without = pnlForMonth(txns, may);
    expect(without.goodsCostMinor).toBe(0n);
    expect(without.grossProfitMinor).toBe(50_000_000n);
    expect(without.netProfitMinor).toBe(40_000_000n);
  });
});

describe("Карточка товара", () => {
  const moves = [
    move({ type: "receipt", quantity: 100, warehouseToId: OFFICE, date: d(2025, 1, 10), unitCostMinor: 30_000n }),
    move({ type: "transfer", quantity: 40, warehouseFromId: OFFICE, warehouseToId: POINT, date: d(2025, 1, 20) }),
    move({ type: "issue", quantity: 15, warehouseFromId: POINT, date: d(2025, 2, 3) }),
  ];

  it("по компании перемещение видно в истории, но не меняет остаток", () => {
    const rows = productLedger(moves, ROSE);
    expect(rows.map((r) => r.balance)).toEqual([100, 100, 85]);
    expect(rows[1].delta).toBe(0);
  });

  it("по складу видно и приход, и расход перемещения", () => {
    expect(productLedger(moves, ROSE, OFFICE).map((r) => r.balance)).toEqual([100, 60]);
    expect(productLedger(moves, ROSE, POINT).map((r) => r.balance)).toEqual([40, 25]);
  });

  it("движения чужого товара не попадают в карточку", () => {
    expect(productLedger(moves, GLASS)).toEqual([]);
  });
});
