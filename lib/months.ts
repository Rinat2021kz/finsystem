// Закрытие месяца (ненарушаемое правило 5):
// закрытый месяц неизменяем для обычных пользователей; открыть может только админ;
// действия пишутся в audit_log; при закрытии сохраняется снимок отчёта.

import { prisma } from "@/lib/db";
import { toMonthStart } from "@/lib/period";

/** Закрыт ли месяц, к которому относится дата. */
export async function isMonthClosed(companyId: string, date: Date): Promise<boolean> {
  const period = toMonthStart(date);
  const snapshot = await prisma.reportSnapshot.findUnique({
    where: { companyId_period: { companyId, period } },
  });
  return snapshot?.isClosed ?? false;
}

/**
 * Проверка перед изменением операции: и дата денег, и экономический месяц
 * не должны попадать в закрытые периоды.
 */
export async function assertMonthsOpen(
  companyId: string,
  dates: Array<Date | null>
): Promise<string | null> {
  for (const d of dates) {
    if (!d) continue;
    if (await isMonthClosed(companyId, d)) {
      return "Месяц закрыт. Изменение операций закрытого месяца недоступно — обратитесь к администратору.";
    }
  }
  return null;
}
