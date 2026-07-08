"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { projectQuantities } from "@/lib/calc/sales";

/** Парсинг процента из "5" или "5,5" в долю 0.055. */
function parsePercent(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 1000) return null;
  return n / 100;
}

const generateSchema = z.object({
  productId: z.string().uuid(),
  startYear: z.coerce.number().int().min(2000).max(2100),
  startMonth: z.coerce.number().int().min(1).max(12),
  months: z.coerce.number().int().min(1).max(24),
  baseQuantity: z.coerce.number().min(0.01).max(1_000_000),
  wholeUnits: z.boolean(),
});

/** Генерация плана продаж продукта: количество растёт на growth % в месяц. */
export async function generateSalesPlanAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const parsed = generateSchema.safeParse({
    productId: formData.get("productId"),
    startYear: formData.get("startYear"),
    startMonth: formData.get("startMonth"),
    months: formData.get("months"),
    baseQuantity: String(formData.get("baseQuantity") ?? "").replace(",", "."),
    wholeUnits: formData.get("fractionalUnits") !== "on", // по умолчанию целые количества
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const price = parseTenge(String(formData.get("price") ?? "").trim());
  if (price === null || price <= 0n) return;
  const growth = parsePercent(String(formData.get("growth") ?? "0")) ?? 0;
  const seasonality = 1; // при генерации без сезонности; правится по месяцам в таблице плана

  // продукт должен принадлежать компании
  const product = await prisma.product.findFirst({
    where: { id: d.productId, companyId: tenant.companyId },
  });
  if (!product) return;

  const quantities = projectQuantities(d.baseQuantity, growth, d.months, d.wholeUnits);
  const months = quantities.map((_q, i) => new Date(Date.UTC(d.startYear, d.startMonth - 1 + i, 1)));

  await prisma.$transaction([
    // перегенерация: старые строки продукта в диапазоне удаляются
    prisma.salesPlan.deleteMany({
      where: {
        companyId: tenant.companyId,
        productId: d.productId,
        month: { gte: months[0], lte: months[months.length - 1] },
      },
    }),
    prisma.salesPlan.createMany({
      data: quantities.map((q, i) => ({
        companyId: tenant.companyId,
        productId: d.productId,
        month: months[i],
        plannedPriceMinor: price,
        plannedQuantity: q,
        growthRate: growth,
        seasonalityFactor: seasonality,
      })),
    }),
  ]);

  revalidatePath("/planning/sales");
  revalidatePath("/planning/compare");
}

/** Правка строки плана: количество, цена, сезонность (SPEC 6.5 — сезонность по месяцам). */
export async function updateSalesPlanRowAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const row = await prisma.salesPlan.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!row) return;

  const quantity = Number.parseFloat(String(formData.get("quantity") ?? "").replace(",", "."));
  const seasonality = Number.parseFloat(
    String(formData.get("seasonality") ?? "").replace(",", ".")
  );
  const price = parseTenge(String(formData.get("price") ?? "").trim());

  if (!Number.isFinite(quantity) || quantity < 0 || quantity > 1_000_000) return;
  if (!Number.isFinite(seasonality) || seasonality <= 0 || seasonality > 100) return;
  if (price === null || price < 0n) return;

  await prisma.salesPlan.update({
    where: { id: row.id },
    data: {
      plannedQuantity: Math.round(quantity * 100) / 100,
      seasonalityFactor: Math.round(seasonality * 10000) / 10000,
      plannedPriceMinor: price,
    },
  });

  revalidatePath("/planning/sales");
  revalidatePath("/planning/compare");
}

export async function deleteSalesPlanRowAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  await prisma.salesPlan.deleteMany({ where: { id, companyId: tenant.companyId } });
  revalidatePath("/planning/sales");
  revalidatePath("/planning/compare");
}

const expenseRowSchema = z.object({
  year: z.coerce.number().int().min(2000).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  categoryId: z.string().uuid().optional(),
  expenseType: z.enum([
    "fixed",
    "percent_of_revenue",
    "per_unit",
    "one_time",
    "payroll",
    "tax",
    "debt_interest",
  ]),
  applyMonths: z.coerce.number().int().min(1).max(24),
});

/** Добавление статьи плана расходов (можно сразу на несколько месяцев вперёд). */
export async function addExpensePlanRowAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const parsed = expenseRowSchema.safeParse({
    year: formData.get("year"),
    month: formData.get("month"),
    categoryId: formData.get("categoryId") || undefined,
    expenseType: formData.get("expenseType"),
    applyMonths: formData.get("applyMonths") || 1,
  });
  if (!parsed.success) return;
  const d = parsed.data;

  if (d.categoryId) {
    const category = await prisma.category.findFirst({
      where: { id: d.categoryId, companyId: tenant.companyId },
    });
    if (!category) return;
  }

  const amount = parseTenge(String(formData.get("amount") ?? "").trim() || "0");
  const perUnit = parseTenge(String(formData.get("perUnit") ?? "").trim() || "0");
  const percent = parsePercent(String(formData.get("percent") ?? "0"));

  const needsAmount = ["fixed", "one_time", "payroll", "debt_interest"].includes(d.expenseType);
  const needsPercent = ["percent_of_revenue", "tax"].includes(d.expenseType);
  if (needsAmount && (amount === null || amount <= 0n)) return;
  if (needsPercent && (percent === null || percent <= 0)) return;
  if (d.expenseType === "per_unit" && (perUnit === null || perUnit <= 0n)) return;

  // разовый расход не размножаем по месяцам
  const monthsCount = d.expenseType === "one_time" ? 1 : d.applyMonths;

  await prisma.expensePlan.createMany({
    data: Array.from({ length: monthsCount }, (_v, i) => ({
      companyId: tenant.companyId,
      categoryId: d.categoryId ?? null,
      month: new Date(Date.UTC(d.year, d.month - 1 + i, 1)),
      expenseType: d.expenseType,
      amountMinor: needsAmount ? amount : null,
      percentOfRevenue: needsPercent ? percent : null,
      amountPerUnitMinor: d.expenseType === "per_unit" ? perUnit : null,
    })),
  });

  revalidatePath("/planning/expenses");
  revalidatePath("/planning/compare");
}

export async function deleteExpensePlanRowAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  await prisma.expensePlan.deleteMany({ where: { id, companyId: tenant.companyId } });
  revalidatePath("/planning/expenses");
  revalidatePath("/planning/compare");
}
