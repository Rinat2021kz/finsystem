"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { toMonthStart } from "@/lib/period";
import { assertMonthsOpen } from "@/lib/months";
import { logAudit } from "@/lib/audit";
import { availableQuantity } from "@/lib/calc/stock";
import { formatQuantity, loadStockMoves } from "@/lib/stock";

const baseSchema = z.object({
  type: z.enum(["income", "expense", "transfer"]),
  dateCashflow: z.coerce.date(),
  pnlYear: z.coerce.number().int().min(2000).max(2100).optional(),
  pnlMonth: z.coerce.number().int().min(1).max(12).optional(),
  includeInPnl: z.boolean(),
  categoryId: z.string().uuid().optional(),
  accountFromId: z.string().uuid().optional(),
  accountToId: z.string().uuid().optional(),
  counterpartyId: z.string().uuid().optional(),
  projectId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  quantity: z.coerce.number().positive().max(99_999_999).optional(),
  // склад: куда оприходовать закупку / откуда отгрузить проданное
  warehouseId: z.string().uuid().optional(),
  comment: z.string().trim().max(500).optional(),
});

export interface TxnFormState {
  error?: string;
}

export async function createTransactionAction(
  _prev: TxnFormState,
  formData: FormData
): Promise<TxnFormState> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return { error: "Недостаточно прав для добавления операций" };

  // Отрицательные суммы запрещены — знак задаёт тип операции (правило SPEC 9).
  const amountMinor = parseTenge(String(formData.get("amount") ?? ""));
  if (amountMinor === null || amountMinor <= 0n) {
    return { error: "Сумма должна быть положительным числом в тенге" };
  }

  const parsed = baseSchema.safeParse({
    type: formData.get("type"),
    dateCashflow: formData.get("dateCashflow"),
    pnlYear: formData.get("pnlYear") || undefined,
    pnlMonth: formData.get("pnlMonth") || undefined,
    includeInPnl: formData.get("includeInPnl") !== "off",
    categoryId: formData.get("categoryId") || undefined,
    accountFromId: formData.get("accountFromId") || undefined,
    accountToId: formData.get("accountToId") || undefined,
    counterpartyId: formData.get("counterpartyId") || undefined,
    projectId: formData.get("projectId") || undefined,
    productId: formData.get("productId") || undefined,
    quantity: String(formData.get("quantity") ?? "").replace(",", ".").trim() || undefined,
    warehouseId: formData.get("warehouseId") || undefined,
    comment: formData.get("comment") || undefined,
  });
  if (!parsed.success) {
    return { error: "Проверьте поля формы: " + (parsed.error.issues[0]?.message ?? "") };
  }
  const d = parsed.data;

  // перевод: оба счёта обязательны и различны; не пишет в доход/расход
  if (d.type === "transfer") {
    if (!d.accountFromId || !d.accountToId) return { error: "Для перевода нужны оба счёта" };
    if (d.accountFromId === d.accountToId) return { error: "Счета перевода должны различаться" };
  }
  if (d.type === "income" && !d.accountToId) return { error: "Укажите счёт зачисления" };
  if (d.type === "expense" && !d.accountFromId) return { error: "Укажите счёт списания" };

  // ДДС ≠ ОПУ: period_pnl задаётся отдельно; по умолчанию = месяц оплаты.
  const periodPnl =
    d.type === "transfer" || !d.includeInPnl
      ? null
      : d.pnlYear && d.pnlMonth
        ? new Date(Date.UTC(d.pnlYear, d.pnlMonth - 1, 1))
        : toMonthStart(d.dateCashflow);

  // проверка принадлежности справочников компании (мультитенантность)
  const [category, accFrom, accTo] = await Promise.all([
    d.categoryId
      ? prisma.category.findFirst({ where: { id: d.categoryId, companyId: tenant.companyId } })
      : null,
    d.accountFromId
      ? prisma.account.findFirst({ where: { id: d.accountFromId, companyId: tenant.companyId } })
      : null,
    d.accountToId
      ? prisma.account.findFirst({ where: { id: d.accountToId, companyId: tenant.companyId } })
      : null,
  ]);
  if (d.categoryId && !category) return { error: "Категория не найдена" };
  if (d.accountFromId && !accFrom) return { error: "Счёт списания не найден" };
  if (d.accountToId && !accTo) return { error: "Счёт зачисления не найден" };
  if (d.projectId) {
    const project = await prisma.project.findFirst({
      where: { id: d.projectId, companyId: tenant.companyId },
    });
    if (!project) return { error: "Проект не найден" };
  }
  // продукт: у дохода — факт-проверка себестоимости, у расхода — оприходование закупки
  let product = null;
  if (d.type !== "transfer" && d.productId) {
    product = await prisma.product.findFirst({
      where: { id: d.productId, companyId: tenant.companyId },
    });
    if (!product) return { error: "Продукт не найден" };
  }

  // Складское движение создаётся вместе с операцией, если указаны товар, количество и склад.
  // Расход + приход товара = закупка: она НЕ попадает в расходы ОПУ, потому что
  // себестоимость признаётся при продаже (иначе расход посчитался бы дважды).
  const stockQuantity = d.quantity ?? (d.productId ? 1 : undefined);
  const stockMove =
    d.type !== "transfer" && product?.tracksStock && d.warehouseId && d.productId && stockQuantity
      ? { warehouseId: d.warehouseId, productId: d.productId, quantity: stockQuantity }
      : null;

  if (stockMove && product) {
    const warehouse = await prisma.warehouse.findFirst({
      where: { id: stockMove.warehouseId, companyId: tenant.companyId },
    });
    if (!warehouse) return { error: "Склад не найден" };

    if (d.type === "income") {
      const existing = await loadStockMoves(tenant.companyId, stockMove.productId);
      const available = availableQuantity(existing, {
        productId: stockMove.productId,
        warehouseId: stockMove.warehouseId,
        onDate: d.dateCashflow,
      });
      if (available < stockMove.quantity) {
        return {
          error:
            `На складе «${warehouse.name}» доступно ${formatQuantity(available)} ` +
            `${product.unit ?? "ед."} — меньше, чем продано (${formatQuantity(stockMove.quantity)}). ` +
            `Сначала оформите приход товара на складе.`,
        };
      }
    }
  }

  const goodsPurchase = stockMove !== null && d.type === "expense";

  // закрытый месяц неизменяем (правило 5)
  const closedError = await assertMonthsOpen(tenant.companyId, [d.dateCashflow, periodPnl]);
  if (closedError) return { error: closedError };

  const txn = await prisma.transaction.create({
    data: {
      companyId: tenant.companyId,
      type: d.type,
      amountMinor,
      dateCashflow: d.dateCashflow,
      periodPnl: goodsPurchase ? null : periodPnl,
      includeInPnl: d.type !== "transfer" && d.includeInPnl && !goodsPurchase,
      categoryId: d.type === "transfer" ? null : (d.categoryId ?? null),
      accountFromId: d.type === "income" ? null : (d.accountFromId ?? null),
      accountToId: d.type === "expense" ? null : (d.accountToId ?? null),
      counterpartyId: d.counterpartyId ?? null,
      projectId: d.type === "transfer" ? null : (d.projectId ?? null),
      productId: d.type === "transfer" ? null : (d.productId ?? null),
      // если продукт выбран, а количество не заполнено — считаем 1
      quantity: d.type !== "transfer" && d.productId ? (d.quantity ?? 1) : null,
      comment: d.comment ?? null,
      createdBy: tenant.userId,
    },
  });

  if (stockMove) {
    const qtyMilli = BigInt(Math.round(stockMove.quantity * 1000));
    await prisma.stockMove.create({
      data: {
        companyId: tenant.companyId,
        date: d.dateCashflow,
        type: d.type === "expense" ? "receipt" : "issue",
        productId: stockMove.productId,
        // приход — только «куда», отгрузка — только «откуда»
        warehouseToId: d.type === "expense" ? stockMove.warehouseId : null,
        warehouseFromId: d.type === "income" ? stockMove.warehouseId : null,
        quantity: stockMove.quantity,
        // цена партии = сумма закупки / количество
        unitCostMinor:
          d.type === "expense" && qtyMilli > 0n ? (amountMinor * 1000n) / qtyMilli : null,
        transactionId: txn.id,
        comment: d.comment ?? null,
        createdBy: tenant.userId,
      },
    });
  }

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "transaction",
    entityId: txn.id,
    action: "create",
    after: txn,
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  revalidatePath("/stock");
  revalidatePath("/reports/pnl");
  redirect("/transactions?added=1");
}

export async function deleteTransactionAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const txn = await prisma.transaction.findFirst({
    where: { id, companyId: tenant.companyId }, // только своя компания
  });
  if (!txn) return;

  const closedError = await assertMonthsOpen(tenant.companyId, [txn.dateCashflow, txn.periodPnl]);
  if (closedError) redirect("/transactions?error=closed");

  // движение, созданное вместе с операцией, удаляется вместе с ней:
  // иначе на складе остался бы приход без оплаты
  await prisma.stockMove.deleteMany({ where: { transactionId: txn.id } });
  await prisma.transaction.delete({ where: { id: txn.id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "transaction",
    entityId: txn.id,
    action: "delete",
    before: txn,
  });

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
}
