"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, canWrite } from "@/lib/tenancy";
import { parseTenge } from "@/lib/money";
import { logAudit } from "@/lib/audit";

const projectSchema = z.object({
  projectNumber: z.string().trim().max(50).optional(),
  customerName: z.string().trim().min(1, "Укажите заказчика"),
  description: z.string().trim().max(500).optional(),
  orderDate: z.coerce.date().optional(),
});

export interface ProjectFormState {
  error?: string;
}

export async function createProjectAction(
  _prev: ProjectFormState,
  formData: FormData
): Promise<ProjectFormState> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return { error: "Недостаточно прав" };

  const contractValue = parseTenge(String(formData.get("contractValue") ?? "").trim() || "0");
  if (contractValue === null || contractValue < 0n) {
    return { error: "Стоимость договора должна быть неотрицательной суммой в тенге" };
  }
  const plannedCost = parseTenge(String(formData.get("plannedCost") ?? "").trim() || "0") ?? 0n;

  const parsed = projectSchema.safeParse({
    projectNumber: formData.get("projectNumber") || undefined,
    customerName: formData.get("customerName"),
    description: formData.get("description") || undefined,
    orderDate: formData.get("orderDate") || undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте поля формы" };
  }

  const project = await prisma.project.create({
    data: {
      companyId: tenant.companyId,
      projectNumber: parsed.data.projectNumber ?? null,
      customerName: parsed.data.customerName,
      description: parsed.data.description ?? null,
      contractValueMinor: contractValue,
      plannedCostMinor: plannedCost >= 0n ? plannedCost : 0n,
      orderDate: parsed.data.orderDate ?? null,
      status: "new",
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "project",
    entityId: project.id,
    action: "create",
    after: project,
  });

  revalidatePath("/projects");
  redirect(`/projects/${project.id}`);
}

const STATUSES = ["new", "in_progress", "on_hold", "done", "cancelled", "paid", "has_debt"] as const;

export async function updateProjectStatusAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!canWrite(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const status = String(formData.get("status") ?? "");
  if (!STATUSES.includes(status as (typeof STATUSES)[number])) return;

  const project = await prisma.project.findFirst({
    where: { id, companyId: tenant.companyId }, // только своя компания
  });
  if (!project) return;

  await prisma.project.update({
    where: { id },
    data: {
      status: status as (typeof STATUSES)[number],
      closeDate: status === "done" || status === "paid" ? new Date() : project.closeDate,
    },
  });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "project",
    entityId: id,
    action: "update",
    before: { status: project.status },
    after: { status },
  });

  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
}
