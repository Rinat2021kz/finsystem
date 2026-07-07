// Мультитенантность (ненарушаемое правило 6):
// каждый запрос к данным проверяет членство пользователя в company_members
// и фильтруется по company_id. Активная компания хранится в cookie.

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import type { MemberRole } from "@prisma/client";
import { prisma } from "@/lib/db";
import { getSessionUserId } from "@/lib/auth";

export const COMPANY_COOKIE = "active_company_id";

export interface TenantContext {
  userId: string;
  companyId: string;
  role: MemberRole;
}

/**
 * Возвращает контекст «пользователь + активная компания + роль».
 * Редиректит на /login без сессии и на /onboarding без компании.
 */
export async function requireTenant(): Promise<TenantContext> {
  const userId = await getSessionUserId();
  if (!userId) redirect("/login");

  const cookieStore = await cookies();
  const wanted = cookieStore.get(COMPANY_COOKIE)?.value;

  // членство проверяем в БД, cookie — только подсказка выбора
  const memberships = await prisma.companyMember.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
  });
  if (memberships.length === 0) redirect("/onboarding");

  const active = memberships.find((m) => m.companyId === wanted) ?? memberships[0];
  return { userId, companyId: active.companyId, role: active.role };
}

const WRITE_ROLES: MemberRole[] = ["owner", "consultant", "accountant", "manager"];
const ADMIN_ROLES: MemberRole[] = ["owner", "consultant"];

export function canWrite(role: MemberRole): boolean {
  return WRITE_ROLES.includes(role);
}

/** «Админ» в терминах SPEC (закрытие/открытие месяца, справочники). */
export function isAdmin(role: MemberRole): boolean {
  return ADMIN_ROLES.includes(role);
}
