// Журнал изменений (правило 9 SPEC): кто/когда/что, было/стало.

import { prisma } from "@/lib/db";
import type { Prisma } from "@prisma/client";

export async function logAudit(params: {
  companyId: string;
  userId: string;
  entity: string;
  entityId?: string | null;
  action: "create" | "update" | "delete" | "close_month" | "reopen_month";
  before?: unknown;
  after?: unknown;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      companyId: params.companyId,
      userId: params.userId,
      entity: params.entity,
      entityId: params.entityId ?? null,
      action: params.action,
      beforeJson: toJson(params.before),
      afterJson: toJson(params.after),
    },
  });
}

// BigInt не сериализуется в JSON — переводим в строки.
function toJson(value: unknown): Prisma.InputJsonValue | undefined {
  if (value === undefined) return undefined;
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v))
  ) as Prisma.InputJsonValue;
}
