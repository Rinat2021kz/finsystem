import { PrismaClient } from "@prisma/client";

// Один экземпляр Prisma на процесс (hot-reload в dev создаёт модули заново).
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
