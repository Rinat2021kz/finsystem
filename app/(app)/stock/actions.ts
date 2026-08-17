"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { assertMonthsOpen } from "@/lib/months";
import { logAudit } from "@/lib/audit";
import { availableQuantity } from "@/lib/calc/stock";
import { formatQuantity, loadStockMoves } from "@/lib/stock";

const moveSchema = z.object({
  type: z.enum(["receipt", "issue", "transfer", "writeoff"]),
  date: z.coerce.date(),
  productId: z.string().uuid(),
  warehouseFromId: z.string().uuid().optional(),
  warehouseToId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive().max(99_999_999),
  projectId: z.string().uuid().optional(),
  comment: z.string().trim().max(500).optional(),
});

export interface StockFormState {
  error?: string;
}

const TYPE_LABEL: Record<string, string> = {
  receipt: "приход",
  issue: "продажу",
  transfer: "перемещение",
  writeoff: "списание",
};

export async function createStockMoveAction(
  _prev: StockFormState,
  formData: FormData
): Promise<StockFormState> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return { error: "Недостаточно прав для складских операций" };

  const parsed = moveSchema.safeParse({
    type: formData.get("type"),
    date: formData.get("date"),
    productId: formData.get("productId") || undefined,
    warehouseFromId: formData.get("warehouseFromId") || undefined,
    warehouseToId: formData.get("warehouseToId") || undefined,
    quantity: String(formData.get("quantity") ?? "").replace(",", ".").trim() || undefined,
    projectId: formData.get("projectId") || undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) {
    return { error: "Проверьте поля формы: количество должно быть положительным, товар — выбран" };
  }
  const d = parsed.data;

  // направление движения задаёт тип: приход — только «куда», расход — только «откуда»
  if (d.type === "receipt" && !d.warehouseToId) return { error: "Укажите склад поступления" };
  if ((d.type === "issue" || d.type === "writeoff") && !d.warehouseFromId) {
    return { error: "Укажите склад, с которого уходит товар" };
  }
  if (d.type === "transfer") {
    if (!d.warehouseFromId || !d.warehouseToId) return { error: "Для перемещения нужны оба склада" };
    if (d.warehouseFromId === d.warehouseToId) return { error: "Склады перемещения должны различаться" };
  }

  // цена закупки нужна только у прихода — она формирует партию для FIFO
  let unitCostMinor: bigint | null = null;
  if (d.type === "receipt") {
    const raw = String(formData.get("unitCost") ?? "").trim();
    const parsedCost = parseTenge(raw || "0");
    if (parsedCost === null || parsedCost < 0n) {
      return { error: "Цена закупки за единицу должна быть положительным числом в тенге" };
    }
    unitCostMinor = parsedCost;
  }

  // мультитенантность: все справочники — только своей компании
  const [product, from, to] = await Promise.all([
    prisma.product.findFirst({ where: { id: d.productId, companyId: tenant.companyId } }),
    d.warehouseFromId
      ? prisma.warehouse.findFirst({ where: { id: d.warehouseFromId, companyId: tenant.companyId } })
      : null,
    d.warehouseToId
      ? prisma.warehouse.findFirst({ where: { id: d.warehouseToId, companyId: tenant.companyId } })
      : null,
  ]);
  if (!product) return { error: "Товар не найден" };
  if (d.warehouseFromId && !from) return { error: "Склад отгрузки не найден" };
  if (d.warehouseToId && !to) return { error: "Склад поступления не найден" };
  if (d.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: d.projectId, companyId: tenant.companyId },
    });
    if (!project) return { error: "Проект не найден" };
  }

  const closedError = await assertMonthsOpen(tenant.companyId, [d.date]);
  if (closedError) return { error: closedError };

  // главная проверка, которой нет в Excel: нельзя отгрузить больше, чем лежит на складе
  if (d.warehouseFromId) {
    const existing = await loadStockMoves(tenant.companyId, d.productId);
    const available = availableQuantity(existing, {
      productId: d.productId,
      warehouseId: d.warehouseFromId,
      onDate: d.date,
    });
    if (available < d.quantity) {
      return {
        error:
          `На складе «${from?.name}» на ${d.date.toLocaleDateString("ru-RU")} доступно ` +
          `${formatQuantity(available)} ${product.unit ?? "ед."} — этого не хватает на ` +
          `${TYPE_LABEL[d.type]} ${formatQuantity(d.quantity)}. ` +
          `Сначала оформите приход или перемещение на этот склад.`,
      };
    }
  }

  const move = await prisma.stockMove.create({
    data: {
      companyId: tenant.companyId,
      date: d.date,
      type: d.type,
      productId: d.productId,
      warehouseFromId: d.type === "receipt" ? null : (d.warehouseFromId ?? null),
      warehouseToId: d.type === "issue" || d.type === "writeoff" ? null : (d.warehouseToId ?? null),
      quantity: d.quantity,
      unitCostMinor,
      projectId: d.type === "writeoff" ? (d.projectId ?? null) : null,
      comment: d.comment ?? null,
      createdBy: tenant.userId,
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "stock_move",
    entityId: move.id,
    action: "create",
    after: move,
  });

  revalidatePath("/stock");
  revalidatePath("/stock/moves");
  revalidatePath("/reports/pnl");
  redirect("/stock/moves?added=1");
}

export async function deleteStockMoveAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const move = await prisma.stockMove.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!move) return;

  const closedError = await assertMonthsOpen(tenant.companyId, [move.date]);
  if (closedError) redirect("/stock/moves?error=closed");

  await prisma.stockMove.delete({ where: { id: move.id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "stock_move",
    entityId: move.id,
    action: "delete",
    before: move,
  });

  revalidatePath("/stock");
  revalidatePath("/stock/moves");
  revalidatePath("/reports/pnl");
}
