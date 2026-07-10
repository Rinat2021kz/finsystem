"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/db";
import { COMPANY_COOKIE, requireTenant, isAdmin } from "@/lib/tenancy";
import { isDemoCompany, resetDemoCompany } from "@/lib/demo";

/** Сброс демо-данных к исходным. Работает только внутри демо-компании. */
export async function resetDemoAction(): Promise<void> {
  const tenant = await requireTenant();
  if (!(await isDemoCompany(tenant.companyId))) return;

  const companyId = await resetDemoCompany();
  const cookieStore = await cookies();
  cookieStore.set(COMPANY_COOKIE, companyId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard?reset=1");
}

/** Переключение активной компании (кабинет консультанта: несколько клиентов). */
export async function switchCompanyAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  const companyId = String(formData.get("companyId") ?? "");

  // членство проверяем в БД — cookie только подсказка
  const membership = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId, userId: tenant.userId } },
  });
  if (!membership) return;

  const cookieStore = await cookies();
  cookieStore.set(COMPANY_COOKIE, companyId, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}

/** Комментарий консультанта на дашборде (dashboard_configs.config_json). */
export async function saveDashboardCommentAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const comment = String(formData.get("comment") ?? "").slice(0, 1000);
  const existing = await prisma.dashboardConfig.findFirst({
    where: { companyId: tenant.companyId, name: "default" },
  });

  if (existing) {
    const config =
      typeof existing.configJson === "object" && existing.configJson !== null
        ? (existing.configJson as Record<string, unknown>)
        : {};
    await prisma.dashboardConfig.update({
      where: { id: existing.id },
      data: { configJson: { ...config, consultantComment: comment } },
    });
  } else {
    await prisma.dashboardConfig.create({
      data: {
        companyId: tenant.companyId,
        name: "default",
        createdBy: tenant.userId,
        configJson: { consultantComment: comment },
      },
    });
  }

  revalidatePath("/dashboard");
}
