"use server";

import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";
import { getTemplate } from "@/lib/templates";
import { parseTenge } from "@/lib/money";
import { monthStart } from "@/lib/period";
import { COMPANY_COOKIE } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

const onboardingSchema = z.object({
  companyName: z.string().trim().min(2, "Укажите название бизнеса"),
  industry: z.string().trim().min(1),
  startYear: z.coerce.number().int().min(2000).max(2100),
  startMonth: z.coerce.number().int().min(1).max(12),
  projectsEnabled: z.boolean(),
  investmentsEnabled: z.boolean(),
});

export interface OnboardingState {
  error?: string;
}

export async function createCompanyAction(
  _prev: OnboardingState,
  formData: FormData
): Promise<OnboardingState> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const parsed = onboardingSchema.safeParse({
    companyName: formData.get("companyName"),
    industry: formData.get("industry"),
    startYear: formData.get("startYear"),
    startMonth: formData.get("startMonth"),
    projectsEnabled: formData.get("projectsEnabled") === "on",
    investmentsEnabled: formData.get("investmentsEnabled") === "on",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Проверьте данные формы" };
  }
  const data = parsed.data;
  const template = getTemplate(data.industry);
  const startDate = monthStart(data.startYear, data.startMonth);

  // стартовые остатки счетов из формы (могут быть пустыми = 0)
  const openingBalances: bigint[] = template.accounts.map((_a, i) => {
    const raw = String(formData.get(`opening_${i}`) ?? "").trim();
    if (raw === "") return 0n;
    const minor = parseTenge(raw);
    return minor !== null && minor >= 0n ? minor : -1n;
  });
  if (openingBalances.some((b) => b < 0n)) {
    return { error: "Остатки счетов должны быть неотрицательными суммами в тенге" };
  }

  const company = await prisma.$transaction(async (tx) => {
    const company = await tx.company.create({
      data: {
        ownerUserId: userId,
        name: data.companyName,
        industry: template.id,
        currency: "KZT", // одна валюта на компанию (MVP)
        accountingStartDate: startDate,
        projectsEnabled: data.projectsEnabled,
        investmentsEnabled: data.investmentsEnabled,
      },
    });

    await tx.companyMember.create({
      data: { companyId: company.id, userId, role: "owner" },
    });

    await tx.account.createMany({
      data: template.accounts.map((a, i) => ({
        companyId: company.id,
        name: a.name,
        type: a.type,
        openingBalanceMinor: openingBalances[i],
        openingBalanceDate: startDate,
      })),
    });

    await tx.category.createMany({
      data: template.categories.map((c) => ({
        companyId: company.id,
        type: c.type,
        name: c.name,
        pnlGroup: c.pnlGroup,
        isCapex: c.isCapex ?? false,
      })),
    });

    return company;
  });

  await logAudit({
    companyId: company.id,
    userId,
    entity: "company",
    entityId: company.id,
    action: "create",
    after: { name: company.name, industry: company.industry },
  });

  const cookieStore = await cookies();
  cookieStore.set(COMPANY_COOKIE, company.id, { httpOnly: true, sameSite: "lax", path: "/" });
  redirect("/dashboard");
}
