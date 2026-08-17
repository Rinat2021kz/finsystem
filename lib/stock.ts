// Серверные помощники складского модуля: загрузка движений и форматирование.
// Чистые расчёты — в lib/calc/stock.ts.

import { prisma } from "@/lib/db";
import type { StockMoveCalc } from "@/lib/calc/stock";

/**
 * Движения компании в форме, понятной расчётному модулю.
 * Всегда грузится ВСЯ история товара: FIFO без начала истории посчитает
 * себестоимость неверно (первая продажа периода не найдёт своей партии).
 */
export async function loadStockMoves(
  companyId: string,
  productId?: string
): Promise<StockMoveCalc[]> {
  const rows = await prisma.stockMove.findMany({
    where: { companyId, ...(productId ? { productId } : {}) },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map((r) => ({
    id: r.id,
    date: r.date,
    createdAt: r.createdAt,
    type: r.type,
    productId: r.productId,
    warehouseFromId: r.warehouseFromId,
    warehouseToId: r.warehouseToId,
    quantity: Number(r.quantity),
    unitCostMinor: r.unitCostMinor,
    projectId: r.projectId,
  }));
}

/** Количество в человеческом виде: 12 или 10,5 — без хвостовых нулей. */
export function formatQuantity(value: number): string {
  const fixed = value.toFixed(3);
  const trimmed = fixed.includes(".") ? fixed.replace(/0+$/, "").replace(/\.$/, "") : fixed;
  return trimmed.replace(".", ",");
}

export const MOVE_LABEL = {
  receipt: "Приход",
  issue: "Продажа",
  transfer: "Перемещение",
  writeoff: "Списание",
} as const;

export const WAREHOUSE_KIND_LABEL = {
  point: "Торговая точка",
  warehouse: "Склад",
  office: "Офис / производство",
} as const;
