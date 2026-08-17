"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { unitCostFromComponents, type ComponentKind } from "@/lib/calc/cost";
import { logAudit } from "@/lib/audit";

export async function addComponentAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const productId = String(formData.get("productId") ?? "");
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: tenant.companyId },
  });
  if (!product) return;

  const name = String(formData.get("name") ?? "").trim();
  if (name.length === 0) return;
  const kind: ComponentKind =
    formData.get("kind") === "percent_of_price" ? "percent_of_price" : "per_unit";

  if (kind === "percent_of_price") {
    const percent = Number.parseFloat(
      String(formData.get("percent") ?? "").replace(",", ".").replace(/\s/g, "")
    );
    if (!Number.isFinite(percent) || percent <= 0 || percent > 100) return;
    await prisma.productComponent.create({
      data: {
        companyId: tenant.companyId,
        productId,
        name,
        kind,
        percent: Math.round((percent / 100) * 10000) / 10000,
      },
    });
  } else {
    const quantity = Number.parseFloat(
      String(formData.get("quantity") ?? "1").replace(",", ".").replace(/\s/g, "")
    );
    const unitCost = parseTenge(String(formData.get("unitCost") ?? "").trim());
    if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000) return;
    if (unitCost === null || unitCost <= 0n) return;
    await prisma.productComponent.create({
      data: {
        companyId: tenant.companyId,
        productId,
        name,
        kind,
        quantity: Math.round(quantity * 1000) / 1000,
        unit: String(formData.get("unit") ?? "").trim() || null,
        unitCostMinor: unitCost,
      },
    });
  }

  revalidatePath(`/settings/products/${productId}`);
}

export async function deleteComponentAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const component = await prisma.productComponent.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!component) return;
  await prisma.productComponent.delete({ where: { id: component.id } });
  revalidatePath(`/settings/products/${component.productId}`);
}

/**
 * Запись в историю себестоимости: «с такой-то даты единица стоит столько».
 * Себестоимость в карточке продукта синхронизируется с последней по дате записью —
 * карточка показывает действующую цену, история отвечает за прошлые периоды.
 */
export async function addCostHistoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const productId = String(formData.get("productId") ?? "");
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: tenant.companyId },
  });
  if (!product) return;

  const raw = String(formData.get("validFrom") ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (!match) return;
  const validFrom = new Date(
    Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  );

  const cost = parseTenge(String(formData.get("unitCost") ?? "").trim());
  if (cost === null || cost < 0n) return;

  const comment = String(formData.get("comment") ?? "").trim().slice(0, 200) || null;

  await prisma.productCostHistory.upsert({
    where: { productId_validFrom: { productId, validFrom } },
    create: {
      companyId: tenant.companyId,
      productId,
      validFrom,
      unitCostMinor: cost,
      comment,
    },
    update: { unitCostMinor: cost, comment },
  });

  await syncCurrentCost(productId);
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "product_cost_history",
    entityId: product.id,
    action: "create",
    after: { validFrom: raw, unitCostMinor: cost.toString() },
  });

  revalidatePath(`/settings/products/${productId}`);
  revalidatePath("/settings/products");
}

export async function deleteCostHistoryAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const entry = await prisma.productCostHistory.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!entry) return;

  await prisma.productCostHistory.delete({ where: { id: entry.id } });
  await syncCurrentCost(entry.productId);
  revalidatePath(`/settings/products/${entry.productId}`);
  revalidatePath("/settings/products");
}

/** Карточка продукта показывает последнюю по дате себестоимость из истории. */
async function syncCurrentCost(productId: string): Promise<void> {
  const latest = await prisma.productCostHistory.findFirst({
    where: { productId },
    orderBy: { validFrom: "desc" },
  });
  if (!latest) return;
  await prisma.product.update({
    where: { id: productId },
    data: { costPerUnitMinor: latest.unitCostMinor },
  });
}

/** Записать посчитанную по составу себестоимость в карточку продукта и в историю. */
export async function applyComputedCostAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const productId = String(formData.get("productId") ?? "");
  const product = await prisma.product.findFirst({
    where: { id: productId, companyId: tenant.companyId },
    include: { components: true },
  });
  if (!product) return;

  // дата, с которой действует пересчитанная себестоимость (по умолчанию — 1-е число месяца)
  const raw = String(formData.get("validFrom") ?? "").trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  const validFrom = match
    ? new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
    : null;

  const total = unitCostFromComponents(
    product.components.map((c) => ({
      kind: c.kind === "percent_of_price" ? ("percent_of_price" as const) : ("per_unit" as const),
      quantity: Number(c.quantity),
      unitCostMinor: c.unitCostMinor,
      percent: c.percent === null ? null : Number(c.percent),
    })),
    product.basePriceMinor
  );

  if (validFrom) {
    await prisma.productCostHistory.upsert({
      where: { productId_validFrom: { productId, validFrom } },
      create: {
        companyId: tenant.companyId,
        productId,
        validFrom,
        unitCostMinor: total,
        comment: "Расчёт по рецептуре",
      },
      update: { unitCostMinor: total, comment: "Расчёт по рецептуре" },
    });
  }

  await prisma.product.update({
    where: { id: product.id },
    data: { costPerUnitMinor: total },
  });
  if (validFrom) await syncCurrentCost(productId);
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "product",
    entityId: product.id,
    action: "update",
    before: { costPerUnitMinor: product.costPerUnitMinor },
    after: { costPerUnitMinor: total, source: "рецептура" },
  });

  revalidatePath(`/settings/products/${productId}`);
  revalidatePath("/settings/products");
}
