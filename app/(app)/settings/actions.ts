"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { logAudit } from "@/lib/audit";

// Справочники меняют owner/consultant (SPEC раздел 3).

const accountSchema = z.object({
  name: z.string().trim().min(1, "Укажите название счёта"),
  type: z.enum(["bank", "cash", "card", "deposit", "reserve", "owner_personal", "other"]),
});

export async function createAccountAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = accountSchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
  });
  if (!parsed.success) return;

  const opening = parseTenge(String(formData.get("opening") ?? "0").trim() || "0") ?? 0n;
  const company = await prisma.company.findUnique({ where: { id: tenant.companyId } });

  const account = await prisma.account.create({
    data: {
      companyId: tenant.companyId,
      name: parsed.data.name,
      type: parsed.data.type,
      openingBalanceMinor: opening >= 0n ? opening : 0n,
      openingBalanceDate: company?.accountingStartDate ?? new Date(),
    },
  });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "account",
    entityId: account.id,
    action: "create",
    after: account,
  });
  revalidatePath("/settings/accounts");
}

export async function toggleAccountAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const account = await prisma.account.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!account) return;
  await prisma.account.update({ where: { id }, data: { isActive: !account.isActive } });
  revalidatePath("/settings/accounts");
}

const categorySchema = z.object({
  name: z.string().trim().min(1, "Укажите название категории"),
  type: z.enum(["income", "expense"]),
  pnlGroup: z.enum(["revenue", "variable", "fixed", "payroll", "tax", "interest", "depreciation", "other"]),
  parentId: z.string().uuid().optional(),
});

export async function createCategoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = categorySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type"),
    pnlGroup: formData.get("pnlGroup"),
    parentId: formData.get("parentId") || undefined,
  });
  if (!parsed.success) return;

  // родитель должен принадлежать той же компании
  if (parsed.data.parentId) {
    const parent = await prisma.category.findFirst({
      where: { id: parsed.data.parentId, companyId: tenant.companyId },
    });
    if (!parent) return;
  }

  const category = await prisma.category.create({
    data: {
      companyId: tenant.companyId,
      name: parsed.data.name,
      type: parsed.data.type,
      pnlGroup: parsed.data.type === "income" ? "revenue" : parsed.data.pnlGroup,
      parentId: parsed.data.parentId ?? null,
      isCapex: formData.get("isCapex") === "on",
    },
  });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "category",
    entityId: category.id,
    action: "create",
    after: category,
  });
  revalidatePath("/settings/categories");
}

export async function toggleCategoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const category = await prisma.category.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!category) return;
  await prisma.category.update({ where: { id }, data: { isActive: !category.isActive } });
  revalidatePath("/settings/categories");
}

const productSchema = z.object({
  name: z.string().trim().min(1),
  unit: z.string().trim().max(20).optional(),
});

export async function createProductAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = productSchema.safeParse({
    name: formData.get("name"),
    unit: formData.get("unit") || undefined,
  });
  if (!parsed.success) return;

  const basePrice = parseTenge(String(formData.get("basePrice") ?? "0").trim() || "0") ?? 0n;
  const costPerUnit = parseTenge(String(formData.get("costPerUnit") ?? "0").trim() || "0") ?? 0n;

  await prisma.product.create({
    data: {
      companyId: tenant.companyId,
      name: parsed.data.name,
      unit: parsed.data.unit ?? null,
      basePriceMinor: basePrice >= 0n ? basePrice : 0n,
      costPerUnitMinor: costPerUnit >= 0n ? costPerUnit : 0n,
    },
  });
  revalidatePath("/settings/products");
}

export async function toggleProductAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!product) return;
  await prisma.product.update({ where: { id }, data: { isActive: !product.isActive } });
  revalidatePath("/settings/products");
}

