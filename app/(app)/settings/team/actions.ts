"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { requireTenant, isAdmin } from "@/lib/tenancy";
import { logAudit } from "@/lib/audit";

// Кабинет консультанта: владелец приглашает консультанта (и других участников),
// консультант ведёт несколько компаний под одним аккаунтом (SPEC разделы 1, 3).

const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role: z.enum(["consultant", "accountant", "manager", "viewer"]),
});

export async function inviteMemberAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role"),
  });
  if (!parsed.success) return;
  const { email, role } = parsed.data;

  // пользователь может уже существовать; иначе создаём приглашённого без пароля —
  // он задаст пароль при регистрации на тот же e-mail
  const user =
    (await prisma.user.findUnique({ where: { email } })) ??
    (await prisma.user.create({
      data: { email, name: email.split("@")[0], status: "invited" },
    }));

  const existing = await prisma.companyMember.findUnique({
    where: { companyId_userId: { companyId: tenant.companyId, userId: user.id } },
  });
  if (existing) return; // уже участник

  await prisma.companyMember.create({
    data: {
      companyId: tenant.companyId,
      userId: user.id,
      role,
      invitedBy: tenant.userId,
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "company_member",
    entityId: user.id,
    action: "create",
    after: { email, role },
  });

  revalidatePath("/settings/team");
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const id = String(formData.get("id") ?? "");
  const member = await prisma.companyMember.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!member || member.role === "owner") return; // владельца не удаляем

  await prisma.companyMember.delete({ where: { id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "company_member",
    entityId: member.userId,
    action: "delete",
    before: { role: member.role },
  });

  revalidatePath("/settings/team");
}

/** White-label: подпись консультанта/бренда на клиентских ссылках (SPEC раздел 15). */
export async function saveBrandAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const brandLine = String(formData.get("brandLine") ?? "").trim().slice(0, 200);
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
      data: { configJson: { ...config, brandLine } },
    });
  } else {
    await prisma.dashboardConfig.create({
      data: {
        companyId: tenant.companyId,
        name: "default",
        createdBy: tenant.userId,
        configJson: { brandLine },
      },
    });
  }
  revalidatePath("/settings/team");
}

const linkSchema = z.object({
  expiresDays: z.coerce.number().int().min(0).max(365),
});

/** Клиентская ссылка: доступ к дашборду без регистрации (share_links). */
export async function createShareLinkAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;

  const parsed = linkSchema.safeParse({ expiresDays: formData.get("expiresDays") || 0 });
  if (!parsed.success) return;

  const token = randomBytes(24).toString("base64url");
  await prisma.shareLink.create({
    data: {
      companyId: tenant.companyId,
      token,
      role: "viewer",
      canEditInputs: false,
      createdBy: tenant.userId,
      expiresAt:
        parsed.data.expiresDays > 0
          ? new Date(Date.now() + parsed.data.expiresDays * 24 * 3600 * 1000)
          : null,
    },
  });

  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "share_link",
    action: "create",
    after: { expiresDays: parsed.data.expiresDays },
  });

  revalidatePath("/settings/team");
}

export async function revokeShareLinkAction(formData: FormData): Promise<void> {
  const tenant = await requireTenant();
  if (!isAdmin(tenant.role)) return;
  const id = String(formData.get("id") ?? "");
  const link = await prisma.shareLink.findFirst({
    where: { id, companyId: tenant.companyId },
  });
  if (!link) return;
  await prisma.shareLink.delete({ where: { id } });
  await logAudit({
    companyId: tenant.companyId,
    userId: tenant.userId,
    entity: "share_link",
    entityId: id,
    action: "delete",
  });
  revalidatePath("/settings/team");
}
