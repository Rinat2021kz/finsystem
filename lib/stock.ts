// Серверные помощники складского модуля: загрузка движений и форматирование.
// Чистые расчёты — в lib/calc/stock.ts.

import { prisma } from "@/lib/db";
import { fifo, type StockMoveCalc } from "@/lib/calc/stock";

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

export interface ProjectMaterialRow {
  date: Date;
  productName: string;
  unit: string;
  quantity: number;
  /** Себестоимость списания по цене той партии, из которой материал ушёл. */
  costMinor: bigint;
  /** Количество без партии прихода — себестоимость по нему неизвестна. */
  uncoveredQuantity: number;
  comment: string | null;
}

/**
 * Материалы, списанные со склада на проект, с себестоимостью по FIFO.
 * FIFO считается по всей истории компании, потом отбираются списания этого проекта.
 */
export async function loadProjectMaterials(
  companyId: string,
  projectId: string
): Promise<{ costMinor: bigint; uncoveredQuantity: number; rows: ProjectMaterialRow[] }> {
  const moves = await loadStockMoves(companyId);
  const projectIssues = fifo(moves).issues.filter((i) => i.projectId === projectId);
  if (projectIssues.length === 0) {
    return { costMinor: 0n, uncoveredQuantity: 0, rows: [] };
  }

  const details = await prisma.stockMove.findMany({
    where: { id: { in: projectIssues.map((i) => i.moveId) } },
    include: { product: { select: { name: true, unit: true } } },
  });
  const byId = new Map(details.map((d) => [d.id, d]));

  let costMinor = 0n;
  let uncoveredQuantity = 0;
  const rows: ProjectMaterialRow[] = [];
  for (const issue of projectIssues) {
    const detail = byId.get(issue.moveId);
    if (!detail) continue;
    costMinor += issue.costMinor;
    uncoveredQuantity += issue.uncoveredQuantity;
    rows.push({
      date: issue.date,
      productName: detail.product.name,
      unit: detail.product.unit ?? "ед.",
      quantity: issue.quantity,
      costMinor: issue.costMinor,
      uncoveredQuantity: issue.uncoveredQuantity,
      comment: detail.comment,
    });
  }
  rows.sort((a, b) => b.date.getTime() - a.date.getTime());
  return { costMinor, uncoveredQuantity, rows };
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
