"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { logAudit } from "@/lib/audit";

function parsePercent(raw: string): number | null {
  const n = Number.parseFloat(raw.replace(",", ".").replace(/\s/g, ""));
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return n / 100;
}

const modelSchema = z.object({
  name: z.string().trim().min(1, "Укажите название сценария"),
  startYear: z.coerce.number().int().min(2000).max(2100),
  startMonth: z.coerce.number().int().min(1).max(12),
  horizonMonths: z.coerce.number().int().min(1).max(60),
});

export async function createInvestmentModelAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = modelSchema.safeParse({
    name: formData.get("name"),
    startYear: formData.get("startYear"),
    startMonth: formData.get("startMonth"),
    horizonMonths: formData.get("horizonMonths"),
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const valuation = parseTenge(String(formData.get("valuation") ?? "").trim() || "0") ?? 0n;
  const investment = parseTenge(String(formData.get("investment") ?? "").trim() || "0") ?? 0n;
  const dividendPolicy = parsePercent(String(formData.get("dividendPolicy") ?? "0")) ?? 0;

  const model = await prisma.investmentModel.create({
    data: {
      companyId: tenant.companyId,
      name: d.name,
      startMonth: new Date(Date.UTC(d.startYear, d.startMonth - 1, 1)),
      horizonMonths: d.horizonMonths,
      valuationMethod: "manual", // TODO(product): оценка по мультипликатору прибыли — позже
      companyValuationMinor: valuation >= 0n ? valuation : 0n,
      investmentAmountMinor: investment >= 0n ? investment : 0n,
      dividendPolicyPercent: dividendPolicy,
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "investment_model",
    entityId: model.id,
    action: "create",
    after: model,
  });

  revalidatePath("/investments");
  redirect(`/investments/${model.id}`);
}

export async function deleteInvestmentModelAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const model = await prisma.investmentModel.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!model) return;
  await prisma.investmentModel.delete({ where: { id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "investment_model",
    entityId: id,
    action: "delete",
    before: model,
  });
  revalidatePath("/investments");
  redirect("/investments");
}

const itemSchema = z.object({
  modelId: z.string().uuid(),
  section: z.enum(["capex", "launch", "operating_buffer", "reserve", "other"]),
  itemName: z.string().trim().min(1),
  monthsCount: z.coerce.number().int().min(1).max(60),
});

export async function addInvestmentItemAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = itemSchema.safeParse({
    modelId: formData.get("modelId"),
    section: formData.get("section"),
    itemName: formData.get("itemName"),
    monthsCount: formData.get("monthsCount") || 1,
  });
  if (!parsed.success) return;
  const d = parsed.data;

  const monthlyCost = parseTenge(String(formData.get("monthlyCost") ?? "").trim());
  if (monthlyCost === null || monthlyCost <= 0n) return;

  const model = await prisma.investmentModel.findFirst({
    where: { id: d.modelId, companyId: tenant.companyId },
  });
  if (!model) return;

  await prisma.investmentItem.create({
    data: {
      companyId: tenant.companyId,
      investmentModelId: d.modelId,
      section: d.section,
      itemName: d.itemName,
      monthlyCostMinor: monthlyCost,
      monthsCount: d.monthsCount,
      totalCostMinor: monthlyCost * BigInt(d.monthsCount),
    },
  });

  revalidatePath(`/investments/${d.modelId}`);
}

export async function deleteInvestmentItemAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const item = await prisma.investmentItem.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!item) return;
  await prisma.investmentItem.delete({ where: { id } });
  revalidatePath(`/investments/${item.investmentModelId}`);
}