export async function updateProductAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!product) return;

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;
  const unit = String(formData.get("unit") ?? "").trim();
  const basePrice = parseTenge(String(formData.get("basePrice") ?? "").trim() || "0");
  const costPerUnit = parseTenge(String(formData.get("costPerUnit") ?? "").trim() || "0");
  if (basePrice === null || basePrice < 0n || costPerUnit === null || costPerUnit < 0n) return;

  await prisma.product.update({
    where: { id: product.id },
    data: { name, unit: unit || null, basePriceMinor: basePrice, costPerUnitMinor: costPerUnit },
  });
  revalidatePath("/settings/products");
}

/** Удаление продукта — только если он не используется в планах и операциях; иначе скрывать. */
export async function deleteProductAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const product = await prisma.product.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!product) return;

  const [inSales, inExpenses, inTxns] = await Promise.all([
    prisma.salesPlan.count({ where: { productId: id } }),
    prisma.expensePlan.count({ where: { productId: id } }),
    prisma.transaction.count({ where: { productId: id } }),
  ]);
  if (inSales + inExpenses + inTxns > 0) redirect("/settings/products?error=inuse");

  await prisma.product.delete({ where: { id: product.id } });
  revalidatePath("/settings/products");
}

const counterpartySchema = z.object({
  name: z.string().trim().min(1),
  type: z.string().trim().optional(),
  contact: z.string().trim().optional(),
});

export async function createCounterpartyAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = counterpartySchema.safeParse({
    name: formData.get("name"),
    type: formData.get("type") || undefined,
    contact: formData.get("contact") || undefined,
  });
  if (!parsed.success) return;

  await prisma.counterparty.create({
    data: { companyId: tenant.companyId, ...parsed.data },
  });
  revalidatePath("/settings/counterparties");
}

export async function toggleCounterpartyAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const cp = await prisma.counterparty.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!cp) return;
  await prisma.counterparty.update({ where: { id }, data: { isActive: !cp.isActive } });
  revalidatePath("/settings/counterparties");
}

export async function updateCounterpartyAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const cp = await prisma.counterparty.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!cp) return;

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;
  const type = String(formData.get("type") ?? "").trim();
  const contact = String(formData.get("contact") ?? "").trim();

  await prisma.counterparty.update({
    where: { id: cp.id },
    data: { name, type: type || null, contact: contact || null },
  });
  revalidatePath("/settings/counterparties");
}

/** Удаление контрагента — только без привязанных операций; иначе скрывать. */
export async function deleteCounterpartyAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const cp = await prisma.counterparty.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!cp) return;

  const used = await prisma.transaction.count({ where: { counterpartyId: id } });
  if (used > 0) redirect("/settings/counterparties?error=inuse");

  await prisma.counterparty.delete({ where: { id: cp.id } });
  revalidatePath("/settings/counterparties");
}

export async function updateCategoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const category = await prisma.category.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!category) return;

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;
  const groupRaw = String(formData.get("pnlGroup") ?? "");
  const groups = ["variable", "fixed", "payroll", "tax", "interest", "depreciation", "other"];
  const pnlGroup =
    category.type === "income"
      ? "revenue"
      : groups.includes(groupRaw)
        ? (groupRaw as (typeof groups)[number])
        : category.pnlGroup;

  const before = { name: category.name, pnlGroup: category.pnlGroup };
  await prisma.category.update({
    where: { id: category.id },
    data: {
      name,
      pnlGroup: pnlGroup as typeof category.pnlGroup,
      isCapex: formData.get("isCapex") === "on",
    },
  });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "category",
    entityId: category.id,
    action: "update",
    before,
    after: { name, pnlGroup },
  });
  revalidatePath("/settings/categories");
}

/** Удаление категории — только без операций, планов и подкатегорий; иначе скрывать. */
export async function deleteCategoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const category = await prisma.category.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!category) return;

  const [inTxns, inPlans, children] = await Promise.all([
    prisma.transaction.count({ where: { categoryId: id } }),
    prisma.expensePlan.count({ where: { categoryId: id } }),
    prisma.category.count({ where: { parentId: id } }),
  ]);
  if (inTxns + inPlans + children > 0) redirect("/settings/categories?error=inuse");

  await prisma.category.delete({ where: { id: category.id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "category",
    entityId: id,
    action: "delete",
    before: category,
  });
  revalidatePath("/settings/categories");
}
